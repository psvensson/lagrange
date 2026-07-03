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

# CI_LEAN=1 trades the overlap-for-speed design for a low-memory-PEAK gate:
# the analysis lane runs SERIALLY (not concurrently with the tap fleet) and the
# integration/bootstrap lanes run one-at-a-time (test:sharded:serial) instead of
# five-concurrent. Used by release.yml on the memory-constrained self-hosted
# runner, where the concurrent-cluster peak + eslint/TLC OOM-kills the job
# container (exit 137). Unset => identical to the historical overlapped gate.
if [ "${CI_LEAN:-}" = "1" ]; then
  echo "=== CI_LEAN: serial analysis + serial sharded lanes (low memory peak) ==="
  npm run test:static && npm run model:contracts || exit 1
  npm run test:sharded:serial && npm run test:chart:endpoint-sync
  exit $?
fi

nice -n 10 bash -c 'npm run test:static && npm run model:contracts' \
  > "$ANALYSIS_LOG" 2>&1 &
analysis_pid=$!

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
