-- Shot chart rolled up to one row per player per game: makes and attempts by zone,
-- plus total shot distance (for average distance).
select
    game_id,
    player_id,
    count(*)                                                        as charted_fga,
    sum(shot_distance)                                              as shot_distance_sum,
    {%- for zone, col in [('Restricted Area', 'ra'), ('Paint (non-RA)', 'paint'),
                          ('Mid-Range', 'mid'), ('Corner 3', 'corner3'),
                          ('Above the Break 3', 'ab3')] %}
    count(*) filter (where shot_zone = '{{ zone }}')                as {{ col }}_fga,
    coalesce(sum(made) filter (where shot_zone = '{{ zone }}'), 0)  as {{ col }}_fgm,
    {%- endfor %}
    count(*) filter (where shot_kind = 'Dunk')                      as dunk_fga,
    coalesce(sum(made) filter (where shot_kind = 'Dunk'), 0)        as dunk_fgm
from {{ ref('stg_shot') }}
group by 1, 2
