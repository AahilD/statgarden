-- Per team per game: game number, rest days, and record going INTO the game
-- (the game itself is excluded, so nothing here uses hindsight).
select
    team_id,
    team_abbreviation,
    game_id,
    game_date,
    season,
    season_type,
    is_home,
    is_win,
    margin,
    row_number() over w                                             as game_number,
    date_diff('day', lag(game_date) over w, game_date) - 1          as rest_days,
    coalesce(sum(is_win::int) over (
        w rows between unbounded preceding and 1 preceding), 0)     as wins_before,
    row_number() over w - 1                                         as games_before
from {{ ref('stg_team_game_log') }}
window w as (partition by team_id, season, season_type order by game_date)
