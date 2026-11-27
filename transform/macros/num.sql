{# Raw values arrive as text. num() → double (blank → null); mins() turns "41:28" into 41.47. #}
{% macro num(col) -%}
    try_cast(nullif(trim(cast({{ col }} as varchar)), '') as double)
{%- endmacro %}

{% macro mins(col) -%}
    case
        when {{ col }} is null or trim({{ col }}) = '' then null
        when {{ col }} like '%:%' then
            try_cast(split_part({{ col }}, ':', 1) as double)
            + coalesce(try_cast(split_part({{ col }}, ':', 2) as double), 0) / 60
        else try_cast({{ col }} as double)
    end
{%- endmacro %}

{# One row per (game, player) from a V3 box score table; keeps the newest pull if a game came twice. #}
{% macro box_players(name) -%}
    select * from {{ source('raw', 'raw_' ~ name ~ '__team_players') }}
    qualify row_number() over (partition by gameId, personId order by _pulled_at desc) = 1
{%- endmacro %}

{% macro box_teams(name) -%}
    select * from {{ source('raw', 'raw_' ~ name ~ '__team') }}
    qualify row_number() over (partition by gameId, teamId order by _pulled_at desc) = 1
{%- endmacro %}
