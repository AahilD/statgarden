"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", num: "01", label: "Home" },
  { href: "/explore", num: "02", label: "Explore" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 text-sm sm:gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 sm:px-2.5 ${
              active ? "text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            <span className={`hidden font-mono text-[11px] sm:inline ${active ? "text-accent-ink" : "text-ink-2 group-hover:text-accent-ink"}`}>
              {l.num}
            </span>
            <span className={active ? "underline decoration-orange decoration-2 underline-offset-[6px]" : ""}>{l.label}</span>
          </Link>
        );
      })}
      <ThemeToggle />
    </nav>
  );
}
