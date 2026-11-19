-- The main dataset: one row per player per game, with context fields.
-- Column names match catalog/fields.yaml expressions.
select
    p.player_id || '-' || p.game_id                         as player_game_key,
    p.player_id,
    p.player_name,
    p.team_id,
    p.team_abbreviation,
    p.game_id,
    p.game_date,
    p.season,
    p.season_type,
    tg.is_home,
    tg.is_win,
    tg.margin,
    tg.game_number,
    tg.rest_days,
    opp.team_id                                             as opp_team_id,
    opp.team_abbreviation                                   as opp_abbreviation,
    opp.wins_before / nullif(opp.games_before, 0)           as opp_win_pct_before,
    p.min, p.fgm, p.fga, p.fg3m, p.fg3a, p.ftm, p.fta,
    p.oreb, p.dreb, p.reb, p.ast, p.stl, p.blk, p.tov, p.pf, p.pts,
    p.plus_minus
from {{ ref('stg_player_game_log') }} p
join {{ ref('int_team_game_context') }} tg
  on tg.game_id = p.game_id and tg.team_id = p.team_id
join {{ ref('int_team_game_context') }} opp
  on opp.game_id = p.game_id and opp.team_id <> p.team_id
