"""Validate catalog/fields.yaml and run every available field against DuckDB.

    uv run python -m catalog.check
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import yaml

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "catalog" / "fields.yaml"
DB = ROOT / "data" / "statgarden.duckdb"
AVAILABLE = {"gamelog", "derived"}  # sources fact_player_game can serve today

KINDS = {"dimension", "measure"}
DIM_TYPES = {"text", "int", "date", "bool", "bucket"}
AGGS = {"sum", "count", "ratio", "weighted_avg"}
MODES = {"total", "per_game", "per_36"}
SOURCES = {"gamelog", "derived", "dim", "box_v3"}


def lint(cat: dict) -> list[str]:
    errs: list[str] = []
    fields = cat["fields"]
    by_id: dict[str, dict] = {}
    for f in fields:
        fid = f.get("id", "?")
        if fid in by_id:
            errs.append(f"{fid}: duplicate id")
        by_id[fid] = f
        for key in ("id", "label", "short", "group", "kind", "source", "description"):
            if key not in f:
                errs.append(f"{fid}: missing {key}")
        if f.get("group") not in cat["groups"]:
            errs.append(f"{fid}: unknown group {f.get('group')!r}")
        if f.get("kind") not in KINDS:
            errs.append(f"{fid}: bad kind")
        if f.get("source") not in SOURCES:
            errs.append(f"{fid}: bad source")
        if f.get("kind") == "dimension":
            if f.get("type") not in DIM_TYPES:
                errs.append(f"{fid}: bad type")
            if f.get("type") == "bucket" and not f.get("bins"):
                errs.append(f"{fid}: bucket without bins")
        if f.get("kind") == "measure":
            agg = f.get("agg")
            if agg not in AGGS:
                errs.append(f"{fid}: bad agg {agg!r}")
            if "format" not in f:
                errs.append(f"{fid}: missing format")
            if agg == "ratio":
                if not f.get("formula") or not f.get("requires"):
                    errs.append(f"{fid}: ratio needs formula + requires")
            elif "expr" not in f:
                errs.append(f"{fid}: missing expr")
            if agg == "weighted_avg" and "weight" not in f:
                errs.append(f"{fid}: weighted_avg needs weight")
            for m in f.get("modes", []):
                if m not in MODES:
                    errs.append(f"{fid}: bad mode {m}")
            if f.get("default_mode") and f["default_mode"] not in f.get("modes", []):
                errs.append(f"{fid}: default_mode not in modes")
    for f in fields:
        for r in f.get("requires", []):
            base = by_id.get(r)
            if not base or base.get("agg") != "sum":
                errs.append(f"{f['id']}: requires {r!r}, which is not a sum measure")
        if f.get("weight") and f["weight"] not in by_id:
            errs.append(f"{f['id']}: unknown weight {f['weight']!r}")
    return errs


def measure_sql(f: dict, by_id: dict[str, dict]) -> str:
    """Aggregate SQL for one measure. Ratios inline their base sums here; in a
    PIVOT the generator must pivot the bases and apply the formula outside."""
    agg = f["agg"]
    if agg == "count":
        return f["expr"]
    if agg == "sum":
        return f"sum({f['expr']})"
    if agg == "weighted_avg":
        w = by_id[f["weight"]]["expr"]
        return f"sum(({f['expr']}) * {w}) / nullif(sum({w}), 0)"
    formula = f["formula"]
    # replace longest names first so 'fg3m' isn't clobbered by 'fgm'
    for r in sorted(f["requires"], key=len, reverse=True):
        formula = formula.replace(r, f"__{r}__")
    for r in f["requires"]:
        formula = formula.replace(f"__{r}__", f"sum({by_id[r]['expr']})")
    return formula


def main() -> int:
    cat = yaml.safe_load(CATALOG.read_text())
    errs = lint(cat)
    fields = cat["fields"]
    by_id = {f["id"]: f for f in fields}
    print(f"catalog: {len(fields)} fields "
          f"({sum(f['kind'] == 'dimension' for f in fields)} dimensions, "
          f"{sum(f['kind'] == 'measure' for f in fields)} measures)")

    con = duckdb.connect(str(DB), read_only=True)
    # built by dbt (make build); the catalog speaks in its column names
    view = "fact_player_game"
    where = "WHERE season = '2025-26' AND season_type = 'Regular Season'"

    skipped = [f["id"] for f in fields if f["source"] not in AVAILABLE]
    for f in fields:
        if f["source"] not in AVAILABLE:
            continue
        try:
            if f["kind"] == "dimension":
                rows = con.execute(
                    f"SELECT {f['expr']} AS v, count(*) FROM {view} {where} GROUP BY 1 ORDER BY 2 DESC"
                ).fetchall()
                if f.get("bins"):
                    extra = {str(v) for v, _ in rows} - set(f["bins"])
                    if extra:
                        errs.append(f"{f['id']}: values not in bins: {sorted(extra)[:5]}")
                sample = ", ".join(f"{v}={n}" for v, n in rows[:4])
                print(f"  ok  {f['id']:<20} {len(rows):>4} values  [{sample}]")
            else:
                sql = measure_sql(f, by_id)
                (v,) = con.execute(f"SELECT {sql} FROM {view} {where}").fetchone()
                print(f"  ok  {f['id']:<20} league = {v:,.4g}")
        except duckdb.Error as err:
            errs.append(f"{f['id']}: SQL error: {str(err).splitlines()[0]}")

    print(f"skipped (source not loaded yet): {', '.join(skipped)}")
    if errs:
        print("\nPROBLEMS")
        for e in errs:
            print("  -", e)
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
