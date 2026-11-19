// One colour per job, used everywhere so the colours teach the builder:
// Values = orange, Rows = blue, Columns = green, Filters = red.
import type { Well } from "./specOps";

export type Tone = "orange" | "blue" | "green" | "red";

export const TONE: Record<Tone, { block: string; soft: string; border: string; dashed: string; text: string }> = {
  orange: { block: "bg-orange text-on-orange", soft: "bg-orange-soft", border: "border-orange", dashed: "border-orange/70", text: "text-accent-ink" },
  blue: { block: "bg-blue text-on-color", soft: "bg-blue-soft", border: "border-blue", dashed: "border-blue/80", text: "text-ink" },
  green: { block: "bg-green text-on-color", soft: "bg-green-soft", border: "border-green", dashed: "border-green/90", text: "text-ink" },
  red: { block: "bg-red text-on-color", soft: "bg-red-soft", border: "border-red", dashed: "border-red/80", text: "text-ink" },
};

export const WELL_TONE: Record<Well, Tone> = {
  values: "orange",
  rows: "blue",
  columns: "green",
  filters: "red",
  y: "orange",
  x: "blue",
  color: "green",
};

/** Order the colours repeat in for column groups and chart series. */
export const SERIES: Tone[] = ["orange", "blue", "green", "red"];
