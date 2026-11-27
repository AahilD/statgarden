"use client";

import { useDraggable } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import type { FieldMeta } from "@/lib/api";
import type { SavedCalc } from "@/lib/savedCalcs";

export function FieldList(p: {
  groups: string[];
  fields: FieldMeta[];
  loading: boolean;
  error?: string;
  onAdd: (f: FieldMeta) => void;
  calcs: FieldMeta[];
  onNewCalc: () => void;
  onEditCalc: (id: string) => void;
  editor?: React.ReactNode; // the calculation form, when it's open
  saved: SavedCalc[]; // saved in this browser and not in this view
  onAddSaved: (c: SavedCalc) => void;
  onForgetSaved: (label: string) => void;
}) {
  const [q, setQ] = useState("");
  // groups start closed, except the two most used
  const [open, setOpen] = useState<Set<string>>(new Set(["Player", "Box score"]));

  const byGroup = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (f: FieldMeta) =>
      !term || f.label.toLowerCase().includes(term) || f.short.toLowerCase().includes(term);
    return p.groups.map((g) => ({
      group: g,
      fields: p.fields.filter((f) => f.group === g && !f.hidden && match(f)),
    }));
  }, [p.groups, p.fields, q]);

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <h2 className="title-caps text-[13px]">Fields</h2>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search fields"
        aria-label="Search fields"
        className="mt-3 w-full rounded-btn border border-line bg-bg px-3 py-2 text-sm placeholder:text-ink-2 focus:border-accent focus:outline-none"
      />
      {p.loading && <p className="mt-4 text-sm text-ink-2">Loading fields…</p>}
      {p.error && <p className="mt-4 text-sm text-red">{p.error}</p>}
      <div className="mt-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
        <div className="mt-2">
          <div className="flex items-center justify-between py-1.5">
            <span className="label-mono text-ink">Calculated</span>
            <button
              type="button"
              onClick={p.onNewCalc}
              className="rounded-chip border border-line px-2 py-0.5 font-mono text-[11px] text-ink-2 hover:border-orange hover:text-ink"
            >
              + New
            </button>
          </div>
          {p.editor}
          {p.calcs.length > 0 && (
            <ul className="space-y-1">
              {p.calcs.map((f) => (
                <li key={f.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <DraggableField field={f} onAdd={p.onAdd} />
                  </div>
                  <button
                    type="button"
                    onClick={() => p.onEditCalc(f.id)}
                    aria-label={`Edit ${f.label}`}
                    title="Edit"
                    className="grid h-8 w-7 shrink-0 place-items-center rounded-chip text-ink-2 hover:bg-bg hover:text-ink"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {p.calcs.length === 0 && !p.editor && p.saved.length === 0 && (
            <p className="px-1 pb-1 text-xs text-ink-2">Make your own stat, like points per minute.</p>
          )}
          {p.saved.length > 0 && (
            <div className="mt-2">
              <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2">Saved</p>
              <ul className="space-y-1">
                {p.saved.map((c) => (
                  <li key={c.label} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => p.onAddSaved(c)}
                      title={`${c.formula}. Adds it to this view.`}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-chip border border-dashed border-line px-2.5 py-1.5 text-left text-sm text-ink-2 hover:border-orange hover:text-ink"
                    >
                      <span className="truncate">{c.label}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px]">+ add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onForgetSaved(c.label)}
                      aria-label={`Forget ${c.label}`}
                      title="Remove from saved"
                      className="grid h-8 w-7 shrink-0 place-items-center rounded-chip text-ink-2 hover:bg-bg hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {byGroup.map(({ group, fields }) => {
          if (fields.length === 0) return null;
          const shown = open.has(group) || !!q; // searching opens every group
          return (
            <div key={group} className="mt-2">
              <button
                type="button"
                className="flex w-full items-center justify-between py-1.5"
                aria-expanded={shown}
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(group)) n.delete(group);
                    else n.add(group);
                    return n;
                  })
                }
              >
                <span className="label-mono text-ink">{group}</span>
                <span className="label-mono">{shown ? "−" : "+"}</span>
              </button>
              {shown && (
                <ul className="space-y-1">
                  {fields.map((f) => (
                    <li key={f.id}>
                      <DraggableField field={f} onAdd={p.onAdd} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
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
      aria-label={`${field.label}${field.available ? "" : field.agg === "calc" ? " (not in this data)" : " (not loaded yet)"}`}
      title={
        field.available
          ? field.description
          : field.agg === "calc"
            ? `${field.description}: uses a field this data doesn't have.`
            : `${field.description} Not loaded yet.`
      }
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
  return (
    <div
      className={`lift flex items-center gap-2 rounded-chip border px-2.5 py-1.5 text-sm ${
        field.available
          ? "cursor-grab border-line bg-bg hover:border-line-strong"
          : "cursor-not-allowed border-dashed border-line text-ink-2 opacity-60"
      } ${floating ? "cursor-grabbing border-2 border-ink-2 shadow-xl" : ""}`}
    >
      <span className="truncate">{field.label}</span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-2">
        {field.agg === "calc" ? "ƒ" : !field.available ? "soon" : field.short}
      </span>
    </div>
  );
}
