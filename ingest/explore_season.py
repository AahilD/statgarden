"""Phase 0: pull one season of player and team game logs into DuckDB.

    uv run python -m ingest.explore_season --season 2025-26
"""

from __future__ import annotations

import argparse
import time

import duckdb
from nba_api.stats.endpoints import leaguegamelog

from ingest.client import ROOT, fetch, result_set

DB_PATH = ROOT / "data" / "statgarden.duckdb"
SEASON_TYPES = ["Regular Season", "Playoffs"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-26")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))

    for who, table in [("P", "raw_player_game_log"), ("T", "raw_team_game_log")]:
        for st in SEASON_TYPES:
            t0 = time.monotonic()
            data = fetch(
                leaguegamelog.LeagueGameLog,
                refresh=args.refresh,
                season=args.season,
                season_type_all_star=st,
                player_or_team_abbreviation=who,
            )
            df = result_set(data)
            df["season"] = args.season
            df["season_type"] = st
            print(f"{table} {st}: {len(df):,} rows in {time.monotonic() - t0:.1f}s")

            con.execute(f"CREATE TABLE IF NOT EXISTS {table} AS SELECT * FROM df LIMIT 0")
            con.execute(f"DELETE FROM {table} WHERE season = ? AND season_type = ?", [args.season, st])
            con.execute(f"INSERT INTO {table} BY NAME SELECT * FROM df")

    for table in ["raw_player_game_log", "raw_team_game_log"]:
        n = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f"{table}: {n:,} rows total")
    con.close()


if __name__ == "__main__":
    main()
