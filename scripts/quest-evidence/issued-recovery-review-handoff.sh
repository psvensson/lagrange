#!/usr/bin/env bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
out="$GITHUB_WORKSPACE/issued-recovery-review-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$out"
export OUT="$out"
q="solve/quests/$QUEST"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  tail -25 "$out/$name.stdout.txt"
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  measure install npm ci
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  python3 - <<'PY'
import json
from pathlib import Path
p=Path('test/shards/impact-contracts.json');data=json.loads(p.read_text());key='issued-membership-action-recovery'
assert key not in data['contracts'] and key not in data['coupledPairs']
description=('The existing durable-store owner acquires one coherent committed same-group read snapshot and refuses uncommitted views; the existing context owner reports exact retained applied action identity. Missing or snapshot-covered provenance remains unresolved, not negative evidence, a successor grant, or current CREATE permission. This does not activate the production runtime receipt route.')
owners=['src/raft/raft-rs-durable-store.js','src/raft/raft-rs-committed-membership-context.js']
tests=['test/raft/raft-rs-backend/issued-action-record-read.test.js','test/raft/raft-rs-backend/issued-action-recovery.test.js']
data['contracts'][key]={'description':description,'owners':owners,'tests':tests}
data['coupledPairs'][key]={'description':description,'endpoints':[{'id':'coherent-durable-record','owners':[owners[0]]},{'id':'exact-historical-action-context','owners':[owners[1]]}],'contract':key,'witnessTests':tests}
p.write_text(json.dumps(data,indent=2)+'\n')
PY
  measure metadata npm run test:metadata:refresh
  measure registry npm run audit:impact-contracts
  measure shards npm run audit:shards
  git diff --exit-code "$EXPECTED" -- src package.json package-lock.json test/raft
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  node scripts/solve.js note --id "$QUEST" --attempt 'Register the already-implemented coherent durable-record / exact action-context interaction under its existing architecture contract and both real-owner witnesses. No runtime or ordinary test bytes change. The corrected package has canonical 22-case normal-driver and twelve mutation proof at 427c2fbf; previous failed attempts remain retained. Preserve separate failed learner-origin candidate as historical input, not an accepted integration. Merge-commit permission does not waive independent verification or exact-main gates.' --json > "$out/attempt.json"
  git diff --check
  git add -- test/shards/ "$q/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: register coherent action-recovery owner interaction and witnesses'
  git rev-parse HEAD > "$out/test-sha.txt"
  measure tests npm run test:file -- test/raft/raft-rs-backend/issued-action-recovery.test.js test/raft/raft-rs-backend/issued-action-record-read.test.js test/raft/raft-rs-backend/durable-store-committed-entries.test.js
  python3 - <<'PY'
import json,os,re
from pathlib import Path
out=Path(os.environ['OUT']);text=(out/'tests.stdout.txt').read_text();rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',text,re.M)
expected={'test/raft/raft-rs-backend/issued-action-recovery.test.js','test/raft/raft-rs-backend/issued-action-record-read.test.js','test/raft/raft-rs-backend/durable-store-committed-entries.test.js'}
assert len(rows)==3 and {r[0] for r in rows}==expected and all(int(r[2])<=2000 for r in rows),rows
(out/'timings.json').write_text(json.dumps({'files':rows,'limitMs':2000},indent=2)+'\n')
PY
  test -z "$(git status --porcelain)"
  ;;
publish)
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  # Preserve exact source bytes from the separate failed origin run. Do not
  # replay or merge them into this candidate or update their original branch.
  gh api repos/psvensson/lagrange/actions/artifacts/11599305613/zip > "$out/preserved-origin-attempt-37892536228.zip"
  echo "e7c5a64e0b49e6dd83f17aadec40f59babc27a1f783e79d0d8b104aa2ed5de7c  $out/preserved-origin-attempt-37892536228.zip" | sha256sum -c -
  python3 - <<'PY'
import os,zipfile
from pathlib import Path
out=Path(os.environ['OUT'])
with zipfile.ZipFile(out/'preserved-origin-attempt-37892536228.zip') as z:
 assert z.read('source-sha.txt').decode().strip()=='dbcda7e02df05822089819a73aee9a0594edb604'
 (out/'origin-candidate.bundle').write_bytes(z.read('candidate.bundle'))
PY
  git fetch --no-tags origin f258bade6dedde2b10b6c73d035f2b942b493b5e
  git bundle verify "$out/origin-candidate.bundle" > "$out/origin-bundle-check.txt" 2>&1
  preserved=handoff/freshmg-origin-attempt-37892536228
  remote="$(git ls-remote origin "refs/heads/$preserved" | cut -f1)"
  if [ -z "$remote" ]; then
    git fetch "$out/origin-candidate.bundle" "HEAD:refs/heads/$preserved"
    test "$(git rev-parse "refs/heads/$preserved")" = dbcda7e02df05822089819a73aee9a0594edb604
    git push origin "refs/heads/$preserved:refs/heads/$preserved"
  else
    test "$remote" = dbcda7e02df05822089819a73aee9a0594edb604
  fi
  test "$(git ls-remote origin "refs/heads/$preserved" | cut -f1)" = dbcda7e02df05822089819a73aee9a0594edb604
  node scripts/solve.js evidence add "$out/preserved-origin-attempt-37892536228.zip" --id "$QUEST" --text 'Preserve exact separate failed learner-origin attempt 37892536228: source dbcda7e02 over f258bade, failed 33-case production-port integration and remaining static findings. Candidate bundle published under handoff/freshmg-origin-attempt-37892536228, original source/ops branches unchanged. This is failed historical input, not adopted origin/checkpoint semantics or approval.' --json > "$out/origin-canonical.json"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,zipfile
out=Path(os.environ['OUT']);m={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(m,indent=2)+'\n')
with zipfile.ZipFile(str(out)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(out)))
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Register existing recovery owner interaction and rerun both named witnesses plus committed-reader regression on exact unchanged runtime. Preserve separate failed origin attempt without integration. No source approval, full-cone/static claim, main merge or distributed acceptance.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['OUT']);r={'schema':'issued-recovery-review-handoff/1','runId':os.environ['GITHUB_RUN_ID'],'baseSha':os.environ['EXPECTED'],'testSha':(out/'test-sha.txt').read_text().strip(),'timings':json.loads((out/'timings.json').read_text()),'canonicalEvidence':json.loads((out/'canonical.json').read_text()),'preservedOrigin':{'sourceSha':'dbcda7e02df05822089819a73aee9a0594edb604','branch':'handoff/freshmg-origin-attempt-37892536228','verdict':'FAILED_NOT_INTEGRATED','canonicalEvidence':json.loads((out/'origin-canonical.json').read_text())},'runtimeSourceChanged':False,'independentApproval':False,'fullLabVerdict':'FAIL'}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('issued-recovery-review-'+os.environ['GITHUB_RUN_ID']+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "$q/log.ndjson" "$q/evidence/issued-recovery-review-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: bind recovery review surface and preserve failed origin source'
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  test -z "$(git status --porcelain)"
  gh pr comment 110 --repo psvensson/lagrange --body "Exact-head independent review requested at $(git rev-parse HEAD). Canonical code and normal-driver mutations: run 37904808160, source 427c2fbfafe971d75dbb6e7b43dd482f22c79674. This head additionally registers the existing owner interaction and reruns its three files without source changes. Review coherent same-group storage acquisition, active-transaction refusal, snapshot-anchored suffix validity, exact action identity, unknown-versus-absence semantics, and proof-checker fidelity. The separate failed origin source is preserved, not merged. No full runtime/checkpoint/receipt/CREATE/main approval is claimed."
  gh pr edit 110 --repo psvensson/lagrange --add-reviewer @copilot
  gh pr view 110 --repo psvensson/lagrange --json number,headRefOid,isDraft,reviewRequests > "$out/review-request.json"
  ;;
*) exit 2 ;;
esac
