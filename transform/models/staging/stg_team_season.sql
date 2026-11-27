-- Conference and division per team per season, plus that season's All-Star game date.
with info as (
    select * from {{ source('raw', 'raw_team_info__team_info_common') }}
    qualify row_number() over (partition by team_id, _season order by _pulled_at desc) = 1
),
all_star as (
    select _season as season, min(cast(left(gameDateEst, 10) as date)) as all_star_date
    from {{ source('raw', 'raw_schedule__game_dates_games') }}
    where gameLabel like 'All-Star%'
    group by 1
)
select
    cast(info.team_id as bigint)    as team_id,
    info._season                    as season,
    info.team_conference            as conference,
    info.team_division              as division,
    all_star.all_star_date
from info
left join all_star on all_star.season = info._season
