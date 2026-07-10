#!/usr/bin/env bash
# Run the generated integration/bootstrap lanes as concurrent test processes.
#
# Each lane stays internally serial (.taprc `serial:` covers test/integration
# and test/bootstrap); the concurrency here is across lanes only. Wall-clock
# is the heaviest lane instead of the sum of all five, which is why the shard
# generator packs lanes by recorded duration.
#
# The runner keeps correctness output separate from coverage and writes one TAP
# result per test file. Each lane stays serial internally; concurrency is only
# across lanes.
set -u

LANES=(integration-1 integration-2 integration-3 bootstrap-1 bootstrap-2)
LOG_DIR=test-output/lanes
mkdir -p "$LOG_DIR"

# A missing or empty shard file is invalid and must never produce a green lane.
for lane in "${LANES[@]}"; do
  [ -s "test/shards/$lane.txt" ] || {
    echo "missing or empty shard file: test/shards/$lane.txt" >&2
    exit 1
  }
done

pids=()
for lane in "${LANES[@]}"; do
  # shellcheck disable=SC2046 -- word-splitting the shard file list is the point
  node scripts/run-test-files.js --jobs=1 $(cat "test/shards/$lane.txt") \
    > "$LOG_DIR/$lane.log" 2>&1 &
  pids+=($!)
  sleep 1
done

status=0
for i in "${!LANES[@]}"; do
  lane="${LANES[$i]}"
  if wait "${pids[$i]}"; then
    summary=$(grep -E '^# test-files ' "$LOG_DIR/$lane.log" | tail -1)
    echo "lane $lane OK ${summary:-}"
  else
    status=1
    echo "=== lane $lane FAILED (tail of $LOG_DIR/$lane.log) ==="
    tail -n 60 "$LOG_DIR/$lane.log"
  fi
done
exit "$status"
