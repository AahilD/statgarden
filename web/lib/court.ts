// Shot map data from the API (/court and /player/{id}/shots) and how it's coloured.
// See api/court.py for the coordinates: tenths of a foot from the hoop, pointy-top hexes.

/** [q, r, attempts, makes, points, league FG% from this spot] */
export type Hex = [number, number, number, number, number, number | null];

export type CourtData = {
  key: string | number;
  label: string | null;
  fga: number;
  fgm: number;
  pts: number;
  hexes: Hex[];
};

export type CourtResult = {
  hex: number;
  courts: CourtData[];
  league: { fga: number; fgm: number; pts: number };
  split?: string | null;
};

/** Cold to hot: FG% against the league's from the same spot, in percentage points; five palette colours. */
export const HEAT = [
  { upTo: -0.08, label: "8+ below", fill: "var(--blue)" },
  { upTo: -0.03, label: "3–8 below", fill: "var(--teal)" },
  { upTo: 0.03, label: "Within 3 of", fill: "var(--sand)" },
  { upTo: 0.08, label: "3–8 above", fill: "var(--orange)" },
  { upTo: Infinity, label: "8+ above", fill: "var(--red)" },
] as const;

/** League-average shots a neighbourhood is padded with, so a couple of makes don't read as "hot". */
const PRIOR = 6;

const NEIGHBOURS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

/**
 * For each hex ("q,r"): FG% minus the league's, over the hex and the six around it. The league
 * side is what the league would make on these same shots (each spot's attempts × the league's
 * FG% there), and both are padded with PRIOR league-average shots. One make from deep stays
 * near even; a real hot area still shows. Null when the league has nothing there.
 */
export function heatDiffs(hexes: Hex[]) {
  const at = new Map(hexes.map((h) => [`${h[0]},${h[1]}`, h]));
  const out = new Map<string, number | null>();
  for (const [q, r] of hexes) {
    let n = 0;
    let made = 0;
    let expected = 0;
    for (const [dq, dr] of NEIGHBOURS) {
      const h = at.get(`${q + dq},${r + dr}`);
      if (!h || h[5] == null) continue;
      n += h[2];
      made += h[3];
      expected += h[2] * h[5];
    }
    if (!n) {
      out.set(`${q},${r}`, null);
      continue;
    }
    const lg = expected / n;
    out.set(`${q},${r}`, (made + PRIOR * lg) / (n + PRIOR) - lg);
  }
  return out;
}

export function heatFill(diff: number | null) {
  if (diff == null) return HEAT[2].fill;
  return (HEAT.find((b) => diff < b.upTo) ?? HEAT[4]).fill;
}

/** Hex centre in court units. */
export const centre = (q: number, r: number, s: number) => [s * Math.sqrt(3) * (q + r / 2), s * 1.5 * r] as const;

/** How the court is drawn: dots against the league, or a heat map of attempts or FG%. */
export type CourtMode = "dots" | "fga" | "fg";

export const COURT_MODES: { id: CourtMode; label: string }[] = [
  { id: "dots", label: "Dots" },
  { id: "fga", label: "Heat: attempts" },
  { id: "fg", label: "Heat: FG%" },
];

/**
 * Light red to dark red, all Dusty Rose / Red / Obsidian mixes. Darker = hotter (more shots, or
 * a better FG%), like the hot zones in NBA 2K.
 */
export const REDS = [
  "color-mix(in oklab, #e4a5a2 55%, #fcfcfc)",
  "#e4a5a2",
  "color-mix(in oklab, #e4a5a2, #da3d20)",
  "#da3d20",
  "color-mix(in oklab, #da3d20 62%, #0b0b0c)",
] as const;

/** FG% bands for the heat map (made / attempted around each spot). */
const FG_BANDS = [0.3, 0.4, 0.5, 0.6];
export const FG_LABELS = ["<30%", "30–40", "40–50", "50–60", "60%+"];
/** Attempt bands, as a share of the busiest area (95th percentile, so the rim doesn't swallow the scale). */
const FGA_BANDS = [0.1, 0.25, 0.45, 0.7];

/** Heat map grid: one cell every CELL court units (a foot), each spot's shots spread SIGMA around it. */
export const CELL = 10;
const SIGMA = 24;

/**
 * The heat map as a grid of cells [x, y, step 0–4 in REDS]. Every spot's shots are spread over
 * the cells near it (a Gaussian a couple of feet wide), so the map reads as one smooth surface.
 * FG% is padded with PRIOR league-average shots from that area and left blank where there are
 * barely any shots, so one lucky make doesn't paint a spot dark.
 */
export function heatGrid(hexes: Hex[], s: number, metric: "fga" | "fg") {
  const pts = hexes.map((h) => {
    const [x, y] = centre(h[0], h[1], s);
    return { x, y, n: h[2], made: h[3], lg: h[5] ?? h[3] / Math.max(1, h[2]) };
  });
  const reach = SIGMA * 3;
  const cells: { x: number; y: number; n: number; made: number; exp: number }[] = [];
  for (let y = -45; y <= 420; y += CELL) {
    for (let x = -245; x <= 245; x += CELL) {
      let n = 0;
      let made = 0;
      let exp = 0;
      for (const p of pts) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
        n += p.n * w;
        made += p.made * w;
        exp += p.n * w * p.lg;
      }
      if (n > 0.05) cells.push({ x, y, n, made, exp });
    }
  }
  const step = (v: number, bands: number[]) => bands.filter((b) => v >= b).length;
  if (metric === "fga") {
    const sorted = cells.map((c) => c.n).sort((a, b) => a - b);
    const top = Math.max(0.1, sorted[Math.floor(sorted.length * 0.95)] ?? 0.1);
    return cells.filter((c) => c.n / top >= 0.04).map((c) => [c.x, c.y, step(c.n / top, FGA_BANDS)] as const);
  }
  return cells
    .filter((c) => c.n >= 1.5)
    .map((c) => {
      const lg = c.exp / c.n;
      return [c.x, c.y, step((c.made + PRIOR * lg) / (c.n + PRIOR), FG_BANDS)] as const;
    });
}
