#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/runtime-r2-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
source_file=src/rebalancer/replica-operation-message-group-learner-observation.js
test_file=test/integration/message-group-learner-runtime-authorization.integration.test.js
mkdir -p "$out"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"
  printf '\n' >> "$out/$name.command.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  tail -35 "$out/$name.stdout.txt"
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  measure install npm ci
  printf 'base=%s\ncarrier=%s\nrunner=%s\ncap=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" "$LAGRANGE_LANE_JOBS_CAP" > "$out/provenance.txt"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  measure metrics-before npm run test:metrics:scoped:strict -- "$source_file"
  measure decisions-before node scripts/check-guideline-decision-boundaries.js --json "$source_file"
  measure grammar-before node scripts/check-runtime-grammar-contracts.js --json "$source_file"
  measure literals-before node scripts/check-guideline-literals.js --json "$source_file"
  node scripts/solve.js note --id "$QUEST" --finding 'R2 review 5460477132 / 4222118121: exact operation observation precedes a separate awaited boot read. Bound this correction to re-observing the operation through the same repository after that await and checking claim liveness after all reads. It does not create cross-group atomicity or revoke an already-issued action; failed terminal settlement retaining the same issued learner remains admissible. Tests must prove actual renewal/success during the paused read blocks proposal, retained failure remains allowed, and unavailable final evidence refuses. Attempt 37817790691 stopped at test lint before behavioral measurement: unnecessary broad description reformatting introduced a 101-character line. That preparation rewrite is removed, not the lint rule.' --kind decision --json > "$out/scope.json"
  python3 "$carrier/scripts/quest-evidence/prepare-runtime-review-r2.py" . tests
  measure test-lint npm exec --no -- eslint "$test_file" --fix
  measure test-metrics npm run test:metrics:scoped:strict -- "$test_file"
  measure red-metadata npm run test:metadata:refresh
  git diff --exit-code "$EXPECTED" -- src
  git add -- "$test_file" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: reproduce authorization races across the real boot-read await'
  git rev-parse HEAD > "$out/red-sha.txt"
  if measure red npm run test:file -- "$test_file"; then
    echo 'Red witness unexpectedly passed' >&2; exit 2
  fi
  test "$(cat "$out/red.exit.txt")" -eq 1
  for marker in 'a holder replaced during boot observation cannot reach native proposal' 'successful settlement during boot observation cannot authorize a learner' 'unavailable final operation observation must retain a retryable refusal'; do
    grep -Fq "$marker" "$out/red.stdout.txt"
  done
  python3 "$carrier/scripts/quest-evidence/prepare-runtime-review-r2.py" . source
  measure source-lint npm exec --no -- eslint "$source_file"
  measure metrics-after npm run test:metrics:scoped:strict -- "$source_file"
  measure decisions-after node scripts/check-guideline-decision-boundaries.js --json "$source_file"
  measure grammar-after node scripts/check-runtime-grammar-contracts.js --json "$source_file"
  measure literals-after node scripts/check-guideline-literals.js --json "$source_file"
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  node scripts/solve.js note --id "$QUEST" --attempt 'R2 narrow read-window repair: re-observe exact issued operation through the existing repository after boot observation, then validate live claim. No new state/owner/export and no altered terminal-lifetime policy. Red paused-read controls use actual repository renewal and terminal transitions; failure after issue remains a native committed learner positive. No cross-group atomicity or physical CREATE claim.' --json > "$out/attempt.json"
  git diff --check
  git add -- "$source_file" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: revalidate issued learner state after authoritative boot observation'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure integration npm run test:file -- "$test_file"
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  export PROOF_OUT="$out"
  python3 - <<'PY'
from pathlib import Path
import json,os,re
out=Path(os.environ['PROOF_OUT']);result={}
for name,limit in [('integration',30000),('regressions',2000)]:
    rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
    assert len(rows)==(1 if name=='integration' else 4),(name,rows)
    assert all(int(ms)<=limit for _,_,ms in rows),(name,'budget failure',rows)
    result[name]={'limitMs':limit,'files':rows}
(out/'timings.json').write_text(json.dumps(result,indent=2)+'\n')
PY
  restore() { git show "HEAD:$source_file" > "$source_file"; }
  trap restore EXIT
  git show "$EXPECTED:$source_file" > "$source_file"
  if measure source-revert npm run test:file -- "$test_file"; then exit 2; fi
  test "$(cat "$out/source-revert.exit.txt")" -eq 1
  for marker in 'a holder replaced during boot observation cannot reach native proposal' 'successful settlement during boot observation cannot authorize a learner' 'unavailable final operation observation must retain a retryable refusal'; do
    grep -Fq "$marker" "$out/source-revert.stdout.txt"
  done
  restore
  trap - EXIT
  git diff --exit-code -- src test
  test -z "$(git status --porcelain)"
  cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  ;;
publish)
  export PROOF_OUT="$out"
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
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
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'PR109 R2 paused-boot-read correction: real repository renewal and success must refuse old observations; terminal failure after issue preserves its admitted action; final unreadable operation remains typed unavailable. Red/green/source-revert on the real native-consumer witness. No cross-group atomicity, physical CREATE, full driver or distributed proof. Original lint-stopped attempt 37817790691 retained inside.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT'])
r={'schema':'freshmg-runtime-r2/1','reviewId':5460477132,'findingId':4222118121,
   'runId':int(os.environ['GITHUB_RUN_ID']),'baseSha':os.environ['EXPECTED'],
   'sourceSha':(out/'source-sha.txt').read_text().strip(),
   'redSha':(out/'red-sha.txt').read_text().strip(),
   'timings':json.loads((out/'timings.json').read_text()),
   'canonicalEvidence':json.loads((out/'canonical.json').read_text()),
   'archiveSha256':(out/'archive-sha256.txt').read_text().strip(),
   'proofCeiling':'file-backed canonical operation repository, supplied boot/node bindings, actual native ports with in-process inbox; observed race across boot await, not atomic cross-group authorization or registered physical CREATE',
   'restartDurationResolved':False,'independentApproval':False,'fullLabVerdict':'FAIL','distributedAcceptance':False}
dest=Path('solve/quests')/os.environ['QUEST']/'evidence'/('runtime-r2-'+os.environ['GITHUB_RUN_ID']+'.json')
dest.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/runtime-r2-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain paused-read race correction and its source-revert proof'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2 ;;
esac
