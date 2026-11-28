// Characterizes localRevisionSourceFingerprint: the fingerprint of a Git revision's
// src tree equals the checkout fingerprint of that same tree, and each refusal names
// its reason in the identity_unverified diagnostic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {execGit} from '../../../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../../../scripts/checks/git-process-environment.js';
import {measureCheckoutSourceFingerprint} from '../../../../src/diagnostics/runtime-content-fingerprint.js';
import {localRevisionSourceFingerprint} from '../comparative-benchmark-revision-source.js';
import {stringTrim} from '../real-product-captured-intrinsics.js';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function createRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-source-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (...args) => stringTrim(execGit(args, {cwd: root, encoding: 'utf8',
    env: gitProcessEnvironment()}));
  git('init', '-q');
  fs.mkdirSync(path.join(root, 'src/nested'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src/nested/b.js'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(root, 'outside.txt'), 'not part of src\n');
  git('add', '.');
  git('-c', 'user.name=Witness', '-c', 'user.email=witness@example.org',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  return {root, git};
}

function refusal(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  return null;
}

test('the fingerprint of a revision equals the checkout fingerprint of its src tree, ' +
  'whether named in full or by an abbreviation', async (t) => {
  const {root, git} = createRepository(t);
  const commit = git('rev-parse', 'HEAD');
  assert.match(commit, SHA_PATTERN);
  const expected = await measureCheckoutSourceFingerprint(root);
  assert.equal(localRevisionSourceFingerprint(root, commit), expected);
  assert.equal(localRevisionSourceFingerprint(root, commit.slice(0, 10)), expected);
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 3;\n');
  assert.equal(localRevisionSourceFingerprint(root, commit), expected,
    'a later working-tree change does not alter the revision fingerprint');
  assert.notEqual(await measureCheckoutSourceFingerprint(root), expected);
});

test('a revision this repository does not hold is null, not a failure', (t) => {
  const {root} = createRepository(t);
  assert.equal(localRevisionSourceFingerprint(root, 'f'.repeat(40)), null);
});

test('a non-SHA and a non-commit object are identity_unverified with their reason', async (t) => {
  const {root, git} = createRepository(t);
  const reasonOf = (revision) => {
    const error = refusal(() => localRevisionSourceFingerprint(root, revision));
    assert.ok(error, `expected a refusal for ${revision}`);
    assert.equal(error.code, 'identity_unverified');
    assert.equal(error.diagnostic.revision, revision);
    return error.diagnostic.reason;
  };
  const blob = git('rev-parse', 'HEAD:outside.txt');
  assert.equal(reasonOf('main'), 'expected a Git revision SHA');
  assert.equal(reasonOf(blob), 'revision is not a commit');
});
