// Number filters as ranges: how they're stored, read back and described.
import type { FieldMeta } from "@/lib/api";
import type { Filter } from "@/lib/spec";

export type Range = { lo: number | null; hi: number | null; loIn: boolean; hiIn: boolean };

/** Any number filter as a range. Older links used single comparisons (≥ 20); they read the same way. */
export function toRange(f: Filter): Range {
  const v = f.value;
  const n = (x: unknown) => (typeof x === "number" ? x : null);
  const ends = f.ends ?? "[]";
  switch (f.op) {
    case "between":
      return { lo: n(Array.isArray(v) ? v[0] : null), hi: n(Array.isArray(v) ? v[1] : null), loIn: ends[0] === "[", hiIn: ends[1] === "]" };
    case ">=":
      return { lo: n(v), hi: null, loIn: true, hiIn: true };
    case ">":
      return { lo: n(v), hi: null, loIn: false, hiIn: true };
    case "<=":
      return { lo: null, hi: n(v), loIn: true, hiIn: true };
    case "<":
      return { lo: null, hi: n(v), loIn: true, hiIn: false };
    case "=":
      return { lo: n(v), hi: n(v), loIn: true, hiIn: true };
    default:
      return { lo: null, hi: null, loIn: true, hiIn: true };
  }
}

export function fromRange(r: Range): Partial<Filter> {
  return { op: "between", value: [r.lo, r.hi], ends: `${r.loIn ? "[" : "("}${r.hiIn ? "]" : ")"}` as Filter["ends"] };
}

export const isPct = (field?: Pick<FieldMeta, "format">) => !!field?.format?.includes("%");
/** Percent stats are stored as decimals (0.55) but shown and typed as 55. */
const shownNum = (x: number, pct: boolean) => (pct ? `${+(x * 100).toFixed(6)}%` : String(x));

export function rangeText(f: Filter, field?: Pick<FieldMeta, "format">) {
  const r = toRange(f);
  const pct = isPct(field);
  const out = f.op === "between" && f.outside;
  // outside [10, 30] keeps "< 10 or > 30"; an end that counts as in the range is left out of what's kept
  const lo = r.lo === null ? "" : out ? `${r.loIn ? "<" : "≤"} ${shownNum(r.lo, pct)}` : `${r.loIn ? "≥" : ">"} ${shownNum(r.lo, pct)}`;
  const hi = r.hi === null ? "" : out ? `${r.hiIn ? ">" : "≥"} ${shownNum(r.hi, pct)}` : `${r.hiIn ? "≤" : "<"} ${shownNum(r.hi, pct)}`;
  return [lo, hi].filter(Boolean).join(out ? " or " : " and ");
}

