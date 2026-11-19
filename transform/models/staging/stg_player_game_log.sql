-- One row per player per game, types fixed, home/away and W/L parsed.
select
    player_id,
    player_name,
    team_id,
    team_abbreviation,
    game_id,
    cast(game_date as date)         as game_date,
    season,
    season_type,
    matchup like '%vs.%'            as is_home,
    wl = 'W'                        as is_win,
    min, fgm, fga, fg3m, fg3a, ftm, fta,
    oreb, dreb, reb, ast, stl, blk, tov, pf, pts,
    plus_minus
from {{ source('raw', 'raw_player_game_log') }}
