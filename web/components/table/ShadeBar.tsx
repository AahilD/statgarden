"use client";

// The strip above the table: the colour key, how to shade, and which way is better for each value.
import type { QueryResult, ResultValue } from "@/lib/api";
import { type Better, betterFor, SHADE_HELP, SHADE_LABEL, shadeModes, specValue } from "@/lib/shade";
import type { PivotSpec, ShadeMode } from "@/lib/spec";

const BETTER_LABEL: Record<Better, string> = { higher: "Higher is better", lower: "Lower is better", none: "No shading" };

export function ShadeBar(p: {
  result: QueryResult;
  spec: PivotSpec;
  setSpec: (fn: (s: PivotSpec) => PivotSpec) => void;
  hasSplit: boolean;
  firstSplit?: string;
}) {
  if (p.result.values.length === 0) return null;
  const modes = shadeModes(p.hasSplit);
  // a split mode saved in the link but no split right now: show it as rank, which is what's drawn
  const mode: ShadeMode = modes.includes(p.spec.shade) ? p.spec.shade : "rank";
  const label = (m: ShadeMode) => (m === "baseline" && p.firstSplit ? `Against ${p.firstSplit}` : SHADE_LABEL[m]);

  const setBetter = (v: ResultValue, better: Better | "auto") =>
    p.setSpec((s) => ({
      ...s,
      values: s.values.map((x) =>
        x === specValue(v, s) ? { ...x, better: better === "auto" ? undefined : better } : x,
      ),
    }));

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-b border-line px-4 py-2 text-xs text-ink-2">
      {mode !== "off" && (
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-green" /> better
          </span>
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-red" /> worse
          </span>
        </span>
      )}

      <label className="flex items-center gap-1.5" title={SHADE_HELP[mode]}>
        <span className="label-mono">Shade</span>
        <select
          value={mode}
          onChange={(e) => p.setSpec((s) => ({ ...s, shade: e.target.value as ShadeMode }))}
          className="rounded-chip border border-line bg-bg px-1.5 py-1 text-xs text-ink"
        >
          {modes.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </select>
      </label>

      {mode !== "off" && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-chip border border-line px-2 py-1 text-ink hover:bg-bg [&::-webkit-details-marker]:hidden">
            Which way is better ▾
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3 shadow-lg">
            <p className="mb-2 text-[11px] leading-snug text-ink-2">{SHADE_HELP[mode]}</p>
            <ul className="space-y-1.5">
              {p.result.values.map((v) => {
                const own = specValue(v, p.spec)?.better;
                const stock = v.higher_is_better === null ? "none" : v.higher_is_better ? "higher" : "lower";
                return (
                  <li key={v.key} className="flex items-center justify-between gap-2">
                    <span className="truncate text-ink" title={v.label}>
                      {v.label}
                    </span>
                    <select
                      aria-label={`Which way is better for ${v.label}`}
                      value={own ?? "auto"}
                      onChange={(e) => setBetter(v, e.target.value as Better | "auto")}
                      className={`shrink-0 rounded-chip border border-line bg-bg px-1.5 py-0.5 text-[11px] ${own ? "text-accent-ink" : "text-ink"}`}
                    >
                      <option value="auto">{BETTER_LABEL[stock]} (default)</option>
                      {(["higher", "lower", "none"] as const)
                        .filter((b) => b !== stock)
                        .map((b) => (
                          <option key={b} value={b}>
                            {BETTER_LABEL[b]}
                          </option>
                        ))}
                    </select>
                  </li>
                );
              })}
            </ul>
            {p.result.values.every((v) => betterFor(v, p.spec) === "none") && (
              <p className="mt-2 text-[11px] text-ink-2">Pick a direction above to shade a stat.</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
