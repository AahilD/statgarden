"use client";

// Header search: players and teams as you type. Arrow keys move, Enter opens, Esc closes,
// "/" anywhere jumps to it. On phones it's an icon that opens a full-width box.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Hit = { href: string; label: string; meta: string; kind: "Player" | "Team" };
type SearchResult = {
  players: { id: number; name: string; team: string; last_game: string }[];
  teams: { id: number; abbreviation: string; name: string }[];
};

async function search(q: string): Promise<Hit[]> {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=7`);
  if (!r.ok) return [];
  const d: SearchResult = await r.json();
  return [
    ...d.teams.map((t) => ({ href: `/teams/${t.abbreviation}`, label: t.name, meta: t.abbreviation, kind: "Team" as const })),
    ...d.players.map((p) => ({ href: `/players/${p.id}`, label: p.name, meta: p.team, kind: "Player" as const })),
  ];
}

export function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState(""); // q after a short pause, so each keystroke isn't a request
  const [open, setOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 120);
    return () => clearTimeout(t);
  }, [q]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["search", term],
    queryFn: () => search(term),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const shown = term.length >= 2 ? hits : [];

  // "/" focuses the search from anywhere that isn't already a text box
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      setPhoneOpen(true);
      requestAnimationFrame(() => input.current?.focus());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // clicking elsewhere closes the list
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setPhoneOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    router.push(hit.href);
    setQ("");
    setOpen(false);
    setPhoneOpen(false);
    input.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(shown[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setPhoneOpen(false);
      input.current?.blur();
    }
  }

  const listOpen = open && term.length >= 2;

  return (
    <div ref={box} className="relative flex items-center">
      {/* phones: an icon until it's opened */}
      <button
        type="button"
        onClick={() => {
          setPhoneOpen(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
        aria-label="Search players and teams"
        className={`grid h-9 w-9 place-items-center rounded-btn text-ink-2 hover:text-ink sm:hidden ${phoneOpen ? "hidden" : ""}`}
      >
        <Glass />
      </button>

      <div
        className={`${phoneOpen ? "fixed inset-x-4 top-[18px] z-50 flex" : "hidden"} items-center gap-2 rounded-btn border border-line bg-surface px-3 shadow-xl focus-within:border-accent sm:static sm:flex sm:w-56 sm:shadow-none lg:w-72`}
      >
        <span className="text-ink-2">
          <Glass />
        </span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && shown[active] ? `${listId}-${active}` : undefined}
          aria-label="Search players and teams"
          placeholder="Search players, teams"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden rounded-chip border border-line px-1.5 font-mono text-[10px] text-ink-2 sm:inline">/</kbd>
      </div>

      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className={`${phoneOpen ? "fixed inset-x-4 top-[64px]" : "absolute right-0 top-full mt-1.5 w-80"} z-50 max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface-2 p-1.5 shadow-xl`}
        >
          {shown.map((h, i) => (
            <li
              key={h.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => e.preventDefault()} // keep focus in the box so the click lands
              onClick={() => go(h)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-chip px-2.5 py-2 text-sm ${i === active ? "bg-sunken" : ""}`}
            >
              <i aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${h.kind === "Team" ? "bg-blue" : "bg-orange"}`} />
              <span className="truncate text-ink">{h.label}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-2">{h.meta}</span>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-ink-2">{isFetching ? "Searching…" : `Nothing matches “${term}”.`}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Glass() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
