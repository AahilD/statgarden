-- Final score per team per game, from every place that reports it.
-- They should all agree; any row with all_match = false needs a look.
--
-- Decision (2026-11-27): stats.nba.com wins. The site's scores come from the
-- stats game log, which matched the stats box score in every game checked.
-- cdn.nba.com is only used for shot details. Known cdn miss: WAS in
-- 0022500029 (cdn box 114, everywhere else 115).
--
-- Home/away comes from the box summary (its `side`), not the game log's
-- "vs." matchup: for neutral-site games (Mexico City, NBA Cup in Las Vegas)
-- the two disagree, and the play-by-play's scoreHome follows the box summary.
with game_log as (
    select game_id, team_abbreviation as team, cast(pts as int) as pts,
           matchup like '%vs.%' as log_says_home
    from {{ source('raw', 'raw_game_log_team__league_game_log') }}
),
summary_sides as (
    select gameId as game_id, teamTricode as team, side = 'home' as is_home
    from {{ source('raw', 'raw_box_summary__team') }}
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
games_in_both as (
    select game_id from stats_box intersect select game_id from cdn_box
),
joined as (
    select
        g.game_id,
        g.team,
        coalesce(ss.is_home, g.log_says_home)                       as is_home,
        g.pts                                                       as game_log_pts,
        sb.pts                                                      as stats_box_pts,
        cb.pts                                                      as cdn_box_pts,
        case when coalesce(ss.is_home, g.log_says_home) then sp.home else sp.away end as stats_pbp_pts,
        case when coalesce(ss.is_home, g.log_says_home) then cp.home else cp.away end as cdn_pbp_pts
    from game_log g
    left join summary_sides ss on ss.game_id = g.game_id and ss.team = g.team
    left join stats_box sb     on sb.game_id = g.game_id and sb.team = g.team
    left join cdn_box cb       on cb.game_id = g.game_id and cb.team = g.team
    left join stats_pbp sp     on sp.game_id = g.game_id
    left join cdn_pbp cp       on cp.game_id = g.game_id
    where g.game_id in (select game_id from games_in_both)
)
select
    *,
    game_log_pts = stats_box_pts and game_log_pts = cdn_box_pts
      and game_log_pts = stats_pbp_pts and game_log_pts = cdn_pbp_pts as all_match,
    game_log_pts                                                      as chosen_pts,
    'stats.nba.com game log'                                          as chosen_from
from joined
