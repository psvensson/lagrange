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
#   DEBUG_LOGS=1 bash scripts/rolling-restart-stat-gate.sh 3   # capture decision trace
#
# Output: test-output/reports/stat-gate-<ts>.{json,md}
#
# Freshness: each run cleans reuse containers first (clean_containers), AND the
# harness now forces a container recreate whenever the src fingerprint changes
# (SRC_FINGERPRINT env), so a code edit can never be measured against a stale
# process. The working-tree fingerprint is stamped into the report below so every
# gate result is attributable to an exact source tree.

set -uo pipefail

N="${1:-${N:-10}}"
CONFIG="${CONFIG:-test/distributed/config/local.json}"
SCENARIO="${SCENARIO:-rolling-restart}"
DEBUG_LOGS="${DEBUG_LOGS:-}"
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

# Working-tree source fingerprint — the exact code these N runs measure.
SRC_FP="$(node --input-type=module -e \
  'import {computeSourceFingerprint} from "./src/diagnostics/source-fingerprint.js"; process.stdout.write(await computeSourceFingerprint("src"));' \
  2>/dev/null || echo unknown)"

DEBUG_LOGS_ARGS=()
DEBUG_LOGS_JSON="false"
if [ -n "${DEBUG_LOGS}" ]; then
  DEBUG_LOGS_ARGS=(--debug-logs)
  DEBUG_LOGS_JSON="true"
fi

# TIME-based no-progress early exit for the active waits (frozen-run cut).
# A run whose readiness gate makes ZERO strictly-better progress for this
# long is frozen by the gate's own definition and is classified STALLED —
# the wait just stops burning the rest of its budget on a determined
# outcome. Progressing (SLOW) runs reset the clock on every improvement and
# are never cut. Set NO_PROGRESS_MAX_ELAPSED_MS=0 to disable (full budgets,
# pre-change behavior).
NO_PROGRESS_MAX_ELAPSED_MS="${NO_PROGRESS_MAX_ELAPSED_MS:-150000}"
EFFECTIVE_CONFIG="${CONFIG}"
TMP_CONFIG=""
if [ "${NO_PROGRESS_MAX_ELAPSED_MS}" != "0" ]; then
  TMP_CONFIG="$(mktemp --suffix=.stat-gate-config.json)"
  jq --argjson ms "${NO_PROGRESS_MAX_ELAPSED_MS}" \
    '.timeouts = (.timeouts // {}) + {activeWaitNoProgressMaxElapsedMs: $ms}' \
    "${CONFIG}" > "${TMP_CONFIG}"
  EFFECTIVE_CONFIG="${TMP_CONFIG}"
fi
trap '[ -n "${TMP_CONFIG}" ] && rm -f "${TMP_CONFIG}"; rm -f "${TMP_NDJSON}"' EXIT

echo "stat-gate: N=${N} config=${CONFIG} scenario=${SCENARIO} ts=${TS} srcFingerprint=${SRC_FP} debugLogs=${DEBUG_LOGS:-0} noProgressMaxElapsedMs=${NO_PROGRESS_MAX_ELAPSED_MS}"

stale_runs=0
for i in $(seq 1 "${N}"); do
  echo "--- run ${i}/${N}: cleaning containers + launching ---"
  clean_containers
  RUN_REPORT="${REPORT_DIR}/stat-gate-${TS}-run${i}.report.json"
  RUN_LOG="/tmp/stat-gate-${TS}-run${i}.log"
  start_s=$(date +%s)
  node test/distributed/run.js \
    --config "${EFFECTIVE_CONFIG}" \
    --scenario "${SCENARIO}" \
    --output "${RUN_REPORT}" \
    "${DEBUG_LOGS_ARGS[@]}" \
    --verbose > "${RUN_LOG}" 2>&1 || true
  end_s=$(date +%s)
  wall_s=$(( end_s - start_s ))

  # Surface the harness stale-code warning loudly — a measurement against stale
  # code is worthless and must never be silently folded into the distribution.
  if grep -q "Stale source detected" "${RUN_LOG}" 2>/dev/null; then
    stale_runs=$(( stale_runs + 1 ))
    echo "run ${i}: !!! STALE SOURCE DETECTED — this run executed old code, result is untrustworthy (see ${RUN_LOG})"
  fi

  if [ -f "${RUN_REPORT}" ]; then
    # Per the 'never break, only slow' gate: classify each run by CORRECTNESS
    # (hard invariant breaches) FIRST, then PROGRESS (deficit decreasing vs
    # frozen). A converged-but-corrupt run is the worst outcome; a slow run that
    # is still making progress is a pass, a frozen (stalled) run is a fail.
    # CL-031: an oracle-blind run is UNJUDGEABLE on its face (the harness
    # could not read snapshot evidence), so it must never be folded into
    # STALLED — that misattributes a harness/transport defect to the cluster.
    rec=$(jq -c '.scenarios[0] as $sc
      | ($sc.invariantBreaches.hardCount // 0) as $hard
      | ($sc.publicationConvergence.missingPublishedCount) as $missing
      | ($sc.details.diagnostics.activeGate.failedNoProgress) as $fnp
      | ($sc.details.diagnostics.activeGate.coordinatorCyclesSinceProgress // 0) as $cyc
      | ($sc.details.diagnostics.activeGate.state // "") as $gstate
      | ($sc.classification
         // (if (($sc.details.diagnostics.unexpectedNodeExits // []) | length) > 0
             then "unexpected_node_exit" else null end)
         // $sc.details.diagnostics.oracleBlind.classification
         // "") as $oblind
      | {passed:($sc.passed // null), missing:$missing, hardBreaches:$hard,
         cyclesNoProgress:$cyc, failedNoProgress:$fnp, gateState:$gstate,
         oracleBlind:($oblind=="oracle_blind"),
         unexpectedNodeExit:($oblind=="unexpected_node_exit"),
         reason:($sc.dominantReason // "none"), duration:($sc.duration // null),
         class:(if $hard>0 then "CORRUPT"
                elif $oblind=="unexpected_node_exit" then "NODE_EXIT"
                elif $missing==0 then "CONVERGED"
                elif $oblind=="oracle_blind" then "ORACLE_BLIND"
                elif ($fnp==true or $cyc>=10 or $gstate=="stalled") then "STALLED"
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
    srcFingerprint: "'"${SRC_FP}"'",
    debugLogs: '"${DEBUG_LOGS_JSON}"',
    noProgressMaxElapsedMs: '"${NO_PROGRESS_MAX_ELAPSED_MS}"',
    staleSourceRuns: '"${stale_runs}"',
    runs: length,
    classTally: ( [.[].class] | group_by(.) | map({(.[0]|tostring): length}) | add ),
    corruptCount: ([.[] | select(.class=="CORRUPT")] | length),
    oracleBlindCount: ([.[] | select(.class=="ORACLE_BLIND")] | length),
    nodeExitCount: ([.[] | select(.class=="NODE_EXIT")] | length),
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
    "- srcFingerprint: \(.srcFingerprint) (debugLogs: \(.debugLogs))",
    "- **staleSourceRuns (untrustworthy — must be 0): \(.staleSourceRuns)**",
    "- **CORRUPT (hard invariant breach — must be 0): \(.corruptCount)**",
    "- **ORACLE_BLIND (unjudgeable — snapshot transport failed, CL-031): \(.oracleBlindCount)**",
    "- **NODE_EXIT (unexpected node death — read its exit evidence, CL-030): \(.nodeExitCount)**",
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
