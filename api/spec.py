"""The view format ("PivotSpec"). Same shape in the link, the builder and /query."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from api.catalog import Mode

Op = Literal["=", "!=", ">", ">=", "<", "<=", "in", "not_in", "between", "contains"]

MAX_ROWS_FIELDS = 3
MAX_COLUMN_FIELDS = 2
MAX_VALUES = 6
MAX_LIMIT = 5000
MAX_CALCS = 8

# how a calculated stat is shown
CALC_FORMATS = {"number": ".1f", "precise": ".3f", "percent": ".1%", "whole": ".0f"}


class Filter(BaseModel):
    field: str
    op: Op
    value: Any
    # numbers only: "game" keeps the games that pass (before adding up);
    # "group" keeps the rows of the result that pass (after adding up)
    scope: Literal["game", "group"] = "game"
    mode: Mode | None = None  # group scope: which version of the number (e.g. per game)
    # between only: whether each end counts. "[]" both in, "[)" low in / high out, and so on
    ends: Literal["[]", "[)", "(]", "()"] = "[]"
    # between only: keep what's outside the range instead (e.g. under 10 or over 30)
    outside: bool = False

    @field_validator("value")
    @classmethod
    def _value(cls, v, info):
        op = info.data.get("op")
        if op in ("in", "not_in"):
            if not isinstance(v, list) or not v or len(v) > 200:
                raise ValueError("in / not_in need a list of 1-200 values")
        elif op == "between":
            # either end can be left open (null), but not both
            if (
                not isinstance(v, list)
                or len(v) != 2
                or not all(x is None or (isinstance(x, (int, float)) and not isinstance(x, bool)) for x in v)
                or all(x is None for x in v)
            ):
                raise ValueError("between needs [low, high]; one of them can be null")
        elif isinstance(v, (list, dict)):
            raise ValueError(f"{op} needs a single value")
        return v


class Value(BaseModel):
    field: str
    mode: Mode | None = None
    # shading direction for this view (the web table uses it; queries ignore it)
    better: Literal["higher", "lower", "none"] | None = None


class Calc(BaseModel):
    id: str = Field(pattern=r"^calc_[a-z0-9_]{1,24}$")
    label: str = Field(min_length=1, max_length=40)
    formula: str = Field(min_length=1, max_length=200)
    format: Literal["number", "precise", "percent", "whole"] = "number"
    higher_is_better: bool | None = None  # for shading: True, False, or None for no shading


class Sort(BaseModel):
    by: str  # a row/column field id, or a value key like "pts:per_game"
    dir: Literal["asc", "desc"] = "desc"


class Chart(BaseModel):
    # The API doesn't draw charts; it keeps these so a view round-trips intact.
    view: Literal["table", "chart", "both"] = "table"
    type: Literal["auto", "bar", "line", "scatter", "heatmap", "histogram"] = "auto"
    stack: Literal["none", "stack", "pct"] = "none"  # bars: side by side, stacked, or stacked to 100%
    bin: float | None = Field(default=None, gt=0)  # histogram bin width; None = pick one
    labels: bool = False  # bars and histograms: numbers printed on the bars
    x: str | None = None
    y: str | None = None
    color: str | None = None
    names: Literal["auto", "all", "none"] = "auto"  # scatter: which points get names
    picked: list[str] = Field(default_factory=list, max_length=30)  # always named and ringed

    @field_validator("names", mode="before")
    @classmethod
    def _names(cls, v: Any) -> Any:
        return v if v in ("auto", "all", "none") else "auto"

    @field_validator("type", mode="before")
    @classmethod
    def _old_types(cls, v: Any) -> Any:
        # old links said "table"; anything unknown means "pick one for me"
        return v if v in ("bar", "line", "scatter", "heatmap", "histogram") else "auto"

    @field_validator("stack", mode="before")
    @classmethod
    def _stack(cls, v: Any) -> Any:
        return v if v in ("none", "stack", "pct") else "none"


class PivotSpec(BaseModel):
    v: Literal[1] = 1
    dataset: str = "player_game"
    filters: list[Filter] = Field(default_factory=list)
    rows: list[str] = Field(default_factory=list, max_length=MAX_ROWS_FIELDS)
    columns: list[str] = Field(default_factory=list, max_length=MAX_COLUMN_FIELDS)
    values: list[Value] = Field(default_factory=list, max_length=MAX_VALUES)
    calcs: list[Calc] = Field(default_factory=list, max_length=MAX_CALCS)
    sort: list[Sort] = Field(default_factory=list, max_length=3)
    limit: int = Field(default=100, ge=1, le=MAX_LIMIT)
    # table shading; display only, kept so a view round-trips intact
    shade: str = "rank"
    chart: Chart = Field(default_factory=Chart)

    @field_validator("shade", mode="before")
    @classmethod
    def _shade(cls, v: Any) -> Any:
        return v if v in ("rank", "average", "split", "baseline", "off") else "rank"
