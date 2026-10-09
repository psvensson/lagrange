#!/usr/bin/env bash
# Measurement only. Invoke in an isolated exact-base checkout with this patch.
# No commit, push, cloud provisioning, approval or release is performed here.
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo 'usage: bash run-canonical.sh /absolute/evidence/output' >&2
  exit 2
fi
root="$(git rev-parse --show-toplevel)"
cd "$root"
# Ask the existing owner BEFORE mkdir, dependency install or generated writes.
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('the issued-action canonical measurement');"
test "$(git rev-parse HEAD)" = "${EXPECTED:?set EXPECTED to the independently selected checkout SHA}"
out="$(realpath -m "$1")"
mkdir -p "$out"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"
  printf '\n' >> "$out/$name.command.txt"
  date -u +%FT%TZ > "$out/$name.started.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  date -u +%FT%TZ > "$out/$name.finished.txt"
  return "$status"
}
retain() {
  git status --porcelain > "$out/final-status.txt"
  git diff --binary > "$out/working-change.patch"
  if [ -f test-output/reports/test-results.ndjson ]; then
    cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"
  fi
}
trap retain EXIT
{
  git rev-parse HEAD
  node --version
  npm --version
} > "$out/provenance.txt"
files=(src/raft/raft-rs-committed-membership-context.js src/raft/raft-rs-durable-store.js
  test/raft/raft-rs-backend/issued-action-recovery.test.js
  test/raft/raft-rs-backend/issued-action-record-read.test.js)
sha256sum "${files[@]}" package-lock.json > "$out/input-sha256.txt"
measure install npm ci
measure lint npm exec --no -- eslint "${files[@]}"
measure metrics npm run test:metrics:scoped:strict -- "${files[@]}"
measure file-size node scripts/check-file-size-thresholds.js --strict "${files[@]}"
measure metadata npm run test:metadata:refresh
measure shards npm run audit:shards
# This is the existing bounded worker cap, not a changed deadline/classification.
export LAGRANGE_LANE_JOBS_CAP=1
measure tests npm run test:file -- "${files[2]}" "${files[3]}" \
  test/raft/raft-rs-backend/durable-store-committed-entries.test.js
# Check reported engagement and original per-file budgets, not exit alone.
python3 - "$out" <<'PY'
from pathlib import Path
import json,re,sys
out=Path(sys.argv[1]);text=(out/'tests.stdout.txt').read_text()
rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',text,re.M)
expected={'test/raft/raft-rs-backend/issued-action-recovery.test.js',
          'test/raft/raft-rs-backend/issued-action-record-read.test.js',
          'test/raft/raft-rs-backend/durable-store-committed-entries.test.js'}
assert len(rows)==3 and {row[0] for row in rows}==expected, rows
result={'files':rows,'limitMs':2000,'withinBudget':all(int(row[2])<=2000 for row in rows)}
(out/'timings.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['withinBudget'],result
PY
# Producer-generated files may change; tested source/lockfile may not.
sha256sum -c "$out/input-sha256.txt" > "$out/source-restoration.txt"
echo 'Focused canonical checks only; not independent review or complete cutover.'
