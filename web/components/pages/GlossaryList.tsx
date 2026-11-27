"use client";

// The glossary's list: filter by typing, jump to a group, link to one stat with #id.
import { useMemo, useState } from "react";
import type { GlossaryField } from "@/lib/pages";

export function GlossaryList({ groups, fields }: { groups: string[]; fields: GlossaryField[] }) {
  const [q, setQ] = useState("");
  const byGroup = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (f: GlossaryField) =>
      !term || [f.label, f.short, f.description, f.id].some((s) => s.toLowerCase().includes(term));
    return groups
      .map((g) => ({ group: g, fields: fields.filter((f) => f.group === g && match(f)) }))
      .filter((g) => g.fields.length > 0);
  }, [groups, fields, q]);
  const count = byGroup.reduce((n, g) => n + g.fields.length, 0);

  return (
    <>
      <div className="sticky top-[62px] z-10 -mx-4 mt-8 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-3 backdrop-blur-md">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Filter ${fields.length} stats, e.g. "true shooting" or "TOV%"`}
          aria-label="Filter the glossary"
          className="w-full rounded-btn border border-line bg-surface px-3.5 py-2.5 text-sm placeholder:text-ink-2 focus:border-accent focus:outline-none"
        />
        {!q && (
          <nav aria-label="Groups" className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
            {byGroup.map(({ group }) => (
              <a
                key={group}
                href={`#group-${slug(group)}`}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-ink-2 hover:border-line-strong hover:text-ink"
              >
                {group}
              </a>
            ))}
          </nav>
        )}
        {q && <p className="label-mono mt-2">{count === 0 ? "No stats match" : `${count} match${count === 1 ? "" : "es"}`}</p>}
      </div>

      {byGroup.map(({ group, fields: list }) => (
        <section key={group} id={`group-${slug(group)}`} className="mt-10 scroll-mt-44">
          <div className="mb-3 flex items-center gap-4">
            <h2 className="title-caps text-lg">{group}</h2>
            <span className="h-px flex-1 bg-line-strong" />
          </div>
          <dl className="overflow-hidden rounded-card border border-line bg-surface">
            {list.map((f) => (
              <div key={f.id} id={f.id} className="scroll-mt-44 border-b border-line px-4 py-3.5 last:border-0 target:bg-orange-soft">
                <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="font-medium text-ink">{f.label}</span>
                  {f.short !== f.label && (
                    <span className="rounded-chip border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{f.short}</span>
                  )}
                  {f.higher_is_better === false && <span className="font-mono text-[10px] uppercase tracking-wide text-ink-2">lower is better</span>}
                  {!f.available && <span className="font-mono text-[10px] uppercase tracking-wide text-ink-2">not loaded yet</span>}
                </dt>
                <dd className="mt-1 text-sm text-ink-2">{f.description}</dd>
                {f.formula && (
                  <dd className="mt-1.5 font-mono text-[12px] text-ink">
                    <span className="text-ink-2">= </span>
                    {f.formula}
                  </dd>
                )}
                {f.datasets.length > 0 && (
                  <dd className="mt-1.5 font-mono text-[11px] text-ink-2">In: {f.datasets.join(", ")}</dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
