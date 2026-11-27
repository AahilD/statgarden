-- One row per defender, per player they guarded, per game (box score matchups).
-- player_* is the defender; attacker_* is who they guarded. In the raw table
-- personId is the defender, parent_personId the attacker and teamId the attacker's team.
with m as (
    select * from {{ source('raw', 'raw_box_matchups__team_players_matchups') }}
    qualify row_number() over (partition by gameId, personId, parent_personId order by _pulled_at desc) = 1
),
names as (
    select cast(personId as bigint) as player_id,
           arg_max(trim(firstName || ' ' || familyName), _pulled_at) as player_name
    from {{ source('raw', 'raw_box_traditional__team_players') }}
    group by 1
)
select
    m.gameId || '-' || m.personId || '-' || m.parent_personId      as matchup_key,
    cast(m.personId as bigint)                                      as player_id,
    trim(m.firstName || ' ' || m.familyName)                        as player_name,
    d.team_id,
    d.team_abbreviation,
    cast(m.parent_personId as bigint)                               as attacker_id,
    an.player_name                                                  as attacker_name,
    a.team_id                                                       as opp_team_id,
    a.team_abbreviation                                             as opp_abbreviation,
    m.gameId                                                        as game_id,
    d.game_date,
    d.season,
    d.season_type,
    d.is_home,
    d.is_win,
    d.margin,
    d.game_number,
    d.rest_days,
    a.wins_before / nullif(a.games_before, 0)                       as opp_win_pct_before,
    ts.conference,
    ots.conference                                                  as opp_conference,
    d.game_date > ts.all_star_date                                  as is_post_all_star,
    bio.age, bio.height_in, bio.position,
    abio.height_in                                                  as attacker_height_in,
    abio.position                                                   as attacker_position,
    {{ mins('m.statistics_matchupMinutes') }}                       as matchup_min,
    {{ num('m.statistics_partialPossessions') }}                    as matchup_poss,
    {{ num('m.statistics_switchesOn') }}                            as switches_on,
    {{ num('m.statistics_playerPoints') }}                          as matchup_pts,
    {{ num('m.statistics_matchupAssists') }}                        as matchup_ast,
    {{ num('m.statistics_matchupTurnovers') }}                      as matchup_tov,
    {{ num('m.statistics_matchupBlocks') }}                         as matchup_blk,
    {{ num('m.statistics_matchupFieldGoalsMade') }}                 as matchup_fgm,
    {{ num('m.statistics_matchupFieldGoalsAttempted') }}            as matchup_fga,
    {{ num('m.statistics_matchupThreePointersMade') }}              as matchup_fg3m,
    {{ num('m.statistics_matchupThreePointersAttempted') }}         as matchup_fg3a,
    {{ num('m.statistics_matchupFreeThrowsMade') }}                 as matchup_ftm,
    {{ num('m.statistics_matchupFreeThrowsAttempted') }}            as matchup_fta,
    {{ num('m.statistics_shootingFouls') }}                         as matchup_shooting_fouls
from m
join {{ ref('int_team_game_context') }} a
  on a.game_id = m.gameId and a.team_id = cast(m.teamId as bigint)
join {{ ref('int_team_game_context') }} d
  on d.game_id = m.gameId and d.team_id <> a.team_id
left join names an on an.player_id = cast(m.parent_personId as bigint)
left join {{ ref('stg_team_season') }} ts  on ts.team_id = d.team_id and ts.season = d.season
left join {{ ref('stg_team_season') }} ots on ots.team_id = a.team_id and ots.season = d.season
left join {{ ref('stg_player_season_bio') }} bio  on bio.player_id = cast(m.personId as bigint) and bio.season = d.season
left join {{ ref('stg_player_season_bio') }} abio on abio.player_id = cast(m.parent_personId as bigint) and abio.season = d.season
