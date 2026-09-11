import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';

const RELEASE_WORKFLOW = '.github/workflows/release.yml';
const FULL_GATE_WORKFLOW = '.github/workflows/full-gate.yml';
const RELEASE_PROOF = 'scripts/run-release-proof.js';
const TAIL_MANIFEST = 'test/manifests/project-hardening-proof-release-tail-manifest.json';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('tag publication consumes durable exact-head proof instead of rerunning it', (t) => {
  const release = read(RELEASE_WORKFLOW);
  t.match(release, /runs-on: ubuntu-24\.04/u,
    'publication is GitHub-hosted for npm OIDC');
  t.match(release, /proof-authority\.js check release-full-v1/u,
    'tag publication asks the durable proof authority');
  t.notMatch(release, /npm run check:release/u,
    'tag publication never repeats the whole-system proof');
  t.notMatch(release, /self-hosted, gcp/u,
    'artifact publication does not run on the GCP proof runner');
  t.ok(
    release.indexOf('Publish npm package') < release.indexOf('Build release artifacts'),
    'npm authentication is exercised before expensive artifact builds',
  );
  t.match(release, /release-publishability\/\*\*/u,
    'pre-tag publication checks have their own exact-SHA ref');
  t.end();
});

test('full gate reuses durable proof and only wakes GCP for an unproven SHA', (t) => {
  const fullGate = read(FULL_GATE_WORKFLOW);
  t.match(fullGate, /require_publishability:/u,
    'publishability is checked before proof work');
  t.match(fullGate, /resolve_proof:/u,
    'durable proof is resolved before the runner decision');
  t.match(fullGate, /needs: resolve_proof/u,
    'runner wake depends on proof resolution');
  t.match(fullGate, /needs\.resolve_proof\.outputs\.proven != 'true'/u,
    'a proven SHA does not wake GCP');
  t.match(fullGate, /proof-authority\.js check release-full-v1/u,
    'proof lookup uses the single proof authority');
  t.match(fullGate, /proof-authority\.js record release-full-v1/u,
    'a successful missing proof is recorded durably');
  t.match(fullGate, /release-publishability\//u,
    'fresh external publishability still gates the expensive proof');
  t.match(fullGate, /node scripts\/run-release-proof\.js/u,
    'an unproven SHA runs the single-pass proof');
  t.end();
});

test('release proof is single-pass and hardening tail contains only unique work', (t) => {
  const proof = read(RELEASE_PROOF);
  const manifest = JSON.parse(read(TAIL_MANIFEST));
  t.match(proof, /'run', 'test:ci'/u,
    'complete CI corpus is executed exactly once');
  const ids = manifest.commands.map((command) => command.id);
  t.same(ids, [
    'focused-contracts',
    'owner-debt-report-inputs',
    'golden-capability-guard-scenarios',
  ]);
  const serialized = JSON.stringify(manifest);
  t.notMatch(serialized, /test:static/u);
  t.notMatch(serialized, /model:contracts/u);
  t.notMatch(serialized, /test:fast/u);
  t.end();
});
