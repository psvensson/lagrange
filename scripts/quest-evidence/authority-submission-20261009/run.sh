#!/usr/bin/env bash
set -euo pipefail
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('authority submission gate');"
export PROOF_OUT="$GITHUB_WORKSPACE/authority-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
out="$PROOF_OUT"
mkdir -p "$out"
sources=(src/node/message-group-membership-recipient.js src/node/message-group-service-handler.js src/rebalancer/operation-workflow-message-group-native-read.js src/rebalancer/replica-operation-message-group-membership-authorization.js src/rebalancer/replica-operation-repository-mutation-gateway-methods.js src/rebalancer/replica-operation-repository.js)
testfile=test/integration/message-group-learner-recipient.integration.test.js
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  echo "$status" > "$out/$name.exit.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
  tail -12 "$out/$name.stdout.txt"
  if [ "$status" != 0 ]; then tail -18 "$out/$name.stderr.txt"; fi
  return "$status"
}
if [ "$1" = measure ]; then
  test "$(git rev-parse HEAD)" = "$EXPECTED"; test -z "$(git status --porcelain)"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  cp -a "$CARRIER" "$out/carrier"
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  printf '%s\n' 'The opaque payload-1.b64 on the ops branch failed input-integrity checking before execution and is NOT used here. Only the explicit readable carrier files are executed.' > "$out/unused-opaque-carrier.txt"
  measure install npm ci
  measure metrics-before npm run test:metrics:scoped -- "${sources[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-before.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-before.json"
  node scripts/solve.js note --id "$QUEST" --finding 'Implement authority/driver prerequisites through existing owners: exact invoked registration and retirement, configured timeout, retained OperationLane turn, local owner fence through repository read/submission and each raw SQL retry. Expiry bars another attempt; already-submitted effects remain uncertain. NOT atomic cross-group commit revocation or CREATE activation. Preserve strict open finding4231684822 and cutover requirements.' --kind decision --json > "$out/decision.json"
  python3 "$CARRIER/apply-tests.py"
  cp "$CARRIER/contract.md" architecture/contracts/message-group-authority-submission-gates.md
  measure test-lint npm exec --no -- eslint "$testfile" --fix
  measure test-metrics npm run test:metrics:scoped:strict -- "$testfile"
  measure red-metadata npm run test:metadata:refresh
  git diff --exit-code "$EXPECTED" -- src
  git add "$testfile" architecture/contracts/message-group-authority-submission-gates.md test/shards "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: require exact registration and retained owner submission fences'
  git rev-parse HEAD > "$out/red-sha.txt"
  python3 "$CARRIER/tools.py" red
  python3 "$CARRIER/apply-source.py"
  measure source-lint npm exec --no -- eslint "${sources[@]}" --fix
  measure metrics-after npm run test:metrics:scoped -- "${sources[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-after.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-after.json"
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "${sources[@]}"
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}"
  measure literals node scripts/check-guideline-literals.js --json "${sources[@]}"
  python3 "$CARRIER/tools.py" stats
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  node scripts/solve.js note --id "$QUEST" --attempt 'Exact callback/router invocation identity, unregisterExact, owner timeout and retained OperationLane. Host-only local epoch guard reaches repository reads and each SQL submission without serialization; expiry stops another retry. Already-submitted truth stays UNKNOWN and grants no physical progression. No new coordinator/schema/permit, CREATE, automatic full driver or atomic canonical-boot revocation.' --json > "$out/attempt.json"
  git add "${sources[@]}" test/shards "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: fence registered learner invocation and owner write submissions'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure recipient npm run test:file -- "$testfile"
  measure consumer npm run test:file -- test/integration/message-group-learner-runtime-authorization.integration.test.js
  measure process npm run test:file -- test/integration/message-group-learner-process-loss.integration.test.js
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  measure cache npm run test:file -- test/integration/message-group-membership-claim-cache.integration.test.js
  measure neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
  measure transport npm run test:file -- test/transport/service-delivery-lifetime.test.js test/node/message-group-service-handler.test.js
  measure gateway npm run test:file -- test/rebalancer/replica-operation-repository-owner-clock-waits.test.js
  python3 "$CARRIER/tools.py" timing
  measure mutations python3 "$CARRIER/tools.py" mutate
  measure restored npm run test:file -- "$testfile"
  test -z "$(git status --porcelain)"
elif [ "$1" = publish ]; then
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  cp -a .tap/test-results "$out/tap-results"
  cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"
  python3 - <<'PY'
from pathlib import Path
import os,json,hashlib,zipfile
out=Path(os.environ['PROOF_OUT'])
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(str(out)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(out)))
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Exact registration retirement/invocation, actual retained owner lane, configured timeout and post-delivery/each-attempt local authority guards. Preserve UNKNOWN for already-submitted effects and exact row fencing. Normal dependencies and named mutation controls. Not global commit-time lease/boot revocation, recurring full driver/current CREATE, successor or physical acceptance; strict finding4231684822 and full-lab FAIL remain open.' --json > "$out/canonical.json"
  python3 "$CARRIER/tools.py" report
  git add "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/authority-submission-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain authority submission gate and explicit commit limits'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
else exit 2; fi
