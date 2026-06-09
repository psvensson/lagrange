import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, utimes} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ALGORITHM,
  FINGERPRINT_HEX_LENGTH,
} from '../../src/diagnostics/source-fingerprint.js';

const HEX_PATTERN = /^[0-9a-f]+$/u;

async function writeTree(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), {recursive: true});
    await writeFile(absolutePath, content, 'utf8');
  }
}

describe('computeSourceFingerprint', () => {
  let workspace;

  before(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'srcfp-'));
  });

  after(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it('produces a short lowercase hex digest with the expected length', async () => {
    const root = path.join(workspace, 'shape');
    await writeTree(root, {'a.js': 'export const a = 1;\n'});
    const fingerprint = await computeSourceFingerprint(root);
    assert.equal(typeof fingerprint, 'string');
    assert.equal(fingerprint.length, FINGERPRINT_HEX_LENGTH);
    assert.match(fingerprint, HEX_PATTERN);
    assert.equal(SOURCE_FINGERPRINT_ALGORITHM, 'sha256-content-v1');
  });

  it('is stable across repeated computation of the same tree', async () => {
    const root = path.join(workspace, 'stable');
    await writeTree(root, {
      'index.js': 'console.log("hi");\n',
      'lib/util.js': 'export const x = 2;\n',
    });
    const first = await computeSourceFingerprint(root);
    const second = await computeSourceFingerprint(root);
    assert.equal(first, second);
  });

  it('changes when file CONTENT changes even if byte length is identical', async () => {
    const root = path.join(workspace, 'samelen');
    await writeTree(root, {'mod.js': 'const value = 1;\n'});
    const before = await computeSourceFingerprint(root);
    // Same byte length, different content — the case mtime/size hashing misses.
    await writeFile(path.join(root, 'mod.js'), 'const value = 2;\n', 'utf8');
    const after = await computeSourceFingerprint(root);
    assert.notEqual(before, after);
  });

  it('ignores mtime: identical content with a changed mtime keeps the digest', async () => {
    const root = path.join(workspace, 'mtime');
    await writeTree(root, {'mod.js': 'const value = 1;\n'});
    const before = await computeSourceFingerprint(root);
    const past = new Date('2000-01-01T00:00:00Z');
    await utimes(path.join(root, 'mod.js'), past, past);
    const after = await computeSourceFingerprint(root);
    assert.equal(before, after);
  });

  it('changes when a file is added or removed', async () => {
    const root = path.join(workspace, 'addremove');
    await writeTree(root, {'a.js': 'a\n'});
    const single = await computeSourceFingerprint(root);
    await writeFile(path.join(root, 'b.js'), 'b\n', 'utf8');
    const withExtra = await computeSourceFingerprint(root);
    assert.notEqual(single, withExtra);
    await rm(path.join(root, 'b.js'));
    const removed = await computeSourceFingerprint(root);
    assert.equal(removed, single);
  });

  it('is independent of absolute location (same relative tree → same digest)', async () => {
    const rootA = path.join(workspace, 'locA', 'nested');
    const rootB = path.join(workspace, 'locB', 'deeper', 'tree');
    const files = {'index.js': 'x\n', 'sub/y.js': 'y\n'};
    await writeTree(rootA, files);
    await writeTree(rootB, files);
    assert.equal(
      await computeSourceFingerprint(rootA),
      await computeSourceFingerprint(rootB),
    );
  });

  it('does not collide when content is shuffled across files', async () => {
    const rootA = path.join(workspace, 'frameA');
    const rootB = path.join(workspace, 'frameB');
    // Same concatenated bytes, different file boundaries — length framing must
    // keep these distinct.
    await writeTree(rootA, {'one.js': 'abc', 'two.js': 'def'});
    await writeTree(rootB, {'one.js': 'ab', 'two.js': 'cdef'});
    assert.notEqual(
      await computeSourceFingerprint(rootA),
      await computeSourceFingerprint(rootB),
    );
  });
});
