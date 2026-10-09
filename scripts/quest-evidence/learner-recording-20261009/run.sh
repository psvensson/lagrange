#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-recording-20261009"
out="$GITHUB_WORKSPACE/learner-recording-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
test_file=test/integration/message-group-learner-runtime-authorization.integration.test.js
worker=test/test-helpers/message-group-learner-record-worker.js
sources=(src/rebalancer/replica-operation-message-group-membership-authorization.js src/rebalancer/replica-operation-message-group-learner-observation.js)
measure() {
 local name="$1"; shift
 printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
 date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
 local status=0
 "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
 printf '%s\n' "$status" > "$out/$name.exit.txt"
 date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
 tail -30 "$out/$name.stdout.txt"
 if [ "$status" -ne 0 ]; then tail -30 "$out/$name.stderr.txt"; fi
 return "$status"
}
case "$1" in
measure)
 node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('the learner recording witness');"
 mkdir -p "$out"
 export PROOF_OUT="$out"
 test "$(git rev-parse HEAD)" = "$EXPECTED"
 test -z "$(git status --porcelain)"
 cp "$carrier"/* "$out/"
 printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
 git config user.name 'github-actions[bot]'
 git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
 measure install npm ci
 measure metrics-before npm run test:metrics:scoped -- "${sources[@]}"
 cp test-output/analysis/complexity-scoped.json "$out/complexity-before.json"
 cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-before.json"
 node scripts/solve.js note --id "$QUEST" --finding '2026-10-09 user-approved continuation: recover native committed learner origin through one existing-repository conditional recording transition. Scope is the existing authorization/observation modules and their exact native/operation/test interaction. Reuse request/issued-state checks and membershipRowWhere. Preserve original execution fences, ordinary settlement, UNKNOWN lane debt, and all CREATE/successor/currentness gates. Test actual operation-worker SIGKILL after native commit and before row recording, with native ports surviving in parent and successor claim acquired by the existing repository; this is not distributed SQL or full-node/power loss. Published PR111 install proof already exists at 16bcff35; do not overwrite it with the older supplemental package.' --kind decision --json > "$out/scope.json"
 git apply --check "$carrier/tests.patch"
 git apply "$carrier/tests.patch"
 python3 - <<'PY'
from pathlib import Path
p=Path('test/integration/message-group-learner-runtime-authorization.integration.test.js');s=p.read_text()
a=", [], {stdio: ['ignore', 'pipe', 'pipe', 'ipc'],"
assert s.count(a)==1
p.write_text(s.replace(a,", [], {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],",1))
PY
 measure test-lint npm exec --no -- eslint "$test_file" "$worker" --fix
 measure test-metrics npm run test:metrics:scoped:strict -- "$test_file" "$worker"
 measure red-metadata npm run test:metadata:refresh
 git diff --exit-code "$EXPECTED" -- src
 git add -- "$test_file" "$worker" test/shards/ "solve/quests/$QUEST/log.ndjson"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: require exact learner recording and worker-loss recovery without reproposal'
 git rev-parse HEAD > "$out/red-sha.txt"
 if measure red npm run test:file -- "$test_file"; then echo 'missing recording boundary unexpectedly passed' >&2; exit 2; fi
 test "$(cat "$out/red.exit.txt")" -eq 1
 grep -Fq 'existing repository owner must record an exact recovered learner' "$out/red.stdout.txt"
 grep -Eq '^# cancelled 0' "$out/red.stdout.txt"
 git apply --check "$carrier/source.patch"
 git apply "$carrier/source.patch"
 cp "$carrier/contract.md" architecture/contracts/message-group-learner-operation-recording.md
 python3 - <<'PY'
import json
from pathlib import Path
p=Path('test/shards/impact-contracts.json');d=json.loads(p.read_text());k='message-group-learner-operation-recording'
a=['src/rebalancer/replica-operation-message-group-membership-authorization.js','src/rebalancer/replica-operation-message-group-learner-observation.js','src/rebalancer/replica-operation-message-group-membership-owner-claim.js']
b=['src/raft/raft-rs-committed-membership-read.js','src/raft/raft-rs-committed-membership-context.js','src/raft/raft-committed-membership-stamp.js']
t=['test/integration/message-group-learner-runtime-authorization.integration.test.js']
assert k not in d['contracts'] and k not in d['coupledPairs']
d['contracts'][k]={'description':'Exact historical learner and canonical bootstrap observations advance only the existing operation-row fact through its holder/terminal CAS; worker loss and unknown answers retain membership debt, never CREATE or successor authority.','owners':a+b,'tests':t}
d['coupledPairs'][k]={'description':d['contracts'][k]['description'],'endpoints':[{'id':'operation-recording','owners':a},{'id':'native-historical-and-current-observation','owners':b}],'contract':k,'witnessTests':t}
p.write_text(json.dumps(d,indent=2)+'\n')
PY
 measure source-lint npm exec --no -- eslint "${sources[@]}" --fix
 measure metrics-after npm run test:metrics:scoped -- "${sources[@]}"
 cp test-output/analysis/complexity-scoped.json "$out/complexity-after.json"
 cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-after.json"
 measure file-size node scripts/check-file-size-thresholds.js --strict "${sources[@]}" "$test_file" "$worker"
 measure decisions node scripts/check-guideline-decision-boundaries.js --json "${sources[@]}"
 measure literals node scripts/check-guideline-literals.js --json "${sources[@]}"
 measure grammar node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}"
 python3 - <<'PY'
import collections,json,os
from pathlib import Path
p=Path(os.environ['PROOF_OUT'])
for n in ['complexity','cognitive']:
 a=json.loads((p/(n+'-after.json')).read_text())['violations'];b=json.loads((p/(n+'-before.json')).read_text())['violations']
 def keys(rows):return collections.Counter((r['filePath'],r['message']) for r in rows)
 assert not (keys(a)-keys(b)),(n,keys(a)-keys(b))
for n in ['decisions','literals','grammar']:
 d=json.loads((p/(n+'.stdout.txt')).read_text());assert d['totalViolationCount']==0,(n,d)
PY
 measure metadata npm run test:metadata:refresh
 measure shards npm run audit:shards
 node scripts/solve.js note --id "$QUEST" --attempt 'Implement recovered learner -> existing operation phase/permit/stamp CAS. Reuse original request and issued-state validation, exact holder/terminal SQL basis, historical context decoder and canonical native stamp. Add actual worker process loss before SQL and successor reconstruction plus wrong/current role, terminal/holder races, idempotency and unknown-write tests. No new schema/store, driver/CREATE unpark, successor attempt or global metadata atomicity.' --json > "$out/attempt.json"
 git diff --check
 git add -- "${sources[@]}" architecture/contracts/message-group-learner-operation-recording.md test/shards/ "solve/quests/$QUEST/log.ndjson"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'feat: record recovered learner outcome through the existing operation-row CAS'
 git rev-parse HEAD > "$out/source-sha.txt"
 measure consumer npm run test:file -- "$test_file"
 measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
 measure neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
 python3 - <<'PY'
import json,os,re
from pathlib import Path
p=Path(os.environ['PROOF_OUT']);r={}
for n,limit,count in [('consumer',30000,1),('regressions',2000,4),('neighbors',2000,2)]:
 rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(p/(n+'.stdout.txt')).read_text(),re.M)
 assert len(rows)==count,(n,rows)
 r[n]={'files':rows,'limitMs':limit,'withinBudget':all(int(x[2])<=limit for x in rows)}
(p/'timings.json').write_text(json.dumps(r,indent=2)+'\n')
assert all(x['withinBudget'] for x in r.values()),r
PY
 # Read only the already-reviewed process-lifetime apparatus from PR110. It is
 # not merged into product code and its mutation acceptance is not reused blindly.
 mkdir -p "$out/tooling"
 git show 44e968be4e2f2db03b37d8a26470fd0a3b256fee:solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009/run-diagnostic.py > "$out/tooling/process-owner.py"
 measure mutations python3 "$carrier/mutate.py" "$out" "$carrier/report.mjs"
 test -z "$(git status --porcelain)"
 ;;
publish)
 export PROOF_OUT="$out"
 test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
 test -z "$(git status --porcelain)"
 git diff --binary "$EXPECTED" > "$out/change.patch"
 if [ -d .tap/test-results ]; then cp -a .tap/test-results "$out/tap-results"; fi
 cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"
 python3 - <<'PY'
import hashlib,json,os,zipfile
from pathlib import Path
p=Path(os.environ['PROOF_OUT']);manifest={str(x.relative_to(p)):hashlib.sha256(x.read_bytes()).hexdigest() for x in sorted(p.rglob('*')) if x.is_file() and '__pycache__' not in str(x)}
(p/'member-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(str(p)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
 for x in sorted(p.rglob('*')):
  if x.is_file() and '__pycache__' not in str(x):z.write(x,str(x.relative_to(p)))
PY
 node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Actual native origin -> exact repository recording with no new proposal: normal-driver tests, worker SIGKILL before row write and new-process successor recovery, holder/terminal CAS races, unknown-write readback, positive replay and historical-after-remove refusal. No full native-node crash, distributed SQL/CDC, driver/current CREATE/successor activation or independent approval.' --json > "$out/canonical.json"
 python3 - <<'PY'
import json,os
from pathlib import Path
p=Path(os.environ['PROOF_OUT']);d={'schema':'freshmg-learner-recording/1','runId':int(os.environ['GITHUB_RUN_ID']),'baseSha':os.environ['EXPECTED'],'sourceSha':(p/'source-sha.txt').read_text().strip(),'redSha':(p/'red-sha.txt').read_text().strip(),'timings':json.loads((p/'timings.json').read_text()),'mutations':json.loads((p/'mutations.json').read_text()),'canonicalEvidence':json.loads((p/'canonical.json').read_text()),'operationWorkerProcessLoss':True,'nativeNodesRemainAlive':True,'distributedSql':False,'physicalAcceptance':False,'fullDriver':False,'createActivation':False,'successorAttemptIssuance':False,'independentApproval':False,'fullLabVerdict':'FAIL'}
f=Path('solve/quests')/os.environ['QUEST']/'evidence'/('learner-recording-'+os.environ['GITHUB_RUN_ID']+'.json');f.write_text(json.dumps(d,indent=2)+'\n')
PY
 git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/learner-recording-$GITHUB_RUN_ID.json"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain learner recording and actual operation-worker recovery proof'
 git push origin "HEAD:refs/heads/$WORK_BRANCH"
 test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
 git rev-parse HEAD > "$out/published-sha.txt"
 git status --porcelain > "$out/final-status.txt"
 ;;
*) exit 2;;
esac
