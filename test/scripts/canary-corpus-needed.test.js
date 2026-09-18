// The post-push canary's one question: does this exact commit still owe the
// whole corpus? Two proofs can answer it - the gate run's proof scope and a
// durable whole-corpus receipt - and anything else leaves the corpus owed.
// Before this owner the canary read the scope artifact alone, so a gate that
// refused before writing one re-proved a corpus the push gate had already
// proved for that sha (74 min, 2026-09-17).

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  REASON, corpusNeeded, main, scopeProvesCorpus,
} from '../../scripts/checks/canary-corpus-needed.js';
import {
  CORPUS_FULL_PROOF, PROOF, recordProof, resolveCorpusProof, resolveProof,
} from '../../scripts/proof-authority.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const UTF8 = 'utf8';
const NEVER = () => {
  throw new Error('the proof authority must not be consulted');
};

function git(cwd, ...args) {
  return execFileSync('git', args, {cwd, encoding: UTF8}).trim();
}

// A real commit in a real repository with a real remote: the receipt this
// asserts on is one the authority recorded, not a stubbed answer.
function provenFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canary-corpus-'));
  const source = path.join(root, 'source');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(source);
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Canary Fixture');
  git(source, 'config', 'user.email', 'canary@example.invalid');
  fs.writeFileSync(path.join(source, 'subject.txt'), 'subject\n');
  git(source, 'add', 'subject.txt');
  git(source, 'commit', '--quiet', '-m', 'subject');
  git(root, 'init', '--bare', '--quiet', remote);
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', '--quiet', 'origin', 'HEAD:main');
  return {root, source, sha: git(source, 'rev-parse', 'HEAD')};
}

test('the gate run scope proves the corpus only for its own sha, fully run', () => {
  assert.equal(scopeProvesCorpus({sha: SHA, fullCorpus: true}, SHA), true);
  assert.equal(scopeProvesCorpus({sha: OTHER_SHA, fullCorpus: true}, SHA), false,
    'another commit proves nothing about this one');
  assert.equal(scopeProvesCorpus({sha: SHA, fullCorpus: false}, SHA), false,
    'a cone proof is not a corpus proof');
  for (const notScope of [null, undefined, 'full', 42, [], {}, {sha: SHA},
    {fullCorpus: true}, {sha: SHA, fullCorpus: 'true'}]) {
    assert.equal(scopeProvesCorpus(notScope, SHA), false);
  }
  // An inherited answer is not this scope's answer.
  try {
    Reflect.defineProperty(Object.prototype, 'fullCorpus',
      {configurable: true, value: true});
    Reflect.defineProperty(Object.prototype, 'sha',
      {configurable: true, value: SHA});
    assert.equal(scopeProvesCorpus({}, SHA), false,
      'a polluted prototype must not prove a corpus');
    assert.equal(scopeProvesCorpus({sha: SHA}, SHA), false);
  } finally {
    Reflect.deleteProperty(Object.prototype, 'fullCorpus');
    Reflect.deleteProperty(Object.prototype, 'sha');
  }
});

test('a scope that proves this sha skips the corpus without asking the authority', () => {
  const decision = corpusNeeded({
    sha: SHA, scope: {sha: SHA, fullCorpus: true}, resolve: NEVER});
  assert.deepEqual(decision, {needed: false, because: REASON.SCOPE_PROVES});
});

test('a durable receipt for this sha skips the corpus when no scope exists', () => {
  const asked = [];
  const decision = corpusNeeded({
    sha: SHA,
    scope: null,
    remote: 'https://example.invalid/repo',
    resolve: (input) => {
      asked.push(input);
      return true;
    },
  });
  assert.deepEqual(decision, {needed: false, because: REASON.RECEIPT_PROVES});
  assert.deepEqual(asked, [{sha: SHA, remote: 'https://example.invalid/repo'}],
    'the lookup is for this sha, against the remote it was given');
});

test('the corpus stays owed without a proof, and when the lookup cannot answer', () => {
  assert.deepEqual(corpusNeeded({sha: SHA, resolve: () => false}),
    {needed: true, because: REASON.UNPROVED});
  assert.deepEqual(corpusNeeded({sha: SHA, resolve: NEVER}),
    {needed: true, because: REASON.UNPROVED},
    'a throwing lookup leaves the corpus owed rather than skipping it');
  assert.deepEqual(corpusNeeded({sha: SHA, resolve: () => 'yes'}),
    {needed: true, because: REASON.UNPROVED},
    'only a boolean true is a proof');
  for (const notSha of [null, undefined, '', 'HEAD', SHA.slice(1), SHA.toUpperCase()]) {
    assert.deepEqual(corpusNeeded({sha: notSha, resolve: NEVER}),
      {needed: true, because: REASON.NO_SHA});
  }
});

test('a recorded whole-corpus receipt is what the canary reads back', () => {
  const {root, source, sha} = provenFixture();
  try {
    assert.equal(resolveCorpusProof({sha, cwd: source}), false,
      'nothing is proven before it is recorded');
    assert.deepEqual(
      corpusNeeded({sha, resolve: ({sha: asked}) =>
        resolveCorpusProof({sha: asked, cwd: source})}),
      {needed: true, because: REASON.UNPROVED});
    const recorded = recordProof({
      proofId: CORPUS_FULL_PROOF,
      sha,
      cwd: source,
      producer: {kind: 'test-fixture', id: 'canary-corpus-needed'},
    });
    assert.equal(recorded.reused, false);
    assert.equal(resolveCorpusProof({sha, cwd: source}), true);
    assert.deepEqual(
      corpusNeeded({sha, resolve: ({sha: asked}) =>
        resolveCorpusProof({sha: asked, cwd: source})}),
      {needed: false, because: REASON.RECEIPT_PROVES});
    assert.equal(resolveCorpusProof({sha: OTHER_SHA, cwd: source}), false,
      'the receipt is keyed by commit, not by repository');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// The release contract lets a sibling commit's receipt answer, because a
// release proves the shipped logic and the identity masks version authorities
// and excludes solve/, data/releases/ and CHANGELOG.md. The corpus proves MORE
// than the shipped logic: release-notes.test.js reads the real CHANGELOG for
// package.json's version, and neither file is a full-corpus trigger. So a
// changelog-only or version-bump commit must NOT inherit its parent's corpus
// receipt (verifier round 1, blocking).
test('a whole-corpus receipt never answers for a sibling commit', () => {
  const {root, source, sha} = provenFixture();
  try {
    recordProof({
      proofId: CORPUS_FULL_PROOF,
      sha,
      cwd: source,
      producer: {kind: 'test-fixture', id: 'sibling-identity'},
    });
    assert.equal(resolveCorpusProof({sha, cwd: source}), true);

    // A commit that changes only what the release identity masks or excludes.
    fs.writeFileSync(path.join(source, 'CHANGELOG.md'), '# 9.9.9\n');
    git(source, 'add', 'CHANGELOG.md');
    git(source, 'commit', '--quiet', '-m', 'changelog only');
    const sibling = git(source, 'rev-parse', 'HEAD');
    git(source, 'push', '--quiet', 'origin', 'HEAD:main');
    assert.notEqual(sibling, sha);
    assert.equal(resolveCorpusProof({sha: sibling, cwd: source}), false,
      'the corpus contract is exact-sha only: no sibling lends its receipt');
    assert.deepEqual(
      corpusNeeded({sha: sibling, resolve: ({sha: asked}) =>
        resolveCorpusProof({sha: asked, cwd: source})}),
      {needed: true, because: REASON.UNPROVED});

    // Nor may an identity ref exist for it to reach through.
    const identityRefs = git(source, 'ls-remote', '--refs', 'origin',
      `refs/lagrange-proofs/${CORPUS_FULL_PROOF}/identity/*`);
    assert.equal(identityRefs, '',
      'a non-identity-reusable contract publishes no identity ref');
    assert.equal(
      resolveProof({proofId: PROOF.CORPUS_FULL, sha: sibling, cwd: source})
        .outcome, 'unproven');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// Both halves of that exactness are pinned separately, because either alone
// looks sufficient: the contract publishes no identity ref, AND the lookup
// never takes the identity rung. The rung is observable - it opens by asking
// what the checked-out tree is - so a spy on git says whether it was taken.
test('the corpus lookup never probes release-content identity', () => {
  const asked = [];
  const spy = (args) => {
    asked.push(args[0]);
    return args[0] === 'ls-remote' ?
      {status: 0, stdout: ''} : {status: 1, stdout: '', stderr: ''};
  };

  asked.length = 0;
  assert.equal(resolveProof({proofId: PROOF.CORPUS_FULL, sha: SHA,
    cwd: process.cwd(), git: spy}).outcome, 'unproven');
  assert.deepEqual(asked, ['ls-remote'],
    'the exact ref is the only question a corpus receipt answers');

  asked.length = 0;
  resolveProof({proofId: PROOF.RELEASE_FULL, sha: SHA,
    cwd: process.cwd(), git: spy});
  assert.ok(asked.includes('rev-parse'),
    'the release contract does reach for identity: the guard is per contract, ' +
    'not a blanket change');
});

test('a hand dispatch re-proves the corpus whatever the proofs say', () => {
  assert.deepEqual(
    corpusNeeded({sha: SHA, scope: {sha: SHA, fullCorpus: true},
      resolve: NEVER, force: true}),
    {needed: true, because: REASON.FORCED},
    'an operator asking for the canary is asking for the corpus');
  assert.deepEqual(corpusNeeded({sha: SHA, resolve: () => true, force: false}),
    {needed: false, because: REASON.RECEIPT_PROVES},
    'and only an explicit force does that');
});

test('the command line writes only the step output on stdout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canary-corpus-cli-'));
  try {
    const scopeFile = path.join(root, 'proof-scope.json');
    fs.writeFileSync(scopeFile,
      `${JSON.stringify({sha: SHA, fullCorpus: true})}\n`, UTF8);
    const out = [];
    const explained = [];
    const decision = main(['--sha', SHA, '--scope', scopeFile],
      (value) => out.push(value), (value) => explained.push(value));
    assert.equal(decision.needed, false);
    assert.deepEqual(out, ['needed=false\n'],
      'a prose line on stdout would be a step-output format error');
    assert.match(explained.join(''), /corpus-full-v1: /u);

    const missing = [];
    main(['--sha', SHA, '--scope', path.join(root, 'absent.json')],
      (value) => missing.push(value), () => {});
    assert.deepEqual(missing, ['needed=true\n'],
      'a missing scope file leaves the corpus owed');

    const forced = [];
    main(['--sha', SHA, '--scope', scopeFile, '--force'],
      (value) => forced.push(value), () => {});
    assert.deepEqual(forced, ['needed=true\n'],
      '--force outranks a scope that proves the corpus');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
