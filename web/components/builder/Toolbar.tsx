"use client";

import { useState } from "react";
import type { SeasonMeta } from "@/lib/api";
import { encodeSpec, type PivotSpec } from "@/lib/spec";
import { filterValue, toggleIn } from "@/lib/specOps";

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
    const url = `${window.location.origin}/explore?v=${encodeSpec(p.spec)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <p className="label-mono">Every player, every game</p>
        <h1 className="title-caps text-2xl">Explore</h1>
      </div>

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="label-mono mb-1">Seasons</legend>
        {seasons.map((s) => (
          <Toggle key={s} on={picked.includes(s)} onClick={() => p.setSpec((x) => toggleIn(x, "season", s))}>
            {s}
          </Toggle>
        ))}
        {seasons.length === 0 && <span className="text-sm text-ink-2">…</span>}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="label-mono mb-1">Type</legend>
        {SEASON_TYPES.map((t) => (
          <Toggle key={t} on={types.includes(t)} onClick={() => p.setSpec((x) => toggleIn(x, "season_type", t))}>
            {t}
          </Toggle>
        ))}
      </fieldset>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="label-mono">Top</span>
          <select
            value={p.spec.limit}
            onChange={(e) => p.setSpec((x) => ({ ...x, limit: Number(e.target.value) }))}
            className="rounded-[8px] border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink"
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
          className="lift rounded-[8px] bg-green px-3.5 py-1.5 text-sm font-medium text-on-color hover:brightness-110"
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
