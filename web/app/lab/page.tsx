import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Builder } from "@/components/builder/Builder";
import { loadView } from "@/lib/view.server";

const DESCRIPTION = "Drop NBA stats into a table or chart and share the link.";

// A shared link (/lab?v=...) gets its own title and a picture of its chart,
// so it shows up properly when pasted into iMessage, Discord and so on.
export async function generateMetadata({ searchParams }: PageProps<"/lab">): Promise<Metadata> {
  const v = (await searchParams).v;
  const view = typeof v === "string" ? await loadView(v) : null;
  if (!view) return { title: "Lab", description: DESCRIPTION };
  const image = { url: `/og?v=${v}`, width: 1200, height: 630, alt: view.title };
  return {
    title: view.title,
    description: view.subtitle || DESCRIPTION,
    openGraph: { title: view.title, description: view.subtitle || DESCRIPTION, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title: view.title, images: [image] },
  };
}

export default function LabPage() {
  // The builder reads its view from the link (?v=...), so it renders inside Suspense.
  return (
    <>
      <Suspense fallback={<BuilderSkeleton />}>
        <Builder />
      </Suspense>
      <Suspense>
        <PerRequest />
      </Suspense>
    </>
  );
}

/** Tells Next the metadata above is per request (it reads the link), so it isn't baked in at build time. */
async function PerRequest() {
  await connection();
  return null;
}

function BuilderSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="h-8 w-48 animate-pulse rounded-btn bg-surface" />
      <div className="mt-6 grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="h-[60vh] animate-pulse rounded-card bg-surface" />
        <div className="h-[60vh] animate-pulse rounded-card bg-surface" />
      </div>
    </div>
  );
}
