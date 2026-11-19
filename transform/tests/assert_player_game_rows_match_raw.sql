-- The joins to team context must not drop or duplicate any player-game.
-- Returns a row (= test failure) if the counts differ.
select raw_n, fact_n
from (select count(*) as raw_n from {{ source('raw', 'raw_player_game_log') }}),
     (select count(*) as fact_n from {{ ref('fact_player_game') }})
where raw_n <> fact_n
