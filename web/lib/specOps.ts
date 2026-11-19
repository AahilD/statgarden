// Pure edits to a PivotSpec. The builder only changes the view through these.
import type { FieldMeta } from "./api";
import { LIMITS, type ChartView, type Filter, type Mode, type PivotSpec } from "./spec";

export type TableWell = "rows" | "columns" | "values" | "filters";
export type ChartWell = "x" | "y" | "color";
export type Well = TableWell | ChartWell;

export const isChartWell = (w: Well): w is ChartWell => w === "x" || w === "y" || w === "color";

export function canDrop(field: FieldMeta, well: Well): boolean {
  if (!field.available) return false;
  if (well === "values" || well === "y") return field.kind === "measure";
  if (well === "x" || well === "color") return field.kind === "dimension";
  if (well === "rows" || well === "columns") return field.kind === "dimension";
  return field.kind === "dimension" || field.agg === "sum";
}

export function defaultWell(field: FieldMeta): Well {
  return field.kind === "measure" ? "values" : "rows";
}

export function addField(spec: PivotSpec, field: FieldMeta, well: Well): PivotSpec {
  if (!canDrop(field, well)) return spec;
  const id = field.id;
  if (isChartWell(well)) {
    // A chart is drawn from the same query as the table, so whatever goes on the chart
    // also has to be in the view: x → rows, colour → columns, y → values.
    let next: PivotSpec = { ...spec, chart: { ...spec.chart, [well]: id } };
    if (well === "x" && !next.rows.includes(id)) next = addField(next, field, "rows");
    if (well === "color" && !next.columns.includes(id) && !next.rows.includes(id)) next = addField(next, field, "columns");
    if (well === "y" && !next.values.some((v) => v.field === id)) next = addField(next, field, "values");
    return next;
  }
  if (well === "values") {
    if (spec.values.length >= LIMITS.values || spec.values.some((v) => v.field === id)) return spec;
    return { ...spec, values: [...spec.values, { field: id, mode: field.default_mode ?? undefined }] };
  }
  if (well === "filters") {
    if (spec.filters.some((f) => f.field === id)) return spec;
    const filter: Filter =
      field.kind === "dimension" ? { field: id, op: "in", value: [] } : { field: id, op: ">=", value: null };
    return { ...spec, filters: [...spec.filters, filter] };
  }
  // rows / columns: a field lives in one of them at a time
  const other = well === "rows" ? "columns" : "rows";
  const list = spec[well].filter((f) => f !== id);
  if (list.length >= LIMITS[well]) return spec;
  return { ...spec, [well]: [...list, id], [other]: spec[other].filter((f) => f !== id) };
}

export function removeAt(spec: PivotSpec, well: TableWell, index: number): PivotSpec {
  const next = { ...spec, [well]: spec[well].filter((_, i) => i !== index) } as PivotSpec;
  // drop a sort or chart pick that points at something no longer in the view
  const dims = new Set([...next.rows, ...next.columns]);
  const keys = new Set([...dims, ...next.values.map((v) => v.field)]);
  next.sort = next.sort.filter((s) => keys.has(s.by.split(":")[0]));
  const c = next.chart;
  next.chart = {
    ...c,
    x: c.x && dims.has(c.x) ? c.x : null,
    color: c.color && dims.has(c.color) ? c.color : null,
    y: c.y && keys.has(c.y) ? c.y : null,
  };
  return next;
}

export function setMode(spec: PivotSpec, index: number, mode: Mode): PivotSpec {
  const values = spec.values.map((v, i) => (i === index ? { ...v, mode } : v));
  const old = spec.values[index];
  const sort = spec.sort.map((s) =>
    s.by === `${old.field}:${old.mode}` ? { ...s, by: `${old.field}:${mode}` } : s,
  );
  return { ...spec, values, sort };
}

export function setFilter(spec: PivotSpec, field: string, patch: Partial<Filter>): PivotSpec {
  return { ...spec, filters: spec.filters.map((f) => (f.field === field ? { ...f, ...patch } : f)) };
}

export function filterValue(spec: PivotSpec, field: string): unknown[] {
  const f = spec.filters.find((x) => x.field === field);
  return f && Array.isArray(f.value) ? f.value : [];
}

/** Toggle one value of an "in" filter (seasons, season types), creating it if needed. */
export function toggleIn(spec: PivotSpec, field: string, value: string): PivotSpec {
  const cur = filterValue(spec, field) as string[];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  const others = spec.filters.filter((f) => f.field !== field);
  if (!next.length) return { ...spec, filters: others };
  return { ...spec, filters: [...others, { field, op: "in", value: next }] };
}

export function setSort(spec: PivotSpec, by: string): PivotSpec {
  const cur = spec.sort[0];
  const dir = cur && cur.by === by && cur.dir === "desc" ? "asc" : "desc";
  return { ...spec, sort: [{ by, dir }] };
}

export function isComplete(f: Filter): boolean {
  if (f.op === "in" || f.op === "not_in") return Array.isArray(f.value) && f.value.length > 0;
  if (f.op === "between") return Array.isArray(f.value) && f.value.every((x) => typeof x === "number");
  return f.value !== null && f.value !== undefined && f.value !== "";
}

/** The spec sent to the API: half-made filters are left out. */
export function forQuery(spec: PivotSpec): PivotSpec {
  return { ...spec, filters: spec.filters.filter(isComplete) };
}

export function clearChart(spec: PivotSpec, well: ChartWell): PivotSpec {
  return { ...spec, chart: { ...spec.chart, [well]: null } };
}

export function setView(spec: PivotSpec, view: ChartView): PivotSpec {
  return { ...spec, chart: { ...spec.chart, view } };
}
