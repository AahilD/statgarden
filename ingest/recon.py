"""Print the reconciliation report: where stats.nba.com and cdn.nba.com disagree.

Reads the recon_* tables dbt builds (make build first).

    uv run python -m ingest.recon
"""

from __future__ import annotations

import duckdb

from ingest.paths import DB_PATH


def main() -> None:
    con = duckdb.connect(str(DB_PATH), read_only=True)

    g = con.execute("""
        select count(distinct game_id), count(*), count(*) filter (where not all_match)
        from recon_team_score""").fetchall()[0]
    print(f"Final scores: {g[0]:,} games in both sources, {g[1]:,} team rows, {g[2]:,} where any source disagrees")
    if g[2]:
        print(con.sql("select * from recon_team_score where not all_match order by game_id limit 15"))

    p = con.execute("""
        select count(distinct game_id), count(*),
               count(*) filter (where in_stats and not in_cdn),
               count(*) filter (where in_cdn and not in_stats),
               count(*) filter (where in_cdn and not in_stats and coalesce(cdn_seconds, 0) > 0),
               count(*) filter (where box_differs),
               count(*) filter (where minutes_differ)
        from recon_player_box""").fetchall()[0]
    print(f"\nPlayer box scores: {p[0]:,} games, {p[1]:,} player rows")
    print(f"  only in stats:                     {p[2]:,}")
    print(f"  only in cdn:                       {p[3]:,}  (of which actually played: {p[4]:,})")
    print(f"  points/reb/ast/fga/tov differ:     {p[5]:,}")
    print(f"  minutes differ by more than 1 min: {p[6]:,}")
    if p[5]:
        print(
            con.sql("""select game_id, player_name, team, stats_pts, cdn_pts, stats_reb, cdn_reb,
                                stats_ast, cdn_ast, stats_fga, cdn_fga, stats_tov, cdn_tov
                         from recon_player_box where box_differs order by game_id limit 15""")
        )
    con.close()


if __name__ == "__main__":
    main()
