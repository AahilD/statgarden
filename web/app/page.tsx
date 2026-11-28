import { cacheLife } from "next/cache";
import Link from "next/link";
import { Mark, Wordmark } from "@/components/layout/Brand";
import { Heading } from "@/components/pages/Parts";
import type { QueryResult } from "@/lib/api";
import { formatValue } from "@/lib/format";
import { encodeSpec, SpecSchema, type PivotSpec } from "@/lib/spec";
import { TONE, type Tone } from "@/lib/tones";
import { queryView } from "@/lib/view.server";


const REG = { field: "season_type", op: "in", value: ["Regular Season"] } as const;
const S2526 = { field: "season", op: "in", value: ["2025-26"] } as const;

// Starter plots: ready-made views to open in the Lab.
const EXAMPLES: {
  title: string;
  blurb: string;
  tone: Tone;
  filters: string; // the filters in words, for the card
  spec: unknown;
}[] = [
  {
    title: "How Harden gets his shots",
    blurb: "James Harden's 2025-26 shots by how they started (drives, pull-ups, step-backs), and how often each went in.",
    tone: "red",
    filters: "James Harden · 2025-26 regular season",
    spec: {
      dataset: "shots",
      filters: [S2526, REG, { field: "player", op: "in", value: ["James Harden"] }],
      rows: ["shot_move"],
      values: [{ field: "fga", mode: "pct_col" }, { field: "fg_pct" }],
      limit: 25,
      chart: { view: "both", type: "bar" },
    },
  },
  {
    title: "Most points since 2024-25",
    blurb: "Regular-season points added up over every season on the site so far, 2024-25 on.",
    tone: "orange",
    filters: "Regular season, every season so far",
    spec: {
      filters: [REG],
      rows: ["player"],
      values: [{ field: "pts", mode: "total" }, { field: "games" }],
      limit: 50,
      chart: { view: "both", type: "bar" },
    },
  },
  {
    title: "Clutch scorers",
    blurb: "Top scorers in games decided by five points or fewer.",
    tone: "blue",
    filters: "Games decided by 5 or fewer · 20+ minutes · 2025-26",
    spec: {
      filters: [S2526, REG, { field: "margin_bucket", op: "in", value: ["Within 5"] }, { field: "min", op: ">=", value: 20 }],
      rows: ["player"],
      values: [{ field: "pts", mode: "per_game" }, { field: "games" }, { field: "ts_pct" }],
      limit: 25,
      chart: { view: "both" },
    },
  },
  {
    title: "Tired legs",
    blurb: "League-wide shooting on zero, one, two and three-plus days of rest.",
    tone: "green",
    filters: "2025-26 regular season",
    spec: {
      filters: [S2526, REG],
      columns: ["rest_days"],
      values: [{ field: "pts", mode: "per_36" }, { field: "ts_pct" }, { field: "games" }],
      chart: { view: "both" },
    },
  },
];

/** The starter cards with their real numbers, for their little bar charts. Kept for an hour. */
async function loadCards() {
  "use cache";
  cacheLife("hours");
  return Promise.all(
    EXAMPLES.map(async (ex) => {
      const spec = SpecSchema.parse(ex.spec);
      return { ...ex, spec, href: `/lab?v=${encodeSpec(spec)}`, result: await queryView(spec) };
    }),
  );
}

export default async function Home() {
  const cards = await loadCards();
  return (
    <div className="px-4">
      {/* Title card: centred and framed twice, Wes Anderson style */}
      <section className="mx-auto max-w-[1100px] pt-8 sm:pt-14">
        <div className="rounded-[14px] border border-line-strong p-1.5 sm:p-2">
          <div className="rounded-[10px] border border-line-strong bg-surface px-5 py-12 text-center sm:px-10 sm:py-16">
            <div className="flex justify-center">
              <Mark size={44} />
            </div>
            <h1 className="mt-6 text-[clamp(2.1rem,8vw,4.75rem)] leading-none">
              <Wordmark />
            </h1>
            <div className="mt-9 flex justify-center">
              <Link href="/lab" className="lift inline-flex items-center rounded-btn bg-orange px-8 py-2.5 font-medium text-on-orange">
                Lab
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Starter plots */}
      <section id="starters" className="mx-auto mt-16 max-w-[1100px] scroll-mt-24">
        <Heading>Starter plots</Heading>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {cards.map((ex) => (
            <Link
              key={ex.title}
              href={ex.href}
              className="lift overflow-hidden rounded-card border border-line bg-surface hover:border-line-strong"
            >
              <div className={`flex h-24 items-end justify-end px-5 pb-3 ${TONE[ex.tone].block}`}>
                {ex.result && <MiniBars result={ex.result} tone={ex.tone} spec={ex.spec} />}
              </div>
              <div className="p-5">
                <h3 className="title-caps text-lg">{ex.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{ex.blurb}</p>
                <Recipe result={ex.result} filters={ex.filters} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** How the plot is built, in the Lab's own words: what's in Values, Rows, Columns and Filters. */
function Recipe({ result, filters }: { result: QueryResult | null; filters: string }) {
  const lines: [string, string, string][] = [];
  const list = (xs: { label: string }[]) => xs.map((x) => x.label).join(", ");
  if (result) {
    lines.push(["Values", list(result.values), "bg-orange"]);
    if (result.row_fields.length) lines.push(["Rows", list(result.row_fields), "bg-blue"]);
    if (result.column_fields.length) lines.push(["Columns", list(result.column_fields), "bg-green"]);
  }
  lines.push(["Filters", filters, "bg-red"]);
  return (
    <dl className="mt-4 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-line pt-3 text-[13px]">
      {lines.map(([k, v, tone]) => (
        <div key={k} className="contents">
          <dt className="flex items-center gap-1.5 font-mono text-[11px] uppercase leading-5 tracking-wide text-ink-2">
            <i aria-hidden className={`h-2 w-2 shrink-0 rounded-[2px] ${tone}`} />
            {k}
          </dt>
          <dd className="leading-5 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const MINI_BARS = 6;

/**
 * The card's little bar chart: the plot's first number for its first few rows, from zero up,
 * in the order the plot shows them. Hover it for the names and numbers.
 */
function MiniBars({ result, tone, spec }: { result: QueryResult; tone: Tone; spec: PivotSpec }) {
  const v = result.values[0];
  const dims = [...result.row_fields, ...result.column_fields];
  if (!v) return null;
  const rows = result.rows
    .map((r) => ({ name: dims.map((f) => String(r[`d_${f.id}`] ?? "")).join(" · "), value: Number(r[v.key]) }))
    .filter((r) => Number.isFinite(r.value))
    .slice(0, MINI_BARS);
  // a plot split across columns (no rows) keeps its natural left-to-right order
  if (spec.rows.length === 0 && result.column_fields[0]?.bins) {
    const order = result.column_fields[0].bins;
    rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length < 2 || max <= 0) return null;
  const title = `${v.label}: ${rows.map((r) => `${r.name} ${formatValue(r.value, v)}`).join(", ")}`;
  return (
    <span role="img" aria-label={title} title={title} className="flex h-16 items-end gap-1.5">
      {rows.map((r) => (
        <i
          key={r.name}
          className={`w-3 rounded-t-[3px] ${tone === "orange" ? "bg-on-orange/30" : "bg-white/35"}`}
          style={{ height: `${Math.max(4, (r.value / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}
