import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {compareRecords} from '../../scripts/release-content-digest.js';
import {
  computeFileSetFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';

const IDENTICAL_RECORD = Object.freeze({
  algorithm: 'release-content-sha256-content-v1',
  releaseContentDigest: 'abc',
  srcFingerprint: 'def',
  fileCount: 2,
});

test('compareRecords accepts an identical record and ignores headCommit', () => {
  const frozen = {...IDENTICAL_RECORD, headCommit: 'one'};
  const current = {...IDENTICAL_RECORD, headCommit: 'two'};
  assert.deepEqual(compareRecords(frozen, current), []);
});

test('compareRecords reports every diverging identity field', () => {
  const current = {
    ...IDENTICAL_RECORD,
    releaseContentDigest: 'changed',
    fileCount: 3,
  };
  const mismatches = compareRecords(IDENTICAL_RECORD, current);
  assert.equal(mismatches.length, 2);
  assert.ok(mismatches[0].includes('releaseContentDigest'));
  assert.ok(mismatches[1].includes('fileCount'));
});

test('computeFileSetFingerprint hashes a symlink by its target string, ' +
  'not the bytes behind it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-digest-'));
  try {
    await mkdir(path.join(root, 'a'));
    await writeFile(path.join(root, 'a', 'real.txt'), 'payload');
    await symlink('/nonexistent/target', path.join(root, 'a', 'broken-link'));
    const withBrokenLink = await computeFileSetFingerprint(root,
      ['a/real.txt', 'a/broken-link']);
    assert.match(withBrokenLink, /^[0-9a-f]{64}$/);

    await rm(path.join(root, 'a', 'broken-link'));
    await symlink('/other/target', path.join(root, 'a', 'broken-link'));
    const withOtherTarget = await computeFileSetFingerprint(root,
      ['a/real.txt', 'a/broken-link']);
    assert.notEqual(withBrokenLink, withOtherTarget);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('computeFileSetFingerprint changes when file content changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-digest-'));
  try {
    await writeFile(path.join(root, 'file.txt'), 'one');
    const before = await computeFileSetFingerprint(root, ['file.txt']);
    await writeFile(path.join(root, 'file.txt'), 'two');
    const after = await computeFileSetFingerprint(root, ['file.txt']);
    assert.notEqual(before, after);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
