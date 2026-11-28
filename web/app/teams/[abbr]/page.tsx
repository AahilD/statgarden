import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dot, Heading, Tile, TitleCard } from "@/components/pages/Parts";
import { TEAM_COLORS } from "@/lib/teamColors";
import { RecentGames, Roster, TeamSeasons } from "@/components/pages/TeamTables";
import { apiGet, num1, ordinal, signed, type TeamPage } from "@/lib/pages";

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
        colors={TEAM_COLORS[t.abbr]}
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
              <Link href="/teams" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-orange">
                {ordinal(Number(st.playoff_rank))} in the {st.conference}
              </Link>
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
            <Tile tone="orange" label="Offence" value={num1(now.off_rtg)} />
            <Tile tone="blue" label="Defence" value={num1(now.def_rtg)} />
            <Tile tone="green" label="Net rating" value={signed(now.net_rtg)} note={`${num1(now.pts)} − ${num1(now.opp_pts)}`} />
            <Tile tone="red" label="Pace" value={num1(now.pace)} />
          </div>
        </section>
      )}

      <section className="mt-12">
        <Heading>{t.season} roster</Heading>
        <Roster team={t.name} abbr={t.abbr} current={current} gone={gone} />
      </section>

      <section className="mt-12">
        <Heading>Recent games</Heading>
        <RecentGames games={d.games} />
      </section>

      <section className="mt-12">
        <Heading>Season by season</Heading>
        <TeamSeasons team={t.name} seasons={d.seasons} />
      </section>
    </div>
  );
}
