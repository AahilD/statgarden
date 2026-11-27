-- One row per player, season, play type and side (offense / defense), from Synergy
-- play type data on NBA.com. Season totals. Possessions and points add up across
-- play types; points per possession is worked out over the whole group.
with pt as (
    select * from {{ source('raw', 'raw_play_types__synergy_play_type') }}
    where player_id is not null and player_id <> ''
    qualify row_number() over (partition by player_id, team_id, _season, _season_type, play_type, type_grouping
                               order by _pulled_at desc) = 1
)
select
    pt.player_id || '-' || pt.team_id || '-' || pt._season || '-' || pt._season_type
        || '-' || pt.play_type || '-' || pt.type_grouping           as play_type_key,
    cast(pt.player_id as bigint)                                    as player_id,
    pt.player_name,
    cast(pt.team_id as bigint)                                      as team_id,
    pt.team_abbreviation,
    pt._season                                                      as season,
    {{ season_type('pt._season_type') }}                            as season_type,
    case pt.play_type
        when 'PRBallHandler' then 'Pick & roll ball handler'
        when 'PRRollMan'     then 'Pick & roll roll man'
        when 'Spotup'        then 'Spot up'
        when 'Postup'        then 'Post up'
        when 'OffScreen'     then 'Off screen'
        when 'OffRebound'    then 'Putbacks'
        when 'Misc'          then 'Other'
        else pt.play_type
    end                                                             as play_type,
    case pt.type_grouping when 'Offensive' then 'Offense' else 'Defense' end as side,
    ts.conference,
    bio.age, bio.height_in, bio.position,
    {{ num('pt.gp') }}                                              as gp,
    {{ num('pt.poss') }}                                            as poss,
    {{ num('pt.pts') }}                                             as pts,
    {{ num('pt.fgm') }}                                             as fgm,
    {{ num('pt.fga') }}                                             as fga,
    {{ num('pt.poss') }} * {{ num('pt.tov_poss_pct') }}             as tov,
    {{ num('pt.poss') }} * {{ num('pt.sf_poss_pct') }}              as shooting_fouls_drawn,
    {{ num('pt.poss') }} * {{ num('pt.score_poss_pct') }}           as scoring_poss,
    {{ num('pt.percentile') }}                                      as play_type_percentile
from pt
left join {{ ref('stg_team_season') }} ts
  on ts.team_id = cast(pt.team_id as bigint) and ts.season = pt._season
left join {{ ref('stg_player_season_bio') }} bio
  on bio.player_id = cast(pt.player_id as bigint) and bio.season = pt._season
