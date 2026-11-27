"use client";

// The team page's tables and recent-games strip. Client components: they sort, switch season
// types and light up leaders.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { typesIn } from "@/components/pages/PlayerTables";
import { Pills, StatTable, type Column } from "@/components/pages/StatTable";
import { num1, pct, perGame, shortDate, signed, type SeasonType, type TeamPage } from "@/lib/pages";

type RosterRow = TeamPage["roster"][number];
type SeasonRow = TeamPage["seasons"][number];
type GameRow = TeamPage["games"][number];

const pg = (k: keyof RosterRow) => (r: RosterRow) => (r.gp ? (r[k] as number) / r.gp : null);
// to lead a rate you need a real sample: 5 games, and per game at least one three / three shots
const regular = (r: RosterRow) => r.gp >= 5;

const ROSTER_COLUMNS: Column<RosterRow>[] = [
  {
    key: "player",
    label: "Player",
    text: true,
    sticky: true,
    strong: true,
    sort: (r) => r.player,
    cell: (r) => (
      <Link href={`/players/${r.player_id}`} className="hover:underline">
        {r.player}
      </Link>
    ),
  },
  { key: "pos", label: "Pos", text: true, sort: (r) => r.position, cell: (r) => r.position ?? "" },
  { key: "age", label: "Age", sort: (r) => r.age, cell: (r) => (r.age == null ? "" : Math.floor(r.age)) },
  { key: "gp", label: "GP", title: "Games played", sort: (r) => r.gp, leader: "high", cell: (r) => r.gp },
  { key: "min", label: "MIN", title: "Minutes", sort: pg("min"), leader: "high", eligible: regular, cell: (r) => perGame(r.min, r.gp) },
  { key: "pts", label: "PTS", title: "Points", strong: true, sort: pg("pts"), leader: "high", eligible: regular, cell: (r) => perGame(r.pts, r.gp) },
  { key: "reb", label: "REB", title: "Rebounds", sort: pg("reb"), leader: "high", eligible: regular, cell: (r) => perGame(r.reb, r.gp) },
  { key: "ast", label: "AST", title: "Assists", sort: pg("ast"), leader: "high", eligible: regular, cell: (r) => perGame(r.ast, r.gp) },
  { key: "stl", label: "STL", title: "Steals", sort: pg("stl"), leader: "high", eligible: regular, cell: (r) => perGame(r.stl, r.gp) },
  { key: "blk", label: "BLK", title: "Blocks", sort: pg("blk"), leader: "high", eligible: regular, cell: (r) => perGame(r.blk, r.gp) },
  {
    key: "fg3",
    label: "3P%",
    title: "Three-point % (leader: at least one attempt a game)",
    sort: (r) => r.fg3_pct,
    leader: "high",
    eligible: (r) => regular(r) && r.fg3a >= r.gp,
    cell: (r) => pct(r.fg3_pct),
  },
  {
    key: "ts",
    label: "TS%",
    title: "True shooting % (leader: at least three shots a game)",
    sort: (r) => r.ts_pct,
    leader: "high",
    eligible: (r) => regular(r) && r.fga >= 3 * r.gp,
    cell: (r) => pct(r.ts_pct),
  },
  {
    key: "pm",
    label: "+/−",
    title: "Plus-minus per game",
    sort: (r) => (r.gp ? r.plus_minus / r.gp : null),
    leader: "high",
    eligible: regular,
    cell: (r) => signed(r.gp ? r.plus_minus / r.gp : null),
  },
];

export function Roster(p: { team: string; abbr: string; current: RosterRow[]; gone: RosterRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <StatTable
        caption={`${p.team} roster, per game`}
        columns={ROSTER_COLUMNS}
        rows={p.current}
        rowKey={(r) => String(r.player_id)}
        leaders
        note="Regular season, per game, most minutes first. Leaders need 5 games; 3P% and TS% need real volume."
      />
      {p.gone.length > 0 && (
        <div>
          <p className="label-mono mb-2">Played for {p.abbr} this season, now elsewhere</p>
          <StatTable
            caption="Former players this season"
            columns={ROSTER_COLUMNS}
            rows={p.gone}
            rowKey={(r) => String(r.player_id)}
            rowClass={() => "text-ink-2"}
          />
        </div>
      )}
    </div>
  );
}

const SEASON_COLUMNS: Column<SeasonRow>[] = [
  { key: "season", label: "Season", text: true, sticky: true, strong: true, sort: (r) => r.season, cell: (r) => r.season },
  { key: "wl", label: "W–L", title: "Wins and losses", sort: (r) => r.wins / Math.max(1, r.gp), cell: (r) => `${r.wins}–${r.losses}` },
  { key: "pts", label: "PTS", title: "Points per game", sort: (r) => r.pts, cell: (r) => num1(r.pts) },
  { key: "opp", label: "OPP", title: "Opponent points per game", sort: (r) => r.opp_pts, cell: (r) => num1(r.opp_pts) },
  { key: "ortg", label: "ORTG", title: "Points scored per 100 possessions", sort: (r) => r.off_rtg, cell: (r) => num1(r.off_rtg) },
  { key: "drtg", label: "DRTG", title: "Points allowed per 100 possessions", sort: (r) => r.def_rtg, cell: (r) => num1(r.def_rtg) },
  { key: "net", label: "NET", title: "Net rating", strong: true, sort: (r) => r.net_rtg, cell: (r) => signed(r.net_rtg) },
  { key: "pace", label: "PACE", title: "Possessions per 48 minutes", sort: (r) => r.pace, cell: (r) => num1(r.pace) },
  { key: "ts", label: "TS%", title: "True shooting %", sort: (r) => r.ts_pct, cell: (r) => pct(r.ts_pct) },
  { key: "3par", label: "3PAr", title: "Share of shots that were threes", sort: (r) => r.fg3a_rate, cell: (r) => pct(r.fg3a_rate) },
];

export function TeamSeasons(p: { team: string; seasons: SeasonRow[] }) {
  const types = typesIn(p.seasons);
  const [type, setType] = useState<SeasonType>(types[0]?.id ?? "Regular Season");
  return (
    <StatTable
      caption={`${p.team} season by season`}
      columns={SEASON_COLUMNS}
      rows={p.seasons.filter((s) => s.season_type === type)}
      rowKey={(r) => r.season}
      toolbar={types.length > 1 ? <Pills label="Season type" options={types} value={type} onPick={setType} /> : undefined}
      note="Ratings are per 100 possessions, from season totals."
    />
  );
}

/**
 * Recent games as one strip in date order, oldest on the left and the latest on the right, like
 * a form guide. On phones it scrolls sideways and starts at the latest game.
 */
export function RecentGames({ games }: { games: GameRow[] }) {
  const inOrder = [...games].sort((a, b) => a.game_date.localeCompare(b.game_date));
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div>
      <div className="mb-2 flex justify-between font-mono text-[11px] uppercase tracking-wide text-ink-2">
        <span>← Earlier</span>
        <span>Latest →</span>
      </div>
      <ol ref={strip} className="flex snap-x gap-2 overflow-x-auto pb-1">
        {inOrder.map((g) => (
          <li key={g.game_id} className="w-[84px] shrink-0 snap-end sm:min-w-0 sm:flex-1">
            <Link
              href={`/games/${g.game_id}`}
              aria-label={`${g.is_win ? "Win" : "Loss"} ${g.is_home ? "vs" : "at"} ${g.opp}, ${g.pts}–${g.opp_pts}, ${shortDate(g.game_date)}: box score`}
              className="lift flex flex-col items-center gap-1.5 rounded-card border border-line bg-surface px-1 py-2.5 text-center hover:border-line-strong"
            >
              <span className="font-mono text-[10px] text-ink-2">{shortDate(g.game_date)}</span>
              <span className={`grid h-7 w-7 place-items-center rounded-chip font-mono text-xs text-on-color ${g.is_win ? "bg-green" : "bg-red"}`}>
                {g.is_win ? "W" : "L"}
              </span>
              <span className="text-[13px] font-medium">
                <span className="text-ink-2">{g.is_home ? "vs " : "@ "}</span>
                {g.opp}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-ink-2">
                {g.pts}–{g.opp_pts}
              </span>
              {g.season_type !== "Regular Season" && (
                <span className="font-mono text-[9px] uppercase text-ink-2">{g.season_type === "Playoffs" ? "Playoffs" : "Play-In"}</span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
