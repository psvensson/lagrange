import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';

const RELEASE_WORKFLOW = '.github/workflows/release.yml';
const FULL_GATE_WORKFLOW = '.github/workflows/full-gate.yml';
const RELEASE_PROOF = 'scripts/run-release-proof.js';
const TAIL_MANIFEST = 'test/manifests/project-hardening-proof-release-tail-manifest.json';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('tag publication consumes exact-head proof instead of rerunning it', (t) => {
  const release = read(RELEASE_WORKFLOW);
  t.match(release, /runs-on: ubuntu-24\.04/u, 'publication is GitHub-hosted for npm OIDC');
  t.match(release, /full-gate\.yml/u, 'tag publication requires the exact-head proof');
  t.notMatch(release, /npm run check:release/u, 'tag publication never repeats the whole-system proof');
  t.notMatch(release, /self-hosted, gcp/u, 'artifact publication does not run on the GCP proof runner');
  t.ok(
    release.indexOf('Publish npm package') < release.indexOf('Build release artifacts'),
    'npm authentication is exercised before expensive artifact builds',
  );
  t.match(release, /release-publishability\/\*\*/u, 'pre-tag publication checks have their own exact-SHA ref');
  t.end();
});

test('GCP proof refuses before waking when publishability was not proven', (t) => {
  const fullGate = read(FULL_GATE_WORKFLOW);
  t.match(fullGate, /require-publishability:/u);
  t.match(fullGate, /needs: require-publishability/u);
  t.match(fullGate, /release-publishability\//u);
  t.match(fullGate, /node scripts\/run-release-proof\.js/u);
  t.end();
});

test('release proof is single-pass and hardening tail contains only unique work', (t) => {
  const proof = read(RELEASE_PROOF);
  const manifest = JSON.parse(read(TAIL_MANIFEST));
  t.match(proof, /'run', 'test:ci'/u, 'complete CI corpus is executed exactly once');
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
