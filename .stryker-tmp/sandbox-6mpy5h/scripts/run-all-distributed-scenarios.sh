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

sanitize_report_component() {
  local value="${1:-unknown}"
  value="${value//[^A-Za-z0-9._-]/-}"
  value="${value#-}"
  value="${value%-}"
  if [ -z "$value" ]; then
    value="unknown"
  fi
  printf '%s' "$value"
}

mapfile -t ALL_SCENARIOS < <(
  node --input-type=module <<'EOF'
import {
  formatCanonicalScenarioMatrixLines,
} from './test/distributed/harness/scenario-registry.js';

for (const entry of formatCanonicalScenarioMatrixLines()) {
  console.log(entry);
}
EOF
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
  config_tag="$(sanitize_report_component "${config%.json}")"
  scenario_tag="$(sanitize_report_component "${scenario}")"
  output="${REPORT_DIR}/${scenario_tag}-${config_tag}-${TS}.report.json"

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
    FAILED_NAMES+=("${scenario} (${config_tag})")
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
