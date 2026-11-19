// Typed calls to the FastAPI service (proxied at /api by next.config.ts).
import type { Mode } from "./spec";
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
  agg: "sum" | "count" | "ratio" | "weighted_avg" | null;
  modes: Mode[];
  default_mode: Mode | null;
  format: string | null;
  higher_is_better: boolean | null;
  available: boolean;
};

export type SeasonMeta = { season: string; season_type: string; games: number; last_game: string };

export type ResultField = { id: string; label: string; short: string; type: string | null; bins: string[] | null };
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
  values: (field: string, q = "") =>
    get<{ field: string; values: (string | number)[] }>(
      `/meta/values?field=${encodeURIComponent(field)}&q=${encodeURIComponent(q)}&limit=300`,
    ),
  query: (spec: QuerySpec) =>
    request<QueryResult>("/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    }),
};
