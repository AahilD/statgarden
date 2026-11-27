"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Home", wide: true }, // phones: the logo is the way home
  { href: "/lab", label: "Lab" },
  { href: "/teams", label: "Teams" },
  { href: "/glossary", label: "Glossary", wide: true }, // phones: in the footer, so the header fits
];

export function Nav() {
  return <NavLinks path={usePathname()} />;
}

/** The links; `path` is null while the page is still streaming in (no link marked as current yet). */
export function NavLinks({ path }: { path: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 text-sm sm:gap-1">
      {LINKS.map((l) => {
        const active = path !== null && (l.href === "/" ? path === "/" : path.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`items-center rounded-btn px-1.5 py-1.5 sm:px-2.5 ${l.wide ? "hidden sm:flex" : "flex"} ${
              active ? "text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            <span className={active ? "underline decoration-orange decoration-2 underline-offset-[6px]" : ""}>{l.label}</span>
          </Link>
        );
      })}
      <ThemeToggle />
    </nav>
  );
}
