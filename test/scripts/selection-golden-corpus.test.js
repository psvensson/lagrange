// The golden corpus: independently justified proof obligations.
//
// Every obligation here was established OUTSIDE the selector - a real fix and
// the test that shipped with it, a declared impact contract, or a policy
// decision. None of it records what some earlier version of the selector chose,
// because freezing a mechanism's own output as its oracle proves only that the
// mechanism still agrees with itself. That was the defect three review rounds
// kept finding elsewhere in this work.
//
// The contract is one-directional on purpose:
//
//   the selector may become NARROWER or smarter over time
//   it may NEVER omit an obligation listed here
//
// So these fixtures assert minimum obligations, never exact selection counts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  buildExecutionPlan,
  loadSafetySpine,
} from '../../scripts/select-change-tests.js';
import {
  SELECTION_REFUSED,
} from '../../scripts/checks/change-selection-constants.js';

const root = process.cwd();
const UTF8 = 'utf8';
const CORPUS_PATH = 'test/shards/selection-golden-corpus.json';

const corpus = JSON.parse(
  fs.readFileSync(path.join(root, CORPUS_PATH), UTF8));
const spine = loadSafetySpine(root);

function planFor(fixture) {
  return buildExecutionPlan({
    changedPaths: fixture.changed,
    packageFields: fixture.changedPackageFields,
    planRoot: root,
  });
}

test('the corpus is a live oracle, not an abandoned fixture file', () => {
  assert.ok(corpus.fixtures.length >= 10,
    'too few fixtures to cover the policy surface');
  for (const fixture of corpus.fixtures) {
    assert.ok(fixture.provenance,
      `${fixture.id} must record WHERE its obligation came from`);
    assert.ok(fixture.why, `${fixture.id} must record why it matters`);
    assert.ok(Array.isArray(fixture.changed) && fixture.changed.length > 0);
    assert.ok(
      fixture.expectRefusal || fixture.mustIncludeSubsystems ||
      fixture.mustIncludeTests || fixture.expectSpineOnly,
      `${fixture.id} asserts nothing`);
  }
});

test('every fixture obligation is met by the current selector', () => {
  const failures = [];
  for (const fixture of corpus.fixtures) {
    const plan = planFor(fixture);
    const selected = new Set(plan.tests.map((entry) => entry.path));

    if (fixture.expectRefusal) {
      if (plan.kind !== SELECTION_REFUSED) {
        failures.push(`${fixture.id}: expected REFUSED, got ${plan.kind}`);
      } else if (plan.refusalCode !== fixture.expectRefusal) {
        failures.push(
          `${fixture.id}: refusal ${plan.refusalCode} != ${fixture.expectRefusal}`);
      }
      continue;
    }

    if (plan.kind === SELECTION_REFUSED) {
      failures.push(`${fixture.id}: unexpected refusal ${plan.refusals[0]}`);
      continue;
    }
    for (const subsystem of fixture.mustIncludeSubsystems || []) {
      if (!plan.subsystems.includes(subsystem)) {
        failures.push(`${fixture.id}: missing subsystem ${subsystem}`);
      }
    }
    for (const testPath of fixture.mustIncludeTests || []) {
      if (!selected.has(testPath)) {
        failures.push(`${fixture.id}: MISSING OBLIGATION ${testPath}`);
      }
    }
    if (fixture.expectSpineOnly && plan.tests.length !== spine.length) {
      failures.push(
        `${fixture.id}: expected spine-only, got ${plan.tests.length}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('a refusal never smuggles a partial selection through', () => {
  // "the spine passed, therefore success" is the worst reading of a refusal:
  // it is exactly when scope is unknown that a green result misleads most.
  for (const fixture of corpus.fixtures.filter((f) => f.expectRefusal)) {
    const plan = planFor(fixture);
    assert.equal(plan.kind, SELECTION_REFUSED);
    assert.equal(plan.selectedCount, 0,
      `${fixture.id}: a refusal must select nothing`);
  }
});

test('every fixture path is real, or the obligation is fiction', () => {
  // A fixture naming a deleted file would pass forever while proving nothing.
  for (const fixture of corpus.fixtures) {
    for (const testPath of fixture.mustIncludeTests || []) {
      assert.ok(fs.existsSync(path.join(root, testPath)),
        `${fixture.id} names a test that no longer exists: ${testPath}`);
    }
    for (const changed of fixture.changed) {
      const synthetic = fixture.expectRefusal === 'UNKNOWN_SCOPE';
      if (synthetic) continue;
      assert.ok(fs.existsSync(path.join(root, changed)),
        `${fixture.id} names a source path that no longer exists: ${changed}`);
    }
  }
});
