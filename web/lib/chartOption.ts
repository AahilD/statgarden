// ECharts options from a chart model. No DOM here, so the Lab, the PNG export
// and the server-side link preview all draw the same chart.
import type { EChartsCoreOption } from "echarts/core";
import { standouts } from "./standouts";
import type { ChartModel } from "./chartModel";
import { formatValue } from "./format";

export type ChartTheme = {
  text: string;
  text2: string;
  line: string;
  surface: string;
  sans: string;
  mono: string;
  series: string[];
  heat: [string, string]; // low → high
  hover: string; // the band behind a hovered bar
};

// Series colours: the four job colours first, then the stripe's teal and two grays.
const SERIES = ["#f88436", "#3d45aa", "#2e5a44", "#da3d20", "#4e878c", "#8c8c94", "#c9b9a6"];

export const LIGHT: ChartTheme = {
  text: "#18181b",
  text2: "#52525b",
  line: "#e7e7e9",
  surface: "#ffffff",
  sans: "Roboto, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  series: SERIES,
  heat: ["#fff4ec", "#f88436"],
  hover: "rgba(24, 24, 27, 0.05)",
};

export const DARK: ChartTheme = {
  ...LIGHT,
  text: "#f4f4f5",
  text2: "#a1a1aa",
  line: "#232326",
  surface: "#141416",
  heat: ["#1f1a17", "#f88436"],
  hover: "rgba(244, 244, 245, 0.06)",
};

const longest = (xs: string[]) => xs.reduce((m, x) => Math.max(m, x.length), 0);

/** Long or many category labels read better as horizontal bars. */
export function isHorizontal(model: ChartModel) {
  return model.kind === "bar" && (model.categories.length > 8 || longest(model.categories) > 12);
}

/** Pixel height that fits the chart (horizontal bars grow with the number of rows). */
export function chartHeight(model: ChartModel) {
  if (model.kind === "bar" && isHorizontal(model)) {
    const per = 18 + 8 * Math.min(model.series.length, 4);
    return Math.max(320, Math.min(1100, 90 + model.categories.length * per));
  }
  if (model.kind === "heatmap") return Math.max(320, Math.min(1100, 110 + model.ys.length * 26));
  return 380;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type TipParam = { seriesName: string; name: string; value: unknown; color: string; data?: unknown; marker?: string };

export function chartOption(
  model: ChartModel,
  t: ChartTheme,
  opts: { animation?: boolean; narrow?: boolean } = {},
): EChartsCoreOption {
  if (model.kind === "empty") return {};
  const nameLen = opts.narrow ? 14 : 26; // phones get shorter row names
  const axisLabel = { color: t.text2, fontFamily: t.mono, fontSize: 11 };
  const axisName = { color: t.text2, fontFamily: t.sans, fontSize: 12 };
  const splitLine = { lineStyle: { color: t.line } };
  const base = {
    animation: opts.animation ?? true,
    animationDuration: 400,
    color: t.series,
    textStyle: { fontFamily: t.sans, color: t.text },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.line,
      textStyle: { color: t.text, fontFamily: t.sans, fontSize: 12 },
      extraCssText: "border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.12);",
    },
  };
  const legend = (names: string[]) =>
    names.length > 1
      ? {
          legend: {
            type: "scroll",
            data: names, // only the real series (not the picked-points layer)
            top: 0,
            icon: "roundRect",
            itemWidth: 12,
            itemHeight: 12,
            textStyle: { color: t.text2, fontFamily: t.sans, fontSize: 12 },
            pageTextStyle: { color: t.text2 },
          },
        }
      : {};
  const top = (names: string[]) => (names.length > 1 ? 40 : 16);

  if (model.kind === "scatter") {
    const fx = (v: number) => formatValue(v, model.x);
    const fy = (v: number) => formatValue(v, model.y);
    // which points get names: the standouts (see lib/standouts.ts), all, or none, plus any picked
    const all = model.series.flatMap((s) => s.points);
    const picked = new Set(model.picked);
    const named = new Set(
      model.names === "all"
        ? all.map((p) => p.name)
        : model.names === "none"
          ? []
          : standouts(all, model.dir),
    );
    for (const n of picked) named.add(n);
    const names = model.series.map((s) => s.name);
    return {
      ...base,
      ...legend(names),
      grid: { left: 34, right: 24, top: top(names), bottom: 34, containLabel: true },
      xAxis: { type: "value", name: model.x.label, nameLocation: "middle", nameGap: 28, nameTextStyle: axisName, scale: true, axisLabel: { ...axisLabel, formatter: fx }, splitLine },
      yAxis: { type: "value", name: model.y.label, nameLocation: "middle", nameGap: 44, nameTextStyle: axisName, scale: true, axisLabel: { ...axisLabel, formatter: fy }, splitLine },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (p: TipParam) => {
          const d = p.data as { name: string; value: [number, number] };
          return `<b>${d.name}</b><br/>${model.x.label}: ${fx(d.value[0])}<br/>${model.y.label}: ${fy(d.value[1])}`;
        },
      },
      series: [
        ...model.series.map((s) => ({
          type: "scatter",
          name: s.name,
          symbolSize: 9,
          itemStyle: { opacity: 0.85, borderColor: t.surface, borderWidth: 1 },
          emphasis: { focus: "series" },
          labelLayout: { hideOverlap: true },
          data: s.points
            .filter((p) => !picked.has(p.name))
            .map((p) => ({
              name: p.name,
              value: [p.x, p.y],
              label: { show: named.has(p.name), formatter: p.name, position: "top", color: t.text, fontSize: 11, fontFamily: t.sans },
            })),
        })),
        // picked points on top, ringed, and always named
        ...(picked.size
          ? [
              {
                type: "scatter",
                name: "Picked",
                symbolSize: 13,
                z: 5,
                labelLayout: { hideOverlap: false },
                data: model.series.flatMap((s, i) =>
                  s.points
                    .filter((p) => picked.has(p.name))
                    .map((p) => ({
                      name: p.name,
                      value: [p.x, p.y],
                      itemStyle: { color: t.series[i % t.series.length], opacity: 1, borderColor: t.text, borderWidth: 2 },
                      label: { show: true, formatter: p.name, position: "top", color: t.text, fontSize: 11, fontWeight: 600, fontFamily: t.sans },
                    })),
                ),
              },
            ]
          : []),
      ],
    };
  }

  if (model.kind === "heatmap") {
    const vals = model.cells.map((c) => c[2]).filter((v): v is number => v !== null);
    const f = (v: number) => formatValue(v, model.value);
    return {
      ...base,
      grid: { left: 8, right: 16, top: 16, bottom: 56, containLabel: true },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (p: TipParam) => {
          const [x, y, v] = p.value as [number, number, number | null];
          return `<b>${model.ys[y]}</b> · ${model.xs[x]}<br/>${model.value.label}: ${v === null ? "—" : f(v)}`;
        },
      },
      xAxis: { type: "category", data: model.xs, position: "top", axisLabel: { ...axisLabel, interval: 0, rotate: model.xs.length > 8 ? 40 : 0 }, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: "category", data: model.ys, inverse: true, axisLabel: { ...axisLabel, fontFamily: t.sans, fontSize: 12, color: t.text, formatter: (s: string) => clip(s, nameLen) }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: {
        min: Math.min(...vals),
        max: Math.max(...vals),
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemWidth: 12,
        itemHeight: 160,
        text: [f(Math.max(...vals)), f(Math.min(...vals))],
        textStyle: { color: t.text2, fontFamily: t.mono, fontSize: 11 },
        inRange: { color: t.heat },
      },
      series: [
        {
          type: "heatmap",
          name: model.value.label,
          data: model.cells,
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
          label: { show: model.xs.length <= 10 && model.ys.length <= 20, fontFamily: t.mono, fontSize: 10, color: t.text, formatter: (p: TipParam) => { const v = (p.value as number[])[2]; return v === null ? "" : f(v); } },
          emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } },
        },
      ],
    };
  }

  // bar, line and histogram
  const f = (v: number) => formatValue(v, model.value);
  const names = model.series.map((s) => s.name);
  const flip = isHorizontal(model);
  const hist = model.kind === "histogram";
  const stacked = (model.kind === "bar" && model.stack !== "none") || (hist && model.series.length > 1);
  const pct = model.kind === "bar" && model.stack === "pct";
  const cat = {
    type: "category",
    data: model.categories,
    inverse: flip, // first row at the top, like the table
    axisLabel: flip
      ? { ...axisLabel, fontFamily: t.sans, fontSize: 12, color: t.text, formatter: (s: string) => clip(s, nameLen) }
      : { ...axisLabel, hideOverlap: true, formatter: (s: string) => clip(s, 14) },
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    ...(hist ? { name: model.categoryLabel, nameLocation: "middle", nameGap: 30, nameTextStyle: axisName } : {}),
  };
  // single-series horizontal bars always print their numbers, so their value axis can stay quiet;
  // other bars print them when "Numbers on bars" is on
  const quietAxis = flip && model.series.length === 1;
  const asked = model.kind !== "line" && model.labels;
  const labelled = quietAxis || asked;
  const onTop = asked && !flip && !stacked;
  const val = {
    type: "value",
    axisLabel: { ...axisLabel, show: !quietAxis, hideOverlap: true, formatter: f },
    splitNumber: opts.narrow ? 3 : 5,
    splitLine,
    scale: model.kind === "line",
    // 100% bars: quarters, written as whole percents
    ...(pct ? { max: 1, interval: 0.25, axisLabel: { ...axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } } : {}),
    ...(hist ? { minInterval: 1, name: model.value.label, nameTextStyle: axisName } : {}),
  };
  const many = model.categories.length > 12;
  return {
    ...base,
    ...legend(names),
    grid: {
      left: 8,
      right: flip ? 48 : 16,
      top: top(names) + (hist ? 10 : 0) + (onTop ? 10 : 0),
      bottom: hist ? 28 : 8,
      containLabel: true,
    },
    tooltip: {
      ...base.tooltip,
      trigger: "axis",
      axisPointer: { type: model.kind === "line" ? "line" : "shadow", shadowStyle: { color: t.hover }, lineStyle: { color: t.text2 } },
      valueFormatter: (v: unknown) => (typeof v === "number" ? f(v) : "—"),
      // a histogram reads "20–22 · Points per game" then "48 players", not the count beside the stat's name
      ...(hist ? { formatter: (ps: TipParam[]) => histTip(ps, model.categoryLabel, model.rowLabel, t.text2) } : {}),
    },
    xAxis: flip ? val : cat,
    yAxis: flip ? cat : val,
    series: model.series.map((s) =>
      model.kind === "line"
        ? {
            type: "line",
            name: s.name,
            data: s.data,
            smooth: false,
            connectNulls: true,
            symbol: "circle",
            symbolSize: many ? 4 : 7,
            lineStyle: { width: 2.5 },
            emphasis: { focus: "series" },
          }
        : {
            type: "bar",
            name: s.name,
            data: s.data,
            ...(stacked ? { stack: "all" } : {}),
            ...(hist ? { barCategoryGap: "6%" } : { barMaxWidth: stacked ? 48 : 36 }),
            // stacked parts are split by a thin line of the card colour instead of rounded ends
            itemStyle: stacked
              ? { borderRadius: 0, borderColor: t.surface, borderWidth: 1 }
              : { borderRadius: flip ? [0, 4, 4, 0] : [4, 4, 0, 0] },
            label: {
              show: labelled,
              position: stacked ? "inside" : flip ? "right" : "top",
              fontFamily: t.mono,
              fontSize: model.categories.length > 16 ? 10 : 11,
              // inside a coloured part: white with a soft edge, so it reads on every series colour
              ...(stacked
                ? { color: "#FCFCFC", textBorderColor: "rgba(0,0,0,0.35)", textBorderWidth: 2 }
                : { color: t.text2 }),
              // empty bins and missing bars stay blank
              formatter: (p: TipParam) => (typeof p.value === "number" && !(hist && p.value === 0) ? f(p.value) : ""),
            },
            labelLayout: { hideOverlap: true },
            emphasis: { focus: "series" },
          },
    ),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Histogram hover: the bin on top, then how many rows fall in it (per colour, plus a total). */
function histTip(ps: TipParam[], binned: string, rowLabel: string, faint: string): string {
  const many = (n: number) => `${n.toLocaleString("en-US")} ${(n === 1 ? rowLabel : `${rowLabel}s`).toLowerCase()}`;
  const head = `<b>${esc(ps[0]?.name ?? "")}</b> <span style="color:${faint}">· ${esc(binned)}</span>`;
  const n = (p: TipParam) => (typeof p.value === "number" ? p.value : 0);
  if (ps.length === 1) return `${head}<br/>${many(n(ps[0]))}`;
  const lines = ps.map((p) => `${p.marker ?? ""}${esc(p.seriesName)}: ${many(n(p))}`);
  const total = ps.reduce((t, p) => t + n(p), 0);
  return `${head}<br/>${lines.join("<br/>")}<br/><span style="color:${faint}">Total: ${many(total)}</span>`;
}
