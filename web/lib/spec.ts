// The view format ("PivotSpec"). Mirrors api/spec.py; the API checks it again.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";

const OPS = ["=", "!=", ">", ">=", "<", "<=", "in", "not_in", "between", "contains"] as const;
const MODES = ["total", "per_game", "per_36"] as const;

const FilterSchema = z.object({
  field: z.string(),
  op: z.enum(OPS),
  value: z.unknown(),
});

const ValueSchema = z.object({
  field: z.string(),
  mode: z.enum(MODES).optional(),
});

export const SpecSchema = z.object({
  v: z.literal(1).default(1),
  dataset: z.string().default("player_game"),
  filters: z.array(FilterSchema).default([]),
  rows: z.array(z.string()).max(3).default([]),
  columns: z.array(z.string()).max(2).default([]),
  values: z.array(ValueSchema).max(6).default([]),
  sort: z.array(z.object({ by: z.string(), dir: z.enum(["asc", "desc"]) })).max(3).default([]),
  limit: z.number().int().min(1).max(5000).default(100),
  chart: z
    .object({
      // what's on screen: the table, the chart, or both
      view: z.enum(["table", "chart", "both"]).default("table"),
      type: z.enum(["table", "bar", "line", "scatter", "heatmap"]).default("bar"),
      x: z.string().nullish(),
      y: z.string().nullish(),
      color: z.string().nullish(),
    })
    .default({ view: "table", type: "bar" }),
});

export type PivotSpec = z.infer<typeof SpecSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type Mode = (typeof MODES)[number];

export const LIMITS = { rows: 3, columns: 2, values: 6 } as const;

export function defaultSpec(season = "2025-26"): PivotSpec {
  return SpecSchema.parse({
    filters: [
      { field: "season", op: "in", value: [season] },
      { field: "season_type", op: "in", value: ["Regular Season"] },
    ],
    rows: ["player"],
    values: [{ field: "pts", mode: "per_game" }, { field: "games" }, { field: "ts_pct" }],
    limit: 50,
  });
}

export function encodeSpec(spec: PivotSpec): string {
  return compressToEncodedURIComponent(JSON.stringify(spec));
}

export function decodeSpec(v: string | null | undefined): PivotSpec | null {
  if (!v) return null;
  try {
    const json = decompressFromEncodedURIComponent(v);
    if (!json) return null;
    const parsed = SpecSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ChartSpec = PivotSpec["chart"];
export type ChartView = ChartSpec["view"];
