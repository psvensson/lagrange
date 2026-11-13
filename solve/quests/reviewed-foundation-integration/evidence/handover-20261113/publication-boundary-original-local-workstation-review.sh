set -eu
if [ "$LAB_HOST" != local-workstation ]; then
  printf 'HOST_ASSIGNMENT_MISMATCH expected=local-workstation actual=%s\n' "$LAB_HOST"
  exit 96
fi
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
export LAGRANGE_PLACEMENT=local
unset NODE_OPTIONS NODE_TEST_CONTEXT LAGRANGE_RETRY_FAILED_ONCE
original_source_sha='__FINAL_REMOTE_SHA__'
original_source_tree='74b6b10516573b7e8020ba41c7fd423e0e293bdc'
original_src_tree='bc9e83a24cee235aa7fd33ff9777dc97d229903c'
test "$(node --version)" = v22.23.2
test "$(git rev-parse HEAD)" = "$original_source_sha"
test "$(git rev-parse HEAD^{tree})" = "$original_source_tree"
test "$(git rev-parse HEAD:src)" = "$original_src_tree"
git diff --quiet
git diff --cached --quiet
test -z "$(git status --porcelain)"
printf 'LAB_HOST=%s\n' "$LAB_HOST"
node --version
git rev-parse HEAD HEAD^{tree} HEAD:src
printf '%s\n' 'ORIGINAL_BOUNDARY_SCOPE=unchanged original production; two previously unadmitted roots plus two newly changed publisher and identity roots in disjoint independent requests; no whole-corpus or repair acceptance'
printf '%s\n' 'ORIGINAL_BOUNDARY_CONTINUATION=original TV request 3670 remains a closed setup deadline; this fresh reviewed scope preserves that failure and does not repeat any completed unchanged root'
test "$(git rev-parse HEAD:test/scripts/publication-single-pass.test.js)" = e297ba2489c876a81df84af0ebf46ee0305c6725
test "$(git rev-parse HEAD:test/scripts/test-placement-fixtures.js)" = db4890cfe882427aad11017a4e5e6ab3436bde55
test "$(git rev-parse HEAD:test/config/ci-proof-range.test.js)" = 2834163c2fde9d710034e63ae21bd447c77e59f2
test "$(git rev-parse HEAD:test/scripts/proof-authority-falsifiers.test.js)" = e81cdc6e3983d28dce7e03ed54e19ce71ded38a2
test "$(git rev-parse HEAD:solve/quests/publication-single-pass-evidence/evidence/materializer-signal-observation.mjs)" = 4f84ce6b1f78467a2c5c7afee2269a2580b8b788
test "$(git rev-parse HEAD:test/scripts/acceptance-proof-manifest-runner.test.js)" = 0272109cf2a8c3fb73bc361364a099ef693a4137
test "$(git rev-parse HEAD:test/scripts/proof-checkout-preparation.test.js)" = 7452603cad8f211608c3458489b29e7805d80c66
test "$(git rev-parse HEAD:test/scripts/dt-prove.test.js)" = 8123170c83addf4ec79abb6b3db9b95fc4f235f6
test "$(git rev-parse HEAD:test/scripts/test-placement.test.js)" = a150e1b14f8e8fcb82ce94f41c7b80d35f829237
test "$(git rev-parse HEAD:test/scripts/test-placement-lab-split.test.js)" = a38e19fdb0b9f50bd627abaa146fd7b3c2caabdf
test "$(git rev-parse HEAD:test/scripts/lab-fleet-discovery.test.js)" = 01f54d891ee66ff304a65889b608b76f4f7803d4
test "$(git rev-parse HEAD:test/scripts/prune-test-output.test.js)" = c4ff179639bf998964115c5dc60c912eaf3226c4
test "$(git rev-parse HEAD:test/scripts/placement-failure-custody.test.js)" = e99e20c5bfc8b4cdb70313896f00ab5232edca3a
test "$(git rev-parse HEAD:test/scripts/scenario-certification-consumers.test.js)" = c41a23fe7a65f4ddca4404089d40fec6ad4273c8
test "$(git rev-parse HEAD:test/scripts/publish-head.test.js)" = c10585708cc25ee8e1a4b3e83a4973f4c7526a51
test "$(git rev-parse HEAD:test/scripts/release-proof-identity.test.js)" = e22e8c5aea81ae8d263fc60d8a18055ac795aefe
git diff --exit-code a7514bf45f7eabe393707e2b13cfa2b769e0994f HEAD -- . ':!test/scripts/publish-head.test.js' ':!test/scripts/release-proof-identity.test.js'
printf 'ORIGINAL_BOUNDARY_SETUP_START_UTC=%s SHELL_ELAPSED_SECONDS=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS"
set +e
npm ci --no-audit --no-fund --loglevel=verbose
original_setup_rc=$?
printf 'ORIGINAL_BOUNDARY_SETUP_END_UTC=%s SHELL_ELAPSED_SECONDS=%s EXIT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS" "$original_setup_rc"
original_native_rc=not-run
original_test_rc=not-run
if [ "$original_setup_rc" -eq 0 ]; then
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
  original_native_rc=$?
  printf 'ORIGINAL_BOUNDARY_NATIVE_EXIT=%s\n' "$original_native_rc"
fi
if [ "$original_setup_rc" -eq 0 ] && [ "$original_native_rc" -eq 0 ]; then
  set -- test/scripts/test-placement.test.js test/scripts/placement-failure-custody.test.js
  printf 'ORIGINAL_BOUNDARY_ROOT=%s\n' "$@"
  printf 'ORIGINAL_BOUNDARY_TEST_START_UTC=%s SHELL_ELAPSED_SECONDS=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS"
  node scripts/run-test-files.js --jobs=2 "$@"
  original_test_rc=$?
  printf 'ORIGINAL_BOUNDARY_TEST_END_UTC=%s SHELL_ELAPSED_SECONDS=%s EXIT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECONDS" "$original_test_rc"
else
  printf 'ORIGINAL_BOUNDARY_ROOTS_NOT_ADMITTED setup=%s native=%s\n' "$original_setup_rc" "$original_native_rc"
fi
(
  set -e
  test "$(git rev-parse HEAD)" = "$original_source_sha"
  test "$(git rev-parse HEAD^{tree})" = "$original_source_tree"
  test "$(git rev-parse HEAD:src)" = "$original_src_tree"
  git diff --quiet
  git diff --cached --quiet
  test -z "$(git status --porcelain)"
)
original_guard_rc=$?
printf 'ORIGINAL_BOUNDARY_FINAL_GUARD_EXIT=%s\n' "$original_guard_rc"
if [ "$original_setup_rc" -ne 0 ]; then exit "$original_setup_rc"; fi
if [ "$original_native_rc" -ne 0 ]; then exit "$original_native_rc"; fi
if [ "$original_test_rc" -ne 0 ]; then exit "$original_test_rc"; fi
exit "$original_guard_rc"
