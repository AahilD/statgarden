{{ config(materialized='table') }}
-- Play-by-play (stats.nba.com V3) with the score margin going into each play, and which
-- situation the play happened in:
--   clutch       : last 5 minutes of the 4th quarter or overtime, score within 5 (NBA.com's definition)
--   garbage time : 4th quarter, lead of 25+ with 9-12 minutes left, 20+ with 6-9, 15+ under 6.
--                  A rough rule of thumb, not an official one.
with a as (
    select
        gameId                                                          as game_id,
        try_cast(actionNumber as integer)                               as n,
        try_cast(actionId as integer)                                   as action_id,
        try_cast(period as integer)                                     as period,
        coalesce(try_cast(regexp_extract(clock, 'PT(\d+)M', 1) as integer), 0) * 60
          + coalesce(try_cast(regexp_extract(clock, 'M([\d.]+)S', 1) as double), 0) as secs_left,
        try_cast(personId as bigint)                                    as player_id,
        try_cast(nullif(teamId, '') as bigint)                          as team_id,
        actionType                                                      as action_type,
        shotValue                                                       as shot_value,
        description,
        try_cast(nullif(scoreHome, '') as integer)                      as score_home,
        try_cast(nullif(scoreAway, '') as integer)                      as score_away
    from {{ source('raw', 'raw_pbp__actions') }}
    qualify row_number() over (partition by gameId, actionId order by _pulled_at desc) = 1
),
scored as (
    select
        *,
        coalesce(last_value(score_home ignore nulls) over w, 0)
          - coalesce(last_value(score_away ignore nulls) over w, 0)     as margin_before
    from a
    window w as (partition by game_id order by n, action_id rows between unbounded preceding and 1 preceding)
)
select
    game_id,
    player_id,
    team_id,
    period,
    secs_left,
    abs(margin_before)                                                  as margin_before,
    period >= 4 and secs_left <= 300 and abs(margin_before) <= 5        as is_clutch,
    period = 4 and (
        (secs_left > 540 and abs(margin_before) >= 25)
        or (secs_left > 360 and secs_left <= 540 and abs(margin_before) >= 20)
        or (secs_left <= 360 and abs(margin_before) >= 15)
    )                                                                   as is_garbage,
    -- what the play was worth, per player
    case when action_type = 'Made Shot' then try_cast(shot_value as integer)
         when action_type = 'Free Throw' and description not like 'MISS%' then 1
         else 0 end                                                     as pts,
    (action_type in ('Made Shot', 'Missed Shot'))::int                  as fga,
    (action_type = 'Made Shot')::int                                    as fgm,
    (action_type in ('Made Shot', 'Missed Shot') and shot_value = '3')::int as fg3a,
    (action_type = 'Made Shot' and shot_value = '3')::int               as fg3m,
    (action_type = 'Free Throw')::int                                   as fta,
    (action_type = 'Free Throw' and description not like 'MISS%')::int  as ftm,
    (action_type = 'Rebound')::int                                      as reb,
    (action_type = 'Turnover')::int                                     as tov,
    (action_type = '' and description like '% STEAL (%')::int          as stl,
    (action_type = '' and description like '% BLOCK (%')::int          as blk
from scored
where action_type not in ('period', 'Substitution', 'Timeout', 'Instant Replay')
