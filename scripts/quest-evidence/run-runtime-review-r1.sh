#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/runtime-review-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$out"
export PROOF_OUT="$out"
files=(src/raft/raft-rs-group-membership-admission.js src/rebalancer/replica-operation-message-group-learner-observation.js)
testfile=test/integration/message-group-learner-runtime-authorization.integration.test.js
restart=test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js
run() {
  local label="$1"; shift
  local code=0
  printf '%q ' "$@" > "$out/$label.command.txt"
  printf '\n' >> "$out/$label.command.txt"
  "$@" > "$out/$label.stdout.txt" 2> "$out/$label.stderr.txt" || code=$?
  echo "$code" > "$out/$label.exit.txt"
  tail -35 "$out/$label.stdout.txt"
  if [ "$code" -ne 0 ]; then tail -25 "$out/$label.stderr.txt"; fi
  return "$code"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  node --version >> "$out/provenance.txt"
  npm --version >> "$out/provenance.txt"
  run install npm ci
  exec 9>/tmp/lagrange-contract-first-measurement.lock
  flock -w 120 9
  unset LAGRANGE_RETRY_FAILED_ONCE
  run metrics-before npm run test:metrics:scoped:strict -- "${files[@]}" && exit 2
  test "$(cat "$out/metrics-before.exit.txt")" = 1
  cp test-output/analysis/complexity-scoped.json "$out/complexity-before.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-before.json"
  run decisions-before node scripts/check-guideline-decision-boundaries.js --json "${files[@]}"
  run grammar-before node scripts/check-runtime-grammar-contracts.js --json "${files[@]}"
  run literals-before node scripts/check-guideline-literals.js --json "${files[@]}"
  run restart-before npm run test:file -- "$restart"
  cp test-output/reports/test-results.ndjson "$out/restart-before-results.ndjson"
  node scripts/solve.js note --id "$QUEST" --finding 'PR109 review 5459955866 rejects closure: new complexity 25 in learner admission, 14 in request decoding, plus the restart witness duration. This corrective attempt keeps the same owners, export surface, authorization order and await boundary. Static before/after is measured; the restart witness is profiled without changing assertions, ticks, storage settings or timeout.' --kind decision --json > "$out/decision.json"
  python3 "$carrier/scripts/quest-evidence/repair-runtime-review.py" . > "$out/refactor.json"
  run lint npm exec --no -- eslint "${files[@]}"
  run metrics-after npm run test:metrics:scoped:strict -- "${files[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-after.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-after.json"
  run decisions-after node scripts/check-guideline-decision-boundaries.js --json "${files[@]}"
  run grammar-after node scripts/check-runtime-grammar-contracts.js --json "${files[@]}"
  run literals-after node scripts/check-guideline-literals.js --json "${files[@]}"
  python3 - <<'PY'
from pathlib import Path
import json,os
p=Path(os.environ['PROOF_OUT'])
assert json.loads((p/'complexity-before.json').read_text())['count']==2
assert json.loads((p/'complexity-after.json').read_text())['count']==0
assert json.loads((p/'cognitive-after.json').read_text())['count']==0
for name in ['decisions','grammar','literals']:
    before=json.loads((p/(name+'-before.stdout.txt')).read_text())
    after=json.loads((p/(name+'-after.stdout.txt')).read_text())
    assert after['totalViolationCount']<=before['totalViolationCount'], (name,before,after)
PY
  run metadata npm run test:metadata:refresh
  run shards npm run audit:shards
  run integration npm run test:file -- "$testfile"
  run regression npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  python3 - <<'PY'
from pathlib import Path
import re,json,os
out=Path(os.environ['PROOF_OUT']); results={}
for label,limit,count in [('integration',30000,1),('regression',2000,4)]:
    rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(label+'.stdout.txt')).read_text(),re.M)
    assert len(rows)==count,(label,rows)
    assert all(int(ms)<=limit for _,_,ms in rows),(label,limit,rows)
    results[label]={'limitMs':limit,'files':rows}
(out/'timings.json').write_text(json.dumps(results,indent=2)+'\n')
PY
  python3 - <<'PY'
from pathlib import Path
import json,os,subprocess
out=Path(os.environ['PROOF_OUT']); test='test/integration/message-group-learner-runtime-authorization.integration.test.js'
cases=[
('permit','src/rebalancer/replica-operation-message-group-learner-observation.js','row.messageGroupMembershipPermit !== input.permit ||','false ||','wrong group, recipient boot, sender and changed payload'),
('holder','src/rebalancer/replica-operation-message-group-learner-observation.js','row.messageGroupMembershipOwnerClaim !== input.executionClaim ||','false ||','current canonical boot and exact renewed holder'),
('native','src/raft/raft-rs-group-membership-admission.js','return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](transition);',
'const status = port.readStatus(); return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]({...transition, leaderTerm: status.term, runtimeGeneration: status.runtimeGeneration, replicaLifecycleIncarnation: status.lifecycleIncarnation, leaderConfigurationStamp: {configurationKey: status.configurationKey, membershipGenerationIndex: status.membershipGenerationIndex}});','native same-turn fencing must remain in force')]
results=[]
for name,file,old,new,marker in cases:
    p=Path(file); original=p.read_bytes(); s=original.decode(); assert s.count(old)==1
    try:
        p.write_text(s.replace(old,new,1))
        with (out/('mutant-'+name+'.stdout.txt')).open('wb') as stdout,(out/('mutant-'+name+'.stderr.txt')).open('wb') as stderr:
            code=subprocess.run(['npm','run','test:file','--',test],stdout=stdout,stderr=stderr,timeout=60).returncode
        output=(out/('mutant-'+name+'.stdout.txt')).read_text()+(out/('mutant-'+name+'.stderr.txt')).read_text()
        assert code==1 and 'ERR_ASSERTION' in output and marker in output,(name,code,output[-500:])
        results.append({'name':name,'exitCode':code,'assertion':marker,'caught':True})
    finally:p.write_bytes(original)
(out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
PY
  run restart-profile python3 "$carrier/scripts/quest-evidence/profile-restart-oracles.py" . "$out/restart-profile"
  git diff --exit-code -- test/raft/raft-rs-backend/committed-membership-oracles.js "$restart"
  git diff --check
  git diff --binary > "$out/repair.patch"
  node scripts/solve.js note --id "$QUEST" --attempt 'PR109 corrective refactor: separate structural decode from initial action/identity agreement, and split recipient snapshot/availability, refusal mapping, recipient validation and native proposal into unexported same-owner helpers. Original await boundary and fence ownership retained. Strict complexity and regressions are remeasured with permit/holder/native mutation controls. Restart cost is observed separately; no timing or release claim inferred from functional pass.' --json > "$out/attempt.json"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git add -- "${files[@]}" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'refactor: resolve reviewed learner-boundary complexity within existing owners'
  git rev-parse HEAD > "$out/measured-sha.txt"
  test -z "$(git status --porcelain)"
  ;;
publish)
  test -f "$out/measured-sha.txt"
  test "$(git rev-parse HEAD)" = "$(cat "$out/measured-sha.txt")"
  test -z "$(git status --porcelain)"
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,zipfile
out=Path(os.environ['PROOF_OUT'])
hashes={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(hashes,indent=2)+'\n')
archive=out.parent/(out.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(out)))
(out/'canonical-archive-sha256.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'\n')
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text "PR109 review 5459955866 corrective attempt: two strict complexity findings, unchanged owner boundaries and await order, exact native-consumer positives and three predicate mutations. Separate restart oracle-cost profile does not alter timing verdict or certify the unit budget. Original lab FAIL and final acceptance blocks remain." --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os,re
out=Path(os.environ['PROOF_OUT'])
def j(name):return json.loads((out/name).read_text())
rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/'restart-before.stdout.txt').read_text(),re.M)
assert len(rows)==1
record={'schema':'freshmg-runtime-review-r1/1','reviewId':5459955866,'runId':int(os.environ['GITHUB_RUN_ID']),
 'baseSha':os.environ['EXPECTED'],'measuredSha':(out/'measured-sha.txt').read_text().strip(),
 'strictComplexityBefore':j('complexity-before.json')['count'],'strictComplexityAfter':j('complexity-after.json')['count'],
 'strictCognitiveAfter':j('cognitive-after.json')['count'],'timings':j('timings.json'),'mutations':j('mutations.json'),
 'restartTest':{'path':rows[0][0],'assertions':int(rows[0][1]),'durationMs':int(rows[0][2]),'budgetMs':2000,
   'budgetSatisfied':int(rows[0][2])<=2000,'profile':j('restart-profile/oracle-profile.json')},
 'newStores':0,'newRuntimeOwners':0,'newExports':0,'independentApproval':False,
 'fullLabVerdict':'FAIL','distributedAcceptance':False,'releaseCertification':False,
 'canonicalEvidence':j('canonical.json'),'canonicalArchiveSha256':(out/'canonical-archive-sha256.txt').read_text().strip()}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('runtime-review-'+os.environ['GITHUB_RUN_ID']+'.json')
p.write_text(json.dumps(record,indent=2)+'\n')
(out/'restart-budget-exit.txt').write_text(('0' if record['restartTest']['budgetSatisfied'] else '1')+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/runtime-review-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain PR109 corrective proof and unresolved restart-cost measurement'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2 ;;
esac
