#!/usr/bin/env bash
set -euo pipefail
out=test-output/learner-runtime
carrier=../carrier-$GITHUB_RUN_ID
mkdir -p "$out"
measure() {
  local label="$1"; shift
  set +e
  "$@" > "$out/$label.txt" 2>&1
  local code=$?
  set -e
  echo "$code" > "$out/$label-exit.txt"
  tail -45 "$out/$label.txt"
  return "$code"
}
case "$1" in
prepare)
  test "$(git rev-parse HEAD)" = "$BASE"
  test -z "$(git status --porcelain)"
  printf 'base=%s\ncarrier=%s\nrunner=%s\nrun=%s\n' "$BASE" "$GITHUB_SHA" "$RUNNER_NAME" "$GITHUB_RUN_ID" > "$out/provenance.txt"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  npm ci
  node scripts/solve.js note --id "$QUEST" --finding 'Review 5458017769 applies to BOTH historical log and embedded canonical reply: 37787377904 stopped on lint before positives; 37788383916 passed behavior but failed timing; only 37789951368 completed budgets and mutations. Original bytes remain historical; evidence/initial-learner-run-correction-5458017769.md overrides their incorrect narrative. Initial runtime-consumer run 37794494550 stopped before tests because its subsystem classification was ambiguous. No runtime result is claimed for that run.' --kind evidence --json > "$out/correction-note.json"
  cp "$carrier/scripts/quest-evidence/learner-runtime-consumer.test.js" "$TEST"
  python3 - <<'PY'
import os
from pathlib import Path
p=Path(os.environ['TEST']);s=p.read_text()
old='...JSON.parse(f.request.permit), leaderTerm: 100'
assert s.count(old)==1
s=s.replace(old,"...JSON.parse(f.request.permit), workflowOwnerFence: 'not-the-issued-fence'")
anchor="      const count = f.proposalCount();\n      assert.equal((await f.run()).reason,\n        portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.MISMATCH);"
assert s.count(anchor)==1
s=s.replace(anchor,"""      const count = f.proposalCount();
      assert.equal((await admission.proposeAuthorizedGroupLearner(f.port, f.receiver,
        f.request, {outcome: 'observed'})).reason,
      portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.REQUIRED);
      assertNoProposal(f, count);
      assert.equal((await admission.proposeAuthorizedGroupLearner(null, f.receiver,
        f.request, f.observe)).reason,
      portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE);
      assertNoProposal(f, count);
      assert.equal((await f.run()).reason,
        portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.MISMATCH);""")
p.write_text(s)
PY
  python3 "$carrier/scripts/quest-evidence/learner-runtime-metadata.py" . tests
  measure test-lint npm exec --no -- eslint "$TEST" scripts/checks/test-subsystem-classification-constants.js --fix
  measure red-metadata npm run test:metadata:refresh
  git diff --exit-code "$BASE" -- src
  git add "$TEST" scripts/checks/test-subsystem-classification-constants.js test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: assert repository-to-native learner authorization and refusal controls'
  git rev-parse HEAD > "$out/red-sha.txt"
  if measure red timeout 60s npm run test:file -- "$TEST"; then exit 2; fi
  test "$(cat "$out/red-exit.txt")" -eq 1
  grep -q 'existing group admission owner must consume authoritative learner intent' "$out/red.txt"
  grep -q ERR_ASSERTION "$out/red.txt"
  python3 "$carrier/scripts/quest-evidence/prepare-learner-runtime.py" .
  python3 - <<'PY'
from pathlib import Path
p=Path('src/raft/raft-rs-group-membership-admission.js');s=p.read_text()
anchor='  const receiver = Object.freeze({groupId: group?.groupId, nodeId: group?.nodeId,'
assert s.count(anchor)==1
s=s.replace(anchor,"""  if (typeof port?.readStatus !== 'function' ||
    typeof port?.[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION] !== 'function') {
    return deepFreeze({...membershipTransitionRefusal(
      RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE), retryable: true});
  }
"""+anchor)
s=s.replace('// port and describes itself ({groupId, localReplicaIdentity, logger,',
 '// port and describes itself ({groupId, localReplicaIdentity, logger,')
s=s.replace('// admission record); membership requests enter through here over\n// `port.proposeConfChange` and nowhere else.',
 '// admission record). Founder admission uses port.proposeConfChange; the\n// operation-owned learner consumer below uses the semantic membership port\n// after authoritative operation observation. Neither bypasses native admission.')
p.write_text(s)
PY
  python3 "$carrier/scripts/quest-evidence/learner-runtime-metadata.py" . source
  git add -N src/rebalancer/replica-operation-message-group-learner-observation.js
  git diff --name-only -- src > "$out/source-paths.txt"
  measure source-lint npm exec --no -- eslint $(cat "$out/source-paths.txt") --fix
  measure metadata npm run test:metadata:refresh
  node scripts/solve.js note --id "$QUEST" --attempt 'Bound exact issued learner observation to the existing group-admission owner and native semantic port. Canonical operation/boot reads precede native runtime checks; no recorded reply substitutes for a committed membership receipt or physical CREATE grant. Tests bind a real file-backed repository to three real raft-rs ports using existing inbox transport. Host identity bindings are fixtures, not network-authentication proof. Existing driver/planner/handler registration remains unactivated.' --json > "$out/attempt.json"
  git diff --check
  git add src "$TEST" scripts/checks/test-subsystem-classification-constants.js test/shards/ "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/runtime-learner-consumption.md"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'feat: consume exact issued learner intent through the existing native admission owner'
  git rev-parse HEAD > "$out/source-sha.txt"
  ;;
measure)
  exec 9>/tmp/lagrange-contract-first-measurement.lock
  flock -w 120 9
  measure green timeout 60s npm run test:file -- "$TEST"
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  python3 - <<'PY'
import re,json
from pathlib import Path
p=Path('test-output/learner-runtime');record={}
for name,limit in [('green.txt',30000),('regressions.txt',2000)]:
    rows=re.findall(r'ok ([^\n]+?) \([^\n]*?, (\d+)ms\)',(p/name).read_text())
    assert rows,(name,'no measured timing')
    record[name]={'limitMs':limit,'files':rows}
    assert all(int(ms)<=limit for _,ms in rows),(name,rows,limit)
(p/'timings.json').write_text(json.dumps(record,indent=2)+'\n')
PY
  measure shards npm run audit:shards
  measure test-metrics npm run test:metrics:scoped:strict -- "$TEST"
  measure source-metrics npm run test:metrics:scoped -- $(cat "$out/source-paths.txt") || true
  ;;
mutations)
  exec 9>/tmp/lagrange-contract-first-measurement.lock
  flock -w 120 9
  restore() {
    git show HEAD:src/rebalancer/replica-operation-message-group-learner-observation.js > src/rebalancer/replica-operation-message-group-learner-observation.js
    git show HEAD:src/raft/raft-rs-group-membership-admission.js > src/raft/raft-rs-group-membership-admission.js
  }
  trap restore EXIT
  for mutant in permit holder native; do
    python3 - "$mutant" <<'PY'
import sys
from pathlib import Path
kind=sys.argv[1]
p=Path('src/rebalancer/replica-operation-message-group-learner-observation.js')
if kind=='permit':old='row.messageGroupMembershipPermit !== input.permit ||';new='false ||'
elif kind=='holder':old='row.messageGroupMembershipOwnerClaim !== input.executionClaim ||';new='false ||'
else:
    p=Path('src/raft/raft-rs-group-membership-admission.js')
    old='return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](observed.transition);'
    new='return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]({...observed.transition, leaderTerm: status.term, runtimeGeneration: status.runtimeGeneration, replicaLifecycleIncarnation: status.lifecycleIncarnation, leaderConfigurationStamp: {configurationKey: status.configurationKey, membershipGenerationIndex: status.membershipGenerationIndex}});'
s=p.read_text();assert s.count(old)==1,(p,old);p.write_text(s.replace(old,new))
PY
    if measure "mutant-$mutant" timeout 60s npm run test:file -- "$TEST"; then exit 2; fi
    test "$(cat "$out/mutant-$mutant-exit.txt")" -eq 1
    grep -q ERR_ASSERTION "$out/mutant-$mutant.txt"
    case "$mutant" in
      permit) grep -q 'wrong group, recipient boot, sender and changed payload' "$out/mutant-$mutant.txt" ;;
      holder) grep -q 'current canonical boot and exact renewed holder' "$out/mutant-$mutant.txt" ;;
      native) grep -q 'native same-turn fencing must remain in force' "$out/mutant-$mutant.txt" ;;
    esac
    restore
  done
  git diff --exit-code -- src
  ;;
publish)
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$BASE"
  gh api repos/psvensson/lagrange/actions/artifacts/11558386411/zip > "$out/failed-census-37794494550.zip"
  echo "0962324a541f714c9b47cd69db125c313b1dbe23b0c98cf08232e2b136cc75f7  $out/failed-census-37794494550.zip" | sha256sum -c -
  node scripts/solve.js evidence add "$out/failed-census-37794494550.zip" --id "$QUEST" --text 'Run 37794494550 stopped at ambiguous subsystem classification before any runtime-consumer test or source attempt. Original failed outputs retained; no positive result belongs to this run.' --json > "$out/canonical-failed-census.json"
  git diff --binary "$BASE" > "$out/change.patch"
  git diff --exit-code -- src
  git status --porcelain > "$out/measured-status.txt"
  python3 - <<'PY'
import hashlib,json,os,subprocess,zipfile
from pathlib import Path
out=Path('test-output/learner-runtime')
files={p.name:p.read_bytes() for p in out.iterdir() if p.is_file() and p.suffix not in ['.zip','.bundle']}
hashes={n:hashlib.sha256(b).hexdigest() for n,b in files.items()}
files['SHA256SUMS']=(''.join(h+'  '+n+'\n' for n,h in sorted(hashes.items()))).encode()
archive=out/f"learner-runtime-{os.environ['GITHUB_RUN_ID']}.zip"
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name,content in files.items():z.writestr(name,content)
with (out/'canonical.json').open('w') as f:
    subprocess.run(['node','scripts/solve.js','evidence','add',str(archive),'--id',os.environ['QUEST'],
      '--text','Measured repository-to-native learner consumer, exact refusal/mutation controls. Not transport authentication, physical CREATE, multi-host or full-cutover proof.','--json'],stdout=f,check=True)
record={'schema':'freshmg-learner-runtime-proof/1','runId':int(os.environ['GITHUB_RUN_ID']),
  'sourceSha':(out/'source-sha.txt').read_text().strip(),'baseSha':os.environ['BASE'],
  'carrierSha':os.environ['GITHUB_SHA'],'runner':os.environ['RUNNER_NAME'],
  'independentApproval':False,'distributedAcceptance':False,
  'proofCeiling':'actual repository with file-backed SQL gateway fixture, three real raft-rs ports and in-process transport; host sender/recipient bindings are supplied; no physical target, CREATE, full driver or network-authentication proof',
  'canonicalEvidence':json.loads((out/'canonical.json').read_text()),
  'outputs':{n:b.decode() for n,b in files.items()},'sha256':hashes}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/f"learner-runtime-{os.environ['GITHUB_RUN_ID']}.json"
p.write_text(json.dumps(record,indent=2)+'\n')
PY
  git add "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/learner-runtime-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain native learner-consumer proof, failed census and explicit limits'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  exact="$(git rev-parse HEAD)"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$exact"
  echo "$exact" > "$out/published-sha.txt"
  ;;
*) exit 2 ;;
esac
