"use client";

// The game page's box score: one table per team, starters first, then the bench under a line.
// A client component because the table sorts.
import Link from "next/link";
import { StatTable, type Column } from "@/components/pages/StatTable";
import { signed, type GamePlayer, type GameTeam } from "@/lib/pages";

const made = (m: number, a: number) => `${m}-${a}`;

export function BoxScore({ team: t }: { team: GameTeam }) {
  return (
    <StatTable
      caption={`${t.name ?? t.abbr} box score`}
      columns={BOX_COLUMNS}
      rows={t.players}
      rowKey={(p) => String(p.player_id)}
      rowClass={(p) => (p.min === 0 ? "text-ink-2" : "")}
      divider={(p) => isFirstBench(t, p)}
      foot={[totalsRow(t)]}
      note={`Starters first, then the bench by minutes.${t.inactive.length > 0 ? ` Inactive: ${t.inactive.join(", ")}.` : ""}`}
    />
  );
}

const isFirstBench = (t: GameTeam, p: GamePlayer) => !p.is_starter && t.players.find((x) => !x.is_starter) === p;

type BoxRow = GamePlayer & { total?: boolean };

/** The team line under each box score. */
const totalsRow = (t: GameTeam): BoxRow => ({
  ...t,
  player_id: -1,
  player: "Team",
  is_starter: false,
  pos: null,
  min: 0,
  plus_minus: null,
  total: true,
});

const dnp = (p: BoxRow) => p.min === 0 && !p.total;

const BOX_COLUMNS: Column<BoxRow>[] = [
  {
    key: "player",
    label: "Player",
    sort: (p) => p.player,
    text: true,
    sticky: true,
    strong: true,
    cell: (p) =>
      p.total ? (
        "Team"
      ) : (
        <>
          <Link href={`/players/${p.player_id}`} className="hover:underline">
            {p.player}
          </Link>
          {p.pos && <span className="ml-1.5 font-mono text-[10px] text-ink-2">{p.pos}</span>}
        </>
      ),
  },
  { key: "min", sort: (p) => p.min, label: "MIN", title: "Minutes", cell: (p) => (p.total ? "" : dnp(p) ? "DNP" : p.min) },
  { key: "pts", sort: (p) => p.pts, label: "PTS", title: "Points", strong: true, cell: (p) => (dnp(p) ? "" : p.pts) },
  { key: "reb", sort: (p) => p.reb, label: "REB", title: "Rebounds", cell: (p) => (dnp(p) ? "" : p.reb) },
  { key: "ast", sort: (p) => p.ast, label: "AST", title: "Assists", cell: (p) => (dnp(p) ? "" : p.ast) },
  { key: "stl", sort: (p) => p.stl, label: "STL", title: "Steals", cell: (p) => (dnp(p) ? "" : p.stl) },
  { key: "blk", sort: (p) => p.blk, label: "BLK", title: "Blocks", cell: (p) => (dnp(p) ? "" : p.blk) },
  { key: "tov", sort: (p) => p.tov, label: "TOV", title: "Turnovers", cell: (p) => (dnp(p) ? "" : p.tov) },
  { key: "fg", sort: (p) => p.fgm, label: "FG", title: "Field goals made-attempted", cell: (p) => (dnp(p) ? "" : made(p.fgm, p.fga)) },
  { key: "fg3", sort: (p) => p.fg3m, label: "3P", title: "Threes made-attempted", cell: (p) => (dnp(p) ? "" : made(p.fg3m, p.fg3a)) },
  { key: "ft", sort: (p) => p.ftm, label: "FT", title: "Free throws made-attempted", cell: (p) => (dnp(p) ? "" : made(p.ftm, p.fta)) },
  { key: "oreb", sort: (p) => p.oreb, label: "OREB", title: "Offensive rebounds", cell: (p) => (dnp(p) ? "" : p.oreb) },
  { key: "pf", sort: (p) => p.pf, label: "PF", title: "Personal fouls", cell: (p) => (dnp(p) ? "" : p.pf) },
  { key: "pm", sort: (p) => p.plus_minus, label: "+/−", title: "Plus-minus", cell: (p) => (dnp(p) || p.plus_minus == null ? "" : signed(p.plus_minus, 0)) },
];
