"""Coverage map: which stats.nba.com endpoints have data for which seasons.

One sample call per endpoint per season (regular season, the first sweep combination,
one team, and one mid-season game for the per-game endpoints), newest season first.
Answers are saved to data/raw like any pull, so the backfill reuses them.

    uv run python -m ingest.coverage                       # 2023-24 back to 1946-47
    uv run python -m ingest.coverage --oldest 1996-97
    uv run python -m ingest.coverage --report              # just print the map from data/coverage.json

Each cell is "data" (rows came back), "empty" (answered, no rows) or "error" (the call
failed, which for old seasons usually means nba_api couldn't parse an empty answer).
Errors next to a season with data are tried again at the end, in case they were a blip.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime

from ingest.client import PullError, call, read, save
from ingest.paths import DATA, LOG_DIR
from ingest.registry import Endpoint, Task, load_registry, season_tasks

OUT = DATA / "coverage.json"
STOP_FILE = LOG_DIR.parent / "STOP_PULL"
SAMPLE_TEAM = 1610612737  # Hawks: in the league (as Tri-Cities / Milwaukee / St. Louis) since 1949-50
# what a throttled or blocked call looks like (not a bare "403": game ids like 0027403016 contain it)
BLOCKED_HINTS = ("Timeout", "ConnectionError", "403 Client Error", "Forbidden", "JSONDecodeError")


def season_label(start: int) -> str:
    return f"{start}-{str(start + 1)[-2:]}"


def _rowsets(o, out: list) -> None:
    if isinstance(o, dict):
        if "rowSet" in o:
            out.append(len(o["rowSet"]))
        for v in o.values():
            _rowsets(v, out)
    elif isinstance(o, list):
        for v in o:
            _rowsets(v, out)


# endpoints that copy a few plain box-score numbers into otherwise empty rows: judge them by their own stat
KEY_STAT = {"box_tracking": "distance"}


def _real(d: dict, key: str | None = None) -> bool:
    """A row with something in it. Old seasons answer with placeholders: a player with id 0 and blank
    names, or a real player whose tracking numbers are all 0."""
    stats = d.get("statistics")
    if isinstance(stats, dict):
        if key:
            return bool(stats.get(key))
        return any(isinstance(v, (int, float)) and v != 0 for v in stats.values())
    return any(
        (isinstance(v, str) and v.strip()) or (isinstance(v, (int, float)) and v != 0 and not k.lower().endswith("id"))
        for k, v in d.items()
    )


def count_rows(o, key: str | None = None) -> int:
    """Rows with real data: resultSets' rowSet lengths, or (newer nested answers) list items that aren't
    placeholders."""
    sets: list[int] = []
    _rowsets(o, sets)
    if sets:
        return sum(sets)

    def nested(x) -> int:
        if isinstance(x, dict):
            return sum(nested(v) for v in x.values())
        if isinstance(x, list):
            return sum((1 if isinstance(v, dict) and _real(v, key) else 0) + nested(v) for v in x)
        return 0

    return nested(o)


def probe(task: Task) -> dict:
    """One call (or the file already on disk) → {status, rows}."""
    if task.path.exists():
        rows = count_rows(read(task.path)["response"], KEY_STAT.get(task.ep.name))
        return {"status": "data" if rows else "empty", "rows": rows}
    try:
        data = call(task.ep.source, task.ep.endpoint, task.params, tries=1)
    except PullError as err:
        msg = str(err)
        return {"status": "blocked?" if any(h in msg for h in BLOCKED_HINTS) else "error", "error": msg[-160:]}
    save(task.path, task.ep.source, task.ep.endpoint, task.params, data)
    rows = count_rows(data, KEY_STAT.get(task.ep.name))
    return {"status": "data" if rows else "empty", "rows": rows}


def sample_tasks(eps: list[Endpoint], season: str, game_id: str | None) -> list[Task]:
    tasks = []
    for ep in eps:
        if ep.per == "season" and ep.name != "game_log_team":
            combos = season_tasks(ep, [season], ["Regular Season"])
            # endpoints with their own season_types list still get a regular-season sample
            reg = [
                t for t in combos if not ep.season_type_param or t.params.get(ep.season_type_param) == "Regular Season"
            ]
            combos = reg or combos
            if combos:  # empty when the season is older than the endpoint's `since`
                tasks.append(combos[len(combos) // 2])  # a middle combination: e.g. shots in a mid-season month
        elif ep.per == "team_season":
            tasks.append(
                Task(
                    ep, {**ep.params, "team_id": SAMPLE_TEAM, ep.season_param: season}, season, f"team_id={SAMPLE_TEAM}"
                )
            )
        elif ep.per == "game" and game_id:
            tasks.append(Task(ep, {**ep.params, "game_id": game_id}, season, f"game_id={game_id}"))
    return tasks


def sample_game(log_task: Task) -> str | None:
    """A game from the middle of the regular season (opening night and the last week can be odd)."""
    if not log_task.path.exists():
        return None
    rs = read(log_task.path)["response"]["resultSets"][0]
    rows = [dict(zip(rs["headers"], r, strict=True)) for r in rs["rowSet"]]
    if not rows:
        return None
    rows.sort(key=lambda r: (r["GAME_DATE"], r["GAME_ID"]))
    return rows[len(rows) // 2]["GAME_ID"]


def report(cov: dict) -> None:
    seasons = sorted(cov, reverse=True)
    names = sorted({n for s in seasons for n in cov[s]["endpoints"]})
    print(f"\n{'endpoint':<28} {'oldest with data':<17} gaps (no data in a season newer than the oldest)")
    for n in names:
        has = [s for s in seasons if cov[s]["endpoints"].get(n, {}).get("status") == "data"]
        if not has:
            print(f"{n:<28} {'none':<17}")
            continue
        oldest = min(has)
        gaps = [s for s in seasons if s > oldest and s not in has]
        print(f"{n:<28} {oldest:<17} {', '.join(sorted(gaps)) or '-'}")
    games = {s: cov[s].get("games") for s in seasons}
    print("\ngames in the team game log:", ", ".join(f"{s}: {g}" for s, g in sorted(games.items()) if g is not None))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--newest", default="2023-24")
    ap.add_argument("--oldest", default="1946-47")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--recount", action="store_true", help="re-read every sample (calls only for samples not on disk)")
    args = ap.parse_args()

    cov: dict = json.loads(OUT.read_text()) if OUT.exists() else {}
    if args.report:
        report(cov)
        return

    _, eps = load_registry()
    eps = [e for e in eps if e.source == "stats" and e.per in ("season", "team_season", "game")]
    log_ep = next(e for e in eps if e.name == "game_log_team")
    first, last = int(args.newest[:4]), int(args.oldest[:4])
    t0 = time.monotonic()

    def run_season(season: str) -> None:
        log_task = season_tasks(log_ep, [season], ["Regular Season"])[0]
        entry = cov.setdefault(season, {"endpoints": {}})
        entry["endpoints"]["game_log_team"] = probe(log_task)
        game_id = sample_game(log_task)
        entry["games"] = entry["endpoints"]["game_log_team"].get("rows", 0) // 2
        entry["sample_game"] = game_id
        for task in sample_tasks(eps, season, game_id):
            if STOP_FILE.exists():
                raise KeyboardInterrupt
            prev = entry["endpoints"].get(task.ep.name, {})
            if prev.get("status") in ("data", "empty") and not args.recount:
                continue  # known from an earlier run
            entry["endpoints"][task.ep.name] = probe(task)
        OUT.write_text(json.dumps(cov, indent=1, sort_keys=True))
        st = [v["status"] for v in entry["endpoints"].values()]
        print(
            f"[{datetime.now():%H:%M}] {season}: {entry['games']} games, {st.count('data')} with data, "
            f"{st.count('empty')} empty, {st.count('error')} errors, {st.count('blocked?')} blocked?",
            flush=True,
        )
        if st.count("blocked?") >= 5:
            print("  !! several calls look blocked; cooling off 5 min", flush=True)
            time.sleep(300)

    try:
        for start in range(first, last - 1, -1):
            run_season(season_label(start))

        # second look at errors right next to a season that has data: a blip, or really where it stops?
        seasons = sorted(cov, reverse=True)
        retry = [
            (s, n)
            for i, s in enumerate(seasons)
            for n, v in cov[s]["endpoints"].items()
            if v["status"] in ("error", "blocked?")
            and i > 0
            and cov[seasons[i - 1]]["endpoints"].get(n, {}).get("status") == "data"
        ]
        print(f"\nretrying {len(retry)} errors next to seasons with data", flush=True)
        for s, n in retry:
            game_id = cov[s].get("sample_game")
            task = next((t for t in sample_tasks(eps, s, game_id) if t.ep.name == n), None)
            if task:
                cov[s]["endpoints"][n] = probe(task) | {"retried": True}
        OUT.write_text(json.dumps(cov, indent=1, sort_keys=True))
    except KeyboardInterrupt:
        OUT.write_text(json.dumps(cov, indent=1, sort_keys=True))
        print("stopped; re-run to carry on (known cells are skipped)")

    print(f"done in {(time.monotonic() - t0) / 60:.0f} min")
    report(cov)


if __name__ == "__main__":
    main()
