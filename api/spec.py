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


class Filter(BaseModel):
    field: str
    op: Op
    value: Any

    @field_validator("value")
    @classmethod
    def _value(cls, v, info):
        op = info.data.get("op")
        if op in ("in", "not_in"):
            if not isinstance(v, list) or not v or len(v) > 200:
                raise ValueError("in / not_in need a list of 1-200 values")
        elif op == "between":
            if not isinstance(v, list) or len(v) != 2:
                raise ValueError("between needs [low, high]")
        elif isinstance(v, (list, dict)):
            raise ValueError(f"{op} needs a single value")
        return v


class Value(BaseModel):
    field: str
    mode: Mode | None = None


class Sort(BaseModel):
    by: str  # a row/column field id, or a value key like "pts:per_game"
    dir: Literal["asc", "desc"] = "desc"


class Chart(BaseModel):
    # The API doesn't draw charts; it keeps these so a view round-trips intact.
    view: Literal["table", "chart", "both"] = "table"
    type: Literal["auto", "bar", "line", "scatter", "heatmap"] = "auto"
    x: str | None = None
    y: str | None = None
    color: str | None = None

    @field_validator("type", mode="before")
    @classmethod
    def _old_types(cls, v: Any) -> Any:
        # old links said "table"; anything unknown means "pick one for me"
        return v if v in ("bar", "line", "scatter", "heatmap") else "auto"


class PivotSpec(BaseModel):
    v: Literal[1] = 1
    dataset: str = "player_game"
    filters: list[Filter] = Field(default_factory=list)
    rows: list[str] = Field(default_factory=list, max_length=MAX_ROWS_FIELDS)
    columns: list[str] = Field(default_factory=list, max_length=MAX_COLUMN_FIELDS)
    values: list[Value] = Field(default_factory=list, max_length=MAX_VALUES)
    sort: list[Sort] = Field(default_factory=list, max_length=3)
    limit: int = Field(default=100, ge=1, le=MAX_LIMIT)
    chart: Chart = Field(default_factory=Chart)
