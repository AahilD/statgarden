// A plain-words name for a view, e.g. "Points per game by Player", plus a line
// for its filters. Used on the chart card, the PNG export and link previews.
import type { ChartModel } from "./chartModel";
import type { Filter } from "./spec";

export function chartTitle(m: ChartModel): string {
  switch (m.kind) {
    case "empty":
      return "StatGarden";
    case "scatter":
      return `${m.y.label} vs ${m.x.label}`;
    case "heatmap":
      return `${m.value.label} by ${m.yLabel} and ${m.xLabel}`;
    default: {
      const by = m.categoryLabel ? ` by ${m.categoryLabel}` : "";
      return `${m.value.label}${by}`;
    }
  }
}

const list = (xs: unknown[], n = 3) =>
  xs.length > n ? `${xs.slice(0, n).join(", ")} +${xs.length - n}` : xs.join(", ");

/** "2025-26 · Regular Season · Team: Boston Celtics" */
export function filterLine(filters: Filter[], label: (id: string) => string): string {
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
      if (f.op === "between" && Array.isArray(v)) return [`${label(f.field)} ${v[0]}–${v[1]}`];
      return [`${label(f.field)} ${f.op} ${String(v)}`];
    })
    .join(" · ");
}
