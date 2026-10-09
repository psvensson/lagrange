#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/learner-origin-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-origin-20261009"
test_file=test/integration/message-group-learner-runtime-authorization.integration.test.js
mkdir -p "$out"
mapfile -t source_files < <(sed -n 's|^+++ b/||p' "$carrier"/{read,registry,runtime,checkpoint}.patch | sort -u)
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
  tail -35 "$out/$name.stdout.txt"
  if [ "$status" -ne 0 ]; then tail -25 "$out/$name.stderr.txt"; fi
  return "$status"
}
metrics() {
  local phase="$1"
  measure "metrics-$phase" npm run test:metrics:scoped -- "${source_files[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-$phase.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-$phase.json"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  cp "$carrier"/*.patch "$out/"
  cp "$carrier/scope.json" "$out/"
  printf 'base=%s\ncarrier=%s\nrunner=%s\ncap=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" "$LAGRANGE_LANE_JOBS_CAP" > "$out/provenance.txt"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  measure install npm ci
  metrics before
  node scripts/solve.js note --id "$QUEST" --finding '2026-10-09 bounded continuation approved by the user after adversarial review: recover exact committed learner provenance via the existing permanent peer registry and native apply/read owners, retain it in the existing scrubbed checkpoint, and version the unreleased raft_rs_replica_image payload to 2. Origins are historical positives; missing proof stays UNKNOWN. Explicit scope includes registry, committed context/read, native transaction/runtime/port and checkpoint format/store/install. No successor issuance, repository phase advancement, CREATE, route activation, global boot revocation or gate weakening. Current contract is architecture/contracts/message-group-committed-learner-origin.md.' --kind decision --json > "$out/scope-note.json"
  git apply --check "$carrier/tests.patch"
  git apply "$carrier/tests.patch"
  measure test-lint npm exec --no -- eslint "$test_file" --fix
  measure test-metrics npm run test:metrics:scoped:strict -- "$test_file"
  measure red-metadata npm run test:metadata:refresh
  git diff --exit-code "$EXPECTED" -- src
  git add -- "$test_file" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: require exact committed learner origin across native recovery and checkpoints'
  git rev-parse HEAD > "$out/red-sha.txt"
  if measure red npm run test:file -- "$test_file"; then
    echo 'New origin witness unexpectedly passed on original runtime' >&2; exit 2
  fi
  test "$(cat "$out/red.exit.txt")" -eq 1
  grep -Fq 'a reservation or issued intent must not become committed evidence' "$out/red.stdout.txt"
  for patch in read registry runtime checkpoint; do
    git apply --check "$carrier/$patch.patch"
    git apply "$carrier/$patch.patch"
  done
  python3 - <<'PY'
import json
from pathlib import Path
p=Path('test/shards/impact-contracts.json'); data=json.loads(p.read_text())
key='message-group-committed-learner-origin'
a=['src/raft/raft-rs-application-transaction-owner.js','src/raft/raft-rs-runtime-owner.js','src/raft/raft-rs-operation-port.js','src/raft/raft-rs-committed-membership-read.js','src/raft/raft-rs-committed-membership-context.js','src/raft/raft-committed-membership-constants.js']
b=['src/raft/raft-rs-peer-identity.js','src/raft/raft-rs-peer-identity-constants.js','src/raft/snapshot-checkpoint-constants.js','src/raft/snapshot-checkpoint-format.js','src/raft/snapshot-checkpoint-store.js','src/raft/snapshot-install.js']
t=['test/integration/message-group-learner-runtime-authorization.integration.test.js']
description='Existing committed application and permanent identity owners retain exact managed learner origin atomically; the queued historical read and versioned checkpoint validate that origin. Missing evidence remains unresolved; no current CREATE or reissue authority.'
assert key not in data['contracts'] and key not in data['coupledPairs']
data['contracts'][key]={'description':description,'owners':a+b,'tests':t}
data['coupledPairs'][key]={'description':description,'endpoints':[{'id':'native-applied-origin','owners':a},{'id':'permanent-identity-and-checkpoint','owners':b}],'contract':key,'witnessTests':t}
p.write_text(json.dumps(data,indent=2)+'\n')
PY
  measure source-lint npm exec --no -- eslint "${source_files[@]}" --fix
  metrics after
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "${source_files[@]}"
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "${source_files[@]}"
  measure literals node scripts/check-guideline-literals.js --json "${source_files[@]}"
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  node scripts/solve.js note --id "$QUEST" --attempt 'Retain canonical managed ADD_LEARNER origin inside the existing permanent-identity/application transaction. Add an explicit queued historical read purpose and checkpoint payload version 2 with origin/payload/applied-boundary checks. Test original-source red, noncommitted UNKNOWN, actual leader/port/runtime replacement, exact tuple rejection, real apply rollback and scrubbed checkpoint evidence. No driver/CREATE/reissue activation or cancellation semantics changed.' --json > "$out/attempt.json"
  git diff --check
  git add -- "${source_files[@]}" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'feat: recover exact committed learner origin through existing native and checkpoint owners'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure consumer npm run test:file -- "$test_file"
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  measure native-neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
  export PROOF_OUT="$out"
  python3 - <<'PY'
from pathlib import Path
import collections,json,os,re
out=Path(os.environ['PROOF_OUT']); timings={};new={}
for name,limit,count in [('consumer',30000,1),('regressions',2000,4),('native-neighbors',2000,2)]:
 rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
 assert len(rows)==count,(name,rows)
 timings[name]={'limitMs':limit,'files':rows,'withinBudget':all(int(ms)<=limit for _,_,ms in rows)}
for name in ['complexity','cognitive']:
 before=json.loads((out/(name+'-before.json')).read_text())['violations']
 after=json.loads((out/(name+'-after.json')).read_text())['violations']
 def keyed(rows):return collections.Counter((x['filePath'],x['message']) for x in rows)
 new[name]=list((keyed(after)-keyed(before)).elements())
(out/'timings.json').write_text(json.dumps(timings,indent=2)+'\n')
(out/'new-complexity.json').write_text(json.dumps(new,indent=2)+'\n')
assert not any(new.values()),new
assert all(x['withinBudget'] for x in timings.values()),timings
PY
  test -z "$(git status --porcelain)"
  ;;
publish)
  export PROOF_OUT="$out"
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  if [ -d .tap/test-results ]; then cp -a .tap/test-results "$out/tap-results"; fi
  cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"
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
(out/'archive-sha256.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'\n')
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Bounded committed learner origin: staged original-runtime red; actual native apply, port/core/leader recovery, wrong action, rollback and checkpoint scrub/payload binding. Source/lock/commands and complete results retained. Missing origin is not non-commitment. No successor issuance, CREATE, global boot revocation, independent approval or physical distributed acceptance.' --json > "$out/canonical.json"
  python3 - <<'PY'
import json,os
from pathlib import Path
out=Path(os.environ['PROOF_OUT'])
r={'schema':'freshmg-learner-origin/1','runId':int(os.environ['GITHUB_RUN_ID']),'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'redSha':(out/'red-sha.txt').read_text().strip(),'timings':json.loads((out/'timings.json').read_text()),'newComplexity':json.loads((out/'new-complexity.json').read_text()),'canonicalEvidence':json.loads((out/'canonical.json').read_text()),'proofCeiling':'actual native ports and file-backed SQL with in-process transport and checkpoint payload; not physical process loss, power loss or distributed acceptance','successorIssuance':False,'createPermission':False,'independentApproval':False,'fullLabVerdict':'FAIL'}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('learner-origin-'+os.environ['GITHUB_RUN_ID']+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/learner-origin-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain bounded learner-origin recovery and explicit remaining gates'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2;;
esac
