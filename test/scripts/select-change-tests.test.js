// Contract for change-scoped selection.
//
// The dangerous failure of a selector is silent under-selection: an empty or
// truncated run looks exactly like a correct one with nothing to do. Every
// assertion here attacks that, and the first two are the BOOTSTRAP contract -
// they are why it is safe for the safety spine to contain the selector's own
// tests.
//
//   Layer 0  runner        can we execute an explicit list of files?
//   Layer 1  safety spine  is the machinery that makes selection trustworthy intact?
//   Layer 2  selector      which additional tests does THIS change require?
//
// Each layer proves the next, which is a bootstrap rather than a circularity -
// but only while the spine is added by the ORCHESTRATOR and never chosen by the
// selector. These tests pin exactly that.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  selectChangedTests,
  subsystemForSourcePath,
} from '../../scripts/checks/change-selection.js';
import {
  SELECTION_PRECISE,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
} from '../../scripts/checks/change-selection-constants.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from '../../scripts/checks/test-subsystem-classification-constants.js';
import {
  buildExecutionPlan,
  loadSafetySpine,
} from '../../scripts/select-change-tests.js';

const root = process.cwd();
const UTF8 = 'utf8';
const spine = loadSafetySpine(root);
const plan = (changedPaths, overrides = {}) =>
  buildExecutionPlan({changedPaths, planRoot: root, ...overrides});

test('every safety-spine entry is a real, classified test', () => {
  // The spine is hand-curated, so a rename or deletion elsewhere can leave it
  // naming a file that no longer exists. That failure SHRINKS the unconditional
  // layer, which is the one thing the whole bootstrap rests on, and it does so
  // without any selector or classifier being wrong.
  const classes = JSON.parse(fs.readFileSync(
    path.join(root, SUBSYSTEM_MANIFEST_PATH), UTF8)).classes;
  assert.ok(spine.length > 0);
  for (const spineTest of spine) {
    assert.ok(fs.existsSync(path.join(root, spineTest)),
      `${spineTest} is in the safety spine but does not exist`);
    assert.ok(classes[spineTest],
      `${spineTest} is in the safety spine but is unclassified`);
  }
});

test('a selector returning NOTHING still runs the entire safety spine', () => {
  // The bootstrap assertion. If selection breaks so badly that it selects
  // nothing, the spine - which contains the classifier and selector contracts -
  // must still execute and expose the problem.
  const result = plan(['src/query/sql-query-engine.js'], {
    selector: () => ({kind: SELECTION_PRECISE, tests: []}),
  });
  const selected = new Set(result.tests.map((entry) => entry.path));
  for (const spineTest of spine) {
    assert.ok(selected.has(spineTest),
      `${spineTest} must run even when the selector returns nothing`);
  }
  assert.equal(result.tests.length, spine.length);
});

test('the selector never selects the safety spine itself', () => {
  // The spine is the ORCHESTRATOR's responsibility. If the selector also chose
  // it, a selector defect could quietly drop the tests that would have caught
  // that defect.
  const selection = selectChangedTests({
    root,
    changedPaths: ['src/query/sql-query-engine.js'],
  });
  const selectedPaths = new Set(selection.tests.map((entry) => entry.path));
  const spineOnlyTests = spine.filter((spineTest) =>
    !selectedPaths.has(spineTest));
  assert.ok(spineOnlyTests.length > 0,
    'at least some spine tests must come ONLY from the unconditional spine, ' +
    'or the bootstrap separation is not observable');
});

test('a REFUSED selection refuses the whole run, spine notwithstanding', () => {
  // "The spine passed, therefore success" would be the worst possible reading
  // of a refusal: it is precisely when scope is unknown that a green result is
  // most misleading.
  const result = plan(['src/brand-new-unmapped-area/thing.js']);
  assert.equal(result.kind, SELECTION_REFUSED);
  assert.ok(result.refusals.length > 0);
  assert.match(result.refusals[0], /SAFE TEST SCOPE UNKNOWN/);
});

test('an unknown source area refuses rather than selecting nothing', () => {
  const selection = selectChangedTests({
    root,
    changedPaths: ['src/nowhere/at/all.js'],
  });
  assert.equal(selection.kind, SELECTION_REFUSED);
  assert.equal(selection.tests.length, 0,
    'a refusal must not smuggle a partial selection through');
});

test('a changed test without classification refuses', () => {
  // Otherwise the one test guaranteed to be skipped by its own change is the
  // test that changed.
  const selection = selectChangedTests({
    root,
    changedPaths: ['test/brand-new-area/unclassified.test.js'],
  });
  assert.equal(selection.kind, SELECTION_REFUSED);
});

test('DELETING a test does not refuse the whole proof', () => {
  // A deleted test is absent from the classification manifest for the correct
  // reason: it no longer exists. Reading that as "unclassified" would make
  // removing any test demand a full release proof. It cannot be run and cannot
  // be silently skipped, so there is nothing to refuse about - and the deletion
  // still widens through test/shards, which audit:shards forces to be
  // regenerated.
  const deleted = 'test/scripts/retired-by-this-change.test.js';
  const selection = selectChangedTests({
    root,
    changedPaths: [deleted],
    vanishedPaths: new Set([deleted]),
  });
  assert.notEqual(selection.kind, SELECTION_REFUSED,
    'removing a test must not require the whole system to be proved');
  assert.ok(!selection.tests.some((entry) => entry.path === deleted),
    'a deleted test must never be scheduled to run');
});

test('a still-present unclassified test refuses, deletion notwithstanding', () => {
  // The exemption is for VANISHED paths only. A test that exists and is
  // unclassified is the original hazard and must still refuse.
  const selection = selectChangedTests({
    root,
    changedPaths: ['test/brand-new-area/unclassified.test.js'],
    vanishedPaths: new Set(),
  });
  assert.equal(selection.kind, SELECTION_REFUSED);
});

test('unknown precise cover widens to the subsystem, never to everything', () => {
  const selection = selectChangedTests({
    root,
    changedPaths: ['test/shards/subsystem-classes.json'],
  });
  assert.equal(selection.kind, SELECTION_WIDENED);
  assert.ok(selection.subsystems.includes('test-infrastructure'));
  assert.ok(selection.tests.length > 0);
  assert.ok(selection.tests.length < 500,
    'widening selects a subsystem, not the whole corpus');
});

test('inert paths select nothing beyond the spine', () => {
  const result = plan(['docs/steering/llm/core.md', 'solve/log/x.ndjson']);
  assert.equal(result.kind, SELECTION_PRECISE);
  assert.equal(result.tests.length, spine.length,
    'documentation cannot change behaviour, so it adds no behavioural proof');
});

test('a test selected twice executes once, carrying both reasons', () => {
  const result = plan(['src/query/sql-query-engine.js']);
  const paths = result.tests.map((entry) => entry.path);
  assert.equal(new Set(paths).size, paths.length, 'duplicate route in the plan');
  const multi = result.tests.filter((entry) => entry.reasons.length > 1);
  assert.ok(multi.length > 0,
    'a test reachable by several routes should record all of them');
});

test('source ownership is all-rules, so order cannot decide scope', () => {
  for (const sourcePath of [
    'src/query/executor.js', 'src/rebalancer/move-planner.js',
    'scripts/solve/attempt.js', 'scripts/check-subsystem.js',
    'package.json', 'test/shards/subsystem-classes.json',
  ]) {
    const owner = subsystemForSourcePath(sourcePath);
    assert.ok(owner.subsystem, `${sourcePath} has no owner`);
    assert.ok(!owner.ambiguous,
      `${sourcePath} matched several source rules: ${owner.ambiguous}`);
  }
});

test('the plan reports spine and selected counts separately', () => {
  // So a reader can tell fixed cost from change-proportional cost.
  const result = plan(['src/query/sql-query-engine.js']);
  assert.equal(result.spineCount, spine.length);
  assert.ok(result.selectedCount > 0);
});
