import Link from "next/link";
import { Mark, Wordmark } from "@/components/layout/Brand";
import { encodeSpec, SpecSchema } from "@/lib/spec";

const REG = { field: "season_type", op: "in", value: ["Regular Season"] } as const;
const S2526 = { field: "season", op: "in", value: ["2025-26"] } as const;

// Each colour means the same thing everywhere: it's the colour of that well in the builder.
const TONE = {
  orange: { block: "bg-orange text-on-orange", soft: "bg-orange-soft", bar: "bg-orange" },
  blue: { block: "bg-blue text-on-color", soft: "bg-blue-soft", bar: "bg-blue" },
  green: { block: "bg-green text-on-color", soft: "bg-green-soft", bar: "bg-green" },
  red: { block: "bg-red text-on-color", soft: "bg-red-soft", bar: "bg-red" },
} as const;
type Tone = keyof typeof TONE;

const STEPS: { num: string; well: string; tone: Tone; text: string }[] = [
  { num: "01", well: "Values", tone: "orange", text: "What to count. Points, assists, true shooting, per game or per 36." },
  { num: "02", well: "Rows", tone: "blue", text: "What to group by. Player, team, opponent, month." },
  { num: "03", well: "Columns", tone: "green", text: "What to split across. Home and away, rest days, season." },
  { num: "04", well: "Filters", tone: "red", text: "What to leave out. Close games only, one team, 20+ minutes." },
];

// Starter plots: the example questions from the plan, as ready-made views.
const EXAMPLES: {
  title: string;
  blurb: string;
  tone: Tone;
  recipe: [Tone, string][];
  spec: unknown;
}[] = [
  {
    title: "Nuggets, home vs away",
    blurb: "Points per game and true shooting for every Nuggets player, split by home and away.",
    tone: "orange",
    recipe: [["blue", "Player"], ["green", "Home / away"], ["orange", "PTS/G"], ["orange", "TS%"]],
    spec: {
      filters: [S2526, REG, { field: "team", op: "in", value: ["DEN"] }],
      rows: ["player"],
      columns: ["venue"],
      values: [{ field: "pts", mode: "per_game" }, { field: "ts_pct" }],
      limit: 15,
    },
  },
  {
    title: "Jokić by opponent",
    blurb: "Nikola Jokić's assists per game against every team, most first.",
    tone: "blue",
    recipe: [["red", "Jokić"], ["blue", "Opponent"], ["orange", "AST/G"]],
    spec: {
      filters: [S2526, REG, { field: "player", op: "in", value: ["Nikola Jokić"] }],
      rows: ["opponent"],
      values: [{ field: "ast", mode: "per_game" }, { field: "games" }],
      limit: 30,
    },
  },
  {
    title: "Tired legs",
    blurb: "League-wide shooting on zero, one, two and three-plus days of rest.",
    tone: "green",
    recipe: [["green", "Rest days"], ["orange", "TS%"], ["orange", "PTS/36"]],
    spec: {
      filters: [S2526, REG],
      columns: ["rest_days"],
      values: [{ field: "ts_pct" }, { field: "pts", mode: "per_36" }, { field: "games" }],
    },
  },
  {
    title: "Clutch scorers",
    blurb: "Top scorers in games decided by five points or fewer.",
    tone: "red",
    recipe: [["red", "Within 5"], ["red", "20+ min"], ["blue", "Player"], ["orange", "PTS/G"]],
    spec: {
      filters: [S2526, REG, { field: "margin_bucket", op: "in", value: ["Within 5"] }, { field: "min", op: ">=", value: 20 }],
      rows: ["player"],
      values: [{ field: "pts", mode: "per_game" }, { field: "games" }, { field: "ts_pct" }],
      limit: 25,
    },
  },
];

export default function Home() {
  return (
    <div className="px-4">
      {/* Title card: centred and framed twice, Wes Anderson style */}
      <section className="mx-auto max-w-[1100px] pt-8 sm:pt-14">
        <div className="rounded-[14px] border border-line-strong p-1.5 sm:p-2">
          <div className="relative overflow-hidden rounded-[10px] border border-line-strong bg-surface px-5 pb-12 pt-14 text-center sm:px-10 sm:pb-16 sm:pt-20">
            <Corner className="left-4 top-4">Vol. 01</Corner>
            <Corner className="right-4 top-4">NBA · 2024-25 → now</Corner>
            <Corner className="bottom-4 left-4 hidden sm:block">Free · no sign-up</Corner>
            <Corner className="bottom-4 right-4 hidden sm:block">Est. 2026</Corner>

            <div className="flex justify-center">
              <Mark size={44} />
            </div>
            <h1 className="mt-6 text-[clamp(2.1rem,8vw,4.75rem)] leading-none">
              <Wordmark />
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ink-2">
              Grow your own NBA stats. Drop fields into a table, see exactly how it was worked out, and send the link to a friend.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/explore"
                className="lift inline-flex items-center gap-2 rounded-[8px] bg-orange px-5 py-2.5 font-medium text-on-orange"
              >
                Start exploring <span aria-hidden>→</span>
              </Link>
              <a
                href="#starters"
                className="lift inline-flex items-center rounded-[8px] border border-line-strong px-5 py-2.5 font-medium hover:border-ink-2"
              >
                Try a starter plot
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works: one colour per well, the same colours as the builder */}
      <section className="mx-auto mt-16 max-w-[1100px]">
        <SectionTitle num="I" title="How it grows" />
        <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.num} className={`flex min-h-44 flex-col justify-between rounded-[12px] p-5 ${TONE[s.tone].block}`}>
              <div className="flex items-baseline justify-between">
                <span className="title-caps text-2xl">{s.well}</span>
                <span className="font-mono text-sm opacity-80">{s.num}</span>
              </div>
              <p className="mt-6 text-[15px] leading-snug opacity-90">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Starter plots */}
      <section id="starters" className="mx-auto mt-16 max-w-[1100px] scroll-mt-24">
        <SectionTitle num="II" title="Starter plots" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {EXAMPLES.map((ex, i) => (
            <Link
              key={ex.title}
              href={`/explore?v=${encodeSpec(SpecSchema.parse(ex.spec))}`}
              className="lift group overflow-hidden rounded-[12px] border border-line bg-surface hover:border-line-strong"
            >
              <div className={`relative flex h-24 items-end justify-between px-5 pb-3 ${TONE[ex.tone].block}`}>
                <span className="font-mono text-xs uppercase tracking-[0.12em] opacity-85">Plot {String(i + 1).padStart(2, "0")}</span>
                <PlotBars tone={ex.tone} seed={i} />
              </div>
              <div className="p-5">
                <h3 className="title-caps text-lg">{ex.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{ex.blurb}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {ex.recipe.map(([tone, label]) => (
                    <span key={label} className={`rounded-[6px] px-2 py-0.5 font-mono text-[11px] ${TONE[tone].block}`}>
                      {label}
                    </span>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent-ink">
                  Open it <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Corner({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`label-mono absolute ${className}`}>{children}</span>;
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-line-strong" />
      <h2 className="title-caps flex items-baseline gap-3 text-lg">
        <span className="font-mono text-xs text-accent-ink">{num}</span>
        {title}
      </h2>
      <span className="h-px flex-1 bg-line-strong" />
    </div>
  );
}

/** A little decorative bar chart in the card header (white bars on the card colour). */
function PlotBars({ tone, seed }: { tone: Tone; seed: number }) {
  const heights = [[40, 70, 55, 90, 65], [85, 60, 72, 45, 30], [55, 62, 70, 78, 88], [30, 80, 45, 95, 60]][seed % 4];
  return (
    <span aria-hidden className="flex h-16 items-end gap-1.5">
      {heights.map((h, i) => (
        <i
          key={i}
          className={`w-3 rounded-t-[3px] ${tone === "orange" ? "bg-on-orange/25" : "bg-white/30"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </span>
  );
}
