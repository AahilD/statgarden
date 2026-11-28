"use client";

// The teams page: Regular season (standings), NBA Cup (groups and knockouts) and Playoffs
// (bracket and play-in), with a season picker for the Cup and the playoffs. The view is kept in
// the link (?view=cup&season=2025-26), so a bracket can be shared.
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CupView } from "@/components/pages/Cup";
import { PlayoffsView } from "@/components/pages/Playoffs";
import { Standings } from "@/components/pages/Standings";
import { Pills } from "@/components/pages/StatTable";
import { api } from "@/lib/api";
import type { CupData, PlayoffData } from "@/lib/brackets";
import type { TeamListItem } from "@/lib/pages";

type View = "regular" | "cup" | "playoffs";

export function TeamsHub(p: { teams: TeamListItem[]; season: string; cup: CupData | null; playoffs: PlayoffData | null }) {
  // the view and season come from the link, so a bracket can be shared
  const sp = useSearchParams();
  const linked = sp.get("view");
  const linkedView: View = linked === "cup" || linked === "playoffs" ? linked : "regular";
  const linkedSeason = sp.get("season");
  const [view, setView] = useState<View>(linkedView);
  const [cupSeason, setCupSeason] = useState((linkedView === "cup" && linkedSeason) || p.cup?.season || p.season);
  const [poSeason, setPoSeason] = useState((linkedView === "playoffs" && linkedSeason) || p.playoffs?.season || p.season);

  const remember = (v: View, season?: string) => {
    const q = new URLSearchParams();
    if (v !== "regular") q.set("view", v);
    if (season) q.set("season", season);
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  };

  const cupQ = useQuery({
    queryKey: ["cup", cupSeason],
    queryFn: () => api.cup(cupSeason),
    initialData: p.cup && p.cup.season === cupSeason ? p.cup : undefined,
    enabled: view === "cup",
  });
  const poQ = useQuery({
    queryKey: ["playoffs", poSeason],
    queryFn: () => api.playoffs(poSeason),
    initialData: p.playoffs && p.playoffs.season === poSeason ? p.playoffs : undefined,
    enabled: view === "playoffs",
  });

  const views: { id: View; label: string }[] = [
    { id: "regular", label: "Regular season" },
    ...(p.cup?.seasons.length ? [{ id: "cup" as const, label: "NBA Cup" }] : []),
    { id: "playoffs", label: "Playoffs" },
  ];
  const pick = (v: View) => {
    setView(v);
    remember(v, v === "cup" && cupSeason !== p.season ? cupSeason : v === "playoffs" && poSeason !== p.season ? poSeason : undefined);
  };

  return (
    <div>
      <div className="flex flex-col items-center gap-3">
        <Pills label="Season part" options={views} value={view} onPick={pick} />
        {view === "cup" && p.cup && (
          <SeasonPicker
            label="NBA Cup season"
            seasons={p.cup.seasons}
            value={cupSeason}
            onPick={(s) => {
              setCupSeason(s);
              remember("cup", s);
            }}
          />
        )}
        {view === "playoffs" && p.playoffs && (
          <SeasonPicker
            label="Playoffs season"
            seasons={p.playoffs.seasons}
            value={poSeason}
            onPick={(s) => {
              setPoSeason(s);
              remember("playoffs", s);
            }}
          />
        )}
      </div>

      <div className="mt-8">
        {view === "regular" && <Standings teams={p.teams} />}
        {view === "cup" && <Loaded q={cupQ}>{(d) => <CupView data={d} />}</Loaded>}
        {view === "playoffs" && <Loaded q={poQ}>{(d) => <PlayoffsView data={d} />}</Loaded>}
      </div>
    </div>
  );
}

function SeasonPicker(p: { label: string; seasons: string[]; value: string; onPick: (s: string) => void }) {
  return (
    <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ink-2">
      Season
      <select
        aria-label={p.label}
        value={p.value}
        onChange={(e) => p.onPick(e.target.value)}
        className="rounded-btn border border-line bg-sunken px-2 py-1 font-mono text-xs text-ink"
      >
        {p.seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

function Loaded<T>({ q, children }: { q: { data?: T; error: Error | null; isFetching: boolean }; children: (d: T) => ReactNode }) {
  if (q.error) return <p className="py-16 text-center text-sm text-red">{q.error.message}</p>;
  if (!q.data) return <div className="mx-auto h-64 w-full animate-pulse rounded-card bg-sunken" />;
  return <div className={q.isFetching ? "opacity-60 transition-opacity" : ""}>{children(q.data)}</div>;
}
