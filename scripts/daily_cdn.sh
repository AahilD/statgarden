#!/bin/zsh
# Daily cdn.nba.com pull. cdn lets ~600 calls through and then answers 403,
# so this grabs one day's worth, then loads, builds and publishes what came in.
# Run by launchd (scripts/com.statgarden.daily-cdn.plist); safe to run by hand.
set -u
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")/.." || exit 1

log="data/logs/daily_cdn_$(date +%F).out"
mkdir -p data/logs
exec >>"$log" 2>&1
echo "== $(date '+%F %T') daily cdn pull"

make pull-cdn
saved=$(grep -o 'finished: [0-9,]* saved' "$log" | tail -1 | tr -dc '0-9')

if [[ -z "$saved" || "$saved" == 0 ]]; then
  echo "== nothing new, skipping load/build"
  exit 0
fi

make build && make recon && make publish-local
echo "== $(date '+%F %T') done ($saved new files)"
