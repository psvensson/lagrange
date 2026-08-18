// Contract for the explicit whole-subsystem proof.
//
// The dangerous failure of any test SELECTOR is silent under-selection: an
// empty or truncated run is indistinguishable from a correct one that happened
// to have nothing to do. Every property below exists to make that impossible,
// so the selector must fail loudly rather than report success on nothing.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  SUBSYSTEM_MANIFEST_PATH,
  SUBSYSTEMS,
} from '../../scripts/checks/test-subsystem-classification-constants.js';

const root = process.cwd();
const UTF8 = 'utf8';
const SCRIPT = 'scripts/check-subsystem.js';

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args],
    {cwd: root, encoding: UTF8});
}

const manifest = JSON.parse(fs.readFileSync(
  path.join(root, SUBSYSTEM_MANIFEST_PATH), UTF8));

test('an unknown subsystem fails and names the valid ids', () => {
  const result = run(['not-a-real-subsystem']);
  assert.equal(result.status, 1,
    'an unknown id must fail, never run zero tests successfully');
  assert.match(result.stderr, /unknown subsystem: not-a-real-subsystem/);
  for (const subsystem of SUBSYSTEMS) {
    assert.ok(result.stderr.includes(subsystem),
      `the error must name ${subsystem} so the caller can correct it`);
  }
});

test('a missing subsystem argument fails with usage', () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage:/);
});

test('every declared subsystem selects at least one test', () => {
  // A subsystem that selects nothing would report success while proving
  // nothing. The classifier already forbids empty subsystems; this asserts the
  // selector agrees, because the two could drift apart.
  for (const subsystem of SUBSYSTEMS) {
    const result = run([subsystem, '--list']);
    assert.equal(result.status, 0, `${subsystem}: ${result.stderr}`);
    const selected = result.stdout.trim().split('\n').filter(Boolean);
    assert.ok(selected.length > 0, `${subsystem} selected no tests`);
  }
});

test('selection matches the committed classification exactly', () => {
  // The selector must not re-derive or filter: what it runs is what the sealed
  // manifest says, or the axis and the execution disagree.
  for (const subsystem of SUBSYSTEMS) {
    const expected = Object.keys(manifest.classes).sort()
      .filter((testPath) => manifest.classes[testPath] === subsystem);
    const selected = run([subsystem, '--list'])
      .stdout.trim().split('\n').filter(Boolean);
    assert.deepEqual(selected, expected, `${subsystem} selection drifted`);
  }
});

test('every live test is reachable through exactly one subsystem', () => {
  // The union of all subsystem selections must be the whole census, with no
  // test reachable twice. This is the property that lets a release suite be
  // assembled from subsystems without losing or double-running anything.
  const seen = new Map();
  for (const subsystem of SUBSYSTEMS) {
    for (const testPath of run([subsystem, '--list'])
      .stdout.trim().split('\n').filter(Boolean)) {
      assert.ok(!seen.has(testPath),
        `${testPath} reachable via ${seen.get(testPath)} and ${subsystem}`);
      seen.set(testPath, subsystem);
    }
  }
  assert.equal(seen.size, manifest.censusSize,
    'the union of subsystem selections must be the entire census');
});
