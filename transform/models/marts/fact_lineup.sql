-- One row per lineup (2-man to 5-man) per team per season, from NBA.com's lineup
-- dashboards: the Base (box score) and Advanced (ratings) views joined together.
-- Season totals. Ratings are averaged weighted by possessions in the catalog.
with l as (
    select
        *,
        _params->>'measure_type_detailed_defense'   as measure,
        try_cast(_params->>'group_quantity' as integer) as group_size
    from {{ source('raw', 'raw_lineups__lineups') }}
    qualify row_number() over (
        partition by group_id, team_id, _season, _season_type, _params->>'measure_type_detailed_defense'
        order by _pulled_at desc) = 1
),
base as (select * from l where measure = 'Base'),
adv  as (select * from l where measure = 'Advanced')
select
    base.group_id || '-' || base.team_id || '-' || base._season || '-' || base._season_type as lineup_key,
    base.group_id                                                   as lineup_id,
    -- "R. Gobert - J. Randle" → "R. Gobert · J. Randle", with each name kept on one line
    replace(regexp_replace(trim(base.group_name), '\s*-\s*', ' · ', 'g'), '. ', '.' || chr(160)) as lineup_name,
    base.group_size,
    cast(base.team_id as bigint)                                    as team_id,
    base.team_abbreviation,
    base._season                                                    as season,
    {{ season_type('base._season_type') }}                          as season_type,
    ts.conference,
    {%- for c, name in [('gp', 'gp'), ('w', 'wins'), ('l', 'losses'), ('min', 'min'), ('fgm', 'fgm'), ('fga', 'fga'),
                        ('fg3m', 'fg3m'), ('fg3a', 'fg3a'), ('ftm', 'ftm'), ('fta', 'fta'), ('oreb', 'oreb'),
                        ('dreb', 'dreb'), ('reb', 'reb'), ('ast', 'ast'), ('tov', 'tov'), ('stl', 'stl'),
                        ('blk', 'blk'), ('blka', 'blk_against'), ('pf', 'pf'), ('pfd', 'fouls_drawn'),
                        ('pts', 'pts'), ('plus_minus', 'plus_minus')] %}
    {{ num('base.' ~ c) }}                                          as {{ name }},
    {%- endfor %}
    {{ num('adv.poss') }}                                           as poss,
    {{ num('adv.off_rating') }}                                     as off_rtg,
    {{ num('adv.def_rating') }}                                     as def_rtg,
    {{ num('adv.net_rating') }}                                     as net_rtg,
    {{ num('adv.pace') }}                                           as pace,
    {{ num('adv.pie') }}                                            as pie,
    {{ num('adv.ast_pct') }}                                        as ast_pct,
    {{ num('adv.oreb_pct') }}                                       as oreb_pct,
    {{ num('adv.dreb_pct') }}                                       as dreb_pct,
    {{ num('adv.reb_pct') }}                                        as reb_pct
from base
left join adv
  on adv.group_id = base.group_id and adv.team_id = base.team_id
 and adv._season = base._season and adv._season_type = base._season_type
left join {{ ref('stg_team_season') }} ts
  on ts.team_id = cast(base.team_id as bigint) and ts.season = base._season
