"""NBA Cup and playoff views, against the published database."""

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_cup_groups_and_knockouts():
    d = client.get("/cup?season=2025-26").json()
    assert d["season"] == "2025-26"
    assert len(d["groups"]) == 6
    for g in d["groups"]:
        assert len(g["teams"]) == 5
        assert len(g["games"]) == 10  # everyone plays the other four once
        assert [t["rank"] for t in g["teams"]] == [1, 2, 3, 4, 5]
        assert sum(t["w"] for t in g["teams"]) == sum(t["l"] for t in g["teams"])
    # six group winners and two wild cards make the eight quarterfinalists
    statuses = [t["status"] for g in d["groups"] for t in g["teams"] if t["status"]]
    assert statuses.count("winner") == 6 and statuses.count("wildcard") == 2
    assert [k["round"] for k in d["knockout"]] == ["Quarterfinal"] * 4 + ["Semifinal"] * 2 + ["Championship"]


def test_finished_playoffs_bracket():
    d = client.get("/playoffs?season=2025-26").json()
    assert not d["projected"]
    for c in d["conferences"]:
        first, semis, finals = c["rounds"]
        assert all(s and s["winner"] for s in first + semis + finals)
        # 1v8, 4v5, 3v6, 2v7 from the top
        assert [{s["top"]["seed"], s["bottom"]["seed"]} for s in first] == [{1, 8}, {4, 5}, {3, 6}, {2, 7}]
        assert len(c["playin"]) == 3
    assert d["finals"]["winner"]


def test_current_season_bracket_is_projected_before_the_playoffs():
    d = client.get("/playoffs").json()
    if d["projected"]:
        for c in d["conferences"]:
            assert all(s is None for s in c["rounds"][1] + c["rounds"][2])
            assert {s["top"]["seed"] for s in c["rounds"][0] if s} <= {1, 2, 3, 4}


def test_player_page_has_cup_rows():
    d = client.get("/player/1628983").json()
    cup = [s for s in d["seasons"] if s["season_type"] == "NBA Cup"]
    reg = {s["season"]: s for s in d["seasons"] if s["season_type"] == "Regular Season"}
    assert cup
    for s in cup:
        assert s["gp"] <= reg[s["season"]]["gp"]  # Cup games are a slice of the regular season
