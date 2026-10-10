#!/usr/bin/env bash
# Run only in an isolated checkout with this package's patch already applied.
# Uses normal dependencies and repository runners. Does not publish or merge.
set -euo pipefail
ROOT="$(cd "${1:?isolated checkout required}" && pwd)"
OUT="${2:?new absolute evidence directory required}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
case "$OUT" in /*) ;; *) echo 'Evidence directory must be absolute' >&2; exit 2;; esac
cd "$ROOT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('canonical safety-first receipt and reconstruction gates');"
test ! -e "$OUT"
mkdir -p "$OUT"
finish() {
  local result=$?
  trap - EXIT
  git status --porcelain=v1 > "$OUT/final-status.txt" || true
  git diff --binary > "$OUT/final-diff.patch" || true
  printf '%s\n' "$result" > "$OUT/overall.exit"
  python3 - "$OUT" <<'PY'
import hashlib, sys
from pathlib import Path
root=Path(sys.argv[1]); files=sorted(p for p in root.rglob('*') if p.is_file() and p.name!='SHA256SUMS')
(root/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(root).as_posix()+'\n' for p in files))
PY
  exit "$result"
}
trap finish EXIT
record() {
  local name="$1"; shift
  printf '%q ' "$@" > "$OUT/$name.command.txt"; printf '\n' >> "$OUT/$name.command.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/$name.started.txt"
  local result=0
  "$@" > "$OUT/$name.stdout.txt" 2> "$OUT/$name.stderr.txt" || result=$?
  printf '%s\n' "$result" > "$OUT/$name.exit"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/$name.finished.txt"
  return "$result"
}
git rev-parse HEAD > "$OUT/checkout-head.txt"
git status --porcelain=v1 > "$OUT/initial-status.txt"
node --version > "$OUT/node-version.txt"
npm --version > "$OUT/npm-version.txt"
printf '%s\n' 'No diagnostic dependency adapter; ordinary locked dependencies required.' > "$OUT/substrate.txt"
record install npm ci
record metadata npm run test:metadata:refresh
record shards npm run audit:shards
sources=(
  src/node/message-group-membership-recipient.js
  src/node/message-group-service-handler.js
  src/rebalancer/operation-workflow-message-group-native-read.js
  src/rebalancer/operation-workflow-owner.js
  src/rebalancer/replica-operation-message-group-membership-authorization.js
  src/rebalancer/replica-operation-repository-mutation-gateway-methods.js
  src/rebalancer/replica-operation-repository.js
)
testfile=test/integration/message-group-learner-recipient.integration.test.js
record lint npm exec --no -- eslint "${sources[@]}" "$testfile"
record test-complexity npm run test:metrics:scoped:strict -- "$testfile"
# Inherited source findings remain visible. This scoped report is not full-static approval.
record source-complexity npm run test:metrics:scoped -- "${sources[@]}"
record file-size node scripts/check-file-size-thresholds.js "${sources[@]}" "$testfile"
export LAGRANGE_LANE_JOBS_CAP=1
selected=("$testfile" \
  test/integration/message-group-learner-runtime-authorization.integration.test.js \
  test/integration/message-group-learner-process-loss.integration.test.js \
  test/integration/message-group-membership-claim-cache.integration.test.js \
  test/rebalancer/message-group-membership-branch-authorization.test.js \
  test/rebalancer/message-group-membership-operation-lane.test.js \
  test/rebalancer/operation-progress-store-persistence.test.js \
  test/rebalancer/reservation-file-backed-restart.test.js \
  test/raft/raft-rs-backend/committed-membership-read.test.js \
  test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js \
  test/transport/service-delivery-lifetime.test.js \
  test/node/message-group-service-handler.test.js)
offset="$(python3 - <<'PYOFFSET'
from pathlib import Path
p=Path('test-output/reports/test-results.ndjson')
print(p.stat().st_size if p.exists() else 0)
PYOFFSET
)"
record classified-tests npm run test:file -- "${selected[@]}"
record file-budgets node "$TOOLS/check-classified-result.mjs" "$ROOT" "$offset" "${selected[@]}"
record mutations python3 "$TOOLS/revised-receipt-mutations.py" "$ROOT" "$OUT/mutations"
# The superseded strict-after-submission gate is retained in history, with its
# original nonzero result. The published safety-first ruling replaces ONLY that
# criterion; the current integration tests enforce the replacement obligations.
# No automatic driver/CREATE or full-release gate is certified by this script.
printf '%s\n' 'These bounded checks do not establish complete driver/CREATE activation, full change-impact or physical acceptance.' > "$OUT/scope.txt"
