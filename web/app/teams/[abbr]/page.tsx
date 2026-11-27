import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dot, Heading, LabLinks, StatTable, Tile, TitleCard, type Column } from "@/components/pages/Parts";
import { teamLinks } from "@/lib/labLinks";
import { apiGet, num1, ordinal, pct, perGame, shortDate, signed, TYPE_SHORT, type TeamPage } from "@/lib/pages";

async function load(abbr: string) {
  "use cache";
  cacheLife("hours");
  if (!/^[A-Za-z]{2,4}$/.test(abbr)) return null;
  return apiGet<TeamPage>(`/team/${abbr.toUpperCase()}`);
}

export async function generateMetadata({ params }: PageProps<"/teams/[abbr]">): Promise<Metadata> {
  const d = await load((await params).abbr);
  if (!d) return { title: "Team not found" };
  return { title: d.team.name, description: `${d.team.name}: record, roster, recent games and season history.` };
}

export default function TeamRoute({ params }: PageProps<"/teams/[abbr]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-12 h-56 max-w-[1100px] animate-pulse rounded-[14px] bg-surface" />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/teams/[abbr]">["params"] }) {
  const d = await load((await params).abbr);
  if (!d) notFound();
  const t = d.team;
  const st = d.standing;
  const now = d.seasons.find((s) => s.season === t.season && s.season_type === "Regular Season");
  const current = d.roster.filter((r) => r.still_here);
  const gone = d.roster.filter((r) => !r.still_here);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <TitleCard
        title={t.name}
        eyebrow={
          <>
            {t.division && <span>{t.division}</span>}
            {t.division && <Dot />}
            {t.conference && <span>{t.conference}ern Conference</span>}
          </>
        }
        sub={
          st ? (
            <>
              <span className="text-ink">
                {ordinal(Number(st.playoff_rank))} in the {st.conference}
              </span>
              <Dot />
              <span>Last 10: {st.l10}</span>
              <Dot />
              <span>Streak: {st.streak.trim()}</span>
              <Dot />
              <span>Home {st.home}</span>
              <Dot />
              <span>Road {st.road}</span>
            </>
          ) : undefined
        }
      >
        {now && (
          <div className="mt-6 font-mono text-[clamp(1.6rem,6vw,2.4rem)] leading-none tracking-wide text-ink">
            {now.wins}<span className="px-1 text-ink-2">–</span>{now.losses}
            <div className="label-mono mt-2">{t.season} record</div>
          </div>
        )}
      </TitleCard>

      {now && (
        <section className="mt-6">
          <div className="label-mono mb-2 text-center">{t.season} regular season · per 100 possessions</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile tone="orange" label="Offence" value={num1(now.off_rtg)} note="Scored per 100" />
            <Tile tone="blue" label="Defence" value={num1(now.def_rtg)} note="Allowed per 100" />
            <Tile tone="green" label="Net rating" value={signed(now.net_rtg)} note={`${num1(now.pts)} − ${num1(now.opp_pts)}`} />
            <Tile tone="red" label="Pace" value={num1(now.pace)} note="Per 48 minutes" />
          </div>
        </section>
      )}

      <section className="mt-12">
        <Heading>{t.season} roster</Heading>
        <StatTable caption={`${t.name} roster, per game`} columns={ROSTER_COLUMNS} rows={current} rowKey={(r) => String(r.player_id)} />
        {gone.length > 0 && (
          <>
            <p className="label-mono mb-2 mt-6">Played for {t.abbr} this season, now elsewhere</p>
            <StatTable caption="Former players this season" columns={ROSTER_COLUMNS} rows={gone} rowKey={(r) => String(r.player_id)} rowClass={() => "text-ink-2"} />
          </>
        )}
        <p className="mt-2 font-mono text-[11px] text-ink-2">Regular season, per game, most minutes first.</p>
      </section>

      <section className="mt-12">
        <Heading>Recent games</Heading>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {d.games.map((g) => (
            <li key={g.game_id} className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-chip font-mono text-xs text-on-color ${g.is_win ? "bg-green" : "bg-red"}`}>
                {g.is_win ? "W" : "L"}
              </span>
              <span className="min-w-0">
                <span className="text-ink-2">{g.is_home ? "vs " : "@ "}</span>
                <Link href={`/teams/${g.opp}`} className="font-medium hover:underline">
                  {g.opp}
                </Link>
                <span className="block font-mono text-[11px] text-ink-2">
                  {shortDate(g.game_date)}
                  {g.season_type !== "Regular Season" && ` · ${TYPE_SHORT[g.season_type]}`}
                </span>
              </span>
              <span className="ml-auto font-mono tabular-nums">
                {g.pts}–{g.opp_pts}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <Heading>Season by season</Heading>
        <StatTable
          caption={`${t.name} season by season`}
          columns={SEASON_COLUMNS}
          rows={d.seasons}
          rowKey={(r) => `${r.season}-${r.season_type}`}
          rowClass={(r) => (r.season_type === "Regular Season" ? "" : "text-ink-2")}
        />
        <p className="mt-2 font-mono text-[11px] text-ink-2">Ratings are per 100 possessions, from season totals.</p>
      </section>

      <section className="mt-12">
        <Heading>Dig deeper in the Lab</Heading>
        <LabLinks links={teamLinks(t.abbr, t.season)} />
      </section>
    </div>
  );
}

type RosterRow = TeamPage["roster"][number];

const ROSTER_COLUMNS: Column<RosterRow>[] = [
  {
    key: "player",
    label: "Player",
    text: true,
    sticky: true,
    strong: true,
    cell: (r) => (
      <Link href={`/players/${r.player_id}`} className="hover:underline">
        {r.player}
      </Link>
    ),
  },
  { key: "pos", label: "Pos", text: true, cell: (r) => r.position ?? "" },
  { key: "age", label: "Age", cell: (r) => (r.age == null ? "" : Math.floor(r.age)) },
  { key: "gp", label: "GP", title: "Games played", cell: (r) => r.gp },
  { key: "min", label: "MIN", title: "Minutes", cell: (r) => perGame(r.min, r.gp) },
  { key: "pts", label: "PTS", title: "Points", strong: true, cell: (r) => perGame(r.pts, r.gp) },
  { key: "reb", label: "REB", title: "Rebounds", cell: (r) => perGame(r.reb, r.gp) },
  { key: "ast", label: "AST", title: "Assists", cell: (r) => perGame(r.ast, r.gp) },
  { key: "stl", label: "STL", title: "Steals", cell: (r) => perGame(r.stl, r.gp) },
  { key: "blk", label: "BLK", title: "Blocks", cell: (r) => perGame(r.blk, r.gp) },
  { key: "fg3", label: "3P%", title: "Three-point %", cell: (r) => pct(r.fg3_pct) },
  { key: "ts", label: "TS%", title: "True shooting %", cell: (r) => pct(r.ts_pct) },
  { key: "pm", label: "+/−", title: "Plus-minus per game", cell: (r) => signed(r.gp ? r.plus_minus / r.gp : null) },
];

type SeasonRow = TeamPage["seasons"][number];

const SEASON_COLUMNS: Column<SeasonRow>[] = [
  { key: "season", label: "Season", text: true, sticky: true, strong: true, cell: (r) => r.season },
  { key: "type", label: "Type", text: true, cell: (r) => TYPE_SHORT[r.season_type] },
  { key: "wl", label: "W–L", title: "Wins and losses", cell: (r) => `${r.wins}–${r.losses}` },
  { key: "pts", label: "PTS", title: "Points per game", cell: (r) => num1(r.pts) },
  { key: "opp", label: "OPP", title: "Opponent points per game", cell: (r) => num1(r.opp_pts) },
  { key: "ortg", label: "ORTG", title: "Points scored per 100 possessions", cell: (r) => num1(r.off_rtg) },
  { key: "drtg", label: "DRTG", title: "Points allowed per 100 possessions", cell: (r) => num1(r.def_rtg) },
  { key: "net", label: "NET", title: "Net rating", strong: true, cell: (r) => signed(r.net_rtg) },
  { key: "pace", label: "PACE", title: "Possessions per 48 minutes", cell: (r) => num1(r.pace) },
  { key: "ts", label: "TS%", title: "True shooting %", cell: (r) => pct(r.ts_pct) },
  { key: "3par", label: "3PAr", title: "Share of shots that were threes", cell: (r) => pct(r.fg3a_rate) },
];
