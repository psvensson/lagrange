import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  OUTCOME, PROOF, RECEIPT_REF_ROOT, proofRef, recordProof, resolveProof,
} from '../../scripts/proof-authority.js';

function git(cwd, ...args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-authority-'));
  const source = path.join(root, 'source');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(source);
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Proof Fixture');
  git(source, 'config', 'user.email', 'proof@example.invalid');
  fs.writeFileSync(path.join(source, 'subject.txt'), 'subject\n');
  git(source, 'add', 'subject.txt');
  git(source, 'commit', '--quiet', '-m', 'subject');
  const sha = git(source, 'rev-parse', 'HEAD');
  git(root, 'init', '--bare', '--quiet', remote);
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', '--quiet', 'origin', 'HEAD:main');
  return {root, source, remote, sha};
}

test('proof identity is exact proof contract plus full immutable SHA', () => {
  const sha = 'a'.repeat(40);
  assert.equal(
    proofRef(PROOF.RELEASE_FULL, sha),
    `${RECEIPT_REF_ROOT}/${PROOF.RELEASE_FULL}/${sha}`,
  );
  assert.throws(() => proofRef(PROOF.RELEASE_FULL, 'abc'), /full commit SHA/u);
});

test('absent durable receipt is unproven, never guessed from workflow state', () => {
  const {source, sha} = fixture();
  const result = resolveProof({proofId: PROOF.RELEASE_FULL, sha, cwd: source});
  assert.equal(result.outcome, OUTCOME.UNPROVEN);
});

test('one recorded proof is reusable from another checkout and is not a release tag', () => {
  const {root, source, remote, sha} = fixture();
  const first = recordProof({
    proofId: PROOF.RELEASE_FULL,
    sha,
    cwd: source,
    completedAt: '2026-09-11T18:00:00.000Z',
    now: Date.parse('2026-09-11T18:00:00.000Z'),
    producer: {kind: 'test-fixture', id: 'first-run'},
  });
  assert.equal(first.outcome, OUTCOME.PROVEN);
  assert.equal(first.reused, false);

  const ref = proofRef(PROOF.RELEASE_FULL, sha);
  const remoteLine = git(source, 'ls-remote', '--refs', 'origin', ref);
  assert.match(remoteLine, new RegExp(`${ref}$`, 'u'));
  assert.equal(git(source, 'ls-remote', '--tags', 'origin', `proof/*${sha}*`), '',
    'proof receipts do not pollute the release tag namespace');

  const other = path.join(root, 'other');
  git(root, 'clone', '--quiet', remote, other);
  const resolved = resolveProof({proofId: PROOF.RELEASE_FULL, sha, cwd: other});
  assert.equal(resolved.outcome, OUTCOME.PROVEN);
  assert.equal(resolved.receipt.subjectSha, sha);
  assert.equal(resolved.receipt.producer.id, 'first-run');
});

test('recording the same proof twice is idempotent and never rewrites the receipt', () => {
  const {source, sha} = fixture();
  const first = recordProof({
    proofId: PROOF.RELEASE_FULL, sha, cwd: source,
    completedAt: '2026-09-11T18:00:00.000Z', now: 1_789_150_400_000,
    producer: {kind: 'fixture', id: 'first'},
  });
  const ref = proofRef(PROOF.RELEASE_FULL, sha);
  const before = git(source, 'ls-remote', '--refs', 'origin', ref).split(/\s/u)[0];
  const second = recordProof({
    proofId: PROOF.RELEASE_FULL, sha, cwd: source,
    completedAt: '2026-09-12T18:00:00.000Z', now: 1_789_236_800_000,
    producer: {kind: 'fixture', id: 'second'},
  });
  const after = git(source, 'ls-remote', '--refs', 'origin', ref).split(/\s/u)[0];
  assert.equal(first.objectSha, before);
  assert.equal(second.outcome, OUTCOME.PROVEN);
  assert.equal(second.reused, true);
  assert.equal(after, before, 'second recorder did not replace the first receipt');
  assert.equal(second.receipt.producer.id, 'first');
});

test('a malformed existing proof ref fails closed instead of being blessed or replaced', () => {
  const {source, sha} = fixture();
  const ref = proofRef(PROOF.RELEASE_FULL, sha);
  const localRef = 'refs/lagrange-proof-fixture/malformed';
  git(source, 'update-ref', localRef, sha);
  git(source, 'push', '--quiet', 'origin', `${localRef}:${ref}`);
  git(source, 'update-ref', '-d', localRef);
  const result = resolveProof({proofId: PROOF.RELEASE_FULL, sha, cwd: source});
  assert.equal(result.outcome, OUTCOME.UNAVAILABLE);
  assert.match(result.because, /annotated tag/u);
  assert.throws(
    () => recordProof({proofId: PROOF.RELEASE_FULL, sha, cwd: source}),
    /proof store unavailable/u,
  );
});

test('unregistered proof names never become reusable by convention', () => {
  const {source, sha} = fixture();
  const result = resolveProof({proofId: 'some-future-proof-v1', sha, cwd: source});
  assert.equal(result.outcome, OUTCOME.UNAVAILABLE);
  assert.match(result.because, /unregistered proof contract/u);
});
