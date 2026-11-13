set -eu
case "$LAB_HOST" in tv-dator|adams-gamla|local-workstation) ;; *) printf 'HOST_OUTSIDE_QUALIFIED_SET=%s\n' "$LAB_HOST"; exit 96 ;; esac
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
export LAGRANGE_PLACEMENT=local
unset NODE_OPTIONS NODE_TEST_CONTEXT LAGRANGE_RETRY_FAILED_ONCE
preparation_source_sha='__FROZEN_REMOTE_SOURCE_SHA__'
preparation_source_tree='__FROZEN_REMOTE_SOURCE_TREE__'
preparation_src_tree='__FROZEN_REMOTE_SRC_TREE__'
preparation_base='f402575b0667bc02110849867cabacf013e61be6'
test "$(node --version)" = v22.23.2
printf 'LAB_HOST=%s\n' "$LAB_HOST"
node --version
test "$(git rev-parse HEAD)" = "$preparation_source_sha"
test "$(git rev-parse HEAD^{tree})" = "$preparation_source_tree"
test "$(git rev-parse HEAD:src)" = "$preparation_src_tree"
git rev-parse HEAD HEAD^{tree} HEAD:src
git diff --quiet
git diff --cached --quiet
test -z "$(git status --porcelain)"
git cat-file -e "$preparation_base^{commit}"
printf '%s\n' 'ORIGINAL_QUEST_SEALS=publication job3488 and foundation job3529 retained; repaired-source acceptance remains unmeasured'
printf '%s\n' 'PREPARATION_SCOPE=fresh canonical generation and static observations for the guarded combined repair; generated outputs must be reviewed and committed before final-source execution'
npm ci --no-audit --no-fund
node --input-type=module - <<'LAGRANGE_SQLITE_PROVENANCE'
import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const addon = require.resolve('better-sqlite3/build/Release/better_sqlite3.node');
const db = new Database(':memory:');
try {
  const identity = db.prepare('SELECT sqlite_version() AS version, sqlite_source_id() AS source_id').get();
  const provenance={...identity,
    addon_sha256:createHash('sha256').update(readFileSync(addon)).digest('hex')};
  console.log('SQLITE_NATIVE_PROVENANCE=' + JSON.stringify(provenance));
  if(provenance.version!=='3.49.2' ||
      provenance.source_id!=='2025-05-07 10:39:52 17144570b0d96ae63cd6f3edca39e27ebd74925252bbaf6723bcb2f6b4861fb1' ||
      provenance.addon_sha256!=='d7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37') {
    throw new Error('Observed SQLite native identity differs from the accepted runtime');
  }
} finally { db.close(); }
LAGRANGE_SQLITE_PROVENANCE

preparation_status=0
preparation_generation_ready=0
run_preparation_stage() {
  preparation_stage="$1"
  shift
  printf 'PREPARATION_STAGE_BEGIN=%s\n' "$preparation_stage"
  "$@"
  preparation_stage_rc=$?
  printf 'PREPARATION_STAGE_END=%s EXIT=%s\n' "$preparation_stage" "$preparation_stage_rc"
  if [ "$preparation_stage_rc" -ne 0 ]; then preparation_status=1; fi
  return "$preparation_stage_rc"
}
set +e
if run_preparation_stage test-metadata-refresh npm run test:metadata:refresh; then
  if run_preparation_stage global-owner-debt-inventory node scripts/generate-global-owner-debt-inventory.js; then
    printf '%s\n' 'GLOBAL_OWNER_INVENTORY_STATUS=generation completed; fresh analyzer reports are retained observations, not global ratchet acceptance'
    if run_preparation_stage source-owner-index-generation npm run generate:source-owner-index; then
      preparation_generation_ready=1
    fi
  fi
fi

if [ "$preparation_generation_ready" = 1 ]; then
  if run_preparation_stage affected-cone-explanation node scripts/select-change-tests.js --base "$preparation_base" --explain; then
    run_preparation_stage affected-cone-full-list-and-lanes node --input-type=module - <<'LAGRANGE_PLAIN_SELECTED_ROOTS'
import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {planClassifiedTestFiles} from './scripts/run-classified-test-files.js';
const base='f402575b0667bc02110849867cabacf013e61be6';
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const result=spawnSync(process.execPath,
  ['scripts/select-change-tests.js','--base',base,'--list'],
  {encoding:null,maxBuffer:16*1024*1024});
const out=result.stdout??Buffer.alloc(0);
const err=result.stderr??Buffer.alloc(0);
console.log('CANONICAL_SELECTED_LIST_BEGIN');
process.stdout.write(out);
console.log('\nCANONICAL_SELECTED_LIST_END');
process.stderr.write(err);
if(result.error) console.error(result.error);
if(result.status!==0 || result.error) process.exit(result.status??1);
const text=out.toString('utf8');
if(!text.endsWith('\n')) throw new Error('Canonical selector missing final newline');
const paths=text.slice(0,-1).split('\n');
if(paths.length===0 || paths.some(p=>!p.startsWith('test/') || !p.endsWith('.test.js') || p.trim()!==p) ||
    new Set(paths).size!==paths.length) throw new Error('Canonical selector did not return a unique test-root list');
const git=(args)=>execFileSync('git',args).toString().trim();
const manifests={};
for(const kind of ['primary','resource','subsystem']) {
  const path='test/shards/'+kind+'-classes.json';
  const bytes=readFileSync(path);
  const data=JSON.parse(bytes.toString('utf8'));
  if(paths.some(p=>typeof data.classes?.[p]!=='string')) throw new Error('Selected root missing from '+kind+' classification');
  manifests[kind]={path,sha256:hash(bytes),git_blob:git(['hash-object',path]),counts:data.counts};
}
const lanes=planClassifiedTestFiles(process.cwd(),paths,[]);
console.log('CANONICAL_SELECTED_LIST_IDENTITY='+JSON.stringify({
  head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),base,
  bytes:out.length,sha256:hash(out),root_count:paths.length,manifests,
  lanes:lanes.map(l=>({resourceClass:l.resourceClass,jobs:l.jobs,count:l.files.length}))}));
console.log('CANONICAL_SELECTED_LANES_BEGIN');
console.log(JSON.stringify(lanes.map(l=>({resourceClass:l.resourceClass,jobs:l.jobs,files:l.files}))));
console.log('CANONICAL_SELECTED_LANES_END');
LAGRANGE_PLAIN_SELECTED_ROOTS
  else
    printf '%s\n' 'CANONICAL_SELECTION_UNAVAILABLE=explanation failed or refused; no list retry; stronger or full proof decision remains with the canonical owner'
    preparation_status=1
  fi
  run_preparation_stage fast-static node scripts/check-fast-static.js --base "$preparation_base" --explain
  run_preparation_stage source-owner-index-audit npm run audit:source-owner-index
else
  printf '%s\n' 'PREPARATION_DEPENDENT_STAGES_NOT_RUN=canonical generation failed; no selection or generated-input acceptance'
  preparation_status=1
fi

run_preparation_stage changed-javascript-eslint node --input-type=module - <<'LAGRANGE_UNCAPPED_CHANGED_LINT'
import {execFileSync,spawnSync} from 'node:child_process';
const paths=execFileSync('git',['diff','--name-only','--diff-filter=ACMR',
  'f402575b0667bc02110849867cabacf013e61be6','HEAD','--','*.js','*.mjs','*.cjs'])
  .toString().trim().split('\n').filter(Boolean);
console.log('UNCAPPED_CHANGED_ESLINT_PATHS='+JSON.stringify(paths));
if(paths.length===0) throw new Error('Expected nonempty changed JavaScript scope');
const result=spawnSync(process.execPath,['node_modules/eslint/bin/eslint.js',...paths],{stdio:'inherit'});
if(result.error) console.error(result.error);
process.exit(result.status??1);
LAGRANGE_UNCAPPED_CHANGED_LINT

run_preparation_stage scoped-strict-metrics node --input-type=module - <<'LAGRANGE_CHANGED_PRODUCTION_METRICS'
import {execFileSync,spawnSync} from 'node:child_process';
const paths=execFileSync('git',['diff','--name-only','--diff-filter=ACMR',
  'f402575b0667bc02110849867cabacf013e61be6','HEAD','--','src'])
  .toString().trim().split('\n').filter(p=>/\.(js|mjs|cjs|ts)$/.test(p));
console.log('SCOPED_STRICT_METRICS_PATHS='+JSON.stringify(paths));
if(paths.length===0) throw new Error('Expected nonempty changed production scope');
const result=spawnSync('npm',['run','test:metrics:scoped:strict','--',...paths],{stdio:'inherit'});
if(result.error) console.error(result.error);
process.exit(result.status??1);
LAGRANGE_CHANGED_PRODUCTION_METRICS

run_preparation_stage production-source-unchanged git diff --exit-code -- '*.js' '*.mjs' '*.cjs' '*.ts'
run_preparation_stage generated-artifact-capture node --input-type=module - <<'LAGRANGE_PLAIN_GENERATED_PATCH'
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const git=(args)=>execFileSync('git',args);
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const patch=git(['diff','--binary']);
const status=git(['status','--porcelain=v2']).toString();
const paths=git(['diff','--name-status']).toString();
const identity={
  source_sha:git(['rev-parse','HEAD']).toString().trim(),
  source_tree:git(['rev-parse','HEAD^{tree}']).toString().trim(),
  src_tree:git(['rev-parse','HEAD:src']).toString().trim(),
  base:'f402575b0667bc02110849867cabacf013e61be6'
};
console.log('GENERATED_METADATA_IDENTITY='+JSON.stringify({
  ...identity,bytes:patch.length,sha256:hash(patch),changed_paths:paths,status}));
console.log('GENERATED_METADATA_PATCH_BEGIN');
process.stdout.write(patch);
console.log('\nGENERATED_METADATA_PATCH_END');
for(const path of git(['ls-files','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean)) {
  const data=readFileSync(path);
  new TextDecoder('utf-8',{fatal:true}).decode(data);
  console.log('GENERATED_UNTRACKED_BEGIN='+JSON.stringify({path,bytes:data.length,sha256:hash(data)}));
  process.stdout.write(data);
  console.log('\nGENERATED_UNTRACKED_END');
}
LAGRANGE_PLAIN_GENERATED_PATCH
printf 'PREPARATION_ALL_STATIC_EXIT=%s\n' "$preparation_status"
(
  set -e
  git status --short
  test "$(git rev-parse HEAD)" = "$preparation_source_sha"
  test "$(git rev-parse HEAD^{tree})" = "$preparation_source_tree"
  test "$(git rev-parse HEAD:src)" = "$preparation_src_tree"
  git diff --cached --quiet
)
preparation_guard_status=$?
printf 'PREPARATION_FINAL_GUARD_EXIT=%s\n' "$preparation_guard_status"
if [ "$preparation_status" -ne 0 ]; then exit "$preparation_status"; fi
exit "$preparation_guard_status"
