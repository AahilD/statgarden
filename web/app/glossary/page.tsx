import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { GlossaryList } from "@/components/pages/GlossaryList";
import { apiGet, type GlossaryField } from "@/lib/pages";

export const metadata: Metadata = {
  title: "Glossary",
  description: "Every stat on StatGarden: what it means, how it's worked out, and where to find it.",
};

async function load() {
  "use cache";
  cacheLife("hours");
  return (await apiGet<{ groups: string[]; fields: GlossaryField[] }>("/meta/glossary")) ?? { groups: [], fields: [] };
}

export default async function GlossaryPage() {
  const { groups, fields } = await load();
  return (
    <div className="mx-auto max-w-[900px] px-4 pt-8 sm:pt-12">
      <h1 className="title-caps text-center text-[clamp(1.9rem,6vw,3rem)] tracking-[0.12em]">Glossary</h1>
      <p className="mx-auto mt-3 max-w-[520px] text-center text-sm text-ink-2">
        Every stat on the site, what it means and how it&apos;s worked out. Short names are what table headers use.
      </p>
      <GlossaryList groups={groups} fields={fields} />
    </div>
  );
}
