"use client";

// Table shading settings: how cells are compared, and which way is better for each value.
// Lives in the View options menu (see ViewSwitch).
import type { QueryResult, ResultValue } from "@/lib/api";
import { type Better, SHADE_HELP, SHADE_LABEL, shadeModes, specValue } from "@/lib/shade";
import type { PivotSpec, ShadeMode } from "@/lib/spec";

const BETTER: { id: Better; label: string; title: string }[] = [
  { id: "higher", label: "↑", title: "Higher is better" },
  { id: "lower", label: "↓", title: "Lower is better" },
  { id: "none", label: "–", title: "Don't shade" },
];

export function ShadeControls(p: {
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
  const label = (m: ShadeMode) => (m === "baseline" && p.firstSplit ? `Vs ${p.firstSplit}` : SHADE_LABEL[m]);

  const setBetter = (v: ResultValue, better: Better) =>
    p.setSpec((s) => ({
      ...s,
      values: s.values.map((x) => {
        if (x !== specValue(v, s)) return x;
        const stock: Better = v.higher_is_better === null ? "none" : v.higher_is_better ? "higher" : "lower";
        return { ...x, better: better === stock ? undefined : better }; // back to the default: drop it from the link
      }),
    }));

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Shading</p>
        {mode !== "off" && (
          <span className="flex items-center gap-2.5 text-[11px] text-ink-2" aria-hidden>
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-[2px] bg-green" /> better
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-[2px] bg-red" /> worse
            </span>
          </span>
        )}
      </div>
      <div role="radiogroup" aria-label="Shading">
        {modes.map((m) => {
          const on = m === mode;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => p.setSpec((s) => ({ ...s, shade: m }))}
              className="flex w-full items-start gap-2.5 rounded-chip px-2 py-1.5 text-left hover:bg-sunken"
            >
              <span
                aria-hidden
                className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line-strong"}`}
              >
                {on && <i className="h-1.5 w-1.5 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{label(m)}</span>
                <span className="block text-xs text-ink-2">{SHADE_HELP[m]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {mode !== "off" && (
        <div className="mt-1.5 border-t border-line pt-1.5">
          <p className="px-2 pb-1 pt-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Better is</p>
          <ul>
            {p.result.values.map((v) => {
              const stock: Better = v.higher_is_better === null ? "none" : v.higher_is_better ? "higher" : "lower";
              const now = specValue(v, p.spec)?.better ?? stock;
              return (
                <li key={v.key} className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="truncate text-[13px] text-ink" title={v.label}>
                    {v.label}
                  </span>
                  <span
                    role="radiogroup"
                    aria-label={`Which way is better for ${v.label}`}
                    className="inline-flex shrink-0 rounded-chip border border-line bg-sunken p-0.5"
                  >
                    {BETTER.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        role="radio"
                        aria-checked={now === b.id}
                        title={b.id === stock ? `${b.title} (default)` : b.title}
                        onClick={() => setBetter(v, b.id)}
                        className={`w-7 rounded-[4px] py-0.5 font-mono text-xs ${now === b.id ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
