"use client";

import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FieldMeta } from "@/lib/api";
import { LIMITS, SHARE_MODES, type Filter, type Mode, type PivotSpec } from "@/lib/spec";
import { canDrop, isComplete, MAX_FILTERS_PER_NUMBER, removeAt, removeFilterAt, setFilterAt, setMode, type Well } from "@/lib/specOps";
import { TONE, WELL_TONE, type Tone } from "@/lib/tones";
import { usePopover } from "@/lib/usePopover";
import { useTeamNames } from "@/lib/teams";
import { fromRange, isPct, rangeText, toRange, type Range } from "@/lib/ranges";

type SetSpec = (fn: (s: PivotSpec) => PivotSpec) => void;

const MODE_LABEL: Record<Mode, string> = {
  per_game: "per game",
  per_36: "per 36",
  per_100: "per 100 poss",
  total: "total",
  pct_col: "% of column",
  pct_row: "% of row",
};
// season and season type have their own controls in the toolbar
const TOOLBAR_FILTERS = new Set(["season", "season_type"]);

export function Wells(p: {
  spec: PivotSpec;
  setSpec: SetSpec;
  fields: Map<string, FieldMeta>;
  dragging: FieldMeta | null;
  onCollapse?: () => void;
}) {
  const label = (id: string) => p.fields.get(id)?.label ?? id;

  return (
    <div className="relative grid gap-2 rounded-card border border-line bg-surface p-3 pr-11">
      {p.onCollapse && (
        <button
          type="button"
          onClick={p.onCollapse}
          aria-label="Hide the builder"
          title="Hide the builder"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-btn text-ink-2 hover:bg-sunken hover:text-ink"
        >
          <Chevron up />
        </button>
      )}
      <WellRow id="values" title="Values" hint="Numbers to show, e.g. Points" dragging={p.dragging} full={p.spec.values.length >= LIMITS.values}>
        {p.spec.values.map((v, i) => {
          const f = p.fields.get(v.field);
          const mode = v.mode ?? f?.default_mode ?? "total";
          // % of row only means something once there's a split across columns
          const modes = (f?.modes ?? []).filter((m) => m !== "pct_row" || p.spec.columns.length > 0 || m === mode);
          return (
            <Chip key={v.field} tone="orange" onRemove={() => p.setSpec((s) => removeAt(s, "values", i))}>
              {f?.label ?? v.field}
              {modes.length > 1 && (
                <ModeMenu
                  label={`How to show ${f?.label}`}
                  value={mode}
                  options={modes.map((m) => ({ id: m, label: m === "pct_col" && p.spec.columns.length === 0 ? "% of total" : MODE_LABEL[m] }))}
                  onChange={(m) => p.setSpec((s) => setMode(s, i, m))}
                />
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
        {p.spec.filters.map((f, i) =>
          TOOLBAR_FILTERS.has(f.field) ? null : (
            <FilterChip
              key={`${f.field}:${i}`}
              index={i}
              canAddAnother={p.spec.filters.filter((x) => x.field === f.field).length < MAX_FILTERS_PER_NUMBER}
              filter={f} field={p.fields.get(f.field)} setSpec={p.setSpec} dataset={p.spec.dataset} />
          ),
        )}
      </WellRow>
    </div>
  );
}

/** The builder folded into one line: what the view shows. Click to open it again. */
export function WellsSummary(p: { spec: PivotSpec; fields: Map<string, FieldMeta>; onExpand: () => void }) {
  const f = (id: string) => p.fields.get(id);
  const values = p.spec.values.map((v) => {
    const meta = f(v.field);
    const mode = v.mode && v.mode !== "total" && (meta?.modes.length ?? 0) > 1 ? ` ${MODE_LABEL[v.mode]}` : "";
    return (meta?.label ?? v.field) + mode;
  });
  const parts = [
    values.join(", ") || "No values yet",
    p.spec.rows.length ? `by ${p.spec.rows.map((id) => f(id)?.label ?? id).join(", ")}` : "",
    p.spec.columns.length ? `split by ${p.spec.columns.map((id) => f(id)?.label ?? id).join(", ")}` : "",
  ].filter(Boolean);
  const filters = p.spec.filters.filter((x) => !TOOLBAR_FILTERS.has(x.field)).map((x) => describe(x, f(x.field)));

  return (
    <button
      type="button"
      onClick={p.onExpand}
      aria-label="Show the builder"
      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-ink-2/40"
    >
      <span className="label-mono shrink-0">View</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-ink">{parts.join(" ")}</span>
        {filters.length > 0 && <span className="text-ink-2"> · {filters.join(" · ")}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">
        Edit <Chevron />
      </span>
    </button>
  );
}

export function Chevron({ up, left, right }: { up?: boolean; left?: boolean; right?: boolean }) {
  const rot = up ? "rotate-180" : left ? "rotate-90" : right ? "-rotate-90" : "";
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 ${rot}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** Drop zones for the chart: X, Y and Colour. Shown when the chart is on. */
/**
 * How a value is shown (total, per game, % of column…). A plain total shows only a small ▾;
 * anything else shows its name, so the chip says "Points per game" at a glance.
 */
function ModeMenu(p: { label: string; value: Mode; options: { id: Mode; label: string }[]; onChange: (m: Mode) => void }) {
  const plain = p.value === "total";
  const now = p.options.find((o) => o.id === p.value)?.label ?? p.value;
  return (
    <span
      className={`relative ml-1 inline-flex items-center gap-0.5 rounded-[4px] font-mono text-[11px] text-on-orange focus-within:ring-2 focus-within:ring-on-orange/40 ${
        plain ? "px-0.5 py-0.5 hover:bg-on-orange/12" : "bg-on-orange/12 px-1 py-0.5"
      }`}
      title={plain ? "Total. Pick another way to show it" : undefined}
    >
      {!plain && now}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
      {/* the real control: invisible on top, so the keyboard and screen readers get a normal select */}
      <select
        aria-label={p.label}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value as Mode)}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      >
        {p.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

function WellRow(p: { id: Well; title: string; hint: string; dragging: FieldMeta | null; full?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: p.id });
  const tone = TONE[WELL_TONE[p.id]];
  const accepts = p.dragging ? canDrop(p.dragging, p.id) && !p.full : false;
  const kids = Array.isArray(p.children) ? p.children.filter(Boolean) : p.children;
  const empty = Array.isArray(kids) ? kids.length === 0 : !kids;
  // one piece: the coloured label is the left end of the box it names
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[42px] overflow-hidden rounded-btn border-2 transition-colors ${
        isOver && accepts
          ? `${tone.border} ${tone.soft}`
          : accepts
            ? `border-dashed ${tone.dashed}`
            : p.dragging
              ? "border-line opacity-40"
              : "border-line"
      }`}
    >
      <div className={`flex w-[78px] shrink-0 items-center justify-center sm:w-[88px] ${tone.block}`}>
        {/* the extra left padding evens out the letter spacing after the last letter */}
        <span className="title-caps pl-[0.1em] text-[11px] tracking-[0.1em]">{p.title}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-2 py-1.5">
        {p.children}
        {empty && <span className="px-1 text-sm text-ink-2">{p.hint}</span>}
      </div>
    </div>
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

function describe(f: Filter, field?: FieldMeta) {
  const group = f.scope === "group";
  const mode = group && f.mode && f.mode !== "total" ? ` ${MODE_LABEL[f.mode]}` : "";
  const name = (field?.label ?? f.field) + mode + (field?.kind === "measure" ? (group ? " (row)" : " (game)") : "");
  if (!isComplete(f)) return `${name}: choose…`;
  if (f.op === "in" || f.op === "not_in") {
    const vals = f.value as (string | number)[];
    const shown = vals.slice(0, 2).join(", ") + (vals.length > 2 ? ` +${vals.length - 2}` : "");
    return `${name}${f.op === "not_in" ? " not" : ""}: ${shown}`;
  }
  if (f.op === "!=" || f.op === "contains") return `${name} ${f.op === "!=" ? "≠" : "has"} ${String(f.value)}`;
  return `${name} ${rangeText(f, field)}`;
}

function FilterChip(p: { index: number; canAddAnother: boolean; filter: Filter; field?: FieldMeta; setSpec: SetSpec; dataset: string }) {
  const { open, setOpen, ref } = usePopover(!isComplete(p.filter));

  const remove = () => p.setSpec((s) => removeFilterAt(s, p.index));
  return (
    <div ref={ref} className="relative">
      <Chip tone="red" onRemove={remove} onClick={() => setOpen((o) => !o)} incomplete={!isComplete(p.filter)}>
        {describe(p.filter, p.field)}
      </Chip>
      {open && p.field && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface-2 p-3 shadow-xl">
          {p.field.kind === "dimension" ? (
            <ValuePicker index={p.index} filter={p.filter} field={p.field} setSpec={p.setSpec} dataset={p.dataset} />
          ) : (
            <NumberFilter index={p.index} filter={p.filter} field={p.field} setSpec={p.setSpec} canAddAnother={p.canAddAnother} onAdded={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function ValuePicker(p: { index: number; filter: Filter; field: FieldMeta; setSpec: SetSpec; dataset: string }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["values", p.dataset, p.field.id, q],
    queryFn: () => api.values(p.field.id, q, p.dataset),
  });
  const teamNames = useTeamNames();
  const chosen = (Array.isArray(p.filter.value) ? p.filter.value : []) as (string | number)[];
  const toggle = (v: string | number) => {
    const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v];
    p.setSpec((s) => setFilterAt(s, p.index, { op: p.filter.op === "not_in" ? "not_in" : "in", value: next }));
  };
  // Picked values go first. The order is set when the list opens or the search changes,
  // not on every click, so rows don't jump out from under the pointer while picking.
  const [top, setTop] = useState({ q, values: chosen });
  if (top.q !== q) setTop({ q, values: chosen });
  const found = data?.values ?? [];
  const pinned = q ? top.values.filter((v) => found.includes(v)) : top.values;
  const rest = found.filter((v) => !pinned.includes(v));
  const row = (v: string | number) => (
    <li key={String(v)}>
      <label className="flex cursor-pointer items-center gap-2 rounded-chip px-1.5 py-1 text-sm hover:bg-sunken">
        <input type="checkbox" checked={chosen.includes(v)} onChange={() => toggle(v)} className="accent-[var(--red)]" />
        {p.field.names === "team" && teamNames.get(String(v)) ? (
          <>
            {teamNames.get(String(v))}
            <span className="ml-auto font-mono text-[11px] text-ink-2">{String(v)}</span>
          </>
        ) : (
          String(v)
        )}
      </label>
    </li>
  );
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label-mono">{p.field.label}</span>
        <label className="flex items-center gap-1 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={p.filter.op === "not_in"}
            onChange={(e) => p.setSpec((s) => setFilterAt(s, p.index, { op: e.target.checked ? "not_in" : "in" }))}
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
        className="mt-2 w-full rounded-btn border border-line bg-sunken px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
      />
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {pinned.map(row)}
        {pinned.length > 0 && rest.length > 0 && <li aria-hidden className="my-1 border-t border-line" />}
        {isLoading && <li className="py-2 text-sm text-ink-2">Loading…</li>}
        {rest.map(row)}
      </ul>
    </div>
  );
}

function NumberFilter(p: { index: number; filter: Filter; field: FieldMeta; setSpec: SetSpec; canAddAnother: boolean; onAdded: () => void }) {
  const scope = p.filter.scope ?? "game";
  const plain = p.field.modes.filter((m) => !SHARE_MODES.includes(m)); // filter on the number, not its share
  const modes = plain.length ? plain : (["total"] as Mode[]);
  const mode = p.filter.mode ?? (modes.includes("total") ? "total" : modes[0]);
  const set = (patch: Partial<Filter>) => p.setSpec((s) => setFilterAt(s, p.index, patch));
  const r = toRange(p.filter);
  const setRange = (patch: Partial<Range>) => set(fromRange({ ...r, ...patch }));
  const pct = isPct(p.field);
  const outside = p.filter.op === "between" && !!p.filter.outside;
  const scale = (x: number | null) => (x === null || !pct ? x : +(x * 100).toFixed(6));
  const unscale = (x: number | null) => (x === null || !pct ? x : x / 100);

  return (
    <div>
      <p className="label-mono">{p.field.label}</p>
      <div role="radiogroup" aria-label="Apply to" className="mt-2 grid grid-cols-2 rounded-btn border border-line bg-sunken p-0.5">
        {(["game", "group"] as const).map((sc) => (
          <button
            key={sc}
            type="button"
            role="radio"
            aria-checked={scope === sc}
            onClick={() => set({ scope: sc, mode: sc === "group" ? mode : undefined })}
            className={`rounded-chip px-2 py-1 text-xs font-medium ${scope === sc ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
          >
            {sc === "game" ? "Each game" : "Whole row"}
          </button>
        ))}
      </div>
      {scope === "group" && modes.length > 1 && (
        <label className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-2">
          Which number
          <select
            value={mode}
            onChange={(e) => set({ mode: e.target.value as Mode })}
            className="rounded-btn border border-line bg-sunken px-1.5 py-1 font-mono text-xs text-ink"
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div role="radiogroup" aria-label="Keep" className="mt-2.5 grid grid-cols-2 rounded-btn border border-line bg-sunken p-0.5">
        {([false, true] as const).map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={outside === o}
            onClick={() => set({ ...fromRange(r), outside: o || undefined })}
            className={`rounded-chip px-2 py-1 text-xs font-medium ${outside === o ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
          >
            {o ? "Outside a range" : "In a range"}
          </button>
        ))}
      </div>

      <div className="mt-2.5 grid grid-cols-[3rem_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
        {/* outside keeps "below lo or above hi"; the signs show what's kept, so they flip */}
        <RangeEnd
          label={outside ? "Below" : "From"}
          value={scale(r.lo)}
          inclusive={outside ? !r.loIn : r.loIn}
          signs={outside ? ["≤", "<"] : ["≥", ">"]}
          suffix={pct ? "%" : undefined}
          autoFocus
          onValue={(lo) => setRange({ lo: unscale(lo) })}
          onInclusive={(v) => setRange({ loIn: outside ? !v : v })}
        />
        <RangeEnd
          label={outside ? "Above" : "To"}
          value={scale(r.hi)}
          inclusive={outside ? !r.hiIn : r.hiIn}
          signs={outside ? ["≥", ">"] : ["≤", "<"]}
          suffix={pct ? "%" : undefined}
          onValue={(hi) => setRange({ hi: unscale(hi) })}
          onInclusive={(v) => setRange({ hiIn: outside ? !v : v })}
        />
      </div>

      <p className="mt-2.5 text-xs text-ink-2">
        Leave a box empty for no limit. {scope === "game" ? "Keeps only the games that match, before anything is added up." : "Keeps only the rows whose added-up number matches."}
      </p>
      <button
        type="button"
        onClick={() => {
          // the new one opens on its own; this one steps aside
          p.onAdded();
          p.setSpec((s) => ({
            ...s,
            filters: [
              ...s.filters,
              { field: p.filter.field, op: "between", value: [null, null], ends: "[]", scope: scope === "group" ? "game" : "group", mode: scope === "group" ? undefined : mode },
            ],
          }));
        }}
        disabled={!p.canAddAnother}
        className="mt-2 text-xs font-medium text-accent-ink hover:underline disabled:text-ink-2 disabled:no-underline disabled:opacity-60"
        title={p.canAddAnother ? undefined : "Three filters per stat is the most"}
      >
        + Another {p.field.label} filter
      </button>
    </div>
  );
}

/** One end of a range: ≥ / > (or ≤ / <) and the number. Keeps what's typed ("0.", "-") until it's a number. */
function RangeEnd(p: {
  label: string;
  value: number | null;
  inclusive: boolean;
  signs: [string, string];
  suffix?: string;
  autoFocus?: boolean;
  onValue: (v: number | null) => void;
  onInclusive: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (p.value === null ? "" : String(p.value));
  return (
    <>
      <span className="text-xs text-ink-2">{p.label}</span>
      <span role="radiogroup" aria-label={`${p.label}: include the number itself?`} className="inline-flex rounded-chip border border-line bg-sunken p-0.5">
        {p.signs.map((sign, i) => {
          const on = p.inclusive === (i === 0);
          return (
            <button
              key={sign}
              type="button"
              role="radio"
              aria-checked={on}
              title={i === 0 ? "Includes the number" : "Leaves the number out"}
              onClick={() => p.onInclusive(i === 0)}
              className={`w-7 rounded-[4px] py-0.5 font-mono text-sm ${on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
            >
              {sign}
            </button>
          );
        })}
      </span>
      <span className="relative block">
        <input
          autoFocus={p.autoFocus}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="any"
          aria-label={`${p.label} value${p.suffix ? ` (${p.suffix})` : ""}`}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.\-]/g, "");
            setDraft(t);
            if (t === "") p.onValue(null);
            else if (Number.isFinite(Number(t)) && !/^-?\.?$/.test(t)) p.onValue(Number(t));
          }}
          onBlur={() => setDraft(null)}
          className={`w-full min-w-0 rounded-btn border border-line bg-sunken py-1.5 pl-2.5 font-mono text-sm text-ink placeholder:text-ink-2/60 focus:border-accent focus:outline-none ${p.suffix ? "pr-6" : "pr-2.5"}`}
        />
        {p.suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-2">{p.suffix}</span>}
      </span>
    </>
  );
}
