#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/issued-recovery-followup-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
quest_dir="solve/quests/$QUEST"
dir="$quest_dir/evidence/issued-action-recovery-20261009"
files=(src/raft/raft-rs-committed-membership-context.js src/raft/raft-rs-durable-store.js test/raft/raft-rs-backend/issued-action-recovery.test.js test/raft/raft-rs-backend/issued-action-record-read.test.js)
mkdir -p "$out"
export OUT="$out"
measure() {
  local name="$1"; shift
  printf '%q ' "$@" > "$out/$name.command.txt"; printf '\n' >> "$out/$name.command.txt"
  local status=0
  "$@" > "$out/$name.stdout.txt" 2> "$out/$name.stderr.txt" || status=$?
  echo "$status" > "$out/$name.exit.txt"
  tail -30 "$out/$name.stdout.txt"
  return "$status"
}
case "$1" in
measure)
  test "$(git rev-parse HEAD)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  measure install npm ci
  printf 'base=%s\ncarrier=%s\nrunner=%s\n' "$EXPECTED" "$GITHUB_SHA" "$RUNNER_NAME" > "$out/provenance.txt"
  git show "HEAD:${files[3]}" > "$out/test-before.js"
  measure formatting npm exec --no -- eslint "${files[3]}" --fix
  node --input-type=module - <<'JS' > "$out/format-ast.txt"
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json');
const {parse}=require('espree');
const clean=(value)=>JSON.stringify(value,(key,item)=>['raw','start','end','loc','range'].includes(key)?undefined:typeof item==='bigint'?String(item):item);
const ast=(text)=>clean(parse(text,{ecmaVersion:'latest',sourceType:'module'}));
assert.equal(ast(fs.readFileSync(process.env.OUT+'/test-before.js','utf8')),ast(fs.readFileSync('test/raft/raft-rs-backend/issued-action-record-read.test.js','utf8')));
console.log('ESLint formatting preserves the entire parsed test AST apart from source locations and literal spelling.');
JS
  measure lint npm exec --no -- eslint "${files[@]}" || true
  measure metrics npm run test:metrics:scoped:strict -- "${files[@]}" || true
  measure file-size node scripts/check-file-size-thresholds.js --strict "${files[@]}" || true
  measure decisions node scripts/check-guideline-decision-boundaries.js --json "${files[0]}" "${files[1]}" || true
  measure literals node scripts/check-guideline-literals.js --json "${files[0]}" "${files[1]}" || true
  measure grammar node scripts/check-runtime-grammar-contracts.js --json "${files[0]}" "${files[1]}" || true
  measure metadata npm run test:metadata:refresh
  measure shards npm run audit:shards
  git diff --exit-code "$EXPECTED" -- src package.json package-lock.json
  git diff --check
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  node scripts/solve.js note --id "$QUEST" --attempt 'Canonical package followup after 37903414861: repair only 23 ESLint formatting findings in the new storage-read test, with parsed AST equality. Regenerate classification through producers, then measure all static and normal-driver test obligations independently. Every failed check remains recorded and blocks the aggregate; collecting later evidence is not bypassing a failed gate. No production repair, new recovery protocol, source approval or main integration.' --json > "$out/attempt.json"
  git add -- "${files[3]}" test/shards/ "$quest_dir/log.ndjson"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'test: format recovery witness without AST changes and regenerate canonical metadata'
  git rev-parse HEAD > "$out/source-sha.txt"
  measure tests npm run test:file -- "${files[2]}" "${files[3]}" test/raft/raft-rs-backend/durable-store-committed-entries.test.js || true
  # The ordinary runner above uses the normal locked better-sqlite3 dependency.
  # The proof-checker below intentionally retains its historical diagnostic adapter.
  measure proof-checker python3 "$dir/test-proof-checker.py" || true
  measure codec-mutations python3 "$dir/run-diagnostic.py" "$PWD" "$out/codec-mutations" || true
  measure store-mutations python3 "$dir/run-record-controls.py" "$out/store-mutations" || true
  git diff --exit-code -- src test
  test -z "$(git status --porcelain)"
  python3 - <<'PY'
import json,os,re
from pathlib import Path
out=Path(os.environ['OUT'])
checks={p.name.removesuffix('.exit.txt'):int(p.read_text()) for p in out.glob('*.exit.txt')}
rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/'tests.stdout.txt').read_text(),re.M)
expected={'test/raft/raft-rs-backend/issued-action-recovery.test.js','test/raft/raft-rs-backend/issued-action-record-read.test.js','test/raft/raft-rs-backend/durable-store-committed-entries.test.js'}
budget=len(rows)==3 and {r[0] for r in rows}==expected and all(int(r[2])<=2000 for r in rows)
r={'schema':'issued-recovery-canonical-followup/1','runId':os.environ['GITHUB_RUN_ID'],'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),'checks':checks,'normalDriverTests':rows,'perFileBudgetMs':2000,'allFileBudgetsSatisfied':budget,'allChecksPassed':all(v==0 for v in checks.values()) and budget,'independentApproval':False,'runtimeSourceChanged':False,'fullLabVerdict':'FAIL','proofCeiling':'Normal better-sqlite3 with historical low-level native test driver. Python proof-checker/mutation runs retain their disclosed node:sqlite diagnostic adapter. Not runtime/CREATE/physical acceptance.'}
(out/'result.json').write_text(json.dumps(r,indent=2)+'\n')
PY
  ;;
publish)
  gh auth setup-git
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$EXPECTED"
  test -z "$(git status --porcelain)"
  git diff --binary "$EXPECTED" > "$out/change.patch"
  if [ -f test-output/reports/test-results.ndjson ]; then cp test-output/reports/test-results.ndjson "$out/test-results.ndjson"; fi
  python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,zipfile
out=Path(os.environ['OUT'])
m={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
(out/'member-sha256.json').write_text(json.dumps(m,indent=2)+'\n')
with zipfile.ZipFile(str(out)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file():z.write(p,str(p.relative_to(out)))
(out/'archive-sha256.txt').write_text(hashlib.sha256(Path(str(out)+'.zip').read_bytes()).hexdigest()+'\n')
PY
  node scripts/solve.js evidence add "$out.zip" --id "$QUEST" --text 'Corrected recovery packet canonical followup: AST-preserving lint repair, producer metadata, all scoped static checks and normal better-sqlite3 native/store tests. Separately labeled node:sqlite proof-checker/mutations. Read aggregate verdict; any static or timing failure stays open. No runtime source change or release approval.' --json > "$out/canonical.json"
  python3 - <<'PY'
from pathlib import Path
import json,os
out=Path(os.environ['OUT']);r=json.loads((out/'result.json').read_text());r['canonicalEvidence']=json.loads((out/'canonical.json').read_text());r['archiveSha256']=(out/'archive-sha256.txt').read_text().strip()
p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('issued-recovery-followup-'+os.environ['GITHUB_RUN_ID']+'.json');p.write_text(json.dumps(r,indent=2)+'\n')
PY
  git add -- "$quest_dir/log.ndjson" "$quest_dir/evidence/issued-recovery-followup-$GITHUB_RUN_ID.json"
  LAGRANGE_SKIP_PRECOMMIT=1 git commit -m 'evidence: retain canonical recovery results and unresolved gates'
  git push origin "HEAD:refs/heads/$WORK_BRANCH"
  test "$(git ls-remote origin "refs/heads/$WORK_BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
  git rev-parse HEAD > "$out/published-sha.txt"
  git status --porcelain > "$out/final-status.txt"
  ;;
*) exit 2 ;;
esac
