"use client";

// Jump links for a long page: a row of chips that sticks under the site header and lights up
// the section you're reading.
import { useEffect, useState } from "react";

export function SectionNav({ links }: { links: { id: string; label: string; short?: string }[] }) {
  const [on, setOn] = useState<string | null>(null);

  useEffect(() => {
    const els = links.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e);
    const pickCurrent = () => {
      // the last heading that has scrolled past the top third of the screen
      const line = window.innerHeight / 3;
      let cur: string | null = null;
      for (const e of els) if (e.getBoundingClientRect().top <= line) cur = e.id;
      setOn(cur);
    };
    pickCurrent();
    window.addEventListener("scroll", pickCurrent, { passive: true });
    return () => window.removeEventListener("scroll", pickCurrent);
  }, [links]);

  return (
    <nav aria-label="On this page" className="sticky top-[var(--header-h,62px)] z-30 -mx-4 mt-6 px-4 py-2">
      <div className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-btn border border-line bg-surface p-1 shadow-sm">
        {links.map((l) => (
          <a
            key={l.id}
            href={`#${l.id}`}
            aria-current={on === l.id ? "location" : undefined}
            className={`shrink-0 rounded-chip px-2.5 py-1 sm:px-3 text-xs font-medium transition-colors ${
              on === l.id ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"
            }`}
          >
            {l.short ? (
              <>
                <span className="sm:hidden">{l.short}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </>
            ) : (
              l.label
            )}
          </a>
        ))}
      </div>
    </nav>
  );
}
