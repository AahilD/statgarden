"""Load raw files from data/raw/ into DuckDB raw tables, whatever shape they are.

    uv run python -m ingest.load            # load anything new or re-pulled
    uv run python -m ingest.load --rebuild  # drop raw tables and load everything again

Each endpoint becomes one or more tables named raw_<endpoint name>__<table>.
Every raw column is text; dbt staging models set the real types. New columns
are added (and logged) instead of failing, so NBA.com changes don't break the load.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import pyarrow as pa

from ingest.client import DATA, RAW_DIR, read
from ingest.registry import load_registry

DB_PATH = DATA / "statgarden.duckdb"
BATCH_FILES = 300
SKIP_KEYS = {"meta", "parameters", "resource"}
SIDE_KEYS = {"homeTeam": "home", "awayTeam": "away"}
SEASON_TYPE_PARAMS = ("season_type_all_star", "season_type", "season_type_playoffs")


# ── names ───────────────────────────────────────────────────────────────────

def snake(name: str) -> str:
    if any(c.islower() for c in name):  # camelCase -> camel_case; leave FG3M alone
        name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    name = re.sub(r"[^A-Za-z0-9]+", "_", name)
    return name.strip("_").lower() or "x"


def _is_scalar(v: Any) -> bool:
    return not isinstance(v, (dict, list))


def _text(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def _carries(key: str) -> bool:
    """Parent fields copied down to child rows: ids, tricodes, side."""
    k = key.lower()
    return k.endswith("id") or k.endswith("tricode") or k == "side"


# ── shape 1: stats.nba.com "resultSets" tables ──────────────────────────────

def _headers(headers: list) -> list[str]:
    if headers and isinstance(headers[0], str):
        return headers
    # multi-level headers (e.g. shot locations): prefix columns with their group
    groups, cols = headers[0], headers[-1]["columnNames"]
    names = list(cols)
    skip = groups.get("columnsToSkip", 0)
    span = groups.get("columnSpan", 1)
    for i, group in enumerate(groups.get("columnNames", [])):
        for j in range(span):
            idx = skip + i * span + j
            if idx < len(names):
                names[idx] = f"{group} {names[idx]}"
    return names


def result_set_tables(resp: dict) -> dict[str, list[dict]]:
    sets = resp.get("resultSets", resp.get("resultSet"))
    if isinstance(sets, dict):
        sets = [sets]
    out: dict[str, list[dict]] = {}
    for rs in sets or []:
        cols = [snake(c) for c in _headers(rs["headers"])]
        out[snake(rs.get("name") or "result")] = [dict(zip(cols, row)) for row in rs["rowSet"]]
    return out


# ── shape 2: nested JSON (V3 box scores, play-by-play, everything on cdn) ───

def _flatten_into(row: dict, prefix: str, obj: dict) -> None:
    for k, v in obj.items():
        if _is_scalar(v):
            row[f"{prefix}_{k}"] = v


def walk(node: dict, path: list[str], ctx: dict, out: dict[str, list[dict]]) -> None:
    row: dict[str, Any] = {}
    children: list[tuple[str, Any, dict]] = []
    for k, v in node.items():
        if not path and k in SKIP_KEYS:
            continue
        if _is_scalar(v):
            row[k] = v
        elif isinstance(v, dict) and all(_is_scalar(x) for x in v.values()):
            _flatten_into(row, k, v)  # e.g. statistics, arena, starters
        elif isinstance(v, list) and all(_is_scalar(x) for x in v):
            if v:
                row[k] = json.dumps(v)
        else:
            children.append((k, v, {}))

    if row:
        merged = dict(row)
        for ck, cv in ctx.items():
            merged[ck if ck not in row else f"parent_{ck}"] = cv
        out["_".join(path) or "game"].append(merged)

    child_ctx = dict(ctx)
    for k, v in row.items():
        if _is_scalar(v) and _carries(k):
            child_ctx[k if k not in ctx else f"{(path or ['game'])[-1]}_{k}"] = v

    for k, v, _ in children:
        seg, extra = (("team", {"side": SIDE_KEYS[k]}) if k in SIDE_KEYS else (k, {}))
        items = v if isinstance(v, list) else [v]
        for item in items:
            if isinstance(item, dict):
                walk(item, path + [seg], {**child_ctx, **extra}, out)


def nested_tables(resp: dict) -> dict[str, list[dict]]:
    body = {k: v for k, v in resp.items() if k not in SKIP_KEYS}
    # unwrap a single top-level wrapper like {"boxScoreTraditional": {...}} or {"game": {...}}
    if len(body) == 1 and isinstance(next(iter(body.values())), dict):
        body = next(iter(body.values()))
    out: dict[str, list[dict]] = defaultdict(list)
    walk(body, [], {}, out)
    return {snake(k): rows for k, rows in out.items()}


def tables_from(resp: dict) -> dict[str, list[dict]]:
    if "resultSets" in resp or "resultSet" in resp:
        return result_set_tables(resp)
    return nested_tables(resp)


# ── writing to DuckDB ───────────────────────────────────────────────────────

def ensure_meta(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""CREATE TABLE IF NOT EXISTS raw__files (
        file VARCHAR PRIMARY KEY, endpoint VARCHAR, mtime DOUBLE, tables VARCHAR,
        n_rows BIGINT, loaded_at TIMESTAMP)""")
    con.execute("""CREATE TABLE IF NOT EXISTS raw__schema_log (
        logged_at TIMESTAMP, tbl VARCHAR, change VARCHAR, col VARCHAR)""")


def existing_columns(con, table: str) -> list[str] | None:
    rows = con.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position",
        [table]).fetchall()
    return [r[0] for r in rows] or None


def write_rows(con, table: str, rows: list[dict]) -> None:
    cols: list[str] = []
    seen: set[str] = set()
    for r in rows:
        for c in r:
            if c not in seen:
                seen.add(c)
                cols.append(c)
    now = datetime.now(timezone.utc)
    have = existing_columns(con, table)
    if have is None:
        con.execute(f'CREATE TABLE "{table}" ({", ".join(f"""\"{c}\" VARCHAR""" for c in cols)})')
        con.execute("INSERT INTO raw__schema_log VALUES (?, ?, 'created', ?)", [now, table, f"{len(cols)} columns"])
    else:
        for c in cols:
            if c not in have:
                con.execute(f'ALTER TABLE "{table}" ADD COLUMN "{c}" VARCHAR')
                con.execute("INSERT INTO raw__schema_log VALUES (?, ?, 'added', ?)", [now, table, c])
                print(f"    + {table}.{c} (new column)")
    schema = pa.schema([(c, pa.string()) for c in cols])
    batch = pa.Table.from_pylist([{c: _text(r.get(c)) for c in cols} for r in rows], schema=schema)
    con.register("_batch", batch)
    con.execute(f'INSERT INTO "{table}" BY NAME SELECT * FROM _batch')
    con.unregister("_batch")


def file_meta(path: Path, doc: dict) -> dict[str, Any]:
    params = doc["request"]["params"]
    season = path.parent.name
    st = next((params[p] for p in SEASON_TYPE_PARAMS if p in params), None)
    return {
        "_file": str(path.relative_to(RAW_DIR)),
        "_season": None if season == "_" else season,
        "_season_type": st,
        "_params": json.dumps(params, sort_keys=True),
        "_pulled_at": doc.get("pulled_at"),
    }


def load(rebuild: bool = False, only: set[str] | None = None) -> None:
    _, eps = load_registry()
    con = duckdb.connect(str(DB_PATH))
    if rebuild:
        for (t,) in con.execute("SELECT table_name FROM information_schema.tables "
                                "WHERE table_name LIKE 'raw\\_%' ESCAPE '\\'").fetchall():
            con.execute(f'DROP TABLE "{t}"')
    ensure_meta(con)
    loaded = {f: (m, t) for f, m, t in con.execute("SELECT file, mtime, tables FROM raw__files").fetchall()}

    total_files = total_rows = 0
    t0 = time.monotonic()
    for ep in eps:
        if only and ep.name not in only:
            continue
        files = sorted((RAW_DIR / ep.source / ep.name).glob("*/*.json.gz"))
        todo = []
        for f in files:
            rel = str(f.relative_to(RAW_DIR))
            prev = loaded.get(rel)
            if prev is None or prev[0] != f.stat().st_mtime:
                todo.append((f, rel, prev))
        if not todo:
            continue

        ep_rows = 0
        for start in range(0, len(todo), BATCH_FILES):
            chunk = todo[start:start + BATCH_FILES]
            buffers: dict[str, list[dict]] = defaultdict(list)
            file_records = []
            con.execute("BEGIN")
            for f, rel, prev in chunk:
                if prev is not None:  # re-pulled: drop its old rows first
                    for t in filter(None, (prev[1] or "").split(",")):
                        con.execute(f'DELETE FROM "{t}" WHERE _file = ?', [rel])
                doc = read(f)
                meta = file_meta(f, doc)
                n = 0
                names = []
                for tname, rows in tables_from(doc["response"]).items():
                    table = f"raw_{ep.name}__{tname}"
                    names.append(table)
                    buffers[table] += [{**r, **meta} for r in rows]
                    n += len(rows)
                file_records.append((rel, ep.name, f.stat().st_mtime, ",".join(names), n))
                ep_rows += n
            for table, rows in buffers.items():
                if rows:
                    write_rows(con, table, rows)
            con.executemany("INSERT OR REPLACE INTO raw__files VALUES (?, ?, ?, ?, ?, now())", file_records)
            con.execute("COMMIT")
        total_files += len(todo)
        total_rows += ep_rows
        print(f"  {ep.name:<28} {len(todo):>6} files  {ep_rows:>10,} rows", flush=True)

    print(f"loaded {total_files:,} files, {total_rows:,} rows in {time.monotonic() - t0:.0f}s")
    con.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    load(args.rebuild, set(filter(None, args.only.split(","))) or None)


if __name__ == "__main__":
    main()
