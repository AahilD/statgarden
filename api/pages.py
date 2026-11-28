"""Player, team and glossary pages: one request per page, shaped for the page.

The Lab goes through /query (any view someone builds). These are fixed views, so each is plain SQL
over the marts, and they grow on their own as the backfill loads older seasons.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException

from api.db import records as _rows

router = APIRouter()

# set by main.py, so this module shares its database and catalog
db = None
catalog = None

# per-game box score columns, summed first so percentages and per-game numbers are right
_TOTALS = """
    count(*) FILTER (WHERE min > 0) AS gp,
    sum(min) AS min, sum(pts) AS pts, sum(reb) AS reb, sum(oreb) AS oreb, sum(dreb) AS dreb,
    sum(ast) AS ast, sum(stl) AS stl, sum(blk) AS blk, sum(tov) AS tov, sum(pf) AS pf,
    sum(fgm) AS fgm, sum(fga) AS fga, sum(fg3m) AS fg3m, sum(fg3a) AS fg3a, sum(ftm) AS ftm, sum(fta) AS fta,
    sum(plus_minus) AS plus_minus
"""
_RATES = """
    fgm / nullif(fga, 0) AS fg_pct, fg3m / nullif(fg3a, 0) AS fg3_pct, ftm / nullif(fta, 0) AS ft_pct,
    pts / nullif(2 * (fga + 0.44 * fta), 0) AS ts_pct
"""


# every game plus a second copy of each NBA Cup game typed "NBA Cup", so season tables can
# show Cup games as their own season type next to the regular season they also count toward
_WITH_CUP = """(SELECT * FROM {t} UNION ALL
               SELECT * REPLACE ('NBA Cup' AS season_type) FROM {t} WHERE cup_stage IS NOT NULL)"""
_PLAYER_GAMES = _WITH_CUP.format(t="fact_player_game")
_TEAM_GAMES = _WITH_CUP.format(t="fact_team_game")
_ORDER_TYPES = "CASE season_type WHEN 'Playoffs' THEN 0 WHEN 'Play-In' THEN 1 WHEN 'NBA Cup' THEN 2 ELSE 3 END"


# ── players ─────────────────────────────────────────────────────────────────


@router.get("/player/{player_id}")
def player(player_id: int):
    cur = db.cursor()
    bio = _rows(
        cur.execute(
            """
            WITH g AS (
              SELECT player_name, arg_max(team_abbreviation, game_date) AS team, arg_max(team_id, game_date) AS team_id,
                     min(game_date) AS first_game, max(game_date) AS last_game, min(season) AS first_season,
                     max(season) AS last_season
              FROM fact_player_game WHERE player_id = ? GROUP BY player_name
              ORDER BY last_game DESC LIMIT 1)
            SELECT g.*, b.age, b.height_in, b.weight_lb, b.position, b.country, nullif(b.college, 'None') AS college,
                   b.draft_year, b.draft_round, b.draft_number,
                   (SELECT team_name FROM dim_team WHERE team_id = g.team_id) AS team_name
            FROM g LEFT JOIN (
              SELECT * FROM stg_player_season_bio WHERE player_id = ? ORDER BY season DESC LIMIT 1) b ON true""",
            [player_id, player_id],
        )
    )
    if not bio:
        raise HTTPException(404, "no player with that id")

    # one row per season and season type; traded players list their teams in the order they played for them
    seasons = _rows(
        cur.execute(
            f"""
            WITH by_team AS (
              SELECT season, season_type, team_abbreviation, min(game_date) AS first FROM {_PLAYER_GAMES}
              WHERE player_id = ? GROUP BY ALL),
            teams AS (
              SELECT season, season_type, string_agg(team_abbreviation, ' / ' ORDER BY first) AS teams
              FROM by_team GROUP BY ALL),
            t AS (SELECT season, season_type, {_TOTALS} FROM {_PLAYER_GAMES} WHERE player_id = ? GROUP BY ALL)
            SELECT t.*, teams.teams, {_RATES} FROM t JOIN teams USING (season, season_type)
            ORDER BY season DESC, {_ORDER_TYPES}""",
            [player_id, player_id],
        )
    )
    career = _rows(
        cur.execute(
            f"""
            WITH t AS (SELECT season_type, {_TOTALS} FROM {_PLAYER_GAMES} WHERE player_id = ? GROUP BY ALL)
            SELECT *, {_RATES} FROM t ORDER BY season_type DESC""",
            [player_id],
        )
    )
    games = _rows(
        cur.execute(
            """
            SELECT game_id, game_date, season, season_type, cup_stage, team_abbreviation AS team,
                   opp_abbreviation AS opp, is_home, is_win, margin, min, pts, reb, ast, stl, blk, tov,
                   fgm, fga, fg3m, fg3a, ftm, fta, plus_minus
            FROM fact_player_game WHERE player_id = ? ORDER BY game_date DESC LIMIT 15""",
            [player_id],
        )
    )
    # best games for the headline numbers, with where and when
    highs = {}
    for stat in ("pts", "reb", "ast", "stl", "blk", "fg3m"):
        h = _rows(
            cur.execute(
                f"""
                SELECT {stat} AS value, game_id, game_date, opp_abbreviation AS opp, is_home, season_type
                FROM fact_player_game WHERE player_id = ? ORDER BY {stat} DESC NULLS LAST, game_date DESC LIMIT 1""",
                [player_id],
            )
        )
        highs[stat] = h[0] if h else None
    return {"player": {"id": player_id, **bio[0]}, "seasons": seasons, "career": career, "games": games, "highs": highs}


# ── teams ───────────────────────────────────────────────────────────────────


@router.get("/team/{abbr}")
def team(abbr: str):
    cur = db.cursor()
    found = cur.execute(
        "SELECT team_id, team_abbreviation, team_name FROM dim_team WHERE upper(team_abbreviation) = upper(?)", [abbr]
    ).fetchone()
    if not found:
        # an old abbreviation (SEA, NJN…) from a Lab table: the franchise it played as, now
        found = cur.execute(
            """
            SELECT d.team_id, d.team_abbreviation, d.team_name FROM dim_team d
            WHERE d.team_id = (SELECT team_id FROM fact_team_game WHERE upper(team_abbreviation) = upper(?)
                               ORDER BY game_date DESC LIMIT 1)""",
            [abbr],
        ).fetchone()
    if not found:
        raise HTTPException(404, "no team with that abbreviation")
    team_id, abbr, name = found
    current = cur.execute("SELECT max(season) FROM fact_team_game WHERE team_id = ?", [team_id]).fetchone()[0]

    info = _rows(
        cur.execute(
            "SELECT conference, division FROM stg_team_season WHERE team_id = ? ORDER BY season DESC LIMIT 1", [team_id]
        )
    )
    standing = _rows(
        cur.execute(
            """
            SELECT conference, playoff_rank, division, division_rank, record, home, road, l10,
                   str_current_streak AS streak
            FROM raw_standings__standings WHERE team_id = ? AND _season = ? LIMIT 1""",
            [str(team_id), current],
        )
    )
    # rating per 100 possessions from season sums, not an average of game ratings
    seasons = _rows(
        cur.execute(
            f"""
            SELECT season, season_type, any_value(team_abbreviation) AS team, count(*) AS gp,
                   count(*) FILTER (WHERE is_win) AS wins, count(*) FILTER (WHERE NOT is_win) AS losses,
                   avg(pts) AS pts, avg(opp_pts) AS opp_pts,
                   100 * sum(pts) / nullif(sum(poss), 0) AS off_rtg,
                   100 * sum(opp_pts) / nullif(sum(opp_poss), 0) AS def_rtg,
                   100 * (sum(pts) / nullif(sum(poss), 0) - sum(opp_pts) / nullif(sum(opp_poss), 0)) AS net_rtg,
                   avg(pace) AS pace, sum(fg3a) / nullif(sum(fga), 0) AS fg3a_rate,
                   sum(pts) / nullif(2 * (sum(fga) + 0.44 * sum(fta)), 0) AS ts_pct
            FROM {_TEAM_GAMES} WHERE team_id = ? GROUP BY season, season_type
            ORDER BY season DESC, {_ORDER_TYPES}""",
            [team_id],
        )
    )
    roster = _rows(
        cur.execute(
            f"""
            WITH t AS (
              SELECT player_id, any_value(player_name) AS player, max(game_date) AS last_game, {_TOTALS}
              FROM fact_player_game WHERE team_id = ? AND season = ? AND season_type = 'Regular Season'
              GROUP BY player_id)
            SELECT t.*, {_RATES}, b.position, b.age,
                   (SELECT team_id FROM fact_player_game p WHERE p.player_id = t.player_id
                    ORDER BY game_date DESC LIMIT 1) = ? AS still_here
            FROM t LEFT JOIN stg_player_season_bio b ON b.player_id = t.player_id AND b.season = ?
            ORDER BY min DESC""",
            [team_id, current, team_id, current],
        )
    )
    games = _rows(
        cur.execute(
            """
            SELECT game_id, game_date, season_type, cup_stage, opp_abbreviation AS opp, is_home, is_win, pts, opp_pts
            FROM fact_team_game WHERE team_id = ? ORDER BY game_date DESC LIMIT 12""",
            [team_id],
        )
    )
    return {
        "team": {"id": team_id, "abbr": abbr, "name": name, "season": current, **(info[0] if info else {})},
        "standing": standing[0] if standing else None,
        "seasons": seasons,
        "roster": roster,
        "games": games,
    }


@router.get("/teams")
def teams_list():
    """Every current team with this season's regular-season standing, for the teams index.

    Wins, losses and points come from our game logs (stats.nba.com wins every disagreement);
    home/road, last 10, streak and conference record come from NBA.com's standings.
    """
    cur = db.cursor()
    return _rows(
        cur.execute(
            """
            WITH cur AS (SELECT max(season) AS s FROM fact_team_game),
            g AS (
              SELECT team_id, count(*) FILTER (WHERE is_win) AS wins, count(*) FILTER (WHERE NOT is_win) AS losses,
                     avg(pts) AS pts, avg(opp_pts) AS opp_pts,
                     100 * (sum(pts) / nullif(sum(poss), 0) - sum(opp_pts) / nullif(sum(opp_poss), 0)) AS net_rtg
              FROM fact_team_game WHERE season = (SELECT s FROM cur) AND season_type = 'Regular Season'
              GROUP BY team_id),
            st AS (
              SELECT CAST(team_id AS bigint) AS team_id, home, road, l10, trim(str_current_streak) AS streak,
                     trim(conference_record) AS conf_record, try_cast(playoff_rank AS int) AS playoff_rank
              FROM raw_standings__standings WHERE _season = (SELECT s FROM cur)
              QUALIFY row_number() OVER (PARTITION BY team_id ORDER BY _pulled_at DESC) = 1)
            SELECT d.team_id AS id, d.team_abbreviation AS abbr, d.team_name AS name, ts.conference, ts.division,
                   coalesce(g.wins, 0) AS wins, coalesce(g.losses, 0) AS losses, g.pts, g.opp_pts, g.net_rtg,
                   st.home, st.road, st.l10, st.streak, st.conf_record, st.playoff_rank
            FROM dim_team d
            LEFT JOIN (SELECT * FROM stg_team_season WHERE season = (SELECT s FROM cur)) ts USING (team_id)
            LEFT JOIN g USING (team_id)
            LEFT JOIN st USING (team_id)
            ORDER BY ts.conference, ts.division, wins DESC, d.team_name"""
        )
    )


# ── games ───────────────────────────────────────────────────────────────────


@router.get("/game/{game_id}")
def game(game_id: str):
    """One game: header, line score, team totals and both box scores.

    Home and away come from the box summary, not the game log's "vs.": they disagree for
    neutral-site games (Mexico City, the NBA Cup in Las Vegas). See recon_team_score.sql.
    """
    if not re.fullmatch(r"\d{10}", game_id):
        raise HTTPException(404, "no game with that id")
    cur = db.cursor()
    teams = _rows(
        cur.execute(
            """
            WITH s AS (SELECT CAST(teamId AS bigint) AS team_id, side FROM raw_box_summary__team WHERE gameId = ?)
            SELECT t.team_id, t.team_abbreviation AS abbr, d.team_name AS name,
                   coalesce(s.side = 'home', t.is_home) AS is_home, t.is_win, t.pts, t.season, t.season_type,
                   t.game_date, t.fgm, t.fga, t.fg3m, t.fg3a, t.ftm, t.fta, t.oreb, t.dreb, t.reb, t.ast, t.stl,
                   t.blk, t.tov, t.pf, t.poss, t.pace, t.off_rtg, t.pts_paint, t.pts_fast_break, t.pts_2nd_chance,
                   t.pts_off_tov,
                   t.pts / nullif(2 * (t.fga + 0.44 * t.fta), 0) AS ts_pct
            FROM fact_team_game t LEFT JOIN s USING (team_id) LEFT JOIN dim_team d USING (team_id)
            WHERE t.game_id = ? ORDER BY is_home""",  # away first, the usual way to write a score
            [game_id, game_id],
        )
    )
    if len(teams) != 2:
        raise HTTPException(404, "no game with that id")

    info = _rows(
        cur.execute(
            """
            SELECT gameEt AS tipoff, duration, try_cast(attendance AS int) AS attendance, sellout = '1' AS sellout,
                   nullif(gameLabel, '') AS label, nullif(gameSubLabel, '') AS sub_label,
                   nullif(seriesText, '') AS series, arena_arenaName AS arena, arena_arenaCity AS city,
                   nullif(arena_arenaState, '') AS state
            FROM raw_box_summary__game WHERE gameId = ?""",
            [game_id],
        )
    )
    periods = _rows(
        cur.execute(
            """
            SELECT CAST(teamId AS bigint) AS team_id, CAST(period AS int) AS period, periodType = 'OVERTIME' AS ot,
                   CAST(score AS int) AS pts
            FROM raw_box_summary__team_periods WHERE gameId = ? ORDER BY period""",
            [game_id],
        )
    )
    players = _rows(
        cur.execute(
            """
            SELECT team_id, player_id, player_name AS player, is_starter, start_position AS pos,
                   min, pts, reb, oreb, dreb, ast, stl, blk, tov, pf, fgm, fga, fg3m, fg3a, ftm, fta, plus_minus
            FROM fact_player_game WHERE game_id = ?
            ORDER BY is_starter DESC, min DESC, pts DESC""",
            [game_id],
        )
    )
    inactive = _rows(
        cur.execute(
            """
            SELECT CAST(teamId AS bigint) AS team_id, firstName || ' ' || familyName AS player
            FROM raw_box_summary__team_inactives WHERE gameId = ? ORDER BY familyName""",
            [game_id],
        )
    )
    officials = [
        r[0]
        for r in cur.execute(
            "SELECT name FROM raw_box_summary__officials WHERE gameId = ? ORDER BY CAST(jerseyNum AS int)", [game_id]
        ).fetchall()
    ]
    for t in teams:
        t["periods"] = [{k: p[k] for k in ("period", "ot", "pts")} for p in periods if p["team_id"] == t["team_id"]]
        t["players"] = [p for p in players if p["team_id"] == t["team_id"]]
        t["inactive"] = [p["player"] for p in inactive if p["team_id"] == t["team_id"]]
    first = teams[0]
    return {
        "game": {
            "id": game_id,
            "date": first["game_date"],
            "season": first["season"],
            "season_type": first["season_type"],
            **(info[0] if info else {}),
            "officials": officials,
        },
        "away": teams[0],
        "home": teams[1],
    }


# ── glossary ────────────────────────────────────────────────────────────────


def _strip_nullif(s: str) -> str:
    """nullif(x, 0) → (x), with nested brackets handled."""
    out, i = "", 0
    while (j := s.find("nullif(", i)) != -1:
        out += s[i:j]
        depth, k = 1, j + len("nullif(")
        while depth and k < len(s):
            depth += {"(": 1, ")": -1}.get(s[k], 0)
            k += 1
        inner = s[j + len("nullif(") : k - 1]
        inner = re.sub(r",\s*0\s*$", "", inner)
        out += f"({inner})"
        i = k
    return out + s[i:]


def readable_formula(formula: str, shorts: dict[str, str]) -> str:
    """'tov / nullif(fga + 0.44 * fta + tov, 0)' → 'TOV / (FGA + 0.44 × FTA + TOV)'."""
    f = _strip_nullif(formula)
    f = re.sub(r"\(\s*([a-z_][a-z0-9_]*)\s*\)", r"\1", f)  # (fga) → fga
    f = re.sub(r"\b[a-z_][a-z0-9_]*\b", lambda m: shorts.get(m[0], m[0]), f)
    f = f.replace("*", "×")
    return re.sub(r"\s+", " ", f).strip()


@router.get("/meta/glossary")
def glossary():
    db.cursor()  # make sure availability is current
    shorts = {f.id: f.short for f in catalog.fields}
    labels = {d.id: d.label for d in catalog.datasets}
    out = []
    for f in catalog.fields:
        if f.hidden:
            continue
        out.append(
            {
                "id": f.id,
                "label": f.label,
                "short": f.short,
                "group": f.group,
                "kind": f.kind,
                "description": f.description,
                "formula": readable_formula(f.formula, shorts) if f.formula else None,
                "format": f.format,
                "higher_is_better": f.higher_is_better,
                "datasets": [labels[d] for d in sorted(f.available_in) if d in labels],
                "available": f.available,
            }
        )
    return {"groups": catalog.groups, "fields": out}
