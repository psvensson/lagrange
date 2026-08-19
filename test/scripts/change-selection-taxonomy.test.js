// Source-taxonomy contracts for change-scoped selection.
//
// The test taxonomy answers "what does this test prove". This one answers
// "what does this CHANGE affect", and it is the half that decides whether a
// real source edit is proved at all. Its dangerous failure is silent
// narrowing: a change that resolves to nothing, or to `inert`, is proved by the
// safety spine alone and looks entirely healthy.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';

import {
  isInertPath,
  selectChangedTests,
  taxonomyCensus,
} from '../../scripts/checks/change-selection.js';
import {
  ALWAYS_INERT_SUFFIX,
  NEVER_INERT_PREFIXES,
  RELEASE_SURFACE_PATHS,
  SELECTION_REFUSED,
  SOURCE_SUBSYSTEM_RULES,
} from '../../scripts/checks/change-selection-constants.js';
const root = process.cwd();
const UTF8 = 'utf8';
const MAX_BUFFER = 64 * 1024 * 1024;

const tracked = execFileSync('git', ['ls-files'],
  {cwd: root, encoding: UTF8, maxBuffer: MAX_BUFFER})
  .split('\n').filter(Boolean);

test('EXHAUSTIVE: the four categories partition the candidate universe', () => {
  // The candidate universe is tracked PLUS non-ignored untracked files: a new
  // src/new-area/foo.js must be caught before it is staged, or exhaustiveness
  // would lapse exactly when a human is least likely to notice.
  const census = taxonomyCensus(root);
  assert.deepEqual(census.problems, [],
    'every candidate path must resolve; unresolved paths refuse, not skip');
  const sum = Object.values(census.counts).reduce((total, n) => total + n, 0);
  assert.equal(sum, census.candidateCount,
    `partition broken: ${JSON.stringify(census.counts)} over ` +
    `${census.candidateCount} candidates`);
  assert.ok(census.partitionOk);

  // Pairwise disjoint, asserted rather than assumed from the control flow.
  const categories = Object.keys(census.buckets);
  for (let a = 0; a < categories.length; a += 1) {
    for (let b = a + 1; b < categories.length; b += 1) {
      const left = new Set(census.buckets[categories[a]]);
      const overlap = census.buckets[categories[b]]
        .filter((candidatePath) => left.has(candidatePath));
      assert.deepEqual(overlap, [],
        `${categories[a]} and ${categories[b]} overlap`);
    }
  }
});

test('LIVENESS: every source rule matches at least one tracked path', () => {
  const dead = SOURCE_SUBSYSTEM_RULES.filter((rule) =>
    !tracked.some((trackedPath) => rule.pattern.test(trackedPath)))
    .map((rule) => rule.id);
  assert.deepEqual(dead, [],
    'a rule matching nothing is stale taxonomy, like a stale exemption');
});

test('INERT SAFETY: no executable or shipping path can be inert', () => {
  // Inert is the largest category, so an over-broad inert rule is the single
  // defect that could reduce a real source change to spine-only.
  const wrongly = tracked.filter((trackedPath) =>
    !trackedPath.endsWith(ALWAYS_INERT_SUFFIX) &&
    NEVER_INERT_PREFIXES.some((prefix) => trackedPath.startsWith(prefix)) &&
    isInertPath(trackedPath));
  assert.deepEqual(wrongly, [],
    'these prefixes must never be inert, whatever a future rule says');

  // And the deny list must be enforced against hypothetical future paths too.
  for (const probe of [
    'src/new-thing/x.js', 'scripts/new-tool.js', '.github/workflows/new.yml',
    'models/new-model.als', 'charts/new/values.yaml',
  ]) {
    assert.ok(!isInertPath(probe), `${probe} must never classify as inert`);
  }
});

test('ONE-HOP: a coupled endpoint does not expand through its own contracts', () => {
  // The boundary that stops subsystem-default growing back into transitive
  // closure under another name: A may pull in B's subsystem, but B must not
  // then pull in everything B's own contracts reference.
  const single = selectChangedTests({
    root,
    changedPaths: ['src/rebalancer/move-planner-priority-spread-cure.js'],
  });
  const union = selectChangedTests({
    root,
    changedPaths: [
      'src/rebalancer/move-planner-priority-spread-cure.js',
      'src/rebalancer/rebalance-coordinator-priority-spread-admission.js',
    ],
  });
  // Selecting both endpoints directly must not select MORE subsystems than
  // selecting one and letting the coupled rule add the other.
  assert.deepEqual(single.subsystems.sort(), union.subsystems.sort(),
    'coupled expansion must be one hop: the same closure either way');
});

test('shipping-surface changes require a release proof', () => {
  for (const shippingPath of RELEASE_SURFACE_PATHS) {
    const selection = selectChangedTests({root, changedPaths: [shippingPath]});
    assert.equal(selection.kind, SELECTION_REFUSED,
      `${shippingPath} changes what consumers receive`);
    assert.equal(selection.refusalCode, 'RELEASE_PROOF_REQUIRED');
  }
});

test('an unmapped source path refuses rather than resolving to nothing', () => {
  const selection = selectChangedTests({
    root,
    changedPaths: ['src/a-directory-nobody-has-classified/thing.js'],
  });
  assert.equal(selection.kind, SELECTION_REFUSED);
  assert.equal(selection.tests.length, 0);
});
