// Table shading: how each cell is coloured. Green = better, red = worse.
// Every mode returns a number from -1 (much worse) to 1 (much better) per cell.
import type { QueryResult, ResultValue } from "@/lib/api";
import type { Wide } from "@/lib/pivot";
import type { PivotSpec, ShadeMode } from "@/lib/spec";

export const SHADE_LABEL: Record<ShadeMode, string> = {
  rank: "Rank",
  average: "Vs average",
  split: "Across split",
  baseline: "Vs first split",
  off: "Off",
};

export const SHADE_HELP: Record<ShadeMode, string> = {
  rank: "Against the rest of the column",
  average: "How far from the column average",
  split: "Each row's splits against each other",
  baseline: "Each split against the first one",
  off: "No colour",
};

/** Modes that compare across column splits only make sense when there are some. */
export function shadeModes(hasSplit: boolean): ShadeMode[] {
  return hasSplit ? ["rank", "average", "split", "baseline", "off"] : ["rank", "average", "off"];
}

export type Better = "higher" | "lower" | "none";

/** Which way is better for a value: the view's choice if it has one, else the stat's own. */
export function betterFor(v: ResultValue, spec: PivotSpec): Better {
  const own = specValue(v, spec)?.better;
  if (own) return own;
  return v.higher_is_better === null ? "none" : v.higher_is_better ? "higher" : "lower";
}

export function specValue(v: ResultValue, spec: PivotSpec) {
  return spec.values.find((x) => x.field === v.field && (x.mode ?? v.mode) === v.mode);
}

type Shades = Map<string, Map<number, number>>; // column id → row index → -1..1

export function computeShades(result: QueryResult, wide: Wide, spec: PivotSpec): Shades {
  const out: Shades = new Map();
  const groups = result.column_fields.length ? wide.groups.map((g) => g.id) : ["all"];
  let mode = spec.shade;
  if ((mode === "split" || mode === "baseline") && groups.length < 2) mode = "rank";
  if (mode === "off") return out;

  const num = (row: number, id: string) => {
    const x = wide.rows[row].cells[id];
    return typeof x === "number" && Number.isFinite(x) ? x : null;
  };

  for (const v of result.values) {
    const better = betterFor(v, spec);
    if (better === "none") continue;
    const sign = better === "higher" ? 1 : -1;

    if (mode === "rank" || mode === "average") {
      for (const g of groups) {
        const id = `${g}|${v.key}`;
        const vals = wide.rows.map((_, i) => [i, num(i, id)] as const).filter((x): x is readonly [number, number] => x[1] !== null);
        if (vals.length < 5) continue;
        const m = new Map<number, number>();
        if (mode === "rank") {
          const sorted = [...vals].sort((a, b) => a[1] - b[1]);
          sorted.forEach(([i], rank) => m.set(i, sign * ((rank / (sorted.length - 1)) * 2 - 1)));
        } else {
          const mean = vals.reduce((s, [, x]) => s + x, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((s, [, x]) => s + (x - mean) ** 2, 0) / vals.length);
          if (sd === 0) continue;
          // two standard deviations away = full colour
          for (const [i, x] of vals) m.set(i, sign * clamp((x - mean) / sd / 2));
        }
        out.set(id, m);
      }
      continue;
    }

    // split / baseline: compare a row's cells with each other, then scale by the biggest gap in the table
    const gaps: [string, number, number][] = [];
    wide.rows.forEach((_, i) => {
      const cells: [string, number | null][] = groups.map((g) => [`${g}|${v.key}`, num(i, `${g}|${v.key}`)]);
      const have = cells.filter((c): c is [string, number] => c[1] !== null);
      if (have.length < 2) return;
      if (mode === "split") {
        const base = have.reduce((s, [, x]) => s + x, 0) / have.length;
        for (const [id, x] of have) gaps.push([id, i, x - base]);
      } else {
        const base = cells[0][1];
        if (base === null) return;
        for (const [id, x] of have.slice(1)) gaps.push([id, i, x - base]);
      }
    });
    const biggest = Math.max(0, ...gaps.map(([, , d]) => Math.abs(d)));
    if (biggest === 0) continue;
    for (const [id, i, d] of gaps) {
      if (!out.has(id)) out.set(id, new Map());
      out.get(id)!.set(i, sign * (d / biggest));
    }
  }
  return out;
}

/** Background for a cell. Rank shading leaves the middle of the pack plain; the others colour any real gap. */
export function shadeBackground(t: number | undefined, mode: ShadeMode): string | undefined {
  const floor = mode === "rank" ? 0.2 : 0.05;
  if (t === undefined || Math.abs(t) < floor) return undefined;
  const pct = Math.round(((Math.abs(t) - floor) / (1 - floor)) * 42) + (mode === "rank" ? 0 : 6);
  return `color-mix(in srgb, var(${t > 0 ? "--green" : "--red"}) ${Math.min(pct, 48)}%, transparent)`;
}

function clamp(x: number) {
  return Math.max(-1, Math.min(1, x));
}
