// Turn a query result into what a chart needs. Pure: no ECharts here, so the
// same model feeds the Lab chart, the PNG export and link preview images.
import type { QueryResult, ResultField, ResultValue } from "./api";
import type { Direction } from "./standouts";
import type { ChartSpec } from "./spec";

export type ChartKind = "bar" | "line" | "scatter" | "heatmap" | "histogram";
export type Stack = "none" | "stack" | "pct";

export type Series = { name: string; data: (number | null)[] };

export type ChartModel =
  | {
      kind: "bar" | "line";
      categories: string[];
      categoryLabel: string;
      series: Series[];
      value: ResultValue;
      truncated: { shown: number; total: number } | null;
      stack: Stack; // bars only, and only with more than one colour
      labels: boolean; // print each number on its bar
      canStack: boolean; // the number adds up (attempts, points), so stacking it means something
    }
  | {
      kind: "histogram";
      categories: string[]; // bin labels, low to high
      categoryLabel: string; // the number being binned
      series: Series[]; // how many rows fall in each bin, per colour
      value: ResultValue; // a stand-in for "how many", so tooltips and axes print whole numbers
      binned: ResultValue; // the number being binned
      step: number; // bin width in use
      autoStep: number; // what Auto picks
      steps: number[]; // bin widths worth offering, small to large
      rowLabel: string; // what one row is, e.g. "Player"
      count: number; // rows counted
      labels: boolean; // print each count on its bar
      truncated: null;
    }
  | {
      kind: "scatter";
      x: ResultValue;
      y: ResultValue;
      series: { name: string; points: { name: string; x: number; y: number }[] }[];
      names: "auto" | "all" | "none";
      picked: string[];
      dir: { x: Direction; y: Direction }; // which way is better on each axis, for picking standouts
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

/** What each axis would be on Auto, given the other picks: shown as "Auto · …" in the axis menus. */
export function autoAxes(res: QueryResult, chart: ChartSpec) {
  return {
    cat: axes(res, { ...chart, x: null })?.cat ?? [],
    y: axes(res, { ...chart, y: null })?.y,
    ser: axes(res, { ...chart, color: null })?.ser ?? [],
  };
}

/** Which fields go along the bottom, which become colours, and which number is plotted. */
function axes(res: QueryResult, chart: ChartSpec): Axes | null {
  const dims = [...res.row_fields, ...res.column_fields];
  const y = res.values.find((v) => v.field === chart.y) ?? res.values[0];
  if (!y) return null;
  const color = chart.color ? dims.find((f) => f.id === chart.color) : undefined;
  const x = chart.x ? dims.find((f) => f.id === chart.x) : undefined;
  // nothing dropped: whatever isn't along the bottom becomes colours, and the other way round
  const ser = color ? [color] : x ? dims.filter((f) => f !== x) : res.column_fields;
  const cat = x ? [x] : dims.filter((f) => !ser.includes(f));
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

const ownDirection = (v: ResultValue): Direction =>
  v.higher_is_better === null ? "none" : v.higher_is_better ? "higher" : "lower";

/** betterOf: which way is better for a value (the view's choice); defaults to the stat's own. */
export function buildChartModel(res: QueryResult, chart: ChartSpec, betterOf: (v: ResultValue) => Direction = ownDirection): ChartModel {
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
      names: chart.names ?? "auto",
      picked: chart.picked ?? [],
      dir: { x: betterOf(x), y: betterOf(a.y) },
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

  if (kind === "histogram") return histogram(cats, sers, at, a, chart.bin, chart.labels);

  const shown = cats.slice(0, MAX_CATEGORIES);
  const canStack = ADDS_UP.has(a.y.agg) || SHARES.has(a.y.mode);
  const stack: Stack = kind === "bar" && sers.length > 1 && canStack ? (chart.stack ?? "none") : "none";
  let series = sers.map((s) => ({ name: s || a.y.label, data: shown.map((c) => at(c, s)) }));
  let value = a.y;
  if (stack === "pct") {
    // each bar becomes 100%: every colour's part of that bar's total
    const totals = shown.map((_, i) => series.reduce((t, s) => t + (s.data[i] ?? 0), 0));
    series = series.map((s) => ({ ...s, data: s.data.map((v, i) => (v === null || !totals[i] ? null : v / totals[i])) }));
    value = { ...a.y, label: `${a.y.label}, share of each bar`, format: ".1%", agg: "ratio", mode: "total" };
  }
  return {
    kind,
    categories: shown,
    categoryLabel: a.cat.map((f) => f.label).join(" · "),
    series,
    value,
    truncated: cats.length > shown.length ? { shown: shown.length, total: cats.length } : null,
    stack,
    labels: chart.labels ?? false,
    canStack,
  };
}

const ADDS_UP = new Set(["sum", "count"]);
const SHARES = new Set(["pct_col", "pct_row"]);
const MAX_BINS = 20;

/** A round step near `raw`: 1, 2 or 5 times a power of ten (no 2.5: "35.0–37.5" reads badly). */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const near = [1, 2, 5, 10].map((m) => m * p);
  // the nearest one (on a log scale), so 2.1 becomes 2, not 5
  return clean(near.reduce((best, c) => (Math.abs(Math.log(c / raw)) < Math.abs(Math.log(best / raw)) ? c : best)));
}

const clean = (x: number) => Number(x.toPrecision(6)); // 0.30000000000000004 → 0.3

/** The round steps around `step`: two smaller, two bigger (… 1, 2, 5, 10 …). */
function stepsAround(step: number): number[] {
  const p = 10 ** Math.floor(Math.log10(step));
  const ladder = [-1, 0, 1, 2].flatMap((k) => [1, 2, 5].map((m) => clean(m * p * 10 ** k)));
  ladder.sort((a, b) => a - b);
  const i = ladder.indexOf(step);
  return ladder.slice(Math.max(0, i - 2), i + 3);
}

/** How many decimals a step needs to be written exactly (2 → 0, 2.5 → 1, 0.05 → 2). */
function decimals(x: number): number {
  const s = String(clean(x));
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/** A bin edge written as plainly as the step allows: "20", "2.5", "52%". */
export function binNumber(v: number, step: number, value: ResultValue): string {
  const pct = value.format.includes("%");
  const x = pct ? v * 100 : v;
  const dp = decimals(pct ? step * 100 : step);
  const s = x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (pct ? `${s}%` : s).replace("-", "−");
}

const MAX_HIST_BINS = 60; // a picked step that would make more bins than this is widened

/** How the rows in the table spread out over one number: counts in even, round-numbered bins. */
function histogram(
  cats: string[],
  sers: string[],
  at: (c: string, s: string) => number | null,
  a: Axes,
  picked: number | null | undefined,
  labels: boolean | undefined,
): ChartModel {
  const per = sers.map((s) => cats.map((c) => at(c, s)).filter((v): v is number => v !== null));
  const all = per.flat();
  if (all.length < 3) return { kind: "empty", reason: "A histogram needs at least a few rows with numbers." };
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const target = Math.min(MAX_BINS, Math.max(5, Math.ceil(Math.sqrt(all.length))));
  const autoStep = hi > lo ? niceStep((hi - lo) / target) : niceStep(Math.abs(lo) || 1);
  let step = picked && picked > 0 ? picked : autoStep;
  while ((hi - lo) / step > MAX_HIST_BINS) step = niceStep(step * 2.01);
  const start = clean(Math.floor(lo / step + 1e-9) * step);
  const n = Math.max(1, Math.floor((hi - start) / step + 1e-9) + 1);
  const steps = stepsAround(autoStep).filter((s) => (hi - lo) / s <= MAX_HIST_BINS && (hi - lo) / s >= 2);
  // "20–22": the low end counts, the high end belongs to the next bin
  const label = (i: number) => {
    const from = binNumber(clean(start + i * step), step, a.y);
    const to = binNumber(clean(start + (i + 1) * step), step, a.y);
    return `${from.replace(/%$/, "")}–${to}`; // "50–52%", not "50%–52%"
  };
  const counts = (vs: number[]) => {
    const out = new Array<number>(n).fill(0);
    for (const v of vs) out[Math.min(n - 1, Math.floor((v - start) / step + 1e-9))]++;
    return out;
  };
  const rowLabel = a.cat.map((f) => f.label).join(" · ") || "Row";
  return {
    kind: "histogram",
    categories: Array.from({ length: n }, (_, i) => label(i)),
    categoryLabel: a.y.label,
    series: sers.map((s, i) => ({ name: s || a.y.label, data: counts(per[i]) })),
    value: { ...a.y, key: "__count", label: `${rowLabel}s`, short: "N", format: ",.0f", agg: "count", mode: "total" },
    binned: a.y,
    step,
    autoStep,
    steps,
    rowLabel,
    count: all.length,
    labels: labels ?? false,
    truncated: null,
  };
}
