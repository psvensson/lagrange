set -eu
boundary_host='adams-gamla'
boundary_root='test/scripts/proof-receipt-execution-report.test.js'
boundary_sha='56d12341a67d8680b16f8f06847a2499f73b24f6'
boundary_tree='07668b03cac68d967717ff2b61910fe10702b078'
boundary_src='ec5f4204f8031d859808495365fda27e831a5a72'
boundary_base='43e217c014017831cd3485b2e3c117451560a29e'
if [ "$LAB_HOST" != "$boundary_host" ]; then
  printf 'HOST_ASSIGNMENT_MISMATCH expected=%s actual=%s\n' "$boundary_host" "$LAB_HOST"
  exit 96
fi
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
export LAGRANGE_PLACEMENT=local
unset NODE_OPTIONS NODE_TEST_CONTEXT LAGRANGE_RETRY_FAILED_ONCE
test "$(node --version)" = v22.23.2
boundary_source_guard() (
  set -e
  test "$(git rev-parse HEAD)" = "$boundary_sha"
  test "$(git rev-parse HEAD^{tree})" = "$boundary_tree"
  test "$(git rev-parse HEAD:src)" = "$boundary_src"
  test "$(git rev-parse HEAD:scripts/proof-receipt-contract.js)" = 559e1b230d2cba0a052195f49e64d94580873195
  test "$(git rev-parse HEAD:scripts/publish-local-corpus.js)" = 6b4359edb79b3883d00317a5343c43944e439a1c
  test "$(git rev-parse HEAD:scripts/publish-head.js)" = c65ef69993672e34237c98b7106582d92f5cb6ce
  test "$(git rev-parse HEAD:test/scripts/proof-receipt-execution-report.test.js)" = db1e0c3e11c04d1ce4bac1770e7d08c10a01d4c4
  test "$(git rev-parse HEAD:test/scripts/local-corpus.test.js)" = 60e3239e6c6415b4955b8c69b9d5e668d347ad3d
  git diff --quiet
  git diff --cached --quiet
  test -z "$(git status --porcelain)"
  git diff --exit-code "$boundary_base" HEAD -- . \
    ':!test/scripts/local-corpus.test.js' \
    ':!test/scripts/proof-receipt-execution-report.test.js' \
    ':!solve/quests/proof-receipt-current-execution-envelope'
)
boundary_source_guard
printf 'BOUNDARY_ORIGINAL_HOST=%s ROOT=%s\n' "$LAB_HOST" "$boundary_root"
node --version
git rev-parse HEAD HEAD^{tree} HEAD:src
printf '%s\n' 'BOUNDARY_ORIGINAL_SCOPE=two newly authored control roots in separate count-1 requests against unchanged receipt/process owners at the reviewed foundation checkpoint; no repaired-candidate or whole-corpus acceptance'
printf 'BOUNDARY_ORIGINAL_SETUP_START_UTC=%s ELAPSED_SECONDS=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS"
set +e
npm ci --no-audit --no-fund
boundary_setup_rc=$?
printf 'BOUNDARY_ORIGINAL_SETUP_END_UTC=%s ELAPSED_SECONDS=%s EXIT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS" "$boundary_setup_rc"
boundary_native_rc=not-run
boundary_test_rc=not-run
if [ "$boundary_setup_rc" -eq 0 ]; then
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
  const provenance = {...identity,
    addon_sha256: createHash('sha256').update(readFileSync(addon)).digest('hex')};
  console.log('SQLITE_NATIVE_PROVENANCE=' + JSON.stringify(provenance));
  if (provenance.version !== '3.49.2' ||
      provenance.source_id !== '2025-05-07 10:39:52 17144570b0d96ae63cd6f3edca39e27ebd74925252bbaf6723bcb2f6b4861fb1' ||
      provenance.addon_sha256 !== 'd7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37') {
    throw new Error('Observed SQLite native identity differs from the accepted runtime');
  }
} finally { db.close(); }
LAGRANGE_SQLITE_PROVENANCE
  boundary_native_rc=$?
  printf 'BOUNDARY_ORIGINAL_NATIVE_EXIT=%s\n' "$boundary_native_rc"
fi
if [ "$boundary_setup_rc" -eq 0 ] && [ "$boundary_native_rc" -eq 0 ]; then
  printf 'BOUNDARY_ORIGINAL_TEST_START_UTC=%s ELAPSED_SECONDS=%s ROOT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS" "$boundary_root"
  node scripts/run-test-files.js --jobs=2 "$boundary_root"
  boundary_test_rc=$?
  printf 'BOUNDARY_ORIGINAL_TEST_END_UTC=%s ELAPSED_SECONDS=%s EXIT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS" "$boundary_test_rc"
else
  printf 'BOUNDARY_ORIGINAL_ROOT_NOT_ADMITTED setup=%s native=%s\n' "$boundary_setup_rc" "$boundary_native_rc"
fi
boundary_source_guard
boundary_guard_rc=$?
printf 'BOUNDARY_ORIGINAL_FINAL_GUARD_EXIT=%s\n' "$boundary_guard_rc"
if [ "$boundary_setup_rc" -ne 0 ]; then exit "$boundary_setup_rc"; fi
if [ "$boundary_native_rc" -ne 0 ]; then exit "$boundary_native_rc"; fi
if [ "$boundary_test_rc" -ne 0 ]; then exit "$boundary_test_rc"; fi
exit "$boundary_guard_rc"
