-- stats.nba.com vs cdn.nba.com, one row per player per game that either source has.
-- Flags every field where the two disagree. Nothing is picked as "right" here.
with stats as (
    select
        gameId                                          as game_id,
        cast(personId as bigint)                        as player_id,
        teamTricode                                     as team,
        firstName || ' ' || familyName                  as player_name,
        case when statistics_minutes like '%:%'
             then cast(split_part(statistics_minutes, ':', 1) as int) * 60
                + cast(split_part(statistics_minutes, ':', 2) as int)
             else 0 end                                 as seconds,
        cast(statistics_points as int)                  as pts,
        cast(statistics_reboundsTotal as int)           as reb,
        cast(statistics_assists as int)                 as ast,
        cast(statistics_fieldGoalsAttempted as int)     as fga,
        cast(statistics_turnovers as int)               as tov
    from {{ source('raw', 'raw_box_traditional__team_players') }}
),
cdn as (
    select
        gameId                                          as game_id,
        cast(personId as bigint)                        as player_id,
        teamTricode                                     as team,
        firstName || ' ' || familyName                  as player_name,
        coalesce(cast(regexp_extract(statistics_minutes, 'PT(\d+)M', 1) as int), 0) * 60
          + coalesce(cast(regexp_extract(statistics_minutes, 'M([\d.]+)S', 1) as double), 0)
                                                        as seconds,
        cast(statistics_points as int)                  as pts,
        cast(statistics_reboundsTotal as int)           as reb,
        cast(statistics_assists as int)                 as ast,
        cast(statistics_fieldGoalsAttempted as int)     as fga,
        cast(statistics_turnovers as int)               as tov
    from {{ source('raw', 'raw_cdn_box__team_players') }}
),
-- only compare games both sources have pulled
both_games as (
    select distinct s.game_id from stats s join cdn c using (game_id)
)
select
    coalesce(s.game_id, c.game_id)                      as game_id,
    coalesce(s.player_id, c.player_id)                  as player_id,
    coalesce(s.player_name, c.player_name)              as player_name,
    coalesce(s.team, c.team)                            as team,
    s.player_id is not null                             as in_stats,
    c.player_id is not null                             as in_cdn,
    s.pts as stats_pts, c.pts as cdn_pts,
    s.reb as stats_reb, c.reb as cdn_reb,
    s.ast as stats_ast, c.ast as cdn_ast,
    s.fga as stats_fga, c.fga as cdn_fga,
    s.tov as stats_tov, c.tov as cdn_tov,
    s.seconds as stats_seconds, round(c.seconds) as cdn_seconds,
    -- a player who didn't play has zeros in cdn and no row (or a comment) in stats
    (coalesce(s.pts, 0) <> coalesce(c.pts, 0)
     or coalesce(s.reb, 0) <> coalesce(c.reb, 0)
     or coalesce(s.ast, 0) <> coalesce(c.ast, 0)
     or coalesce(s.fga, 0) <> coalesce(c.fga, 0)
     or coalesce(s.tov, 0) <> coalesce(c.tov, 0))       as box_differs,
    abs(coalesce(s.seconds, 0) - coalesce(c.seconds, 0)) > 60
                                                        as minutes_differ
from stats s
full outer join cdn c on s.game_id = c.game_id and s.player_id = c.player_id
where coalesce(s.game_id, c.game_id) in (select game_id from both_games)
