-- One row per shot attempt, with the same game context as the other datasets.
-- fga/fgm/fg3a/fg3m/pts are 0/1 (or 2/3) per shot, so the box score fields add up here too.
select
    s.game_id || '-' || s.event_id                          as shot_key,
    s.player_id,
    s.player_name,
    s.team_id,
    tg.team_abbreviation,
    s.game_id,
    s.game_date,
    tg.season,
    tg.season_type,
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
    s.game_date > ts.all_star_date                          as is_post_all_star,
    bio.age, bio.height_in, bio.position,
    s.period,
    s.clock_seconds,
    s.action_type,
    s.shot_kind,
    s.shot_zone,
    s.shot_area,
    s.shot_distance,
    s.shot_distance                                         as shot_distance_sum,
    1                                                       as charted_fga,
    1                                                       as fga,
    s.made                                                  as fgm,
    s.is_three::int                                         as fg3a,
    s.made * s.is_three::int                                as fg3m,
    s.made * (2 + s.is_three::int)                          as pts
from {{ ref('stg_shot') }} s
join {{ ref('int_team_game_context') }} tg
  on tg.game_id = s.game_id and tg.team_id = s.team_id
join {{ ref('int_team_game_context') }} opp
  on opp.game_id = s.game_id and opp.team_id <> s.team_id
left join {{ ref('stg_team_season') }} ts  on ts.team_id = s.team_id and ts.season = tg.season
left join {{ ref('stg_team_season') }} ots on ots.team_id = opp.team_id and ots.season = tg.season
left join {{ ref('stg_player_season_bio') }} bio on bio.player_id = s.player_id and bio.season = tg.season
