"""Shots on a half court, binned into hexagons, against the league from the same spots.

Coordinates are NBA.com's, in tenths of a foot from the hoop: x across (−250 to 250), y toward
half court (baseline −47.5, half court 422.5). Hexagons are pointy-top with axial coordinates
(q, r); the site draws the centre of (q, r) at x = HEX·√3·(q + r/2), y = HEX·1.5·r.

Each court is compared with every shot from the same seasons and season types (the league), so
"hot" means better than the league from that spot, not just a high percentage near the rim.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from api.spec import PivotSpec
from api.sql import Builder, SpecError, apply_filters

router = APIRouter()
db = None  # set by main.py
catalog = None

HEX = 15  # centre to corner, tenths of a foot: about 2.6 ft across
MAX_COURTS = 4  # split by a row field: the groups with the most shots, side by side
HALF_COURT = 422  # backcourt heaves are left off
BASELINE_FIELDS = ("season", "season_type")  # what the league comparison keeps from the filters


def _hexed(src: str) -> str:
    """CTEs that add axial hex coordinates (q, r) to every row of `src` (which has x and y)."""
    return f"""
    h1 AS (SELECT *, (sqrt(3) / 3 * x - y / 3.0) / {HEX} AS qf, (2.0 / 3 * y) / {HEX} AS rf FROM {src}),
    h2 AS (SELECT *, round(qf) AS rq, round(rf) AS rr, round(-qf - rf) AS rs,
                  abs(round(qf) - qf) AS dq, abs(round(rf) - rf) AS dr, abs(round(-qf - rf) + qf + rf) AS ds
           FROM h1),
    hx AS (SELECT *,
                  CAST(CASE WHEN dq > dr AND dq > ds THEN -rr - rs ELSE rq END AS int) AS q,
                  CAST(CASE WHEN NOT (dq > dr AND dq > ds) AND dr > ds THEN -rq - rs ELSE rr END AS int) AS r
           FROM h2)"""


def bins(
    where: list[str],
    params: list[Any],
    base_where: list[str],
    base_params: list[Any],
    split: tuple[str, str | None] | None = None,
) -> dict:
    """Hexes for the matching shots (one court, or one per top group of `split`), plus the league."""
    cur = db.cursor()
    cond = " AND ".join([f"loc_y <= {HALF_COURT}", "loc_x IS NOT NULL", *where])
    # no split: one group with a constant key (a NULL key would never match in the join)
    label, key = split if split else ("NULL", "0")
    shots = cur.execute(
        f"""
        WITH f AS (
          SELECT {label} AS grp, coalesce({key or label}, '—') AS grp_key, loc_x AS x, loc_y AS y, fgm, pts
          FROM fact_shot WHERE {cond}),
        top AS (SELECT grp_key, any_value(grp) AS grp, count(*) AS n FROM f GROUP BY grp_key
                ORDER BY n DESC LIMIT {MAX_COURTS}),
        {_hexed("(SELECT f.* FROM f JOIN top USING (grp_key))")}
        SELECT grp_key, any_value(grp), q, r, count(*), sum(fgm), sum(pts)
        FROM hx GROUP BY grp_key, q, r""",
        params,
    ).fetchall()

    base_cond = " AND ".join([f"loc_y <= {HALF_COURT}", "loc_x IS NOT NULL", *base_where])
    league = cur.execute(
        f"""
        WITH f AS (SELECT loc_x AS x, loc_y AS y, fgm, pts FROM fact_shot WHERE {base_cond}),
        {_hexed("f")}
        SELECT q, r, count(*), sum(fgm), sum(pts) FROM hx GROUP BY q, r""",
        base_params,
    ).fetchall()
    lg = {(q, r): (n, m, p) for q, r, n, m, p in league}

    courts: dict[Any, dict] = {}
    for gkey, glabel, q, r, n, m, p in shots:
        c = courts.setdefault(gkey, {"key": gkey, "label": glabel, "fga": 0, "fgm": 0, "pts": 0, "hexes": []})
        c["fga"] += n
        c["fgm"] += int(m)
        c["pts"] += int(p)
        ln, lm, _ = lg.get((q, r), (0, 0, 0))
        # [q, r, attempts, makes, points, league FG% from this spot]
        c["hexes"].append([q, r, n, int(m), int(p), round(lm / ln, 4) if ln else None])
    return {
        "hex": HEX,
        "courts": sorted(courts.values(), key=lambda c: -c["fga"]),
        "league": {
            "fga": sum(v[0] for v in lg.values()),
            "fgm": int(sum(v[1] for v in lg.values())),
            "pts": int(sum(v[2] for v in lg.values())),
        },
    }


@router.post("/court")
def court(spec: PivotSpec):
    """The Lab's court chart: the view's filters; split by its first row field if it has one."""
    ds = catalog.dataset(spec.dataset)
    if ds is None or ds.table != "fact_shot":
        raise HTTPException(400, "The court chart works with the Shot chart dataset")
    bld = Builder(spec, catalog, ds)
    try:
        where, params, _having = apply_filters(spec, bld)  # whole-group number filters don't apply to shots
        base = spec.model_copy(update={"filters": [f for f in spec.filters if f.field in BASELINE_FIELDS]})
        base_where, base_params, _ = apply_filters(base, Builder(base, catalog, ds))
        split = None
        if spec.rows:
            f = bld.field(spec.rows[0], "dimension")
            split = (f"({f.expr})", f"({f.key})" if f.key else None)
    except SpecError as err:
        raise HTTPException(400, str(err)) from err
    out = bins(where, params, base_where, base_params, split)
    out["split"] = spec.rows[0] if spec.rows else None
    return out


@router.get("/player/{player_id}/shots")
def player_shots(player_id: int, season: str, season_type: str = "Regular Season"):
    """One player's season on the court, for the player page."""
    return bins(
        ["player_id = ?", "season = ?", "season_type = ?"],
        [player_id, season, season_type],
        ["season = ?", "season_type = ?"],
        [season, season_type],
    )
