"use client";

import type { FieldMeta, QueryResult } from "@/lib/api";
import type { PivotSpec } from "@/lib/spec";

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function SeeHow(p: { spec: PivotSpec; result: QueryResult; fields: Map<string, FieldMeta> }) {
  const label = (id: string) => p.fields.get(id)?.label ?? id;
  const filters = p.spec.filters.map((f) => {
    const v = Array.isArray(f.value) ? list((f.value as unknown[]).map(String)) : String(f.value);
    const op = { in: "is", not_in: "is not", "=": "is", "!=": "is not", ">=": "≥", "<=": "≤", ">": ">", "<": "<", between: "between", contains: "contains" }[f.op];
    return `${label(f.field)} ${op} ${v}`;
  });
  const values = p.result.values.map((v) => v.label);
  const sortBy = p.spec.sort[0];
  const sortLabel = sortBy
    ? (p.result.values.find((v) => v.key === sortBy.by)?.label ?? label(sortBy.by))
    : values[0];

  return (
    <details className="group rounded-[12px] border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2"><i aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-green" /><span className="title-caps text-[13px]">See how it was worked out</span></span>
        <span className="label-mono group-open:hidden">show</span>
        <span className="label-mono hidden group-open:inline">hide</span>
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-4 text-sm">
        <p className="leading-relaxed">
          Every player game{filters.length ? ` where ${list(filters)}` : ""}
          {p.spec.rows.length ? `, grouped by ${list(p.spec.rows.map(label))}` : ", all added together"}
          {p.spec.columns.length ? `, split by ${list(p.spec.columns.map(label))}` : ""}. Showing {list(values)}.
          {p.spec.rows.length ? ` Top ${p.spec.limit} by ${sortLabel}.` : ""}
        </p>
        <p className="text-ink-2">
          Percentages are worked out from the totals (all makes ÷ all attempts), never by averaging game-by-game percentages.
        </p>
        <pre className="overflow-x-auto rounded-[8px] border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed text-ink-2">
          {p.result.sql}
        </pre>
        {p.result.params.length > 0 && (
          <p className="font-mono text-[12px] text-ink-2">parameters: {JSON.stringify(p.result.params)}</p>
        )}
      </div>
    </details>
  );
}
