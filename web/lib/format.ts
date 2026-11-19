import { format as d3format } from "d3-format";
import type { ResultValue } from "./api";

const cache = new Map<string, (n: number) => string>();

function formatter(spec: string) {
  let f = cache.get(spec);
  if (!f) {
    f = d3format(spec);
    cache.set(spec, f);
  }
  return f;
}

/** Format a value cell. Totals of summed stats are whole numbers with commas. */
export function formatValue(v: number | null | undefined, meta: ResultValue): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  let spec = meta.format || ".1f";
  if ((meta.agg === "sum" || meta.agg === "count") && meta.mode === "total") spec = ",.0f";
  return formatter(spec)(v).replace("-", "−");
}
