#!/usr/bin/env bash
# Overlap the read-only analysis lane (test:static + model:contracts) with the
# tap test lanes so the analysis cost disappears from the test:ci critical
# path. The analysis lane is niced so the timing-sensitive tap lanes keep CPU
# priority, and its output goes to a log that is dumped only on failure
# (interleaved stdout from two lanes is untriageable).
#
# test:safety-pregate deliberately stays OUTSIDE this script, serial and
# first, in the test:ci chain. static and model:contracts stay serial
# relative to each other inside the background lane, preserving today's
# semantics.
set -u

LOG_DIR=test-output
ANALYSIS_LOG="$LOG_DIR/analysis-lane.log"
mkdir -p "$LOG_DIR"

# The owner-debt inventory test consumes ignored analysis reports. Produce the
# complete input set before starting concurrent readers so a clean checkout
# never depends on a developer's stale test-output directory or a write race
# with the background static lane.
npm run test:owner-debt:prepare || exit 1
npm run test:aggregate-sensitive-pregate || exit 1

nice -n 10 bash -c 'npm run test:static && npm run model:contracts' \
  > "$ANALYSIS_LOG" 2>&1 &
analysis_pid=$!

# An interrupted run must not leave the niced analysis lane running as an
# orphan writer against test-output; kill it and reap it before exiting.
cleanup_analysis_lane() {
  if kill -0 "$analysis_pid" 2>/dev/null; then
    kill "$analysis_pid" 2>/dev/null
    wait "$analysis_pid" 2>/dev/null
  fi
}
trap 'cleanup_analysis_lane; exit 130' INT TERM

npm run test:sharded:all && npm run test:chart:endpoint-sync
tap_status=$?

if wait "$analysis_pid"; then
  echo "analysis lane OK (test:static + model:contracts)"
else
  echo "=== analysis lane FAILED ($ANALYSIS_LOG) ==="
  cat "$ANALYSIS_LOG"
  exit 1
fi

exit "$tap_status"
