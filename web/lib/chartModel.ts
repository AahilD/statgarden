// Turn a query result into what a chart needs. Pure: no ECharts here, so the
// same model feeds the Lab chart, the PNG export and link preview images.
import type { QueryResult, ResultField, ResultValue } from "./api";
import type { ChartSpec } from "./spec";

export type ChartKind = "bar" | "line" | "scatter" | "heatmap";

export type Series = { name: string; data: (number | null)[] };

export type ChartModel =
  | {
      kind: "bar" | "line";
      categories: string[];
      categoryLabel: string;
      series: Series[];
      value: ResultValue;
      truncated: { shown: number; total: number } | null;
    }
  | {
      kind: "scatter";
      x: ResultValue;
      y: ResultValue;
      series: { name: string; points: { name: string; x: number; y: number }[] }[];
      truncated: null;
    }
  | {
      kind: "heatmap";
      xs: string[];
      ys: string[];
      xLabel: string;
      yLabel: string;
      cells: [number, number, number | null][]; // [x index, y index, value]
      value: ResultValue;
      truncated: { shown: number; total: number } | null;
    }
  | { kind: "empty"; reason: string };

// x fields that read left to right in time, so a line fits them
const TIME_FIELDS = new Set(["game_date", "month", "season", "game_number_bucket"]);
const MAX_CATEGORIES = 30;
const MAX_HEAT_ROWS = 40;

const NONE = "—";

function cell(row: QueryResult["rows"][number], f: ResultField) {
  const v = row[`d_${f.id}`];
  return v === null || v === undefined ? NONE : String(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Sort category labels the natural way for their field: bins order, dates/seasons ascending. */
function ordered(labels: string[], f: ResultField | undefined): string[] {
  if (!f) return labels;
  if (f.bins) {
    const pos = new Map(f.bins.map((b, i) => [b, i]));
    return [...labels].sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9));
  }
  if (f.type === "date" || f.id === "season") return [...labels].sort();
  return labels; // keep the table's order (its sort)
}

type Axes = { cat: ResultField[]; ser: ResultField[]; y: ResultValue };

/** Which fields go along the bottom, which become colours, and which number is plotted. */
function axes(res: QueryResult, chart: ChartSpec): Axes | null {
  const dims = [...res.row_fields, ...res.column_fields];
  const y = res.values.find((v) => v.field === chart.y) ?? res.values[0];
  if (!y) return null;
  const color = chart.color ? dims.find((f) => f.id === chart.color) : undefined;
  const x = chart.x ? dims.find((f) => f.id === chart.x) : undefined;
  const ser = color ? [color] : res.column_fields.filter((f) => f !== x);
  const cat = x ? [x] : res.row_fields.filter((f) => !ser.includes(f));
  return { cat, ser, y };
}

/** Values worth plotting against each other: a count like Games played mostly says who qualified. */
const measures = (res: QueryResult) => res.values.filter((v) => v.agg !== "count");

/** The chart type that fits these fields best. */
export function suggestKind(res: QueryResult, chart: ChartSpec): ChartKind {
  const a = axes(res, chart);
  if (!a) return "bar";
  const catGroups = new Set(res.rows.map((r) => a.cat.map((f) => cell(r, f)).join(" · "))).size;
  const serGroups = new Set(res.rows.map((r) => a.ser.map((f) => cell(r, f)).join(" · "))).size;
  if (a.cat.length === 1 && TIME_FIELDS.has(a.cat[0].id) && catGroups >= 3) return "line";
  if (measures(res).length === 2 && a.cat.length > 0 && a.ser.length === 0 && catGroups >= 5) return "scatter";
  if (a.ser.length > 0 && serGroups > 4 && catGroups > 3) return "heatmap";
  return "bar";
}

export function resolveKind(res: QueryResult, chart: ChartSpec): ChartKind {
  return chart.type === "auto" ? suggestKind(res, chart) : chart.type;
}

export function buildChartModel(res: QueryResult, chart: ChartSpec): ChartModel {
  const a = axes(res, chart);
  if (!a || res.rows.length === 0) return { kind: "empty", reason: "No numbers to plot yet." };
  const kind = resolveKind(res, chart);
  const catOf = (r: QueryResult["rows"][number]) => a.cat.map((f) => cell(r, f)).join(" · ") || "All";
  const serOf = (r: QueryResult["rows"][number]) => a.ser.map((f) => cell(r, f)).join(" · ");

  if (kind === "scatter") {
    const x = measures(res).find((v) => v.key !== a.y.key) ?? res.values.find((v) => v.key !== a.y.key);
    if (!x) return { kind: "empty", reason: "A scatter needs two numbers in Values." };
    const bySeries = new Map<string, { name: string; x: number; y: number }[]>();
    for (const r of res.rows) {
      const xv = num(r[x.key]);
      const yv = num(r[a.y.key]);
      if (xv === null || yv === null) continue;
      const s = serOf(r) || a.y.label;
      if (!bySeries.has(s)) bySeries.set(s, []);
      bySeries.get(s)!.push({ name: catOf(r), x: xv, y: yv });
    }
    return {
      kind,
      x,
      y: a.y,
      series: [...bySeries].map(([name, points]) => ({ name, points })),
      truncated: null,
    };
  }

  // bar, line and heatmap all start from a category × series grid
  const catsSeen: string[] = [];
  const sersSeen: string[] = [];
  const grid = new Map<string, number | null>();
  for (const r of res.rows) {
    const c = catOf(r);
    const s = serOf(r);
    if (!grid.has(`${c}␟${s}`)) grid.set(`${c}␟${s}`, num(r[a.y.key]));
    if (!catsSeen.includes(c)) catsSeen.push(c);
    if (!sersSeen.includes(s)) sersSeen.push(s);
  }
  const cats = a.cat.length === 1 ? ordered(catsSeen, a.cat[0]) : catsSeen;
  const sers = a.ser.length === 1 ? ordered(sersSeen, a.ser[0]) : sersSeen;
  const at = (c: string, s: string) => grid.get(`${c}␟${s}`) ?? null;

  if (kind === "heatmap") {
    if (a.ser.length === 0) return { kind: "empty", reason: "A heatmap needs a field in Columns or Colour." };
    const ys = cats.slice(0, MAX_HEAT_ROWS);
    return {
      kind,
      xs: sers,
      ys,
      xLabel: a.ser.map((f) => f.label).join(" · "),
      yLabel: a.cat.map((f) => f.label).join(" · "),
      cells: ys.flatMap((c, yi) => sers.map((s, xi) => [xi, yi, at(c, s)] as [number, number, number | null])),
      value: a.y,
      truncated: cats.length > ys.length ? { shown: ys.length, total: cats.length } : null,
    };
  }

  const shown = cats.slice(0, MAX_CATEGORIES);
  return {
    kind,
    categories: shown,
    categoryLabel: a.cat.map((f) => f.label).join(" · "),
    series: sers.map((s) => ({ name: s || a.y.label, data: shown.map((c) => at(c, s)) })),
    value: a.y,
    truncated: cats.length > shown.length ? { shown: shown.length, total: cats.length } : null,
  };
}
