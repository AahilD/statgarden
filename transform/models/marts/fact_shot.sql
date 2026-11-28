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
    sg.cup_stage,
    sg.cup_group,
    bio.age, bio.height_in, bio.position,
    s.period,
    s.clock_seconds,
    s.action_type,
    s.shot_kind,
    s.shot_zone,
    s.shot_area,
    s.shot_distance,
    s.shot_distance                                         as shot_distance_sum,
    s.loc_x,
    s.loc_y,
    1                                                       as charted_fga,
    1                                                       as fga,
    s.made                                                  as fgm,
    s.is_three::int                                         as fg3a,
    s.made * s.is_three::int                                as fg3m,
    s.made * (2 + s.is_three::int)                          as pts,
    -- how the shot happened (see int_shot_context)
    case
        when s.action_type ilike '%alley oop%' then 'Alley-oop'
        when s.action_type ilike '%putback%' or s.action_type ilike 'tip %' then 'Putback / tip'
        when s.action_type ilike '%step back%' then 'Step-back'
        when s.action_type ilike '%pull%up%' then 'Pull-up'
        when s.action_type ilike '%turnaround%' or s.action_type ilike '%fadeaway%' then 'Turnaround / fadeaway'
        when s.action_type ilike '%cutting%' then 'Cutting'
        when s.action_type ilike '%driving%' then 'Driving'
        when s.action_type ilike '%running%' then 'Running'
        when s.action_type ilike '%floating%' then 'Floater'
        else 'No move listed'
    end                                                     as shot_move,
    case when s.made = 0 then 'Missed'
         when cx.is_assisted then 'Assisted'
         else 'Unassisted' end                              as assisted,
    cx.is_assisted::int                                     as ast_fgm,
    cx.assister_id,
    ast.player_name                                         as assister_name,
    cx.possession_start,
    cx.secs_into_poss,
    case when cx.is_second_chance then 'Second chance' else 'First chance' end as chance,
    case when fb.game_id is null then 'No data yet'
         when fb.qualifiers like '%fastbreak%' then 'Fast break'
         else 'Not a fast break' end                        as fast_break
from {{ ref('stg_shot') }} s
join {{ ref('int_team_game_context') }} tg
  on tg.game_id = s.game_id and tg.team_id = s.team_id
join {{ ref('int_team_game_context') }} opp
  on opp.game_id = s.game_id and opp.team_id <> s.team_id
left join {{ ref('stg_schedule_game') }} sg on sg.game_id = s.game_id
left join {{ ref('stg_team_season') }} ts  on ts.team_id = s.team_id and ts.season = tg.season
left join {{ ref('stg_team_season') }} ots on ots.team_id = opp.team_id and ots.season = tg.season
left join {{ ref('stg_player_season_bio') }} bio on bio.player_id = s.player_id and bio.season = tg.season
left join {{ ref('int_shot_context') }} cx on cx.game_id = s.game_id and cx.event_id = s.event_id
left join {{ ref('stg_player_game_log') }} ast on ast.game_id = s.game_id and ast.player_id = cx.assister_id
-- NBA.com's own fast-break flag, only in cdn.nba.com play-by-play (filling in game by game)
left join (
    select gameId as game_id, try_cast(actionNumber as integer) as event_id, coalesce(qualifiers, '') as qualifiers
    from {{ source('raw', 'raw_cdn_pbp__actions') }}
    where isFieldGoal = 1
    qualify row_number() over (partition by gameId, actionNumber order by _pulled_at desc) = 1
) fb on fb.game_id = s.game_id and fb.event_id = s.event_id
