-- Clutch and garbage-time numbers per player per game, from play-by-play.
-- (Columns are named clutch_<stat> and garbage_<stat>.)
select
    game_id,
    player_id,
    {%- for sit in ['clutch', 'garbage'] %}
    {%- for stat in ['pts', 'fga', 'fgm', 'fg3a', 'fg3m', 'fta', 'ftm', 'reb', 'tov', 'stl', 'blk'] %}
    sum({{ stat }}) filter (where is_{{ sit }})        as {{ sit }}_{{ stat }},
    {%- endfor %}
    {%- endfor %}
    count(*) filter (where is_clutch)                   as clutch_plays
from {{ ref('int_pbp_situations') }}
where player_id is not null
group by 1, 2
