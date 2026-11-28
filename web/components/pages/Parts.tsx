// Building blocks shared by the player, team and glossary pages: the title card, stat tiles,
// section headings; the stats table (StatTable) is a client component of its own.
import type { ReactNode } from "react";
import { TONE, type Tone } from "@/lib/tones";

export { Pills, StatTable, type Column } from "./StatTable";

/** Centred, framed twice: the same title card as the home page, for one player or team. With
 * `colors` (a team's), the card gets a stripe of them across the top and a border in the first. */
export function TitleCard(p: { eyebrow?: ReactNode; title: string; sub?: ReactNode; children?: ReactNode; colors?: string[] }) {
  return (
    <section className="rounded-[14px] border border-line-strong p-1.5 sm:p-2">
      <div
        className={`overflow-hidden rounded-[10px] bg-surface text-center ${p.colors ? "border-2" : "border border-line-strong"}`}
        style={p.colors ? { borderColor: p.colors[0] } : undefined}
      >
        {p.colors && (
          <div aria-hidden className="flex h-2">
            {p.colors.map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
        )}
        <div className="px-5 py-9 sm:px-10 sm:py-12">
        {p.eyebrow && <div className="label-mono flex flex-wrap items-center justify-center gap-x-2 gap-y-1">{p.eyebrow}</div>}
        <h1 className="title-caps mt-4 text-[clamp(1.9rem,7vw,3.6rem)] leading-[1.05] tracking-[0.12em]">{p.title}</h1>
        {p.sub && (
          <div className="mx-auto mt-4 flex max-w-[640px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-2">
            {p.sub}
          </div>
        )}
        {p.children}
        </div>
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
    <div id={id} className="mb-4 flex scroll-mt-32 items-center gap-4">
      <span className="h-px flex-1 bg-line-strong" />
      <h2 className="title-caps text-lg">{children}</h2>
      <span className="h-px flex-1 bg-line-strong" />
      {aside}
    </div>
  );
}

