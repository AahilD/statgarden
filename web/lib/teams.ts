"use client";

// Team abbreviations → full names. Fields marked `names: team` hold abbreviations (DEN);
// wide screens show the full name (Denver Nuggets), phones keep the abbreviation.
import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { api, type FieldMeta, type QueryResult } from "@/lib/api";

export function useTeamNames(): Map<string, string> {
  const { data } = useQuery({ queryKey: ["teams"], queryFn: api.teams, staleTime: Infinity });
  return useMemo(() => new Map((data ?? []).map((t) => [t.abbr, t.name])), [data]);
}

/** The same result with team abbreviations spelled out, for charts on wide screens. */
export function spellTeams(result: QueryResult, fields: Map<string, FieldMeta>, names: Map<string, string>): QueryResult {
  const ids = [...result.row_fields, ...result.column_fields].filter((f) => fields.get(f.id)?.names === "team").map((f) => f.id);
  if (!ids.length || !names.size) return result;
  return {
    ...result,
    rows: result.rows.map((r) => {
      const out = { ...r };
      for (const id of ids) {
        const v = r[`d_${id}`];
        if (typeof v === "string" && names.has(v)) out[`d_${id}`] = names.get(v)!;
      }
      return out;
    }),
  };
}

const WIDE = "(min-width: 640px)";
/** True on screens wide enough for full team names. */
export function useWide(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}
