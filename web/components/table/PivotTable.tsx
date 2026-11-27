"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { HeaderTip, type OpenTip, type Tip } from "@/components/table/HeaderTip";
import { ShadeBar } from "@/components/table/ShadeBar";
import type { FieldMeta, QueryResult } from "@/lib/api";
import { formatValue } from "@/lib/format";
import type { Wide, WideRow } from "@/lib/pivot";
import type { PivotSpec } from "@/lib/spec";
import { computeShades, shadeBackground } from "@/lib/shade";
import { setSort } from "@/lib/specOps";
import { SERIES, TONE } from "@/lib/tones";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, WideRow>();

export function PivotTable(p: {
  result: QueryResult;
  wide: Wide;
  spec: PivotSpec;
  setSpec: (fn: (s: PivotSpec) => PivotSpec) => void;
  /** field id → its catalog entry (calculated stats included), for the header tooltips */
  fields?: Map<string, FieldMeta>;
}) {
  const { wide } = p;
  const hasSplit = p.result.column_fields.length > 0 && wide.groups.length > 1;
  const shades = useMemo(() => computeShades(p.result, wide, p.spec), [p.result, wide, p.spec]);
  const shadeStyle = (colId: string, rowIndex: number): React.CSSProperties | undefined => {
    const bg = shadeBackground(shades.get(colId)?.get(rowIndex), p.spec.shade);
    return bg ? { background: bg } : undefined;
  };
  // what each header's tooltip says, by column id
  const tips = useMemo(() => {
    const out = new Map<string, Tip>();
    for (const f of p.result.row_fields) out.set(`dim:${f.id}`, { title: f.label, about: p.fields?.get(f.id)?.description });
    const groups = p.result.column_fields.length ? wide.groups.map((g) => g.id) : ["all"];
    for (const v of p.result.values) {
      const meta = p.fields?.get(v.field);
      const tip = { title: v.label, about: meta?.source === "calc" ? `Formula: ${meta.description}` : meta?.description };
      for (const g of groups) out.set(`${g}|${v.key}`, tip);
    }
    return out;
  }, [p.result, p.fields, wide.groups]);
  const [tip, setTip] = useState<OpenTip | null>(null);
  const openTip = (colId: string, el: HTMLElement) => {
    const t = tips.get(colId);
    if (!t) return;
    const r = el.getBoundingClientRect();
    setTip({ ...t, left: r.left, right: r.right, top: r.bottom, alignRight: colId.includes("|") });
  };
  // the tip is pinned to where the header was, so close it when anything scrolls
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [tip]);

  const sort = p.spec.sort[0] ?? (p.result.values[0] ? { by: p.result.values[0].key, dir: "desc" } : undefined);

  const { result, setSpec } = p;
  const columns = useMemo(() => {
    const { row_fields, column_fields, values } = result;
    const sortHeader = (id: string, text: string, numeric: boolean, full: string) => {
      const active = sort?.by === id;
      return (
        <button
          type="button"
          onClick={() => setSpec((s) => setSort(s, id))}
          className={`inline-flex w-full items-center gap-1 ${numeric ? "justify-end" : ""} ${active ? "text-accent-ink" : ""}`}
          aria-label={`Sort by ${full}`}
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
        header: () => sortHeader(f.id, f.label, false, f.label),
        cell: (c) => c.getValue(),
      }),
    );
    const valueCols = (groupId: string) =>
      values.map((v) =>
        helper.accessor((r): unknown => r.cells[`${groupId}|${v.key}`], {
          id: `${groupId}|${v.key}`,
          header: () => sortHeader(v.key, v.short, true, v.label),
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
  }, [wide.groups, sort?.by, sort?.dir, result, setSpec]);

  const table = useTable({ features, columns, data: wide.rows });

  if (wide.rows.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-ink-2">No games match these filters.</p>;
  }

  return (
    <div>
      <ShadeBar result={p.result} spec={p.spec} setSpec={p.setSpec} hasSplit={hasSplit} firstSplit={wide.groups[0]?.labels.join(" · ")} />
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
                    onMouseEnter={(e) => openTip(h.column.id, e.currentTarget)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e) => {
                      // keyboard focus, or a tap on a screen without hover
                      if (e.target.matches(":focus-visible") || window.matchMedia("(hover: none)").matches)
                        openTip(h.column.id, e.currentTarget);
                    }}
                    onBlur={() => setTip(null)}
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
                    className={`px-3 py-1.5 ${
                      isValue
                        ? "whitespace-nowrap text-right font-mono tabular-nums"
                        : id === "__rank"
                          ? "w-8 whitespace-nowrap font-mono text-xs"
                          : // long labels (lineups) wrap on phones so the numbers stay in view
                            "min-w-[8rem] max-w-[12rem] sm:max-w-none sm:whitespace-nowrap"
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
      <HeaderTip tip={tip} />
    </div>
  );
}
