#!/usr/bin/env bash
# Re-run only the distributed scenarios that failed in the most recent reports.
# Scans test-output/reports/ recursively for *.report.json files, finds the
# latest local-target report per canonical config+scenario, and re-runs only
# those whose latest result failed. Lab/GCP failures stay on their own target.
#
# Usage:
#   bash scripts/rerun-failed-distributed-scenarios.sh
#   bash scripts/rerun-failed-distributed-scenarios.sh --verbose
#   bash scripts/rerun-failed-distributed-scenarios.sh --report-dir path/to/reports
#   bash scripts/rerun-failed-distributed-scenarios.sh --dry-run

set -euo pipefail

TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="test-output/reports"
RUNNER="node test/distributed/run.js"
DRY_RUN=false
EXTRA_ARGS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-dir)
      REPORT_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ ! -d "$REPORT_DIR" ]; then
  echo "Report directory not found: ${REPORT_DIR}"
  echo "Run all scenarios first with: bash scripts/run-all-distributed-scenarios.sh"
  exit 1
fi

# Use find-failing-reports.mjs to discover failed scenarios, then map them
# back to config+scenario pairs for re-execution.
echo "Scanning ${REPORT_DIR} for failed scenarios..."
echo ""

FAILED_ENTRIES=$(node -e "
import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {
  CANONICAL_SCENARIO_MATRIX,
  normalizeScenarioConfigName,
} from './test/distributed/harness/scenario-registry.js';

const dir = resolve('${REPORT_DIR}');
const LOCAL_TARGET = 'local';
const REPORT_SUFFIX = '.report.json';
const results = [];
const canonicalEntriesByScenario = new Map();
for (const entry of CANONICAL_SCENARIO_MATRIX) {
  if (!canonicalEntriesByScenario.has(entry.name)) {
    canonicalEntriesByScenario.set(entry.name, []);
  }
  canonicalEntriesByScenario.get(entry.name).push(entry);
}

function resolveCanonicalConfigForScenario(scenario, configPathOrName) {
  const normalizedConfig = normalizeScenarioConfigName(configPathOrName);
  const canonicalEntries = canonicalEntriesByScenario.get(scenario) || [];
  if (canonicalEntries.length === 0) {
    return normalizedConfig;
  }
  if (normalizedConfig &&
      canonicalEntries.some((entry) => entry.config === normalizedConfig)) {
    return normalizedConfig;
  }
  if (canonicalEntries.length === 1) {
    return canonicalEntries[0].config;
  }
  return normalizedConfig;
}

function listReportFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listReportFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(REPORT_SUFFIX)) {
      files.push(path);
    }
  }
  return files;
}

for (const file of listReportFiles(dir)) {
  try {
    const r = JSON.parse(readFileSync(file, 'utf8'));
    const target = r.metadata?.executionTarget;
    if (target && target !== LOCAL_TARGET) continue;
    const s = r.scenarios && r.scenarios[0];
    if (!s) continue;
    const configPath =
      r.metadata?.matrixConfig ||
      r.config?.configPath ||
      r.metadata?.configPath ||
      '';
    const scenario = s.scenario;
    const ts = r.timestamp || '';
    if (!scenario) continue;
    const config = resolveCanonicalConfigForScenario(scenario, configPath);
    if (!config) continue;
    results.push({
      scenario,
      config,
      ts,
      passed: s.passed === true,
      file,
    });
  } catch (_e) { /* skip */ }
}

// Select the latest local result for each canonical config+scenario first.
// Only after that selection do we decide whether it still needs a rerun.
results.sort((a, b) => b.ts.localeCompare(a.ts));
const seen = new Set();
for (const r of results) {
  const key = r.config + '|' + r.scenario;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!r.passed) console.log(key);
}
") || true

if [ -z "$FAILED_ENTRIES" ]; then
  echo "No failed scenarios found in ${REPORT_DIR}. All clear."
  exit 0
fi

# Convert to array
mapfile -t ENTRIES <<< "$FAILED_ENTRIES"
TOTAL=${#ENTRIES[@]}

echo "Found ${TOTAL} failed scenario(s) to re-run:"
for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r config scenario <<< "$entry"
  echo "  - ${scenario} (${config})"
done
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "(dry-run mode — not executing)"
  exit 0
fi

PASSED=0
FAILED=0
FAILED_NAMES=()

mkdir -p "$REPORT_DIR"

IDX=0
for entry in "${ENTRIES[@]}"; do
  IDX=$((IDX + 1))
  IFS='|' read -r config scenario <<< "$entry"
  config_path="test/distributed/config/${config}"
  output="${REPORT_DIR}/rerun-${scenario}-${TS}.report.json"

  echo "[${IDX}/${TOTAL}] Re-running: ${scenario} (config: ${config})"

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

  # Stamp the report body as a retry so summaries can distinguish a
  # passed-on-retry from a clean pass (the rerun- filename prefix alone is
  # invisible to consumers that read report content, not filenames).
  if [ -f "$output" ]; then
    jq '. + {isRerun: true}' "$output" > "${output}.tmp" && \
      mv "${output}.tmp" "$output" || rm -f "${output}.tmp"
  fi
  echo ""
done

echo "========================================"
echo "Rerun results: ${PASSED} passed, ${FAILED} failed out of ${TOTAL}"
if [ ${FAILED} -gt 0 ]; then
  echo "Still failing:"
  for name in "${FAILED_NAMES[@]}"; do
    echo "  - ${name}"
  done
fi
echo "Reports in: ${REPORT_DIR}"
echo "========================================"

# Summarize
node scripts/summarize-harness-runs.js --report-dir "$REPORT_DIR" || true

exit ${FAILED}
