-- Per game: did it have clutch time, and per team the clutch and garbage-time totals.
with team as (
    select
        game_id,
        team_id,
        {%- for sit in ['clutch', 'garbage'] %}
        {%- for stat in ['pts', 'fga', 'fgm', 'fg3a', 'fg3m', 'fta', 'ftm', 'reb', 'tov', 'stl', 'blk'] %}
        sum({{ stat }}) filter (where is_{{ sit }})    as {{ sit }}_{{ stat }},
        {%- endfor %}
        {%- endfor %}
        count(*) filter (where is_clutch)               as clutch_plays
    from {{ ref('int_pbp_situations') }}
    where team_id is not null
    group by 1, 2
),
game as (
    select game_id, bool_or(is_clutch) as had_clutch, bool_or(is_garbage) as had_garbage
    from {{ ref('int_pbp_situations') }}
    group by 1
)
select team.*, game.had_clutch, game.had_garbage
from team
join game using (game_id)
