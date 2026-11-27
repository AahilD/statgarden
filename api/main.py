"""StatGarden API. Run with `make api` (http://localhost:8000, docs at /docs)."""

from __future__ import annotations

import hashlib
import json
import math
import threading
import time
from collections import OrderedDict
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException
from fastapi import Query as Q
from pydantic import BaseModel

from api.catalog import load_catalog, mark_available, modes_in
from api.db import Database
from api.spec import PivotSpec
from api.sql import SpecError, build, check_formula, fold

# The website reaches this through its own /api proxy (web/next.config.ts), so no CORS.
app = FastAPI(
    title="StatGarden API", version="0.1.0", description="NBA stats you can pivot. Data: NBA.com via nba_api."
)

catalog = load_catalog()
db = Database()
# Results keyed by the view. Sync routes run in a thread pool, so the cache has a lock.
_cache: OrderedDict[str, dict] = OrderedDict()
_cache_lock = threading.Lock()
CACHE_SIZE = 500


def _on_swap(con) -> None:
    """New data published: re-check which fields work and forget cached results."""
    mark_available(catalog, con)
    with _cache_lock:
        _cache.clear()


db.on_swap.append(_on_swap)


def _clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _rows(cur) -> tuple[list[str], list[dict]]:
    cols = [d[0] for d in cur.description]
    return cols, [{c: _clean(v) for c, v in zip(cols, row, strict=True)} for row in cur.fetchall()]


# ── meta ────────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    db.cursor()  # make sure a file is open
    return {"ok": True, "data_updated": datetime.fromtimestamp(db.updated_at, UTC).isoformat(timespec="seconds")}


@app.get("/meta/datasets")
def datasets():
    return [d.model_dump() for d in catalog.datasets]


@app.get("/meta/fields")
def fields(dataset: str = "player_game"):
    db.cursor()  # opens the newest file, which also refreshes which fields are available
    ds = catalog.dataset(dataset)
    if ds is None:
        raise HTTPException(404, f"unknown dataset {dataset!r}")
    sql_keys = {"expr", "key", "formula", "requires", "weight", "datasets"}  # SQL stays on the server
    out = []
    for f in catalog.fields:
        here = ds.id in f.available_in
        # a field shows up where it works; one that works nowhere yet shows (greyed out) where it's meant to go
        if not here and (f.available or (f.datasets is not None and ds.id not in f.datasets)):
            continue
        out.append({**f.model_dump(exclude=sql_keys), "available": here, "modes": modes_in(catalog, f, ds)})
    return {"groups": catalog.groups, "fields": out}


@app.get("/meta/seasons")
def seasons(dataset: str = "player_game"):
    ds = catalog.dataset(dataset)
    if ds is None:
        raise HTTPException(404, f"unknown dataset {dataset!r}")
    cur = db.cursor()
    # season datasets have no game ids, so games and the last game date come from the game logs
    rows = cur.execute(
        f"WITH here AS (SELECT DISTINCT season, season_type FROM {ds.table}), "
        f"g AS (SELECT season, season_type, count(DISTINCT game_id) AS games, max(game_date) AS last_game "
        f"FROM fact_player_game GROUP BY 1, 2) "
        f"SELECT season, season_type, g.games, g.last_game FROM here JOIN g USING (season, season_type) "
        f"ORDER BY 1 DESC, 2"
    ).fetchall()
    return [{"season": s, "season_type": t, "games": g, "last_game": str(d)} for s, t, g, d in rows]


@app.get("/meta/values")
def values(field: str, dataset: str = "player_game", q: str = "", limit: int = Q(200, le=1000)):
    """Distinct values of a dimension, for filter pickers."""
    ds = catalog.dataset(dataset)
    f = catalog.field(field)
    if ds is None or f is None or f.kind != "dimension" or ds.id not in f.available_in:
        raise HTTPException(404, "unknown or unavailable dimension")
    cur = db.cursor()
    sql = f"SELECT ({f.expr}) AS v, count(*) AS n FROM {ds.table}"
    params: list = []
    if q:
        sql += f" WHERE strip_accents(lower(cast(({f.expr}) AS varchar))) LIKE ?"
        params.append(f"%{fold(q)}%")
    sql += " GROUP BY 1 ORDER BY 2 DESC LIMIT ?"
    params.append(limit)
    vals = [v for v, _ in cur.execute(sql, params).fetchall() if v is not None]
    if f.bins:
        order = {b: i for i, b in enumerate(f.bins)}
        vals.sort(key=lambda v: order.get(str(v), len(order)))
    elif f.id == "season":
        vals.sort(reverse=True)  # newest first
    return {"field": field, "values": [str(v) if not isinstance(v, (int, float)) else v for v in vals]}


# ── search ──────────────────────────────────────────────────────────────────


@app.get("/search")
def search(q: str = Q(..., min_length=2), limit: int = Q(8, le=25)):
    cur = db.cursor()
    term = fold(q.strip())
    players = cur.execute(
        """
        SELECT player_id, player_name, arg_max(team_abbreviation, game_date) AS team,
               max(game_date) AS last_game, sum(min) AS minutes
        FROM fact_player_game
        WHERE strip_accents(lower(player_name)) LIKE ?
        GROUP BY 1, 2
        ORDER BY (strip_accents(lower(player_name)) LIKE ?) DESC, last_game DESC, minutes DESC
        LIMIT ?""",
        [f"%{term}%", f"{term}%", limit],
    ).fetchall()
    teams = cur.execute(
        """
        SELECT DISTINCT team_id, team_abbreviation FROM fact_player_game
        WHERE lower(team_abbreviation) LIKE ? LIMIT 5""",
        [f"{term}%"],
    ).fetchall()
    return {
        "players": [{"id": p[0], "name": p[1], "team": p[2], "last_game": str(p[3])} for p in players],
        "teams": [{"id": t[0], "abbreviation": t[1]} for t in teams],
    }


# ── query ───────────────────────────────────────────────────────────────────


@app.post("/query")
def query(spec: PivotSpec):
    # open the newest file first: it may swap files, which re-checks which fields work and clears the cache
    cur = db.cursor()
    try:
        q = build(spec, catalog)
    except SpecError as err:
        raise HTTPException(400, str(err)) from err

    # chart settings don't change the numbers, so they're left out of the cache key
    key = hashlib.sha1(
        json.dumps(
            spec.model_dump(exclude={"chart": True, "shade": True, "values": {"__all__": {"better"}}}),
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return {**_cache[key], "cached": True}

    t0 = time.perf_counter()
    try:
        _, rows = _rows(cur.execute(q.sql, q.params))
    except Exception as err:  # a catalog expression that doesn't work on this data
        raise HTTPException(500, f"query failed: {str(err).splitlines()[0]}") from err
    elapsed = (time.perf_counter() - t0) * 1000

    def field_meta(fid: str) -> dict:
        f = catalog.field(fid)
        return {"id": f.id, "label": f.label, "short": f.short, "type": f.type, "bins": f.bins}

    result = {
        "rows": rows,
        "row_fields": [field_meta(f) for f in q.row_dims],
        "column_fields": [field_meta(f) for f in q.col_dims],
        "values": [
            {
                "key": v.key,
                "field": v.field_id,
                "mode": v.mode,
                "label": v.label,
                "short": v.short,
                "format": v.format,
                "agg": v.agg,
                "higher_is_better": v.higher_is_better,
            }
            for v in q.values
        ],
        "elapsed_ms": round(elapsed, 1),
        "row_count": len(rows),
    }
    with _cache_lock:
        _cache[key] = result
        if len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return {**result, "cached": False}


class FormulaCheck(BaseModel):
    formula: str
    dataset: str = "player_game"


@app.post("/calc/check")
def calc_check(body: FormulaCheck):
    """Is this formula OK? For the calculated-stat editor, as you type."""
    db.cursor()
    try:
        used = check_formula(body.formula, body.dataset, catalog)
    except (SpecError, ValueError) as err:  # ValueError: pydantic (empty or too long)
        msg = str(err).removeprefix("Formula: ").splitlines()[0]
        return {"ok": False, "error": msg, "fields": []}
    return {
        "ok": True,
        "error": None,
        "fields": [{"id": f, "label": catalog.field(f).label} for f in dict.fromkeys(used)],
    }
