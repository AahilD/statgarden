import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoxScore } from "@/components/pages/BoxScore";
import { Dot, Heading, TitleCard } from "@/components/pages/Parts";
import {
  apiGet,
  easternTime,
  num1,
  pct,
  shortDate,
  type GamePage,
  type GameTeam,
} from "@/lib/pages";

async function load(id: string) {
  "use cache";
  cacheLife("hours");
  if (!/^\d{10}$/.test(id)) return null;
  return apiGet<GamePage>(`/game/${id}`);
}

export async function generateMetadata({ params }: PageProps<"/games/[id]">): Promise<Metadata> {
  const d = await load((await params).id);
  if (!d) return { title: "Game not found" };
  const { away, home, game } = d;
  return {
    title: `${away.abbr} ${away.pts}, ${home.abbr} ${home.pts} · ${shortDate(game.date, true)}`,
    description: `Box score: ${away.name ?? away.abbr} at ${home.name ?? home.abbr}, ${shortDate(game.date, true)}.`,
  };
}

export default function GameRoute({ params }: PageProps<"/games/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-12 h-64 max-w-[1100px] animate-pulse rounded-[14px] bg-surface" />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: PageProps<"/games/[id]">["params"] }) {
  const d = await load((await params).id);
  if (!d) notFound();
  const { game: g, away, home } = d;
  const time = easternTime(g.tipoff);
  const place = [g.arena, g.city].filter(Boolean).join(", ");
  // "Neutral Site" is what the summary puts in the series text for those games
  const series = g.series && g.series !== "Neutral Site" ? g.series : null;
  const ots = Math.max(away.periods.length, home.periods.length) - 4;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <TitleCard
        title={`${away.abbr} at ${home.abbr}`}
        eyebrow={
          <>
            <span>{g.label ?? g.season_type}</span>
            {g.sub_label && <><Dot /><span>{g.sub_label}</span></>}
            <Dot />
            <span>{shortDate(g.date, true)}</span>
          </>
        }
        sub={
          <>
            {place && <span>{place}</span>}
            {time && <><Dot /><span>{time}</span></>}
            {g.attendance ? <><Dot /><span>{g.attendance.toLocaleString("en-US")}{g.sellout ? " (sold out)" : ""}</span></> : null}
            {g.duration && <><Dot /><span>{g.duration} long</span></>}
          </>
        }
      >
        <div className="mx-auto mt-7 grid max-w-[560px] grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <Side t={away} />
          <div className="label-mono">
            Final{ots > 0 ? (ots === 1 ? " / OT" : ` / ${ots}OT`) : ""}
          </div>
          <Side t={home} />
        </div>
        {series && <div className="label-mono mt-5">{series}</div>}
      </TitleCard>

      <section className="mt-6">
        <LineScore away={away} home={home} />
      </section>

      <section className="mt-12">
        <Heading>Team stats</Heading>
        <Compare away={away} home={home} />
      </section>

      {[away, home].map((t) => (
        <section key={t.team_id} className="mt-12">
          <Heading>{t.name ?? t.abbr}</Heading>
          <BoxScore team={t} />
        </section>
      ))}

      {g.officials.length > 0 && (
        <p className="mt-10 text-center font-mono text-[11px] text-ink-2">Officials: {g.officials.join(", ")}</p>
      )}
    </div>
  );
}

/** One team in the scoreboard: name over the score; the loser's score is dimmed. */
function Side({ t }: { t: GameTeam }) {
  return (
    <div className="min-w-0">
      <Link href={`/teams/${t.abbr}`} className="block text-balance text-sm leading-snug text-ink-2 hover:text-ink hover:underline">
        {t.name ?? t.abbr}
      </Link>
      <div
        className={`mt-1 font-mono text-[clamp(2.2rem,9vw,3.4rem)] leading-none tabular-nums ${t.is_win ? "text-ink" : "text-ink-2"}`}
      >
        {t.pts}
      </div>
      {t.is_win && <span className="mt-2 inline-block rounded-full bg-orange px-2 font-mono text-[10px] uppercase leading-[18px] text-on-orange">Win</span>}
    </div>
  );
}

function LineScore({ away, home }: { away: GameTeam; home: GameTeam }) {
  const n = Math.max(away.periods.length, home.periods.length);
  if (!n) return null;
  const label = (i: number) => (i < 4 ? String(i + 1) : n - 4 === 1 ? "OT" : `OT${i - 3}`);
  return (
    <div className="mx-auto max-w-[560px] overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full border-collapse font-mono text-[13px] tabular-nums">
        <caption className="sr-only">Points by quarter</caption>
        <thead>
          <tr className="border-b border-line-strong text-[11px] uppercase tracking-wide text-ink-2">
            <th scope="col" className="px-3 py-2 text-left font-normal">Team</th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i} scope="col" className="px-2 py-2 text-right font-normal">{label(i)}</th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-normal">T</th>
          </tr>
        </thead>
        <tbody>
          {[away, home].map((t) => (
            <tr key={t.team_id} className="border-b border-line last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <Link href={`/teams/${t.abbr}`} className="hover:underline">{t.abbr}</Link>
              </th>
              {Array.from({ length: n }, (_, i) => (
                <td key={i} className="px-2 py-2 text-right text-ink-2">{t.periods[i]?.pts ?? "—"}</td>
              ))}
              <td className={`px-3 py-2 text-right ${t.is_win ? "font-medium text-ink" : "text-ink-2"}`}>{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const made = (m: number, a: number) => `${m}-${a}`;
const ratio = (m: number, a: number) => (a ? m / a : null);

/** Away on the left, home on the right, the label between; the better side of each row in full ink. */
function Compare({ away, home }: { away: GameTeam; home: GameTeam }) {
  const rows: { label: string; a: string; h: string; av: number | null; hv: number | null; lowWins?: boolean }[] = [
    { label: "Field goals", a: `${made(away.fgm, away.fga)} · ${pct(ratio(away.fgm, away.fga))}`, h: `${made(home.fgm, home.fga)} · ${pct(ratio(home.fgm, home.fga))}`, av: ratio(away.fgm, away.fga), hv: ratio(home.fgm, home.fga) },
    { label: "Threes", a: `${made(away.fg3m, away.fg3a)} · ${pct(ratio(away.fg3m, away.fg3a))}`, h: `${made(home.fg3m, home.fg3a)} · ${pct(ratio(home.fg3m, home.fg3a))}`, av: ratio(away.fg3m, away.fg3a), hv: ratio(home.fg3m, home.fg3a) },
    { label: "Free throws", a: `${made(away.ftm, away.fta)} · ${pct(ratio(away.ftm, away.fta))}`, h: `${made(home.ftm, home.fta)} · ${pct(ratio(home.ftm, home.fta))}`, av: ratio(away.ftm, away.fta), hv: ratio(home.ftm, home.fta) },
    { label: "True shooting", a: pct(away.ts_pct), h: pct(home.ts_pct), av: away.ts_pct, hv: home.ts_pct },
    { label: "Rebounds", a: `${away.reb} (${away.oreb} off)`, h: `${home.reb} (${home.oreb} off)`, av: away.reb, hv: home.reb },
    { label: "Assists", a: String(away.ast), h: String(home.ast), av: away.ast, hv: home.ast },
    { label: "Turnovers", a: String(away.tov), h: String(home.tov), av: away.tov, hv: home.tov, lowWins: true },
    { label: "Steals", a: String(away.stl), h: String(home.stl), av: away.stl, hv: home.stl },
    { label: "Blocks", a: String(away.blk), h: String(home.blk), av: away.blk, hv: home.blk },
    { label: "Points in the paint", a: String(away.pts_paint ?? "—"), h: String(home.pts_paint ?? "—"), av: away.pts_paint, hv: home.pts_paint },
    { label: "Fast-break points", a: String(away.pts_fast_break ?? "—"), h: String(home.pts_fast_break ?? "—"), av: away.pts_fast_break, hv: home.pts_fast_break },
    { label: "Second-chance points", a: String(away.pts_2nd_chance ?? "—"), h: String(home.pts_2nd_chance ?? "—"), av: away.pts_2nd_chance, hv: home.pts_2nd_chance },
    { label: "Points off turnovers", a: String(away.pts_off_tov ?? "—"), h: String(home.pts_off_tov ?? "—"), av: away.pts_off_tov, hv: home.pts_off_tov },
    { label: "Points per 100", a: num1(away.off_rtg), h: num1(home.off_rtg), av: away.off_rtg, hv: home.off_rtg },
    { label: "Fouls", a: String(away.pf), h: String(home.pf), av: away.pf, hv: home.pf, lowWins: true },
  ];
  const better = (x: number | null, y: number | null, low?: boolean) => x != null && y != null && (low ? x < y : x > y);
  return (
    <div className="mx-auto max-w-[640px] rounded-card border border-line bg-surface">
      <div className="grid grid-cols-[1fr_auto_1fr] border-b border-line-strong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-ink-2">
        <span>{away.abbr}</span>
        <span />
        <span className="text-right">{home.abbr}</span>
      </div>
      <dl>
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line px-4 py-2 text-[13px] last:border-0">
            <dd className={`font-mono tabular-nums ${better(r.av, r.hv, r.lowWins) ? "font-medium text-ink" : "text-ink-2"}`}>{r.a}</dd>
            <dt className="text-center text-xs text-ink-2">{r.label}</dt>
            <dd className={`text-right font-mono tabular-nums ${better(r.hv, r.av, r.lowWins) ? "font-medium text-ink" : "text-ink-2"}`}>{r.h}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-2 text-center font-mono text-[11px] text-ink-2">
        Pace {num1(away.pace)} possessions per 48 minutes
      </p>
    </div>
  );
}
