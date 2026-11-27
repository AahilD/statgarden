// The view format ("PivotSpec"). Mirrors api/spec.py; the API checks it again.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";

const OPS = ["=", "!=", ">", ">=", "<", "<=", "in", "not_in", "between", "contains"] as const;
const MODES = ["total", "per_game", "per_36", "per_100"] as const;
export const CALC_FORMATS = ["number", "precise", "percent", "whole"] as const;

const FilterSchema = z.object({
  field: z.string(),
  op: z.enum(OPS),
  value: z.unknown(),
  // numbers only: "game" keeps the games that pass before adding up; "group" keeps result rows after
  scope: z.enum(["game", "group"]).catch("game").optional(),
  mode: z.enum(MODES).optional(),
});

/** A stat worked out from other fields, e.g. Points per minute = pts / min. Lives in the link. */
const CalcSchema = z.object({
  id: z.string().regex(/^calc_[a-z0-9_]{1,24}$/),
  label: z.string().min(1).max(40),
  formula: z.string().min(1).max(200),
  format: z.enum(CALC_FORMATS).catch("number"),
  // shading: true = higher is better, false = lower is better, null = no shading
  higher_is_better: z.boolean().nullable().catch(null).default(null),
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
  calcs: z.array(CalcSchema).max(8).default([]),
  sort: z.array(z.object({ by: z.string(), dir: z.enum(["asc", "desc"]) })).max(3).default([]),
  limit: z.number().int().min(1).max(5000).default(100),
  chart: z
    .object({
      // what's on screen: the table, the chart, or both
      view: z.enum(["table", "chart", "both"]).default("table"),
      // "auto" picks a type from the fields; anything unknown (old links said "table") falls back to it
      type: z.enum(["auto", "bar", "line", "scatter", "heatmap"]).catch("auto"),
      x: z.string().nullish(),
      y: z.string().nullish(),
      color: z.string().nullish(),
    })
    .default({ view: "table", type: "auto" }),
});

export type PivotSpec = z.infer<typeof SpecSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type Calc = z.infer<typeof CalcSchema>;
export type CalcFormat = Calc["format"];
export type Mode = (typeof MODES)[number];

export const LIMITS = { rows: 3, columns: 2, values: 6, calcs: 8 } as const;

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
