"""Shot map hexes: the Lab's court chart and the player page."""

import math

from fastapi.testclient import TestClient

from api.court import HEX
from api.main import app, db

client = TestClient(app)
JOKIC = 203999
SEASON = [{"field": "season", "op": "in", "value": ["2025-26"]}]


def test_player_shots_add_up():
    d = client.get(f"/player/{JOKIC}/shots?season=2025-26").json()
    (c,) = d["courts"]
    n, made = (
        db.cursor()
        .execute(
            "SELECT count(*), sum(fgm) FROM fact_shot WHERE player_id = ? AND season = '2025-26' "
            "AND season_type = 'Regular Season' AND loc_y <= 422",
            [JOKIC],
        )
        .fetchone()
    )
    assert c["fga"] == n == sum(h[2] for h in c["hexes"])
    assert c["fgm"] == made
    assert len({(h[0], h[1]) for h in c["hexes"]}) == len(c["hexes"])  # one entry per hex
    # the busiest hex is at the rim, and it's (0, 0)
    q, r, *_ = max(c["hexes"], key=lambda h: h[2])
    assert (q, r) == (0, 0)


def test_hexes_hold_their_shots():
    # every shot's spot is within one hex radius of the centre of the hex it was counted in
    rows = (
        db.cursor()
        .execute("SELECT loc_x, loc_y FROM fact_shot WHERE player_id = ? AND season = '2025-26' LIMIT 300", [JOKIC])
        .fetchall()
    )
    from api import court

    cur = db.cursor()
    for x, y in rows[:50]:
        q, r = cur.execute(f"WITH f AS (SELECT {x} AS x, {y} AS y), {court._hexed('f')} SELECT q, r FROM hx").fetchone()
        cx, cy = HEX * math.sqrt(3) * (q + r / 2), HEX * 1.5 * r
        assert math.hypot(x - cx, y - cy) <= HEX + 1e-6


def test_lab_court_splits_by_first_row_field():
    spec = {
        "dataset": "shots",
        "rows": ["player"],
        "values": [{"field": "fga"}],
        "filters": SEASON + [{"field": "player", "op": "in", "value": ["Stephen Curry", "Nikola Jokić"]}],
    }
    d = client.post("/court", json=spec).json()
    assert {c["label"] for c in d["courts"]} == {"Stephen Curry", "Nikola Jokić"}
    assert d["courts"][0]["fga"] >= d["courts"][1]["fga"]  # most shots first
    # the league comparison keeps the season but not the player filter
    assert d["league"]["fga"] > 100_000


def test_court_needs_the_shot_dataset():
    r = client.post("/court", json={"dataset": "player_game", "values": [{"field": "pts"}]})
    assert r.status_code == 400
