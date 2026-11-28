"use client";

// The NBA Cup on the teams page: the six groups (East and West, three each) with their games,
// then the knockout bracket. Group winners and one wild card per conference go through.
import Link from "next/link";
import { BracketLines, BracketPanel, Slot } from "@/components/pages/Bracket";
import { gameWinner, MatchCard, MatchRow } from "@/components/pages/Matchup";
import { Heading } from "@/components/pages/Parts";
import { FINAL, type BGame, type BTeam, type CupData, type CupGroup, type CupSlot, type CupTeam } from "@/lib/brackets";
import { shortDate, signed } from "@/lib/pages";

const MARK: Record<NonNullable<CupTeam["status"]>, { label: string; cls: string; title: string }> = {
  winner: { label: "Group winner", cls: "bg-green text-on-color", title: "Won the group: into the quarterfinals" },
  leader: { label: "Leads", cls: "bg-green-soft text-ink", title: "Top of the group so far" },
  wildcard: { label: "Wild card", cls: "bg-orange text-on-orange", title: "Best second-place team in the conference: into the quarterfinals" },
  wildcard_lead: { label: "Wild card spot", cls: "bg-orange-soft text-ink", title: "Best second-place team in the conference so far" },
};

export function CupView({ data }: { data: CupData }) {
  if (!data.season) return <p className="py-16 text-center text-sm text-ink-2">No NBA Cup games loaded yet.</p>;
  const groupsIn = (c: string) => data.groups.filter((g) => g.conference === c);
  return (
    <div className="grid grid-cols-1 gap-12">
      <section>
        <Heading>Group stage</Heading>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {["East", "West"].map((c) => (
            <div key={c} className="grid grid-cols-1 content-start gap-4">
              <h3 className="title-caps text-center text-sm">{c}</h3>
              {groupsIn(c).map((g) => (
                <GroupCard key={g.name} group={g} />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-ink-2">
          Ties: head-to-head, then point differential, then points scored.
        </p>
      </section>

      <section>
        <Heading>Knockout rounds</Heading>
        <CupBracket slots={data.knockout} />
      </section>
    </div>
  );
}

function GroupCard({ group }: { group: CupGroup }) {
  const played = group.games.filter((g) => g.status === FINAL).length;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-baseline justify-between border-b border-line-strong bg-table-head px-3 py-2">
        <span className="title-caps text-sm">{group.name}</span>
        <span className="font-mono text-[11px] text-ink-2">{group.done ? "Final" : `${played} of ${group.games.length} played`}</span>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{group.name} standings</caption>
        <thead>
          <tr className="border-b border-line bg-table-head font-mono text-[11px] uppercase tracking-wide text-ink-2">
            <th scope="col" className="px-3 py-1.5 text-left font-normal">
              Team
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal" title="Wins">
              W
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal" title="Losses">
              L
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-normal" title="Point differential">
              +/−
            </th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((t) => (
            <tr key={t.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2">
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="w-3 font-mono text-[11px] text-ink-2">{t.rank}</span>
                  <Link href={`/teams/${t.abbr}`} className="font-medium hover:underline">
                    <span className="sm:hidden">{t.abbr}</span>
                    <span className="hidden sm:inline">{t.name ?? t.abbr}</span>
                  </Link>
                  {t.status && (
                    <span
                      title={MARK[t.status].title}
                      className={`rounded-full px-2 font-mono text-[10px] uppercase leading-[18px] ${MARK[t.status].cls}`}
                    >
                      {MARK[t.status].label}
                    </span>
                  )}
                </span>
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{t.w}</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{t.l}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-2">{signed(t.diff, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="group border-t border-line">
        <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[11px] text-ink-2 hover:text-ink">
          <span className="inline-block transition-transform group-open:rotate-90">›</span> Games
        </summary>
        <ul className="grid grid-cols-1 gap-1 px-3 pb-3">
          {group.games.map((g) => (
            <GameLine key={g.game_id} g={g} />
          ))}
        </ul>
      </details>
    </div>
  );
}

/** "Nov 14  BOS 112 @ NYK 105", the winner in full ink; links to the box score once it's final. */
function GameLine({ g }: { g: BGame }) {
  const final = g.status === FINAL;
  const awayWon = gameWinner(g) === "away";
  const side = (t: BTeam, won: boolean) => (
    <span className={final && !won ? "text-ink-2" : "font-medium"}>
      {t.abbr ?? "TBD"}
      {final && <span className="ml-1 tabular-nums">{t.score}</span>}
    </span>
  );
  const body = (
    <>
      <span className="w-14 shrink-0 text-ink-2">{g.date ? shortDate(g.date) : ""}</span>
      {side(g.away, awayWon)}
      <span className="text-ink-2">@</span>
      {side(g.home, final && !awayWon)}
    </>
  );
  return (
    <li className="font-mono text-[12px]">
      {final && g.game_id ? (
        <Link href={`/games/${g.game_id}`} className="flex gap-2 rounded-chip px-1 py-0.5 hover:bg-sunken">
          {body}
        </Link>
      ) : (
        <span className="flex gap-2 px-1 py-0.5">{body}</span>
      )}
    </li>
  );
}

/** "Dec 4", or "Dec 4–5" / "Nov 30–Dec 1" for a round spread over two days. */
const dateSpan = (from: string, to: string | null) => {
  if (!to) return shortDate(from);
  const [a, b] = [shortDate(from), shortDate(to)];
  return a.split(" ")[0] === b.split(" ")[0] ? `${a}–${b.split(" ")[1]}` : `${a}–${b}`;
};

const ROUNDS = ["Quarterfinal", "Semifinal", "Championship"];
const ROUND_LABEL: Record<string, string> = {
  Quarterfinal: "Quarterfinals",
  Semifinal: "Semifinals",
  Championship: "Final",
};

function CupBracket({ slots }: { slots: CupSlot[] }) {
  const next: Record<string, string | undefined> = {
    Quarterfinal: "Semifinal",
    Semifinal: "Championship",
  };
  return (
    <BracketPanel className="overflow-x-auto">
      <BracketLines className="min-w-[560px]">
        <div className="grid grid-cols-3 gap-6">
          {ROUNDS.map((r) => (
            <div key={r} className="flex flex-col">
              <div className="label-mono mb-2 text-center">{ROUND_LABEL[r]}</div>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {slots
                  .filter((s) => s.round === r)
                  .map((s, i) => (
                    <Slot key={i} id={`${r}-${i}`} to={next[r] && `${next[r]}-${Math.floor(i / 2)}`} won={s.status === FINAL}>
                      <KnockoutGame s={s} />
                    </Slot>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </BracketLines>
    </BracketPanel>
  );
}

/** One knockout slot: seeds, scores once it's final, the winner on green. Before the teams are
 * set it shows who'd be there from the group tables (or the winners of the round before). */
function KnockoutGame({ s }: { s: CupSlot }) {
  const final = s.status === FINAL;
  const topWon = final && (s.top.score ?? 0) > (s.bottom.score ?? 0);
  const champ = s.round === "Championship";
  // the final isn't in the box score data (it doesn't count), so no link for it
  const href = final && !champ && s.game_id ? `/games/${s.game_id}` : null;
  // team links only when the card itself isn't a link
  const row = (t: BTeam, won: boolean) => (
    <MatchRow
      abbr={t.abbr}
      seed={t.seed}
      link={!href}
      title={t.name ?? undefined}
      value={t.score}
      won={final && won}
      lost={final && !won}
    />
  );
  return (
    <MatchCard
      rows={[row(s.top, topWon), row(s.bottom, !topWon)]}
      foot={s.date ? dateSpan(s.date, s.date_to) : null}
      href={href}
      label={`${s.top.abbr} v ${s.bottom.abbr}: box score`}
      accent={champ}
    />
  );
}
