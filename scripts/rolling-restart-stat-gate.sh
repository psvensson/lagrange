#!/usr/bin/env bash
# Statistical convergence gate for the rolling-restart scenario.
#
# The rolling-restart non-convergence is a metastable / load-timing race:
# missingPublishedCount swings 0-4 across identical runs, so single-run pass/fail
# is meaningless. This runs the scenario N times from CLEAN containers (no
# warm-state reuse confound) and emits a distribution: pass-rate,
# missingPublishedCount histogram, duration percentiles, dominant-reason tally.
#
# See .kiro/specs/metastable-convergence-resilience/ (Phase 0).
#
# Usage:
#   bash scripts/rolling-restart-stat-gate.sh            # N=10 (default)
#   bash scripts/rolling-restart-stat-gate.sh 5          # N=5
#   N=3 CONFIG=test/distributed/config/local.json bash scripts/rolling-restart-stat-gate.sh
#
# Output: test-output/reports/stat-gate-<ts>.{json,md}

set -uo pipefail

N="${1:-${N:-10}}"
CONFIG="${CONFIG:-test/distributed/config/local.json}"
SCENARIO="${SCENARIO:-rolling-restart}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="test-output/reports"
TMP_NDJSON="$(mktemp)"
OUT_JSON="${REPORT_DIR}/stat-gate-${TS}.json"
OUT_MD="${REPORT_DIR}/stat-gate-${TS}.md"

mkdir -p "${REPORT_DIR}"

clean_containers() {
  docker ps -aq --filter "name=ddb-test-reuse-" 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' 2>/dev/null | grep '^ddb-test-net-reuse-local-' | xargs -r docker network rm >/dev/null 2>&1 || true
}

echo "stat-gate: N=${N} config=${CONFIG} scenario=${SCENARIO} ts=${TS}"

for i in $(seq 1 "${N}"); do
  echo "--- run ${i}/${N}: cleaning containers + launching ---"
  clean_containers
  RUN_REPORT="${REPORT_DIR}/stat-gate-${TS}-run${i}.report.json"
  RUN_LOG="/tmp/stat-gate-${TS}-run${i}.log"
  start_s=$(date +%s)
  node test/distributed/run.js \
    --config "${CONFIG}" \
    --scenario "${SCENARIO}" \
    --output "${RUN_REPORT}" \
    --verbose > "${RUN_LOG}" 2>&1 || true
  end_s=$(date +%s)
  wall_s=$(( end_s - start_s ))

  if [ -f "${RUN_REPORT}" ]; then
    passed=$(jq -r '.scenarios[0].passed // null' "${RUN_REPORT}" 2>/dev/null || echo null)
    missing=$(jq -r '.scenarios[0].publicationConvergence.missingPublishedCount // null' "${RUN_REPORT}" 2>/dev/null || echo null)
    reason=$(jq -r '.scenarios[0].dominantReason // "none"' "${RUN_REPORT}" 2>/dev/null || echo none)
    duration=$(jq -r '.scenarios[0].duration // null' "${RUN_REPORT}" 2>/dev/null || echo null)
  else
    passed=null; missing=null; reason="no_report"; duration=null
  fi
  echo "run ${i}: passed=${passed} missing=${missing} reason=${reason} wall=${wall_s}s"
  jq -cn \
    --argjson run "${i}" \
    --argjson passed "${passed:-null}" \
    --argjson missing "${missing:-null}" \
    --arg reason "${reason}" \
    --argjson duration "${duration:-null}" \
    --argjson wall "${wall_s}" \
    '{run:$run, passed:$passed, missing:$missing, reason:$reason, duration:$duration, wallSeconds:$wall}' \
    >> "${TMP_NDJSON}" 2>/dev/null || \
    echo "{\"run\":${i},\"passed\":null,\"missing\":null,\"reason\":\"parse_error\",\"duration\":null,\"wallSeconds\":${wall_s}}" >> "${TMP_NDJSON}"
done

# Aggregate.
jq -s '
  def pct(p): (sort | if length==0 then null else .[((length-1)*p)|floor] end);
  {
    timestamp: "'"${TS}"'", config: "'"${CONFIG}"'", scenario: "'"${SCENARIO}"'",
    runs: length,
    converged: ([.[] | select(.missing==0)] | length),
    passRate: ( (([.[] | select(.passed==true)] | length) ) / (length) ),
    convergeRate: ( (([.[] | select(.missing==0)] | length) ) / (length) ),
    missingHistogram: ( [.[].missing] | group_by(.) | map({(.[0]|tostring): length}) | add ),
    dominantReasonTally: ( [.[].reason] | group_by(.) | map({(.[0]|tostring): length}) | add ),
    wallSeconds: { p50: ([.[].wallSeconds]|pct(0.5)), p95: ([.[].wallSeconds]|pct(0.95)) },
    durationP50: ([.[].duration | select(.!=null)]|pct(0.5)),
    durationP95: ([.[].duration | select(.!=null)]|pct(0.95)),
    runsDetail: .
  }' "${TMP_NDJSON}" > "${OUT_JSON}"

# Markdown summary.
{
  echo "# Rolling-restart statistical gate — ${TS}"
  echo
  jq -r '
    "- runs: \(.runs)",
    "- converged (missing=0): \(.converged)/\(.runs)  (rate \(.convergeRate))",
    "- passRate: \(.passRate)",
    "- wallSeconds p50/p95: \(.wallSeconds.p50) / \(.wallSeconds.p95)",
    "",
    "## missingPublishedCount histogram",
    (.missingHistogram | to_entries[] | "- missing=\(.key): \(.value)"),
    "",
    "## dominant reason tally",
    (.dominantReasonTally | to_entries[] | "- \(.key): \(.value)")
  ' "${OUT_JSON}"
} > "${OUT_MD}"

rm -f "${TMP_NDJSON}"
echo "=== summary -> ${OUT_MD} ==="
cat "${OUT_MD}"
