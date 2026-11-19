"use client";

import { useDraggable } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import type { FieldMeta } from "@/lib/api";

export function FieldList(p: {
  groups: string[];
  fields: FieldMeta[];
  loading: boolean;
  error?: string;
  onAdd: (f: FieldMeta) => void;
}) {
  const [q, setQ] = useState("");
  // groups start closed, except the two most used
  const [open, setOpen] = useState<Set<string>>(new Set(["Player", "Box score"]));
  const closed = { has: (g: string) => !open.has(g) };

  const byGroup = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (f: FieldMeta) =>
      !term || f.label.toLowerCase().includes(term) || f.short.toLowerCase().includes(term);
    return p.groups.map((g) => ({ group: g, fields: p.fields.filter((f) => f.group === g && match(f)) }));
  }, [p.groups, p.fields, q]);

  return (
    <div className="rounded-[12px] border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="title-caps text-[13px]">Fields</h2>
        <span className="label-mono hidden md:inline">drag or click</span>
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search fields"
        aria-label="Search fields"
        className="mt-3 w-full rounded-[8px] border border-line bg-bg px-3 py-2 text-sm placeholder:text-ink-2 focus:border-accent focus:outline-none"
      />
      {p.loading && <p className="mt-4 text-sm text-ink-2">Loading fields…</p>}
      {p.error && <p className="mt-4 text-sm text-red">{p.error}</p>}
      <div className="mt-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
        {byGroup.map(({ group, fields }) =>
          fields.length === 0 ? null : (
            <div key={group} className="mt-2">
              <button
                type="button"
                className="flex w-full items-center justify-between py-1.5"
                aria-expanded={!closed.has(group) || !!q}
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(group)) n.delete(group);
                    else n.add(group);
                    return n;
                  })
                }
              >
                <span className="flex items-center gap-2">
                  <i aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${fields[0]?.kind === "measure" ? "bg-orange" : "bg-blue"}`} />
                  <span className="label-mono text-ink">{group}</span>
                  <span className="font-mono text-[10px] text-ink-2">{fields.filter((f) => f.available).length}</span>
                </span>
                <span className="label-mono">{closed.has(group) && !q ? "+" : "−"}</span>
              </button>
              {(!closed.has(group) || q) && (
                <ul className="space-y-1">
                  {fields.map((f) => (
                    <li key={f.id}>
                      <DraggableField field={f} onAdd={p.onAdd} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function DraggableField({ field, onAdd }: { field: FieldMeta; onAdd: (f: FieldMeta) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: field.id,
    disabled: !field.available,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      aria-disabled={!field.available}
      aria-label={`${field.label}${field.available ? "" : " (not loaded yet)"}`}
      title={field.available ? field.description : `${field.description} Not loaded yet.`}
      onClick={() => field.available && onAdd(field)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && field.available) onAdd(field);
      }}
      className={isDragging ? "opacity-40" : ""}
    >
      <FieldPill field={field} />
    </div>
  );
}

export function FieldPill({ field, floating }: { field: FieldMeta; floating?: boolean }) {
  const dim = field.kind === "dimension";
  return (
    <div
      className={`lift flex items-center gap-2 rounded-[6px] border px-2.5 py-1.5 text-sm ${
        field.available
          ? "cursor-grab border-line bg-bg hover:border-line-strong"
          : "cursor-not-allowed border-dashed border-line text-ink-2 opacity-60"
      } ${floating ? `cursor-grabbing shadow-xl ${dim ? "border-blue" : "border-orange"} border-2` : ""}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 ${dim ? "rounded-[2px] bg-blue" : "rounded-full bg-orange"}`}
      />
      <span className="truncate">{field.label}</span>
      <span className="ml-auto font-mono text-[11px] text-ink-2">{field.available ? field.short : "soon"}</span>
    </div>
  );
}
