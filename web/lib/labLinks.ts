// Ready-made Lab views for the player and team pages: "dig deeper" opens the Lab already built.
import { encodeSpec, SpecSchema } from "./spec";
import type { Tone } from "./tones";

type Link = { label: string; href: string; tone: Tone };

const REG = { field: "season_type", op: "in", value: ["Regular Season"] };
const inSeason = (season: string) => ({ field: "season", op: "in", value: [season] });
// line charts read left to right in time, so these views sort by date or season, not by the first number
const BY_DATE = [{ by: "game_date", dir: "asc" }];
const BY_SEASON = [{ by: "season", dir: "asc" }];
// the usual numbers for a list of players or teams
const PLAYER_LINE = [{ field: "pts", mode: "per_game" }, { field: "games" }, { field: "ts_pct" }];
const TEAM_LINE = [{ field: "pts", mode: "per_game" }, { field: "net_rtg" }, { field: "pace" }];
const lab = (spec: unknown) => `/lab?v=${encodeSpec(SpecSchema.parse(spec))}`;

export function playerLinks(name: string, season: string): Link[] {
  const who = { field: "player", op: "in", value: [name] };
  return [
    {
      label: "Season by season",
      tone: "orange",
      href: lab({
        filters: [who, REG],
        rows: ["season"],
        values: [{ field: "pts", mode: "per_game" }, { field: "reb", mode: "per_game" }, { field: "ast", mode: "per_game" }, { field: "ts_pct" }],
        sort: BY_SEASON,
        chart: { view: "both", type: "line" },
      }),
    },
    {
      label: `${season} game log`,
      tone: "blue",
      href: lab({
        filters: [who, inSeason(season)],
        rows: ["game_date", "opponent"],
        values: [{ field: "pts" }, { field: "reb" }, { field: "ast" }, { field: "ts_pct" }],
        sort: BY_DATE,
        limit: 100,
        chart: { view: "both", type: "line" },
      }),
    },
    {
      label: `${season} shots by zone`,
      tone: "green",
      href: lab({
        dataset: "shots",
        filters: [who, inSeason(season), REG],
        rows: ["shot_zone"],
        values: [{ field: "fga", mode: "pct_col" }, { field: "fg_pct" }],
        chart: { view: "both", type: "bar" },
      }),
    },
    {
      label: `${season} shot map`,
      tone: "red",
      href: lab({
        dataset: "shots",
        filters: [who, inSeason(season), REG],
        rows: ["player"],
        values: [{ field: "fga" }, { field: "fg_pct" }, { field: "efg_pct" }],
        chart: { view: "both", type: "court" },
      }),
    },
  ];
}

export function teamLinks(abbr: string, season: string): Link[] {
  const team = { field: "team", op: "in", value: [abbr] };
  return [
    {
      label: `${season} players`,
      tone: "orange",
      href: lab({
        filters: [team, inSeason(season), REG],
        rows: ["player"],
        values: PLAYER_LINE,
        chart: { view: "both", type: "bar" },
      }),
    },
    {
      label: `${season} game by game`,
      tone: "blue",
      href: lab({
        dataset: "team_game",
        filters: [team, inSeason(season)],
        rows: ["game_date", "opponent"],
        values: [{ field: "pts" }, { field: "net_rtg" }, { field: "pace" }],
        sort: BY_DATE,
        limit: 100,
        chart: { view: "both", type: "line" },
      }),
    },
    {
      label: "Season by season",
      tone: "green",
      href: lab({
        dataset: "team_game",
        filters: [team, REG],
        rows: ["season"],
        values: TEAM_LINE,
        sort: BY_SEASON,
        chart: { view: "both", type: "line" },
      }),
    },
    {
      label: `${season} shot map`,
      tone: "red",
      href: lab({
        dataset: "shots",
        filters: [team, inSeason(season), REG],
        rows: ["team"],
        values: [{ field: "fga" }, { field: "fg_pct" }, { field: "efg_pct" }],
        chart: { view: "both", type: "court" },
      }),
    },
  ];
}

const CUP = { field: "cup_stage", op: "in", value: ["Group stage", "Knockout"] };

/** NBA Cup views for the teams page: player and team stats in Cup games, and every Cup game. */
export function cupLinks(season: string): Link[] {
  return [
    {
      label: `${season} Cup player stats`,
      tone: "orange",
      href: lab({
        filters: [inSeason(season), CUP],
        rows: ["player"],
        values: PLAYER_LINE,
        sort: [{ by: "pts", dir: "desc" }],
        limit: 100,
        chart: { view: "both", type: "bar" },
      }),
    },
    {
      label: `${season} Cup team stats`,
      tone: "blue",
      href: lab({
        dataset: "team_game",
        filters: [inSeason(season), CUP],
        rows: ["team"],
        values: TEAM_LINE,
        sort: [{ by: "net_rtg", dir: "desc" }],
        chart: { view: "both", type: "bar" },
      }),
    },
    {
      label: `${season} Cup games`,
      tone: "green",
      href: lab({
        dataset: "team_game",
        filters: [inSeason(season), CUP],
        rows: ["game_date", "team", "opponent"],
        sort: BY_DATE,
        values: [{ field: "pts" }, { field: "plus_minus" }],
        limit: 200,
        chart: { view: "table", type: "auto" },
      }),
    },
  ];
}

/** Playoff player and team stats for one season. */
export function playoffLinks(season: string): Link[] {
  const PO = { field: "season_type", op: "in", value: ["Playoffs"] };
  return [
    {
      label: `${season} playoff player stats`,
      tone: "orange",
      href: lab({
        filters: [inSeason(season), PO],
        rows: ["player"],
        values: PLAYER_LINE,
        sort: [{ by: "pts", dir: "desc" }],
        limit: 100,
        chart: { view: "both", type: "bar" },
      }),
    },
    {
      label: `${season} playoff team stats`,
      tone: "blue",
      href: lab({
        dataset: "team_game",
        filters: [inSeason(season), PO],
        rows: ["team"],
        values: TEAM_LINE,
        sort: [{ by: "net_rtg", dir: "desc" }],
        chart: { view: "both", type: "bar" },
      }),
    },
  ];
}
