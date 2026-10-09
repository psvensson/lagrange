#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/issued-corrections-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
evidence=solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009
sources=(src/raft/raft-rs-committed-membership-context.js src/raft/raft-rs-durable-store.js)
tests=(test/raft/raft-rs-backend/issued-action-recovery.test.js test/raft/raft-rs-backend/durable-store-membership-action.test.js)
mkdir -p "$out"
export PROOF_OUT="$out"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  printf '%s\n' "$status" > "$out/$name.exit.txt"
  tail -25 "$out/$name.stdout.txt"; tail -10 "$out/$name.stderr.txt"
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  measure install npm ci
  measure literal-before node scripts/check-guideline-literals.js --json "${sources[@]}"
  python3 - <<'PY'
import json,os
from pathlib import Path
out=Path(os.environ['PROOF_OUT']);r=json.loads((out/'literal-before.stdout.txt').read_text())
assert r['totalViolationCount']==1 and r['violations'][0]['value']=="'0'",r
p=Path('src/raft/raft-rs-committed-membership-context.js');s=p.read_text()
anchor="import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';"
assert s.count(anchor)==1
s=s.replace(anchor,anchor+"\nimport {RAFT_RS_ZERO_INDEX as ZERO} from './raft-rs-durable-store-constants.js';",1)
old="if (entry.term === '0') throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);"
new="if (entry.term === ZERO) throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);"
assert s.count(old)==1
s=s.replace(old,new,1);p.write_text(s)
p=Path('solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009/run-diagnostic.py');s=p.read_text()
assert s.count(old)==1;p.write_text(s.replace(old,new,1))
PY
  measure lint npm exec --no -- eslint "${sources[@]}" "${tests[@]}" --fix
  measure metrics-source npm run test:metrics:scoped:strict -- "${sources[@]}"
  measure metrics-tests npm run test:metrics:scoped:strict -- "${tests[@]}"
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "${sources[@]}"
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}"
  measure literals node scripts/check-guideline-literals.js --json "${sources[@]}"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT'])
for name in ['decisions','grammar','literals']:
 r=json.loads((out/(name+'.stdout.txt')).read_text())
 assert r['totalViolationCount']==0,(name,r)
(out/'audit-result-gate.json').write_text(json.dumps({'decisions':0,'grammar':0,'literals':0},indent=2)+'\n')
PY
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  measure native-tests npm run test:file -- "${tests[@]}" test/raft/raft-rs-backend/durable-store-committed-entries.test.js
  measure consumer-regression npm run test:file -- test/integration/message-group-learner-runtime-authorization.integration.test.js
  measure mutations python3 "$evidence/run-diagnostic.py" . "$out/campaign"
  measure proof-checker python3 "$evidence/test-diagnostic.py" . "$out/checker"
  python3 - <<'PY'
from pathlib import Path
import json,os,re
out=Path(os.environ['PROOF_OUT']);timings={}
for name,count,limit in [('native-tests',3,2000),('consumer-regression',1,30000)]:
 rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
 assert len(rows)==count and all(int(ms)<=limit for _,_,ms in rows),(name,rows)
 timings[name]={'limitMs':limit,'files':rows}
assert len(json.loads((out/'campaign/results.json').read_text()))==17
assert len(json.loads((out/'checker/checker-results.json').read_text()))==6
(out/'timings.json').write_text(json.dumps(timings,indent=2)+'\n')
PY
  git diff --check
  git diff --exit-code -- package.json package-lock.json
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  node scripts/solve.js note --id "$QUEST" --finding 'Post-download review of run 37899510376 found a literal report with one violation although its JSON-mode command exited zero. Functional/mutation/complexity results remain valid; no literal-audit success was established by that exit. Replace the inherited package literal with the existing zero-index constant and require actual decision/grammar/literal totalViolationCount == 0 before publication. Preserve the original canonical archive unchanged.' --kind evidence --json > "$out/finding.json"
  node scripts/solve.js note --id "$QUEST" --attempt 'Use RAFT_RS_ZERO_INDEX from its existing owner for zero-term evidence refusal, update the exact mutation target, and enforce JSON audit verdicts. Rerun canonical native/store/consumer tests, 13 source/omission mutations and 6 checker adversaries. No behavior, threshold, schema, phase, origin/checkpoint branch or main change.' --json > "$out/attempt.json"
  git add -- "${sources[@]}" "$evidence/run-diagnostic.py" test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: consume owned zero index and enforce actual corrective audit verdicts'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure exact-native npm run test:file -- "${tests[@]}" test/raft/raft-rs-backend/durable-store-committed-entries.test.js
  python3 - <<'PY'
from pathlib import Path
import json,os,re
out=Path(os.environ['PROOF_OUT']);rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/'exact-native.stdout.txt').read_text(),re.M)
assert len(rows)==3 and all(int(ms)<=2000 for _,_,ms in rows),rows
(out/'exact-timings.json').write_text(json.dumps(rows,indent=2)+'\n')
PY
  test -z "$(git status --porcelain)"
  ;;
publish)
  gh release download solve-evidence --repo psvensson/lagrange --pattern 'message-group-fresh-identity-membership--issued-corrections-37899510376-1.zip' --dir "$out"
  echo "b24ef22afe37c945d37800401cbd5d52c85eb5b2fa0f3fc7d6a28b0e1d67c42a  $out/message-group-fresh-identity-membership--issued-corrections-37899510376-1.zip" | sha256sum -c -
  bash "$carrier/scripts/quest-evidence/issued-recovery-corrections/run.sh" publish
  ;;
*) exit 2 ;;
esac
