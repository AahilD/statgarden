"""Turn a PivotSpec into one SQL query plus bound parameters.

Shape of every query:

    grp   : GROUP BY row fields + column fields, summing the base measures
            (counts, makes, attempts... never percentages)
    top   : (only when there are column fields) the top N row groups by the sort
    final : values worked out from the sums (ratios, per game, per 36)

The result is "long": one row per row-group x column-group. The website spreads
column fields out into table columns; charts use the long shape directly.

Nothing from the request is pasted into SQL except field expressions taken from
the catalog. Filter values are always bound parameters.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from api.catalog import Catalog, FieldDef
from api.spec import PivotSpec

MAX_LONG_ROWS = 50_000


class SpecError(ValueError):
    """The spec asks for something the catalog doesn't allow."""


@dataclass
class ValueCol:
    key: str          # e.g. "pts:per_game"; column name in the result
    field: FieldDef
    mode: str
    label: str


@dataclass
class Query:
    sql: str
    params: list[Any]
    dims: list[str]                      # row + column field ids, in order
    row_dims: list[str]
    col_dims: list[str]
    values: list[ValueCol] = field(default_factory=list)


def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _dim_col(fid: str) -> str:
    return f"d_{fid}"


def _base_col(fid: str) -> str:
    return f"b_{fid}"


def value_key(fid: str, mode: str) -> str:
    return f"{fid}:{mode}"


def _get(cat: Catalog, fid: str, kind: str | None = None) -> FieldDef:
    f = cat.field(fid)
    if f is None:
        raise SpecError(f"unknown field {fid!r}")
    if not f.available:
        raise SpecError(f"{f.label} isn't available yet (its data hasn't been loaded)")
    if kind and f.kind != kind:
        raise SpecError(f"{f.label} is a {f.kind}, not a {kind}")
    return f


def _value_expr(cat: Catalog, f: FieldDef, mode: str, agg_over: str = "") -> str:
    """SQL for a value, written over the summed base columns (b_*).

    agg_over="sum" wraps each base column in sum(), used in the `top` step to
    re-total groups across column fields. Every base column is a plain sum or
    count, so summing them again is exact.
    """
    def b(fid: str) -> str:
        col = _base_col(fid)
        return f"sum({col})" if agg_over else col

    games = b("__games")
    if f.agg == "count":
        return games
    if f.agg == "weighted_avg":
        w = cat.field(f.weight)
        return f"{b(f.id + '__w')} / nullif({b(w.id)}, 0)"
    if f.agg == "ratio":
        expr = f.formula
        # longest names first so 'fg3m' isn't half-replaced by 'fgm'
        for r in sorted(f.requires, key=len, reverse=True):
            expr = re.sub(rf"\b{re.escape(r)}\b", f"__R_{r}__", expr)
        for r in f.requires:
            expr = expr.replace(f"__R_{r}__", f"cast({b(r)} as double)")
        return f"({expr})"
    total = f"cast({b(f.id)} as double)"
    if mode == "per_game":
        return f"{total} / nullif({games}, 0)"
    if mode == "per_36":
        return f"{total} * 36 / nullif({b('min')}, 0)"
    return total


def build(spec: PivotSpec, cat: Catalog) -> Query:
    ds = cat.dataset(spec.dataset)
    if ds is None:
        raise SpecError(f"unknown dataset {spec.dataset!r}")
    if not spec.values:
        raise SpecError("add at least one value")
    if len(set(spec.rows + spec.columns)) != len(spec.rows) + len(spec.columns):
        raise SpecError("a field can only be used once across rows and columns")

    row_fields = [_get(cat, f, "dimension") for f in spec.rows]
    col_fields = [_get(cat, f, "dimension") for f in spec.columns]
    dims = row_fields + col_fields

    values: list[ValueCol] = []
    for v in spec.values:
        f = _get(cat, v.field, "measure")
        mode = v.mode or f.default_mode or "total"
        if mode not in f.modes:
            raise SpecError(f"{f.label} can't be shown {mode.replace('_', ' ')}")
        key = value_key(f.id, mode)
        if any(x.key == key for x in values):
            continue
        suffix = {"per_game": " per game", "per_36": " per 36", "total": ""}[mode]
        values.append(ValueCol(key, f, mode, f.label + suffix))

    # which summed base columns the values need
    bases: dict[str, str] = {"__games": "count(*)"}
    for vc in values:
        f = vc.field
        if f.agg == "sum":
            bases[f.id] = f"sum({f.expr})"
            if vc.mode == "per_36":
                bases["min"] = f"sum({cat.field('min').expr})"
        elif f.agg == "ratio":
            for r in f.requires:
                bases[r] = f"sum({cat.field(r).expr})"
        elif f.agg == "weighted_avg":
            w = cat.field(f.weight)
            bases[f.id + "__w"] = f"sum(({f.expr}) * ({w.expr}))"
            bases[w.id] = f"sum({w.expr})"

    # filters → WHERE on the fact rows (so "min >= 10" means games with 10+ minutes)
    where, params = [], []
    for flt in spec.filters:
        f = _get(cat, flt.field)
        if f.kind == "measure" and f.agg != "sum":
            raise SpecError(f"can't filter on {f.label}; filter on its parts instead")
        expr = f"({f.expr})"
        op, val = flt.op, flt.value
        if op in ("in", "not_in"):
            marks = ", ".join("?" for _ in val)
            where.append(f"{expr} {'NOT ' if op == 'not_in' else ''}IN ({marks})")
            params += list(val)
        elif op == "between":
            where.append(f"{expr} BETWEEN ? AND ?")
            params += list(val)
        elif op == "contains":
            where.append(f"strip_accents(lower(cast({expr} as varchar))) LIKE ?")
            params.append(f"%{_fold(str(val))}%")
        else:
            where.append(f"{expr} {op} ?")
            params.append(val)

    def select_for(fields: list[FieldDef]) -> list[tuple[str, str]]:
        """(expression, column name) pairs; a field with a key also groups by its key."""
        out = []
        for f in fields:
            out.append((f.expr, _dim_col(f.id)))
            if f.key:
                out.append((f.key, _dim_col(f.id) + "__key"))
        return out

    row_sel, col_sel = select_for(row_fields), select_for(col_fields)
    row_cols = [c for _, c in row_sel]
    dim_cols = row_cols + [c for _, c in col_sel]
    dim_select = [f"{e} AS {c}" for e, c in row_sel + col_sel]

    grp = (
        f"  SELECT {', '.join(dim_select + [f'{e} AS {_base_col(k)}' for k, e in bases.items()])}\n"
        f"  FROM {ds.table}\n"
        + (f"  WHERE {' AND '.join(where)}\n" if where else "")
        + (f"  GROUP BY ALL" if dim_select else "")
    )

    # sort: a value key or a dimension; default the first value, descending
    sort = spec.sort[0] if spec.sort else None
    vkeys = {vc.key: vc for vc in values}
    by_field = {vc.field.id: vc for vc in values}
    if sort and (sort.by in vkeys or sort.by in by_field):
        vc = vkeys.get(sort.by) or by_field[sort.by]
        sort_expr, sort_dir = vc, sort.dir
    elif sort and sort.by in [f.id for f in dims]:
        sort_expr, sort_dir = _dim_col(sort.by), sort.dir
    else:
        sort_expr, sort_dir = values[0], "desc"
    nulls = "NULLS LAST"

    final_values = [f"{_value_expr(cat, vc.field, vc.mode)} AS {_q(vc.key)}" for vc in values]

    ctes = [f"grp AS (\n{grp}\n)"]
    if col_fields and row_cols:
        top_order = (f"{_value_expr(cat, sort_expr.field, sort_expr.mode, agg_over='sum')}"
                     if isinstance(sort_expr, ValueCol) else sort_expr)
        ctes.append(
            f"top AS (\n  SELECT {', '.join(row_cols)} FROM grp GROUP BY {', '.join(row_cols)}\n"
            f"  ORDER BY {top_order} {sort_dir.upper()} {nulls} LIMIT {spec.limit}\n)"
        )
        source = f"grp SEMI JOIN top USING ({', '.join(row_cols)})"
        limit_sql = f"LIMIT {MAX_LONG_ROWS}"
    else:
        source = "grp"
        limit_sql = f"LIMIT {spec.limit}"

    order = (_q(sort_expr.key) if isinstance(sort_expr, ValueCol) else sort_expr)
    sql = (
        "WITH " + ",\n".join(ctes) + "\n"
        f"SELECT {', '.join(dim_cols + final_values)}\n"
        f"FROM {source}\n"
        f"ORDER BY {order} {sort_dir.upper()} {nulls}" + (f", {', '.join(dim_cols)}" if dim_cols else "") + "\n"
        f"{limit_sql}"
    )
    return Query(sql, params, [f.id for f in dims], [f.id for f in row_fields],
                 [f.id for f in col_fields], values)


def _fold(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))
