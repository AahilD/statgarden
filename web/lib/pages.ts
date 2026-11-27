// Player, team and glossary pages: their API shapes, a server-side fetch, and number formatting.
// Server only for apiGet (it talks to FastAPI directly); the types and formatters work anywhere.

const API_URL = process.env.STATGARDEN_API_URL ?? "http://localhost:8000";

/** GET from the API on the server. null for a 404 (the page shows "not found"); throws otherwise. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const r = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export type BoxTotals = {
  gp: number;
  min: number;
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  plus_minus: number;
  fg_pct: number | null;
  fg3_pct: number | null;
  ft_pct: number | null;
  ts_pct: number | null;
};

export type SeasonType = "Regular Season" | "Play-In" | "Playoffs";

export type PlayerPage = {
  player: {
    id: number;
    player_name: string;
    team: string;
    team_id: number;
    team_name: string | null;
    first_game: string;
    last_game: string;
    first_season: string;
    last_season: string;
    age: number | null;
    height_in: number | null;
    weight_lb: number | null;
    position: string | null;
    country: string | null;
    college: string | null;
    draft_year: number | null;
    draft_round: number | null;
    draft_number: number | null;
  };
  seasons: (BoxTotals & { season: string; season_type: SeasonType; teams: string })[];
  career: (BoxTotals & { season_type: SeasonType })[];
  games: GameLine[];
  highs: Record<"pts" | "reb" | "ast" | "fg3m", High | null>;
};

export type GameLine = {
  game_id: string;
  game_date: string;
  season: string;
  season_type: SeasonType;
  team: string;
  opp: string;
  is_home: boolean;
  is_win: boolean;
  margin: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  plus_minus: number;
};

export type High = { value: number; game_date: string; opp: string; is_home: boolean; season_type: SeasonType };

export type TeamPage = {
  team: { id: number; abbr: string; name: string; season: string; conference?: string; division?: string };
  standing: {
    conference: string;
    playoff_rank: string;
    division: string;
    division_rank: string;
    record: string;
    home: string;
    road: string;
    l10: string;
    streak: string;
  } | null;
  seasons: {
    season: string;
    season_type: SeasonType;
    team: string;
    gp: number;
    wins: number;
    losses: number;
    pts: number;
    opp_pts: number;
    off_rtg: number | null;
    def_rtg: number | null;
    net_rtg: number | null;
    pace: number | null;
    fg3a_rate: number | null;
    ts_pct: number | null;
  }[];
  roster: (BoxTotals & {
    player_id: number;
    player: string;
    last_game: string;
    position: string | null;
    age: number | null;
    still_here: boolean;
  })[];
  games: {
    game_id: string;
    game_date: string;
    season_type: SeasonType;
    opp: string;
    is_home: boolean;
    is_win: boolean;
    pts: number;
    opp_pts: number;
  }[];
};

export type TeamListItem = {
  id: number;
  abbr: string;
  name: string;
  conference: string | null;
  division: string | null;
  wins: number;
  losses: number;
};

export type GlossaryField = {
  id: string;
  label: string;
  short: string;
  group: string;
  kind: "dimension" | "measure";
  description: string;
  formula: string | null;
  format: string | null;
  higher_is_better: boolean | null;
  datasets: string[];
  available: boolean;
};

// ── formatting ──────────────────────────────────────────────────────────────

const MINUS = "−";

/** Per game, one decimal: 24.6. */
export const perGame = (total: number | null | undefined, gp: number) =>
  total == null || !gp ? "—" : (total / gp).toFixed(1).replace("-", MINUS);

/** A share as a percentage: 61.3%. */
export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

/** One decimal, with a real minus sign. */
export const num1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1).replace("-", MINUS));

/** +5.2 / −3.1 */
export const signed = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(digits)}`;

/** 83 → 6′11″ */
export const height = (inches: number | null) =>
  inches == null ? null : `${Math.floor(inches / 12)}′${Math.round(inches % 12)}″`;

/** 2026-11-24 → Nov 24 (with the year when it isn't this season's) */
export function shortDate(iso: string, withYear = false) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

/** Short season type for tight columns. */
export const TYPE_SHORT: Record<SeasonType, string> = {
  "Regular Season": "Reg",
  "Play-In": "Play-In",
  Playoffs: "Playoffs",
};

/** 1 → 1st, 2 → 2nd, 11 → 11th */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
