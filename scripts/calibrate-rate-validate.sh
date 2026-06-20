#!/usr/bin/env bash
# Rate-invariance validation for the hardware-relative convergence budget.
#
# Runs the rolling-restart stat-gate at a constrained cpus level, N runs WITH
# calibration (machine factor scales the work-bound budgets) and N runs WITHOUT
# (nominal budgets, factor 1.0), then compares the strict scenario-verdict PASS
# rate + SAFE rate between the two arms. If calibration is load-bearing on slow
# hardware, the WITH arm's PASS rate should exceed the WITHOUT arm's (the WITHOUT
# arm loses runs to budget-bound BLOCK_TOPOLOGY_CONVERGENCE timeouts).
#
# Usage: bash scripts/calibrate-rate-validate.sh [N] [CPUS_LEVEL]
#   N defaults to 8 (a rate-promotion verdict); CPUS_LEVEL defaults to 0.75
#   (mild enough that cpus=1.0 reliably passes, so the contrast is clean).

set -uo pipefail
cd "$(dirname "$0")/.."

N="${1:-8}"
CPUS_LEVEL="${2:-0.75}"
REPORT_DIR="test-output/reports"

aggregate() {
  local label="$1" ts="$2"
  node -e "
    const fs=require('fs'); const ts='$ts'; const N=$N; const dir='$REPORT_DIR';
    const verdicts={}; let total=0, pass=0, converged=0, safe=0;
    for(let i=1;i<=N;i++){
      const f=dir+'/stat-gate-'+ts+'-run'+i+'.report.json';
      if(!fs.existsSync(f)) continue;
      const s=JSON.parse(fs.readFileSync(f,'utf8')).scenarios[0];
      total++;
      const v=s.verdict||'?'; verdicts[v]=(verdicts[v]||0)+1;
      if(v==='PASS') pass++;
      const det=s.details&&s.details.loadMetrics; // missing=0 proxy via classification
      const br=s.invariantBreaches||{};
      const exits=s.unexpectedNodeExits||[];
      if((br.hardCount||0)===0 && exits.length===0) safe++;
    }
    console.log('  arm=$label ts='+ts+' total='+total+' PASS='+pass+'/'+total+
      ' SAFE='+safe+'/'+total+' verdicts='+JSON.stringify(verdicts));
  "
}

run_arm() {
  local label="$1" calibrate="$2"
  local log="test-output/calib-rate-${label}.log"
  echo "########## ARM ${label}: cpus=${CPUS_LEVEL} N=${N} CALIBRATE=${calibrate} ##########"
  CALIBRATE="${calibrate}" CPUS="${CPUS_LEVEL}" N="${N}" \
    bash scripts/rolling-restart-stat-gate.sh "${N}" > "${log}" 2>&1 || true
  grep -E "^stat-gate:|machineFactor=" "${log}" | head -1
  local ts
  ts="$(grep -oE 'stat-gate-[0-9T]+Z\.md' "${log}" | head -1 | sed -E 's/stat-gate-(.*)\.md/\1/')"
  if [ -z "${ts}" ]; then echo "  arm=${label}: FAILED to find report ts (see ${log})"; return; fi
  aggregate "${label}" "${ts}"
}

echo "=== rate-invariance validation: cpus=${CPUS_LEVEL}, N=${N} per arm ==="
run_arm "cal"   "1"
run_arm "nocal" "0"
echo "=== DONE — compare PASS rates above (WITH cal should be >= WITHOUT if load-bearing) ==="
