"use client";

import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FieldMeta } from "@/lib/api";
import { LIMITS, type Filter, type Mode, type PivotSpec } from "@/lib/spec";
import { canDrop, clearChart, isComplete, removeAt, setFilter, setMode, type ChartWell, type Well } from "@/lib/specOps";
import { TONE, WELL_TONE, type Tone } from "@/lib/tones";
import { usePopover } from "@/lib/usePopover";

type SetSpec = (fn: (s: PivotSpec) => PivotSpec) => void;

const MODE_LABEL: Record<Mode, string> = { per_game: "per game", per_36: "per 36", total: "total" };
// season and season type have their own controls in the toolbar
const TOOLBAR_FILTERS = new Set(["season", "season_type"]);

export function Wells(p: { spec: PivotSpec; setSpec: SetSpec; fields: Map<string, FieldMeta>; dragging: FieldMeta | null }) {
  const label = (id: string) => p.fields.get(id)?.label ?? id;
  const filters = p.spec.filters.filter((f) => !TOOLBAR_FILTERS.has(f.field));

  return (
    <div className="grid gap-2.5 rounded-card border border-line bg-surface p-3 sm:grid-cols-[96px_1fr] sm:gap-x-3">
      <WellRow id="values" title="Values" hint="Numbers to show, e.g. Points" dragging={p.dragging} full={p.spec.values.length >= LIMITS.values}>
        {p.spec.values.map((v, i) => {
          const f = p.fields.get(v.field);
          const modes = f?.modes ?? [];
          return (
            <Chip key={v.field} tone="orange" onRemove={() => p.setSpec((s) => removeAt(s, "values", i))}>
              {f?.label ?? v.field}
              {modes.length > 1 && (
                <select
                  aria-label={`How to show ${f?.label}`}
                  value={v.mode ?? f?.default_mode ?? "total"}
                  onChange={(e) => p.setSpec((s) => setMode(s, i, e.target.value as Mode))}
                  className="ml-1 rounded-[4px] bg-on-orange/12 px-1 py-0.5 font-mono text-[11px] text-on-orange"
                >
                  {modes.map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              )}
            </Chip>
          );
        })}
      </WellRow>
      <WellRow id="rows" title="Rows" hint="Group by, e.g. Player" dragging={p.dragging} full={p.spec.rows.length >= LIMITS.rows}>
        {p.spec.rows.map((id, i) => (
          <Chip key={id} tone="blue" onRemove={() => p.setSpec((s) => removeAt(s, "rows", i))}>
            {label(id)}
          </Chip>
        ))}
      </WellRow>
      <WellRow id="columns" title="Columns" hint="Split across, e.g. Home / away" dragging={p.dragging} full={p.spec.columns.length >= LIMITS.columns}>
        {p.spec.columns.map((id, i) => (
          <Chip key={id} tone="green" onRemove={() => p.setSpec((s) => removeAt(s, "columns", i))}>
            {label(id)}
          </Chip>
        ))}
      </WellRow>
      <WellRow id="filters" title="Filters" hint="Leave games out, e.g. Team" dragging={p.dragging}>
        {filters.map((f) => (
          <FilterChip key={f.field} filter={f} field={p.fields.get(f.field)} setSpec={p.setSpec} />
        ))}
      </WellRow>
    </div>
  );
}

/** Drop zones for the chart: X, Y and Colour. Shown when the chart is on. */
export function ChartWells(p: { spec: PivotSpec; setSpec: SetSpec; fields: Map<string, FieldMeta>; dragging: FieldMeta | null }) {
  const label = (id: string) => p.fields.get(id)?.label ?? id;
  const slot = (well: ChartWell, title: string, hint: string) => {
    const id = p.spec.chart[well];
    return (
      <WellRow id={well} title={title} hint={hint} dragging={p.dragging} full={false}>
        {id ? (
          <Chip tone={WELL_TONE[well]} onRemove={() => p.setSpec((s) => clearChart(s, well))}>
            {label(id)}
          </Chip>
        ) : null}
      </WellRow>
    );
  };
  return (
    <div className="grid gap-2.5 sm:grid-cols-[96px_1fr] sm:gap-x-3">
      {slot("x", "X axis", "Along the bottom, e.g. Month")}
      {slot("y", "Y axis", "Up the side, e.g. Points")}
      {slot("color", "Colour", "One colour each, e.g. Home / away")}
    </div>
  );
}

function WellRow(p: { id: Well; title: string; hint: string; dragging: FieldMeta | null; full?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: p.id });
  const tone = TONE[WELL_TONE[p.id]];
  const accepts = p.dragging ? canDrop(p.dragging, p.id) && !p.full : false;
  const kids = Array.isArray(p.children) ? p.children.filter(Boolean) : p.children;
  const empty = Array.isArray(kids) ? kids.length === 0 : !kids;
  return (
    <>
      <div className="flex items-center sm:pt-1.5 sm:items-start">
        <span className={`title-caps rounded-chip px-2 py-1 text-[11px] tracking-[0.1em] ${tone.block}`}>{p.title}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-btn border-2 px-2 py-1.5 transition-colors ${
          isOver && accepts
            ? `${tone.border} ${tone.soft}`
            : accepts
              ? `border-dashed ${tone.dashed}`
              : p.dragging
                ? "border-line opacity-40"
                : "border-line"
        }`}
      >
        {p.children}
        {empty && <span className="px-1 text-sm text-ink-2">{p.hint}</span>}
      </div>
    </>
  );
}

function Chip(p: { tone: Tone; onRemove: () => void; children: React.ReactNode; onClick?: () => void; incomplete?: boolean }) {
  const t = TONE[p.tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip py-1 pl-2.5 pr-1 text-sm font-medium ${
        p.incomplete ? `border-2 border-dashed ${t.dashed} bg-transparent text-ink` : t.block
      }`}
    >
      {p.onClick ? (
        <button type="button" onClick={p.onClick} className="inline-flex items-center gap-1 hover:underline">
          {p.children}
        </button>
      ) : (
        p.children
      )}
      <button
        type="button"
        onClick={p.onRemove}
        aria-label="Remove"
        className="grid h-5 w-5 place-items-center rounded-[4px] opacity-70 hover:bg-black/15 hover:opacity-100"
      >
        ×
      </button>
    </span>
  );
}

// ── filters ─────────────────────────────────────────────────────────────────

const NUM_OPS = [">=", "<=", "=", ">", "<"] as const;

function describe(f: Filter, field?: FieldMeta) {
  const name = field?.label ?? f.field;
  if (!isComplete(f)) return `${name}: choose…`;
  if (Array.isArray(f.value)) {
    const vals = f.value as (string | number)[];
    const shown = vals.slice(0, 2).join(", ") + (vals.length > 2 ? ` +${vals.length - 2}` : "");
    return `${name}${f.op === "not_in" ? " not" : ""}: ${shown}`;
  }
  return `${name} ${f.op.replace(">=", "≥").replace("<=", "≤")} ${String(f.value)}`;
}

function FilterChip(p: { filter: Filter; field?: FieldMeta; setSpec: SetSpec }) {
  const { open, setOpen, ref } = usePopover(!isComplete(p.filter));

  const remove = () => p.setSpec((s) => ({ ...s, filters: s.filters.filter((f) => f.field !== p.filter.field) }));
  return (
    <div ref={ref} className="relative">
      <Chip tone="red" onRemove={remove} onClick={() => setOpen((o) => !o)} incomplete={!isComplete(p.filter)}>
        {describe(p.filter, p.field)}
      </Chip>
      {open && p.field && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface-2 p-3 shadow-xl">
          {p.field.kind === "dimension" ? (
            <ValuePicker filter={p.filter} field={p.field} setSpec={p.setSpec} />
          ) : (
            <NumberFilter filter={p.filter} setSpec={p.setSpec} />
          )}
        </div>
      )}
    </div>
  );
}

function ValuePicker(p: { filter: Filter; field: FieldMeta; setSpec: SetSpec }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["values", p.field.id, q],
    queryFn: () => api.values(p.field.id, q),
  });
  const chosen = (Array.isArray(p.filter.value) ? p.filter.value : []) as (string | number)[];
  const toggle = (v: string | number) => {
    const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v];
    p.setSpec((s) => setFilter(s, p.filter.field, { op: p.filter.op === "not_in" ? "not_in" : "in", value: next }));
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label-mono">{p.field.label}</span>
        <label className="flex items-center gap-1 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={p.filter.op === "not_in"}
            onChange={(e) => p.setSpec((s) => setFilter(s, p.filter.field, { op: e.target.checked ? "not_in" : "in" }))}
          />
          exclude
        </label>
      </div>
      <input
        autoFocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="mt-2 w-full rounded-btn border border-line bg-bg px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
      />
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {isLoading && <li className="py-2 text-sm text-ink-2">Loading…</li>}
        {data?.values.map((v) => (
          <li key={String(v)}>
            <label className="flex cursor-pointer items-center gap-2 rounded-chip px-1.5 py-1 text-sm hover:bg-bg">
              <input type="checkbox" checked={chosen.includes(v)} onChange={() => toggle(v)} className="accent-[var(--red)]" />
              {String(v)}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NumberFilter(p: { filter: Filter; setSpec: SetSpec }) {
  const value = typeof p.filter.value === "number" ? p.filter.value : "";
  return (
    <div>
      <p className="label-mono">Per game</p>
      <div className="mt-2 flex gap-2">
        <select
          value={p.filter.op}
          onChange={(e) => p.setSpec((s) => setFilter(s, p.filter.field, { op: e.target.value as Filter["op"] }))}
          className="rounded-btn border border-line bg-bg px-2 py-1.5 font-mono text-sm"
        >
          {NUM_OPS.map((o) => (
            <option key={o} value={o}>
              {o.replace(">=", "≥").replace("<=", "≤")}
            </option>
          ))}
        </select>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) =>
            p.setSpec((s) =>
              setFilter(s, p.filter.field, { value: e.target.value === "" ? null : Number(e.target.value) }),
            )
          }
          className="w-full rounded-btn border border-line bg-bg px-2.5 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <p className="mt-2 text-xs text-ink-2">Keeps only the games that meet this, before anything is added up.</p>
    </div>
  );
}
