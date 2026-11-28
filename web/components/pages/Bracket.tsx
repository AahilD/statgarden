"use client";

// What holds the brackets together: a soft panel behind them and lines from each game to the one
// it feeds. Cards mark themselves with data-bk (their id), data-to (the id they feed) and
// data-won ("1" once decided); the lines are measured from the cards, so they follow any layout
// (left to right, or right to left for the East side of the playoff bracket).
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** The soft panel behind a bracket. */
export function BracketPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-panel p-3 sm:p-5 ${className}`}>{children}</div>;
}

/** A card's spot in the bracket: its id, the id of the game its winner goes to, and whether it's decided. */
export function Slot({ id, to, won, children }: { id: string; to?: string; won?: boolean; children: ReactNode }) {
  return (
    <div data-bk={id} data-to={to} data-won={won ? "1" : undefined}>
      {children}
    </div>
  );
}

/** Draws the elbow lines between Slots inside it. */
export function BracketLines({ children, className = "" }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const out = svg.current;
    if (!el || !out) return;
    const draw = () => {
      const o = el.getBoundingClientRect();
      const lines: { d: string; won: boolean }[] = [];
      el.querySelectorAll<HTMLElement>("[data-to]").forEach((src) => {
        const tgt = el.querySelector<HTMLElement>(`[data-bk="${src.dataset.to}"]`);
        if (!tgt || !src.offsetParent || !tgt.offsetParent) return;
        const a = src.getBoundingClientRect();
        const b = tgt.getBoundingClientRect();
        const ltr = b.left >= a.right - 1;
        const sx = (ltr ? a.right : a.left) - o.left;
        const tx = (ltr ? b.left : b.right) - o.left;
        const sy = a.top + a.height / 2 - o.top;
        const ty = b.top + b.height / 2 - o.top;
        const mx = Math.round((sx + tx) / 2);
        lines.push({
          d: `M${sx} ${sy}H${mx}V${ty}H${tx}`,
          won: src.dataset.won === "1",
        });
      });
      // decided games last, so a shared stub into the next game shows green
      lines.sort((x, y) => Number(x.won) - Number(y.won));
      out.innerHTML = lines
        .map((l) => `<path d="${l.d}" fill="none" stroke="var(${l.won ? "--green" : "--border-strong"})" stroke-width="1.5" />`)
        .join("");
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  });

  return (
    <div ref={box} className={`relative ${className}`}>
      <svg ref={svg} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" />
      <div className="relative">{children}</div>
    </div>
  );
}
