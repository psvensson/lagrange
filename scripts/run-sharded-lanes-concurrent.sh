#!/usr/bin/env bash
# Run the generated integration/bootstrap lanes as CONCURRENT tap processes.
#
# Each lane stays internally serial (.taprc `serial:` covers test/integration
# and test/bootstrap); the concurrency here is across lanes only. Wall-clock
# is the heaviest lane instead of the sum of all five, which is why the shard
# generator packs lanes by recorded duration.
#
# Coverage is disabled per lane deliberately: concurrent tap invocations share
# .tap/ state (each run rimrafs .tap/processinfo and .tap/coverage at startup,
# and each lane's teardown would c8-merge the union of every lane's coverage),
# so per-lane coverage output would be cross-contaminated garbage.
# --allow-empty-coverage is REQUIRED alongside --disable-coverage: without it
# tap exits 1 for producing no coverage. Lane starts are staggered a moment to
# keep the startup rimrafs from racing another lane's exiting child.
set -u

LANES=(integration-1 integration-2 integration-3 bootstrap-1 bootstrap-2)
LOG_DIR=test-output/lanes
mkdir -p "$LOG_DIR"

# A missing/empty shard file would leave tap with zero file args, which
# silently degrades to tap's FULL default discovery inside that lane (the
# same trap the shard generator refuses empty lanes for).
for lane in "${LANES[@]}"; do
  [ -s "test/shards/$lane.txt" ] || {
    echo "missing or empty shard file: test/shards/$lane.txt" >&2
    exit 1
  }
done

pids=()
for lane in "${LANES[@]}"; do
  # shellcheck disable=SC2046 -- word-splitting the shard file list is the point
  npx tap --disable-coverage --allow-empty-coverage $(cat "test/shards/$lane.txt") \
    > "$LOG_DIR/$lane.log" 2>&1 &
  pids+=($!)
  sleep 1
done

status=0
for i in "${!LANES[@]}"; do
  lane="${LANES[$i]}"
  if wait "${pids[$i]}"; then
    summary=$(grep -E '^# \{ total:' "$LOG_DIR/$lane.log" | tail -1)
    echo "lane $lane OK ${summary:-}"
  else
    status=1
    echo "=== lane $lane FAILED (tail of $LOG_DIR/$lane.log) ==="
    tail -n 60 "$LOG_DIR/$lane.log"
  fi
done
exit "$status"
