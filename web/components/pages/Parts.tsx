// Building blocks shared by the player, team and glossary pages: the title card, stat tiles,
// section headings; the stats table (StatTable) is a client component of its own.
import Link from "next/link";
import type { ReactNode } from "react";
import { TONE, type Tone } from "@/lib/tones";

export { Pills, StatTable, type Column } from "./StatTable";

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

/** HUD-style number tile: label, big number, one line of context. `compact` fits five or six in a row. */
export function Tile(p: { label: string; short?: string; value: string; note?: ReactNode; tone: Tone; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className={`h-1.5 ${TONE[p.tone].block}`} />
      <div className={p.compact ? "px-3 pb-3 pt-2.5" : "px-4 pb-3.5 pt-3"}>
        <div className="label-mono">
          {p.short ? (
            <>
              <span className="sm:hidden">{p.short}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </>
          ) : (
            p.label
          )}
        </div>
        <div
          className={`title-caps mt-1 leading-none tracking-[0.04em] ${
            p.compact ? "text-[clamp(1.35rem,4vw,1.9rem)]" : "text-[clamp(1.6rem,5vw,2.25rem)]"
          }`}
        >
          {p.value}
        </div>
        {p.note && <div className="mt-2 truncate font-mono text-[11px] text-ink-2">{p.note}</div>}
      </div>
    </div>
  );
}

/** Tiles in a row: five or six across on wider screens; on phones three per line, centred. */
export function TileRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 sm:grid sm:auto-cols-fr sm:grid-flow-col sm:gap-3 [&>*]:w-[calc((100%-1rem)/3)] sm:[&>*]:w-auto">
      {children}
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

