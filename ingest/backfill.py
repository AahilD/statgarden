"""Backfill: pull older seasons, newest first, a few hours at a time.

    uv run python -m ingest.backfill --hours 4        # what the nightly run does after the live season
    uv run python -m ingest.backfill --hours 10       # a longer go, e.g. overnight by hand
    uv run python -m ingest.backfill --dry-run        # which season is next and how many calls it needs

Works on the newest season that isn't finished yet (oldest_season..current_season in endpoints.yaml,
minus data/complete_seasons.json). Season-level files first, then every game. Endpoints only pull
seasons they have data for (`since`, from the coverage map). Only stats.nba.com: cdn.nba.com's
~600 calls a day are spent on the live season and its own backlog.

A season counts as finished when a pass gets through all its calls before the time runs out, with
under 1% failing (some old games answer empty for some box scores). It's then added to
complete_seasons.json, and the next build loads it. Half-done seasons are never loaded.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import time
from datetime import datetime

from ingest.paths import ROOT
from ingest.registry import all_seasons, complete_seasons, load_registry, mark_complete

MAX_FAIL_SHARE = 0.01


def say(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def next_season(cfg: dict) -> str | None:
    done = set(complete_seasons()) | {cfg["current_season"]}
    todo = [s for s in all_seasons(cfg) if s not in done]
    return max(todo) if todo else None


def pull(season: str, per: str, minutes: float, dry_run: bool = False) -> dict:
    cmd = ["uv", "run", "python", "-m", "ingest.pull", "--source", "stats", "--per", per, "--seasons", season]
    cmd += ["--dry-run"] if dry_run else ["--max-minutes", f"{minutes:.1f}"]
    say("$ " + " ".join(cmd[3:]))
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = p.stdout + p.stderr
    print(out if dry_run else "\n".join(out.splitlines()[-4:]), flush=True)
    todo = re.search(r"([\d,]+) to pull", out)
    fin = re.search(r"finished: ([\d,]+) saved, ([\d,]+) failed", out)
    n = lambda s: int(s.replace(",", ""))  # noqa: E731
    return {
        "todo": n(todo[1]) if todo else 0,
        "saved": n(fin[1]) if fin else 0,
        "failed": n(fin[2]) if fin else 0,
        "ran_out": "stopped cleanly" in out,
        "blocked": "may be blocking us" in out,
        "crashed": p.returncode != 0,
    }


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=4)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    cfg, _ = load_registry()
    deadline = time.time() + args.hours * 3600
    result = {"completed": [], "saved": 0, "failed": 0, "blocked": False, "crashed": False}

    while (season := next_season(cfg)) and time.time() < deadline:
        say(f"== backfill {season}")
        finished = True
        for per in ("season,team_season", "game"):  # game list comes from the season's game log
            left = (deadline - time.time()) / 60
            if left < 1 and not args.dry_run:
                finished = False
                break
            r = pull(season, per, left, args.dry_run)
            result["saved"] += r["saved"]
            result["failed"] += r["failed"]
            result["blocked"] |= r["blocked"]
            result["crashed"] |= r["crashed"]
            too_many = r["todo"] and r["failed"] / r["todo"] > MAX_FAIL_SHARE
            if r["ran_out"] or r["blocked"] or r["crashed"] or too_many:
                finished = False
                if too_many:
                    say(f"  {r['failed']:,} of {r['todo']:,} calls failed; leaving {season} open to retry")
                break
        if args.dry_run:
            break
        if not finished:
            break
        mark_complete(season)
        result["completed"].append(season)
        say(f"  {season} finished; it loads with the next build")

    if not season:
        say("backfill: every season from oldest_season on is finished")
    say(f"backfill: {result}")
    return result


if __name__ == "__main__":
    main()
