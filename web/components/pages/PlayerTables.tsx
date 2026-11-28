"use client";

// The player page's tables. Client components because they sort and switch season types.
import Link from "next/link";
import { useState } from "react";
import { Pills, StatTable, type Column } from "@/components/pages/StatTable";
import { gameTag, pct, perGame, shortDate, signed, type GameLine, type PlayerPage, type SeasonType } from "@/lib/pages";

type SeasonRow = PlayerPage["seasons"][number];
type CareerRow = PlayerPage["career"][number];
type Row = SeasonRow | (CareerRow & { season: string; teams: string });

// NBA Cup games also count in the regular season; the Cup tab shows just those games
const TYPE_ORDER: SeasonType[] = ["Regular Season", "NBA Cup", "Playoffs", "Play-In"];
const TYPE_LABEL: Record<SeasonType, string> = {
  "Regular Season": "Regular season",
  "NBA Cup": "NBA Cup",
  Playoffs: "Playoffs",
  "Play-In": "Play-In",
};

/** The season types this player has, in the usual order, for a Regular season / Playoffs switch. */
export function typesIn(rows: { season_type: SeasonType }[]) {
  return TYPE_ORDER.filter((t) => rows.some((r) => r.season_type === t)).map((t) => ({ id: t, label: TYPE_LABEL[t] }));
}

const pg = (k: keyof SeasonRow) => (r: Row) => (r.gp ? (r[k as keyof Row] as number) / r.gp : null);

const SEASON_COLUMNS: Column<Row>[] = [
  { key: "season", label: "Season", text: true, sticky: true, strong: true, cell: (r) => r.season, sort: (r) => r.season },
  {
    key: "team",
    label: "Team",
    text: true,
    cell: (r) =>
      r.teams
        .split(" / ")
        .filter(Boolean)
        .map((t, i) => (
          <span key={t}>
            {i > 0 && " / "}
            <Link href={`/teams/${t}`} className="hover:underline">
              {t}
            </Link>
          </span>
        )),
  },
  { key: "gp", label: "GP", title: "Games played", cell: (r) => r.gp, sort: (r) => r.gp },
  { key: "min", label: "MIN", title: "Minutes", cell: (r) => perGame(r.min, r.gp), sort: pg("min") },
  { key: "pts", label: "PTS", title: "Points", strong: true, cell: (r) => perGame(r.pts, r.gp), sort: pg("pts") },
  { key: "reb", label: "REB", title: "Rebounds", cell: (r) => perGame(r.reb, r.gp), sort: pg("reb") },
  { key: "ast", label: "AST", title: "Assists", cell: (r) => perGame(r.ast, r.gp), sort: pg("ast") },
  { key: "stl", label: "STL", title: "Steals", cell: (r) => perGame(r.stl, r.gp), sort: pg("stl") },
  { key: "blk", label: "BLK", title: "Blocks", cell: (r) => perGame(r.blk, r.gp), sort: pg("blk") },
  { key: "tov", label: "TOV", title: "Turnovers", cell: (r) => perGame(r.tov, r.gp), sort: pg("tov") },
  { key: "fg", label: "FG%", title: "Field goal %", cell: (r) => pct(r.fg_pct), sort: (r) => r.fg_pct },
  { key: "fg3", label: "3P%", title: "Three-point %", cell: (r) => pct(r.fg3_pct), sort: (r) => r.fg3_pct },
  { key: "ft", label: "FT%", title: "Free throw %", cell: (r) => pct(r.ft_pct), sort: (r) => r.ft_pct },
  { key: "ts", label: "TS%", title: "True shooting %", cell: (r) => pct(r.ts_pct), sort: (r) => r.ts_pct },
  {
    key: "pm",
    label: "+/−",
    title: "Plus-minus per game",
    cell: (r) => signed(r.gp ? r.plus_minus / r.gp : null),
    sort: (r) => (r.gp ? r.plus_minus / r.gp : null),
  },
];

/** Season by season for one season type at a time, with that type's career line underneath. */
export function PlayerSeasons(p: { name: string; seasons: SeasonRow[]; career: CareerRow[]; firstSeason: string }) {
  const types = typesIn(p.seasons);
  const [type, setType] = useState<SeasonType>(types[0]?.id ?? "Regular Season");
  const rows = p.seasons.filter((s) => s.season_type === type);
  const career = p.career.filter((c) => c.season_type === type).map((c) => ({ ...c, season: "Career", teams: "" }));
  const cupNote = type === "NBA Cup" ? " NBA Cup group and knockout games (they count in the regular season too; the final doesn't)." : "";
  return (
    <StatTable
      caption={`${p.name} season by season, ${TYPE_LABEL[type].toLowerCase()}, per game`}
      columns={SEASON_COLUMNS}
      rows={rows}
      rowKey={(r) => r.season}
      foot={career}
      toolbar={types.length > 1 ? <Pills label="Season type" options={types} value={type} onPick={setType} /> : undefined}
      note={`Per game.${cupNote} Career adds up every season loaded so far (${p.firstSeason} on).`}
    />
  );
}

const made = (m: number, a: number) => `${m}-${a}`;

const GAME_COLUMNS: Column<GameLine>[] = [
  {
    key: "date",
    label: "Date",
    text: true,
    sticky: true,
    sort: (g) => g.game_date,
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
    sort: (g) => g.opp,
    cell: (g) => (
      <>
        <span className="text-ink-2">{g.is_home ? "vs " : "@ "}</span>
        <Link href={`/teams/${g.opp}`} className="hover:underline">
          {g.opp}
        </Link>
        {gameTag(g) && <span className="ml-1.5 font-mono text-[10px] uppercase text-ink-2">{gameTag(g)}</span>}
      </>
    ),
  },
  {
    key: "res",
    label: "Result",
    text: true,
    sort: (g) => g.margin,
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
  { key: "min", label: "MIN", cell: (g) => g.min, sort: (g) => g.min },
  { key: "pts", label: "PTS", strong: true, cell: (g) => g.pts, sort: (g) => g.pts },
  { key: "reb", label: "REB", cell: (g) => g.reb, sort: (g) => g.reb },
  { key: "ast", label: "AST", cell: (g) => g.ast, sort: (g) => g.ast },
  { key: "stl", label: "STL", cell: (g) => g.stl, sort: (g) => g.stl },
  { key: "blk", label: "BLK", cell: (g) => g.blk, sort: (g) => g.blk },
  { key: "tov", label: "TOV", cell: (g) => g.tov, sort: (g) => g.tov },
  { key: "fg", label: "FG", title: "Field goals made-attempted", cell: (g) => made(g.fgm, g.fga), sort: (g) => g.fgm },
  { key: "fg3", label: "3P", title: "Threes made-attempted", cell: (g) => made(g.fg3m, g.fg3a), sort: (g) => g.fg3m },
  { key: "ft", label: "FT", title: "Free throws made-attempted", cell: (g) => made(g.ftm, g.fta), sort: (g) => g.ftm },
  { key: "pm", label: "+/−", title: "Plus-minus", cell: (g) => signed(g.plus_minus, 0), sort: (g) => g.plus_minus },
];

export function PlayerGames(p: { name: string; games: GameLine[] }) {
  return <StatTable caption={`${p.name}'s last games`} columns={GAME_COLUMNS} rows={p.games} rowKey={(g) => g.game_id} />;
}
