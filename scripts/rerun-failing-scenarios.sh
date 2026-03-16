#!/usr/bin/env bash
# Re-run all previously failing distributed harness scenarios.
# Results go into test-output/reports/ with a rerun- prefix and timestamp.

set -euo pipefail

TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="test-output/reports"
RUNNER="node test/distributed/run.js"

declare -a SCENARIOS=(
  "local-benchmark-7node.json|diag-admin-discovery"
  "local-benchmark-5node.json|postgres-baseline-comparison"
  "local.json|rolling-restart"
  "local-three-node.json|rolling-restart"
  "local.json|seed-restart-under-load"
  "local-benchmark-7node.json|seven-node-load-during-partitioning"
  "local-benchmark-7node.json|seven-node-read-write-load-distribution"
  "local-benchmark-7node.json|seven-node-read-write-load-transaction-recovery"
  "local-benchmark-7node.json|seven-node-table-partition-distribution"
)

mkdir -p "$REPORT_DIR"

for entry in "${SCENARIOS[@]}"; do
  IFS='|' read -r config scenario <<< "$entry"
  config_path="test/distributed/config/${config}"
  output="${REPORT_DIR}/rerun-${scenario}-${TS}.report.json"

  echo ""
  echo "========================================"
  echo "Running: ${scenario} (config: ${config})"
  echo "Output:  ${output}"
  echo "========================================"

  $RUNNER \
    --config "$config_path" \
    --scenario "$scenario" \
    --output "$output" \
    --verbose \
    || echo "  *** ${scenario} exited with non-zero status ***"
done

echo ""
echo "========================================"
echo "All reruns complete. Summarizing..."
echo "========================================"
node scripts/summarize-harness-runs.js --report-dir "$REPORT_DIR"
