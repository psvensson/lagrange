#!/usr/bin/env bash
# job-log.sh — read the LOCAL copy of pipeline job logs.
#
# The runner daemon runs at log.level=debug, which duplicates every job/step
# output line into the container's stdout (below debug the runner installs a
# NullLogger and job output exists only on the Codeberg side). Docker keeps
# that stdout in rotated json-file logs (docker-compose.yml: 3 x 100 MB), so
# the latest runs are always retained locally and old ones overwrite
# themselves.
#
# Jobs run sequentially (runner capacity=1), and each job starts with a
# 'task <id> repo is ...' daemon line — so marker-to-marker slices of the
# stream are whole jobs.
#
# Usage:
#   ./job-log.sh              # full log of the most recent job
#   ./job-log.sh --list      # task ids (+ start time) still in the window
#   ./job-log.sh <task-id>   # full log of one retained task
#   ./job-log.sh -f          # follow the stream live (raw, includes daemon lines)
set -euo pipefail

CONTAINER=lagrange-forgejo-runner
MARKER='msg="task [0-9]+ repo is'

logs() { docker logs "$CONTAINER" 2>&1; }

case "${1:-latest}" in
  -f|--follow)
    exec docker logs -f --tail 100 "$CONTAINER"
    ;;
  --list)
    logs | grep -E "$MARKER" \
      | sed -E 's/^time="([^"]*)".*msg="task ([0-9]+) repo is.*/\2  started \1/'
    ;;
  latest)
    start=$(logs | grep -n -E "$MARKER" | tail -1 | cut -d: -f1 || true)
    if [ -z "${start:-}" ]; then
      echo "no job found in the retained log window" >&2
      exit 1
    fi
    logs | tail -n +"$start"
    ;;
  *)
    task="$1"
    logs | awk -v m="msg=\"task ${task} repo is" '
      index($0, m) { on = 1 }
      on && $0 ~ /msg="task [0-9]+ repo is/ && !index($0, m) { exit }
      on { print }
    ' | grep . || { echo "task ${task} not in the retained log window" >&2; exit 1; }
    ;;
esac
