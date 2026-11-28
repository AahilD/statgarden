"""Read-only DuckDB for the API, with hot swapping.

The API never opens the pipeline's working database. It reads a published copy
(default data/serve/statgarden.duckdb). Publishing a new file means writing it
next to the old one and renaming it over the top; the API notices the new file
on the next request, opens it, and drops its cache. No restart, no downtime.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SERVE_DB = Path(os.environ.get("STATGARDEN_SERVE_DB", ROOT / "data" / "serve" / "statgarden.duckdb"))


class Database:
    def __init__(self, path: Path = SERVE_DB):
        self.path = path
        self._lock = threading.Lock()
        self._con: duckdb.DuckDBPyConnection | None = None
        self._stamp: tuple[int, float] | None = None
        self.on_swap: list = []  # callbacks run after a new file is opened

    def _current_stamp(self) -> tuple[int, float]:
        st = self.path.stat()
        return st.st_ino, st.st_mtime

    def cursor(self) -> duckdb.DuckDBPyConnection:
        """A cursor on the newest published file. Cursors are safe to use per request."""
        stamp = self._current_stamp()
        with self._lock:
            if self._con is None or stamp != self._stamp:
                old = self._con
                self._con = duckdb.connect(str(self.path), read_only=True)
                self._stamp = stamp
                for cb in self.on_swap:
                    cb(self._con)
                if old is not None:
                    old.close()
            return self._con.cursor()

    @property
    def updated_at(self) -> float:
        return self.path.stat().st_mtime


def records(cur) -> list[dict]:
    """The cursor's result as a list of dicts, JSON-ready: dates as text, NaN as None."""
    cols = [d[0] for d in cur.description]
    out = []
    for r in cur.fetchall():
        row = {}
        for c, v in zip(cols, r, strict=True):
            if isinstance(v, float) and v != v:  # NaN
                v = None
            row[c] = str(v) if hasattr(v, "isoformat") else v
        out.append(row)
    return out
