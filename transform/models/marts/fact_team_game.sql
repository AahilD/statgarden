-- One row per team per game: the team's box score, what the box scores add,
-- and the opponent's numbers (opp_*) so ratings and four factors work out exactly.
with team as (
    select
        t.*,
        b.* exclude (game_id, team_id),
        z.* exclude (game_id, team_id),
        pg.* exclude (game_id, team_id)
    from {{ ref('stg_team_game_log') }} t
    left join {{ ref('stg_box_team') }} b on b.game_id = t.game_id and b.team_id = t.team_id
    left join {{ ref('int_pbp_game') }} pg on pg.game_id = t.game_id and pg.team_id = t.team_id
    left join (
        select s.game_id, s.team_id,
               count(*) as charted_fga, sum(s.shot_distance) as shot_distance_sum,
               {%- for zone, col in [('Restricted Area', 'ra'), ('Paint (non-RA)', 'paint'),
                                     ('Mid-Range', 'mid'), ('Corner 3', 'corner3'),
                                     ('Above the Break 3', 'ab3')] %}
               count(*) filter (where s.shot_zone = '{{ zone }}') as {{ col }}_fga,
               coalesce(sum(s.made) filter (where s.shot_zone = '{{ zone }}'), 0) as {{ col }}_fgm,
               {%- endfor %}
               count(*) filter (where s.shot_kind = 'Dunk') as dunk_fga,
               coalesce(sum(s.made) filter (where s.shot_kind = 'Dunk'), 0) as dunk_fgm
        from {{ ref('stg_shot') }} s group by 1, 2
    ) z on z.game_id = t.game_id and z.team_id = t.team_id
)
select
    t.team_id || '-' || t.game_id                           as team_game_key,
    t.team_id,
    t.team_abbreviation,
    t.game_id,
    t.game_date,
    t.season,
    t.season_type,
    tg.is_home,
    tg.is_win,
    tg.margin,
    tg.game_number,
    tg.rest_days,
    o.team_id                                               as opp_team_id,
    o.team_abbreviation                                     as opp_abbreviation,
    otg.wins_before / nullif(otg.games_before, 0)           as opp_win_pct_before,
    ts.conference,
    ots.conference                                          as opp_conference,
    t.game_date > ts.all_star_date                          as is_post_all_star,
    t.* exclude (team_id, team_abbreviation, game_id, game_date, season, season_type, is_home, is_win, margin),
    t.margin                                                as plus_minus,
    {%- for c in ['pts', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'oreb', 'dreb', 'reb',
                  'ast', 'stl', 'blk', 'tov', 'pf', 'poss', 'pts_paint', 'pts_fast_break',
                  'pts_2nd_chance', 'pts_off_tov'] %}
    o.{{ c }}                                               as opp_{{ c }}{{ "," if not loop.last }}
    {%- endfor %}
from team t
join team o on o.game_id = t.game_id and o.team_id <> t.team_id
join {{ ref('int_team_game_context') }} tg  on tg.game_id = t.game_id and tg.team_id = t.team_id
join {{ ref('int_team_game_context') }} otg on otg.game_id = t.game_id and otg.team_id = o.team_id
left join {{ ref('stg_team_season') }} ts  on ts.team_id = t.team_id and ts.season = t.season
left join {{ ref('stg_team_season') }} ots on ots.team_id = o.team_id and ots.season = t.season
