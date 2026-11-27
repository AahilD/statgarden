"""API tests against the published database (data/serve/statgarden.duckdb).

Run with `make test`. Needs `make publish-local` first.
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app, catalog
from api.spec import PivotSpec
from api.sql import SpecError, build

client = TestClient(app)

REG_2526 = [
    {"field": "season", "op": "in", "value": ["2025-26"]},
    {"field": "season_type", "op": "=", "value": "Regular Season"},
]


def q(**spec):
    r = client.post("/query", json=spec)
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    assert client.get("/health").json()["ok"] is True


def test_fields_lists_availability():
    fields = {f["id"]: f for f in client.get("/meta/fields").json()["fields"]}
    assert fields["pts"]["available"] is True
    assert fields["usg_pct"]["available"] is True


def test_known_answer_jokic_home_away():
    """Same numbers as the hand-written Phase 0 query."""
    res = q(
        filters=REG_2526 + [{"field": "team", "op": "=", "value": "DEN"}],
        rows=["player"],
        columns=["venue"],
        values=[{"field": "pts", "mode": "per_game"}, {"field": "ts_pct"}],
        limit=3,
    )
    jokic = {r["d_venue"]: r for r in res["rows"] if r["d_player"] == "Nikola Jokić"}
    assert round(jokic["Home"]["pts:per_game"], 1) == 27.6
    assert round(jokic["Away"]["pts:per_game"], 1) == 27.8
    assert round(jokic["Home"]["ts_pct:total"], 3) == 0.663
    assert {r["d_player"] for r in res["rows"]} <= {"Nikola Jokić", "Jamal Murray", "Aaron Gordon"}


def test_ratio_is_computed_after_grouping():
    """League FG% must equal total makes / total attempts, not an average of per-game %."""
    res = q(
        filters=REG_2526,
        values=[{"field": "fg_pct"}, {"field": "fgm", "mode": "total"}, {"field": "fga", "mode": "total"}],
    )
    row = res["rows"][0]
    assert row["fg_pct:total"] == pytest.approx(row["fgm:total"] / row["fga:total"])


def test_limit_applies_to_row_groups_not_cells():
    res = q(filters=REG_2526, rows=["team"], columns=["venue"], values=[{"field": "pts"}], limit=4)
    assert len({r["d_team"] for r in res["rows"]}) == 4
    assert len(res["rows"]) == 8


def test_measure_filter_is_per_game():
    res = q(
        filters=REG_2526 + [{"field": "min", "op": ">=", "value": 30}],
        values=[{"field": "games"}, {"field": "min", "mode": "per_game"}],
    )
    assert res["rows"][0]["min:per_game"] >= 30


def test_values_are_bound_not_pasted():
    evil = "DEN' OR 1=1 --"
    res = q(filters=REG_2526 + [{"field": "team", "op": "=", "value": evil}], values=[{"field": "games"}])
    assert res["rows"][0]["games:total"] == 0
    spec = PivotSpec(filters=[{"field": "team", "op": "=", "value": evil}], values=[{"field": "games"}])
    built = build(spec, catalog)
    assert evil not in built.sql and evil in built.params


@pytest.mark.parametrize(
    "bad, msg",
    [
        ({"rows": ["not_a_field"], "values": [{"field": "pts"}]}, "unknown field"),
        ({"rows": ["pts"], "values": [{"field": "pts"}]}, "is a measure"),
        ({"values": [{"field": "opp_pts"}]}, "isn't in Player games"),
        ({"values": [{"field": "fg_pct", "mode": "per_game"}]}, "can't be shown"),
        ({"rows": [], "values": []}, "at least one value"),
    ],
)
def test_bad_specs_are_refused(bad, msg):
    with pytest.raises(SpecError, match=msg):
        build(PivotSpec(**bad), catalog)


def test_search_ignores_accents():
    names = [p["name"] for p in client.get("/search", params={"q": "jokic"}).json()["players"]]
    assert "Nikola Jokić" in names


@pytest.mark.parametrize("typed", ["jokic", "Jokić", "JOKIĆ"])
def test_filter_values_match_with_or_without_accents(typed):
    vals = client.get("/meta/values", params={"field": "player", "q": typed}).json()["values"]
    assert "Nikola Jokić" in vals


def test_chart_settings_dont_change_the_cache_key():
    base = dict(filters=REG_2526, rows=["team"], values=[{"field": "pts"}], limit=3)
    first = client.post("/query", json={**base, "chart": {"view": "table"}}).json()
    second = client.post("/query", json={**base, "chart": {"view": "both", "x": "team"}}).json()
    assert second["cached"] is True and second["rows"] == first["rows"]


@pytest.mark.parametrize(("sent", "kept"), [(None, "auto"), ("table", "auto"), ("nonsense", "auto"), ("line", "line")])
def test_old_or_unknown_chart_types_fall_back_to_auto(sent, kept):
    chart = {} if sent is None else {"type": sent}
    assert PivotSpec(values=[{"field": "pts"}], chart=chart).chart.type == kept


def test_values_endpoint_orders_bins():
    vals = client.get("/meta/values", params={"field": "rest_days"}).json()["values"]
    assert vals == ["0 (B2B)", "1", "2", "3+"]


# ── datasets ────────────────────────────────────────────────────────────────


def test_each_dataset_lists_only_its_fields():
    team = {f["id"] for f in client.get("/meta/fields", params={"dataset": "team_game"}).json()["fields"]}
    shots = {f["id"] for f in client.get("/meta/fields", params={"dataset": "shots"}).json()["fields"]}
    assert {"opp_pts", "off_rtg", "team"} <= team and "player" not in team and "usg_pct" not in team
    assert {"shot_zone", "fg_pct", "player"} <= shots and "games" not in shots and "opp_pts" not in shots


def test_team_offensive_rating_matches_points_per_possession():
    res = q(
        dataset="team_game",
        filters=REG_2526,
        rows=["team"],
        values=[{"field": "off_rtg"}, {"field": "pts", "mode": "total"}, {"field": "poss", "mode": "total"}],
        limit=5,
    )
    for r in res["rows"]:
        assert r["off_rtg:total"] == pytest.approx(100 * r["pts:total"] / r["poss:total"], rel=1e-3)


def test_shots_add_up_to_the_game_log():
    shots = q(dataset="shots", filters=REG_2526, values=[{"field": "fga"}, {"field": "fgm"}])["rows"][0]
    totals = [{"field": "fga", "mode": "total"}, {"field": "fgm", "mode": "total"}]
    games = q(filters=REG_2526, values=totals)["rows"][0]
    # NBA.com's shot chart and game log differ by a shot or two a season
    assert shots["fga:total"] == pytest.approx(games["fga:total"], abs=5)
    assert shots["fgm:total"] == pytest.approx(games["fgm:total"], abs=5)


def test_per_100_possessions():
    res = q(
        filters=REG_2526,
        values=[
            {"field": "pts", "mode": "per_100"},
            {"field": "pts", "mode": "total"},
            {"field": "poss", "mode": "total"},
        ],
    )
    r = res["rows"][0]
    assert r["pts:per_100"] == pytest.approx(100 * r["pts:total"] / r["poss:total"])


# ── calculated stats ────────────────────────────────────────────────────────

PPM = {"id": "calc_ppm", "label": "Points per minute", "formula": "pts / min", "format": "precise"}


def test_calc_is_worked_out_over_the_group():
    res = q(
        filters=REG_2526 + [{"field": "player", "op": "in", "value": ["Nikola Jokić"]}],
        rows=["player"],
        calcs=[PPM],
        values=[{"field": "calc_ppm"}, {"field": "pts", "mode": "total"}, {"field": "min", "mode": "total"}],
    )
    r = res["rows"][0]
    assert r["calc_ppm:total"] == pytest.approx(r["pts:total"] / r["min:total"])
    assert res["values"][0] == {**res["values"][0], "label": "Points per minute", "format": ".3f", "agg": "calc"}


def test_calc_can_sort_and_use_ratio_fields():
    calc = {"id": "calc_x", "label": "TS minus league", "formula": "(ts_pct - 0.58) * 100"}
    res = q(
        filters=REG_2526 + [{"field": "min", "op": ">=", "value": 30}],
        rows=["player"],
        calcs=[calc],
        values=[{"field": "calc_x"}, {"field": "ts_pct"}],
        sort=[{"by": "calc_x:total", "dir": "desc"}],
        limit=5,
    )
    xs = [r["calc_x:total"] for r in res["rows"]]
    assert xs == sorted(xs, reverse=True)
    for r in res["rows"]:
        assert r["calc_x:total"] == pytest.approx((r["ts_pct:total"] - 0.58) * 100)


def test_calc_divides_by_zero_quietly():
    calc = {"id": "calc_z", "label": "Zero", "formula": "pts / (min - min)"}
    assert q(filters=REG_2526, calcs=[calc], values=[{"field": "calc_z"}])["rows"][0]["calc_z:total"] is None


def test_per_game_filter_on_a_calc():
    res = q(
        filters=REG_2526 + [{"field": "calc_ppm", "op": ">=", "value": 1.5}, {"field": "min", "op": ">=", "value": 10}],
        calcs=[PPM],
        values=[{"field": "games"}, {"field": "pts", "mode": "total"}, {"field": "min", "mode": "total"}],
    )
    r = res["rows"][0]
    assert r["games:total"] > 0 and r["pts:total"] / r["min:total"] >= 1.5


@pytest.mark.parametrize("columns", [[], ["venue"]])
def test_group_filter_keeps_rows_on_their_totals(columns):
    res = q(
        filters=REG_2526 + [{"field": "min", "op": ">=", "value": 2000, "scope": "group", "mode": "total"}],
        rows=["player"],
        columns=columns,
        values=[{"field": "min", "mode": "total"}],
        limit=1000,
    )
    totals: dict = {}
    for r in res["rows"]:
        totals[r["d_player"]] = totals.get(r["d_player"], 0) + r["min:total"]
    assert totals and min(totals.values()) >= 2000


def test_group_filter_on_a_calc():
    res = q(
        filters=REG_2526 + [{"field": "calc_ppm", "op": ">=", "value": 0.8, "scope": "group"}],
        rows=["player"],
        calcs=[PPM],
        values=[{"field": "calc_ppm"}],
        limit=1000,
    )
    assert res["rows"] and all(r["calc_ppm:total"] >= 0.8 for r in res["rows"])


@pytest.mark.parametrize(
    "formula, msg",
    [
        ("pts / ", "ends too soon"),
        ("pts; drop table x", "isn't allowed"),
        ("pts / nope", "no field called"),
        ("player / min", "grouping field"),
        ("(pts / min", "isn't closed"),
        ("opp_pts / min", "isn't in Player games"),
        ("", "Type a formula"),
    ],
)
def test_bad_formulas_say_whats_wrong(formula, msg):
    body = client.post("/calc/check", json={"formula": formula}).json()
    assert body["ok"] is False and msg in body["error"]


def test_good_formula_lists_its_fields():
    body = client.post("/calc/check", json={"formula": "(PTS + ast) / min"}).json()
    assert body["ok"] and [f["id"] for f in body["fields"]] == ["pts", "ast", "min"]


def test_unused_calc_that_doesnt_fit_the_dataset_is_ignored():
    res = q(dataset="shots", filters=REG_2526, calcs=[PPM], values=[{"field": "fga"}])
    assert res["rows"][0]["fga:total"] > 0


# ── season, lineup, play type and matchup datasets ─────────────────────────


def test_player_season_games_come_from_gp():
    """Season rows stand for many games: GP and per-game values use the gp column."""
    game = q(
        dataset="player_game",
        filters=REG_2526 + [{"field": "player", "op": "=", "value": "Shai Gilgeous-Alexander"}],
        rows=["player"],
        values=[{"field": "games"}, {"field": "pts", "mode": "per_game"}],
    )
    season = q(
        dataset="player_season",
        filters=REG_2526 + [{"field": "player", "op": "=", "value": "Shai Gilgeous-Alexander"}],
        rows=["player"],
        values=[{"field": "games"}, {"field": "pts", "mode": "per_game"}],
    )
    g, s = game["rows"][0], season["rows"][0]
    assert s["games:total"] == g["games:total"]
    assert s["pts:per_game"] == pytest.approx(g["pts:per_game"])


def test_season_tracking_ratio():
    res = q(
        dataset="player_season",
        filters=REG_2526,
        values=[
            {"field": "pts_per_drive"},
            {"field": "drive_pts", "mode": "total"},
            {"field": "drives", "mode": "total"},
        ],
    )
    row = res["rows"][0]
    assert row["pts_per_drive:total"] == pytest.approx(row["drive_pts:total"] / row["drives:total"])
    assert 0.5 < row["pts_per_drive:total"] < 1.5


def test_play_type_points_per_possession_and_per_100():
    res = q(
        dataset="play_types",
        filters=REG_2526 + [{"field": "side", "op": "in", "value": ["Offense"]}],
        rows=["play_type"],
        values=[{"field": "ppp"}, {"field": "pts", "mode": "per_100"}],
    )
    assert len(res["rows"]) == 11
    for r in res["rows"]:
        assert r["pts:per_100"] == pytest.approx(100 * r["ppp:total"])


def test_lineups_have_ratings_and_sizes():
    res = q(
        dataset="lineups",
        filters=REG_2526,
        rows=["lineup_size"],
        values=[{"field": "min", "mode": "total"}, {"field": "net_rtg"}],
    )
    # NBA.com lineups are pulled as 2-man and 5-man groups
    assert {r["d_lineup_size"] for r in res["rows"]} == {"2-man", "5-man"}
    assert all(r["net_rtg:total"] is not None for r in res["rows"])


def test_matchups_add_up_to_the_box_score():
    """Points allowed per defender match the player game box score's matchup columns."""
    by_game = q(dataset="player_game", filters=REG_2526, values=[{"field": "matchup_pts", "mode": "total"}])
    by_matchup = q(dataset="matchups", filters=REG_2526, values=[{"field": "matchup_pts", "mode": "total"}])
    assert by_matchup["rows"][0]["matchup_pts:total"] == pytest.approx(
        by_game["rows"][0]["matchup_pts:total"], rel=0.002
    )


def test_matchups_group_by_player_guarded():
    res = q(
        dataset="matchups",
        filters=REG_2526,
        rows=["attacker"],
        values=[{"field": "matchup_poss", "mode": "total"}],
        limit=5,
    )
    assert res["rows"][0]["d_attacker"]
    assert client.post("/query", json={"dataset": "matchups", "values": [{"field": "games"}]}).status_code == 400


def test_clutch_fields():
    res = q(
        filters=REG_2526,
        rows=["had_clutch"],
        values=[{"field": "clutch_pts", "mode": "total"}, {"field": "clutch_fg_pct"}],
    )
    rows = {r["d_had_clutch"]: r for r in res["rows"]}
    assert rows["No clutch time"]["clutch_pts:total"] == 0
    assert rows["Clutch game"]["clutch_pts:total"] > 5000


def test_seasons_endpoint_for_season_datasets():
    for ds in ["player_season", "lineups", "play_types", "matchups"]:
        r = client.get(f"/meta/seasons?dataset={ds}")
        assert r.status_code == 200 and r.json(), ds


def test_shading_choices_round_trip_and_dont_change_the_query():
    base = {"filters": REG_2526, "rows": ["player"], "values": [{"field": "pts", "mode": "per_game"}], "limit": 5}
    shaded = {**base, "shade": "split", "values": [{"field": "pts", "mode": "per_game", "better": "lower"}]}
    a, b = q(**base), q(**shaded)
    assert a["rows"] == b["rows"]
    spec = PivotSpec(**shaded)
    assert spec.shade == "split" and spec.values[0].better == "lower"
    assert PivotSpec(shade="sideways").shade == "rank"
