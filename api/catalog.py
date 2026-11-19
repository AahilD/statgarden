"""The field catalog, loaded from catalog/fields.yaml and checked with Pydantic.

The API builds every query from this. A field that isn't here can't be queried.
At startup each field is tried against the database; fields whose columns don't
exist yet (e.g. advanced box scores not loaded) are marked unavailable.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator

CATALOG_PATH = Path(__file__).resolve().parent.parent / "catalog" / "fields.yaml"

Mode = Literal["total", "per_game", "per_36"]


class FieldDef(BaseModel):
    id: str
    label: str
    short: str
    group: str
    kind: Literal["dimension", "measure"]
    source: str
    description: str
    type: Literal["text", "int", "date", "bool", "bucket"] | None = None
    key: str | None = None
    expr: str | None = None
    bins: list[str] | None = None
    agg: Literal["sum", "count", "ratio", "weighted_avg"] | None = None
    requires: list[str] = Field(default_factory=list)
    formula: str | None = None
    weight: str | None = None
    modes: list[Mode] = Field(default_factory=lambda: ["total"])
    default_mode: Mode | None = None
    format: str | None = None
    higher_is_better: bool | None = None
    available: bool = True  # set at startup

    @model_validator(mode="after")
    def _check(self) -> FieldDef:
        if self.kind == "measure":
            if self.agg is None or self.format is None:
                raise ValueError(f"{self.id}: measures need agg and format")
            if self.agg == "ratio" and not (self.formula and self.requires):
                raise ValueError(f"{self.id}: ratio needs formula and requires")
            if self.agg != "ratio" and not self.expr:
                raise ValueError(f"{self.id}: needs expr")
            if self.agg == "weighted_avg" and not self.weight:
                raise ValueError(f"{self.id}: weighted_avg needs weight")
            if self.agg in ("ratio", "count"):
                self.modes = ["total"]  # per game / per 36 of a percentage or a count makes no sense
            if self.default_mode is None:
                self.default_mode = self.modes[0]
            if self.default_mode not in self.modes:
                raise ValueError(f"{self.id}: default_mode isn't one of its modes")
        else:
            if not self.expr or self.type is None:
                raise ValueError(f"{self.id}: dimensions need expr and type")
            if self.type == "bucket" and not self.bins:
                raise ValueError(f"{self.id}: bucket needs bins")
        return self


class Dataset(BaseModel):
    id: str
    label: str
    grain: str
    table: str
    default: dict = Field(default_factory=dict)


class Catalog(BaseModel):
    datasets: list[Dataset]
    groups: list[str]
    fields: list[FieldDef]

    def field(self, fid: str) -> FieldDef | None:
        return self._by_id.get(fid)

    def dataset(self, did: str) -> Dataset | None:
        return next((d for d in self.datasets if d.id == did), None)

    def model_post_init(self, __context) -> None:
        self._by_id = {f.id: f for f in self.fields}
        if len(self._by_id) != len(self.fields):
            dupes = sorted({f.id for f in self.fields if sum(g.id == f.id for g in self.fields) > 1})
            raise ValueError(f"duplicate field ids: {dupes}")
        for f in self.fields:
            if f.group not in self.groups:
                raise ValueError(f"{f.id}: unknown group {f.group!r}")
            for r in f.requires:
                base = self._by_id.get(r)
                if base is None or base.agg != "sum":
                    raise ValueError(f"{f.id}: requires {r!r}, which isn't a sum measure")
            if f.weight and f.weight not in self._by_id:
                raise ValueError(f"{f.id}: unknown weight {f.weight!r}")


def load_catalog(path: Path = CATALOG_PATH) -> Catalog:
    return Catalog(**yaml.safe_load(path.read_text()))


def mark_available(cat: Catalog, con, table: str) -> None:
    """Try each field's SQL against the table; mark the ones that don't work yet."""
    for f in cat.fields:
        exprs = [f.expr] if f.expr else [cat.field(r).expr for r in f.requires]
        if f.key:
            exprs.append(f.key)
        if f.weight:
            exprs.append(cat.field(f.weight).expr)
        try:
            for e in exprs:
                if e and e != "count(*)":
                    con.execute(f"SELECT {e} FROM {table} LIMIT 0")
            f.available = True
        except Exception:
            f.available = False
