"use client";

// The stats table on player, team and game pages. Scrolls sideways on phones with the first
// column pinned. Columns with a `sort` sort on click (low to high, high to low, back to the
// table's own order: lib/sortCycle, same as the Lab), and columns with a `leader` can light up
// the best number in each column.
import { useMemo, useState, type ReactNode } from "react";
import { nextSort, type SortState } from "@/lib/sortCycle";

export type Column<R> = {
  key: string;
  label: string;
  title?: string; // what the short label means
  cell: (r: R) => ReactNode;
  text?: boolean; // left-aligned text column (numbers are right-aligned)
  sticky?: boolean; // stays put when the table scrolls sideways (first column)
  strong?: boolean;
  /** the value it sorts by; columns without one don't sort */
  sort?: (r: R) => number | string | null | undefined;
  /** "high" or "low": which end is the leader when leaders are highlighted */
  leader?: "high" | "low";
  /** rows that can lead this column (percentages: enough attempts to count) */
  eligible?: (r: R) => boolean;
};

export function StatTable<R>(p: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  rowClass?: (r: R) => string;
  foot?: R[];
  caption?: string;
  /** shows the "Highlight leaders" switch above the table */
  leaders?: boolean;
  /** controls on the left above the table (e.g. Regular season / Playoffs) */
  toolbar?: ReactNode;
  /** a line under the table */
  note?: ReactNode;
  /** rows that start a new group (the bench); the line only shows in the table's own order */
  divider?: (r: R) => boolean;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [lit, setLit] = useState(false);

  const rows = useMemo(() => {
    const col = sort ? p.columns.find((c) => c.key === sort.by) : undefined;
    if (!sort || !col?.sort) return p.rows;
    const get = col.sort;
    const dir = sort.dir === "asc" ? 1 : -1;
    // blanks always last, whichever way it's sorted
    return [...p.rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [p.rows, p.columns, sort]);

  // the best value per column, when the switch is on
  const best = useMemo(() => {
    const out = new Map<string, number>();
    if (!lit) return out;
    for (const c of p.columns) {
      if (!c.leader || !c.sort) continue;
      const vals = p.rows
        .filter((r) => !c.eligible || c.eligible(r))
        .map((r) => c.sort!(r))
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (vals.length > 1) out.set(c.key, c.leader === "high" ? Math.max(...vals) : Math.min(...vals));
    }
    return out;
  }, [lit, p.columns, p.rows]);
  const leads = (c: Column<R>, r: R) => {
    const b = best.get(c.key);
    return b !== undefined && c.sort!(r) === b && (!c.eligible || c.eligible(r));
  };

  const cellCls = (c: Column<R>, head = false) =>
    [
      "whitespace-nowrap px-3 py-2",
      c.text ? "text-left" : "text-right font-mono tabular-nums",
      c.sticky ? "sticky left-0 z-[1] bg-surface" : "",
      c.strong && !head ? "font-medium text-ink" : "",
    ].join(" ");

  return (
    <div>
      {(p.toolbar || p.leaders) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>{p.toolbar}</div>
          {p.leaders && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2 hover:text-ink">
              <input type="checkbox" checked={lit} onChange={(e) => setLit(e.target.checked)} className="accent-[var(--orange)]" />
              Highlight leaders
            </label>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-[13px]">
          {p.caption && <caption className="sr-only">{p.caption}</caption>}
          <thead>
            <tr className="border-b border-line-strong">
              {p.columns.map((c) => {
                const on = sort?.by === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.title}
                    aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`${cellCls(c, true)} font-mono text-[11px] font-normal uppercase tracking-wide text-ink-2`}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => setSort((s) => nextSort(s, c.key))}
                        aria-label={`Sort by ${c.title ?? c.label}`}
                        className={`inline-flex items-center gap-1 uppercase hover:text-ink ${on ? "text-accent-ink" : ""}`}
                      >
                        {c.label}
                        <span aria-hidden className="w-2 text-[9px]">
                          {on ? (sort!.dir === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={p.rowKey(r)}
                className={`border-b border-line last:border-0 ${p.rowClass?.(r) ?? ""} ${
                  !sort && p.divider?.(r) ? "border-t border-t-line-strong" : ""
                }`}
              >
                {p.columns.map((c) => (
                  <td key={c.key} className={`${cellCls(c)} ${leads(c, r) ? "bg-orange-soft font-medium text-ink" : ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {p.foot && p.foot.length > 0 && (
            <tfoot>
              {p.foot.map((r) => (
                <tr key={p.rowKey(r)} className="border-t border-line-strong">
                  {p.columns.map((c) => (
                    <td key={c.key} className={`${cellCls(c)} font-medium text-ink`}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      {p.note && <p className="mt-2 font-mono text-[11px] text-ink-2">{p.note}</p>}
    </div>
  );
}

/** A small set of choices (Regular season / Playoffs…), one picked. */
export function Pills<T extends string>(p: { label: string; options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={p.label} className="inline-flex rounded-btn border border-line bg-surface p-1">
      {p.options.map((o) => {
        const on = p.value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => p.onPick(o.id)}
            className={`rounded-chip px-3 py-1 text-xs font-medium transition-colors ${on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
