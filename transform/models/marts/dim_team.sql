-- One row per team: abbreviation and full name, as NBA.com last listed them.
select
    cast(team_id as bigint)     as team_id,
    team_abbreviation,
    team_name
from {{ source('raw', 'raw_game_log_team__league_game_log') }}
qualify row_number() over (partition by team_id order by game_date desc, _pulled_at desc) = 1
