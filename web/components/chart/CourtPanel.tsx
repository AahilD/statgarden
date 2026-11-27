"use client";

// The Lab's court chart: the view's filters on a half court. With a Rows field, one court per
// group (the ones with the most shots, up to four), so two players sit side by side.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Court, CourtLegend, CourtNumbers } from "@/components/chart/Court";
import { Pills } from "@/components/pages/StatTable";
import { api, type FieldMeta } from "@/lib/api";
import { COURT_MODES, type CourtMode } from "@/lib/court";
import type { PivotSpec } from "@/lib/spec";
import { forQuery } from "@/lib/specOps";
import { useTeamNames } from "@/lib/teams";

const WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four" };

export function CourtPanel(p: { spec: PivotSpec; fields: Map<string, FieldMeta>; title: string; subtitle: string }) {
  // only what the court uses, so sorting or adding values doesn't refetch it
  const sent = useMemo(() => {
    const q = forQuery(p.spec);
    return { ...q, rows: q.rows.slice(0, 1), columns: [], sort: [], values: q.values.slice(0, 1) };
  }, [p.spec]);
  const courtQ = useQuery({ queryKey: ["court", sent], queryFn: () => api.court(sent), placeholderData: keepPreviousData });
  const teamNames = useTeamNames();
  const [mode, setMode] = useState<CourtMode>("dots");
  const split = sent.rows[0] ? p.fields.get(sent.rows[0]) : undefined;
  const name = (label: string | null) => (label == null ? "—" : split?.names === "team" ? (teamNames.get(label) ?? label) : label);

  if (courtQ.error) return <p className="py-16 text-center text-sm text-red">{courtQ.error.message}</p>;
  const d = courtQ.data;
  if (!d) return <div className="mx-auto aspect-[504/475] w-full max-w-[560px] animate-pulse rounded-btn bg-sunken" />;
  if (d.courts.length === 0) return <p className="py-16 text-center text-sm text-ink-2">No shots match these filters.</p>;

  const many = d.courts.length > 1;
  return (
    <figure className={courtQ.isPlaceholderData ? "opacity-60 transition-opacity" : ""}>
      <figcaption className="mb-4 text-center">
        <span className="title-caps block text-[15px]">{p.title}</span>
        {p.subtitle && <span className="label-mono mt-1 block normal-case">{p.subtitle}</span>}
        <span className="mt-3 block">
          <Pills label="Shot map style" options={COURT_MODES} value={mode} onPick={setMode} />
        </span>
      </figcaption>
      <div className={many ? "grid gap-6 sm:grid-cols-2" : "mx-auto max-w-[560px]"}>
        {d.courts.map((c) => (
          <div key={String(c.key)}>
            {split && <div className="title-caps mb-2 text-center text-sm">{name(c.label)}</div>}
            <Court court={c} hex={d.hex} label={split ? name(c.label) : p.title} mode={mode} />
            <div className="mt-3">
              <CourtNumbers court={c} league={d.league} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-line pt-3">
        <CourtLegend mode={mode} />
        <p className="mt-2 text-center text-xs text-ink-2">
          {!split
            ? "Add a Rows field (like Player) to put courts side by side. "
            : many
              ? `One court per ${split.label.toLowerCase()}: the ${WORDS[d.courts.length] ?? d.courts.length} with the most shots. `
              : `Add another ${split.label.toLowerCase()} to the filter to compare side by side. `}
          The league is every shot in the same seasons and season types.
        </p>
      </div>
    </figure>
  );
}
