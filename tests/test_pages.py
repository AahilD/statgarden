"""Player, team, search and glossary endpoints, against the published database."""

from fastapi.testclient import TestClient

from api.main import app, db
from api.pages import readable_formula

client = TestClient(app)
JOKIC = 203999


def test_player_page():
    d = client.get(f"/player/{JOKIC}").json()
    assert d["player"]["player_name"] == "Nikola Jokić"
    assert d["player"]["team"] == "DEN"
    reg = {(s["season"], s["season_type"]): s for s in d["seasons"]}
    # 2025-26 regular season: per-game numbers add up from the game logs
    s = reg[("2025-26", "Regular Season")]
    assert s["teams"] == "DEN" and s["gp"] > 60
    assert abs(s["fg_pct"] - s["fgm"] / s["fga"]) < 1e-9
    # career rows are the sum of the season rows
    career = next(c for c in d["career"] if c["season_type"] == "Regular Season")
    assert career["pts"] == sum(x["pts"] for x in d["seasons"] if x["season_type"] == "Regular Season")
    assert len(d["games"]) == 15
    assert d["games"][0]["game_date"] >= d["games"][-1]["game_date"]  # newest first
    assert d["highs"]["pts"]["value"] >= max(g["pts"] for g in d["games"])
    assert {"pts", "reb", "ast", "stl", "blk", "fg3m"} <= set(d["highs"])


def test_traded_player_lists_both_teams():
    # anyone with two teams in one season shows them in the order they played for them
    pid = (
        db.cursor()
        .execute(
            "SELECT player_id FROM fact_player_game WHERE season_type = 'Regular Season' "
            "GROUP BY player_id, season HAVING count(DISTINCT team_id) > 1 LIMIT 1"
        )
        .fetchone()[0]
    )
    seasons = client.get(f"/player/{pid}").json()["seasons"]
    assert any(" / " in s["teams"] for s in seasons)


def test_unknown_player_and_team_are_404():
    assert client.get("/player/1").status_code == 404
    assert client.get("/team/XYZ").status_code == 404


def test_team_page():
    d = client.get("/team/den").json()  # any case
    assert d["team"]["name"] == "Denver Nuggets"
    now = next(s for s in d["seasons"] if s["season"] == d["team"]["season"] and s["season_type"] == "Regular Season")
    assert now["wins"] + now["losses"] == now["gp"]
    assert d["standing"]["record"] == f"{now['wins']}-{now['losses']}"
    assert abs(now["net_rtg"] - (now["off_rtg"] - now["def_rtg"])) < 1e-6
    assert any(p["player"] == "Nikola Jokić" for p in d["roster"])


def test_teams_list():
    teams = client.get("/teams").json()
    assert len(teams) == 30
    assert {t["conference"] for t in teams} == {"East", "West"}
    # standings columns: records and points from our games, conference record and seed from NBA.com
    for key in ("pts", "opp_pts", "net_rtg", "home", "road", "l10", "streak", "conf_record", "playoff_rank"):
        assert key in teams[0]
    assert all(t["wins"] + t["losses"] > 0 for t in teams)


def test_search_finds_teams_by_name_and_players():
    d = client.get("/search?q=nuggets").json()
    assert d["teams"][0]["abbreviation"] == "DEN"
    d = client.get("/search?q=luka").json()
    assert d["players"][0]["name"] == "Luka Dončić"  # the regular ranks above a bench player


def test_glossary():
    d = client.get("/meta/glossary").json()
    ts = next(f for f in d["fields"] if f["id"] == "ts_pct")
    assert ts["formula"] == "PTS / (2 × (FGA + 0.44 × FTA))"
    assert "Players" in ts["datasets"]
    assert not any(f["id"] == "pts_sum_hidden" for f in d["fields"])


def test_readable_formula():
    shorts = {"tov": "TOV", "fga": "FGA", "fta": "FTA"}
    assert readable_formula("tov / nullif(fga + 0.44 * fta + tov, 0)", shorts) == "TOV / (FGA + 0.44 × FTA + TOV)"
    assert readable_formula("tov / nullif(fga, 0)", shorts) == "TOV / FGA"


def test_game_page():
    d = client.get("/game/0022500147").json()  # Mexico City game: neutral site
    assert (d["away"]["abbr"], d["home"]["abbr"]) == ("DAL", "DET")  # home side from the box summary
    assert (d["away"]["pts"], d["home"]["pts"]) == (110, 122)
    assert d["home"]["is_win"] and not d["away"]["is_win"]
    assert d["game"]["label"] == "NBA Mexico City Game" and d["game"]["city"] == "Mexico City"
    for t in (d["away"], d["home"]):
        assert sum(p["pts"] for p in t["periods"]) == t["pts"]  # line score adds up
        assert sum(p["pts"] for p in t["players"]) == t["pts"]  # so does the box score
        assert sum(p["is_starter"] for p in t["players"]) == 5
        assert t["players"][0]["is_starter"]  # starters first
    assert len(d["game"]["officials"]) == 3


def test_overtime_game_has_extra_periods():
    gid = (
        db.cursor()
        .execute("SELECT gameId FROM raw_box_summary__team_periods WHERE periodType = 'OVERTIME' LIMIT 1")
        .fetchone()[0]
    )
    d = client.get(f"/game/{gid}").json()
    assert len(d["home"]["periods"]) > 4 and d["home"]["periods"][-1]["ot"]
    assert sum(p["pts"] for p in d["home"]["periods"]) == d["home"]["pts"]


def test_unknown_game_is_404():
    assert client.get("/game/0099999999").status_code == 404
    assert client.get("/game/abc").status_code == 404


def test_old_abbreviation_finds_the_franchise():
    # any abbreviation that's in the games but not a current team (none until old seasons load)
    old = (
        db.cursor()
        .execute(
            "SELECT DISTINCT team_abbreviation FROM fact_team_game "
            "WHERE team_abbreviation NOT IN (SELECT team_abbreviation FROM dim_team) LIMIT 1"
        )
        .fetchone()
    )
    if old:
        assert client.get(f"/team/{old[0]}").status_code == 200
