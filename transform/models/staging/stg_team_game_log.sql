-- One row per team per game, types fixed, home/away and W/L parsed.
select
    team_id,
    team_abbreviation,
    game_id,
    cast(game_date as date)         as game_date,
    season,
    season_type,
    matchup like '%vs.%'            as is_home,
    wl = 'W'                        as is_win,
    plus_minus                      as margin,
    min, fgm, fga, fg3m, fg3a, ftm, fta,
    oreb, dreb, reb, ast, stl, blk, tov, pf, pts
from {{ source('raw', 'raw_team_game_log') }}
