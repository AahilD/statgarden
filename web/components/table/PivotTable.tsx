"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { QueryResult } from "@/lib/api";
import { formatValue } from "@/lib/format";
import type { Wide, WideRow } from "@/lib/pivot";
import type { PivotSpec } from "@/lib/spec";
import { setSort } from "@/lib/specOps";
import { SERIES, TONE } from "@/lib/tones";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, WideRow>();

export function PivotTable(p: {
  result: QueryResult;
  wide: Wide;
  spec: PivotSpec;
  setSpec: (fn: (s: PivotSpec) => PivotSpec) => void;
}) {
  const { wide } = p;
  const [shadeOn, setShadeOn] = useState(true);

  // Green for better than the rest of the table, red for worse (by rank within the column).
  // Only for stats where higher or lower is clearly better, and only with enough rows to compare.
  const shades = useMemo(() => {
    const out = new Map<string, Map<number, number>>(); // column id → row index → -1..1
    const groupIds = p.result.column_fields.length ? wide.groups.map((g) => g.id) : ["all"];
    for (const v of p.result.values) {
      if (v.higher_is_better === null) continue;
      for (const g of groupIds) {
        const id = `${g}|${v.key}`;
        const vals = wide.rows
          .map((r, i) => [i, r.cells[id]] as const)
          .filter((x): x is readonly [number, number] => typeof x[1] === "number");
        if (vals.length < 5) continue;
        const sorted = [...vals].sort((a, b) => a[1] - b[1]);
        const m = new Map<number, number>();
        sorted.forEach(([i], rank) => {
          const pct = rank / (sorted.length - 1); // 0 = lowest
          m.set(i, (v.higher_is_better ? pct : 1 - pct) * 2 - 1);
        });
        out.set(id, m);
      }
    }
    return out;
  }, [wide, p.result]);
  const shadeStyle = (colId: string, rowIndex: number): React.CSSProperties | undefined => {
    const t = shadeOn ? shades.get(colId)?.get(rowIndex) : undefined;
    if (t === undefined || Math.abs(t) < 0.2) return undefined;
    const pct = Math.round(((Math.abs(t) - 0.2) / 0.8) * 42);
    return { background: `color-mix(in srgb, var(${t > 0 ? "--green" : "--red"}) ${pct}%, transparent)` };
  };
  const sort = p.spec.sort[0] ?? (p.result.values[0] ? { by: p.result.values[0].key, dir: "desc" } : undefined);

  const columns = useMemo(() => {
    const { row_fields, column_fields, values } = p.result;
    const sortHeader = (id: string, text: string, numeric: boolean) => {
      const active = sort?.by === id;
      return (
        <button
          type="button"
          onClick={() => p.setSpec((s) => setSort(s, id))}
          className={`inline-flex w-full items-center gap-1 ${numeric ? "justify-end" : ""} ${active ? "text-accent-ink" : ""}`}
          aria-label={`Sort by ${text}`}
        >
          {text}
          <span aria-hidden className="text-[10px]">{active ? (sort?.dir === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      );
    };

    const rank = helper.display({
      id: "__rank",
      header: () => <span className="sr-only">Rank</span>,
      cell: (c) => <span className="text-ink-2">{c.row.index + 1}</span>,
    });
    const dims = row_fields.map((f) =>
      helper.accessor((r) => r.dims[f.id], {
        id: `dim:${f.id}`,
        header: () => sortHeader(f.id, f.label, false),
        cell: (c) => c.getValue(),
      }),
    );
    const valueCols = (groupId: string) =>
      values.map((v) =>
        helper.accessor((r): unknown => r.cells[`${groupId}|${v.key}`], {
          id: `${groupId}|${v.key}`,
          header: () => sortHeader(v.key, v.short, true),
          cell: (c) => formatValue(c.getValue() as number | null, v),
        }),
      );

    if (column_fields.length === 0) return helper.columns([rank, ...dims, ...valueCols("all")]);
    return helper.columns([
      rank,
      ...dims,
      ...wide.groups.map((g, i) =>
        helper.group({
          id: `group:${g.id}`,
          header: () => (
            <span className={`block rounded-chip px-2 py-1 ${TONE[SERIES[i % SERIES.length]].block}`}>{g.labels.join(" · ")}</span>
          ),
          columns: valueCols(g.id),
        }),
      ),
    ]);
  }, [wide.groups, sort?.by, sort?.dir, p]);

  const table = useTable({ features, columns, data: wide.rows });

  if (wide.rows.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-ink-2">No games match these filters.</p>;
  }

  return (
    <div>
      {shades.size > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-line px-4 py-2 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-green" /> better
          </span>
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-red" /> worse
          </span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shadeOn} onChange={(e) => setShadeOn(e.target.checked)} className="accent-[var(--green)]" />
            shade
          </label>
        </div>
      )}
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const isValue = h.column.id.includes("|");
                const isGroup = h.column.id.startsWith("group:");
                const isFirstDim = h.column.id === `dim:${p.result.row_fields[0]?.id}`;
                return (
                  <th
                    key={h.id}
                    colSpan={h.colSpan}
                    scope="col"
                    className={`whitespace-nowrap border-b border-line px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wide text-ink-2 ${
                      isValue ? "text-right" : "text-left"
                    } ${isGroup ? "border-l px-1.5 text-center normal-case tracking-normal" : ""} ${isFirstDim ? "sticky left-0 z-10 bg-surface" : ""}`}
                  >
                    {h.isPlaceholder ? null : <table.FlexRender header={h} />}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-line/70 hover:bg-bg/60">
              {row.getAllCells().map((cell) => {
                const id = cell.column.id;
                const isValue = id.includes("|");
                const isFirstDim = id === `dim:${p.result.row_fields[0]?.id}`;
                const startsGroup = isValue && p.result.column_fields.length > 0 && id.endsWith(`|${p.result.values[0]?.key}`);
                return (
                  <td
                    key={cell.id}
                    style={isValue ? shadeStyle(id, row.index) : undefined}
                    className={`whitespace-nowrap px-3 py-1.5 ${
                      isValue ? "text-right font-mono tabular-nums" : id === "__rank" ? "w-8 font-mono text-xs" : ""
                    } ${isFirstDim ? "sticky left-0 bg-surface font-medium" : ""} ${startsGroup ? "border-l border-line" : ""}`}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
