#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-origin-20261009"
out="$GITHUB_WORKSPACE/origin-install-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('origin-bearing install proof');"
mkdir -p "$out"
export PROOF_OUT="$out"
test_file=test/integration/message-group-learner-runtime-authorization.integration.test.js
measure() {
 local name="$1";shift
 printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
 date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
 local status=0
 "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
 echo "$status" > "$out/$name.exit.txt"
 date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
 tail -25 "$out/$name.stdout.txt"
 if [ "$status" -ne 0 ];then tail -15 "$out/$name.stderr.txt";fi
 return "$status"
}
case "$1" in
measure)
 test "$(git rev-parse HEAD)" = "$EXPECTED"
 test -z "$(git status --porcelain)"
 cp "$carrier/install-tests.py" "$carrier/install-run.sh" "$carrier/install-identity.patch" "$out/"
 printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
 git config user.name 'github-actions[bot]'
 git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
 measure install npm ci
 node scripts/solve.js note --id "$QUEST" --finding 'Continue approved PR111 review 4229278994 with one continuous origin-bearing installation witness. Real repository-authorized native ADD, actual checkpoint, file-backed CREATE owner CAS/physical claim, fresh target snapshot install, operation-port open and native reopen. Fixture advances ordinary operation to SENDING through the existing repository; this does not claim the full OperationWorkflowOwner driver or learner-stamp integration. Initial run 37925854728 correctly refused its mismatched fixture entity: checkpoint message-group versus canonical SERVICE_TYPE.MESSAGE_GROUP message_group. Use the existing type owner consistently, retain the failed run, and keep the real identity gate unchanged. Missing/current CREATE and ordered successor remain gated. No runtime edits or main merge.' --kind decision --json > "$out/scope.json"
 python3 "$carrier/install-tests.py"
 git apply --check "$carrier/install-identity.patch"
 git apply "$carrier/install-identity.patch"
 measure lint npm exec --no -- eslint "$test_file" --fix
 measure metrics npm run test:metrics:scoped:strict -- "$test_file"
 measure metadata npm run test:metadata:refresh
 measure shards npm run audit:shards
 git diff --exit-code "$EXPECTED" -- src
 node scripts/solve.js note --id "$QUEST" --attempt 'Compose actual committed origin through scrubbed checkpoint, exact real CREATE admission/sole physical worker, installed target native open and genuine connection/port replacement. Direct install and wrong-action reads refuse; no sender log or refreshed permit may be used. Canonical operation/checkpoint entity matches SERVICE_TYPE; the historical fixture mismatch is corrected rather than loosening owner checks. No full driver, current CREATE planner activation or successor permission is inferred.' --json > "$out/attempt.json"
 git diff --check
 git add -- "$test_file" test/shards/ "solve/quests/$QUEST/log.ndjson"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: prove actual learner-origin install and native reopen through CREATE authority'
 git rev-parse HEAD > "$out/source-sha.txt"
 measure consumer npm run test:file -- "$test_file"
 measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
 measure neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
 python3 "$carrier/review-check.py" timings
 git diff --exit-code "$EXPECTED" -- src
 test -z "$(git status --porcelain)"
 ;;
publish)
 gh auth setup-git
 test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
 test -z "$(git status --porcelain)"
 git diff --binary "$EXPECTED" > "$out/change.patch"
 cp -a .tap/test-results "$out/tap-results"
 python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,zipfile
out=Path(os.environ['PROOF_OUT'])
m={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(m,indent=2)+'\n')
with zipfile.ZipFile(out.parent/(out.name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(out)))
PY
 node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Actual native ADD origin -> scrubbed checkpoint -> exact file-backed CREATE admission and sole worker -> target install -> native open/reopen -> original historical action. Direct admission-less install and wrong-action reads refuse. Same-process normal-driver proof with fixture-driven SENDING, not complete workflow driver, physical network, global revocation or successor authorization. Canonical entity identity correction and prior failed attempts retained.' --json > "$out/canonical.json"
 python3 - <<'PY'
import json,os
from pathlib import Path
out=Path(os.environ['PROOF_OUT'])
r={'schema':'pr111-origin-install-proof/1','runId':int(os.environ['GITHUB_RUN_ID']),'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'timings':json.loads((out/'timings.json').read_text()),'canonicalEvidence':json.loads((out/'canonical.json').read_text()),'runtimeSourceChanged':False,'fullDriver':False,'fixtureStagesSending':True,'sameProcessNativeReopen':True,'physicalAcceptance':False,'independentApproval':False,'fullLabVerdict':'FAIL'}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('origin-install-'+os.environ['GITHUB_RUN_ID']+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
 git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/origin-install-$GITHUB_RUN_ID.json"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain continuous origin-bearing target install and reopen proof'
 git push origin "HEAD:refs/heads/$WORK_BRANCH"
 test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
 git rev-parse HEAD > "$out/published-sha.txt"
 git status --porcelain > "$out/final-status.txt"
 ;;
*) exit 2;;
esac
