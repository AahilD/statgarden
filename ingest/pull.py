"""Pull everything in endpoints.yaml to gzipped JSON files under data/raw/.

Resumable: anything already on disk is skipped. Safe to stop and restart.
Run the two sources in parallel; they're throttled separately.

    uv run python -m ingest.pull --source stats --per once,season,team,team_season
    uv run python -m ingest.pull --source stats --per player,game
    uv run python -m ingest.pull --source cdn
    uv run python -m ingest.pull --source stats --per game --limit-games 2   # quick test
"""

from __future__ import annotations

import argparse
import json
import signal
import time
from collections import Counter
from datetime import UTC, date, datetime, timedelta

from nba_api.stats.static import teams as static_teams

from ingest.client import PullError, call, read, save
from ingest.paths import LOG_DIR, RAW_DIR
from ingest.registry import PER_ORDER, Endpoint, Task, load_registry, once_tasks, season_tasks

CURRENT_SEASON_MAX_AGE = timedelta(hours=12)  # season-level files for the live season go stale
MAX_CONSECUTIVE_FAILS = 5  # in a row across all calls: probably throttled, so cool off
COOLOFF_S = 120
MAX_COOLOFFS = 3  # cool-offs with no success in between: stop the run
BROKEN_ENDPOINT_FAILS = 10  # one endpoint failing while others work: skip it this run

# Clean stop: create this file (make stop-pull), or send Ctrl-C / SIGTERM.
# The puller finishes the call it's on, saves it, and exits. Re-running resumes.
STOP_FILE = LOG_DIR.parent / "STOP_PULL"
_stop_requested = False


def _request_stop(signum, frame) -> None:
    global _stop_requested
    _stop_requested = True
    print("  stop requested, finishing the current call...", flush=True)


# ── where the game and player lists come from ───────────────────────────────


def _result_rows(doc: dict) -> list[dict]:
    rs = doc["response"]["resultSets"][0]
    return [dict(zip(rs["headers"], row, strict=True)) for row in rs["rowSet"]]


def games(seasons: list[str]) -> list[dict]:
    """Every game in the team game logs on disk, newest first."""
    out: dict[str, dict] = {}
    for season in seasons:
        for f in (RAW_DIR / "stats" / "game_log_team" / season).glob("*.json.gz"):
            doc = read(f)
            st = doc["request"]["params"].get("season_type_all_star")
            for r in _result_rows(doc):
                out[r["GAME_ID"]] = {
                    "game_id": r["GAME_ID"],
                    "game_date": r["GAME_DATE"],
                    "season": season,
                    "season_type": st,
                }
    return sorted(out.values(), key=lambda g: (g["game_date"], g["game_id"]), reverse=True)


def players(seasons: list[str]) -> list[int]:
    ids: set[int] = set()
    for season in seasons:
        for f in (RAW_DIR / "stats" / "game_log_player" / season).glob("*.json.gz"):
            ids |= {r["PLAYER_ID"] for r in _result_rows(read(f))}
    return sorted(ids)


# ── building the task list ──────────────────────────────────────────────────


def build_tasks(eps: list[Endpoint], cfg: dict, args) -> list[Task]:
    seasons = args.seasons or cfg["seasons"]
    tasks: list[Task] = []
    team_ids = [t["id"] for t in static_teams.get_teams()]
    by_per = {p: [e for e in eps if e.per == p] for p in PER_ORDER}

    for ep in by_per["once"]:
        tasks += once_tasks(ep)
    for ep in by_per["season"]:
        tasks += season_tasks(ep, seasons, cfg["season_types"])
    for ep in by_per["team"]:
        tasks += [Task(ep, {**ep.params, "team_id": t}, "_", f"team_id={t}") for t in team_ids]
    for ep in by_per["team_season"]:
        tasks += [
            Task(ep, {**ep.params, "team_id": t, ep.season_param: s}, s, f"team_id={t}")
            for s in seasons
            for t in team_ids
        ]
    if by_per["player"]:
        pids = players(seasons)
        for ep in by_per["player"]:
            tasks += [Task(ep, {**ep.params, "player_id": p}, "_", f"player_id={p}") for p in pids]
    if by_per["game"]:
        today = date.today().isoformat()
        game_list = [g for g in games(seasons) if g["game_date"] < today]
        if args.limit_games:
            game_list = game_list[: args.limit_games]
        for g in game_list:  # game-major, so a stopped run leaves whole games
            for ep in by_per["game"]:
                tasks.append(
                    Task(ep, {**ep.params, "game_id": g["game_id"]}, g["season"], f"game_id={g['game_id']}", meta=g)
                )
    return tasks


def needs_pull(task: Task, current_season: str, refresh_days: int) -> bool:
    if not task.path.exists():
        return True
    age = datetime.now(UTC) - datetime.fromtimestamp(task.path.stat().st_mtime, UTC)
    if task.ep.per in ("season", "team_season") and task.season == current_season:
        return age > CURRENT_SEASON_MAX_AGE
    if task.ep.per == "game" and refresh_days:
        recent = task.meta["game_date"] >= (date.today() - timedelta(days=refresh_days)).isoformat()
        return recent and age > timedelta(hours=12)
    return False


# ── main loop ───────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["stats", "cdn"], required=True)
    ap.add_argument("--per", default=",".join(PER_ORDER), help="comma list of: " + ",".join(PER_ORDER))
    ap.add_argument("--only", default="", help="comma list of endpoint names")
    ap.add_argument("--seasons", nargs="*")
    ap.add_argument("--limit-games", type=int, default=0)
    ap.add_argument("--refresh-days", type=int, default=0, help="re-pull games from the last N days")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg, eps = load_registry()
    pers = set(args.per.split(","))
    only = set(filter(None, args.only.split(",")))
    eps = [e for e in eps if e.source == args.source and e.per in pers and (not only or e.name in only)]

    tasks = build_tasks(eps, cfg, args)
    current = (args.seasons or cfg["seasons"])[-1]
    todo = [t for t in tasks if needs_pull(t, current, args.refresh_days)]
    print(f"{args.source}: {len(tasks):,} calls in total, {len(todo):,} to pull", flush=True)
    for name, n in sorted(Counter(t.ep.name for t in todo).items()):
        print(f"  {name:<28} {n:>6}", flush=True)
    if args.dry_run or not todo:
        return

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)
    fail_log = LOG_DIR / f"pull_failures_{args.source}.jsonl"
    ep_fails: Counter = Counter()  # failures in a row per endpoint (a broken endpoint)
    streak = 0  # failures in a row across all calls (throttled / blocked)
    cooloffs = 0
    skipped: set[str] = set()
    done = failed = 0
    t0 = time.monotonic()

    def stopping() -> bool:
        return _stop_requested or STOP_FILE.exists()

    for i, task in enumerate(todo, 1):
        if stopping():
            print(
                f"[{datetime.now():%H:%M}] stopped cleanly after {done:,} saved; "
                f"{len(todo) - i + 1:,} calls left for next time",
                flush=True,
            )
            break
        if task.ep.name in skipped:
            continue
        try:
            data = call(task.ep.source, task.ep.endpoint, task.params)
            save(task.path, task.ep.source, task.ep.endpoint, task.params, data)
            ep_fails[task.ep.name] = streak = cooloffs = 0
            done += 1
        except PullError as err:
            failed += 1
            ep_fails[task.ep.name] += 1
            streak += 1
            with fail_log.open("a") as f:
                f.write(
                    json.dumps(
                        {
                            "at": datetime.now(UTC).isoformat(timespec="seconds"),
                            "endpoint": task.ep.name,
                            "params": task.params,
                            "error": str(err)[:500],
                        }
                    )
                    + "\n"
                )
            if streak >= MAX_CONSECUTIVE_FAILS:
                cooloffs += 1
                if cooloffs > MAX_COOLOFFS:
                    print(
                        f"  !! still failing after {MAX_COOLOFFS} cool-offs; NBA.com may be blocking us. "
                        f"Stopping; re-run later to resume.",
                        flush=True,
                    )
                    break
                print(
                    f"  .. {streak} failures in a row, cooling off {COOLOFF_S}s ({cooloffs}/{MAX_COOLOFFS})", flush=True
                )
                end = time.monotonic() + COOLOFF_S
                while time.monotonic() < end and not stopping():
                    time.sleep(2)
                streak = 0
            elif ep_fails[task.ep.name] >= BROKEN_ENDPOINT_FAILS:
                skipped.add(task.ep.name)
                print(
                    f"  !! {task.ep.name}: {BROKEN_ENDPOINT_FAILS} failures in a row while others work; "
                    f"skipping it this run",
                    flush=True,
                )
        if i % 100 == 0 or i == len(todo):
            rate = (time.monotonic() - t0) / i
            eta_h = rate * (len(todo) - i) / 3600
            print(
                f"[{datetime.now():%H:%M}] {i:,}/{len(todo):,}  ok {done:,}  failed {failed:,}  "
                f"{rate:.2f}s/call  ~{eta_h:.1f}h left",
                flush=True,
            )

    print(f"finished: {done:,} saved, {failed:,} failed, skipped endpoints: {sorted(skipped) or 'none'}", flush=True)


if __name__ == "__main__":
    main()
