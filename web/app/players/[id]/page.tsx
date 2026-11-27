import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dot, Heading, LabLinks, StatTable, Tile, TitleCard, type Column } from "@/components/pages/Parts";
import { playerLinks } from "@/lib/labLinks";
import {
  apiGet,
  height,
  pct,
  perGame,
  shortDate,
  signed,
  TYPE_SHORT,
  type GameLine,
  type PlayerPage,
} from "@/lib/pages";

/** One player's page data, kept for an hour (the nightly run is the only thing that changes it). */
async function load(id: string) {
  "use cache";
  cacheLife("hours");
  if (!/^\d+$/.test(id)) return null;
  return apiGet<PlayerPage>(`/player/${id}`);
}

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const d = await load((await params).id);
  if (!d) return { title: "Player not found" };
  const p = d.player;
  return {
    title: p.player_name,
    description: `${p.player_name}: season by season, recent games and career highs.`,
  };
}

export default function PlayerRoute({ params }: PageProps<"/players/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: { params: PageProps<"/players/[id]">["params"] }) {
  const d = await load((await params).id);
  if (!d) notFound();
  const p = d.player;
  const latest = d.seasons.find((s) => s.season_type === "Regular Season") ?? d.seasons[0];
  const careerReg = d.career.find((c) => c.season_type === "Regular Season");
  const ht = height(p.height_in);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <TitleCard
        title={p.player_name}
        eyebrow={
          <>
            {p.position && <span>{p.position}</span>}
            {p.position && <Dot />}
            <Link href={`/teams/${p.team}`} className="text-ink underline decoration-orange decoration-2 underline-offset-4">
              {p.team_name ?? p.team}
            </Link>
          </>
        }
        sub={
          <>
            {p.age != null && <span>Age {Math.floor(p.age)}</span>}
            {ht && <><Dot /><span>{ht}</span></>}
            {p.weight_lb != null && <><Dot /><span>{p.weight_lb} lb</span></>}
            {p.country && <><Dot /><span>{p.country}</span></>}
            {p.college && <><Dot /><span>{p.college}</span></>}
            <Dot />
            <span>
              {p.draft_year && p.draft_number
                ? `Drafted ${p.draft_year}, round ${p.draft_round}, pick ${p.draft_number}`
                : p.draft_year
                  ? `Undrafted (${p.draft_year})`
                  : "Undrafted"}
            </span>
          </>
        }
      />

      {latest && (
        <section className="mt-6">
          <div className="label-mono mb-2 text-center">
            {latest.season} {latest.season_type.toLowerCase()} · {latest.gp} games · per game
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile tone="orange" label="Points" value={perGame(latest.pts, latest.gp)} note={careerReg && `Career ${perGame(careerReg.pts, careerReg.gp)}`} />
            <Tile tone="blue" label="Rebounds" value={perGame(latest.reb, latest.gp)} note={careerReg && `Career ${perGame(careerReg.reb, careerReg.gp)}`} />
            <Tile tone="green" label="Assists" value={perGame(latest.ast, latest.gp)} note={careerReg && `Career ${perGame(careerReg.ast, careerReg.gp)}`} />
            <Tile tone="red" label="True shooting" value={pct(latest.ts_pct)} note={careerReg && `Career ${pct(careerReg.ts_pct)}`} />
          </div>
        </section>
      )}

      <section className="mt-12">
        <Heading>Season by season</Heading>
        <StatTable
          caption={`${p.player_name} season by season, per game`}
          columns={SEASON_COLUMNS}
          rows={d.seasons}
          rowKey={(r) => `${r.season}-${r.season_type}`}
          rowClass={(r) => (r.season_type === "Regular Season" ? "" : "text-ink-2")}
          foot={d.career.map((c) => ({ ...c, season: "Career", teams: "" }))}
        />
        <p className="mt-2 font-mono text-[11px] text-ink-2">
          Per game. Career rows add up every season loaded so far ({p.first_season} on).
        </p>
      </section>

      <section className="mt-12">
        <Heading>Career highs</Heading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              ["pts", "Points", "orange"],
              ["reb", "Rebounds", "blue"],
              ["ast", "Assists", "green"],
              ["fg3m", "Threes made", "red"],
            ] as const
          ).map(([k, label, tone]) => {
            const h = d.highs[k];
            return (
              <Tile
                key={k}
                tone={tone}
                label={label}
                value={h ? String(h.value) : "—"}
                note={h && `${shortDate(h.game_date, true)} ${h.is_home ? "vs" : "@"} ${h.opp}${h.season_type === "Playoffs" ? " · playoffs" : ""}`}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <Heading>Last {d.games.length} games</Heading>
        <StatTable caption={`${p.player_name}'s last games`} columns={GAME_COLUMNS} rows={d.games} rowKey={(g) => g.game_id} />
      </section>

      <section className="mt-12">
        <Heading>Dig deeper in the Lab</Heading>
        <LabLinks links={playerLinks(p.player_name, latest?.season ?? p.last_season)} />
      </section>
    </div>
  );
}

type SeasonRow = PlayerPage["seasons"][number];

const SEASON_COLUMNS: Column<SeasonRow>[] = [
  { key: "season", label: "Season", text: true, sticky: true, strong: true, cell: (r) => r.season },
  { key: "type", label: "Type", text: true, cell: (r) => TYPE_SHORT[r.season_type] },
  {
    key: "team",
    label: "Team",
    text: true,
    cell: (r) =>
      r.teams.split(" / ").filter(Boolean).map((t, i) => (
        <span key={t}>
          {i > 0 && " / "}
          <Link href={`/teams/${t}`} className="hover:underline">
            {t}
          </Link>
        </span>
      )),
  },
  { key: "gp", label: "GP", title: "Games played", cell: (r) => r.gp },
  { key: "min", label: "MIN", title: "Minutes", cell: (r) => perGame(r.min, r.gp) },
  { key: "pts", label: "PTS", title: "Points", strong: true, cell: (r) => perGame(r.pts, r.gp) },
  { key: "reb", label: "REB", title: "Rebounds", cell: (r) => perGame(r.reb, r.gp) },
  { key: "ast", label: "AST", title: "Assists", cell: (r) => perGame(r.ast, r.gp) },
  { key: "stl", label: "STL", title: "Steals", cell: (r) => perGame(r.stl, r.gp) },
  { key: "blk", label: "BLK", title: "Blocks", cell: (r) => perGame(r.blk, r.gp) },
  { key: "tov", label: "TOV", title: "Turnovers", cell: (r) => perGame(r.tov, r.gp) },
  { key: "fg", label: "FG%", title: "Field goal %", cell: (r) => pct(r.fg_pct) },
  { key: "fg3", label: "3P%", title: "Three-point %", cell: (r) => pct(r.fg3_pct) },
  { key: "ft", label: "FT%", title: "Free throw %", cell: (r) => pct(r.ft_pct) },
  { key: "ts", label: "TS%", title: "True shooting %", cell: (r) => pct(r.ts_pct) },
  { key: "pm", label: "+/−", title: "Plus-minus per game", cell: (r) => signed(r.gp ? r.plus_minus / r.gp : null) },
];

const made = (m: number, a: number) => `${m}-${a}`;

const GAME_COLUMNS: Column<GameLine>[] = [
  {
    key: "date",
    label: "Date",
    text: true,
    sticky: true,
    cell: (g) => (
      <Link href={`/games/${g.game_id}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-orange">
        {shortDate(g.game_date)}
      </Link>
    ),
  },
  {
    key: "opp",
    label: "Opp",
    text: true,
    cell: (g) => (
      <>
        <span className="text-ink-2">{g.is_home ? "vs " : "@ "}</span>
        <Link href={`/teams/${g.opp}`} className="hover:underline">
          {g.opp}
        </Link>
        {g.season_type !== "Regular Season" && <span className="ml-1.5 font-mono text-[10px] uppercase text-ink-2">{TYPE_SHORT[g.season_type]}</span>}
      </>
    ),
  },
  {
    key: "res",
    label: "Result",
    text: true,
    cell: (g) => (
      // solid chips: forest green as text is too dark to read on the dark theme
      <span className="inline-flex items-center gap-1.5">
        <span className={`rounded-[4px] px-1.5 font-mono text-[11px] leading-[18px] text-on-color ${g.is_win ? "bg-green" : "bg-red"}`}>
          {g.is_win ? "W" : "L"}
        </span>
        <span className="font-mono text-ink-2">{signed(g.margin, 0)}</span>
      </span>
    ),
  },
  { key: "min", label: "MIN", cell: (g) => g.min },
  { key: "pts", label: "PTS", strong: true, cell: (g) => g.pts },
  { key: "reb", label: "REB", cell: (g) => g.reb },
  { key: "ast", label: "AST", cell: (g) => g.ast },
  { key: "stl", label: "STL", cell: (g) => g.stl },
  { key: "blk", label: "BLK", cell: (g) => g.blk },
  { key: "tov", label: "TOV", cell: (g) => g.tov },
  { key: "fg", label: "FG", title: "Field goals made-attempted", cell: (g) => made(g.fgm, g.fga) },
  { key: "fg3", label: "3P", title: "Threes made-attempted", cell: (g) => made(g.fg3m, g.fg3a) },
  { key: "ft", label: "FT", title: "Free throws made-attempted", cell: (g) => made(g.ftm, g.fta) },
  { key: "pm", label: "+/−", title: "Plus-minus", cell: (g) => signed(g.plus_minus, 0) },
];

function Skeleton() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <div className="h-56 animate-pulse rounded-[14px] bg-surface" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    </div>
  );
}
