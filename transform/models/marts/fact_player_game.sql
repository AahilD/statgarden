-- The main dataset: one row per player per game, with context, box score,
-- advanced, hustle, tracking, defensive matchup and shot zone columns.
-- Column names match catalog/fields.yaml expressions.
-- Box score extras are left-joined: a game without them just has nulls there.
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
    ts.conference,
    ots.conference                                          as opp_conference,
    p.game_date > ts.all_star_date                          as is_post_all_star,
    sg.cup_stage,
    sg.cup_group,
    bio.age, bio.height_in, bio.weight_lb, bio.position, bio.country, bio.college,
    bio.draft_year, bio.draft_round, bio.draft_number,
    p.min, p.fgm, p.fga, p.fg3m, p.fg3a, p.ftm, p.fta,
    p.oreb, p.dreb, p.reb, p.ast, p.stl, p.blk, p.tov, p.pf, p.pts,
    p.plus_minus,
    b.* exclude (game_id, player_id),
    z.* exclude (game_id, player_id),
    pg.had_clutch,
    pg.had_garbage,
    pp.* exclude (game_id, player_id)
from {{ ref('stg_player_game_log') }} p
join {{ ref('int_team_game_context') }} tg
  on tg.game_id = p.game_id and tg.team_id = p.team_id
join {{ ref('int_team_game_context') }} opp
  on opp.game_id = p.game_id and opp.team_id <> p.team_id
left join {{ ref('stg_schedule_game') }} sg on sg.game_id = p.game_id
left join {{ ref('stg_team_season') }} ts  on ts.team_id = p.team_id and ts.season = p.season
left join {{ ref('stg_team_season') }} ots on ots.team_id = opp.team_id and ots.season = p.season
left join {{ ref('stg_player_season_bio') }} bio on bio.player_id = p.player_id and bio.season = p.season
left join {{ ref('stg_box_player') }} b on b.game_id = p.game_id and b.player_id = p.player_id
left join {{ ref('int_shot_zones') }} z on z.game_id = p.game_id and z.player_id = p.player_id
left join {{ ref('int_pbp_game') }} pg on pg.game_id = p.game_id and pg.team_id = p.team_id
left join {{ ref('int_pbp_player_game') }} pp on pp.game_id = p.game_id and pp.player_id = p.player_id
