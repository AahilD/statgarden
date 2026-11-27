import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Standings } from "@/components/pages/Standings";
import { apiGet, type TeamListItem } from "@/lib/pages";

export const metadata: Metadata = { title: "Teams", description: "NBA standings: the whole league, by conference or by division." };

async function load() {
  "use cache";
  cacheLife("hours");
  return (await apiGet<TeamListItem[]>("/teams")) ?? [];
}

export default async function TeamsPage() {
  const teams = await load();
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:pt-12">
      <h1 className="title-caps text-center text-[clamp(1.9rem,6vw,3rem)] tracking-[0.12em]">Standings</h1>
      <p className="label-mono mb-6 mt-2 text-center">This season · regular season</p>
      <Standings teams={teams} />
    </div>
  );
}
