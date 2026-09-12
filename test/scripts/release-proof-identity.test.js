// A release proof is a proof of shipped logic. Its identity must survive
// exactly the edits that cannot change that logic - the version string in
// the version authorities, the changelog, Solver records, publication
// receipts - and change on any other byte.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  OUTCOME, PROOF, RESOLUTION, buildReceipt, buildTagBody, identityRef, indexProof,
  proofRef, recordProof, resolveProof,
} from '../../scripts/proof-authority.js';
import {
  VERSION_AUTHORITIES, computeReleaseProofIdentity,
} from '../../scripts/release-proof-identity.js';

const RC_VERSION = '0.9.0-rc.2';
const RELEASE_VERSION = '0.9.0';
const LOGIC_FILE = 'src/logic.js';

function git(cwd, ...args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
}

function write(root, relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), {recursive: true});
  fs.writeFileSync(path.join(root, relativePath), content);
}

// A candidate tree shaped like the repository's release surface: every
// version authority carries the version, plus logic, a changelog, Solver
// records and a publication receipt.
function writeCandidate(root, version, logic = 'export const answer = 42;\n') {
  write(root, 'package.json', `{"name":"fixture","version":"${version}"}\n`);
  write(root, 'package-lock.json',
    `{"name":"fixture","version":"${version}","packages":{"":{"version":"${version}"}}}\n`);
  write(root, 'charts/lagrange-node/Chart.yaml',
    `apiVersion: v2\nname: lagrange-node\nversion: ${version}\nappVersion: "${version}"\n`);
  write(root, 'src/cli/cli-constants.js', `const CLI_VERSION = '${version}';\nexport {CLI_VERSION};\n`);
  write(root, 'src/constants/entrypoint.js',
    `const ENTRYPOINT_VERSION = '${version}';\nexport {ENTRYPOINT_VERSION};\n`);
  write(root, LOGIC_FILE, logic);
  write(root, 'CHANGELOG.md', `## [${version}]\n\nnotes for ${version}\n`);
  write(root, 'solve/quests/q/log.ndjson', `{"version":"${version}"}\n`);
  write(root, 'data/releases/v0.9.0-rc.1.json', '{"tag":"v0.9.0-rc.1"}\n');
}

function commitAll(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-proof-identity-'));
  const source = path.join(root, 'source');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(source);
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Identity Fixture');
  git(source, 'config', 'user.email', 'identity@example.invalid');
  writeCandidate(source, RC_VERSION);
  const rcSha = commitAll(source, 'rc');
  git(root, 'init', '--bare', '--quiet', remote);
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', '--quiet', 'origin', 'HEAD:main');
  return {root, source, remote, rcSha};
}

test('the identity masks the version authorities and ignores changelog, solve/ and receipts', () => {
  const {source} = fixture();
  const rc = computeReleaseProofIdentity(source);
  assert.deepEqual(rc.maskedFiles, [...VERSION_AUTHORITIES],
    'every version authority in the tree is masked');
  assert.equal(rc.releaseVersion, RC_VERSION);

  writeCandidate(source, RELEASE_VERSION);
  commitAll(source, 'release');
  const release = computeReleaseProofIdentity(source);
  assert.equal(release.releaseVersion, RELEASE_VERSION);
  assert.equal(release.digest, rc.digest,
    'a version bump plus changelog, Solver records and receipts keeps the identity');

  writeCandidate(source, RELEASE_VERSION, 'export const answer = 43;\n');
  commitAll(source, 'logic change');
  const changed = computeReleaseProofIdentity(source);
  assert.notEqual(changed.digest, rc.digest, 'one shipped byte changes the identity');
});

test('a receipt proves every commit with the same release content identity', () => {
  const {root, source, remote, rcSha} = fixture();
  const recorded = recordProof({
    proofId: PROOF.RELEASE_FULL, sha: rcSha, cwd: source,
    completedAt: '2026-09-12T18:00:00.000Z', now: Date.parse('2026-09-12T18:00:00.000Z'),
    producer: {kind: 'test-fixture', id: 'rc-run'},
  });
  assert.equal(recorded.outcome, OUTCOME.PROVEN);
  assert.equal(recorded.resolution, RESOLUTION.EXACT_SHA);
  assert.equal(recorded.receipt.identity.digest, computeReleaseProofIdentity(source).digest,
    'the receipt carries the identity of the tree it proved');
  assert.match(git(source, 'ls-remote', '--refs', 'origin',
    identityRef(PROOF.RELEASE_FULL, recorded.receipt.identity.digest)), /identity/u,
  'recording publishes the identity ref');

  // The release commit: same logic, released version, notes, receipts.
  writeCandidate(source, RELEASE_VERSION);
  const releaseSha = commitAll(source, 'release');
  git(source, 'push', '--quiet', 'origin', 'HEAD:main');
  const release = resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: source});
  assert.equal(release.outcome, OUTCOME.PROVEN, release.because);
  assert.equal(release.resolution, RESOLUTION.RELEASE_CONTENT_IDENTITY);
  assert.equal(release.provenBy, rcSha, 'proven by the rc receipt');
  assert.equal(release.subjectSha, releaseSha);

  // From a checkout of something else the identity of releaseSha is unknown:
  // unproven, never guessed.
  const other = path.join(root, 'other');
  git(root, 'clone', '--quiet', remote, other);
  git(other, 'checkout', '--quiet', rcSha);
  const elsewhere = resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: other});
  assert.equal(elsewhere.outcome, OUTCOME.UNPROVEN);

  // A logic change is a new identity: unproven until proven itself.
  writeCandidate(source, RELEASE_VERSION, 'export const answer = 43;\n');
  const changedSha = commitAll(source, 'logic change');
  const changed = resolveProof({proofId: PROOF.RELEASE_FULL, sha: changedSha, cwd: source});
  assert.equal(changed.outcome, OUTCOME.UNPROVEN, 'a changed tree is not proven by the rc receipt');
});

test('index backfills the identity ref of a receipt recorded without one', () => {
  const {source, rcSha} = fixture();
  const recorded = recordProof({
    proofId: PROOF.RELEASE_FULL, sha: rcSha, cwd: source,
    completedAt: '2026-09-12T18:00:00.000Z', now: Date.parse('2026-09-12T18:00:00.000Z'),
  });
  const ref = identityRef(PROOF.RELEASE_FULL, recorded.receipt.identity.digest);
  git(source, 'push', '--quiet', 'origin', `:${ref}`);
  assert.equal(git(source, 'ls-remote', '--refs', 'origin', ref), '', 'identity ref removed');

  writeCandidate(source, RELEASE_VERSION);
  const releaseSha = commitAll(source, 'release');
  assert.equal(resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: source}).outcome,
    OUTCOME.UNPROVEN, 'without the identity ref the release commit is unproven');

  git(source, 'checkout', '--quiet', rcSha);
  const indexed = indexProof({proofId: PROOF.RELEASE_FULL, sha: rcSha, cwd: source});
  assert.equal(indexed.indexed, true);
  git(source, 'checkout', '--quiet', releaseSha);
  const release = resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: source});
  assert.equal(release.outcome, OUTCOME.PROVEN, release.because);
  assert.equal(release.resolution, RESOLUTION.RELEASE_CONTENT_IDENTITY);
  assert.equal(indexProof({proofId: PROOF.RELEASE_FULL, sha: rcSha,
    cwd: (git(source, 'checkout', '--quiet', rcSha), source)}).indexed, false,
  'indexing again keeps the existing identity ref');
});

// A receipt from before identities were carried: minted the way recordProof
// mints, without the identity field, and published on its exact ref only.
function recordLegacyReceipt(source, sha) {
  const receipt = buildReceipt({
    proofId: PROOF.RELEASE_FULL, sha, completedAt: '2026-09-11T18:00:00.000Z',
    producer: {kind: 'test-fixture', id: 'legacy-run'},
  });
  assert.equal(receipt.identity, undefined, 'a legacy receipt carries no identity');
  const objectSha = execFileSync('git', ['mktag'], {
    cwd: source, encoding: 'utf8',
    input: buildTagBody({proofId: PROOF.RELEASE_FULL, sha, receipt,
      now: Date.parse('2026-09-11T18:00:00.000Z')}),
  }).trim();
  git(source, 'update-ref', 'refs/tmp/legacy', objectSha);
  git(source, 'push', '--quiet', 'origin', `refs/tmp/legacy:${proofRef(PROOF.RELEASE_FULL, sha)}`);
  git(source, 'update-ref', '-d', 'refs/tmp/legacy');
  return objectSha;
}

test('index binds a legacy receipt (no identity field) by the ref it publishes', () => {
  const {source, rcSha} = fixture();
  recordLegacyReceipt(source, rcSha);
  const exact = resolveProof({proofId: PROOF.RELEASE_FULL, sha: rcSha, cwd: source});
  assert.equal(exact.outcome, OUTCOME.PROVEN, 'the legacy receipt proves its own commit');

  const indexed = indexProof({proofId: PROOF.RELEASE_FULL, sha: rcSha, cwd: source});
  assert.equal(indexed.indexed, true);

  writeCandidate(source, RELEASE_VERSION);
  const releaseSha = commitAll(source, 'release');
  const release = resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: source});
  assert.equal(release.outcome, OUTCOME.PROVEN, release.because);
  assert.equal(release.resolution, RESOLUTION.RELEASE_CONTENT_IDENTITY);
  assert.equal(release.provenBy, rcSha);
});

test('a dirty checkout answers nothing: the identity is of the commit, not the tree', () => {
  const {source, rcSha} = fixture();
  recordProof({
    proofId: PROOF.RELEASE_FULL, sha: rcSha, cwd: source,
    completedAt: '2026-09-12T18:00:00.000Z', now: Date.parse('2026-09-12T18:00:00.000Z'),
  });
  writeCandidate(source, RELEASE_VERSION);
  const releaseSha = commitAll(source, 'release');
  // Uncommitted logic on top of the release commit: the bytes on disk are
  // not the commit's, so no identity may be computed from them.
  write(source, LOGIC_FILE, 'export const answer = 44;\n');
  const dirty = resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: source});
  assert.equal(dirty.outcome, OUTCOME.UNPROVEN, 'dirty tree: unproven, never guessed');
  // Solver records are outside the identity and do not count as dirt.
  git(source, 'checkout', '--quiet', '--', LOGIC_FILE);
  write(source, 'solve/quests/q/log.ndjson', '{"note":"working"}\n');
  const solverDirty = resolveProof({proofId: PROOF.RELEASE_FULL, sha: releaseSha, cwd: source});
  assert.equal(solverDirty.outcome, OUTCOME.PROVEN, solverDirty.because);
});
