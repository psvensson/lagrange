#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/process-review-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/issued-recovery-corrections/process-review"
rel="solve/quests/$QUEST/evidence/issued-action-recovery-20261009"
mkdir -p "$out"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"
  printf '\n' >> "$out/$name.command.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  tail -15 "$out/$name.stdout.txt"
  tail -15 "$out/$name.stderr.txt"
  return "$status"
}
check_red() {
  local name="$1"
  python3 - "$out" "$name" <<'PY'
from pathlib import Path
import json,sys
out=Path(sys.argv[1]);name=sys.argv[2]
s=json.loads((out/name/'summary.json').read_text())
assert s=={'testsRun':2,'failures':2,'errors':0,'skipped':0,'successful':False},s
text=(out/(name+'.stderr.txt')).read_text()
assert text.count('AssertionError: True is not false : owned descendants remain runnable after source restoration:')==2,text
PY
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  measure install npm ci
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  node scripts/solve.js note --id "$QUEST" --finding 'PR110 review 5467764802: bound correction to diagnostic process lifetime and current proof wording. Reproduce live Node child/grandchild after timeout and early parent exit, then terminate only the new session/process group owned by that measurement before source restoration. No runtime, storage, transaction, schema, native authority, budget or source-approval change. Earlier native/checkpoint origin attempt remains failed and separate. Merge-commit permission does not waive gates.' --kind decision --json > "$out/scope.json"
  python3 "$carrier/prepare.py" tests
  if measure original-red python3 "$rel/test-process-lifetime.py" "$out/original-red"; then
    echo 'Expected original worker-lifetime failures did not engage' >&2; exit 2
  fi
  test "$(cat "$out/original-red.exit.txt")" -eq 1
  check_red original-red
  git diff --exit-code "$EXPECTED" -- src test
  git add -- "$rel/test-process-lifetime.py" "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: expose live diagnostic descendants after timeout and early parent exit'
  git rev-parse HEAD > "$out/red-sha.txt"
  python3 "$carrier/prepare.py" fix
  python3 - "$rel" <<'PY'
from pathlib import Path
import sys
for path in Path(sys.argv[1]).glob('*.py'):
    compile(path.read_text(),str(path),'exec')
PY
  node scripts/solve.js note --id "$QUEST" --attempt 'Fix review 4228253017 in the existing diagnostic execute function: private POSIX session, group termination for timeout and normal parent exit, bounded drain/reap before source restoration, explicit cleanup failure. Add real child/grandchild regression and source-only revert. Correct 4228253103 wording to distinguish normal better-sqlite3 canonical results from diagnostic-adapter checker tests and still-missing production/physical proof. No src or ordinary test changes.' --json > "$out/attempt.json"
  git diff --check
  git add -- "$rel/run-diagnostic.py" architecture/contracts/issued-membership-action-recovery.md "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: terminate owned diagnostic worker groups before restoring mutation source'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure process-green python3 "$rel/test-process-lifetime.py" "$out/process-green"
  measure checker python3 "$rel/test-proof-checker.py" "$out/checker"
  measure normal-tests npm run test:file -- test/raft/raft-rs-backend/issued-action-recovery.test.js test/raft/raft-rs-backend/issued-action-record-read.test.js test/raft/raft-rs-backend/durable-store-committed-entries.test.js
  measure codec-mutations python3 "$rel/run-diagnostic.py" . "$out/codec-mutations" --normal-sqlite
  measure record-mutations python3 "$rel/run-record-controls.py" "$out/record-mutations" --normal-sqlite
  set +e
  LAGRANGE_PROBE=1 python3 "$rel/test-process-lifetime.py" "$out/probe-must-not-exist" > "$out/probe.stdout.txt" 2> "$out/probe.stderr.txt"
  probe=$?
  set -e
  echo "$probe" > "$out/probe.exit.txt"
  test "$probe" -ne 0
  test ! -e "$out/probe-must-not-exist"
  grep -Fq 'refused under LAGRANGE_PROBE=1' "$out/probe.stderr.txt"
  restore() { git show "HEAD:$rel/run-diagnostic.py" > "$rel/run-diagnostic.py"; }
  trap restore EXIT
  git show "$EXPECTED:$rel/run-diagnostic.py" > "$rel/run-diagnostic.py"
  if measure source-revert python3 "$rel/test-process-lifetime.py" "$out/source-revert"; then exit 2; fi
  test "$(cat "$out/source-revert.exit.txt")" -eq 1
  check_red source-revert
  restore
  trap - EXIT
  export PROOF_OUT="$out"
  python3 - <<'PY'
from pathlib import Path
import json,os,re
out=Path(os.environ['PROOF_OUT'])
for name,count in [('process-green',2),('checker',7)]:
    filename='summary.json' if name=='process-green' else 'checker-summary.json'
    s=json.loads((out/name/filename).read_text())
    assert s=={'testsRun':count,'failures':0,'errors':0,'skipped':0,'successful':True},s
rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/'normal-tests.stdout.txt').read_text(),re.M)
assert len(rows)==3 and sum(int(n) for _,n,_ in rows)==22,rows
assert all(int(ms)<=2000 for _,_,ms in rows),rows
(out/'timings.json').write_text(json.dumps({'files':rows,'limitMs':2000},indent=2)+'\n')
for name,count in [('codec-mutations',7),('record-mutations',9)]:
    records=json.loads((out/name/'results.json').read_text())
    assert len(records)==count and all(r.get('accepted') is True for r in records),(name,records)
PY
  git diff --exit-code "$EXPECTED" -- src test package.json package-lock.json
  git diff --check
  test -z "$(git status --porcelain)"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  ;;
publish)
  export PROOF_OUT="$out"
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git diff --exit-code "$EXPECTED" -- src test
  python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,zipfile
out=Path(os.environ['PROOF_OUT'])
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=out.parent/(out.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(out)))
with zipfile.ZipFile(archive) as z:
    for name,digest in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest
(out/'archive-sha256.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'\n')
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'PR110 review correction: real child/grandchild after timed-out and normally exited parents. Original helper and source-only revert fail both intended live-worker assertions; private-group correction passes; original checker, normal-driver 22 cases and twelve exact mutations rechecked. No runtime/ordinary-test changes or full cutover approval. Hosted Linux diagnostic/component measurement, not GCP physical acceptance.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT'])
data={'schema':'issued-recovery-process-lifetime-review/1','runId':os.environ['GITHUB_RUN_ID'],'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'redSha':(out/'red-sha.txt').read_text().strip(),'reviewId':5467764802,'findingIds':[4228253017,4228253103],'timings':json.loads((out/'timings.json').read_text()),'processCases':2,'checkerCases':7,'normalDriverCases':22,'codecMutationControls':5,'storeMutationControls':7,'canonicalEvidence':json.loads((out/'canonical.json').read_text()),'archiveSha256':(out/'archive-sha256.txt').read_text().strip(),'runtimeSourceChanged':False,'independentApproval':False,'fullLabVerdict':'FAIL','distributedAcceptance':False}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('process-lifetime-review-'+os.environ['GITHUB_RUN_ID']+'.json')
p.write_text(json.dumps(data,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/process-lifetime-review-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain owned-worker cleanup correction and canonical recovery regressions'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2 ;;
esac
