// NBA Cup and playoffs from the API (/cup, /playoffs in api/brackets.py).

/** One side of a scheduled game; score only once it's final. abbr is null while the team is TBD. */
export type BTeam = { id: number | null; abbr: string | null; name: string | null; seed: number | null; score: number | null };
export type BGame = { game_id: string | null; date: string | null; status: number; home: BTeam; away: BTeam };

export type CupTeam = {
  id: number;
  abbr: string;
  name: string | null;
  w: number;
  l: number;
  pf: number;
  pa: number;
  diff: number;
  rank: number;
  /** winner / wildcard once the group stage is over; leader / wildcard_lead while it's still on */
  status: "winner" | "leader" | "wildcard" | "wildcard_lead" | null;
};
export type CupGroup = { name: string; conference: "East" | "West"; done: boolean; teams: CupTeam[]; games: BGame[] };
/** A knockout slot: the real game once both teams are known, else who'd be there (abbr null = TBD). */
export type CupSlot = {
  round: "Quarterfinal" | "Semifinal" | "Championship";
  conference: "East" | "West" | null;
  game_id: string | null;
  date: string | null;
  /** last day, when the round is spread over more than one and the slot's game isn't known yet */
  date_to: string | null;
  status: number;
  top: BTeam;
  bottom: BTeam;
};
export type CupData = { season: string | null; seasons: string[]; groups: CupGroup[]; knockout: CupSlot[] };

export type SeriesTeam = { id: number; abbr: string; name: string | null; seed: number | null; wins: number; playin?: boolean };
export type Series = { top: SeriesTeam; bottom: SeriesTeam; winner: string | null; games: number };
/** rounds: first round (4, top to bottom 1v8, 4v5, 3v6, 2v7), conference semis (2), conference finals (1) */
export type PlayoffConference = { name: "East" | "West"; playin: BGame[]; rounds: (Series | null)[][] };
export type PlayoffData = {
  season: string;
  seasons: string[];
  /** true before the playoffs start: the bracket "if the season ended today" */
  projected: boolean;
  conferences: PlayoffConference[];
  finals: Series | null;
};

export const FINAL = 3;

/** "OKC wins 4–1", "NYK leads 2–1", "Tied 2–2", or "" before it starts. */
export function seriesLine(s: Series) {
  const [a, b] = [s.top, s.bottom].sort((x, y) => y.wins - x.wins);
  if (s.winner) return `${s.winner} wins ${a.wins}–${b.wins}`;
  if (!s.games) return "";
  return a.wins === b.wins ? `Tied ${a.wins}–${b.wins}` : `${a.abbr} leads ${a.wins}–${b.wins}`;
}
