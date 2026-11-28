// The small two-team cards in the Cup and playoff brackets: a row per team (seed, name, and a
// number: the score or series wins, on green for the winner) and an optional footer line.
import Link from "next/link";
import type { ReactNode } from "react";
import { FINAL, type BGame } from "@/lib/brackets";

/** "home" or "away" once the game is final, else null. */
export const gameWinner = (g: BGame) =>
  g.status !== FINAL ? null : (g.home.score ?? 0) > (g.away.score ?? 0) ? ("home" as const) : ("away" as const);

export function MatchRow(p: {
  abbr: string | null;
  seed?: number | null;
  /** the score or series wins; hidden when null */
  value?: number | null;
  won?: boolean;
  lost?: boolean;
  /** links the team to its page */
  link?: boolean;
  tag?: ReactNode;
  title?: string;
}) {
  const name = p.abbr ?? "TBD";
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${p.lost ? "text-ink-2" : ""}`}>
      {p.seed !== undefined && <span className="w-4 shrink-0 text-right font-mono text-[10px] text-ink-2">{p.seed ?? ""}</span>}
      {p.link && p.abbr ? (
        <Link href={`/teams/${p.abbr}`} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:underline" title={p.title}>
          {name}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={p.title}>
          {name}
        </span>
      )}
      {p.tag}
      {p.value != null && (
        <span className={`rounded-chip px-1.5 font-mono text-[12px] tabular-nums ${p.won ? "bg-green text-on-color" : ""}`}>{p.value}</span>
      )}
    </div>
  );
}

/** Two rows and a footer; the whole card links to the box score when `href` is set. */
export function MatchCard(p: { rows: [ReactNode, ReactNode]; foot?: ReactNode; href?: string | null; label?: string; accent?: boolean }) {
  const card = (
    <div className={`overflow-hidden rounded-btn border bg-surface ${p.accent ? "border-orange" : "border-line"}`}>
      {p.rows[0]}
      <div className="h-px bg-line" />
      {p.rows[1]}
      {p.foot && <div className="border-t border-line bg-table-head px-2.5 py-1 font-mono text-[10px] text-ink-2">{p.foot}</div>}
    </div>
  );
  return p.href ? (
    <Link href={p.href} className="lift block" aria-label={p.label}>
      {card}
    </Link>
  ) : (
    card
  );
}
