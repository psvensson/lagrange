#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-process-loss-20261009"
out="$GITHUB_WORKSPACE/learner-process-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
source=src/rebalancer/replica-operation-message-group-membership-authorization.js
consumer=test/integration/message-group-learner-runtime-authorization.integration.test.js
process_test=test/integration/message-group-learner-process-loss.integration.test.js
helpers=(test/test-helpers/learner-operation-fixture.js test/test-helpers/learner-process-loss-worker.js)
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner process-loss measurement');"
mkdir -p "$out"
export PROOF_OUT="$out" PROCESS_CARRIER="$carrier"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
  tail -18 "$out/$name.stdout.txt"
  if [ "$status" -ne 0 ]; then tail -18 "$out/$name.stderr.txt"; fi
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  cp "$carrier"/* "$out/"
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  measure install npm ci
  measure metrics-before npm run test:metrics:scoped -- "$source"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-before.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-before.json"
  node scripts/solve.js note --id "$QUEST" --finding '2026-10-09 next bounded step approved: actual SIGKILL after native ADD application and before operation recording, including ordinary failure and SQL-commit/answer-loss cuts; fresh process/different logical holder with exact lease adoption and another durable replica. Operation SQL and transport remain fixture-local, not cross-host/Raft-SQL proof. Address independent PR113 finding 4231271062 by preserving permanent conflict versus transient native unavailability; include terminal competitor at actual CAS. Reuse existing fixture/owners, no new runtime state, driver/current CREATE/successor activation, main integration or weakened gates.' --kind decision --json > "$out/scope.json"
  python3 "$carrier/prepare.py" tests
  # Own all spawned workers through parent test cancellation before deleting only our scratch.
  python3 - <<'PY'
from pathlib import Path
p=Path('test/integration/message-group-learner-process-loss.integration.test.js');s=p.read_text()
s=s.replace('function runWorker(mode, scratch, scenario) {','function runWorker(mode, scratch, scenario, active) {')
a="      detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});"
assert s.count(a)==1
s=s.replace(a,a+"\n    let closed;\n    const completion = new Promise((resolve) => {closed = resolve;});\n    const owned = {child, completion};\n    active.add(owned);")
a="      clearTimeout(deadline);\n      killOwnedGroup(child);"
assert s.count(a)==1
s=s.replace(a,a+"\n      active.delete(owned); closed();")
a='  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));'
assert s.count(a)==1
s=s.replace(a,"  const active = new Set();\n  t.after(async () => {\n    const owned = [...active];\n    for (const item of owned) killOwnedGroup(item.child);\n    await Promise.all(owned.map((item) => item.completion));\n    fs.rmSync(scratch, {recursive: true, force: true});\n  });")
s=s.replace("runWorker('writer', scratch, scenario)","runWorker('writer', scratch, scenario, active)")
s=s.replace("runWorker('reader', scratch, scenario)","runWorker('reader', scratch, scenario, active)")
p.write_text(s)
PY
  measure test-lint npm exec --no -- eslint "$consumer" "$process_test" "${helpers[@]}" --fix
  measure test-metrics npm run test:metrics:scoped:strict -- "$consumer" "$process_test" "${helpers[@]}"
  measure metadata-red npm run test:metadata:refresh
  git diff --exit-code "$EXPECTED" -- src
  git add -- "$consumer" "$process_test" "${helpers[@]}" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: require actual process-cut successor recovery and preserve native refusal meaning'
  git rev-parse HEAD > "$out/red-sha.txt"
  if measure red npm run test:file -- "$consumer"; then echo 'classification defect did not reproduce' >&2; exit 2; fi
  test "$(cat "$out/red.exit.txt")" -eq 1
  grep -Fq 'typed permanent native refusal must not become retryable unavailability' "$out/red.stdout.txt"
  grep -Fq '# cancelled 0' "$out/red.stdout.txt"
  python3 "$carrier/prepare.py" source
  measure source-lint npm exec --no -- eslint "$source" --fix
  measure metrics-after npm run test:metrics:scoped -- "$source"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-after.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-after.json"
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "$source"
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "$source"
  measure literals node scripts/check-guideline-literals.js --json "$source"
  python3 - <<'PY'
from pathlib import Path
import json,os,collections
out=Path(os.environ['PROOF_OUT'])
for name in ['decisions','grammar','literals']:
 d=json.loads((out/(name+'.stdout.txt')).read_text()); assert d['totalViolationCount']==0,(name,d)
for name in ['complexity','cognitive']:
 def counts(phase):return collections.Counter((x['filePath'],x['message']) for x in json.loads((out/(name+'-'+phase+'.json')).read_text())['violations'])
 assert not (counts('after')-counts('before')),(name,'new violation')
PY
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  node scripts/solve.js note --id "$QUEST" --attempt 'Preserve native refusal classifications in the existing recorder; malformed/permanent answers conflict, exact unavailability remains unavailable, missing history remains unknown. Reuse extracted canonical fixture for three actual SIGKILL/recovery schedules with different holder and another voter. Terminal-at-CAS tests and no-effect replay remain owner-driven. No new runtime coordinator, lease, schema, CREATE or successor permission.' --json > "$out/attempt.json"
  git add -- "$source" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: preserve learner-origin refusal classification and prove process-cut recovery'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure consumer npm run test:file -- "$consumer"
  measure process npm run test:file -- "$process_test"
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  measure cache npm run test:file -- test/integration/message-group-membership-claim-cache.integration.test.js
  measure neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
  python3 - <<'PY'
from pathlib import Path
import os,json,re
out=Path(os.environ['PROOF_OUT']);result={}
for name,limit,count in [('consumer',30000,1),('process',30000,1),('regressions',2000,4),('cache',30000,1),('neighbors',2000,2)]:
 rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
 assert len(rows)==count,(name,rows)
 result[name]={'limitMs':limit,'files':rows,'withinBudget':all(int(ms)<=limit for _,_,ms in rows)}
(out/'timings.json').write_text(json.dumps(result,indent=2)+'\n')
assert all(x['withinBudget'] for x in result.values()),result
PY
  test -z "$(git status --porcelain)"
  ;;
publish)
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
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Three actual SIGKILL schedules: native commit before recording, ordinary failed debt, and operation commit before answer. New process/different logical membership holder adopts exact expired claim, reads another durable voter, records without reproposal and retains ordinary history/debt. Native refusal correction and terminal-at-CAS controls. Normal driver, local SQLite gateway/in-process native messages: not physical distributed SQL, full workflow driver, current CREATE, successor issuance or power-loss certification.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import os,json
out=Path(os.environ['PROOF_OUT']);run=os.environ['GITHUB_RUN_ID']
r={'schema':'learner-process-loss/1','runId':run,'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'redSha':(out/'red-sha.txt').read_text().strip(),'timings':json.loads((out/'timings.json').read_text()),'canonicalEvidence':json.loads((out/'canonical.json').read_text()),'processLossSchedules':3,'differentLogicalHolder':True,'physicalMultiHost':False,'distributedOperationSQL':False,'fullDriver':False,'currentCreate':False,'successorIssuance':False,'independentApproval':False,'fullLabVerdict':'FAIL'}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('learner-process-'+run+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/learner-process-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain process-loss successor-holder recovery and refusal correction'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2;;
esac
