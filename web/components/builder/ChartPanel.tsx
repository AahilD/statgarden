"use client";

import type { ChartSpec, ChartView, PivotSpec } from "@/lib/spec";
import { setView } from "@/lib/specOps";
import { SERIES, TONE } from "@/lib/tones";

type SetSpec = (fn: (s: PivotSpec) => PivotSpec) => void;

const VIEWS: { id: ChartView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "chart", label: "Chart" },
  { id: "both", label: "Both" },
];

const TYPES: { id: ChartSpec["type"]; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "scatter", label: "Scatter" },
  { id: "heatmap", label: "Heatmap" },
];

/** Table / Chart / Both, plus how many rows came back. */
export function ViewSwitch(p: { view: ChartView; setSpec: SetSpec; status: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="radiogroup" aria-label="Show" className="inline-flex rounded-[8px] border border-line bg-surface p-1">
        {VIEWS.map((v) => {
          const on = p.view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => p.setSpec((s) => setView(s, v.id))}
              className={`rounded-[6px] px-3.5 py-1 text-sm font-medium transition-colors ${
                on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>
      <span className="label-mono" aria-live="polite">
        {p.status}
      </span>
    </div>
  );
}

/** Where charts get built. The drop zones work and save to the link; drawing comes in Milestone 5. */
export function ChartPanel(p: { spec: PivotSpec; setSpec: SetSpec; children: React.ReactNode }) {
  const c = p.spec.chart;
  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="title-caps text-[13px]">Chart</span>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => {
            const on = c.type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => p.setSpec((s) => ({ ...s, chart: { ...s.chart, type: t.id } }))}
                className={`rounded-full px-3 py-0.5 font-mono text-xs ${
                  on ? TONE.orange.block : "border border-line text-ink-2 hover:border-line-strong hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {p.children}
        <ComingSoon type={c.type} />
      </div>
    </div>
  );
}

function ComingSoon({ type }: { type: ChartSpec["type"] }) {
  const bars = [62, 88, 45, 74, 96, 58, 80, 38];
  return (
    <div className="relative flex min-h-48 flex-col justify-end overflow-hidden rounded-[8px] border-2 border-dashed border-line-strong p-4">
      <div aria-hidden className="flex h-28 items-end gap-2 opacity-90">
        {bars.map((h, i) => (
          <i
            key={i}
            className={`flex-1 rounded-t-[4px] ${TONE[SERIES[i % SERIES.length]].block}`}
            style={{ height: `${type === "line" ? 100 - h / 2 : h}%`, opacity: type === "heatmap" ? 0.35 + (h / 100) * 0.65 : 1 }}
          />
        ))}
      </div>
      <p className="mt-4 text-sm">
        <span className="font-medium">Charts are coming next.</span>{" "}
        <span className="text-ink-2">Pick X, Y and Colour now; they&apos;re saved in the link and will draw once charts land.</span>
      </p>
    </div>
  );
}
