"""Check catalog/fields.yaml and run every field through the real query builder.

Uses the API's own catalog rules (api/catalog.py) and SQL builder (api/sql.py),
so this checks exactly what the website will ask for. Runs against the
pipeline's working database, so a broken field shows up before publishing.

    uv run python -m catalog.check     (make check)
"""

from __future__ import annotations

import sys

import duckdb
from pydantic import ValidationError

from api.catalog import load_catalog, mark_available
from api.spec import PivotSpec
from api.sql import SpecError, build
from ingest.paths import DB_PATH

SAMPLE = [  # one season keeps the check quick
    {"field": "season", "op": "in", "value": ["2025-26"]},
    {"field": "season_type", "op": "in", "value": ["Regular Season"]},
]


def main() -> int:
    try:
        cat = load_catalog()
    except (ValidationError, ValueError) as err:
        print(f"catalog is invalid:\n{err}")
        return 1
    dims = sum(f.kind == "dimension" for f in cat.fields)
    print(f"catalog: {len(cat.fields)} fields ({dims} dimensions, {len(cat.fields) - dims} measures)")

    con = duckdb.connect(str(DB_PATH), read_only=True)
    errs: list[str] = []
    for ds in cat.datasets:
        mark_available(cat, con, ds.table)
        for f in cat.fields:
            if not f.available:
                continue
            if f.kind == "dimension":
                spec = PivotSpec(dataset=ds.id, filters=SAMPLE, rows=[f.id], values=[{"field": "games"}], limit=5000)
            else:
                spec = PivotSpec(dataset=ds.id, filters=SAMPLE, values=[{"field": f.id}])
            try:
                q = build(spec, cat)
                rows = con.execute(q.sql, q.params).fetchall()
            except (SpecError, duckdb.Error) as err:
                errs.append(f"{f.id}: {str(err).splitlines()[0]}")
                continue
            if f.kind == "dimension":
                values = {str(r[0]) for r in rows}
                extra = values - set(f.bins or []) if f.bins else set()
                if extra:
                    errs.append(f"{f.id}: values not in bins: {sorted(extra)[:5]}")
                print(f"  ok  {f.id:<20} {len(values):>4} values")
            else:
                print(f"  ok  {f.id:<20} league = {rows[0][-1]:,.4g}")

    unavailable = [f.id for f in cat.fields if not f.available]
    print(f"not loaded yet: {', '.join(unavailable) or 'none'}")
    con.close()
    if errs:
        print("\nPROBLEMS")
        for e in errs:
            print("  -", e)
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
