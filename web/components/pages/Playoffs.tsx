"use client";

// The playoff bracket on the teams page: West on the left, East on the right, the Finals in the
// middle (stacked on smaller screens), with each conference's play-in underneath. Before the
// playoffs start it's the bracket if the season ended today, from NBA.com's seeding.
import { gameWinner, MatchCard, MatchRow } from "@/components/pages/Matchup";
import { Heading, LabLinks } from "@/components/pages/Parts";
import { seriesLine, type BGame, type PlayoffConference, type PlayoffData, type Series, type SeriesTeam } from "@/lib/brackets";
import { playoffLinks } from "@/lib/labLinks";
import { shortDate } from "@/lib/pages";

const ROUND_LABEL = ["First round", "Semifinals", "Conf. finals"];

export function PlayoffsView({ data }: { data: PlayoffData }) {
  const west = data.conferences.find((c) => c.name === "West");
  const east = data.conferences.find((c) => c.name === "East");
  return (
    <div className="grid grid-cols-1 gap-12">
      <section>
        <Heading>{data.projected ? "If the season ended today" : "Bracket"}</Heading>

        {/* wide screens: the classic bracket, conferences facing each other */}
        <div className="hidden lg:block">
          <div className="mb-1 grid grid-cols-[minmax(0,3fr)_minmax(0,1.15fr)_minmax(0,3fr)] gap-3 text-center">
            <span className="title-caps text-sm">West</span>
            <span />
            <span className="title-caps text-sm">East</span>
          </div>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.15fr)_repeat(3,minmax(0,1fr))] gap-3">
            {west && [0, 1, 2].map((r) => <RoundColumn key={`w${r}`} conf={west} round={r} projected={data.projected} />)}
            <FinalsColumn finals={data.finals} />
            {east && [2, 1, 0].map((r) => <RoundColumn key={`e${r}`} conf={east} round={r} projected={data.projected} />)}
          </div>
        </div>

        {/* phones and tablets: one conference at a time, then the Finals */}
        <div className="grid grid-cols-1 gap-8 lg:hidden">
          {[west, east].map(
            (c) =>
              c && (
                <div key={c.name}>
                  <h3 className="title-caps mb-3 text-center text-sm">{c.name}</h3>
                  <div className="overflow-x-auto pb-1">
                    <div className="grid min-w-[340px] grid-cols-3 gap-2">
                      {[0, 1, 2].map((r) => (
                        <RoundColumn key={r} conf={c} round={r} projected={data.projected} />
                      ))}
                    </div>
                  </div>
                </div>
              ),
          )}
          <div className="mx-auto w-full max-w-[260px]">
            <FinalsColumn finals={data.finals} />
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-[11px] text-ink-2">
          {data.projected
            ? "Seeds from NBA.com's standings today. Seeds 7 to 10 (PI) go to the play-in first. It fills in as the season goes."
            : "Best of seven."}
        </p>
      </section>

      <section>
        <Heading>Play-In</Heading>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[west, east].map((c) => c && <PlayIn key={c.name} conf={c} projected={data.projected} />)}
        </div>
        <p className="mt-3 text-center font-mono text-[11px] text-ink-2">
          7 v 8: the winner is the 7 seed. 9 v 10: the loser is out. Then the 7 v 8 loser plays the 9 v 10 winner for the 8 seed.
        </p>
      </section>

      {!data.projected && (
        <section>
          <Heading>Dig deeper in the Lab</Heading>
          <LabLinks links={playoffLinks(data.season)} />
        </section>
      )}
    </div>
  );
}

function RoundColumn({ conf, round, projected }: { conf: PlayoffConference; round: number; projected: boolean }) {
  const slots = conf.rounds[round] ?? [];
  return (
    <div className="flex flex-col">
      <div className="label-mono mb-2 truncate text-center" title={`${conf.name} ${ROUND_LABEL[round].toLowerCase()}`}>
        {ROUND_LABEL[round]}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {slots.map((s, i) => (
          <SeriesCard key={i} s={s} projected={projected} />
        ))}
      </div>
    </div>
  );
}

function FinalsColumn({ finals }: { finals: Series | null }) {
  return (
    <div className="flex flex-col">
      <div className="label-mono mb-2 text-center">NBA Finals</div>
      <div className="flex flex-1 flex-col justify-center">
        <SeriesCard s={finals} big />
        {finals?.winner && (
          <div className="mt-3 text-center">
            <span className="rounded-full bg-orange px-3 py-1 font-mono text-[11px] uppercase text-on-orange">{finals.winner} champions</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** A series: both teams with seed and wins, the winner's wins on green. Empty slot = TBD. */
function SeriesCard({ s, projected, big }: { s: Series | null; projected?: boolean; big?: boolean }) {
  if (!s)
    return (
      <div className={`rounded-btn border border-dashed ${big ? "border-orange" : "border-line"} bg-surface px-3 py-3 text-center font-mono text-[11px] text-ink-2`}>
        TBD
      </div>
    );
  const row = (t: SeriesTeam) => (
    <MatchRow
      abbr={t.abbr}
      seed={t.seed}
      link
      title={t.name ?? t.abbr}
      value={projected ? null : t.wins}
      won={s.winner === t.abbr}
      lost={!!s.winner && s.winner !== t.abbr}
      tag={
        projected && t.playin ? (
          <span title="Would go through the play-in first" className="font-mono text-[9px] uppercase text-ink-2">
            PI
          </span>
        ) : undefined
      }
    />
  );
  return <MatchCard rows={[row(s.top), row(s.bottom)]} foot={projected ? null : seriesLine(s) || null} accent={big} />;
}

/** Which play-in game it is, from its seeds: 7 v 8, 9 v 10, then the game for the 8 seed. */
const playInOrder = (g: BGame) => {
  const seeds = new Set([g.home.seed, g.away.seed]);
  return seeds.has(7) && seeds.has(8) ? 0 : seeds.has(9) && seeds.has(10) ? 1 : 2;
};
const PLAYIN_LABEL = ["7 v 8", "9 v 10", "For the 8 seed"];

function PlayIn({ conf, projected }: { conf: PlayoffConference; projected: boolean }) {
  return (
    <div>
      <h3 className="title-caps mb-3 text-center text-sm">{conf.name}</h3>
      {conf.playin.length === 0 ? (
        <p className="text-center text-sm text-ink-2">Not set yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[...conf.playin]
            .sort((a, b) => playInOrder(a) - playInOrder(b))
            .map((g, i) => (
              <PlayInGame key={g.game_id ?? i} g={g} label={PLAYIN_LABEL[playInOrder(g)]} projected={projected} />
            ))}
        </div>
      )}
    </div>
  );
}

function PlayInGame({ g, label, projected }: { g: BGame; label: string; projected: boolean }) {
  const winner = gameWinner(g);
  // higher seed first, like the bracket
  const sides = (["home", "away"] as const).slice().sort((a, b) => (g[a].seed ?? 99) - (g[b].seed ?? 99));
  const row = (k: "home" | "away") => (
    <MatchRow key={k} abbr={g[k].abbr} seed={g[k].seed} value={g[k].score} won={winner === k} lost={!!winner && winner !== k} />
  );
  return (
    <MatchCard
      rows={[row(sides[0]), row(sides[1])]}
      foot={`${label}${g.date && !projected ? ` · ${shortDate(g.date)}` : ""}`}
      href={winner && g.game_id ? `/games/${g.game_id}` : null}
      label={`${g.away.abbr} at ${g.home.abbr}: box score`}
    />
  );
}
