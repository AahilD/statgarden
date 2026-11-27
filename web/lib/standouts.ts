// Which scatter points get a name when nobody picked them: the standouts.
//
// Each axis is measured in "how unusual" units (distance from the average, divided by
// the usual spread), so a tight stat like TS% counts as much as a wide one like points.
// Direction comes from "better is": higher, lower, or either way when neither is better.
// We name the best one on each axis on its own (so a one-skill outlier gets a label),
// then fill up with the best on both together.

export type Direction = "higher" | "lower" | "none";
type Point = { name: string; x: number; y: number };

const COUNT = 6;
const NAME_ALL_UP_TO = 8; // a handful of points: just name them all

export function standouts(points: Point[], dir: { x: Direction; y: Direction }, count = COUNT): string[] {
  if (points.length <= Math.max(count, NAME_ALL_UP_TO)) return points.map((p) => p.name);
  const zx = unusual(points.map((p) => p.x), dir.x);
  const zy = unusual(points.map((p) => p.y), dir.y);
  const order = (score: (i: number) => number) =>
    points.map((_, i) => i).sort((a, b) => score(b) - score(a));

  const out = new Set<string>();
  out.add(points[order((i) => zx[i])[0]].name);
  out.add(points[order((i) => zy[i])[0]].name);
  for (const i of order((i) => zx[i] + zy[i])) {
    if (out.size >= count) break;
    out.add(points[i].name);
  }
  return [...out];
}

/** How far each value is from the average in the good direction, in spreads. */
function unusual(vs: number[], dir: Direction): number[] {
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length) || 1;
  return vs.map((v) => {
    const z = (v - mean) / sd;
    return dir === "higher" ? z : dir === "lower" ? -z : Math.abs(z);
  });
}
