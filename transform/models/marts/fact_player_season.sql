-- One row per player per season (and season type): the season box score added up from
-- the game log, plus the season-only dashboards NBA.com doesn't give per game:
-- player tracking (drives, catch & shoot, pull-ups, touches, passing, rebounding,
-- speed and distance), defended shots, and hustle. All of them are season totals.
{%- set trk = {
    'Drives':        ['drives', 'drive_fgm', 'drive_fga', 'drive_ftm', 'drive_fta', 'drive_pts',
                      'drive_passes', 'drive_ast', 'drive_tov', 'drive_pf'],
    'CatchShoot':    ['catch_shoot_fgm', 'catch_shoot_fga', 'catch_shoot_fg3m', 'catch_shoot_fg3a', 'catch_shoot_pts'],
    'PullUpShot':    ['pull_up_fgm', 'pull_up_fga', 'pull_up_fg3m', 'pull_up_fg3a', 'pull_up_pts'],
    'Possessions':   ['touches', 'front_ct_touches', 'time_of_poss', 'elbow_touches', 'paint_touches', 'post_touches'],
    'ElbowTouch':    ['elbow_touch_fgm', 'elbow_touch_fga', 'elbow_touch_pts', 'elbow_touch_passes', 'elbow_touch_ast', 'elbow_touch_tov'],
    'PaintTouch':    ['paint_touch_fgm', 'paint_touch_fga', 'paint_touch_pts', 'paint_touch_passes', 'paint_touch_ast', 'paint_touch_tov'],
    'PostTouch':     ['post_touch_fgm', 'post_touch_fga', 'post_touch_pts', 'post_touch_passes', 'post_touch_ast', 'post_touch_tov'],
    'Passing':       ['passes_made', 'passes_received', 'secondary_ast', 'potential_ast', 'ast_pts_created', 'ft_ast'],
    'Rebounding':    ['oreb_contest', 'dreb_contest', 'reb_contest', 'oreb_chances', 'dreb_chances', 'reb_chances'],
    'SpeedDistance': ['dist_miles', 'dist_miles_off', 'dist_miles_def', 'avg_speed', 'avg_speed_off', 'avg_speed_def'],
    'Defense':       ['def_rim_fgm', 'def_rim_fga'],
} %}
{#- raw column → our column (names match the per-game box score fields where they mean the same thing) #}
{%- set rename = {'dist_miles': 'distance', 'avg_speed': 'speed', 'passes_made': 'passes',
                  'def_rim_fgm': 'rim_def_fgm', 'def_rim_fga': 'rim_def_fga'} %}
{%- set hustle = {'deflections': 'deflections', 'contested_shots': 'contested_shots',
                  'contested_shots_2pt': 'contested_2pt', 'contested_shots_3pt': 'contested_3pt',
                  'charges_drawn': 'charges_drawn', 'screen_assists': 'screen_ast', 'screen_ast_pts': 'screen_ast_pts',
                  'loose_balls_recovered': 'loose_balls', 'box_outs': 'box_outs', 'off_boxouts': 'off_box_outs',
                  'def_boxouts': 'def_box_outs'} %}
with box as (
    select
        player_id,
        season,
        season_type,
        arg_max(player_name, game_date)             as player_name,
        arg_max(team_id, game_date)                 as team_id,
        arg_max(team_abbreviation, game_date)       as team_abbreviation,
        count(*)                                    as gp,
        sum(is_win::int)                            as wins,
        count(*) - sum(is_win::int)                 as losses,
        {%- for c in ['min', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'oreb', 'dreb', 'reb',
                      'ast', 'stl', 'blk', 'tov', 'pf', 'pts', 'plus_minus'] %}
        sum({{ c }})                                as {{ c }}{{ "," if not loop.last }}
        {%- endfor %}
    from {{ ref('stg_player_game_log') }}
    group by 1, 2, 3
),
trk as (
    select
        cast(player_id as bigint)                   as player_id,
        _season                                     as season,
        {{ season_type('_season_type') }}           as season_type,
        {%- for mt, cols in trk.items() %}
        {%- for c in cols %}
        max({{ num(c) }}) filter (where _params->>'pt_measure_type' = '{{ mt }}') as {{ rename.get(c, c) }},
        {%- endfor %}
        {%- endfor %}
        1 as _trk
    from {{ source('raw', 'raw_tracking__league_dash_pt_stats') }}
    where _params->>'player_or_team' = 'Player'
    group by 1, 2, 3
),
dfd as (
    select
        cast(close_def_person_id as bigint)         as player_id,
        _season                                     as season,
        {{ season_type('_season_type') }}           as season_type,
        max({{ num('d_fgm') }}) filter (where _params->>'defense_category' = 'Overall')   as d_fgm,
        max({{ num('d_fga') }}) filter (where _params->>'defense_category' = 'Overall')   as d_fga,
        max({{ num('d_fga') }} * {{ num('normal_fg_pct') }})
            filter (where _params->>'defense_category' = 'Overall')                      as d_fgm_expected,
        max({{ num('fg3m') }}) filter (where _params->>'defense_category' = '3 Pointers') as d_fg3m,
        max({{ num('fg3a') }}) filter (where _params->>'defense_category' = '3 Pointers') as d_fg3a,
        max({{ num('fg3a') }} * {{ num('ns_fg3_pct') }})
            filter (where _params->>'defense_category' = '3 Pointers')                   as d_fg3m_expected,
        max({{ num('fgm_lt_06') }}) filter (where _params->>'defense_category' = 'Less Than 6Ft') as d_lt6_fgm,
        max({{ num('fga_lt_06') }}) filter (where _params->>'defense_category' = 'Less Than 6Ft') as d_lt6_fga,
        max({{ num('fga_lt_06') }} * {{ num('ns_lt_06_pct') }})
            filter (where _params->>'defense_category' = 'Less Than 6Ft')                as d_lt6_fgm_expected
    from {{ source('raw', 'raw_defend_player__league_dash_ptdefend') }}
    group by 1, 2, 3
),
hus as (
    select
        cast(player_id as bigint)                   as player_id,
        _season                                     as season,
        {{ season_type('_season_type') }}           as season_type,
        {%- for c, name in hustle.items() %}
        max({{ num(c) }})                           as {{ name }}{{ "," if not loop.last }}
        {%- endfor %}
    from {{ source('raw', 'raw_hustle_player__hustle_stats_player') }}
    group by 1, 2, 3
)
select
    box.player_id || '-' || box.season || '-' || box.season_type as player_season_key,
    box.player_id,
    box.player_name,
    box.team_id,
    box.team_abbreviation,
    box.season,
    box.season_type,
    ts.conference,
    bio.age, bio.height_in, bio.weight_lb, bio.position, bio.country, bio.college,
    bio.draft_year, bio.draft_round, bio.draft_number,
    box.* exclude (player_id, season, season_type, player_name, team_id, team_abbreviation),
    trk.* exclude (player_id, season, season_type, _trk),
    dfd.* exclude (player_id, season, season_type),
    hus.* exclude (player_id, season, season_type)
from box
left join trk using (player_id, season, season_type)
left join dfd using (player_id, season, season_type)
left join hus using (player_id, season, season_type)
left join {{ ref('stg_team_season') }} ts on ts.team_id = box.team_id and ts.season = box.season
left join {{ ref('stg_player_season_bio') }} bio on bio.player_id = box.player_id and bio.season = box.season
