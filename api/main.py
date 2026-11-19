"""StatGarden API. Run with `make api` (http://localhost:8000, docs at /docs)."""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query as Q
from fastapi.middleware.cors import CORSMiddleware

from api.catalog import load_catalog, mark_available
from api.db import Database
from api.spec import PivotSpec
from api.sql import SpecError, build

app = FastAPI(title="StatGarden API", version="0.1.0",
              description="NBA stats you can pivot. Data: NBA.com via nba_api.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_methods=["GET", "POST"], allow_headers=["*"])

catalog = load_catalog()
db = Database()
_cache: OrderedDict[str, dict] = OrderedDict()
CACHE_SIZE = 500


def _on_swap(con) -> None:
    """New data published: re-check which fields work and forget cached results."""
    for ds in catalog.datasets:
        mark_available(catalog, con, ds.table)
    _cache.clear()


db.on_swap.append(_on_swap)


def _clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _rows(cur) -> tuple[list[str], list[dict]]:
    cols = [d[0] for d in cur.description]
    return cols, [{c: _clean(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


# ── meta ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    db.cursor()  # make sure a file is open
    return {"ok": True,
            "data_updated": datetime.fromtimestamp(db.updated_at, timezone.utc).isoformat(timespec="seconds")}


@app.get("/meta/datasets")
def datasets():
    return [d.model_dump() for d in catalog.datasets]


@app.get("/meta/fields")
def fields(dataset: str = "player_game"):
    db.cursor()
    if catalog.dataset(dataset) is None:
        raise HTTPException(404, f"unknown dataset {dataset!r}")
    out = []
    for f in catalog.fields:
        d = f.model_dump(exclude={"expr", "key", "formula", "requires", "weight"})
        out.append(d)
    return {"groups": catalog.groups, "fields": out}


@app.get("/meta/seasons")
def seasons(dataset: str = "player_game"):
    ds = catalog.dataset(dataset)
    if ds is None:
        raise HTTPException(404, f"unknown dataset {dataset!r}")
    cur = db.cursor()
    rows = cur.execute(f"SELECT season, season_type, count(DISTINCT game_id) AS games, max(game_date) AS last_game "
                       f"FROM {ds.table} GROUP BY 1, 2 ORDER BY 1 DESC, 2").fetchall()
    return [{"season": s, "season_type": t, "games": g, "last_game": str(d)} for s, t, g, d in rows]


@app.get("/meta/values")
def values(field: str, dataset: str = "player_game", q: str = "", limit: int = Q(200, le=1000)):
    """Distinct values of a dimension, for filter pickers."""
    ds = catalog.dataset(dataset)
    f = catalog.field(field)
    if ds is None or f is None or f.kind != "dimension" or not f.available:
        raise HTTPException(404, "unknown or unavailable dimension")
    cur = db.cursor()
    sql = f"SELECT ({f.expr}) AS v, count(*) AS n FROM {ds.table}"
    params: list = []
    if q:
        sql += f" WHERE strip_accents(lower(cast(({f.expr}) AS varchar))) LIKE ?"
        params.append(f"%{q.lower()}%")
    sql += " GROUP BY 1 ORDER BY 2 DESC LIMIT ?"
    params.append(limit)
    vals = [v for v, _ in cur.execute(sql, params).fetchall() if v is not None]
    if f.bins:
        order = {b: i for i, b in enumerate(f.bins)}
        vals.sort(key=lambda v: order.get(str(v), len(order)))
    elif f.type in ("text",) and f.id in ("season",):
        vals.sort(reverse=True)
    return {"field": field, "values": [str(v) if not isinstance(v, (int, float)) else v for v in vals]}


# ── search ──────────────────────────────────────────────────────────────────

@app.get("/search")
def search(q: str = Q(..., min_length=2), limit: int = Q(8, le=25)):
    cur = db.cursor()
    term = q.lower().strip()
    players = cur.execute("""
        SELECT player_id, player_name, arg_max(team_abbreviation, game_date) AS team,
               max(game_date) AS last_game, sum(min) AS minutes
        FROM fact_player_game
        WHERE strip_accents(lower(player_name)) LIKE ?
        GROUP BY 1, 2
        ORDER BY (strip_accents(lower(player_name)) LIKE ?) DESC, last_game DESC, minutes DESC
        LIMIT ?""", [f"%{term}%", f"{term}%", limit]).fetchall()
    teams = cur.execute("""
        SELECT DISTINCT team_id, team_abbreviation FROM fact_player_game
        WHERE lower(team_abbreviation) LIKE ? LIMIT 5""", [f"{term}%"]).fetchall()
    return {
        "players": [{"id": p[0], "name": p[1], "team": p[2], "last_game": str(p[3])} for p in players],
        "teams": [{"id": t[0], "abbreviation": t[1]} for t in teams],
    }


# ── query ───────────────────────────────────────────────────────────────────

@app.post("/query")
def query(spec: PivotSpec):
    try:
        q = build(spec, catalog)
    except SpecError as err:
        raise HTTPException(400, str(err)) from err

    key = hashlib.sha1(json.dumps(spec.model_dump(), sort_keys=True, default=str).encode()).hexdigest()
    cur = db.cursor()  # may swap files and clear the cache, so call before reading it
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
        "values": [{"key": v.key, "field": v.field.id, "mode": v.mode, "label": v.label,
                    "short": v.field.short + {"per_game": "/G", "per_36": "/36", "total": ""}[v.mode],
                    "format": v.field.format, "agg": v.field.agg,
                    "higher_is_better": v.field.higher_is_better}
                   for v in q.values],
        "sql": q.sql,
        "params": q.params,
        "elapsed_ms": round(elapsed, 1),
        "row_count": len(rows),
    }
    _cache[key] = result
    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return {**result, "cached": False}
