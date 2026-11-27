// A plain-words name for a view, e.g. "Points per game by Player", plus a line
// for its filters. Used on the chart card, the PNG export and link previews.
import type { ChartModel } from "./chartModel";
import type { FieldMeta } from "./api";
import { isPct, rangeText } from "./ranges";
import type { Filter } from "./spec";

export function chartTitle(m: ChartModel): string {
  switch (m.kind) {
    case "empty":
      return "StatGarden";
    case "scatter":
      return `${m.y.label} vs ${m.x.label}`;
    case "heatmap":
      return `${m.value.label} by ${m.yLabel} and ${m.xLabel}`;
    case "histogram":
      return `How ${m.binned.label} spreads across ${m.rowLabel}s`;
    default: {
      const by = m.categoryLabel ? ` by ${m.categoryLabel}` : "";
      return `${m.value.label}${by}`;
    }
  }
}

const list = (xs: unknown[], n = 3) =>
  xs.length > n ? `${xs.slice(0, n).join(", ")} +${xs.length - n}` : xs.join(", ");

/** "2025-26 · Regular Season · Team: Boston Celtics" */
export function filterLine(
  filters: Filter[],
  label: (id: string) => string,
  meta?: (id: string) => Pick<FieldMeta, "format"> | undefined,
): string {
  return filters
    .flatMap((f) => {
      const v = f.value;
      if (Array.isArray(v) && v.length === 0) return [];
      if (v === null || v === undefined || v === "") return [];
      // seasons and season types speak for themselves
      const bare = f.field === "season" || f.field === "season_type";
      const name = bare ? "" : `${label(f.field)}: `;
      if (f.op === "in") return [`${name}${list(v as unknown[])}`];
      if (f.op === "not_in") return [`${label(f.field)}: not ${list(v as unknown[])}`];
      if (f.op === "between" && Array.isArray(v)) {
        const [lo, hi] = v as (number | null)[];
        const plain = lo !== null && hi !== null && (f.ends ?? "[]") === "[]" && !f.outside && !isPct(meta?.(f.field));
        return [plain ? `${label(f.field)} ${lo}–${hi}` : `${label(f.field)} ${rangeText(f, meta?.(f.field))}`];
      }
      return [`${label(f.field)} ${f.op.replace(">=", "≥").replace("<=", "≤").replace("!=", "≠")} ${String(v)}`];
    })
    .join(" · ");
}
