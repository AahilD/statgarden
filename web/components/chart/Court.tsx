// A half court with the shots on it. Plain SVG, so it renders on the server (player pages) and in
// the Lab alike. Hoop at the top, like NBA.com. Three ways to draw it (CourtMode):
//   dots: one dot per spot, sized by how often they shoot there, coloured against the league
//         around that spot (heatDiffs)
//   fga / fg: a heat map, light red to dark red, of where they shoot from or where they're hot
import { useId } from "react";
import { CELL, centre, FG_LABELS, HEAT, heatDiffs, heatFill, heatGrid, REDS, type CourtData, type CourtMode } from "@/lib/court";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function Court(p: { court: CourtData; hex: number; label?: string; mode?: CourtMode }) {
  const { court, hex: s } = p;
  const mode = p.mode ?? "dots";
  const id = useId().replace(/:/g, "");
  const summary = `${p.label ?? "Shots"}: ${court.fga} shots, ${pct(court.fgm / Math.max(1, court.fga))} made`;
  const tip = (h: CourtData["hexes"][number]) =>
    `${h[3]} of ${h[2]} (${pct(h[3] / h[2])})${h[5] == null ? "" : ` · league ${pct(h[5])} from here`}`;

  let marks;
  if (mode === "dots") {
    const counts = court.hexes.map((h) => h[2]).sort((a, b) => a - b);
    // size against a busy spot, not the busiest: the rim would shrink everything else to specks
    const ref = Math.max(1, counts[Math.floor(counts.length * 0.9)] ?? 1);
    const heat = heatDiffs(court.hexes);
    marks = court.hexes.map((h) => {
      const [q, r, n] = h;
      const [cx, cy] = centre(q, r, s);
      const k = Math.min(1, Math.max(0.35, Math.sqrt(n / ref)));
      return (
        <circle key={`${q},${r}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={(s * 0.86 * k).toFixed(1)} fill={heatFill(heat.get(`${q},${r}`) ?? null)}>
          <title>{tip(h)}</title>
        </circle>
      );
    });
  } else {
    // a grid of small cells, softened just enough to hide the squares, kept inside the court lines
    const cells = heatGrid(court.hexes, s, mode);
    const half = CELL / 2 + 0.6;
    marks = (
      <>
        <defs>
          <filter id={`soft${id}`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation={CELL * 0.6} />
          </filter>
          <clipPath id={`clip${id}`}>
            <rect x={-250} y={-47.5} width={500} height={470} />
          </clipPath>
        </defs>
        <g clipPath={`url(#clip${id})`}>
          <g filter={`url(#soft${id})`}>
            {cells.map(([x, y, step]) => (
              <rect key={`${x},${y}`} x={x - half} y={y - half} width={half * 2} height={half * 2} fill={REDS[step]} />
            ))}
          </g>
        </g>
        {/* invisible dots on top, so hovering still shows each spot's numbers */}
        <g fill="transparent">
          {court.hexes.map((h) => {
            const [cx, cy] = centre(h[0], h[1], s);
            return (
              <circle key={`${h[0]},${h[1]}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={s}>
                <title>{tip(h)}</title>
              </circle>
            );
          })}
        </g>
      </>
    );
  }

  return (
    <svg viewBox="-252 -50 504 475" role="img" aria-label={summary} className="block h-auto w-full">
      <title>{summary}</title>
      {mode === "dots" && <CourtLines />}
      {marks}
      {/* on the heat map the lines go on top, so they show through the colour */}
      {mode !== "dots" && <CourtLines />}
    </svg>
  );
}

/** Court markings in tenths of a foot, hoop at (0, 0). */
function CourtLines() {
  return (
    <g fill="none" stroke="var(--court-line)" strokeWidth={2} vectorEffect="non-scaling-stroke" aria-hidden>
      <rect x={-250} y={-47.5} width={500} height={470} />
      <rect x={-80} y={-47.5} width={160} height={190} />
      <rect x={-60} y={-47.5} width={120} height={190} />
      {/* free-throw circle: solid toward half court, dashed inside the lane */}
      <path d="M -60 142.5 A 60 60 0 0 0 60 142.5" />
      <path d="M -60 142.5 A 60 60 0 0 1 60 142.5" strokeDasharray="8 8" />
      <line x1={-30} y1={-7.5} x2={30} y2={-7.5} />
      <circle cx={0} cy={0} r={7.5} />
      <path d="M -40 0 A 40 40 0 0 0 40 0" />
      {/* three-point line: corners, then the arc */}
      <path d="M -220 -47.5 L -220 89.5 A 237.5 237.5 0 0 0 220 89.5 L 220 -47.5" />
      {/* centre circle, the half that's on this side */}
      <path d="M -60 422.5 A 60 60 0 0 1 60 422.5" />
      <path d="M -20 422.5 A 20 20 0 0 1 20 422.5" />
    </g>
  );
}

/** What the colours (and, for dots, the sizes) mean. */
export function CourtLegend({ compact = false, mode = "dots" }: { compact?: boolean; mode?: CourtMode }) {
  const swatch = (fill: string, title?: string) => <i key={fill} title={title} className="h-3 w-5 rounded-[2px]" style={{ background: fill }} />;
  if (mode !== "dots")
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span>{mode === "fga" ? "Fewer" : "Colder"}</span>
          {REDS.map((f, i) => swatch(f, mode === "fg" ? `FG% ${FG_LABELS[i]}` : undefined))}
          <span>{mode === "fga" ? "More" : "Hotter"}</span>
        </span>
        {!compact && (
          <span className="text-center">
            {mode === "fga" ? "shots around each spot" : `FG% around each spot: ${FG_LABELS[0]} to ${FG_LABELS[4]}`}
          </span>
        )}
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[11px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <span>Colder</span>
        {HEAT.map((b) => swatch(b.fill, `FG% ${b.label.toLowerCase()} the league’s around that spot (percentage points)`))}
        <span>Hotter</span>
      </span>
      {!compact && <span className="text-center">than the league around each spot · bigger = more shots</span>}
    </div>
  );
}

/** FG%, points per shot and the league's, under a court. */
export function CourtNumbers({ court, league }: { court: CourtData; league: { fga: number; fgm: number; pts: number } }) {
  const pps = court.pts / Math.max(1, court.fga);
  const lpps = league.pts / Math.max(1, league.fga);
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {[
        ["Shots", court.fga.toLocaleString("en-US"), ""],
        ["FG%", pct(court.fgm / Math.max(1, court.fga)), `league ${pct(league.fgm / Math.max(1, league.fga))}`],
        ["Pts per shot", pps.toFixed(2), `league ${lpps.toFixed(2)}`],
      ].map(([label, value, note]) => (
        <div key={label}>
          <dt className="label-mono">{label}</dt>
          <dd className="mt-0.5 font-mono text-lg tabular-nums text-ink">{value}</dd>
          {note && <dd className="font-mono text-[10px] text-ink-2">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}
