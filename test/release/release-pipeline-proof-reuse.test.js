import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';

const RELEASE_WORKFLOW = '.github/workflows/release.yml';
const FULL_GATE_WORKFLOW = '.github/workflows/full-gate.yml';
const RELEASE_PROOF = 'scripts/run-release-proof.js';
const RELEASE_NOTES = 'scripts/release-notes.js';
const DOCKERHUB_RETIRED_OVERVIEW = 'docs/dockerhub-overview.md';
const ROOT_README = 'README.md';
const TAIL_MANIFEST = 'test/manifests/project-hardening-proof-release-tail-manifest.json';
const DOCKERHUB_DESCRIPTION_MAX_BYTES = 25000;

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

test('Docker Hub overview is the exact tagged README and fails closed', (t) => {
  const release = read(RELEASE_WORKFLOW);
  const releaseNotes = read(RELEASE_NOTES);
  const retiredOverview = read(DOCKERHUB_RETIRED_OVERVIEW);
  const readme = read(ROOT_README);

  t.match(release, /- name: Update Docker Hub overview from released README\n/u,
    'the release owner explicitly publishes the README');
  t.match(release,
    /- name: Update Docker Hub overview from released README\n\s+if: steps\.release\.outputs\.prerelease != 'true'/u,
    'prereleases cannot overwrite the overview while Docker latest stays stable');
  t.match(release, /readme-filepath: \.\/README\.md/u,
    'the checked-out exact-tag root README is the publication source');
  t.match(release, /enable-url-completion: true/u,
    'relative links are completed against the immutable release tag');
  t.notMatch(
    release,
    /Update Docker Hub overview from released README[\s\S]{0,500}continue-on-error:/u,
    'Docker Hub overview publication must not be best-effort');
  t.notMatch(release,
    /release-notes\.js --mode overview|readme-filepath:.*dockerhub-overview\.md/u,
    'the workflow cannot route Docker Hub through a second authored overview');

  t.match(release, /- name: Verify Docker Hub overview matches released README\n/u,
    'the external state is read back after publication');
  t.match(release,
    /- name: Verify Docker Hub overview matches released README\n\s+if: steps\.release\.outputs\.prerelease != 'true'/u,
    'only a stable release is responsible for changing and proving the shared overview');
  t.match(release, /v2\/namespaces\/psvensson\/repositories\/lagrange/u,
    'verification uses the namespace-scoped Docker Hub repository API');
  t.match(release, /full_description/u,
    'verification compares the public full description');
  t.match(release, /createHash\('sha256'\)/u,
    'verification records deterministic content identity');
  t.match(release, /__DOCKERHUB_LINK__/u,
    'comparison canonicalizes only link destinations rewritten by URL completion');
  t.match(release, /did not converge to released README\.md/u,
    'stale or truncated public metadata fails publication');
  t.match(release, /overviewVerified/u,
    'the publication receipt records that the public overview was observed');
  t.match(release, /overviewSourceSha256/u);
  t.match(release, /overviewCanonicalSha256/u);

  t.notMatch(releaseNotes, /--mode overview|renderDockerhubOverview/u,
    'release-notes has no dormant second Docker Hub renderer');
  t.match(releaseNotes,
    /Docker Hub has a different owner: the exact tagged root README\.md/u,
    'the release-notes owner names the boundary explicitly');

  t.match(retiredOverview, /RETIRED PUBLICATION SOURCE/u,
    'the old Docker Hub document is a tombstone, not an alternate overview');
  t.match(retiredOverview, /root README\.md from the exact release tag/u);
  t.match(retiredOverview, /release\.yml must not use this file/u);
  t.notMatch(retiredOverview,
    /## Safe local quick start|## Multi-node cluster|## Configuration/u,
    'the retired surface carries no duplicate product/configuration prose');

  t.ok(Buffer.byteLength(readme, 'utf8') <= DOCKERHUB_DESCRIPTION_MAX_BYTES,
    'the canonical README fits Docker Hub before URL-completion expansion');
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
