-- Final score per team per game, from every place that reports it.
-- They should all agree; any row with all_match = false needs a look.
with game_log as (
    select game_id, team_abbreviation as team, cast(pts as int) as pts
    from {{ source('raw', 'raw_game_log_team__league_game_log') }}
),
stats_box as (
    select gameId as game_id, teamTricode as team, cast(statistics_points as int) as pts
    from {{ source('raw', 'raw_box_traditional__team') }}
),
cdn_box as (
    select gameId as game_id, teamTricode as team, cast(score as int) as pts
    from {{ source('raw', 'raw_cdn_box__team') }}
),
stats_pbp as (
    select gameId as game_id,
           max(try_cast(scoreHome as int)) as home, max(try_cast(scoreAway as int)) as away
    from {{ source('raw', 'raw_pbp__actions') }} group by 1
),
cdn_pbp as (
    select gameId as game_id,
           max(try_cast(scoreHome as int)) as home, max(try_cast(scoreAway as int)) as away
    from {{ source('raw', 'raw_cdn_pbp__actions') }} group by 1
),
sides as (
    select game_id, team_abbreviation as team, matchup like '%vs.%' as is_home
    from {{ source('raw', 'raw_game_log_team__league_game_log') }}
),
games_in_both as (
    select game_id from stats_box intersect select game_id from cdn_box
)
select
    g.game_id,
    g.team,
    g.pts                                                           as game_log_pts,
    sb.pts                                                          as stats_box_pts,
    cb.pts                                                          as cdn_box_pts,
    case when sd.is_home then sp.home else sp.away end              as stats_pbp_pts,
    case when sd.is_home then cp.home else cp.away end              as cdn_pbp_pts,
    g.pts = sb.pts and g.pts = cb.pts
      and g.pts = (case when sd.is_home then sp.home else sp.away end)
      and g.pts = (case when sd.is_home then cp.home else cp.away end) as all_match
from game_log g
join sides sd       on sd.game_id = g.game_id and sd.team = g.team
left join stats_box sb on sb.game_id = g.game_id and sb.team = g.team
left join cdn_box cb   on cb.game_id = g.game_id and cb.team = g.team
left join stats_pbp sp on sp.game_id = g.game_id
left join cdn_pbp cp   on cp.game_id = g.game_id
where g.game_id in (select game_id from games_in_both)
