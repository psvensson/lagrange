// The ACTIVE-wait snapshot RETENTION contract, stated without a clock.
//
// This decision was previously provable only through the terminal-startup
// blocker integration test, which drove it through a live poll loop under a
// wall-clock deadline. That made a semantic question depend on how many probes
// happened to fit in the budget: the same code observed anywhere from 1 to 39
// probes, and a single-probe run either failed with a misleading signature or -
// worse - PASSED while proving nothing, because nothing had regressed yet.
//
// The retention rule itself is pure, so it is stated here directly. The clock
// decides only WHEN the loop stops; it must never decide what the loop means.

import {test} from '../../../../src/test-helpers/tap.js';
import {
  isBetterActiveWaitSnapshotCoverageProgressSnapshot,
} from '../cluster-active-wait-loop.js';

const STRONG_COVERAGE = 3;
const REGRESSED_COVERAGE = 1;
const STRONG_NODE_ID = 'joiner-strong';
const REGRESSED_NODE_ID = 'seed-1';
const SNAPSHOT_ERROR =
  'Admin API query timed out for node seed-a on lane snapshot after 2500ms';

function snapshot(coverageNodeCount, selectedSnapshotNodeId, overrides = {}) {
  return {
    snapshotCoverageNodeCount: coverageNodeCount,
    selectedSnapshotNodeId,
    ...overrides,
  };
}

const STRONG = snapshot(STRONG_COVERAGE, STRONG_NODE_ID);
const REGRESSED = snapshot(REGRESSED_COVERAGE, REGRESSED_NODE_ID);

test('a regressed snapshot never displaces a stronger retained one', (t) => {
  // The contract the flaky integration test was reaching for: once a
  // joiner-strong snapshot is held, a later seed-1 observation with narrower
  // coverage must not become the terminal witness.
  t.notOk(
    isBetterActiveWaitSnapshotCoverageProgressSnapshot(REGRESSED, STRONG),
    'narrower coverage must not replace the retained snapshot',
  );
  t.end();
});

test('a strictly wider snapshot does replace the retained one', (t) => {
  t.ok(
    isBetterActiveWaitSnapshotCoverageProgressSnapshot(STRONG, REGRESSED),
    'retention must not become stickiness: real improvement still wins',
  );
  t.end();
});

test('equal coverage does not churn the retained snapshot', (t) => {
  // Strictly-greater, not greater-or-equal: an equal observation replacing the
  // incumbent would make the retained witness depend on probe count again.
  t.notOk(
    isBetterActiveWaitSnapshotCoverageProgressSnapshot(
      snapshot(STRONG_COVERAGE, REGRESSED_NODE_ID), STRONG),
    'equal coverage must leave the retained snapshot untouched',
  );
  t.end();
});

test('a snapshot carrying a selection error is never retained', (t) => {
  // Even with the widest coverage seen: an errored selection is not evidence.
  t.notOk(
    isBetterActiveWaitSnapshotCoverageProgressSnapshot(
      snapshot(STRONG_COVERAGE + 1, STRONG_NODE_ID,
        {selectedSnapshotError: SNAPSHOT_ERROR}),
      REGRESSED),
    'an errored snapshot must not become the terminal witness',
  );
  t.end();
});

test('a snapshot without usable coverage is never retained', (t) => {
  for (const absent of [0, -1, null, undefined, 'three', 1.5]) {
    t.notOk(
      isBetterActiveWaitSnapshotCoverageProgressSnapshot(
        snapshot(absent, STRONG_NODE_ID), null),
      `coverage ${String(absent)} carries no evidence to retain`,
    );
  }
  t.end();
});

test('the first usable snapshot is retained over no incumbent', (t) => {
  t.ok(
    isBetterActiveWaitSnapshotCoverageProgressSnapshot(REGRESSED, null),
    'bootstrapping: any usable coverage beats holding nothing',
  );
  t.end();
});
