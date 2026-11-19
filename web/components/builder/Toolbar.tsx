"use client";

import { useState } from "react";
import type { SeasonMeta } from "@/lib/api";
import { encodeSpec, type PivotSpec } from "@/lib/spec";
import { filterValue, toggleIn } from "@/lib/specOps";
import { usePopover } from "@/lib/usePopover";

const SEASON_TYPES = ["Regular Season", "Play-In", "Playoffs"];

export function Toolbar(p: {
  spec: PivotSpec;
  setSpec: (fn: (s: PivotSpec) => PivotSpec) => void;
  seasons: SeasonMeta[];
}) {
  const [copied, setCopied] = useState(false);
  const seasons = [...new Set(p.seasons.map((s) => s.season))].sort().reverse();
  const picked = filterValue(p.spec, "season") as string[];
  const types = filterValue(p.spec, "season_type") as string[];

  async function share() {
    const url = `${window.location.origin}/lab?v=${encodeSpec(p.spec)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
      <h1 className="title-caps text-2xl leading-none">Lab</h1>

      <div className="flex items-center gap-2">
        <span className="label-mono">Season</span>
        <SeasonPicker
          seasons={seasons}
          picked={picked}
          onToggle={(season) => p.setSpec((x) => toggleIn(x, "season", season))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono">Type</span>
        <div className="flex flex-wrap gap-1.5">
          {SEASON_TYPES.map((t) => (
            <Toggle key={t} on={types.includes(t)} onClick={() => p.setSpec((x) => toggleIn(x, "season_type", t))}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="label-mono">Top</span>
          <select
            value={p.spec.limit}
            onChange={(e) => p.setSpec((x) => ({ ...x, limit: Number(e.target.value) }))}
            className="rounded-btn border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink"
          >
            {[...new Set([10, 25, 50, 100, 250, 500, p.spec.limit])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={share}
          className="lift rounded-btn bg-green px-3.5 py-1.5 text-sm font-medium text-on-color hover:brightness-110"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

function Toggle(p: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={p.on}
      onClick={p.onClick}
      className={`rounded-full border px-3 py-1 font-mono text-xs ${
        // seasons and season types are filters, so they're red like the Filters well
        p.on ? "border-red bg-red text-on-color" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
      }`}
    >
      {p.children}
    </button>
  );
}

/** Seasons as a dropdown with checkboxes, so the bar stays tidy as seasons are added. */
function SeasonPicker(p: { seasons: string[]; picked: string[]; onToggle: (s: string) => void }) {
  const { open, setOpen, ref } = usePopover(false);

  const picked = p.seasons.filter((s) => p.picked.includes(s)); // newest first
  const label =
    picked.length === 0 || picked.length === p.seasons.length
      ? "All seasons"
      : picked.length <= 2
        ? picked.join(", ")
        : `${picked.length} seasons`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs ${
          picked.length ? "border-red bg-red text-on-color" : "border-line text-ink hover:border-line-strong"
        }`}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={open ? "rotate-180" : ""}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-multiselectable
          className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-44 overflow-y-auto rounded-card border border-line bg-surface-2 p-1.5 shadow-xl"
        >
          {p.seasons.map((s) => (
            <li key={s} role="option" aria-selected={p.picked.includes(s)}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-chip px-2 py-1.5 font-mono text-sm hover:bg-bg">
                <input
                  type="checkbox"
                  checked={p.picked.includes(s)}
                  onChange={() => p.onToggle(s)}
                  className="accent-[var(--red)]"
                />
                {s}
              </label>
            </li>
          ))}
          {p.seasons.length === 0 && <li className="px-2 py-1.5 text-sm text-ink-2">Loading…</li>}
        </ul>
      )}
    </div>
  );
}
