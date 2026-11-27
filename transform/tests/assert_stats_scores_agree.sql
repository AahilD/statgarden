-- The site's scores come from stats.nba.com, so its own sources must agree:
-- game log, box score and play-by-play final score. cdn.nba.com differences
-- are only reported (make recon), never a build failure.
select game_id, team, game_log_pts, stats_box_pts, stats_pbp_pts
from {{ ref('recon_team_score') }}
where game_log_pts is distinct from stats_box_pts
   or (stats_pbp_pts is not null and game_log_pts is distinct from stats_pbp_pts)
