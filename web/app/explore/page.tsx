import type { Metadata } from "next";
import { Suspense } from "react";
import { Builder } from "@/components/builder/Builder";

export const metadata: Metadata = {
  title: "Explore",
  description: "Drop NBA stats into a table or chart and share the link.",
};

export default function ExplorePage() {
  // The builder reads its view from the link (?v=...), so it renders inside Suspense.
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <Builder />
    </Suspense>
  );
}

function BuilderSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="h-8 w-48 animate-pulse rounded-[8px] bg-surface" />
      <div className="mt-6 grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="h-[60vh] animate-pulse rounded-[12px] bg-surface" />
        <div className="h-[60vh] animate-pulse rounded-[12px] bg-surface" />
      </div>
    </div>
  );
}
