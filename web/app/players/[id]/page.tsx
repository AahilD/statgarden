import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShotMap } from "@/components/chart/ShotMap";
import { Dot, Heading, Tile, TileRow, TitleCard } from "@/components/pages/Parts";
import { PlayerGames, PlayerSeasons } from "@/components/pages/PlayerTables";
import { SectionNav } from "@/components/pages/SectionNav";
import type { CourtResult } from "@/lib/court";
import { apiGet, height, ordinal, perGame, shortDate, type PlayerPage } from "@/lib/pages";

/** One player's page data, kept for an hour (the nightly run is the only thing that changes it). */
async function load(id: string) {
  "use cache";
  cacheLife("hours");
  if (!/^\d+$/.test(id)) return null;
  return apiGet<PlayerPage>(`/player/${id}`);
}

/** One season of shots on the court (regular season only, so the league comparison is like for like). */
async function loadShots(id: number, season: string) {
  "use cache";
  cacheLife("hours");
  return apiGet<CourtResult>(`/player/${id}/shots?season=${encodeURIComponent(season)}`);
}

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const d = await load((await params).id);
  if (!d) return { title: "Player not found" };
  const p = d.player;
  return {
    title: p.player_name,
    description: `${p.player_name}: season by season, shot map, career highs and game log.`,
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
  const regular = d.seasons.find((x) => x.season_type === "Regular Season");
  const shots = regular ? await loadShots(p.id, regular.season) : null;
  const shotCourt = shots?.courts[0];

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
          </>
        }
      >
        <div className="mt-5">
          <span className="label-mono inline-block rounded-full border border-line-strong px-3 py-1">{draftLine(p)}</span>
        </div>
      </TitleCard>

      {latest && (
        <section className="mt-6">
          <div className="label-mono mb-2 text-center">
            {latest.season} {latest.season_type.toLowerCase()} · {latest.gp} games · per game
          </div>
          <TileRow>
            {TILES.map(([k, label, short, tone]) => (
              <Tile
                key={k}
                compact
                tone={tone}
                label={label}
                short={short}
                value={perGame(latest[k], latest.gp)}
                note={careerReg && `Career ${perGame(careerReg[k], careerReg.gp)}`}
              />
            ))}
          </TileRow>
        </section>
      )}

      <SectionNav
        links={[
          { id: "seasons", label: "Season by season", short: "Seasons" },
          ...(shots && shotCourt && regular ? [{ id: "shots", label: "Shot map", short: "Shots" }] : []),
          { id: "highs", label: "Career highs", short: "Highs" },
          { id: "games", label: "Game log" },
        ]}
      />

      <section className="mt-8">
        <Heading id="seasons">Season by season</Heading>
        <PlayerSeasons name={p.player_name} seasons={d.seasons} career={d.career} />
      </section>

      {shots && shotCourt && regular && (
        <section className="mt-12">
          <Heading id="shots">Shot map</Heading>
          <ShotMap shots={shots} label={`${p.player_name}, ${regular.season}`} caption={`${regular.season} regular season`} />
        </section>
      )}

      <section className="mt-12">
        <Heading id="highs">Career highs</Heading>
        <TileRow>
          {HIGHS.map(([k, label, short, tone]) => {
            const h = d.highs[k];
            const tile = (
              <Tile
                compact
                tone={tone}
                label={label}
                short={short}
                value={h ? String(h.value) : "—"}
                note={
                  h && (
                    // two short lines, so the date isn't cut off on phones
                    <>
                      <span className="block truncate">{shortDate(h.game_date, true)}</span>
                      <span className="block truncate">{`${h.is_home ? "vs" : "@"} ${h.opp}${h.season_type === "Playoffs" ? " · Playoffs" : ""}`}</span>
                    </>
                  )
                }
              />
            );
            // each high opens the game it came from
            return h ? (
              <Link key={k} href={`/games/${h.game_id}`} className="lift block" aria-label={`${label} high: ${h.value}, box score`}>
                {tile}
              </Link>
            ) : (
              <div key={k}>{tile}</div>
            );
          })}
        </TileRow>
      </section>

      <section className="mt-12">
        <Heading id="games">Game log</Heading>
        <PlayerGames name={p.player_name} games={d.games} />
      </section>
    </div>
  );
}

type Tone = "orange" | "blue" | "green" | "red";
type StatKey = "pts" | "reb" | "ast" | "stl" | "blk";

const TILES: [StatKey, string, string, Tone][] = [
  ["pts", "Points", "PTS", "orange"],
  ["reb", "Rebounds", "REB", "blue"],
  ["ast", "Assists", "AST", "green"],
  ["stl", "Steals", "STL", "red"],
  ["blk", "Blocks", "BLK", "orange"],
];

const HIGHS: [StatKey | "fg3m", string, string, Tone][] = [
  ["pts", "Points", "PTS", "orange"],
  ["reb", "Rebounds", "REB", "blue"],
  ["ast", "Assists", "AST", "green"],
  ["stl", "Steals", "STL", "red"],
  ["blk", "Blocks", "BLK", "orange"],
  ["fg3m", "Threes made", "3PM", "blue"],
];

/** "2014 draft · 41st pick", "Undrafted · 2014" or "Undrafted". */
function draftLine(p: PlayerPage["player"]) {
  if (p.draft_year && p.draft_number) return `${p.draft_year} draft · ${ordinal(p.draft_number)} pick`;
  return p.draft_year ? `Undrafted · ${p.draft_year}` : "Undrafted";
}

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
