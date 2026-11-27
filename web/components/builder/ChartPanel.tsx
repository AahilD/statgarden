"use client";

import { useMemo, useState } from "react";
import { usePopover } from "@/lib/usePopover";
import { ShadeControls } from "@/components/table/ShadeBar";
import { Chart, currentTheme, pageFont } from "@/components/chart/Chart";
import type { FieldMeta, QueryResult } from "@/lib/api";
import { betterFor } from "@/lib/shade";
import { autoAxes, binNumber, buildChartModel, suggestKind, type ChartKind, type ChartModel, type Stack } from "@/lib/chartModel";
import { chartHeight, chartOption, isHorizontal } from "@/lib/chartOption";
import { downloadCsv, downloadPng } from "@/lib/exporting";
import type { Wide } from "@/lib/pivot";
import type { ChartSpec, ChartView, PivotSpec } from "@/lib/spec";
import { setView } from "@/lib/specOps";
import { spellTeams, useTeamNames, useWide } from "@/lib/teams";
import { TONE } from "@/lib/tones";
import { chartTitle, filterLine } from "@/lib/viewTitle";

type SetSpec = (fn: (s: PivotSpec) => PivotSpec) => void;

const VIEWS: { id: ChartView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "chart", label: "Chart" },
  { id: "both", label: "Both" },
];

const KIND_LABEL: Record<ChartKind, string> = {
  bar: "Bar",
  line: "Line",
  scatter: "Scatter",
  heatmap: "Heatmap",
  histogram: "Histogram",
};
const TYPES: ChartSpec["type"][] = ["auto", "bar", "line", "scatter", "heatmap", "histogram"];

const STACKS: { id: Stack; label: string }[] = [
  { id: "none", label: "Side by side" },
  { id: "stack", label: "Stacked" },
  { id: "pct", label: "100%" },
];

const ROW_CHOICES = [10, 25, 50, 100, 500];

/** Table / Chart / Both, how many rows, and the CSV download. */
/** Table / Chart / Both on the left; everything else about the view in one "View options" menu. */
export function ViewSwitch(p: {
  spec: PivotSpec;
  setSpec: SetSpec;
  result?: QueryResult;
  wide?: Wide;
  onCsv?: () => void;
}) {
  const { open, setOpen, ref } = usePopover(false);
  const limit = p.spec.limit;
  const choices = ROW_CHOICES.includes(limit) ? ROW_CHOICES : [...ROW_CHOICES, limit].sort((a, b) => a - b);
  const table = p.spec.chart.view !== "chart";
  const hasSplit = !!p.result && p.result.column_fields.length > 0 && (p.wide?.groups.length ?? 0) > 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented
        label="Show"
        options={VIEWS.map((v) => ({ id: v.id, label: v.label }))}
        value={p.spec.chart.view}
        onPick={(v) => p.setSpec((s) => setView(s, v))}
      />
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-btn border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-line-strong"
        >
          View options
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`text-ink-2 ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="View options"
            className="absolute right-0 top-full z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface-2 p-1.5 text-sm shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 px-2 py-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Rows</span>
              <Segmented
                label="How many rows"
                small
                options={choices.map((n) => ({ id: n, label: String(n) }))}
                value={limit}
                onPick={(n) => p.setSpec((s) => ({ ...s, limit: n }))}
              />
            </div>
            {table && p.result && p.result.values.length > 0 && (
              <div className="mt-1.5 border-t border-line pt-1.5">
                <ShadeControls
                  result={p.result}
                  spec={p.spec}
                  setSpec={p.setSpec}
                  hasSplit={hasSplit}
                  firstSplit={p.wide?.groups[0]?.labels.join(" · ")}
                />
              </div>
            )}
            {p.onCsv && (
              <div className="mt-1.5 border-t border-line px-2 pb-1 pt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    p.onCsv?.();
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm text-ink hover:border-line-strong"
                >
                  Download CSV
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string | number>(p: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={p.label} className="inline-flex rounded-btn border border-line bg-surface p-1">
      {p.options.map((o) => {
        const on = p.value === o.id;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => p.onPick(o.id)}
            className={`rounded-chip font-medium transition-colors ${p.small ? "min-w-8 px-2 py-0.5 font-mono text-xs" : "px-3.5 py-1 text-sm"} ${
              on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Under the results: how many rows came back and whether there are more. The load time sits quietly on the right. */
export function ResultFooter(p: {
  count?: number;
  limit: number;
  more?: boolean;
  ms?: number;
  cached?: boolean;
  loading: boolean;
}) {
  if (p.count === undefined) return null;
  const text = p.loading
    ? "Loading…"
    : p.count === 0
      ? ""
      : p.more
        ? `Top ${p.count.toLocaleString()} · more match, pick a bigger number in Rows`
        : p.count === 1
          ? "1 row"
          : `All ${p.count.toLocaleString()} rows that match`;
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-xs text-ink-2">
      <span aria-live="polite">{text}</span>
      {!p.loading && p.ms !== undefined && (
        <span
          className="font-mono text-[10px] opacity-60"
          title={p.cached ? "Loaded from memory" : "Time to load the numbers"}
        >
          {p.cached ? "cached" : `${Math.round(p.ms)} ms`}
        </span>
      )}
    </div>
  );
}

function SmallButton(p: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      disabled={p.disabled}
      className="flex items-center gap-1.5 rounded-btn border border-line px-2.5 py-1 font-mono text-xs text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-50"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
      </svg>
      {p.children}
    </button>
  );
}

export function csvAction(result: QueryResult | undefined, wide: Wide | undefined, spec: PivotSpec) {
  return result && wide ? () => downloadCsv(result, wide, chartTitle(buildChartModel(result, spec.chart))) : undefined;
}

/** The chart: type pills, the X / Y / Colour menus, the drawing and the PNG download. */
export function ChartPanel(p: {
  spec: PivotSpec;
  setSpec: SetSpec;
  result: QueryResult | undefined;
  fields: Map<string, FieldMeta>;
  error?: string;
}) {
  const c = p.spec.chart;
  const [saving, setSaving] = useState(false);
  const noValues = p.spec.values.length === 0;
  const teamNames = useTeamNames();
  const wideScreen = useWide();
  // full team names on wide screens; phones keep the abbreviations
  const result = useMemo(
    () => (p.result && wideScreen ? spellTeams(p.result, p.fields, teamNames) : p.result),
    [p.result, p.fields, teamNames, wideScreen],
  );
  const model = useMemo<ChartModel | null>(
    () =>
      noValues
        ? {
            kind: "empty",
            reason: "Add a value (a number like Points) to draw a chart.",
          }
        : result
          ? buildChartModel(result, c, (v) => betterFor(v, p.spec))
          : null,
    [noValues, result, c, p.spec],
  );
  const suggested = p.result ? suggestKind(p.result, c) : null;
  const title = model ? chartTitle(model) : "";
  const subtitle = filterLine(
    p.spec.filters,
    (id) => p.fields.get(id)?.label ?? id,
    (id) => p.fields.get(id),
  );

  async function png() {
    if (!model || model.kind === "empty") return;
    setSaving(true);
    try {
      // redraw off-screen at a fixed size, so the image looks the same from a phone or a wide screen
      const theme = currentTheme();
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:-10000px;top:0;width:1000px;height:${chartHeight(model)}px`;
      document.body.appendChild(box);
      const { echarts } = await import("@/lib/echarts");
      const off = echarts.init(box, undefined, { renderer: "canvas" });
      off.setOption(chartOption(model, theme, { animation: false }));
      const url = off.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: theme.surface,
      });
      off.dispose();
      box.remove();
      await downloadPng(url, {
        title,
        subtitle,
        theme,
        display: pageFont("font-display"),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="title-caps text-[13px]">Chart</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPES.map((t) => {
            const on = c.type === t;
            const label = t === "auto" ? (suggested ? `Auto · ${KIND_LABEL[suggested]}` : "Auto") : KIND_LABEL[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                title={t === "auto" ? "Picks a chart that fits your fields" : undefined}
                onClick={() => p.setSpec((s) => ({ ...s, chart: { ...s.chart, type: t } }))}
                className={`rounded-full px-3 py-0.5 font-mono text-xs ${
                  on ? TONE.orange.block : "border border-line text-ink-2 hover:border-line-strong hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {/* phones see the chart first; the X / Y / Colour menus sit under it */}
        {result && model && model.kind !== "empty" && (
          <div className="order-2 md:order-none">
            <AxisPicks spec={p.spec} setSpec={p.setSpec} result={result} model={model} fields={p.fields} />
          </div>
        )}
        <ChartBody model={model} title={title} subtitle={subtitle} error={p.error} />
        {model && model.kind !== "empty" && (
          <div className="order-1 flex flex-wrap items-center justify-between gap-3 md:order-none">
            {model.kind === "scatter" ? (
              <PointNames model={model} chart={c} setSpec={p.setSpec} />
            ) : model.kind === "histogram" ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {model.steps.length > 1 && (
                  <div className="flex items-center gap-2" title={`Auto picks ${binNumber(model.autoStep, model.autoStep, model.binned)}`}>
                    <span className="label-mono">Bin size</span>
                    <Segmented
                      label="Bin size"
                      small
                      options={model.steps.map((s) => ({ id: s, label: binNumber(s, s, model.binned) }))}
                      value={model.step}
                      onPick={(bin) => p.setSpec((sp) => ({ ...sp, chart: { ...sp.chart, bin: bin === model.autoStep ? null : bin } }))}
                    />
                  </div>
                )}
                <span className="text-xs text-ink-2">
                  Counts {p.result?.more ? "the first" : "all"} {model.count}{" "}
                  {model.count === 1 ? model.rowLabel.toLowerCase() : `${model.rowLabel.toLowerCase()}s`} that match
                  {p.result?.more ? ", the most one chart can count." : "."}
                </span>
              </div>
            ) : model.kind === "bar" && model.series.length > 1 ? (
              <div
                className="flex flex-wrap items-center gap-2"
                title={model.canStack ? undefined : "Only numbers that add up (attempts, points…) can be stacked"}
              >
                <span className="label-mono">Bars</span>
                {model.canStack ? (
                  <Segmented
                    label="How bars sit"
                    options={STACKS}
                    value={model.stack}
                    small
                    onPick={(stack) => p.setSpec((s) => ({ ...s, chart: { ...s.chart, stack } }))}
                  />
                ) : (
                  <span className="text-xs text-ink-2">Side by side (percentages can&apos;t be stacked)</span>
                )}
              </div>
            ) : (
              <span className="text-xs text-ink-2">
                {model.truncated ? `Showing the first ${model.truncated.shown} of ${model.truncated.total}.` : ""}
              </span>
            )}
            <div className="flex items-center gap-3">
              {/* single-colour sideways bars always show their numbers */}
              {(model.kind === "histogram" || (model.kind === "bar" && !(model.series.length === 1 && isHorizontal(model)))) && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2 hover:text-ink">
                  <input
                    type="checkbox"
                    checked={model.labels}
                    onChange={(e) => p.setSpec((s) => ({ ...s, chart: { ...s.chart, labels: e.target.checked } }))}
                    className="accent-[var(--orange)]"
                  />
                  Show numbers
                </label>
              )}
              <SmallButton onClick={png} disabled={saving}>
                {saving ? "Saving…" : "PNG"}
              </SmallButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartBody(p: { model: ChartModel | null; title: string; subtitle: string; error?: string }) {
  if (p.error) return <p className="py-16 text-center text-sm text-red">{p.error}</p>;
  if (!p.model) return <div className="h-[380px] animate-pulse rounded-btn bg-sunken" />;
  if (p.model.kind === "empty") return <p className="py-16 text-center text-sm text-ink-2">{p.model.reason}</p>;
  return (
    <figure>
      <figcaption className="mb-3 text-center">
        <span className="title-caps block text-[15px]">{p.title}</span>
        {p.subtitle && <span className="label-mono mt-1 block normal-case">{p.subtitle}</span>}
      </figcaption>
      <Chart model={p.model} label={p.title} />
    </figure>
  );
}

/**
 * X axis / Y axis / Colour as small menus. Each starts on "Auto · <what the chart picked>"
 * and only lists fields already in the table: the chart is drawn from the table's query.
 */
function AxisPicks(p: {
  spec: PivotSpec;
  setSpec: SetSpec;
  result: QueryResult;
  model: ChartModel;
  fields: Map<string, FieldMeta>;
}) {
  const c = p.spec.chart;
  const auto = autoAxes(p.result, c);
  const names = (fs: { label: string }[] | undefined) => fs?.map((f) => f.label).join(" · ") || "none";
  const dims = [...p.result.row_fields, ...p.result.column_fields];
  const set = (key: "x" | "y" | "color", id: string) =>
    p.setSpec((s) => ({ ...s, chart: { ...s.chart, [key]: id || null } }));
  // a pick that's no longer in the table falls back to Auto (the chart ignores it too)
  const pick = (id: string | null | undefined, ids: string[]) => (id && ids.includes(id) ? id : "");
  const valueChoices = p.result.values.map((v) => ({
    id: v.field,
    label: v.label,
  }));
  const dimChoices = dims.map((f) => ({ id: f.id, label: f.label }));
  const scatter = p.model.kind === "scatter" ? p.model : null;
  const hist = p.model.kind === "histogram" ? p.model : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {scatter ? (
        <AxisSelect
          label="X axis"
          title="On a scatter, X is the other number in Values"
          choices={[]}
          value=""
          auto={scatter.x.label}
          onChange={() => {}}
        />
      ) : hist ? (
        <AxisSelect
          label="X axis"
          title="The number put in bins along the bottom"
          choices={valueChoices}
          value={pick(
            c.y,
            valueChoices.map((v) => v.id),
          )}
          auto={auto.y?.label ?? ""}
          onChange={(id) => set("y", id)}
        />
      ) : (
        <AxisSelect
          label="X axis"
          title="Along the bottom"
          choices={dimChoices}
          value={pick(
            c.x,
            dims.map((f) => f.id),
          )}
          auto={names(auto.cat)}
          onChange={(id) => set("x", id)}
        />
      )}
      {hist ? (
        <AxisSelect
          label="Y axis"
          title="A histogram counts rows"
          choices={[]}
          value=""
          auto={`How many ${hist.rowLabel}s`}
          onChange={() => {}}
        />
      ) : (
        <AxisSelect
          label="Y axis"
          title="The number that's plotted"
          choices={valueChoices}
          value={pick(
            c.y,
            valueChoices.map((v) => v.id),
          )}
          auto={auto.y?.label ?? ""}
          onChange={(id) => set("y", id)}
        />
      )}
      <AxisSelect
        label="Colour"
        title="Splits into coloured groups"
        choices={dimChoices}
        value={pick(
          c.color,
          dims.map((f) => f.id),
        )}
        auto={names(auto.ser)}
        onChange={(id) => set("color", id)}
      />
    </div>
  );
}

function AxisSelect(p: {
  label: string;
  title: string;
  choices: { id: string; label: string }[];
  value: string;
  auto: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs" title={p.title}>
      <span className="label-mono shrink-0">{p.label}</span>
      <select
        value={p.value}
        disabled={p.choices.length === 0}
        onChange={(e) => p.onChange(e.target.value)}
        className="min-w-0 max-w-[14rem] truncate rounded-btn border border-line bg-surface px-2 py-1 text-ink hover:border-line-strong disabled:opacity-70 disabled:hover:border-line"
      >
        <option value="">Auto · {p.auto}</option>
        {p.choices.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const NAME_MODES = [
  {
    id: "auto",
    label: "Standouts",
    title: "Name the points furthest up and to the right",
  },
  { id: "all", label: "All", title: "Name every point that has room" },
  { id: "none", label: "None", title: "Only the ones you pick" },
] as const;

/** Scatter: which points get names, and picking players to always name and ring. */
function PointNames(p: { model: Extract<ChartModel, { kind: "scatter" }>; chart: ChartSpec; setSpec: SetSpec }) {
  const { open, setOpen, ref } = usePopover(false);
  const [q, setQ] = useState("");
  const all = useMemo(
    () => [...new Set(p.model.series.flatMap((s) => s.points.map((pt) => pt.name)))].sort((a, b) => a.localeCompare(b)),
    [p.model],
  );
  const picked = p.chart.picked ?? [];
  const setChart = (patch: Partial<ChartSpec>) => p.setSpec((s) => ({ ...s, chart: { ...s.chart, ...patch } }));
  const toggle = (n: string) =>
    setChart({
      picked: picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n].slice(-30),
    });
  const t = q.trim().toLowerCase();
  const matches = all.filter((n) => !t || n.toLowerCase().includes(t)).slice(0, 60);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="label-mono">Names</span>
      <div
        role="radiogroup"
        aria-label="Names on the chart"
        className="inline-flex rounded-btn border border-line bg-sunken p-0.5"
      >
        {NAME_MODES.map((m) => {
          const on = (p.chart.names ?? "auto") === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={m.title}
              onClick={() => setChart({ names: m.id })}
              className={`rounded-chip px-2.5 py-0.5 font-medium ${on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-btn border border-line px-2.5 py-1 font-medium text-ink hover:border-line-strong"
        >
          {picked.length ? `Picked (${picked.length})` : "Pick…"}
        </button>
        {open && (
          <div className="absolute bottom-full left-0 z-30 mb-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface-2 p-2 shadow-xl">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a name"
              aria-label="Find a name to pick"
              className="w-full rounded-btn border border-line bg-sunken px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
            <ul className="mt-1.5 max-h-56 overflow-y-auto">
              {picked
                .filter((n) => !all.includes(n))
                .map((n) => (
                  <li key={n}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-chip px-1.5 py-1 text-sm text-ink-2 hover:bg-sunken">
                      <input type="checkbox" checked onChange={() => toggle(n)} className="accent-[var(--orange)]" />
                      <span className="truncate">{n}</span>
                      <span className="ml-auto shrink-0 text-[11px]">not on chart</span>
                    </label>
                  </li>
                ))}
              {matches.map((n) => (
                <li key={n}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-chip px-1.5 py-1 text-sm hover:bg-sunken">
                    <input
                      type="checkbox"
                      checked={picked.includes(n)}
                      onChange={() => toggle(n)}
                      className="accent-[var(--orange)]"
                    />
                    <span className="truncate">{n}</span>
                  </label>
                </li>
              ))}
              {matches.length === 0 && <li className="px-1.5 py-1 text-sm text-ink-2">No matches on the chart.</li>}
            </ul>
            {picked.length > 0 && (
              <button
                type="button"
                onClick={() => setChart({ picked: [] })}
                className="mt-1.5 text-xs text-ink-2 hover:text-ink"
              >
                Clear picks
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
