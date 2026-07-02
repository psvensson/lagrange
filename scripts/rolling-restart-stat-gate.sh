#!/usr/bin/env bash
# Statistical convergence gate for the rolling-restart scenario.
#
# The rolling-restart non-convergence is a metastable / load-timing race:
# missingPublishedCount swings 0-4 across identical runs, so single-run pass/fail
# is meaningless. This runs the scenario N times from CLEAN containers (no
# warm-state reuse confound) and emits a distribution: pass-rate,
# missingPublishedCount histogram, duration percentiles, dominant-reason tally.
#
# See solve/specs/metastable-convergence-resilience/ (Phase 0).
#
# Sample size — SMALLEST FIRST (see docs/steering/operational-ground-truth.md
# "Deterministic-first, gate-last"): start with the lowest N that could answer the
# question and escalate ONLY when a small run is inconclusive. Default to N=3 — it
# is also the `rolling-restart-core-stability` doneWhen streak (3 consecutive
# scenario-PASS), so a clean 3/3 satisfies closure; a hard breach/corruption is
# conclusive even sooner. Reserve N>=8 for a convergence-RATE promotion verdict
# where the statistic itself is the claim. The N=10 arg-default below is a legacy
# ceiling, NOT a recommendation — pass the run count explicitly, lowest-first.
#
# Usage:
#   bash scripts/rolling-restart-stat-gate.sh 3          # N=3  (start here)
#   bash scripts/rolling-restart-stat-gate.sh 8          # N=8  (rate promotion verdict)
#   bash scripts/rolling-restart-stat-gate.sh            # N=10 (legacy default — avoid)
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
#
# Runtime fidelity: the gate passes --no-fast-local so measurements exercise the
# built runtime image entrypoint/CMD directly. Fast-local reusable containers are
# for local iteration, not statistical release evidence.

set -uo pipefail

N="${1:-${N:-10}}"
# N is the FIRST positional arg; a non-numeric value (e.g. someone passing only
# --allow-perturbing-logs) would make `seq 1 $N` error and — with set -e off —
# silently aggregate an empty distribution. Fail loud instead.
case "${N}" in
  ''|*[!0-9]*)
    echo "GATE ABORTED: N must be a positive integer (got '${N}'). Pass run count as the FIRST arg, e.g. 'bash $0 4 --allow-perturbing-logs'." >&2
    exit 2
    ;;
esac
CONFIG="${CONFIG:-test/distributed/config/local.json}"
SCENARIO="${SCENARIO:-rolling-restart}"
DEBUG_LOGS="${DEBUG_LOGS:-}"

# Host-orchestrator heap floor. The run.js orchestrator aggregates every node's
# events + log capture on the host; a full rolling-restart (~570s) can push its
# live set past Node's default ~4GB old-space cap, at which point it dies with
# "JavaScript heap out of memory" BEFORE emitting a report. The gate then counts
# that run as NO_REPORT — a silent OOM masquerading as a non-result (an
# absence-proves-nothing trap; see operational-ground-truth.md). Raise the cap so
# a real verdict is produced. Respect a caller-set --max-old-space-size.
if [[ "${NODE_OPTIONS:-}" != *"max-old-space-size"* ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--max-old-space-size=${STAT_GATE_MAX_OLD_SPACE_MB:-8192}"
fi
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

# WS10: abort the gate fail-closed, but never leave docker resources stranded —
# the next run's leftover-container preflight would otherwise trip on our mess.
abort_gate() {
  echo "GATE ABORTED: $1" >&2
  clean_containers
  exit 1
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

# WS10 debug-logs guard: --debug-logs floods the busy seed's stdout (~10k lines/s)
# and perturbs the very convergence this gate measures (observer effect on the
# seed). Refuse to fold a perturbed run into a measurement distribution unless the
# operator explicitly opts in (e.g. when they WANT the decision trace, not a verdict).
ALLOW_PERTURBING_LOGS=""
for arg in "$@"; do
  [ "${arg}" = "--allow-perturbing-logs" ] && ALLOW_PERTURBING_LOGS="1"
done
if [ -n "${DEBUG_LOGS}" ] && [ -z "${ALLOW_PERTURBING_LOGS}" ]; then
  abort_gate "DEBUG_LOGS is set — debug logging perturbs seed convergence and invalidates the measurement. Re-run without DEBUG_LOGS, or pass --allow-perturbing-logs to capture a decision trace knowingly (not a verdict)."
fi

# WS10 leftover-container preflight: a measurement on top of a previous run's
# warm containers is a stale-state confound. clean_containers ran above; assert it
# actually cleared, fail-closed if docker left anything behind.
clean_containers
LEFTOVER="$(docker ps -aq --filter "name=ddb-test-reuse-" 2>/dev/null | wc -l | tr -d ' ')"
if [ "${LEFTOVER}" != "0" ]; then
  abort_gate "container cleanup failed — ${LEFTOVER} ddb-test-reuse-* container(s) still present; refusing to measure on warm state."
fi

# TIME-based no-progress early exit for the active waits (frozen-run cut).
# A run whose readiness gate makes ZERO strictly-better progress for this
# long is frozen by the gate's own definition and is classified STALLED —
# the wait just stops burning the rest of its budget on a determined
# outcome. Progressing (SLOW) runs reset the clock on every improvement and
# are never cut. Set NO_PROGRESS_MAX_ELAPSED_MS=0 to disable (full budgets,
# pre-change behavior).
# Default lifted 150s -> 200s (operator decision 2026-07-02): the residual
# TOPOLOGY_BLOCKED head is the bounded latency of a proven-convergent loop
# (self-stabilization proof, 37175d73), so the cut was truncating convergent
# runs, not detecting frozen ones.
NO_PROGRESS_MAX_ELAPSED_MS="${NO_PROGRESS_MAX_ELAPSED_MS:-200000}"
# CPUS overlays the per-node container cpu limit (resourceLimits.cpus) for
# hardware-triangulation runs; empty = use the config's value.
CPUS="${CPUS:-}"

# --- Machine calibration: scale work-bound convergence budgets to this host/cpus.
# Runs the hot-path probe ONCE (factor is a property of the machine, constant
# across the gate's runs) and exports LAGRANGE_MACHINE_FACTOR, which the harness
# reads at scenario-config time (convergence-budget-calibration.js + the
# rolling-restart scenario's work-bound timeouts). CALIBRATE=0 or a pre-set
# LAGRANGE_MACHINE_FACTOR skips the probe. cpuScaling comes from the stored
# triangulation table; an empty table (pre-triangulation) yields factor ~1.0, so
# triangulation runs measure RAW settle to BUILD the table. Computed BEFORE the
# config overlay so the shell's own no-progress frozen-cut scales too.
EFFECTIVE_CPUS="${CPUS:-$(jq -r '.resourceLimits.cpus // "1.0"' "${CONFIG}" 2>/dev/null || echo 1.0)}"
if [ "${CALIBRATE:-1}" != "0" ] && [ -z "${LAGRANGE_MACHINE_FACTOR:-}" ]; then
  CAL_ENV="$(node scripts/calibrate-machine.js --cpus "${EFFECTIVE_CPUS}" --emit-env 2>/dev/null || true)"
  if [ -n "${CAL_ENV}" ]; then export "${CAL_ENV?}"; fi
fi
MACHINE_FACTOR="${LAGRANGE_MACHINE_FACTOR:-1.0}"

# The TIME-based no-progress frozen-cut is itself work-bound, so scale it by the
# machine factor (a slow box must not be cut off before its scaled work budget).
NO_PROGRESS_EFFECTIVE_MS="${NO_PROGRESS_MAX_ELAPSED_MS}"
if [ "${NO_PROGRESS_MAX_ELAPSED_MS}" != "0" ]; then
  NO_PROGRESS_EFFECTIVE_MS="$(node -e "process.stdout.write(String(Math.round(${NO_PROGRESS_MAX_ELAPSED_MS} * ${MACHINE_FACTOR})))" 2>/dev/null || echo "${NO_PROGRESS_MAX_ELAPSED_MS}")"
fi

EFFECTIVE_CONFIG="${CONFIG}"
TMP_CONFIG=""
if [ "${NO_PROGRESS_EFFECTIVE_MS}" != "0" ] || [ -n "${CPUS}" ]; then
  TMP_CONFIG="$(mktemp --suffix=.stat-gate-config.json)"
  jq --argjson ms "${NO_PROGRESS_EFFECTIVE_MS}" --arg cpus "${CPUS}" '
    (if $ms != 0 then .timeouts = (.timeouts // {}) + {activeWaitNoProgressMaxElapsedMs: $ms} else . end)
    | (if $cpus != "" then .resourceLimits = (.resourceLimits // {}) + {cpus: $cpus} else . end)
  ' "${CONFIG}" > "${TMP_CONFIG}"
  EFFECTIVE_CONFIG="${TMP_CONFIG}"
fi
trap '[ -n "${TMP_CONFIG}" ] && rm -f "${TMP_CONFIG}"; rm -f "${TMP_NDJSON}"' EXIT

echo "stat-gate: N=${N} config=${CONFIG} scenario=${SCENARIO} ts=${TS} srcFingerprint=${SRC_FP} debugLogs=${DEBUG_LOGS:-0} noProgressMaxElapsedMs=${NO_PROGRESS_EFFECTIVE_MS}(base ${NO_PROGRESS_MAX_ELAPSED_MS}) cpus=${EFFECTIVE_CPUS} machineFactor=${MACHINE_FACTOR}"

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
    --no-fast-local \
    --verbose > "${RUN_LOG}" 2>&1 || true
  end_s=$(date +%s)
  wall_s=$(( end_s - start_s ))

  # WS10 stale-source HARD FAIL: a measurement against stale code is worthless.
  # The harness emits "Stale source detected" (from the per-node boot
  # srcFingerprintMatches===false check) into the run log; previously this gate
  # merely counted staleSourceRuns and folded the run into the distribution.
  # Now it aborts fail-closed (with docker cleanup) so a stale verdict can never
  # be reported. Set ALLOW_STALE_SOURCE=1 only to deliberately study stale behavior.
  if grep -q "Stale source detected" "${RUN_LOG}" 2>/dev/null; then
    stale_runs=$(( stale_runs + 1 ))
    if [ -z "${ALLOW_STALE_SOURCE:-}" ]; then
      abort_gate "run ${i} executed STALE code (src fingerprint mismatch — see ${RUN_LOG}). Force-fresh containers and confirm SRC_FINGERPRINT before measuring."
    fi
    echo "run ${i}: !!! STALE SOURCE DETECTED — untrustworthy, but ALLOW_STALE_SOURCE set (see ${RUN_LOG})"
  fi

  if [ -f "${RUN_REPORT}" ]; then
    # Per the 'never break, only slow' gate: classify each run by CORRECTNESS
    # (hard invariant breaches) FIRST, then PROGRESS (deficit decreasing vs
    # frozen). A converged-but-corrupt run is the worst outcome; a slow run that
    # is still making progress is a pass, a frozen (stalled) run is a fail.
    # CL-031: an oracle-blind run is UNJUDGEABLE on its face (the harness
    # could not read snapshot evidence), so it must never be folded into
    # STALLED — that misattributes a harness/transport defect to the cluster.
    rec=$(node scripts/rolling-restart-stat-gate-summary.js classify-run "${RUN_REPORT}")
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
    topologyBlockedCount: ([.[] | select(.class=="TOPOLOGY_BLOCKED")] | length),
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

# Sealed-bar verdict (docs/convergence-donewhen-metric.md §5/§7a): Wilson-95
# lower bound of the PASS rate vs the sealed bar, ANDed with the hard SAFETY
# floor. Mechanizes what was previously operator-applied arithmetic.
verdict_json=$(node scripts/rolling-restart-stat-gate-summary.js gate-verdict "${OUT_JSON}")
jq --argjson verdict "${verdict_json}" '. + {gateVerdict: $verdict}' \
  "${OUT_JSON}" > "${OUT_JSON}.tmp" && mv "${OUT_JSON}.tmp" "${OUT_JSON}"

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
    "- **TOPOLOGY_BLOCKED (scenario failed after publication convergence): \(.topologyBlockedCount)**",
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
  node scripts/rolling-restart-stat-gate-summary.js gate-verdict-md "${OUT_JSON}"
} > "${OUT_MD}"

# Persist the per-run NDJSON next to the gate summary — the cross-gate trend
# query (scripts/query-gate-trends.js) and any ad-hoc jq join read it; it was
# previously built here and then deleted.
mv "${TMP_NDJSON}" "${REPORT_DIR}/stat-gate-${TS}-runs.ndjson"
echo "=== summary -> ${OUT_MD} ==="
cat "${OUT_MD}"

# Bounded retention: the harness compares against up to 20 historical reports
# and the census scripts scan the per-run corpus, so the keep floor (24) stays
# ABOVE that window — never lower it below 20. Gate aggregates + runs.ndjson
# (the trend ledger) are exempt inside the pruner. Non-fatal: retention must
# never fail a gate.
node scripts/prune-test-output.js --apply --keep-days 7 \
  --keep-reports 24 --keep-report-playbacks 24 \
  || echo "WARN: post-gate prune failed (non-fatal)"

# WS10 read recipe: per-node full logs are GZIPPED under the default (non-debug)
# path. Plain grep finds nothing and looks "missing" — use zcat/zgrep.
echo
echo "=== full per-node logs (gzipped — use zcat/zgrep) ==="
echo "  ls ${REPORT_DIR}/.playback/*/.full-logs/${SCENARIO}/ 2>/dev/null || ls test-output/reports/.playback"
echo "  zcat ${REPORT_DIR}/.playback/<run>/.full-logs/${SCENARIO}/<nodeId>.log.gz | less"
