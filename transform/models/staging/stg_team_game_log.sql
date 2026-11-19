-- One row per team per game from LeagueGameLog. Types set, home/away and W/L parsed.
select
    cast(team_id as bigint)             as team_id,
    team_abbreviation,
    game_id,
    cast(game_date as date)             as game_date,
    _season                             as season,
    {{ season_type('_season_type') }}   as season_type,
    matchup like '%vs.%'                as is_home,
    wl = 'W'                            as is_win,
    cast(plus_minus as integer)         as margin,
    {{ box_score_columns() }}
from {{ source('raw', 'raw_game_log_team__league_game_log') }}
