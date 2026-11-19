"""Thin wrapper around nba_api: browser-ish headers, throttle, retries, raw JSON cache.

Every endpoint call goes through `fetch()` so endpoint churn only needs fixing here.
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"

# Use nba_api's own default headers. Custom "browser-like" headers (Chrome UA,
# Origin, Accept-Language) made stats.nba.com hang until timeout on 2026-11-19,
# while the library defaults answered in <1s from the same Mac.
HEADERS = None

MIN_INTERVAL_S = 1.0
TIMEOUT_S = 30
MAX_RETRIES = 4

_last_call = 0.0


def _throttle() -> None:
    global _last_call
    wait = MIN_INTERVAL_S - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait + random.uniform(0, 0.3))
    _last_call = time.monotonic()


def _cache_path(endpoint_name: str, params: dict[str, Any]) -> Path:
    key = "_".join(f"{k}={v}" for k, v in sorted(params.items()))
    safe = key.replace(" ", "-").replace("/", "-")
    return RAW_DIR / endpoint_name / f"{safe}.json"


def fetch(endpoint_cls, *, refresh: bool = False, **params) -> dict[str, Any]:
    """Call an nba_api endpoint class, caching the raw JSON response on disk."""
    path = _cache_path(endpoint_cls.__name__, params)
    if path.exists() and not refresh:
        return json.loads(path.read_text())

    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        _throttle()
        try:
            kwargs = {"headers": HEADERS} if HEADERS else {}
            ep = endpoint_cls(**params, **kwargs, timeout=TIMEOUT_S)
            data = ep.get_dict()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data))
            return data
        except Exception as err:  # network timeouts, JSON errors, 5xx
            last_err = err
            backoff = 2**attempt * 2
            print(f"  {endpoint_cls.__name__} attempt {attempt + 1} failed: {err!r}; retry in {backoff}s")
            time.sleep(backoff)
    raise RuntimeError(f"{endpoint_cls.__name__} failed after {MAX_RETRIES} tries") from last_err


def result_set(data: dict[str, Any], index: int = 0) -> pd.DataFrame:
    """Turn one resultSet of a stats.nba.com response into a DataFrame."""
    rs = data["resultSets"][index]
    return pd.DataFrame(rs["rowSet"], columns=[c.lower() for c in rs["headers"]])
