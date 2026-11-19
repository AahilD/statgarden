"use client";

import { useMemo, useState } from "react";
import { Chart, currentTheme, pageFont } from "@/components/chart/Chart";
import type { FieldMeta, QueryResult } from "@/lib/api";
import { buildChartModel, suggestKind, type ChartKind, type ChartModel } from "@/lib/chartModel";
import { chartHeight, chartOption } from "@/lib/chartOption";
import { downloadCsv, downloadPng } from "@/lib/exporting";
import type { Wide } from "@/lib/pivot";
import type { ChartSpec, ChartView, PivotSpec } from "@/lib/spec";
import { setView } from "@/lib/specOps";
import { TONE } from "@/lib/tones";
import { chartTitle, filterLine } from "@/lib/viewTitle";

type SetSpec = (fn: (s: PivotSpec) => PivotSpec) => void;

const VIEWS: { id: ChartView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "chart", label: "Chart" },
  { id: "both", label: "Both" },
];

const KIND_LABEL: Record<ChartKind, string> = { bar: "Bar", line: "Line", scatter: "Scatter", heatmap: "Heatmap" };
const TYPES: ChartSpec["type"][] = ["auto", "bar", "line", "scatter", "heatmap"];

/** Table / Chart / Both, how many rows came back, and the CSV download. */
export function ViewSwitch(p: { view: ChartView; setSpec: SetSpec; status: string; onCsv?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="radiogroup" aria-label="Show" className="inline-flex rounded-btn border border-line bg-surface p-1">
        {VIEWS.map((v) => {
          const on = p.view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => p.setSpec((s) => setView(s, v.id))}
              className={`rounded-chip px-3.5 py-1 text-sm font-medium transition-colors ${
                on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <span className="label-mono" aria-live="polite">
          {p.status}
        </span>
        {p.onCsv && <SmallButton onClick={p.onCsv}>CSV</SmallButton>}
      </div>
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
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
      </svg>
      {p.children}
    </button>
  );
}

export function csvAction(result: QueryResult | undefined, wide: Wide | undefined, spec: PivotSpec) {
  return result && wide
    ? () => downloadCsv(result, wide, chartTitle(buildChartModel(result, spec.chart)))
    : undefined;
}

/** The chart: type pills, the X / Y / Colour wells (children), the drawing and the PNG download. */
export function ChartPanel(p: {
  spec: PivotSpec;
  setSpec: SetSpec;
  result: QueryResult | undefined;
  fields: Map<string, FieldMeta>;
  error?: string;
  children: React.ReactNode;
}) {
  const c = p.spec.chart;
  const [saving, setSaving] = useState(false);
  const noValues = p.spec.values.length === 0;
  const model = useMemo<ChartModel | null>(
    () =>
      noValues
        ? { kind: "empty", reason: "Add a value (a number like Points) to draw a chart." }
        : p.result
          ? buildChartModel(p.result, c)
          : null,
    [noValues, p.result, c],
  );
  const suggested = p.result ? suggestKind(p.result, c) : null;
  const title = model ? chartTitle(model) : "";
  const subtitle = filterLine(p.spec.filters, (id) => p.fields.get(id)?.label ?? id);

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
      const url = off.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: theme.surface });
      off.dispose();
      box.remove();
      await downloadPng(url, { title, subtitle, theme, display: pageFont("font-display") });
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
        {/* phones see the chart first; the X / Y / Colour wells sit under it */}
        <div className="order-2 md:order-none">{p.children}</div>
        <ChartBody model={model} title={title} subtitle={subtitle} error={p.error} />
        {model && model.kind !== "empty" && (
          <div className="order-1 flex flex-wrap items-center justify-between gap-3 md:order-none">
            <span className="text-xs text-ink-2">
              {model.truncated ? `Showing the first ${model.truncated.shown} of ${model.truncated.total}.` : ""}
            </span>
            <SmallButton onClick={png} disabled={saving}>
              {saving ? "Saving…" : "PNG"}
            </SmallButton>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartBody(p: {
  model: ChartModel | null;
  title: string;
  subtitle: string;
  error?: string;
}) {
  if (p.error) return <p className="py-16 text-center text-sm text-red">{p.error}</p>;
  if (!p.model) return <div className="h-[380px] animate-pulse rounded-btn bg-bg" />;
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
