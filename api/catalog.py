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

Mode = Literal["total", "per_game", "per_36", "per_100"]


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
    datasets: list[str] | None = None  # only these datasets (default: any whose table has the columns)
    hidden: bool = False  # a building block for other fields; not shown in the field list
    available: bool = True  # set at startup: works in at least one dataset
    available_in: set[str] = Field(default_factory=set, exclude=True)  # set at startup

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
    modes: list[Mode] = Field(default_factory=lambda: ["total", "per_game", "per_36", "per_100"])
    # how many games one row stands for: 1 for game-level rows, the gp column for season rows
    games: str = "1"
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


def field_sql(cat: Catalog, f: FieldDef) -> list[str]:
    exprs = [f.expr] if f.expr else [cat.field(r).expr for r in f.requires]
    if f.key:
        exprs.append(f.key)
    if f.weight:
        exprs.append(cat.field(f.weight).expr)
    return [e for e in exprs if e and e != "count(*)"]


def mark_available(cat: Catalog, con) -> None:
    """Try each field's SQL against each dataset's table; note where it works."""
    for f in cat.fields:
        f.available_in = set()
    for ds in cat.datasets:
        for f in cat.fields:
            if f.datasets is not None and ds.id not in f.datasets:
                continue
            try:
                for e in field_sql(cat, f):
                    con.execute(f"SELECT {e} FROM {ds.table} LIMIT 0")
                f.available_in.add(ds.id)
            except Exception:
                pass
    for f in cat.fields:
        f.available = bool(f.available_in)


def modes_in(cat: Catalog, f: FieldDef, ds: Dataset) -> list[str]:
    """The modes a field can be shown in, in this dataset."""
    poss = cat.field("poss")
    ok = [m for m in f.modes if m in ds.modes]
    if "per_100" in ok and not (poss and ds.id in poss.available_in):
        ok.remove("per_100")
    if "per_36" in ok and not (cat.field("min") and ds.id in cat.field("min").available_in):
        ok.remove("per_36")
    return ok or ["total"]
