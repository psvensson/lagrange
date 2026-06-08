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
    # Per the 'never break, only slow' gate: classify each run by CORRECTNESS
    # (hard invariant breaches) FIRST, then PROGRESS (deficit decreasing vs
    # frozen). A converged-but-corrupt run is the worst outcome; a slow run that
    # is still making progress is a pass, a frozen (stalled) run is a fail.
    rec=$(jq -c '.scenarios[0] as $sc
      | ($sc.invariantBreaches.hardCount // 0) as $hard
      | ($sc.publicationConvergence.missingPublishedCount) as $missing
      | ($sc.details.diagnostics.activeGate.failedNoProgress) as $fnp
      | ($sc.details.diagnostics.activeGate.coordinatorCyclesSinceProgress // 0) as $cyc
      | {passed:($sc.passed // null), missing:$missing, hardBreaches:$hard,
         cyclesNoProgress:$cyc, failedNoProgress:$fnp,
         reason:($sc.dominantReason // "none"), duration:($sc.duration // null),
         class:(if $hard>0 then "CORRUPT"
                elif $missing==0 then "CONVERGED"
                elif ($fnp==true or $cyc>=10) then "STALLED"
                else "SLOW" end)}' "${RUN_REPORT}" 2>/dev/null)
  else
    rec=""
  fi
  [ -z "${rec}" ] && rec='{"passed":null,"missing":null,"hardBreaches":null,"cyclesNoProgress":null,"failedNoProgress":null,"reason":"no_report","duration":null,"class":"NO_REPORT"}'
  class=$(echo "${rec}" | jq -r '.class')
  missing=$(echo "${rec}" | jq -r '.missing')
  hard=$(echo "${rec}" | jq -r '.hardBreaches')
  echo "run ${i}: class=${class} missing=${missing} hardBreaches=${hard} wall=${wall_s}s"
  echo "${rec}" | jq -c --argjson run "${i}" --argjson wall "${wall_s}" \
    '. + {run:$run, wallSeconds:$wall}' >> "${TMP_NDJSON}"
done

# Aggregate.
jq -s '
  def pct(p): (sort | if length==0 then null else .[((length-1)*p)|floor] end);
  {
    timestamp: "'"${TS}"'", config: "'"${CONFIG}"'", scenario: "'"${SCENARIO}"'",
    runs: length,
    classTally: ( [.[].class] | group_by(.) | map({(.[0]|tostring): length}) | add ),
    corruptCount: ([.[] | select(.class=="CORRUPT")] | length),
    convergeRate: ( (([.[] | select(.missing==0)] | length) ) / (length) ),
    stallRate: ( (([.[] | select(.class=="STALLED")] | length) ) / (length) ),
    healthyRate: ( (([.[] | select(.class=="CONVERGED" or .class=="SLOW")] | length) ) / (length) ),
    converged: ([.[] | select(.missing==0)] | length),
    passRate: ( (([.[] | select(.passed==true)] | length) ) / (length) ),
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
    "- **CORRUPT (hard invariant breach — must be 0): \(.corruptCount)**",
    "- stallRate (frozen / gave up): \(.stallRate)",
    "- healthyRate (converged or progressing): \(.healthyRate)",
    "- convergeRate (missing=0): \(.convergeRate)",
    "- wallSeconds p50/p95: \(.wallSeconds.p50) / \(.wallSeconds.p95)",
    "",
    "## classification (correctness-first, then progress)",
    (.classTally | to_entries[] | "- \(.key): \(.value)"),
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
