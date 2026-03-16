#!/usr/bin/env bash
# Run ALL distributed Docker harness scenarios sequentially.
# Each scenario runs with its appropriate config (cluster size).
# Reports go to test-output/reports/ with a timestamped name.
#
# Usage:
#   bash scripts/run-all-distributed-scenarios.sh
#   bash scripts/run-all-distributed-scenarios.sh --verbose
#   bash scripts/run-all-distributed-scenarios.sh --fast-local
#   bash scripts/run-all-distributed-scenarios.sh --no-fast-local

set -euo pipefail

TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="test-output/reports"
RUNNER="node test/distributed/run.js"
EXTRA_ARGS=("$@")

# Scenario entries: config|scenario
# 3-node scenarios
declare -a SCENARIOS_3N=(
  "local-three-node.json|admin-query-smoke"
  "local-three-node.json|examples-catalog"
  "local-three-node.json|network-partition-split-brain"
  "local-three-node.json|node-failure-rebalance"
  "local-three-node.json|rolling-restart"
  "local-three-node.json|three-node-seed-rebalance"
  "local-three-node.json|wasm-service-failover"
  "local-three-node.json|write-ack-visibility"
)

# 5-node scenarios
declare -a SCENARIOS_5N=(
  "local.json|node-join-under-load"
  "local.json|partition-kill-heal-under-load"
  "local.json|rolling-restart"
  "local.json|seed-restart-under-load"
  "local.json|sustained-write-throughput"
  "local-benchmark-5node.json|postgres-baseline-comparison"
)

# 7-node scenarios
declare -a SCENARIOS_7N=(
  "local-benchmark-7node.json|diag-admin-discovery"
  "local-benchmark-7node.json|seven-node-load-during-partitioning"
  "local-benchmark-7node.json|seven-node-read-write-load-distribution"
  "local-benchmark-7node.json|seven-node-read-write-load-transaction-recovery"
  "local-benchmark-7node.json|seven-node-table-partition-distribution"
  "local-benchmark-7node-partition-split.json|seven-node-postgres-baseline-partition-split"
)

ALL_SCENARIOS=(
  "${SCENARIOS_3N[@]}"
  "${SCENARIOS_5N[@]}"
  "${SCENARIOS_7N[@]}"
)

TOTAL=${#ALL_SCENARIOS[@]}
PASSED=0
FAILED=0
FAILED_NAMES=()

mkdir -p "$REPORT_DIR"

echo "========================================"
echo "Running all ${TOTAL} distributed scenarios"
echo "Timestamp: ${TS}"
echo "========================================"
echo ""

IDX=0
for entry in "${ALL_SCENARIOS[@]}"; do
  IDX=$((IDX + 1))
  IFS='|' read -r config scenario <<< "$entry"
  config_path="test/distributed/config/${config}"
  output="${REPORT_DIR}/${scenario}-${TS}.report.json"

  echo "[${IDX}/${TOTAL}] ${scenario} (config: ${config})"

  if $RUNNER \
    --config "$config_path" \
    --scenario "$scenario" \
    --output "$output" \
    "${EXTRA_ARGS[@]}" ; then
    PASSED=$((PASSED + 1))
    echo "  -> PASS"
  else
    FAILED=$((FAILED + 1))
    FAILED_NAMES+=("$scenario")
    echo "  -> FAIL"
  fi
  echo ""
done

echo "========================================"
echo "Results: ${PASSED} passed, ${FAILED} failed out of ${TOTAL}"
if [ ${FAILED} -gt 0 ]; then
  echo "Failed scenarios:"
  for name in "${FAILED_NAMES[@]}"; do
    echo "  - ${name}"
  done
fi
echo "Reports in: ${REPORT_DIR}"
echo "========================================"

# Summarize
node scripts/summarize-harness-runs.js --report-dir "$REPORT_DIR" || true

exit ${FAILED}
