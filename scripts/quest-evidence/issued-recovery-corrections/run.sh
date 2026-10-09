#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/issued-corrections-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
evidence=solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009
sources=(src/raft/raft-rs-committed-membership-context.js src/raft/raft-rs-durable-store.js)
tests=(test/raft/raft-rs-backend/issued-action-recovery.test.js test/raft/raft-rs-backend/durable-store-membership-action.test.js)
mkdir -p "$out"
export PROOF_OUT="$out" CARRIER="$carrier"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
  tail -35 "$out/$name.stdout.txt"; tail -15 "$out/$name.stderr.txt"
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  python3 - <<'PY'
import base64,gzip,hashlib,json,os
from pathlib import Path
out=Path(os.environ['PROOF_OUT']);p=Path(os.environ['CARRIER'])/'scripts/quest-evidence/issued-recovery-corrections'
parts=[(p/f'payload-{n}.b64').read_text().strip() for n in range(3)]
for n,s in enumerate(parts):(out/f'transferred-part-{n}.b64').write_text(s+'\n')
# Correct only identified transcription insertions in the transfer encoding.
# The complete decoded patch must match its pre-transfer SHA256 before use.
fixes=[(1,'VOPr6Sr2yK7uvz','VOPr6r2yK7uvz'),(2,'/ONztzt+3Q','/ONzt+3Q'),
 (2,'3L15GL9GL9der','3L15GL9der'),(2,'1fr8J63J/h63','1fr8J/h63')]
applied=[]
for n,old,new in fixes:
 count=parts[n].count(old)
 assert count in (0,1),(n,'ambiguous transcription correction')
 if count:parts[n]=parts[n].replace(old,new,1);applied.append([n,old,new])
(out/'transfer-corrections.json').write_text(json.dumps(applied,indent=2)+'\n')
patch=gzip.decompress(base64.b64decode(''.join(parts),validate=True))
expected='b7c4cff4f3e34c588ce8cd72d08d0b42f4e77ed8d8c9ba0ae5828268c81ae36b'
assert hashlib.sha256(patch).hexdigest()==expected,'transferred patch identity mismatch'
(out/'input.patch').write_bytes(patch)
(out/'input-patch.sha256').write_text(expected+'\n')
PY
  measure install npm ci
  measure metrics-before npm run test:metrics:scoped -- "${sources[@]}"
  measure apply-check git apply --check "$out/input.patch"
  git apply "$out/input.patch"
  measure lint npm exec --no -- eslint "${sources[@]}" "${tests[@]}" "$evidence/node-sqlite-adapter.mjs" "$evidence/diagnostic-loader.mjs" "$evidence/failure-reporter.mjs" --fix
  measure metrics-source npm run test:metrics:scoped:strict -- "${sources[@]}"
  measure metrics-tests npm run test:metrics:scoped:strict -- "${tests[@]}"
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "${sources[@]}"
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}"
  measure literals node scripts/check-guideline-literals.js --json "${sources[@]}"
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  measure native-tests npm run test:file -- "${tests[@]}" test/raft/raft-rs-backend/durable-store-committed-entries.test.js
  measure consumer-regression npm run test:file -- test/integration/message-group-learner-runtime-authorization.integration.test.js
  measure mutations python3 "$evidence/run-diagnostic.py" . "$out/campaign"
  measure proof-checker python3 "$evidence/test-diagnostic.py" . "$out/checker"
  python3 - <<'PY'
import json,os,re
from pathlib import Path
out=Path(os.environ['PROOF_OUT']);rows={}
for name,count,limit in [('native-tests',3,2000),('consumer-regression',1,30000)]:
 found=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/f'{name}.stdout.txt').read_text(),re.M)
 assert len(found)==count,(name,found)
 assert all(int(ms)<=limit for _,_,ms in found),(name,'unchanged duration failure',found)
 rows[name]={'limitMs':limit,'files':found}
assert len(json.loads((out/'campaign/results.json').read_text()))==17
assert len(json.loads((out/'checker/checker-results.json').read_text()))==6
(out/'timings.json').write_text(json.dumps(rows,indent=2)+'\n')
PY
  git diff --check
  git diff --exit-code -- package.json package-lock.json
  test "$(wc -l < src/raft/raft-rs-durable-store.js)" -le 800
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  node scripts/solve.js note --id "$QUEST" --finding 'User-approved corrective scope from attached issued-action package review: bind negative proof to the exact failed assertion; assert WAL and actual reconstruction engagement; refuse under the existing probe marker and retain timeout output; put coherent receipt-specific record acquisition in the existing durable store. Separate branch avoids the active committed-learner-origin implementation. No production route, new durable ledger, reissue or CREATE permission, source approval, changed acceptance or main integration.' --kind decision --json > "$out/decision.json"
  node scripts/solve.js note --id "$QUEST" --attempt 'Implement package review corrections and a same-group, coherent read-only store observation. Canonical dependencies, native-history and real SQLite corruption/concurrent-writer cases, 13 exact-failure mutations and 6 checker adversaries. Original review is retained as history. Decoder remains subordinate; port/application/checkpoint origin work stays on its existing separate branch.' --json > "$out/attempt.json"
  git add -- "${sources[@]}" "${tests[@]}" architecture/contracts/issued-membership-action-recovery.md "$evidence" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: enforce exact recovery proof and coherent durable-store observation (WIP)'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure exact-native npm run test:file -- "${tests[@]}" test/raft/raft-rs-backend/durable-store-committed-entries.test.js
  test -z "$(git status --porcelain)"
  ;;
publish)
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git diff --binary "$EXPECTED" > "$out/change.patch"
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
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Issued-action package corrective proof: actual normal SQLite/native fixtures; exact designated mutation failures, WAL/reconstruction engagement, probe/timeout protections and coherent read-only store transaction with concurrent writer. Bounded component result, not actual production Ready path, retained checkpoint origin, repository advancement, physical acceptance or main approval.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT'])
r={'schema':'issued-action-review-corrections/1','runId':int(os.environ['GITHUB_RUN_ID']),
 'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),
 'executionSubstrate':'GitHub-hosted Ubuntu, Node 22, canonical locked dependencies, one classified worker',
 'timings':json.loads((out/'timings.json').read_text()),
 'mutationMeasurements':json.loads((out/'campaign/results.json').read_text()),
 'checkerControls':json.loads((out/'checker/checker-results.json').read_text()),
 'canonicalEvidence':json.loads((out/'canonical.json').read_text()),
 'archiveSha256':(out/'archive-sha256.txt').read_text().strip(),
 'originalPackageSha256':'84d1695157be6bac82fccbf7c8ddcbfed0597956d60509767333de97a4b0a55b',
 'originalReviewArchiveSha256':'828462e72f58b63f7163fc8e11eeb3ec5601fadc64b120fb5b6368927c9513aa',
 'proofCeiling':'actual native low-level Ready fixture and coherent SQLite store reads; no production port activation, process-kill, real runtime snapshot install, checkpoint provenance, replica_operations recording or distributed acceptance',
 'independentApproval':False,'mainMerged':False,'fullLabVerdict':'FAIL',
 'restartDurationResolved':False,'globalCurrentnessResolved':False}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('issued-corrections-'+os.environ['GITHUB_RUN_ID']+'.json')
p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/issued-corrections-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain canonical package correction proof and explicit activation limits'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2 ;;
esac
