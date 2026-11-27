"use client";

// A column header's explanation. Drawn on the page (not inside the table) so the
// scrolling table and its sticky header can't hide or clip it. The table keeps
// the open/closed state, so re-rendering a header doesn't close it.
import { createPortal } from "react-dom";

export type Tip = { title: string; about?: string };
export type OpenTip = Tip & { left: number; right: number; top: number; alignRight: boolean };

const WIDTH = 240;

export function HeaderTip({ tip }: { tip: OpenTip | null }) {
  if (!tip || typeof document === "undefined") return null;
  const left = Math.max(8, Math.min(tip.alignRight ? tip.right - WIDTH : tip.left, window.innerWidth - WIDTH - 8));
  return createPortal(
    <span
      role="tooltip"
      style={{ position: "fixed", top: tip.top + 4, left, width: WIDTH }}
      className="pointer-events-none z-50 rounded-btn border border-line bg-surface p-2.5 text-xs text-ink shadow-lg"
    >
      <span className="block font-medium">{tip.title}</span>
      {tip.about && <span className="mt-1 block leading-snug text-ink-2">{tip.about}</span>}
    </span>,
    document.body,
  );
}
