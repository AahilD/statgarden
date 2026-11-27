-- Who a player is, per season: age, size, draft, position, where they came from.
-- Age, height and weight come from the season's bio stats; position from the player index.
with bio as (
    select * from {{ source('raw', 'raw_dash_player_bio__league_dash_player_bio_stats') }}
    qualify row_number() over (partition by player_id, _season
                               order by (_season_type = 'Regular Season') desc, _pulled_at desc) = 1
),
idx as (
    select * from {{ source('raw', 'raw_player_index__player_index') }}
    qualify row_number() over (partition by person_id, _season order by _pulled_at desc) = 1
)
select
    cast(coalesce(bio.player_id, idx.person_id) as bigint)          as player_id,
    coalesce(bio._season, idx._season)                              as season,
    {{ num('bio.age') }}                                            as age,
    {{ num('bio.player_height_inches') }}                           as height_in,
    {{ num('bio.player_weight') }}                                  as weight_lb,
    nullif(idx.position, '')                                        as position,
    nullif(coalesce(bio.country, idx.country), '')                  as country,
    nullif(coalesce(bio.college, idx.college), '')                  as college,
    try_cast(coalesce(bio.draft_year, idx.draft_year) as integer)   as draft_year,
    try_cast(coalesce(bio.draft_round, idx.draft_round) as integer) as draft_round,
    try_cast(coalesce(bio.draft_number, idx.draft_number) as integer) as draft_number
from bio
full join idx on idx.person_id = bio.player_id and idx._season = bio._season
