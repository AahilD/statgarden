"use client";

// Any page that fails to load (the API down or restarting, say) lands here instead of a blank page.
import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <h1 className="title-caps text-2xl">This page didn&apos;t load</h1>
      <p className="mt-3 text-sm text-ink-2">The stats server didn&apos;t answer. It&apos;s usually back in a few seconds.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-btn bg-orange px-4 py-2 text-sm text-on-orange">
          Try again
        </button>
        <Link href="/" className="rounded-btn border border-line px-4 py-2 text-sm hover:border-line-strong">
          Home
        </Link>
      </div>
    </div>
  );
}
