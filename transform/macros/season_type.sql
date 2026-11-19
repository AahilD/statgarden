{# NBA.com's parameter values → the labels the site uses #}
{% macro season_type(col) -%}
    case {{ col }}
        when 'PlayIn' then 'Play-In'
        else {{ col }}
    end
{%- endmacro %}
