{# The counting stats both game logs share, cast from raw text to integers. #}
{% macro box_score_columns() -%}
    {%- for col in ['min', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'oreb', 'dreb', 'reb',
                    'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] %}
    cast({{ col }} as integer) as {{ col }}{{ "," if not loop.last }}
    {%- endfor %}
{%- endmacro %}
