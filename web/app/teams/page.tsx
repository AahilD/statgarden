import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { TeamsHub } from "@/components/pages/TeamsHub";
import type { CupData, PlayoffData } from "@/lib/brackets";
import { apiGet, type TeamListItem } from "@/lib/pages";

export const metadata: Metadata = {
  title: "Teams",
  description: "NBA standings by conference and division, NBA Cup groups and knockouts, and the playoff bracket.",
};

async function load() {
  "use cache";
  cacheLife("hours");
  const [teams, cup, playoffs] = await Promise.all([
    apiGet<TeamListItem[]>("/teams"),
    apiGet<CupData>("/cup"),
    apiGet<PlayoffData>("/playoffs"),
  ]);
  return { teams: teams ?? [], cup, playoffs };
}

export default async function TeamsPage() {
  const { teams, cup, playoffs } = await load();
  const season = playoffs?.seasons[0] ?? cup?.season ?? "";
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <h1 className="title-caps mb-5 text-center text-[clamp(1.9rem,6vw,3rem)] tracking-[0.12em]">Standings</h1>
      {/* the switch reads the link (?view=cup) in the browser, so it streams in after the shell */}
      <Suspense fallback={<div className="mx-auto h-96 w-full animate-pulse rounded-card bg-sunken" />}>
        <TeamsHub teams={teams} season={season} cup={cup} playoffs={playoffs} />
      </Suspense>
    </div>
  );
}
