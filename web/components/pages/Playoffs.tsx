"use client";

// The playoff bracket on the teams page: West on the left, East on the right, the Finals in the
// middle (stacked on smaller screens), with each conference's play-in underneath. Before the
// playoffs start it's the bracket if the season ended today, from NBA.com's seeding.
import { BracketLines, BracketPanel, Slot } from "@/components/pages/Bracket";
import { gameWinner, MatchCard, MatchRow } from "@/components/pages/Matchup";
import { Heading } from "@/components/pages/Parts";
import { seriesLine, type BGame, type BTeam, type PlayoffConference, type PlayoffData, type Series, type SeriesTeam } from "@/lib/brackets";
import { shortDate } from "@/lib/pages";

const ROUND_LABEL = ["First round", "Semifinals", "Conf. finals"];

export function PlayoffsView({ data }: { data: PlayoffData }) {
  const west = data.conferences.find((c) => c.name === "West");
  const east = data.conferences.find((c) => c.name === "East");
  return (
    <div className="grid grid-cols-1 gap-12">
      <section>
        <Heading>Bracket</Heading>

        {/* wide screens: the classic bracket, conferences facing each other */}
        <BracketPanel className="hidden lg:block">
          <div className="mb-1 grid grid-cols-[minmax(0,3fr)_minmax(0,1.15fr)_minmax(0,3fr)] gap-5 text-center">
            <span className="title-caps text-sm">West</span>
            <span />
            <span className="title-caps text-sm">East</span>
          </div>
          <BracketLines>
            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.15fr)_repeat(3,minmax(0,1fr))] gap-5">
              {west && [0, 1, 2].map((r) => <RoundColumn key={`w${r}`} conf={west} round={r} projected={data.projected} />)}
              <FinalsColumn finals={data.finals} />
              {east && [2, 1, 0].map((r) => <RoundColumn key={`e${r}`} conf={east} round={r} projected={data.projected} />)}
            </div>
          </BracketLines>
        </BracketPanel>

        {/* phones and tablets: one conference at a time, then the Finals */}
        <BracketPanel className="grid grid-cols-1 gap-8 lg:hidden">
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
        </BracketPanel>
      </section>

      <section>
        <Heading>Play-In</Heading>
        <BracketPanel className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {[west, east].map((c) => c && <PlayIn key={c.name} conf={c} projected={data.projected} />)}
        </BracketPanel>
      </section>
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
          <Slot
            key={i}
            id={`${conf.name}-${round}-${i}`}
            to={round < 2 ? `${conf.name}-${round + 1}-${Math.floor(i / 2)}` : "finals"}
            won={!!s?.winner}
          >
            <SeriesCard s={s} projected={projected} />
          </Slot>
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
        <Slot id="finals">
          <SeriesCard s={finals} big />
        </Slot>
        {finals?.winner && (
          <div className="mt-3 text-center">
            <span className="rounded-full bg-orange px-3 py-1 font-mono text-[11px] uppercase text-on-orange">
              {finals.winner} champions
            </span>
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
      <div
        className={`rounded-btn border border-dashed ${big ? "border-orange" : "border-line"} bg-surface px-3 py-3 text-center font-mono text-[11px] text-ink-2`}
      >
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

/** What each play-in game decides, in the card's footer. */
const PLAYIN_RULES: [string, string][] = [
  ["Winner: 7 seed", "Loser: vs 9/10 winner"],
  ["Winner: vs 7/8 loser", "Loser: out"],
  ["Winner: 8 seed", "Loser: out"],
];

const TBD: BTeam = {
  id: null,
  abbr: null,
  name: null,
  seed: null,
  score: null,
};
const sideOf = (g: BGame | undefined, which: "winner" | "loser"): BTeam => {
  const w = g && gameWinner(g);
  if (!g || !w) return TBD;
  const t = g[which === "winner" ? w : w === "home" ? "away" : "home"];
  return { ...t, score: null };
};

/** One conference's play-in, shaped like the Cup bracket: 7 v 8 over 9 v 10, and the game for
 * the 8 seed to the right. That last game fills in once the first two are played. */
function PlayIn({ conf, projected }: { conf: PlayoffConference; projected: boolean }) {
  const games: (BGame | undefined)[] = [0, 1, 2].map((o) => conf.playin.find((g) => playInOrder(g) === o));
  const last: BGame = games[2] ?? {
    game_id: null,
    date: null,
    status: 1,
    home: sideOf(games[0], "loser"),
    away: sideOf(games[1], "winner"),
  };
  return (
    <div>
      <h3 className="title-caps mb-3 text-center text-sm">{conf.name}</h3>
      {conf.playin.length === 0 ? (
        <p className="text-center text-sm text-ink-2">Not set yet.</p>
      ) : (
        <BracketLines>
          <div className="grid grid-cols-2 gap-4 sm:gap-5">
            <div className="grid grid-cols-1 gap-3">
              {[0, 1].map((o) => (
                <Slot key={o} id={`pi-${o}`} to="pi-2" won={!!(games[o] && gameWinner(games[o]!))}>
                  {games[o] ? <PlayInGame g={games[o]!} rules={PLAYIN_RULES[o]} projected={projected} /> : <SeriesCard s={null} />}
                </Slot>
              ))}
            </div>
            <div className="flex flex-col justify-center">
              <Slot id="pi-2">
                <PlayInGame g={last} rules={PLAYIN_RULES[2]} projected={projected} />
              </Slot>
            </div>
          </div>
        </BracketLines>
      )}
    </div>
  );
}

function PlayInGame({ g, rules, projected }: { g: BGame; rules: [string, string]; projected: boolean }) {
  const winner = gameWinner(g);
  // higher seed first, like the bracket
  const sides = (["home", "away"] as const).slice().sort((a, b) => (g[a].seed ?? 99) - (g[b].seed ?? 99));
  const row = (k: "home" | "away") => (
    <MatchRow key={k} abbr={g[k].abbr} seed={g[k].seed} value={g[k].score} won={winner === k} lost={!!winner && winner !== k} />
  );
  return (
    <MatchCard
      rows={[row(sides[0]), row(sides[1])]}
      foot={
        <div className="flex flex-col gap-x-2 sm:flex-row sm:items-start sm:justify-between">
          <span className="grid">
            <span>{rules[0]}</span>
            <span>{rules[1]}</span>
          </span>
          {g.date && !projected && <span className="shrink-0">{shortDate(g.date)}</span>}
        </div>
      }
      href={winner && g.game_id ? `/games/${g.game_id}` : null}
      label={`${g.away.abbr} at ${g.home.abbr}: box score`}
    />
  );
}
