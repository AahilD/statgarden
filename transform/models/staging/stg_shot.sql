-- One row per shot attempt (ShotChartDetail), with a few cleaner groupings.
select
    game_id,
    cast(game_event_id as integer)                                  as event_id,
    cast(player_id as bigint)                                       as player_id,
    player_name,
    cast(team_id as bigint)                                         as team_id,
    cast(period as integer)                                         as period,
    cast(minutes_remaining as integer) * 60
        + cast(seconds_remaining as integer)                        as clock_seconds,
    action_type,
    case
        when action_type ilike '%dunk%' then 'Dunk'
        when action_type ilike '%layup%' or action_type ilike '%finger roll%' then 'Layup'
        when action_type ilike '%tip%' or action_type ilike '%putback%' then 'Tip / putback'
        when action_type ilike '%hook%' then 'Hook'
        when action_type ilike '%floating%' or action_type ilike '%floater%' then 'Floater'
        else 'Jump shot'
    end                                                             as shot_kind,
    shot_type = '3PT Field Goal'                                    as is_three,
    case
        when shot_zone_basic in ('Left Corner 3', 'Right Corner 3') then 'Corner 3'
        when shot_zone_basic = 'In The Paint (Non-RA)' then 'Paint (non-RA)'
        else shot_zone_basic
    end                                                             as shot_zone,
    regexp_replace(shot_zone_area, '\s*\(.*\)$', '')                as shot_area,
    cast(shot_distance as integer)                                  as shot_distance,
    cast(shot_made_flag as integer)                                 as made,
    strptime(game_date, '%Y%m%d')::date                             as game_date
from {{ source('raw', 'raw_shots__shot_chart_detail') }}
qualify row_number() over (partition by game_id, game_event_id order by _pulled_at desc) = 1
