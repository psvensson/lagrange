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

import {testsForSubsystem} from '../../scripts/check-subsystem.js';
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

test('the CLI and the library select identically', () => {
  // One CLI spawn, not 66: the bulk properties below call the library, so this
  // pins the two together. This test lives in the safety spine, so it must stay
  // cheap - it ran 13s when every property spawned a subprocess.
  const subsystem = 'transactions';
  const viaCli = run([subsystem, '--list'])
    .stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(viaCli, testsForSubsystem(subsystem));
});

test('every declared subsystem selects at least one test', () => {
  // A subsystem selecting nothing would report success while proving nothing.
  for (const subsystem of SUBSYSTEMS) {
    assert.ok(testsForSubsystem(subsystem).length > 0,
      `${subsystem} selected no tests`);
  }
});

test('selection matches the committed classification exactly', () => {
  // The selector must not re-derive or filter: what it runs is what the sealed
  // manifest says, or the axis and the execution disagree.
  for (const subsystem of SUBSYSTEMS) {
    const expected = Object.keys(manifest.classes).sort()
      .filter((testPath) => manifest.classes[testPath] === subsystem);
    assert.deepEqual(testsForSubsystem(subsystem), expected,
      `${subsystem} selection drifted`);
  }
});

test('every live test is reachable through exactly one subsystem', () => {
  // The union of all subsystem selections must be the whole census, with no
  // test reachable twice. This is what lets a release suite be assembled from
  // subsystems without losing or double-running anything.
  const seen = new Map();
  for (const subsystem of SUBSYSTEMS) {
    for (const testPath of testsForSubsystem(subsystem)) {
      assert.ok(!seen.has(testPath),
        `${testPath} reachable via ${seen.get(testPath)} and ${subsystem}`);
      seen.set(testPath, subsystem);
    }
  }
  assert.equal(seen.size, manifest.censusSize,
    'the union of subsystem selections must be the entire census');
});
