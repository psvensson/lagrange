#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/delivery-lifetime-20261009"
out="$GITHUB_WORKSPACE/delivery-lifetime-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
consumer=test/integration/message-group-learner-runtime-authorization.integration.test.js
transport=test/transport/service-delivery-lifetime.test.js
helper=test/test-helpers/service-delivery-fixture.js
sources=(src/transport/message-router-connection-authority.js src/transport/message-router-inbound-dispatch.js src/transport/message-router-delivery-behaviors.js src/transport/message-router-stats-shutdown.js src/raft/raft-operation-port-constants.js src/raft/raft-rs-group-membership-admission.js src/raft/raft-rs-operation-port.js src/raft/raft-rs-membership-transition.js src/raft/raft-rs-membership-transition-runtime.js)
mkdir -p "$out"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  date -u +%FT%TZ > "$out/$name.started.txt"
  local code=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || code=$?
  printf '%s\n' "$code" > "$out/$name.exit.txt"
  date -u +%FT%TZ > "$out/$name.finished.txt"
  tail -25 "$out/$name.stdout.txt"
  return "$code"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  (cd "$carrier"; sha256sum -c <<'HASHES'
977f7b178033fe1986476767c18137efe22066dacc93b128924dc07c51b75e2e  transport.patch
2730e8d4b39c0da992ae013b10a1597ca1f4257d268c9dd4c5341165577c8472  native.patch
641b005bd1f568e56644e61fdfb81a92c7532ad580fff16080cfc8cfaa2e8fe1  tests.patch
42345c62eb4b804f48b2adc45fa117433715c494f7d77afd1bffffa725bed96e  contract.patch
HASHES
  ) > "$out/patch-hashes.txt"
  cp "$carrier"/*.patch "$out/"
  cp "$carrier/run.sh" "$out/measured-runner.sh"
  printf 'base=%s\ncarrier=%s\nrunner=%s\ncap=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" "$LAGRANGE_LANE_JOBS_CAP" > "$out/provenance.txt"
  measure install npm ci
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  measure metrics-before npm run test:metrics:scoped -- "${sources[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-before.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-before.json"
  for kind in decision-boundaries literals; do
    measure "$kind-before" node "scripts/check-guideline-$kind.js" --json "${sources[@]}" || true
  done
  measure grammar-before node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}" || true
  node scripts/solve.js note --id "$QUEST" --finding '2026-10-09 next bounded owner interaction following R3: extend the existing connection authority/inbound/local/shutdown owners with local-only delivery lifetime, and carry its predicate through the existing semantic membership port to the actual native turn. Explicit source scope adds those four transport modules and membership transition normalization/runtime to the current consumer. No new durable state, new workflow, metadata reread, cancellation protocol, physical CREATE, main activation or altered sealed acceptance. Delivery loss retains the exact issued action; the global metadata-only counterexample remains a separate unresolved claim.' --kind decision --json > "$out/scope.json"
  git apply --check "$carrier/tests.patch"
  git apply "$carrier/tests.patch"
  measure test-lint npm exec --no -- eslint "$consumer" "$transport" "$helper"
  measure test-metrics npm run test:metrics:scoped:strict -- "$consumer" "$transport" "$helper"
  measure red-metadata npm run test:metadata:refresh
  git diff --exit-code "$EXPECTED" -- src
  if measure transport-red npm run test:file -- "$transport"; then
    echo 'Missing-context red did not engage' >&2; exit 2
  fi
  test "$(cat "$out/transport-red.exit.txt")" = 1
  grep -Fq 'registered remote handler requires owner-bound delivery context' "$out/transport-red.stdout.txt"
  git apply "$carrier/transport.patch"
  measure transport-positive npm run test:file -- "$transport"
  if measure native-red npm run test:file -- "$consumer"; then
    echo 'Unfenced-native red did not engage' >&2; exit 2
  fi
  test "$(cat "$out/native-red.exit.txt")" = 1
  grep -Fq 'old local delivery must not reach native proposal after shutdown and reopen' "$out/native-red.stdout.txt"
  grep -Fq 'a replaced socket must not carry its old action into the native proposal' "$out/native-red.stdout.txt"
  git apply "$carrier/native.patch"
  git apply "$carrier/contract.patch"
  measure lint npm exec --no -- eslint "${sources[@]}" "$consumer" "$transport" "$helper"
  measure metrics-after npm run test:metrics:scoped -- "${sources[@]}"
  cp test-output/analysis/complexity-scoped.json "$out/complexity-after.json"
  cp test-output/analysis/cognitive-complexity-scoped.json "$out/cognitive-after.json"
  export PROOF_OUT="$out"
  python3 - <<'PY'
import json,os
from pathlib import Path
out=Path(os.environ['PROOF_OUT'])
for kind in ['complexity','cognitive']:
    before=json.loads((out/f'{kind}-before.json').read_text())
    after=json.loads((out/f'{kind}-after.json').read_text())
    assert after['count'] <= before['count'],(kind,before,after)
PY
  for kind in decision-boundaries literals; do
    measure "$kind-after" node "scripts/check-guideline-$kind.js" --json "${sources[@]}"
  done
  measure grammar-after node scripts/check-runtime-grammar-contracts.js --json "${sources[@]}"
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  node scripts/solve.js note --id "$QUEST" --attempt 'Bind real router socket/local lifetime as a local-only second handler argument; issued-learner admission requires it and the existing queued native membership turn rechecks it immediately before proposal. Tests exercise actual identification/service dispatch, UNKNOWN, forged source, shutdown/reinitialize, same-boot replacement, exact fresh redelivery and Ready-send queued work. No globally atomic metadata/revocation claim, exact committed receipt, physical CREATE or planner/handler activation.' --json > "$out/attempt.json"
  git diff --check
  git add -- "${sources[@]}" "$consumer" "$transport" "$helper" architecture/contracts/message-group-learner-delivery-lifetime.md test/shards/ "solve/quests/$QUEST/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'fix: bind issued learner execution to actual router delivery lifetime'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure consumer npm run test:file -- "$consumer"
  measure transport npm run test:file -- "$transport" test/transport/node-incarnation-websocket-fence.test.js test/transport/local-delivery.property.test.js test/transport/message-router-transport-cleanup.test.js
  measure regressions npm run test:file -- test/rebalancer/message-group-membership-branch-authorization.test.js test/rebalancer/message-group-membership-operation-lane.test.js test/rebalancer/operation-progress-store-persistence.test.js test/rebalancer/reservation-file-backed-restart.test.js
  python3 - <<'PY'
import json,os,re
from pathlib import Path
out=Path(os.environ['PROOF_OUT']);timings={}
for name,limit,count in [('consumer',30000,1),('transport',2000,4),('regressions',2000,4)]:
    rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/f'{name}.stdout.txt').read_text(),re.M)
    assert len(rows)==count,(name,rows)
    assert all(int(ms)<=limit for _,_,ms in rows),(name,'budget',rows)
    timings[name]={'limitMs':limit,'files':rows}
(out/'timings.json').write_text(json.dumps(timings,indent=2)+'\n')
PY
  runtime=src/raft/raft-rs-membership-transition-runtime.js
  restore_runtime() { git show "HEAD:$runtime" > "$runtime"; }
  trap restore_runtime EXIT
  python3 - <<'PY'
from pathlib import Path
p=Path('src/raft/raft-rs-membership-transition-runtime.js');s=p.read_text()
a=s.index('function executionDeliveryRefusal(command) {');b=s.index('\nfunction anchoredProposal',a)
p.write_text(s[:a]+'function executionDeliveryRefusal(command) { return null; }\n'+s[b:])
PY
  if measure native-mutation npm run test:file -- "$consumer"; then exit 2; fi
  test "$(cat "$out/native-mutation.exit.txt")" = 1
  grep -Fq 'a queued native action must revalidate its live delivery at execution' "$out/native-mutation.stdout.txt"
  grep -Fq ERR_ASSERTION "$out/native-mutation.stdout.txt"
  restore_runtime; trap - EXIT
  connection=src/transport/message-router-connection-authority.js
  restore_connection() { git show "HEAD:$connection" > "$connection"; }
  trap restore_connection EXIT
  python3 - <<'PY'
from pathlib import Path
p=Path('src/transport/message-router-connection-authority.js');s=p.read_text()
a=s.index('function deliveryConnectionMatches(');b=s.index('\nclass RouterConnectionAuthorityOwner',a)
p.write_text(s[:a]+'function deliveryConnectionMatches() { return true; }\n'+s[b:])
PY
  if measure socket-mutation npm run test:file -- "$transport"; then exit 2; fi
  test "$(cat "$out/socket-mutation.exit.txt")" = 1
  grep -Fq ERR_ASSERTION "$out/socket-mutation.stdout.txt"
  restore_connection
  python3 - <<'PY'
from pathlib import Path
p=Path('src/transport/message-router-connection-authority.js');s=p.read_text()
old='lifetime === this.#deliveryLifetime && deliveryRouterMatches(this.router, identity)'
assert s.count(old)==1
p.write_text(s.replace(old,'deliveryRouterMatches(this.router, identity)',1))
PY
  if measure lifetime-mutation npm run test:file -- "$transport"; then exit 2; fi
  test "$(cat "$out/lifetime-mutation.exit.txt")" = 1
  grep -Fq 'shutdown permanently invalidates old contexts' "$out/lifetime-mutation.stdout.txt"
  restore_connection; trap - EXIT
  git diff --exit-code -- src test
  test -z "$(git status --porcelain)"
  cp test-output/reports/test-results.ndjson "$out/all-test-results.ndjson"
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
out=Path(os.environ['PROOF_OUT']);manifest={}
for p in sorted(out.rglob('*')):
    if p.is_file():manifest[str(p.relative_to(out))]=hashlib.sha256(p.read_bytes()).hexdigest()
(out/'member-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=out.parent/(out.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(out)))
with zipfile.ZipFile(archive) as z:
    for n,h in manifest.items():assert hashlib.sha256(z.read(n)).hexdigest()==h
(out/'archive-sha256.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'\n')
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Actual router delivery lifetime -> issued learner -> queued native turn: staged transport/native red controls, exact-source positive regressions and native/socket/lifetime mutations. In-process sockets and file-backed operation fixture, not physical network or globally atomic metadata. Delivery refusal retains issued obligation; no CREATE, committed-receipt driver, main merge or final acceptance.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT'])
r={'schema':'freshmg-delivery-lifetime/1','runId':int(os.environ['GITHUB_RUN_ID']),
'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),
'executionSubstrate':'GitHub-hosted Ubuntu, one classified worker',
'proofCeiling':'actual router identification/service dispatch over in-process sockets, actual operation repository with file SQL, actual native ports and delayed Ready send; not physical network, global metadata atomicity or committed receipt/CREATE',
'previousLabVerdict':'FAIL','independentApproval':False,'distributedAcceptance':False,
'restartDurationResolved':False,'globalBootReadCounterexampleResolved':False,
'canonicalEvidence':json.loads((out/'canonical.json').read_text()),
'archiveSha256':(out/'archive-sha256.txt').read_text().strip(),
'mutations':['native-execution-guard','socket-identity','local-lifetime'],
 'timings':json.loads((out/'timings.json').read_text())}
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/f'delivery-lifetime-{os.environ["GITHUB_RUN_ID"]}.json'
p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "solve/quests/$QUEST/log.ndjson" "solve/quests/$QUEST/evidence/delivery-lifetime-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain actual-delivery and queued-native fence proof'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2 ;;
esac
