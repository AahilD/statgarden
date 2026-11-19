-- One row per player per game from LeagueGameLog. Types set, home/away and W/L parsed.
select
    cast(player_id as bigint)           as player_id,
    player_name,
    cast(team_id as bigint)             as team_id,
    team_abbreviation,
    game_id,
    cast(game_date as date)             as game_date,
    _season                             as season,
    {{ season_type('_season_type') }}   as season_type,
    matchup like '%vs.%'                as is_home,
    wl = 'W'                            as is_win,
    {{ box_score_columns() }},
    cast(plus_minus as integer)         as plus_minus
from {{ source('raw', 'raw_game_log_player__league_game_log') }}
