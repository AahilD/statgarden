"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type FieldMeta } from "@/lib/api";
import { FORMAT_LABEL, normaliseFormula } from "@/lib/calcs";
import { CALC_FORMATS, type Calc, type CalcFormat } from "@/lib/spec";

const EXAMPLES = ["pts / min", "(pts + reb + ast) / min", "ast / tov", "pts_paint / pts"];

/** Make or change a calculated stat: a name, a formula over field ids, and how to show it. */
export function CalcEditor(p: {
  calc: Calc | null; // null = new
  dataset: string;
  fields: FieldMeta[]; // catalog measures in this dataset
  onSave: (c: Omit<Calc, "id"> & { id?: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(p.calc?.label ?? "");
  const [formula, setFormula] = useState(p.calc?.formula ?? "");
  const [format, setFormat] = useState<CalcFormat>(p.calc?.format ?? "number");
  const [better, setBetter] = useState<"higher" | "lower" | "none">(
    p.calc?.higher_is_better === true ? "higher" : p.calc?.higher_is_better === false ? "lower" : "none",
  );
  const [find, setFind] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  const measures = useMemo(() => p.fields.filter((f) => f.kind === "measure" && f.available), [p.fields]);
  const clean = useMemo(() => normaliseFormula(formula, measures), [formula, measures]);

  // check as they type, a moment after they stop
  const [debounced, setDebounced] = useState(clean);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(clean), 250);
    return () => clearTimeout(t);
  }, [clean]);
  const check = useQuery({
    queryKey: ["calc-check", p.dataset, debounced],
    queryFn: () => api.checkFormula(debounced, p.dataset),
    enabled: debounced.trim().length > 0,
  });
  const ok = !!check.data?.ok && debounced === clean;

  const matches = useMemo(() => {
    const t = find.trim().toLowerCase();
    if (!t) return [];
    return measures
      .filter((f) => f.label.toLowerCase().includes(t) || f.short.toLowerCase().includes(t) || f.id.includes(t))
      .slice(0, 6);
  }, [find, measures]);

  function insert(id: string) {
    const el = box.current;
    const at = el?.selectionStart ?? formula.length;
    const end = el?.selectionEnd ?? formula.length;
    const before = formula.slice(0, at);
    const pad = before && !/[\s(]$/.test(before) ? " " : "";
    const next = `${before}${pad}${id}${formula.slice(end)}`;
    setFormula(next);
    setFind("");
    requestAnimationFrame(() => {
      el?.focus();
      const pos = (before + pad + id).length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function save() {
    if (!ok || !label.trim()) return;
    p.onSave({
      id: p.calc?.id,
      label: label.trim().slice(0, 40),
      formula: clean,
      format,
      higher_is_better: better === "higher" ? true : better === "lower" ? false : null,
    });
  }

  return (
    <form
      className="rounded-card border border-orange bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="title-caps text-[12px]">{p.calc ? "Edit calculation" : "New calculation"}</h3>
        <button type="button" onClick={p.onClose} aria-label="Close" className="text-ink-2 hover:text-ink">
          ×
        </button>
      </div>

      <label className="mt-3 block">
        <span className="label-mono">Name</span>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          placeholder="Points per minute"
          className="mt-1 w-full rounded-btn border border-line bg-sunken px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <label className="mt-3 block">
        <span className="label-mono">Formula</span>
        <textarea
          ref={box}
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={2}
          maxLength={200}
          spellCheck={false}
          placeholder="pts / min"
          className="mt-1 w-full resize-y rounded-btn border border-line bg-sunken px-2.5 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
        />
      </label>
      <p className="mt-1 min-h-[2.5em] text-xs" aria-live="polite">
        {!formula.trim() ? (
          <span className="text-ink-2">
            Field names, numbers, + − * / and brackets. Try{" "}
            {EXAMPLES.map((ex, i) => (
              <span key={ex}>
                <button type="button" className="font-mono text-ink underline decoration-dotted" onClick={() => setFormula(ex)}>
                  {ex}
                </button>
                {i < EXAMPLES.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        ) : check.data && !check.data.ok ? (
          <span className="text-red">{check.data.error}</span>
        ) : ok ? (
          <span className="text-green">Uses {check.data!.fields.map((f) => f.label).join(", ")}. Added up over each row first.</span>
        ) : (
          <span className="text-ink-2">Checking…</span>
        )}
      </p>

      <div className="relative mt-1">
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Insert a field: search, e.g. rebounds"
          aria-label="Find a field to insert"
          className="w-full rounded-btn border border-line bg-sunken px-2.5 py-1.5 text-sm placeholder:text-ink-2 focus:border-accent focus:outline-none"
        />
        {matches.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-30 mt-1 rounded-card border border-line bg-surface-2 p-1 shadow-xl">
            {matches.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => insert(f.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-chip px-2 py-1.5 text-left text-sm hover:bg-sunken"
                >
                  <span className="truncate">{f.label}</span>
                  <span className="font-mono text-[11px] text-ink-2">{f.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="mt-3 block">
        <span className="label-mono">Show as</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as CalcFormat)}
          className="mt-1 w-full rounded-btn border border-line bg-sunken px-2 py-1.5 text-sm"
        >
          {CALC_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="label-mono">Shading</span>
        <select
          value={better}
          onChange={(e) => setBetter(e.target.value as typeof better)}
          className="mt-1 w-full rounded-btn border border-line bg-sunken px-2 py-1.5 text-sm"
        >
          <option value="higher">Higher is better</option>
          <option value="lower">Lower is better</option>
          <option value="none">No shading</option>
        </select>
        <span className="mt-1 block text-[11px] text-ink-2">
          The default. Any view can change it, and how cells are compared, above the table.
        </span>
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!ok || !label.trim()}
          className="rounded-btn bg-orange px-3.5 py-1.5 text-sm font-medium text-on-orange disabled:opacity-40"
        >
          {p.calc ? "Save" : "Add to Values"}
        </button>
        <button type="button" onClick={p.onClose} className="rounded-btn px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
          Cancel
        </button>
        {p.onDelete && (
          <button type="button" onClick={p.onDelete} className="ml-auto rounded-btn px-2 py-1.5 text-sm text-red hover:underline">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
