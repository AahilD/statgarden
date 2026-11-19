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
    assert fields["usg_pct"]["available"] is False  # V3 advanced box not modelled yet


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
        ({"values": [{"field": "usg_pct"}]}, "isn't available"),
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


def test_values_endpoint_orders_bins():
    vals = client.get("/meta/values", params={"field": "rest_days"}).json()["values"]
    assert vals == ["0 (B2B)", "1", "2", "3+"]
