"use client";

// The player page's shot map: one court with the Dots / heat map switch.
import { useState } from "react";
import { Court, CourtLegend, CourtNumbers } from "@/components/chart/Court";
import { Pills } from "@/components/pages/StatTable";
import { COURT_MODES, type CourtMode, type CourtResult } from "@/lib/court";

export function ShotMap(p: { shots: CourtResult; label: string; caption: string }) {
  const [mode, setMode] = useState<CourtMode>("dots");
  const court = p.shots.courts[0];
  if (!court) return null;
  return (
    <div className="mx-auto max-w-[560px] rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-col items-center gap-2">
        <Pills label="Shot map style" options={COURT_MODES} value={mode} onPick={setMode} />
        <div className="label-mono">{p.caption}</div>
      </div>
      <Court court={court} hex={p.shots.hex} label={p.label} mode={mode} />
      <div className="mt-4">
        <CourtNumbers court={court} league={p.shots.league} />
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <CourtLegend mode={mode} />
      </div>
    </div>
  );
}
