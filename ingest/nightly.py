"""The nightly job: pull what's new, rebuild, check, publish.

    make nightly                               # what the scheduled task runs every morning
    uv run python -m ingest.nightly --no-pull  # rebuild and publish what's on disk

Scheduling: a Claude scheduled task on the Mac for now. launchd can't be used while the repo
is under ~/Documents (macOS privacy protection blocks background jobs from reading it).
Later this moves to a server cron, once the cloud-block test says NBA.com answers from one.

Steps:
  1. Pull, both sources at once (they're throttled separately):
     - stats.nba.com: the live season's season-level files (game logs, dashboards, lineups...),
       then every game from it that's missing, plus a re-pull of the last 7 days (late corrections).
     - cdn.nba.com: new games and the last 7 days first, then the older backlog until cdn
       stops answering (~600 calls a day). Hitting that limit is normal, not a failure.
  2. make build (load + dbt models and tests), then make check (every catalog field runs).
  3. Publish to data/serve/ only if both passed. The site keeps yesterday's data otherwise.
  4. make recon for the log (where the sources disagree). Informational.
  5. Backfill older seasons for up to 16 hours (ingest/backfill.py); when one finishes, build,
     check and publish again so it shows up the same morning.

One summary line per run goes to data/logs/nightly_runs.jsonl. A failed run shows a Mac
notification. Two runs can't overlap (lock file).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import date, datetime
from pathlib import Path

import duckdb
import yaml

from ingest import backfill
from ingest.paths import DB_PATH, LOG_DIR
from ingest.registry import REGISTRY, unmark_complete

ROOT = Path(__file__).resolve().parent.parent
LOCK = LOG_DIR.parent / "NIGHTLY_LOCK"
RUNS = LOG_DIR / "nightly_runs.jsonl"
REFRESH_DAYS = 7
BACKFILL_HOURS = 16  # older seasons after the live one (~3 modern seasons); done before the next 5 am run
PULL_TIMEOUT_S = 3 * 3600  # a pull that runs this long is stuck


def say(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def run(cmd: list[str], log: Path, timeout: float | None = None) -> tuple[int, str]:
    """Run a command, append its output to the log, return (exit code, output)."""
    say("$ " + " ".join(cmd))
    t0 = time.monotonic()
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        out, code = p.stdout + p.stderr, p.returncode
    except subprocess.TimeoutExpired as err:
        out = (err.stdout or b"").decode() if isinstance(err.stdout, bytes) else (err.stdout or "")
        out, code = out + f"\n!! timed out after {timeout:.0f}s", 124
    with log.open("a") as f:
        f.write(out)
    say(f"  exit {code} in {time.monotonic() - t0:.0f}s")
    return code, out


def pull_result(out: str) -> dict:
    """The puller's last line: 'finished: 1,234 saved, 5 failed, skipped endpoints: none'."""
    m = re.search(r"finished: ([\d,]+) saved, ([\d,]+) failed", out)
    saved, failed = (int(m[1].replace(",", "")), int(m[2].replace(",", ""))) if m else (0, 0)
    nothing = re.search(r", 0 to pull", out) is not None
    return {
        "saved": saved,
        "failed": failed,
        "blocked": "may be blocking us" in out,
        "ok": bool(m) or nothing,  # no 'finished' line and work to do means it crashed
    }


def start_pull(args: list[str], log: Path) -> subprocess.Popen:
    say("$ pull " + " ".join(args))
    f = log.open("a")
    return subprocess.Popen(
        ["uv", "run", "python", "-m", "ingest.pull", *args], cwd=ROOT, stdout=f, stderr=subprocess.STDOUT, text=True
    )


def pulls(season: str, stamp: str) -> dict:
    """Both sources in parallel; stats does season-level files first so its game list is fresh."""
    logs = {s: LOG_DIR / f"nightly_{stamp}_{s}.out" for s in ("stats", "cdn")}
    cdn = start_pull(["--source", "cdn", "--refresh-days", str(REFRESH_DAYS)], logs["cdn"])

    stats = {"saved": 0, "failed": 0, "blocked": False, "ok": True}
    for per, extra in (("season,team_season", []), ("game", ["--refresh-days", str(REFRESH_DAYS)])):
        code, out = run(
            [
                "uv",
                "run",
                "python",
                "-m",
                "ingest.pull",
                "--source",
                "stats",
                "--per",
                per,
                "--seasons",
                season,
                *extra,
            ],
            logs["stats"],
            timeout=PULL_TIMEOUT_S,
        )
        r = pull_result(out)
        stats["saved"] += r["saved"]
        stats["failed"] += r["failed"]
        stats["blocked"] |= r["blocked"]
        stats["ok"] &= r["ok"] and code == 0

    try:
        code = cdn.wait(timeout=PULL_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        cdn.terminate()  # the puller saves the call it's on and exits
        code = cdn.wait(timeout=120)
    c = pull_result(logs["cdn"].read_text())
    c["ok"] = c["ok"] and code == 0
    say(f"stats: {stats}  cdn: {c}")
    return {"stats": stats, "cdn": c}


def latest_game() -> str | None:
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        d = con.execute("select max(game_date) from fact_team_game").fetchone()[0]
        con.close()
        return str(d) if d else None
    except duckdb.Error:
        return None


def notify(title: str, msg: str) -> None:
    """Mac notification; harmless anywhere else."""
    script = f"display notification {json.dumps(msg)} with title {json.dumps(title)}"
    subprocess.run(["osascript", "-e", script], capture_output=True)


def locked() -> bool:
    """True if another run holds the lock. A lock left by a dead process is taken over."""
    if LOCK.exists():
        try:
            os.kill(int(LOCK.read_text().strip()), 0)
            return True
        except (ValueError, ProcessLookupError, PermissionError):
            pass
    LOCK.write_text(str(os.getpid()))
    return False


def build_and_publish(run_info: dict, log: Path, label: str) -> None:
    """make build, make check, then publish only if both passed."""
    steps = run_info.setdefault("steps", {})[label] = {}
    for name in ("build", "check"):
        code, _ = run(["make", name], log)
        steps[name] = code
        if code:
            run_info["problems"].append(f"make {name} failed ({label})")
            return
    code, _ = run(["make", "publish-local"], log)
    steps["publish"] = code
    if code:
        run_info["problems"].append(f"publish failed ({label})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-pull", action="store_true", help="skip pulling; rebuild and publish what's on disk")
    ap.add_argument("--backfill-hours", type=float, default=BACKFILL_HOURS, help="0 to skip the backfill")
    args = ap.parse_args()

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if locked():
        print("another nightly run is going; leaving it be")
        return 0

    stamp = date.today().isoformat()
    log = LOG_DIR / f"nightly_{stamp}.out"
    sys.stdout = sys.stderr = log.open("a", buffering=1)  # runs unattended; everything goes to the log
    t0 = time.monotonic()
    run_info: dict = {"started": datetime.now().isoformat(timespec="seconds"), "problems": []}
    try:
        say("== nightly run")
        season = yaml.safe_load(REGISTRY.read_text())["current_season"]
        before = latest_game()

        # 1. the live season: pull, build, check, publish
        new = True
        if not args.no_pull:
            p = pulls(season, stamp)
            run_info["pull"] = p
            if not p["stats"]["ok"] or p["stats"]["blocked"]:
                run_info["problems"].append("stats.nba.com pull failed or was blocked")
            if not p["cdn"]["ok"]:
                run_info["problems"].append("cdn.nba.com pull crashed")
            new = p["stats"]["saved"] + p["cdn"]["saved"] > 0
        if new:
            build_and_publish(run_info, log, "live")
            run(["make", "recon"], log)
        else:
            say("nothing new for the live season")
        run_info["latest_game"] = {"before": before, "after": latest_game()}

        # 2. older seasons for a few hours; a finished season gets built and published straight away
        stats_ok = not any("stats.nba.com" in p for p in run_info["problems"])
        if args.backfill_hours and stats_ok:
            say(f"== backfill, up to {args.backfill_hours:g}h")
            b = backfill.main(["--hours", str(args.backfill_hours)])
            run_info["backfill"] = b
            if b["blocked"] or b["crashed"]:
                run_info["problems"].append("backfill pull was blocked or crashed")
            if b["completed"]:
                n = len(run_info["problems"])
                build_and_publish(run_info, log, "backfill")
                if len(run_info["problems"]) > n:
                    # an old season broke the build: take it back out so the live season keeps updating,
                    # and rebuild without it (its raw files stay on disk for when the models are fixed)
                    for s in b["completed"]:
                        unmark_complete(s)
                    run_info["problems"].append(f"backfilled {', '.join(b['completed'])} broke the build; set aside")
                    build_and_publish(run_info, log, "without backfill")

        run_info["status"] = "failed" if run_info["problems"] else "ok"
        return 1 if run_info["problems"] else 0
    except Exception as err:  # anything unexpected still gets logged and alerted
        run_info["problems"].append(f"crashed: {err!r}")
        run_info["status"] = "failed"
        raise
    finally:
        run_info["minutes"] = round((time.monotonic() - t0) / 60, 1)
        with RUNS.open("a") as f:
            f.write(json.dumps(run_info) + "\n")
        say(f"== {run_info.get('status')} in {run_info['minutes']} min; problems: {run_info['problems'] or 'none'}")
        if run_info["problems"]:
            notify("StatGarden nightly run failed", "; ".join(run_info["problems"]) + f". Log: data/logs/{log.name}")
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
