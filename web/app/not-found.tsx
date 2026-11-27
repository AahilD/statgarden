import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <h1 className="title-caps text-2xl">Nothing here</h1>
      <p className="mt-3 text-sm text-ink-2">
        No player, team or game at this address. It may be from a season that isn&apos;t loaded yet. Try the search at the top.
      </p>
      <Link href="/" className="mt-6 inline-block rounded-btn border border-line px-4 py-2 text-sm hover:border-line-strong">
        Home
      </Link>
    </div>
  );
}
