#!/usr/bin/env bash
# Task-27 distributed gate with single rerun cap.
# Fails hard with diagnostics when progress stalls after one rerun.

set -euo pipefail

TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="test-output/reports/task27-stall-gate-${TS}"
RUNNER="node test/distributed/run.js"
MAX_RERUNS=1
EXTRA_ARGS=()

declare -a SCENARIOS=(
  "local.json|rolling-restart"
  "local.json|node-join-under-load"
  "local.json|seed-restart-under-load"
  "local-benchmark-7node.json|seven-node-read-write-load-transaction-recovery"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-dir)
      REPORT_DIR="$2"
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

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

emit_failure_diagnostics() {
  local report_path="$1"
  local scenario_name="$2"
  local run_id
  run_id="$(basename "${report_path}" .report.json)"
  local failure_bundle_path=".tmp/.playback/${run_id}/${scenario_name}/failure-bundle.json"

  echo ""
  echo "Hard failure diagnostics for ${scenario_name}:"
  node -e "
const fs = require('node:fs');
const reportPath = process.argv[1];
const scenarioName = process.argv[2];
try {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const scenario = Array.isArray(report.scenarios) ?
    report.scenarios.find((entry) => entry && entry.scenario === scenarioName) :
    null;
  const diagnostics = scenario?.details?.diagnostics || {};
  const noProgress = diagnostics.noProgress || {};
  const publicationConvergence = diagnostics.publicationConvergence || {};
  console.log('- report: ' + reportPath);
  console.log('- scenario: ' + scenarioName);
  console.log('- passed: ' + String(scenario?.passed === true));
  console.log('- error: ' + String(scenario?.error || 'none'));
  console.log('- noProgress.reasonCode: ' + String(noProgress.reasonCode || 'none'));
  console.log('- noProgress.stalledReason: ' + String(noProgress.stalledReason || 'none'));
  console.log('- publication.status: ' + String(publicationConvergence.publicationStatus || 'none'));
  console.log(
    '- publication.gateReasons: ' +
      JSON.stringify(publicationConvergence.publicationConvergenceGateReasons || []),
  );
  const classIds = publicationConvergence.priorityRecoveryProgressClassIds || [];
  console.log('- priorityRecovery.progressClasses: ' + JSON.stringify(classIds));
} catch (error) {
  console.log('- report parse error: ' + String(error.message || error));
}
" "$report_path" "$scenario_name"

  if [ -f "${failure_bundle_path}" ]; then
    echo "- failure bundle: ${failure_bundle_path}"
    jq '{
      failure: .summary.failure,
      publicationConvergence: .publicationConvergence,
      selectedSnapshots: .controlPlane.priorityRecoveryDecisionSnapshots
    }' "${failure_bundle_path}" || true
  else
    echo "- failure bundle: missing (${failure_bundle_path})"
  fi
  echo ""
}

mkdir -p "${REPORT_DIR}"

echo "========================================"
echo "Task-27 distributed progress-stall gate"
echo "report dir: ${REPORT_DIR}"
echo "single rerun cap: ${MAX_RERUNS}"
echo "========================================"
echo ""

total=${#SCENARIOS[@]}
passed=0
failed=0

for entry in "${SCENARIOS[@]}"; do
  IFS='|' read -r config scenario <<< "${entry}"
  config_path="test/distributed/config/${config}"
  config_tag="$(sanitize_report_component "${config%.json}")"
  scenario_tag="$(sanitize_report_component "${scenario}")"

  attempt=0
  scenario_passed=false
  last_report=""
  while [ "${attempt}" -le "${MAX_RERUNS}" ]; do
    attempt=$((attempt + 1))
    report_path="${REPORT_DIR}/${scenario_tag}-${config_tag}-attempt${attempt}.report.json"
    last_report="${report_path}"

    echo "[${scenario}] attempt ${attempt}/$((MAX_RERUNS + 1))"
    if ${RUNNER} \
      --config "${config_path}" \
      --scenario "${scenario}" \
      --output "${report_path}" \
      "${EXTRA_ARGS[@]}"; then
      scenario_passed=true
      break
    fi
    if [ "${attempt}" -le "${MAX_RERUNS}" ]; then
      echo "  -> failed, rerunning once for deterministic confirmation"
    fi
  done

  if [ "${scenario_passed}" = true ]; then
    passed=$((passed + 1))
    echo "  -> PASS"
  else
    failed=$((failed + 1))
    echo "  -> FAIL (hard)"
    emit_failure_diagnostics "${last_report}" "${scenario}"
  fi
  echo ""
done

echo "========================================"
echo "Task-27 stall gate: ${passed} passed, ${failed} failed, total ${total}"
echo "Reports in: ${REPORT_DIR}"
echo "========================================"

exit "${failed}"

