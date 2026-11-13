set -eu
case "$LAB_HOST" in tv-dator|adams-gamla|local-workstation) ;; *) printf 'HOST_OUTSIDE_QUALIFIED_SET=%s\n' "$LAB_HOST"; exit 96 ;; esac
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
export LAGRANGE_PLACEMENT=local
unset NODE_OPTIONS NODE_TEST_CONTEXT LAGRANGE_RETRY_FAILED_ONCE
candidate_source_sha='__FROZEN_CANDIDATE_REMOTE_SHA__'
candidate_source_tree='__FROZEN_CANDIDATE_TREE__'
candidate_src_tree='__FROZEN_CANDIDATE_SRC_TREE__'
candidate_base='f402575b0667bc02110849867cabacf013e61be6'
test "$(node --version)" = v22.23.2
printf 'LAB_HOST=%s\n' "$LAB_HOST"
node --version
test "$(git rev-parse HEAD)" = "$candidate_source_sha"
test "$(git rev-parse HEAD^{tree})" = "$candidate_source_tree"
test "$(git rev-parse HEAD:src)" = "$candidate_src_tree"
git rev-parse HEAD HEAD^{tree} HEAD:src
git diff --quiet
git diff --cached --quiet
test -z "$(git status --porcelain)"
git cat-file -e "$candidate_base^{commit}"
printf '%s\n' 'CANDIDATE_SCOPE=focused combined repair validation after reviewed canonical generated inputs are committed; complete canonical corpus and final-HEAD publication remain separate obligations'
test "$(git rev-parse HEAD:test/scripts/publication-single-pass.test.js)" = e297ba2489c876a81df84af0ebf46ee0305c6725
test "$(git rev-parse HEAD:test/scripts/test-placement-fixtures.js)" = 51c845f1595c4e3970fdd8b0dd1c24eda64e1a09
test "$(git rev-parse HEAD:test/config/ci-proof-range.test.js)" = 2834163c2fde9d710034e63ae21bd447c77e59f2
test "$(git rev-parse HEAD:test/scripts/proof-authority-falsifiers.test.js)" = 32ea222d9877ba9dc56d3461e7df301430677e33
test "$(git rev-parse HEAD:solve/quests/publication-single-pass-evidence/evidence/materializer-signal-observation.mjs)" = 4f84ce6b1f78467a2c5c7afee2269a2580b8b788
test "$(git rev-parse HEAD:test/scripts/proof-checkout-preparation.test.js)" = 7452603cad8f211608c3458489b29e7805d80c66
test "$(git rev-parse HEAD:test/scripts/dt-prove.test.js)" = 8123170c83addf4ec79abb6b3db9b95fc4f235f6
test "$(git rev-parse HEAD:test/scripts/acceptance-proof-manifest-runner.test.js)" = 0272109cf2a8c3fb73bc361364a099ef693a4137
test "$(git rev-parse HEAD:test/scripts/test-placement.test.js)" = 92dfdff537f9c2247d90171f33d864a55c460790
test "$(git rev-parse HEAD:test/scripts/test-placement-execution-fixture.js)" = e118aaed4e5d8f95174ab246244661ab20915cb0
test "$(git rev-parse HEAD:test/scripts/test-placement-lab-split.test.js)" = a38e19fdb0b9f50bd627abaa146fd7b3c2caabdf
test "$(git rev-parse HEAD:test/scripts/lab-fleet-discovery.test.js)" = 01f54d891ee66ff304a65889b608b76f4f7803d4
test "$(git rev-parse HEAD:test/scripts/placement-failure-custody.test.js)" = 02e67a253f2b67dc428cf0d12f35b4cfda1eda6b
test "$(git rev-parse HEAD:test/scripts/prune-test-output.test.js)" = c4ff179639bf998964115c5dc60c912eaf3226c4
test "$(git rev-parse HEAD:test/scripts/scenario-certification-consumers.test.js)" = c41a23fe7a65f4ddca4404089d40fec6ad4273c8
test "$(git rev-parse HEAD:test/scripts/lab-census-benchmark-evidence-custody.test.js)" = 14dc27a1bc9a1c42ccf4e91cc5d4f178a608cb9c
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
case "$LAB_HOST" in
  local-workstation)
    candidate_group='runner and placement'
    set -- test/scripts/publication-single-pass.test.js test/scripts/run-test-files.test.js test/scripts/run-classified-test-files.test.js test/scripts/test-placement.test.js test/scripts/test-placement-lab-split.test.js test/scripts/placement-failure-custody.test.js test/scripts/lab-fleet-discovery.test.js test/scripts/lab-census-benchmark-evidence-custody.test.js test/scripts/home-lab-cli-guidelines.test.js test/scripts/lab-test-base.test.js
    ;;
  tv-dator)
    candidate_group='publisher and local corpus'
    set -- test/scripts/local-corpus.test.js test/scripts/publish-head.test.js test/scripts/publish-head-workspace-links.test.js test/scripts/prune-test-output.test.js test/scripts/proof-checkout-preparation.test.js test/scripts/pre-push-hook-control-flow.test.js test/scripts/dt-prove.test.js test/scripts/scenario-certification-consumers.test.js test/scripts/scenario-refused-outcome-consumers.test.js
    ;;
  adams-gamla)
    candidate_group='CI Solver and proof authority'
    set -- test/config/ci-proof-range.test.js test/config/full-corpus-canary-workflow.test.js test/scripts/check-base-range.test.js test/scripts/acceptance-proof-manifest-runner.test.js test/scripts/proof-authority.test.js test/scripts/proof-authority-falsifiers.test.js test/scripts/proof-receipt-execution-report.test.js test/scripts/push-gate-change-proof.test.js test/scripts/canary-corpus-needed.test.js test/solve/commands.test.js test/release/project-hardening-contracts.test.js test/scripts/impact-proof-cone.test.js test/scripts/release-proof-identity.test.js
    ;;
esac
printf 'CANDIDATE_FOCUSED_GROUP=%s\n' "$candidate_group"
printf 'CANDIDATE_FOCUSED_ROOT=%s\n' "$@"
set +e
node scripts/run-test-files.js --jobs=2 "$@"
candidate_test_rc=$?
printf 'CANDIDATE_FOCUSED_TEST_EXIT=%s\n' "$candidate_test_rc"
(
  set -e
  test "$(git rev-parse HEAD)" = "$candidate_source_sha"
  test "$(git rev-parse HEAD^{tree})" = "$candidate_source_tree"
  test "$(git rev-parse HEAD:src)" = "$candidate_src_tree"
  git diff --quiet
  git diff --cached --quiet
  test -z "$(git status --porcelain)"
)
candidate_guard_rc=$?
printf 'CANDIDATE_FOCUSED_FINAL_GUARD_EXIT=%s\n' "$candidate_guard_rc"
if [ "$candidate_test_rc" -ne 0 ]; then exit "$candidate_test_rc"; fi
exit "$candidate_guard_rc"
