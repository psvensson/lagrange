#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-origin-20261009"
out="$GITHUB_WORKSPACE/origin-review-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('PR111 corrective measurement');"
mkdir -p "$out"
export PROOF_OUT="$out"
test_file=test/integration/message-group-learner-runtime-authorization.integration.test.js
source_files=(src/raft/raft-rs-committed-membership-context.js src/raft/raft-rs-committed-membership-read.js src/raft/snapshot-checkpoint-format.js)
measure() {
 local name="$1";shift
 printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
 date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.started.txt"
 local status=0
 "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
 printf '%s\n' "$status" > "$out/$name.exit.txt"
 date -u +%Y-%m-%dT%H:%M:%SZ > "$out/$name.finished.txt"
 tail -30 "$out/$name.stdout.txt"
 if [ "$status" -ne 0 ]; then tail -15 "$out/$name.stderr.txt";fi
 return "$status"
}
case "$1" in
measure)
 test "$(git rev-parse HEAD)" = "$EXPECTED"
 test -z "$(git status --porcelain)"
 cp "$carrier"/review-{source,tests}.patch "$carrier/review-check.py" "$carrier/review-run.sh" "$out/"
 printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
 git config user.name 'github-actions[bot]'
 git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
 measure install npm ci
 node scripts/solve.js note --id "$QUEST" --finding 'User approved 2026-10-09 adversarial review and progression to install/repository/driver/current CREATE/ordered successor path. This first bounded correction addresses PR111 review 5469017424 and author review cad6b0e6: exact own-data learner query capture, existing-owner impossible-term refusal preserving old terms, queued corruption and registry no-op/conflict tests, shape-first descriptor refusal. No global revocation, successor grant, CREATE activation, new authority, schema or acceptance change. Follow actual install/reopen and operation recording next; earlier full lab FAIL and timing findings remain.' --kind decision --json > "$out/scope-note.json"
 git apply --check "$carrier/review-tests.patch"
 git apply "$carrier/review-tests.patch"
 measure test-lint npm exec --no -- eslint "$test_file" --fix
 measure test-metrics npm run test:metrics:scoped:strict -- "$test_file"
 measure red-metadata npm run test:metadata:refresh
 git diff --exit-code "$EXPECTED" -- src
 git add -- "$test_file" test/shards/ "solve/quests/$QUEST/log.ndjson"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: expose learner action snapshot and live origin coherence defects'
 git rev-parse HEAD > "$out/red-sha.txt"
 if measure red npm run test:file -- "$test_file"; then echo 'Expected source defects did not engage' >&2; exit 2;fi
 python3 "$carrier/review-check.py" red
 git apply --check "$carrier/review-source.patch"
 git apply "$carrier/review-source.patch"
 measure source-lint npm exec --no -- eslint "${source_files[@]}" --fix
 measure source-metrics npm run test:metrics:scoped:strict -- "${source_files[@]}"
 for pair in 'decisions:check-guideline-decision-boundaries' 'grammar:check-runtime-grammar-contracts' 'literals:check-guideline-literals'; do
  name="${pair%%:*}";script="${pair#*:}"
  measure "$name" node "scripts/$script.js" --json "${source_files[@]}"
  python3 - "$out/$name.stdout.txt" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));assert r['totalViolationCount']==0,r
PY
 done
 measure metadata npm run test:metadata:refresh
 measure shards npm run audit:shards
 node scripts/solve.js note --id "$QUEST" --attempt 'Fix PR111 exact action input snapshot and authoritative current-term ceiling; retain older committed terms. Add actual queued corrupt/future-origin tests, native-origin-backed registry replay/conflict rollback, and direct null-shape refusal. No alteration of historical context encoding, native proposal, operation phase, CREATE or successor semantics.' --json > "$out/attempt.json"
 git diff --check
 git add -- "${source_files[@]}" test/shards/ "solve/quests/$QUEST/log.ndjson"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: snapshot learner action input and refuse impossible live origin terms'
 git rev-parse HEAD > "$out/source-sha.txt"
 measure consumer npm run test:file -- "$test_file"
 measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
 measure neighbors npm run test:file -- test/raft/raft-rs-backend/committed-membership-read.test.js test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
 python3 "$carrier/review-check.py" timings
 git diff --exit-code -- src
 test -z "$(git status --porcelain)"
 ;;
publish)
 gh auth setup-git
 test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
 test -z "$(git status --porcelain)"
 git diff --binary "$EXPECTED" > "$out/change.patch"
 if [ -d .tap/test-results ]; then cp -a .tap/test-results "$out/tap-results";fi
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
PY
 node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'PR111 finite review correction: original-source named failing assertions, exact-own-data capture, native current-term ceiling with old-term positives, actual queued corrupt origin and registry replay/conflict rollback. Canonical driver, unchanged budgets, explicit semantic JSON zero checks. Isolated mutations and installation follow separately; no full driver/CREATE/successor activation, global metadata revocation or physical acceptance.' --json > "$out/canonical.json"
 python3 - <<'PY'
import json,os
from pathlib import Path
out=Path(os.environ['PROOF_OUT'])
r={'schema':'pr111-corrective-proof/1','runId':int(os.environ['GITHUB_RUN_ID']),'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'redSha':(out/'red-sha.txt').read_text().strip(),'timings':json.loads((out/'timings.json').read_text()),'mutations':'not run in this preservation attempt','canonicalEvidence':json.loads((out/'canonical.json').read_text()),'executionSubstrate':'GitHub-hosted Ubuntu; normal locked better-sqlite3; actual native ports; file-backed operation fixture and in-process transport','independentApproval':False,'fullLabVerdict':'FAIL','createActivation':False,'successorIssuance':False}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('pr111-correction-'+os.environ['GITHUB_RUN_ID']+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
 git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/pr111-correction-$GITHUB_RUN_ID.json"
 LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain exact PR111 boundary corrections and regression results'
 git push origin "HEAD:refs/heads/$WORK_BRANCH"
 test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
 git rev-parse HEAD > "$out/published-sha.txt"
 git status --porcelain > "$out/final-status.txt"
 ;;
*) exit 2;;
esac
