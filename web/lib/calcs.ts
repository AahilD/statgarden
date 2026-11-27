// Calculated stats (e.g. Points per minute = pts / min). They live in the view,
// so a shared link brings its calculations with it. The API checks and works them out.
import type { FieldMeta } from "./api";
import type { Calc, CalcFormat, PivotSpec } from "./spec";

export const CALC_GROUP = "Calculated";

export const FORMAT_LABEL: Record<CalcFormat, string> = {
  number: "1 decimal (12.3)",
  precise: "3 decimals (0.794)",
  percent: "Percent (61.2%)",
  whole: "Whole number (1,234)",
};

const D3: Record<CalcFormat, string> = { number: ".1f", precise: ".3f", percent: ".1%", whole: ".0f" };

/** A calc dressed up as a field, so the field list, wells and drag and drop treat it like one. */
export function calcField(c: Calc, fits = true): FieldMeta {
  return {
    id: c.id,
    label: c.label,
    short: c.label,
    group: CALC_GROUP,
    kind: "measure",
    source: "calc",
    description: c.formula,
    type: null,
    bins: null,
    agg: "calc",
    modes: ["total"],
    default_mode: "total",
    format: D3[c.format],
    higher_is_better: c.higher_is_better ?? null,
    available: fits,
  };
}

/** Whether every field a calc uses is in this dataset's field list. */
export function calcFits(c: Calc, fields: FieldMeta[]): boolean {
  const here = new Set(fields.filter((f) => f.available && f.kind === "measure").map((f) => f.id));
  return (c.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).every((w) => here.has(w.toLowerCase()));
}

export function newCalcId(spec: PivotSpec, label: string): string {
  const base =
    "calc_" +
    (label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 18) || "stat");
  const taken = new Set(spec.calcs.map((c) => c.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

/** Add a new calc or replace one with the same id. */
export function saveCalc(spec: PivotSpec, calc: Calc): PivotSpec {
  const exists = spec.calcs.some((c) => c.id === calc.id);
  return { ...spec, calcs: exists ? spec.calcs.map((c) => (c.id === calc.id ? calc : c)) : [...spec.calcs, calc] };
}

/** Remove a calc and anything in the view that uses it. */
export function deleteCalc(spec: PivotSpec, id: string): PivotSpec {
  const c = spec.chart;
  return {
    ...spec,
    calcs: spec.calcs.filter((x) => x.id !== id),
    values: spec.values.filter((v) => v.field !== id),
    filters: spec.filters.filter((f) => f.field !== id),
    sort: spec.sort.filter((s) => s.by.split(":")[0] !== id),
    chart: { ...c, y: c.y === id ? null : c.y },
  };
}

/**
 * Turn what someone typed into field ids: "PTS / MIN" → "pts / min". Matches ids, then
 * short names ("3PM" → fg3m), so either works. Unknown words are left for the API to flag.
 */
export function normaliseFormula(text: string, fields: FieldMeta[]): string {
  const byId = new Map(fields.map((f) => [f.id.toLowerCase(), f.id]));
  const byShort = new Map<string, string>();
  for (const f of fields) {
    const k = f.short.toLowerCase();
    if (/^[a-z0-9_%+/-]+$/.test(k) && !byShort.has(k)) byShort.set(k, f.id);
  }
  return text.replace(/[A-Za-z_][A-Za-z0-9_]*|\d+[A-Za-z][A-Za-z0-9]*/g, (w) => {
    const k = w.toLowerCase();
    return byId.get(k) ?? byShort.get(k) ?? w;
  });
}
