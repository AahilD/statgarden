"""Reads ingest/endpoints.yaml and expands it into individual calls (tasks)."""

from __future__ import annotations

import itertools
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from ingest.paths import DATA, RAW_DIR

REGISTRY = Path(__file__).resolve().parent / "endpoints.yaml"
# seasons whose pull is finished (written by the backfill). Only these and the current season are
# loaded and served, so a half-pulled old season never shows up on the site.
COMPLETE = DATA / "complete_seasons.json"
PER_ORDER = ["once", "season", "team", "team_season", "player", "game"]


@dataclass
class Endpoint:
    name: str
    source: str
    endpoint: str
    per: str
    params: dict[str, Any] = field(default_factory=dict)
    sweep: dict[str, list[Any]] = field(default_factory=dict)
    season_types: list[str] | None = None
    season_param: str = "season"
    season_type_param: str | None = "season_type_all_star"
    since: str | None = None  # oldest season with data (from the coverage map); older seasons aren't pulled
    note: str = ""

    def covers(self, season: str) -> bool:
        return self.since is None or season >= self.since


@dataclass
class Task:
    ep: Endpoint
    params: dict[str, Any]
    season: str  # "_" when the call isn't tied to a season
    key: str
    meta: dict[str, Any] = field(default_factory=dict)  # e.g. game_date

    @property
    def path(self) -> Path:
        return RAW_DIR / self.ep.source / self.ep.name / self.season / f"{self.key}.json.gz"


def load_registry() -> tuple[dict[str, Any], list[Endpoint]]:
    doc = yaml.safe_load(REGISTRY.read_text())
    return doc, [Endpoint(**e) for e in doc["endpoints"]]


def season_label(start: int) -> str:
    return f"{start}-{str(start + 1)[-2:]}"


def all_seasons(cfg: dict[str, Any]) -> list[str]:
    """Every season the backfill aims for, oldest first: oldest_season up to current_season."""
    first, last = int(cfg["oldest_season"][:4]), int(cfg["current_season"][:4])
    return [season_label(y) for y in range(first, last + 1)]


def complete_seasons() -> list[str]:
    return json.loads(COMPLETE.read_text()) if COMPLETE.exists() else []


def mark_complete(season: str) -> None:
    COMPLETE.write_text(json.dumps(sorted({*complete_seasons(), season})))


def unmark_complete(season: str) -> None:
    COMPLETE.write_text(json.dumps(sorted(set(complete_seasons()) - {season})))


def kept_seasons(cfg: dict[str, Any]) -> list[str]:
    """Seasons that are loaded, served and kept fresh: the finished ones plus the live one, oldest first."""
    return sorted({*complete_seasons(), cfg["current_season"]})


def _slug(value: Any) -> str:
    return re.sub(r"[^A-Za-z0-9.-]+", "-", str(value)).strip("-")


def _key(params: dict[str, Any]) -> str:
    """File name for a call, from the params that vary between calls."""
    parts = [f"{k}={_slug(v)}" for k, v in sorted(params.items())]
    return "__".join(parts) or "all"


def _sweeps(ep: Endpoint) -> list[dict[str, Any]]:
    if not ep.sweep:
        return [{}]
    keys = list(ep.sweep)
    return [dict(zip(keys, combo, strict=True)) for combo in itertools.product(*(ep.sweep[k] for k in keys))]


def season_tasks(ep: Endpoint, seasons: list[str], season_types: list[str]) -> list[Task]:
    tasks = []
    for season in filter(ep.covers, seasons):
        for st in (ep.season_types or season_types) if ep.season_type_param else [None]:
            for sw in _sweeps(ep):
                params = {**ep.params, **sw, ep.season_param: season}
                if st:
                    params[ep.season_type_param] = st
                key = _key({**sw, **({"season_type": st} if st else {})})
                tasks.append(Task(ep, params, season, key))
    return tasks


def once_tasks(ep: Endpoint) -> list[Task]:
    return [Task(ep, {**ep.params, **sw}, "_", _key({**ep.params, **sw})) for sw in _sweeps(ep)]
