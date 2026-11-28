"use client";

// The teams index as standings: the whole league, by conference, or by division. Each group is
// ranked by win % (NBA.com's seed breaks ties); games back is counted within the group shown.
import Link from "next/link";
import { useState } from "react";
import { Heading } from "@/components/pages/Parts";
import { Pills, StatTable, type Column } from "@/components/pages/StatTable";
import { num1, signed, type TeamListItem } from "@/lib/pages";

type View = "league" | "conference" | "division";
type Row = TeamListItem & { rank: number; gb: number; pct: number };

const VIEWS: { id: View; label: string }[] = [
  { id: "league", label: "All teams" },
  { id: "conference", label: "Conference" },
  { id: "division", label: "Division" },
];

const pctOf = (t: TeamListItem) => (t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0);

function ranked(teams: TeamListItem[]): Row[] {
  const sorted = [...teams].sort(
    (a, b) => pctOf(b) - pctOf(a) || b.wins - a.wins || (a.playoff_rank ?? 99) - (b.playoff_rank ?? 99) || a.name.localeCompare(b.name),
  );
  const top = sorted[0];
  return sorted.map((t, i) => ({
    ...t,
    rank: i + 1,
    pct: pctOf(t),
    gb: top ? (top.wins - t.wins + (t.losses - top.losses)) / 2 : 0,
  }));
}

/** "W 3" → 3, "L 2" → −2, so streaks sort hot to cold. */
const streakValue = (s: string | null) => {
  const m = s?.match(/([WL])\s*(\d+)/);
  return m ? (m[1] === "W" ? 1 : -1) * Number(m[2]) : null;
};
/** "8-3" → win share, for sorting home / road / last-10 records. */
const recordValue = (s: string | null) => {
  const m = s?.match(/(\d+)-(\d+)/);
  return m ? Number(m[1]) / Math.max(1, Number(m[1]) + Number(m[2])) : null;
};

function columns(conference: boolean): Column<Row>[] {
  return [
    {
      // rank and team in one pinned cell, so the rank stays put when the table scrolls sideways
      key: "team",
      label: "Team",
      title: conference ? "Seed and team (green: playoff spot, orange: play-in). Sorts by seed." : "Rank and team",
      text: true,
      sticky: true,
      strong: true,
      sort: (r) => r.rank,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {conference && (
            <i aria-hidden className={`h-3.5 w-1 shrink-0 rounded-full ${r.rank <= 6 ? "bg-green" : r.rank <= 10 ? "bg-orange" : "bg-transparent"}`} />
          )}
          <span className="w-5 font-mono text-[11px] font-normal text-ink-2">{r.rank}</span>
          <Link href={`/teams/${r.abbr}`} className="hover:underline">
            <span className="sm:hidden">{r.abbr}</span>
            <span className="hidden sm:inline">{r.name}</span>
          </Link>
        </span>
      ),
    },
    { key: "w", label: "W", title: "Wins", strong: true, sort: (r) => r.wins, cell: (r) => r.wins },
    { key: "l", label: "L", title: "Losses", sort: (r) => r.losses, cell: (r) => r.losses },
    { key: "pct", label: "PCT", title: "Win %", sort: (r) => r.pct, cell: (r) => r.pct.toFixed(3).replace(/^0/, "") },
    { key: "gb", label: "GB", title: "Games back of first in this table", sort: (r) => r.gb, cell: (r) => (r.gb ? r.gb.toFixed(1) : "—") },
    { key: "home", label: "Home", sort: (r) => recordValue(r.home), cell: (r) => r.home ?? "—" },
    { key: "road", label: "Road", sort: (r) => recordValue(r.road), cell: (r) => r.road ?? "—" },
    { key: "conf", label: "Conf", title: "Record against its own conference", sort: (r) => recordValue(r.conf_record), cell: (r) => r.conf_record ?? "—" },
    { key: "l10", label: "L10", title: "Last 10 games", sort: (r) => recordValue(r.l10), cell: (r) => r.l10 ?? "—" },
    { key: "strk", label: "Strk", title: "Current streak", sort: (r) => streakValue(r.streak), cell: (r) => r.streak ?? "—" },
    { key: "pts", label: "PPG", title: "Points per game", sort: (r) => r.pts, cell: (r) => num1(r.pts) },
    { key: "opp", label: "OPP", title: "Points allowed per game", sort: (r) => r.opp_pts, cell: (r) => num1(r.opp_pts) },
    { key: "net", label: "NET", title: "Net rating (per 100 possessions)", sort: (r) => r.net_rtg, cell: (r) => signed(r.net_rtg) },
  ];
}

export function Standings({ teams }: { teams: TeamListItem[] }) {
  const [view, setView] = useState<View>("conference");
  const groups: { name: string; teams: TeamListItem[] }[] =
    view === "league"
      ? [{ name: "League", teams }]
      : view === "conference"
        ? ["East", "West"].map((c) => ({ name: c, teams: teams.filter((t) => t.conference === c) }))
        : [...new Set(teams.map((t) => `${t.conference}|${t.division}`))].map((k) => ({
            name: k.split("|")[1],
            teams: teams.filter((t) => `${t.conference}|${t.division}` === k),
          }));

  return (
    <div>
      <div className="flex justify-center">
        <Pills label="Standings view" options={VIEWS} value={view} onPick={setView} />
      </div>
      {/* conference and division tables are full width, one after another, so their columns line up */}
      <div className="mt-8 grid grid-cols-1 gap-10">
        {groups.map((g) => (
          <section key={g.name}>
            {view !== "league" && <Heading>{view === "conference" ? `${g.name}ern Conference` : g.name}</Heading>}
            <StatTable
              caption={`${g.name} standings`}
              columns={columns(view === "conference")}
              rows={ranked(g.teams)}
              rowKey={(r) => String(r.id)}
            />
          </section>
        ))}
      </div>
      {view === "conference" && (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="h-3 w-1 rounded-full bg-green" /> Playoff spot (1–6)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="h-3 w-1 rounded-full bg-orange" /> Play-In (7–10)
          </span>
          <span>Ties broken by NBA.com&apos;s seeding</span>
        </p>
      )}
    </div>
  );
}
