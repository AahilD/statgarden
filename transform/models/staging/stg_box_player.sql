-- Everything the per-game V3/V2 box scores add for a player, one row per player per game.
-- Rates (ratings, usage %, pace...) stay per game; the catalog averages them weighted by
-- minutes or possessions. Counts stay counts so they add up exactly.
with trad as ({{ box_players('box_traditional') }}),
adv as ({{ box_players('box_advanced') }}),
misc as ({{ box_players('box_misc') }}),
scoring as ({{ box_players('box_scoring') }}),
hustle as ({{ box_players('box_hustle') }}),
trk as ({{ box_players('box_tracking') }}),
dfn as ({{ box_players('box_defensive') }})

select
    trad.gameId                                                   as game_id,
    cast(trad.personId as bigint)                                 as player_id,
    trad.position <> ''                                           as is_starter,
    nullif(trad.position, '')                                     as start_position,

    -- advanced (per-game rates)
    {{ num('adv.statistics_possessions') }}                       as poss,
    {{ num('adv.statistics_offensiveRating') }}                   as off_rtg,
    {{ num('adv.statistics_defensiveRating') }}                   as def_rtg,
    {{ num('adv.statistics_netRating') }}                         as net_rtg,
    {{ num('adv.statistics_usagePercentage') }}                   as usg_pct,
    {{ num('adv.statistics_assistPercentage') }}                  as ast_pct,
    {{ num('adv.statistics_assistRatio') }}                       as ast_ratio,
    {{ num('adv.statistics_offensiveReboundPercentage') }}        as oreb_pct,
    {{ num('adv.statistics_defensiveReboundPercentage') }}        as dreb_pct,
    {{ num('adv.statistics_reboundPercentage') }}                 as reb_pct,
    {{ num('adv.statistics_turnoverRatio') }}                     as tov_ratio,
    {{ num('adv.statistics_pace') }}                              as pace,
    {{ num('adv.statistics_PIE') }}                               as pie,

    -- misc (counts)
    {{ num('misc.statistics_pointsOffTurnovers') }}               as pts_off_tov,
    {{ num('misc.statistics_pointsSecondChance') }}               as pts_2nd_chance,
    {{ num('misc.statistics_pointsFastBreak') }}                  as pts_fast_break,
    {{ num('misc.statistics_pointsPaint') }}                      as pts_paint,
    {{ num('misc.statistics_oppPointsOffTurnovers') }}            as opp_pts_off_tov_on,
    {{ num('misc.statistics_oppPointsSecondChance') }}            as opp_pts_2nd_chance_on,
    {{ num('misc.statistics_oppPointsFastBreak') }}               as opp_pts_fast_break_on,
    {{ num('misc.statistics_oppPointsPaint') }}                   as opp_pts_paint_on,
    {{ num('misc.statistics_blocksAgainst') }}                    as blk_against,
    {{ num('misc.statistics_foulsDrawn') }}                       as fouls_drawn,

    -- scoring: turn "share of makes assisted" back into a count
    round({{ num('scoring.statistics_percentageAssistedFGM') }}
          * {{ num('trad.statistics_fieldGoalsMade') }})          as ast_fgm,

    -- hustle (counts)
    {{ num('hustle.statistics_contestedShots') }}                 as contested_shots,
    {{ num('hustle.statistics_contestedShots2pt') }}              as contested_2pt,
    {{ num('hustle.statistics_contestedShots3pt') }}              as contested_3pt,
    {{ num('hustle.statistics_deflections') }}                    as deflections,
    {{ num('hustle.statistics_chargesDrawn') }}                   as charges_drawn,
    {{ num('hustle.statistics_screenAssists') }}                  as screen_ast,
    {{ num('hustle.statistics_screenAssistPoints') }}             as screen_ast_pts,
    {{ num('hustle.statistics_looseBallsRecoveredTotal') }}       as loose_balls,
    {{ num('hustle.statistics_boxOuts') }}                        as box_outs,
    {{ num('hustle.statistics_offensiveBoxOuts') }}               as off_box_outs,
    {{ num('hustle.statistics_defensiveBoxOuts') }}               as def_box_outs,

    -- tracking
    {{ num('trk.statistics_distance') }}                          as distance,
    {{ num('trk.statistics_speed') }}                             as speed,
    {{ num('trk.statistics_touches') }}                           as touches,
    {{ num('trk.statistics_passes') }}                            as passes,
    {{ num('trk.statistics_secondaryAssists') }}                  as secondary_ast,
    {{ num('trk.statistics_freeThrowAssists') }}                  as ft_ast,
    {{ num('trk.statistics_reboundChancesOffensive') }}           as oreb_chances,
    {{ num('trk.statistics_reboundChancesDefensive') }}           as dreb_chances,
    {{ num('trk.statistics_reboundChancesTotal') }}               as reb_chances,
    {{ num('trk.statistics_contestedFieldGoalsMade') }}           as contested_fgm,
    {{ num('trk.statistics_contestedFieldGoalsAttempted') }}      as contested_fga,
    {{ num('trk.statistics_uncontestedFieldGoalsMade') }}         as uncontested_fgm,
    {{ num('trk.statistics_uncontestedFieldGoalsAttempted') }}    as uncontested_fga,
    {{ num('trk.statistics_defendedAtRimFieldGoalsMade') }}       as rim_def_fgm,
    {{ num('trk.statistics_defendedAtRimFieldGoalsAttempted') }}  as rim_def_fga,

    -- defensive matchups (who they guarded)
    {{ mins('dfn.statistics_matchupMinutes') }}                   as matchup_min,
    {{ num('dfn.statistics_partialPossessions') }}                as matchup_poss,
    {{ num('dfn.statistics_switchesOn') }}                        as switches_on,
    {{ num('dfn.statistics_playerPoints') }}                      as matchup_pts,
    {{ num('dfn.statistics_matchupAssists') }}                    as matchup_ast,
    {{ num('dfn.statistics_matchupTurnovers') }}                  as matchup_tov,
    {{ num('dfn.statistics_matchupFieldGoalsMade') }}             as matchup_fgm,
    {{ num('dfn.statistics_matchupFieldGoalsAttempted') }}        as matchup_fga,
    {{ num('dfn.statistics_matchupThreePointersMade') }}          as matchup_fg3m,
    {{ num('dfn.statistics_matchupThreePointersAttempted') }}     as matchup_fg3a
from trad
left join adv     using (gameId, personId)
left join misc    using (gameId, personId)
left join scoring using (gameId, personId)
left join hustle  using (gameId, personId)
left join trk     using (gameId, personId)
left join dfn     using (gameId, personId)
where {{ mins('trad.statistics_minutes') }} > 0
