import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { apiGet, type TeamListItem } from "@/lib/pages";

export const metadata: Metadata = { title: "Teams", description: "All 30 NBA teams, by conference and division." };

async function load() {
  "use cache";
  cacheLife("hours");
  return (await apiGet<TeamListItem[]>("/teams")) ?? [];
}

export default async function TeamsPage() {
  const teams = await load();
  const conferences = ["East", "West"].map((c) => ({
    name: c,
    divisions: [...new Set(teams.filter((t) => t.conference === c).map((t) => t.division ?? ""))].map((dv) => ({
      name: dv,
      teams: teams.filter((t) => t.conference === c && (t.division ?? "") === dv),
    })),
  }));

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <h1 className="title-caps text-center text-[clamp(1.9rem,6vw,3rem)] tracking-[0.12em]">Teams</h1>
      <p className="label-mono mt-2 text-center">This season&apos;s regular-season record</p>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {conferences.map((c) => (
          <section key={c.name}>
            <div className="mb-4 flex items-center gap-4">
              <span className="h-px flex-1 bg-line-strong" />
              <h2 className="title-caps text-lg">{c.name}</h2>
              <span className="h-px flex-1 bg-line-strong" />
            </div>
            <div className="grid gap-6">
              {c.divisions.map((dv) => (
                <div key={dv.name}>
                  <h3 className="label-mono mb-2">{dv.name}</h3>
                  <ul className="overflow-hidden rounded-card border border-line bg-surface">
                    {dv.teams.map((t) => (
                      <li key={t.id} className="border-b border-line last:border-0">
                        <Link href={`/teams/${t.abbr}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken">
                          <span className="w-9 font-mono text-[11px] text-ink-2">{t.abbr}</span>
                          <span className="font-medium">{t.name}</span>
                          <span className="ml-auto font-mono tabular-nums text-ink-2">
                            {t.wins}–{t.losses}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
