{{ config(materialized='table') }}
-- How each shot came about, from stats.nba.com play-by-play (every game):
--   possession_start  what handed the shooting team the ball: defensive rebound, turnover,
--                     the other team scoring, or the start of a quarter
--   secs_into_poss    game-clock seconds from that moment to the shot
--   is_second_chance  the team had already grabbed an offensive rebound this possession
--   assister_*        who assisted a made shot (matched by name to a teammate in the same game)
-- Checked against cdn.nba.com's own flags on 213,575 shots: second chance agrees on 97.9%,
-- "off a turnover" on 99.0%. Fast break is left to cdn's flag (a time rule only gets ~80% right).
with a as (
    select
        gameId                                                          as game_id,
        try_cast(actionNumber as integer)                               as n,
        try_cast(actionId as integer)                                   as action_id,
        try_cast(period as integer)                                     as period,
        coalesce(try_cast(regexp_extract(clock, 'PT(\d+)M', 1) as integer), 0) * 60
          + coalesce(try_cast(regexp_extract(clock, 'M([\d.]+)S', 1) as double), 0) as secs_left,
        try_cast(personId as bigint)                                    as player_id,
        playerName                                                      as player_name,
        playerNameI                                                     as player_name_i,
        -- team plays (team rebounds, shot-clock turnovers) carry the team id in personId
        coalesce(
            try_cast(nullif(nullif(teamId, ''), '0') as bigint),
            case when try_cast(personId as bigint) between 1610612737 and 1610612766
                 then try_cast(personId as bigint) end
        )                                                               as team_id,
        actionType                                                      as action_type,
        subType                                                         as sub_type,
        description
    from {{ source('raw', 'raw_pbp__actions') }}
    where actionType <> ''
    qualify row_number() over (partition by gameId, actionId order by _pulled_at desc) = 1
),
teams as (
    select game_id, min(team_id) as t1, max(team_id) as t2
    from a where team_id is not null group by 1
),
marked as (
    select
        a.*,
        -- who has the ball after this play (null = no change)
        case
            when action_type = 'period' and sub_type = 'start' then -1   -- nobody until the tip / first play
            when action_type in ('Made Shot', 'Turnover')
              or (action_type = 'Free Throw' and description not like 'MISS%'
                  and regexp_matches(sub_type, '(1 of 1|2 of 2|3 of 3)$') and sub_type not like '%Technical%')
                then case when a.team_id = t.t1 then t.t2 else t.t1 end
            when action_type = 'Rebound' then a.team_id
        end                                                             as ball_after,
        case
            when action_type = 'period' then 'Start of quarter'
            when action_type in ('Made Shot', 'Free Throw') then 'Other team scored'
            when action_type = 'Rebound' then 'Defensive rebound'
            when action_type = 'Turnover' then 'Turnover'
        end                                                             as how
    from a join teams t using (game_id)
),
prev as (
    select *, last_value(ball_after ignore nulls) over w as ball_before
    from marked
    window w as (partition by game_id order by n, action_id rows between unbounded preceding and 1 preceding)
),
poss as (
    select
        *,
        (ball_after is not null and ball_after is distinct from ball_before)::int as starts,
        coalesce(ball_after is not null and ball_after = ball_before and action_type = 'Rebound', false) as is_oreb
    from prev
),
numbered as (
    select
        *,
        sum(starts) over (partition by game_id order by n, action_id rows unbounded preceding) as poss_no,
        -- the possession a play belongs to: a made shot ends its possession, it doesn't start the next
        coalesce(sum(starts) over (partition by game_id order by n, action_id
                                   rows between unbounded preceding and 1 preceding), 0) as in_poss
    from poss
),
with_orebs as (
    select
        *,
        coalesce(sum(is_oreb::int) over (partition by game_id, in_poss order by n, action_id
                                         rows between unbounded preceding and 1 preceding), 0) as orebs_before
    from numbered
),
starts as (
    select game_id, poss_no, how, secs_left as start_secs, period as start_period
    from numbered where starts = 1
),
-- the names a player goes by in one game's play-by-play ("Murray", "J. Murray"), accents dropped,
-- so "(Murray 5 AST)" finds Murray. Names two teammates share are left out.
pbp_names as (
    select distinct game_id, team_id, player_id, strip_accents(unnest([player_name, player_name_i])) as nm
    from a
    where player_id is not null and player_id < 1610612737
),
names as (
    select game_id, team_id, nm, min(player_id) as player_id
    from pbp_names where nm <> '' group by all having count(distinct player_id) = 1
),
-- fallback for "Jal. Williams": first name starts with "Jal", last name Williams, same team and game
box_names as (
    select game_id, team_id, player_id, strip_accents(player_name) as full_name
    from {{ ref('stg_player_game_log') }}
),
shots as (
    select
        s.*,
        nullif(regexp_extract(s.description, '\(([^()]+?) \d+ AST\)', 1), '') as assister_pbp_name
    from with_orebs s
    where s.action_type in ('Made Shot', 'Missed Shot')
)
select
    s.game_id,
    s.n                                                                 as event_id,
    st.how                                                              as possession_start,
    case when st.start_period = s.period and st.start_secs >= s.secs_left
         then st.start_secs - s.secs_left end                           as secs_into_poss,
    s.orebs_before > 0                                                  as is_second_chance,
    s.action_type = 'Made Shot' and s.assister_pbp_name is not null     as is_assisted,
    coalesce(nm.player_id, (
        select min(b.player_id) from box_names b
        where b.game_id = s.game_id and b.team_id = s.team_id
          and b.full_name like regexp_extract(strip_accents(s.assister_pbp_name), '^(\S+)\.', 1) || '% '
                               || regexp_extract(strip_accents(s.assister_pbp_name), '^\S+\.\s+(.+)$', 1)
        having count(*) = 1
    ))                                                                  as assister_id
from shots s
left join starts st on st.game_id = s.game_id and st.poss_no = s.in_poss
left join names nm on nm.game_id = s.game_id and nm.team_id = s.team_id and nm.nm = strip_accents(s.assister_pbp_name)
