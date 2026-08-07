import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  PRIMARY_CLASSES,
  buildManifest,
  classifyTestFile,
  collectTestFiles,
  loadManifest,
  verifyManifest,
} from '../../scripts/checks/test-primary-classification.js';

const root = path.resolve(import.meta.dirname, '..', '..');

function makeTree(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'primary-class-test-'));
  for (const relPath of layout) {
    const absolute = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    fs.writeFileSync(absolute, '');
  }
  return dir;
}

test('primary classes are exactly the sealed five', () => {
  assert.deepEqual([...PRIMARY_CLASSES], [
    'unit', 'integration', 'bootstrap', 'convergence-probe', 'packaging',
  ]);
  assert.equal(PRIMARY_CLASSES.includes('smoke'), false);
});

test('classification rules: directory beats suffix, curated probes win', () => {
  const probes = new Set(['test/convergence/dt6-x.test.js']);
  const cases = [
    ['test/convergence/dt6-x.test.js', 'convergence-probe'],
    ['test/packaging/sea-bundle-smoke.test.js', 'packaging'],
    ['test/integration/foo.test.js', 'integration'],
    ['test/query/foo.integration.test.js', 'integration'],
    ['test/bootstrap/fresh-join.integration.test.js', 'bootstrap'],
    ['test/bootstrap/join.test.js', 'bootstrap'],
    ['test/rebalancer/foo.test.js', 'unit'],
  ];
  for (const [testPath, expected] of cases) {
    assert.equal(classifyTestFile(testPath, probes), expected, testPath);
  }
});

test('live census covers every *.test.js in the repository', () => {
  const census = collectTestFiles(root);
  assert.ok(census.length > 1900, `expected the full test universe, got ${census.length}`);
  assert.equal(new Set(census).size, census.length, 'census has duplicates');
  assert.ok(census.every((entry) => entry.endsWith('.test.js')));
});

test('committed manifest verifies clean against the live census', () => {
  const loaded = loadManifest(root);
  assert.equal(loaded.ok, true, loaded.problems.join('; '));
  assert.deepEqual(verifyManifest(root, loaded.manifest), []);
});

test('verify fails closed on unknown class', () => {
  const dir = makeTree(['test/a.test.js']);
  try {
    const manifest = buildManifest(dir);
    manifest.classes['test/a.test.js'] = 'smoke';
    const problems = verifyManifest(dir, manifest);
    assert.ok(problems.some((p) => p.includes('unknown class')));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('verify fails closed on unclassified and ghost files', () => {
  const dir = makeTree(['test/a.test.js', 'test/b.test.js']);
  try {
    const manifest = buildManifest(dir);
    delete manifest.classes['test/b.test.js'];
    assert.ok(verifyManifest(dir, manifest)
      .some((p) => p.includes('unclassified test file: test/b.test.js')));
    const ghost = buildManifest(dir);
    ghost.classes['test/ghost.test.js'] = 'unit';
    assert.ok(verifyManifest(dir, ghost)
      .some((p) => p.includes('manifest assigns missing test file: test/ghost.test.js')));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('verify fails closed on hand-edited class (rule drift)', () => {
  const dir = makeTree(['test/integration/a.integration.test.js']);
  try {
    const manifest = buildManifest(dir);
    manifest.classes['test/integration/a.integration.test.js'] = 'unit';
    assert.ok(verifyManifest(dir, manifest)
      .some((p) => p.includes('class drift')));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('verify fails closed on digest forgery without class changes', () => {
  const dir = makeTree(['test/a.test.js']);
  try {
    const manifest = buildManifest(dir);
    manifest.digest = 'fnv1a32-deadbeef';
    assert.ok(verifyManifest(dir, manifest)
      .some((p) => p.includes('digest mismatch')));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('unsupported schemaVersion fails closed', () => {
  const dir = makeTree(['test/a.test.js']);
  try {
    const manifest = buildManifest(dir);
    manifest.schemaVersion = 99;
    assert.ok(verifyManifest(dir, manifest)
      .some((p) => p.includes('unsupported schemaVersion')));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('bootstrap directory wins over integration suffix in derivation', () => {
  const dir = makeTree(['test/bootstrap/fresh-join-via-non-seed-node.integration.test.js']);
  try {
    const manifest = buildManifest(dir);
    assert.equal(
      manifest.classes['test/bootstrap/fresh-join-via-non-seed-node.integration.test.js'],
      'bootstrap');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
