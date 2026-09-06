#!/usr/bin/env bash
# One controlled live A/B sample for transaction-recovery-poison-row-invariant.
# Usage: bash solve/changes/transaction-recovery-poison-row-invariant/live-ab/run-sample.sh <sample-id>
# Cleans containers + root-owned reuse data, runs the poison-row scenario in
# fast-local mode (live src bind-mount + SRC_FINGERPRINT recreate), stamps the
# exact src fingerprint, and harvests the report. Deterministic per arm.
set -uo pipefail

SAMPLE_ID="${1:?usage: run-sample.sh <sample-id>}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
OUT_DIR="${ROOT}/solve/changes/transaction-recovery-poison-row-invariant/live-ab"
CONFIG="test/distributed/config/local-poison-row-ab.json"
SCENARIO="transaction-recovery-poison-row-live"

cd "${ROOT}"

clean() {
  docker ps -aq --filter "name=ddb-test" 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' 2>/dev/null | grep '^ddb-test' | \
    xargs -r docker network rm >/dev/null 2>&1 || true
  # Root-owned reuse-data defeats the host-side reset (EACCES); remove as root.
  docker run --rm -v "${ROOT}/.tmp:/cleantmp" alpine \
    sh -c 'rm -rf /cleantmp/reuse-data' >/dev/null 2>&1 || true
  mkdir -p .tmp/reuse-data
}

finger() {
  node --input-type=module -e \
    'import {computeSourceFingerprint} from "./src/diagnostics/source-fingerprint.js"; process.stdout.write(await computeSourceFingerprint("src"));'
}

clean
node --check test/distributed/scenarios/${SCENARIO}.js || exit 2
SRC_FP="$(finger)"
echo "${SRC_FP}" > "${OUT_DIR}/${SAMPLE_ID}.srcfp"

NODE_OPTIONS=--max-old-space-size=8192 timeout 700 \
  node test/distributed/run.js \
    --config "${CONFIG}" \
    --scenario "${SCENARIO}" \
    --output "${OUT_DIR}/${SAMPLE_ID}.report.json" \
    --verbose \
    > "${OUT_DIR}/${SAMPLE_ID}.log" 2>&1
RUN_EXIT=$?

echo "${RUN_EXIT}" > "${OUT_DIR}/${SAMPLE_ID}.exit"
echo "sample=${SAMPLE_ID} srcfp=${SRC_FP} exit=${RUN_EXIT}"
exit 0
