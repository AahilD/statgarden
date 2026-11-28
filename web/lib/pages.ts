// Player, team and glossary pages: their API shapes, a server-side fetch, and number formatting.
// Server only for apiGet (it talks to FastAPI directly); the types and formatters work anywhere.

const API_URL = process.env.STATGARDEN_API_URL ?? "http://localhost:8000";

/** GET from the API on the server. null for a 404 (the page shows "not found"); throws otherwise. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const r = await fetchOnceMore(`${API_URL}${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** One retry after a short wait: the API restarts in a second or two (nightly publish, dev reloads). */
async function fetchOnceMore(url: string) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return fetch(url, { signal: AbortSignal.timeout(8000) });
  }
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

export type SeasonType = "Regular Season" | "Play-In" | "Playoffs" | "NBA Cup";

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
  highs: Record<"pts" | "reb" | "ast" | "stl" | "blk" | "fg3m", High | null>;
};

export type GameLine = {
  game_id: string;
  game_date: string;
  season: string;
  season_type: SeasonType;
  cup_stage: "Group stage" | "Knockout" | null;
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

export type High = { value: number; game_id: string; game_date: string; opp: string; is_home: boolean; season_type: SeasonType };

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
    cup_stage: "Group stage" | "Knockout" | null;
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
  pts: number | null;
  opp_pts: number | null;
  net_rtg: number | null;
  home: string | null;
  road: string | null;
  l10: string | null;
  streak: string | null;
  conf_record: string | null;
  playoff_rank: number | null; // NBA.com's conference seed, used to break ties in win %
};

export type GamePlayer = {
  team_id: number;
  player_id: number;
  player: string;
  is_starter: boolean;
  pos: string | null;
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
  plus_minus: number | null;
};

export type GameTeam = Omit<GamePlayer, "player_id" | "player" | "is_starter" | "pos" | "min" | "plus_minus"> & {
  abbr: string;
  name: string | null;
  is_home: boolean;
  is_win: boolean;
  season: string;
  season_type: SeasonType;
  game_date: string;
  poss: number | null;
  pace: number | null;
  off_rtg: number | null;
  pts_paint: number | null;
  pts_fast_break: number | null;
  pts_2nd_chance: number | null;
  pts_off_tov: number | null;
  ts_pct: number | null;
  periods: { period: number; ot: boolean; pts: number }[];
  players: GamePlayer[];
  inactive: string[];
};

export type GamePage = {
  game: {
    id: string;
    date: string;
    season: string;
    season_type: SeasonType;
    tipoff?: string | null; // Eastern wall-clock time, written with a (wrong) Z
    duration?: string | null;
    attendance?: number | null;
    sellout?: boolean | null;
    label?: string | null;
    sub_label?: string | null;
    series?: string | null;
    arena?: string | null;
    city?: string | null;
    state?: string | null;
    officials: string[];
  };
  away: GameTeam;
  home: GameTeam;
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

/** "2025-11-01T22:00:00Z" (Eastern time, despite the Z) → "10:00 PM ET" */
export function easternTime(et: string | null | undefined) {
  const m = et?.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"} ET`;
}

/** 1 → 1st, 2 → 2nd, 11 → 11th */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** The small tag on a game: Playoffs, Play-In or NBA Cup; nothing for a plain regular-season game. */
export function gameTag(g: { season_type: SeasonType; cup_stage?: string | null }) {
  if (g.season_type === "Playoffs") return "Playoffs";
  if (g.season_type === "Play-In") return "Play-In";
  if (g.cup_stage) return g.cup_stage === "Knockout" ? "Cup KO" : "Cup";
  return null;
}
