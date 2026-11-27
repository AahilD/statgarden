"""Thin wrapper around nba_api: spacing between calls, retries, gzipped raw files.

Every call to NBA.com goes through `call()`, so when an endpoint changes it only
needs fixing here.
"""

from __future__ import annotations

import gzip
import json
import random
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import nba_api.live.nba.endpoints as live_endpoints
import nba_api.stats.endpoints as stats_endpoints

# Use nba_api's own default headers. Custom "browser-like" headers (Chrome UA,
# Origin, Accept-Language) made stats.nba.com hang until timeout on 2026-11-19,
# while the library defaults answered in <1s from the same Mac.
MIN_INTERVAL_S = {"stats": 0.6, "cdn": 0.6}  # cdn at 0.3s got empty (throttled) responses
TIMEOUT_S = 30
MAX_TRIES = 3

_last_call: dict[str, float] = {}


class PullError(RuntimeError):
    pass


def _throttle(source: str) -> None:
    wait = MIN_INTERVAL_S[source] - (time.monotonic() - _last_call.get(source, 0.0))
    if wait > 0:
        time.sleep(wait + random.uniform(0, 0.2))
    _last_call[source] = time.monotonic()


def _endpoint_class(source: str, name: str):
    module = stats_endpoints if source == "stats" else live_endpoints
    return getattr(module, name)


def call(source: str, endpoint: str, params: dict[str, Any], tries: int = MAX_TRIES) -> dict[str, Any]:
    """Call one endpoint and return the raw JSON dict. Retries with backoff."""
    cls = _endpoint_class(source, endpoint)
    last_err: Exception | None = None
    for attempt in range(tries):
        _throttle(source)
        try:
            return cls(**params, timeout=TIMEOUT_S).get_dict()
        except Exception as err:  # timeouts, bad JSON, 4xx/5xx surfaced as parse errors
            last_err = err
            if attempt < tries - 1:  # no point waiting after the last try
                time.sleep(2**attempt * 3)
    raise PullError(f"{endpoint} {params} failed after {tries} tries: {last_err!r}") from last_err


def save(path: Path, source: str, endpoint: str, params: dict[str, Any], data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "request": {"source": source, "endpoint": endpoint, "params": params},
        "pulled_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "response": data,
    }
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    tmp.replace(path)  # never leave a half-written file behind


def read(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)
