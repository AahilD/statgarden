"""NBA Cup and playoffs for the teams page: Cup group tables, the Cup knockout bracket, the play-in
and the playoff bracket. All from NBA.com's schedule (stg_schedule_game), which labels every game
with its Cup group or playoff round and carries seeds and scores.

Before a season's playoffs start, the bracket is "if the season ended today", seeded by NBA.com's
standings (playoff_rank), so it fills in on its own as games are played.
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter

from api.db import records as _rows

router = APIRouter()

db = None  # set by main.py
catalog = None

FINAL = 3  # game_status: 1 scheduled, 2 live, 3 final
ROUNDS = ["First Round", "Conf. Semifinals", "Conf. Finals"]
CUP_ROUNDS = ["Quarterfinal", "Semifinal", "Championship"]


def _names(cur) -> dict[int, str]:
    return dict(cur.execute("SELECT team_id, team_name FROM dim_team").fetchall())


def _side(g: dict, side: str, names: dict[int, str]) -> dict:
    tid = g[f"{side}_team_id"] or None
    return {
        "id": tid,
        "abbr": g[f"{side}_abbr"],
        "name": names.get(tid) if tid else None,
        "seed": g.get(f"{side}_seed") or None,
        "score": g[f"{side}_score"] if g["game_status"] == FINAL else None,
    }


def _game(g: dict, names: dict[int, str]) -> dict:
    return {
        "game_id": g["game_id"],
        "date": g["game_date"],
        "status": g["game_status"],
        "home": _side(g, "home", names),
        "away": _side(g, "away", names),
    }


# ── NBA Cup ─────────────────────────────────────────────────────────────────


def _rank_group(teams: dict[int, dict], games: list[dict]) -> list[dict]:
    """Group order: wins, then head-to-head among the tied teams, then point differential, then
    points scored (NBA's first three tiebreakers; the last ones are rarely needed)."""
    h2h: dict[tuple[int, int], int] = defaultdict(int)  # (winner, loser) → games
    for g in games:
        if g["game_status"] != FINAL:
            continue
        h, a = g["home_team_id"], g["away_team_id"]
        w, l_ = (h, a) if g["home_score"] > g["away_score"] else (a, h)
        h2h[(w, l_)] += 1

    by_wins: dict[int, list[dict]] = defaultdict(list)
    for t in teams.values():
        by_wins[t["w"]].append(t)
    out = []
    for w in sorted(by_wins, reverse=True):
        tied = by_wins[w]
        ids = {t["id"] for t in tied}

        def key(t, ids=ids):
            beat = sum(h2h[(t["id"], o)] for o in ids if o != t["id"])
            lost = sum(h2h[(o, t["id"])] for o in ids if o != t["id"])
            return (-(beat - lost), -t["diff"], -t["pf"], t["abbr"] or "")

        out.extend(sorted(tied, key=key))
    for i, t in enumerate(out):
        t["rank"] = i + 1
    return out


@router.get("/cup")
def cup(season: str | None = None):
    cur = db.cursor()
    seasons = [
        r[0]
        for r in cur.execute(
            "SELECT DISTINCT season FROM stg_schedule_game WHERE cup_stage IS NOT NULL ORDER BY 1 DESC"
        ).fetchall()
    ]
    if not seasons:
        return {"season": None, "seasons": [], "groups": [], "knockout": []}
    season = season if season in seasons else seasons[0]
    names = _names(cur)
    games = _rows(
        cur.execute(
            """SELECT * FROM stg_schedule_game WHERE season = ? AND cup_stage IS NOT NULL
               ORDER BY game_date, tipoff_et, game_id""",
            [season],
        )
    )

    groups: dict[str, dict] = {}
    for g in games:
        if g["cup_stage"] != "Group stage":
            continue
        grp = groups.setdefault(g["cup_group"], {"name": g["cup_group"], "teams": {}, "games": []})
        grp["games"].append(g)
        for side, other in (("home", "away"), ("away", "home")):
            tid = g[f"{side}_team_id"]
            blank = {"id": tid, "abbr": g[f"{side}_abbr"], "name": names.get(tid)}
            t = grp["teams"].setdefault(tid, {**blank, "w": 0, "l": 0, "pf": 0, "pa": 0, "diff": 0})
            if g["game_status"] == FINAL:
                us, them = g[f"{side}_score"], g[f"{other}_score"]
                t["w" if us > them else "l"] += 1
                t["pf"] += us
                t["pa"] += them
                t["diff"] += us - them

    out_groups = []
    for name in sorted(groups):
        grp = groups[name]
        done = all(g["game_status"] == FINAL for g in grp["games"])
        ranked = _rank_group(grp["teams"], grp["games"])
        for t in ranked:
            t["status"] = ("winner" if done else "leader") if t["rank"] == 1 else None
        out_groups.append(
            {
                "name": name,
                "conference": name.split()[0],
                "done": done,
                "teams": ranked,
                "games": [_game(g, names) for g in grp["games"]],
            }
        )

    # wild card: the best second-place team in each conference (same order as within a group)
    for conf in ("East", "West"):
        seconds = [t for grp in out_groups if grp["conference"] == conf for t in grp["teams"] if t["rank"] == 2]
        if seconds:
            best = max(seconds, key=lambda t: (t["w"], t["diff"], t["pf"]))
            all_done = all(grp["done"] for grp in out_groups if grp["conference"] == conf)
            best["status"] = "wildcard" if all_done else "wildcard_lead"

    knockout = []
    for r in CUP_ROUNDS:
        for g in games:
            if g["cup_round"] == r:
                knockout.append({"round": r, **_game(g, names)})
    return {"season": season, "seasons": seasons, "groups": out_groups, "knockout": knockout}


# ── playoffs ────────────────────────────────────────────────────────────────


def _series(gs: list[dict], names: dict[int, str]) -> dict:
    """One playoff series from its games: both teams with seed and wins, the leader first."""
    teams: dict[int, dict] = {}
    for g in gs:
        for side in ("home", "away"):
            tid = g[f"{side}_team_id"]
            blank = {"id": tid, "abbr": g[f"{side}_abbr"], "name": names.get(tid), "seed": None, "wins": 0}
            t = teams.setdefault(tid, blank)
            t["seed"] = t["seed"] or g[f"{side}_seed"] or None
        if g["game_status"] == FINAL:
            win = "home" if g["home_score"] > g["away_score"] else "away"
            teams[g[f"{win}_team_id"]]["wins"] += 1
    a, b = sorted(teams.values(), key=lambda t: t["seed"] or 99)
    need = 4
    winner = a["abbr"] if a["wins"] >= need else b["abbr"] if b["wins"] >= need else None
    return {"top": a, "bottom": b, "winner": winner, "games": len([g for g in gs if g["game_status"] == FINAL])}


def _slot(round_i: int, s: dict) -> int:
    """Where a series sits in its conference's bracket, top to bottom: 1v8, 4v5, 3v6, 2v7."""
    seeds = {s["top"]["seed"], s["bottom"]["seed"]}
    if round_i == 0:
        return next((i for i, pair in enumerate([{1, 8}, {4, 5}, {3, 6}, {2, 7}]) if seeds & pair), 0)
    if round_i == 1:
        return 0 if seeds & {1, 8, 4, 5} else 1
    return 0


def _standings_seeds(cur, season: str, names: dict[int, str]) -> dict[str, list[dict]]:
    rows = _rows(
        cur.execute(
            """SELECT CAST(s.team_id AS bigint) AS id, d.team_abbreviation AS abbr, ts.conference,
                      try_cast(s.playoff_rank AS int) AS seed,
                      try_cast(s.wins AS int) AS w, try_cast(s.losses AS int) AS l
               FROM raw_standings__standings s
               JOIN dim_team d ON d.team_id = CAST(s.team_id AS bigint)
               JOIN stg_team_season ts ON ts.team_id = d.team_id AND ts.season = s._season
               WHERE s._season = ?
               QUALIFY row_number() OVER (PARTITION BY s.team_id ORDER BY s._pulled_at DESC) = 1""",
            [season],
        )
    )
    out: dict[str, list[dict]] = defaultdict(list)
    for r in sorted(rows, key=lambda r: r["seed"] or 99):
        out[r["conference"]].append({**r, "name": names.get(r["id"])})
    return out


@router.get("/playoffs")
def playoffs(season: str | None = None):
    cur = db.cursor()
    current = cur.execute("SELECT max(season) FROM fact_team_game").fetchone()[0]
    had = cur.execute("SELECT DISTINCT season FROM stg_schedule_game WHERE playoff_round IS NOT NULL").fetchall()
    seasons = sorted({current} | {r[0] for r in had}, reverse=True)
    season = season if season in seasons else seasons[0]
    names = _names(cur)
    games = _rows(
        cur.execute(
            """SELECT * FROM stg_schedule_game WHERE season = ? AND playoff_round IS NOT NULL
               ORDER BY game_date, tipoff_et, game_id""",
            [season],
        )
    )
    projected = not any(g["playoff_round"] != "Play-In" for g in games)
    seeds = _standings_seeds(cur, season, names) if projected else {}

    conferences = []
    for conf in ("West", "East"):
        playin = [_game(g, names) for g in games if g["playoff_round"] == "Play-In" and g["playoff_conference"] == conf]
        rounds: list[list[dict | None]] = [[None] * 4, [None] * 2, [None]]
        if projected:
            ranked = {t["seed"]: t for t in seeds.get(conf, []) if t["seed"]}
            for i, (hi, lo) in enumerate([(1, 8), (4, 5), (3, 6), (2, 7)]):
                if hi in ranked and lo in ranked:
                    top, bottom = ({**ranked[x], "wins": 0, "playin": x >= 7} for x in (hi, lo))
                    rounds[0][i] = {"top": top, "bottom": bottom, "winner": None, "games": 0}
            if not playin:
                # the play-in as it would be: 7 v 8 and 9 v 10, seeds from the standings
                for hi, lo in ((7, 8), (9, 10)):
                    if hi in ranked and lo in ranked:
                        home, away = (
                            {"id": ranked[x]["id"], "abbr": ranked[x]["abbr"], "name": ranked[x]["name"], "seed": x}
                            | {"score": None}
                            for x in (hi, lo)
                        )
                        playin.append({"game_id": None, "date": None, "status": 1, "home": home, "away": away})
        else:
            for ri, rname in enumerate(ROUNDS):
                by_pair: dict[frozenset, list[dict]] = defaultdict(list)
                for g in games:
                    if g["playoff_round"] == rname and g["playoff_conference"] == conf:
                        by_pair[frozenset((g["home_team_id"], g["away_team_id"]))].append(g)
                for gs in by_pair.values():
                    s = _series(gs, names)
                    rounds[ri][_slot(ri, s)] = s
        conferences.append({"name": conf, "playin": playin, "rounds": rounds})

    finals_games = [g for g in games if g["playoff_round"] == "Finals"]
    finals = _series(finals_games, names) if finals_games else None
    return {"season": season, "seasons": seasons, "projected": projected, "conferences": conferences, "finals": finals}
