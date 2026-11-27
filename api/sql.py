"""Turn a PivotSpec into one SQL query plus bound parameters.

Shape of every query:

    grp   : GROUP BY row fields + column fields, summing the base measures
            (counts, makes, attempts... never percentages)
    top   : (only when there are column fields) the top N row groups by the sort
    final : values worked out from the sums (ratios, per game, per 36, per 100,
            calculated stats)

The result is "long": one row per row-group x column-group. The website spreads
column fields out into table columns; charts use the long shape directly.

Nothing from the request is pasted into SQL except field expressions taken from
the catalog and calculated-stat formulas rebuilt by api.calc from their parts.
Filter values are always bound parameters.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from api.calc import CalcError, Node, fields_in, parse, to_sql
from api.catalog import Catalog, Dataset, FieldDef, modes_in
from api.spec import CALC_FORMATS, Calc, PivotSpec

MAX_LONG_ROWS = 50_000

# how each mode reads in labels ("Points per game") and short headers ("PTS/G")
MODE_SUFFIX = {"total": "", "per_game": " per game", "per_36": " per 36", "per_100": " per 100 poss"}
MODE_SHORT = {"total": "", "per_game": "/G", "per_36": "/36", "per_100": "/100"}

NUMBER_OPS = {"=", "!=", ">", ">=", "<", "<=", "between"}


class SpecError(ValueError):
    """The spec asks for something the catalog doesn't allow."""


@dataclass
class ValueCol:
    key: str  # e.g. "pts:per_game"; column name in the result
    field_id: str
    mode: str
    label: str
    short: str
    format: str
    agg: str
    higher_is_better: bool | None
    sql: Callable[[str], str]  # agg_over → SQL over the summed base columns


@dataclass
class Query:
    sql: str
    params: list[Any]
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


def calc_format(c: Calc) -> str:
    return CALC_FORMATS[c.format]


class Builder:
    """Collects the summed base columns a query needs while writing its expressions."""

    def __init__(self, spec: PivotSpec, cat: Catalog, ds: Dataset):
        self.cat, self.ds = cat, ds
        self.bases: dict[str, str] = {"__games": f"coalesce(sum({ds.games}), 0)"}
        # calcs are checked when used, so one that doesn't fit this dataset only matters if it's in the view
        self.calcs: dict[str, Calc] = {}
        self._parsed: dict[str, Node] = {}
        for c in spec.calcs:
            if c.id in self.calcs:
                raise SpecError(f"two calculated stats share the id {c.id}")
            self.calcs[c.id] = c

    # ── fields ──────────────────────────────────────────────────────────────

    def field(self, fid: str, kind: str | None = None) -> FieldDef:
        f = self.cat.field(fid)
        if f is None:
            raise SpecError(f"unknown field {fid!r}")
        if self.ds.id not in f.available_in:
            if f.available:
                raise SpecError(f"{f.label} isn't in {self.ds.label}")
            raise SpecError(f"{f.label} isn't available yet (its data hasn't been loaded)")
        if kind and f.kind != kind:
            raise SpecError(f"{f.label} is a {f.kind}, not a {kind}")
        return f

    def _parse(self, c: Calc) -> Node:
        try:
            node = parse(c.formula)
        except CalcError as err:
            raise SpecError(f"{c.label}: {err}") from err
        for fid in fields_in(node):
            f = self.cat.field(fid)
            if f is None:
                raise SpecError(f"{c.label}: there's no field called “{fid}”")
            if f.kind != "measure":
                raise SpecError(f"{c.label}: {f.label} is a grouping field, not a number")
            if self.ds.id not in f.available_in:
                raise SpecError(f"{c.label}: {f.label} isn't in {self.ds.label}")
        return node

    def need(self, f: FieldDef, mode: str) -> None:
        if f.agg == "sum":
            self.bases[f.id] = f"sum({f.expr})"
            if mode == "per_36":
                self.need(self.cat.field("min"), "total")
            if mode == "per_100":
                self.need(self.cat.field("poss"), "total")
        elif f.agg == "ratio":
            for r in f.requires:
                self.need(self.cat.field(r), "total")
        elif f.agg == "weighted_avg":
            w = self.cat.field(f.weight)
            self.bases[f.id + "__w"] = f"sum(({f.expr}) * ({w.expr}))"
            self.need(w, "total")

    def group_sql(self, f: FieldDef, mode: str, agg_over: str = "") -> str:
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
            return f"{b(f.id + '__w')} / nullif({b(f.weight)}, 0)"
        if f.agg == "ratio":
            return "(" + _swap(f.formula, f.requires, lambda r: f"cast({b(r)} as double)") + ")"
        total = f"cast({b(f.id)} as double)"
        if mode == "per_game":
            return f"{total} / nullif({games}, 0)"
        if mode == "per_36":
            return f"{total} * 36 / nullif({b('min')}, 0)"
        if mode == "per_100":
            return f"{total} * 100 / nullif({b('poss')}, 0)"
        return total

    def row_sql(self, f: FieldDef) -> str:
        """SQL for one game's value of a field (for per-game filters)."""
        if f.agg == "count":
            return f"({self.ds.games})"
        if f.agg == "ratio":
            return "(" + _swap(f.formula, f.requires, lambda r: f"cast(({self.cat.field(r).expr}) as double)") + ")"
        return f"({f.expr})"

    # ── calculated stats ────────────────────────────────────────────────────

    def calc(self, cid: str) -> tuple[Calc, Node]:
        if cid not in self.calcs:
            raise SpecError(f"unknown calculated stat {cid!r}")
        if cid not in self._parsed:
            self._parsed[cid] = self._parse(self.calcs[cid])
        return self.calcs[cid], self._parsed[cid]

    def calc_group_sql(self, cid: str, agg_over: str = "") -> str:
        _, node = self.calc(cid)
        for fid in fields_in(node):
            self.need(self.cat.field(fid), "total")
        return to_sql(node, lambda fid: self.group_sql(self.cat.field(fid), "total", agg_over))

    def calc_row_sql(self, cid: str) -> str:
        _, node = self.calc(cid)
        return to_sql(node, lambda fid: self.row_sql(self.cat.field(fid)))

    # ── one value in Values ─────────────────────────────────────────────────

    def value(self, fid: str, mode: str | None) -> ValueCol:
        if fid in self.calcs:
            c, _ = self.calc(fid)
            self.calc_group_sql(fid)  # registers the bases it needs
            return ValueCol(
                value_key(fid, "total"),
                fid,
                "total",
                c.label,
                c.label,
                calc_format(c),
                "calc",
                c.higher_is_better,
                lambda agg_over, fid=fid: self.calc_group_sql(fid, agg_over),
            )
        f = self.field(fid, "measure")
        allowed = modes_in(self.cat, f, self.ds)
        mode = mode or (f.default_mode if f.default_mode in allowed else allowed[0])
        if mode not in allowed:
            raise SpecError(f"{f.label} can't be shown {MODE_SUFFIX.get(mode, mode).strip() or 'as a total'} here")
        self.need(f, mode)
        return ValueCol(
            value_key(f.id, mode),
            f.id,
            mode,
            f.label + MODE_SUFFIX[mode],
            f.short + MODE_SHORT[mode],
            f.format,
            f.agg,
            f.higher_is_better,
            lambda agg_over, f=f, mode=mode: self.group_sql(f, mode, agg_over),
        )


def _swap(formula: str, names: list[str], sql: Callable[[str], str]) -> str:
    # longest names first so 'fg3m' isn't half-replaced by 'fgm'
    out = formula
    for r in sorted(names, key=len, reverse=True):
        out = re.sub(rf"\b{re.escape(r)}\b", f"__R_{r}__", out)
    for r in names:
        out = out.replace(f"__R_{r}__", sql(r))
    return out


def _compare(expr: str, op: str, val: Any, where: list[str], params: list[Any]) -> None:
    if op == "between":
        where.append(f"{expr} BETWEEN ? AND ?")
        params += list(val)
    else:
        where.append(f"{expr} {op} ?")
        params.append(val)


def build(spec: PivotSpec, cat: Catalog) -> Query:
    ds = cat.dataset(spec.dataset)
    if ds is None:
        raise SpecError(f"unknown dataset {spec.dataset!r}")
    if not spec.values:
        raise SpecError("add at least one value")
    if len(set(spec.rows + spec.columns)) != len(spec.rows) + len(spec.columns):
        raise SpecError("a field can only be used once across rows and columns")

    bld = Builder(spec, cat, ds)
    row_fields = [bld.field(f, "dimension") for f in spec.rows]
    col_fields = [bld.field(f, "dimension") for f in spec.columns]
    dims = row_fields + col_fields

    values: list[ValueCol] = []
    for v in spec.values:
        vc = bld.value(v.field, v.mode)
        if not any(x.key == vc.key for x in values):
            values.append(vc)

    # filters: dimensions and per-game numbers → WHERE on the game rows;
    # whole-group numbers → applied after adding up (see `having` below)
    where: list[str] = []
    params: list[Any] = []
    having: list[tuple[Callable[[str], str], str, Any]] = []
    for flt in spec.filters:
        is_calc = flt.field in bld.calcs
        f = None if is_calc else bld.field(flt.field)
        if f is not None and f.kind == "dimension":
            expr = f"({f.expr})"
            op, val = flt.op, flt.value
            if op in ("in", "not_in"):
                marks = ", ".join("?" for _ in val)
                where.append(f"{expr} {'NOT ' if op == 'not_in' else ''}IN ({marks})")
                params += list(val)
            elif op == "contains":
                where.append(f"strip_accents(lower(cast({expr} as varchar))) LIKE ?")
                params.append(f"%{fold(str(val))}%")
            else:
                _compare(expr, op, val, where, params)
            continue
        name = bld.calc(flt.field)[0].label if is_calc else f.label
        if flt.op not in NUMBER_OPS:
            raise SpecError(f"{name}: number filters use =, ≠, <, ≤, >, ≥ or between")
        if flt.scope == "game":
            expr = bld.calc_row_sql(flt.field) if is_calc else bld.row_sql(f)
            _compare(f"({expr})", flt.op, flt.value, where, params)
        else:
            vc = bld.value(flt.field, None if is_calc else flt.mode)
            having.append((vc.sql, flt.op, flt.value))

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
        f"  SELECT {', '.join(dim_select + [f'{e} AS {_base_col(k)}' for k, e in bld.bases.items()])}\n"
        f"  FROM {ds.table}\n"
        + (f"  WHERE {' AND '.join(where)}\n" if where else "")
        + ("  GROUP BY ALL" if dim_select else "")
    )

    # sort: a value key or a dimension; default the first value, descending
    sort = spec.sort[0] if spec.sort else None
    vkeys = {vc.key: vc for vc in values}
    by_field = {vc.field_id: vc for vc in values}
    if sort and (sort.by in vkeys or sort.by in by_field):
        sort_expr, sort_dir = vkeys.get(sort.by) or by_field[sort.by], sort.dir
    elif sort and sort.by in [f.id for f in dims]:
        sort_expr, sort_dir = _dim_col(sort.by), sort.dir
    else:
        sort_expr, sort_dir = values[0], "desc"
    nulls = "NULLS LAST"

    final_values = [f"{vc.sql('')} AS {_q(vc.key)}" for vc in values]

    def having_sql(agg_over: str) -> list[str]:
        out = []
        for sql, op, val in having:
            _compare(f"({sql(agg_over)})", op, val, out, params)
        return out

    ctes = [f"grp AS (\n{grp}\n)"]
    final_where: list[str] = []
    if col_fields and row_cols:
        top_order = sort_expr.sql("sum") if isinstance(sort_expr, ValueCol) else sort_expr
        hv = having_sql("sum")  # a row group passes on its totals across every column
        ctes.append(
            f"top AS (\n  SELECT {', '.join(row_cols)} FROM grp GROUP BY {', '.join(row_cols)}\n"
            + (f"  HAVING {' AND '.join(hv)}\n" if hv else "")
            + f"  ORDER BY {top_order} {sort_dir.upper()} {nulls} LIMIT {spec.limit}\n)"
        )
        source = f"grp SEMI JOIN top USING ({', '.join(row_cols)})"
        limit_sql = f"LIMIT {MAX_LONG_ROWS}"
    else:
        final_where = having_sql("")
        source = "grp"
        limit_sql = f"LIMIT {spec.limit}"

    order = _q(sort_expr.key) if isinstance(sort_expr, ValueCol) else sort_expr
    sql = (
        "WITH " + ",\n".join(ctes) + "\n"
        f"SELECT {', '.join(dim_cols + final_values)}\n"
        f"FROM {source}\n"
        + (f"WHERE {' AND '.join(final_where)}\n" if final_where else "")
        + f"ORDER BY {order} {sort_dir.upper()} {nulls}"
        + (f", {', '.join(dim_cols)}" if dim_cols else "")
        + "\n"
        f"{limit_sql}"
    )
    return Query(sql, params, [f.id for f in row_fields], [f.id for f in col_fields], values)


def check_formula(formula: str, dataset: str, cat: Catalog) -> list[str]:
    """Field ids a formula uses, or SpecError saying what's wrong with it."""
    try:
        parse(formula)  # says what's wrong in plain words before pydantic gets a look
    except CalcError as err:
        raise SpecError(str(err)) from err
    spec = PivotSpec(dataset=dataset, calcs=[Calc(id="calc_check", label="Formula", formula=formula)])
    ds = cat.dataset(dataset)
    if ds is None:
        raise SpecError(f"unknown dataset {dataset!r}")
    bld = Builder(spec, cat, ds)
    return fields_in(bld.calc("calc_check")[1])


def fold(s: str) -> str:
    """Lower case without accents, to match DuckDB's strip_accents(lower(...))."""
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))
