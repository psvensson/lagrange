#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-recording-20261009"
out="$GITHUB_WORKSPACE/learner-recording-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
export CARRIER="$carrier" PROOF_OUT="$out"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner outcome recording measurement');"
mkdir -p "$out"
sources=(src/raft/raft-rs-committed-membership-read.js src/rebalancer/replica-operation-message-group-membership-authorization.js src/rebalancer/replica-operation-repository.js)
tests=(test/integration/message-group-learner-runtime-authorization.integration.test.js test/integration/message-group-membership-claim-cache.integration.test.js)
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  echo "$status" > "$out/$name.exit.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
  tail -35 "$out/$name.stdout.txt"
  if [ "$status" -ne 0 ]; then tail -25 "$out/$name.stderr.txt"; fi
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  printf 'base=%s\ncarrier=%s\nrunner=%s\ncap=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" "$LAGRANGE_LANE_JOBS_CAP" > "$out/provenance.txt"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  python3 - <<'PY'
import base64,gzip,hashlib,os
from pathlib import Path
carrier=Path(os.environ['CARRIER']);out=Path(os.environ['PROOF_OUT'])
expected={'source':'b71d845e4c68267e9068b66f27d29cefd0705e6bafa6c4f4dc85680b39fdd2fe','tests':'bec8c0db3834c0beb9aa21e12f01936a40a6e48a26909a816e80026d7e07de56'}
# Four transcription errors in the text carrier, not changes to the intended
# patch. The complete decompressed digest must match the local prepared bytes.
repairs=[('AD76bkJbm25im','AD76bkJ725im'),('ZfuFSr/3Ckq','ZfuFSr/9Ckq'),('xbEGNgnRsg','xbEGNgnsg'),('M2jU1nX2ktiu','M2jU1nV2ktiu')]
for name,digest in expected.items():
    encoded=(carrier/(name+'.patch.gz.b64')).read_text().strip()
    (out/(name+'.original-carrier.b64')).write_text(encoded+'\n')
    if name=='tests':
        for old,new in repairs:
            assert encoded.count(old)==1,(name,old,'carrier drift')
            encoded=encoded.replace(old,new)
    raw=gzip.decompress(base64.b64decode(encoded,validate=True))
    assert hashlib.sha256(raw).hexdigest()==digest,(name,'intended patch mismatch')
    (out/(name+'.patch')).write_bytes(raw)
(out/'carrier-transcription.txt').write_text('Four exact encoded-text corrections; complete original intended patch SHA256 checked before application. No runtime/test semantics changed by carrier repair.\n')
PY
  measure install npm ci
  measure source-before npm run test:metrics:scoped -- "${sources[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-before.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-before.json"
  node scripts/solve.js note --id "$QUEST" --finding 'Approved continuation after PR111 install/reopen: record exact recovered learner origin through ReplicaOperationRepository, with the canonical membership witness from the same native queued observation. Scope: existing committed read shaper, existing membership authorization module/repository facade, reused native integration and real SQL/Raft/CDC visibility witness. One exact existing-row CAS changes only learner phase, permit outcome/index and learner stamp. Retain original fences, ordinary terminal history, membership debt/lane and physical CREATE protection. No new store/driver/successor authorization, global metadata revocation, main merge or approval. Same-process reconstruction is not SIGKILL proof.' --kind decision --json > "$out/scope.json"
  git apply --check "$out/tests.patch"
  git apply "$out/tests.patch"
  measure tests-lint npm exec --no -- eslint "${tests[@]}" --fix
  measure tests-metrics npm run test:metrics:scoped:strict -- "${tests[@]}"
  measure red-metadata npm run test:metadata:refresh
  git diff --exit-code "$EXPECTED" -- src
  git add -- "${tests[@]}" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: require exact native learner outcome recording without redispatch or debt release'
  git rev-parse HEAD > "$out/red-sha.txt"
  if measure red npm run test:file -- "${tests[0]}"; then echo 'Missing writer unexpectedly passed' >&2; exit 2; fi
  python3 - <<'PY'
from pathlib import Path
import os,re
out=Path(os.environ['PROOF_OUT']);s=(out/'red.stdout.txt').read_text()
assert (out/'red.exit.txt').read_text().strip()=='1'
assert 'existing repository must record exact recovered learner evidence' in s
assert re.search(r'not ok \d+ - issued or proposed is not a recorded learner outcome',s)
assert re.search(r'# cancelled 0',s) and re.search(r'# skipped 0',s)
PY
  git apply --check "$out/source.patch"
  git apply "$out/source.patch"
  python3 - <<'PY'
from pathlib import Path
import json
p=Path('test/shards/impact-contracts.json');data=json.loads(p.read_text());key='message-group-learner-outcome-recording'
a=['src/raft/raft-rs-committed-membership-read.js']
b=['src/rebalancer/replica-operation-message-group-membership-authorization.js','src/rebalancer/replica-operation-repository.js']
t=['test/integration/message-group-learner-runtime-authorization.integration.test.js','test/integration/message-group-membership-claim-cache.integration.test.js']
assert key not in data['contracts'] and key not in data['coupledPairs']
description='Same-turn native historical origin and committed membership witness feed one exact existing operation-row CAS; preserve terminal debt and old execution fences; current CREATE and successor issuance remain separate.'
data['contracts'][key]={'description':description,'owners':a+b,'tests':t}
data['coupledPairs'][key]={'description':description,'endpoints':[{'id':'native-committed-outcome','owners':a},{'id':'durable-operation-recording','owners':b}],'contract':key,'witnessTests':t}
p.write_text(json.dumps(data,indent=2)+'\n')
PY
  measure source-lint npm exec --no -- eslint "${sources[@]}" --fix
  measure source-after npm run test:metrics:scoped -- "${sources[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-after.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-after.json"
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "${sources[@]}"
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}"
  measure literals node scripts/check-guideline-literals.js --json "${sources[@]}"
  python3 - <<'PY'
from pathlib import Path
from collections import Counter
import json,os
p=Path(os.environ['PROOF_OUT'])
for name in ['decisions','grammar','literals']:
    r=json.loads((p/(name+'.stdout.txt')).read_text());assert r['totalViolationCount']==0,(name,r)
for name in ['complexity','cognitive']:
    def violations(phase):
        return Counter((x['filePath'],x['message']) for x in json.loads((p/(name+'-'+phase+'.json')).read_text())['violations'])
    assert not violations('after')-violations('before'),(name,violations('after')-violations('before'))
PY
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  node scripts/solve.js note --id "$QUEST" --attempt 'Extend the actual queued native learner answer with its existing same-observation membership witness, and record exact recovered origin via existing repository/row predicate. Only learner phase, permit state/index and stamp change; shared claim/terminal/source identity basis prevents delayed overwrite. Tests cover uncommitted and malformed evidence, ordinary failure/success, holder renewal during read and CAS, real connection/native reconstruction, changed leader, readback loss and exact no-write replay. The real SQL/Raft/CDC visibility case uses an explicitly supplied native observation; no full driver, current CREATE, ordered successor or process-crash claim.' --json > "$out/attempt.json"
  git diff --check
  git add -- "${sources[@]}" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'feat: record recovered learner outcomes through exact existing operation authority'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure consumer npm run test:file -- "${tests[0]}"
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  measure cache npm run test:file -- "${tests[1]}"
  measure neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
  python3 - <<'PY'
from pathlib import Path
import json,os,re
out=Path(os.environ['PROOF_OUT']);timings={}
for name,limit,count in [('consumer',30000,1),('regressions',2000,4),('cache',30000,1),('neighbors',2000,2)]:
    rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
    assert len(rows)==count,(name,rows)
    timings[name]={'limitMs':limit,'files':rows,'withinBudget':all(int(ms)<=limit for _,_,ms in rows)}
(out/'timings.json').write_text(json.dumps(timings,indent=2)+'\n')
assert all(x['withinBudget'] for x in timings.values()),timings
PY
  test -z "$(git status --porcelain)"
  ;;
publish)
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  if [ -d .tap/test-results ]; then cp -a .tap/test-results "$out/tap-results"; fi
  if [ -f test-output/reports/test-results.ndjson ]; then cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"; fi
  python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,zipfile
out=Path(os.environ['PROOF_OUT'])
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(str(out)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(out)))
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Bounded real native observation -> exact operation learner-phase CAS. Normal-driver file-backed operation tests and separate real SQL/Raft/CDC visibility; original-runtime missing-capability red retained. Preserve ordinary terminal debt, exact holder/permit, old-term recovery, lost write readback and no-effect replay. No physical process-loss, full driver/current CREATE, successor authorization, main merge or certification.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT']);run=os.environ['GITHUB_RUN_ID']
r={'schema':'freshmg-learner-recording/1','runId':int(run),'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'redSha':(out/'red-sha.txt').read_text().strip(),'timings':json.loads((out/'timings.json').read_text()),'canonicalEvidence':json.loads((out/'canonical.json').read_text()),'independentApproval':False,'fullDriver':False,'currentCreateActivation':False,'successorIssuance':False,'processLossProof':False,'physicalAcceptance':False,'fullLabVerdict':'FAIL'}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('learner-recording-'+run+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/learner-recording-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain exact learner outcome recording and unresolved broader gates'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2;;
esac
