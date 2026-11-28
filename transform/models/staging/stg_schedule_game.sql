-- One row per scheduled game (latest pull): what kind of game it is (NBA Cup group or knockout,
-- play-in, playoff round), the teams, seeds and score. Drives the Cup and playoff views and the
-- Lab's NBA Cup fields. Preseason and All-Star games are left out.
with g as (
    select * from {{ source('raw', 'raw_schedule__game_dates_games') }}
    qualify row_number() over (partition by gameId order by _pulled_at desc) = 1
)
select
    gameId                                                       as game_id,
    _season                                                      as season,
    cast(left(gameDateEst, 10) as date)                          as game_date,
    gameDateTimeEst                                              as tipoff_et,
    try_cast(gameStatus as int)                                  as game_status,  -- 1 scheduled, 2 live, 3 final
    gameLabel                                                    as game_label,
    gameSubLabel                                                 as game_sub_label,
    try_cast(seriesGameNumber as varchar)                        as series_game_number,
    seriesText                                                   as series_text,
    coalesce(ifNecessary in ('true', 'True', '1'), false)        as if_necessary,
    -- NBA Cup: group games and the knockout rounds (the final doesn't count toward stats)
    case gameSubtype when 'in-season' then 'Group stage'
                     when 'in-season-knockout' then 'Knockout' end as cup_stage,
    case when gameSubtype = 'in-season' then gameSubLabel end    as cup_group,
    case when gameSubtype = 'in-season-knockout'
         then trim(regexp_replace(gameSubLabel, '^(East|West)\s+', '')) end as cup_round,
    -- playoffs: "West First Round" → conference West, round First Round
    case when gameLabel like 'SoFi Play-In%' or gameLabel like 'Play-In%' then 'Play-In'
         when gameLabel = 'NBA Finals' then 'Finals'
         when gameLabel like '% First Round' then 'First Round'
         when gameLabel like '% Conf. Semifinals' then 'Conf. Semifinals'
         when gameLabel like '% Conf. Finals' then 'Conf. Finals' end as playoff_round,
    case when gameLabel like 'East %' then 'East'
         when gameLabel like 'West %' then 'West'
         when gameLabel like '%Play-In%' then nullif(gameSubLabel, '') end as playoff_conference,
    try_cast(homeTeam_teamId as bigint)                          as home_team_id,
    nullif(homeTeam_teamTricode, '')                             as home_abbr,
    try_cast(homeTeam_score as int)                              as home_score,
    try_cast(homeTeam_seed as int)                               as home_seed,
    try_cast(awayTeam_teamId as bigint)                          as away_team_id,
    nullif(awayTeam_teamTricode, '')                             as away_abbr,
    try_cast(awayTeam_score as int)                              as away_score,
    try_cast(awayTeam_seed as int)                               as away_seed
from g
where gameLabel not in ('Preseason')
  and gameLabel not like 'All-Star%'
  and gameLabel not like 'Rising Stars%'
