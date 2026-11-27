// Building blocks shared by the player, team and glossary pages: the title card, stat tiles,
// section headings and a plain stats table. All server-rendered.
import Link from "next/link";
import type { ReactNode } from "react";
import { TONE, type Tone } from "@/lib/tones";

/** Centred, framed twice: the same title card as the home page, for one player or team. */
export function TitleCard(p: { eyebrow?: ReactNode; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line-strong p-1.5 sm:p-2">
      <div className="rounded-[10px] border border-line-strong bg-surface px-5 py-9 text-center sm:px-10 sm:py-12">
        {p.eyebrow && <div className="label-mono flex flex-wrap items-center justify-center gap-x-2 gap-y-1">{p.eyebrow}</div>}
        <h1 className="title-caps mt-4 text-[clamp(1.9rem,7vw,3.6rem)] leading-[1.05] tracking-[0.12em]">{p.title}</h1>
        {p.sub && (
          <div className="mx-auto mt-4 flex max-w-[640px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-2">
            {p.sub}
          </div>
        )}
        {p.children}
      </div>
    </section>
  );
}

/** A dot between items in a line of facts. */
export const Dot = () => <span aria-hidden className="text-line-strong">·</span>;

/** HUD-style number tile: label, big number, one line of context. */
export function Tile(p: { label: string; value: string; note?: ReactNode; tone: Tone }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className={`h-1.5 ${TONE[p.tone].block}`} />
      <div className="px-4 pb-3.5 pt-3">
        <div className="label-mono">{p.label}</div>
        <div className="title-caps mt-1 text-[clamp(1.6rem,5vw,2.25rem)] leading-none tracking-[0.04em]">{p.value}</div>
        {p.note && <div className="mt-2 truncate font-mono text-[11px] text-ink-2">{p.note}</div>}
      </div>
    </div>
  );
}

/** Section heading with a rule either side, like the home page's. */
export function Heading({ children, id, aside }: { children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <div id={id} className="mb-4 flex scroll-mt-24 items-center gap-4">
      <span className="h-px flex-1 bg-line-strong" />
      <h2 className="title-caps text-lg">{children}</h2>
      <span className="h-px flex-1 bg-line-strong" />
      {aside}
    </div>
  );
}

export type Column<R> = {
  key: string;
  label: string;
  title?: string; // what the short label means
  cell: (r: R) => ReactNode;
  text?: boolean; // left-aligned text column (numbers are right-aligned)
  sticky?: boolean; // stays put when the table scrolls sideways (first column)
  strong?: boolean;
};

/** A plain stats table: scrolls sideways on phones with the first column pinned. */
export function StatTable<R>(p: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  rowClass?: (r: R) => string;
  foot?: R[];
  caption?: string;
}) {
  const cellCls = (c: Column<R>, head = false) =>
    [
      "whitespace-nowrap px-3 py-2",
      c.text ? "text-left" : "text-right font-mono tabular-nums",
      c.sticky ? "sticky left-0 z-[1] bg-surface" : "",
      c.strong && !head ? "font-medium text-ink" : "",
    ].join(" ");
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full border-collapse text-[13px]">
        {p.caption && <caption className="sr-only">{p.caption}</caption>}
        <thead>
          <tr className="border-b border-line-strong">
            {p.columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                title={c.title}
                className={`${cellCls(c, true)} font-mono text-[11px] font-normal uppercase tracking-wide text-ink-2`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={p.rowKey(r)} className={`border-b border-line last:border-0 ${p.rowClass?.(r) ?? ""}`}>
              {p.columns.map((c) => (
                <td key={c.key} className={cellCls(c)}>
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
  );
}

/** Buttons into the Lab with a view already built. */
export function LabLinks({ links }: { links: { label: string; href: string; tone: Tone }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {links.map((l) => (
        <Link
          key={l.label}
          href={l.href}
          className="lift inline-flex items-center gap-2 rounded-btn border border-line bg-surface px-3.5 py-2 text-sm hover:border-line-strong"
        >
          <i aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${TONE[l.tone].block}`} />
          {l.label}
        </Link>
      ))}
    </div>
  );
}

/** Not-found body for a player or team that isn't in the data. */
export function Missing({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <h1 className="title-caps text-2xl">No such {what}</h1>
      <p className="mt-3 text-sm text-ink-2">It may be from a season that isn&apos;t loaded yet. Try the search at the top.</p>
    </div>
  );
}
