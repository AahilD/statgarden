// Typed calls to the FastAPI service (proxied at /api by next.config.ts).
import type { Mode } from "./spec";
import type { CourtResult } from "./court";
import type { QuerySpec } from "./specOps";

export type FieldMeta = {
  id: string;
  label: string;
  short: string;
  group: string;
  kind: "dimension" | "measure";
  source: string;
  description: string;
  type: "text" | "int" | "date" | "bool" | "bucket" | null;
  bins: string[] | null;
  agg: "sum" | "count" | "ratio" | "weighted_avg" | "calc" | null;
  modes: Mode[];
  default_mode: Mode | null;
  format: string | null;
  higher_is_better: boolean | null;
  names?: "team" | null; // values are team abbreviations the site can spell out
  hidden?: boolean;
  available: boolean;
};

export type DatasetMeta = {
  id: string;
  label: string;
  period: "game" | "season";
  about: string;
  grain: string;
  default: Record<string, unknown>;
};
export type FormulaCheck = { ok: boolean; error: string | null; fields: { id: string; label: string }[] };

export type SeasonMeta = { season: string; season_type: string; games: number; last_game: string };

export type ResultField = {
  id: string;
  label: string;
  short: string;
  type: string | null;
  bins: string[] | null;
  /** the site has a page per value (a date only when its row is exactly one game) */
  link: "player" | "team" | "game" | null;
};
export type ResultValue = {
  key: string;
  field: string;
  mode: Mode;
  label: string;
  short: string;
  format: string;
  agg: string;
  higher_is_better: boolean | null;
};

export type QueryResult = {
  rows: Record<string, string | number | null>[];
  more?: boolean; // more rows match than were asked for
  row_fields: ResultField[];
  column_fields: ResultField[];
  values: ResultValue[];
  elapsed_ms: number;
  row_count: number;
  cached: boolean;
};

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init);
  if (!r.ok) throw new ApiError(await errorText(r));
  return r.json();
}

const get = <T>(path: string) => request<T>(path);

async function errorText(r: Response) {
  try {
    const body = await r.json();
    return typeof body.detail === "string" ? body.detail : `Request failed (${r.status})`;
  } catch {
    return r.status >= 500 ? "The API isn't answering. Is it running? (make api)" : `Request failed (${r.status})`;
  }
}

export const api = {
  fields: (dataset = "player_game") =>
    get<{ groups: string[]; fields: FieldMeta[] }>(`/meta/fields?dataset=${dataset}`),
  seasons: (dataset = "player_game") => get<SeasonMeta[]>(`/meta/seasons?dataset=${dataset}`),
  datasets: () => get<DatasetMeta[]>("/meta/datasets"),
  teams: () => get<{ abbr: string; name: string }[]>("/meta/teams"),
  values: (field: string, q = "", dataset = "player_game") =>
    get<{ field: string; values: (string | number)[] }>(
      `/meta/values?field=${encodeURIComponent(field)}&q=${encodeURIComponent(q)}&dataset=${dataset}&limit=300`,
    ),
  checkFormula: (formula: string, dataset: string) =>
    request<FormulaCheck>("/calc/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formula, dataset }),
    }),
  court: (spec: QuerySpec) =>
    request<CourtResult>("/court", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    }),
  query: (spec: QuerySpec) =>
    request<QueryResult>("/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    }),
};
