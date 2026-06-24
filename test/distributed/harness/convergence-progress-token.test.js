/**
 * Pins the no-progress detector's progress signal (buildConvergenceProgressToken).
 *
 * Bug (gate stat-gate-20260624T134940Z run1): the convergence wait's 30s
 * no-progress fast-fail was defeated because the progress token included
 * leaderChanges + the per-partition leader map. On an otherwise-FROZEN cluster
 * (surplus voter never drains) raft leaders kept flapping (4 incidental
 * re-elections), so the token kept changing and the timer kept resetting — the
 * oracle sat out its full 120s budget (~105s of pure idle) instead of failing
 * fast as "stalled".
 *
 * Fix: leadership churn is NOT convergence progress. The token reflects only the
 * settlement dimensions (voters at target, in-flight ops, over-target, CDC,
 * expected partitions, snapshot revision). This test pins that a leader-only flap
 * does NOT count as progress, while genuine drain/spread movement DOES.
 */

import {test} from '../../../src/test-helpers/tap.js';
import {
  ASSERTIONS_CONVERGENCE_WAIT,
} from './assertions-convergence-wait.js';

const {buildConvergenceProgressToken} = ASSERTIONS_CONVERGENCE_WAIT;

function frozenFields(overrides = {}) {
  return {
    voterCounts: [['replica_operations-p1', 3], ['sql_transactions-p1', 4]],
    effectiveInFlightReplicaOperationCount: 1,
    hasBlockingOverTarget: true,
    hasInFlightReplicaOperations: true,
    cdcProjectionVisibleSatisfied: false,
    expectedPartitionIds: ['replica_operations-p1', 'sql_transactions-p1'],
    snapshotRevision: 42,
    ...overrides,
  };
}

test('leader-only flap is NOT progress: the token is unchanged across re-elections',
  (t) => {
    const before = buildConvergenceProgressToken(frozenFields());
    // Simulate a frozen cluster whose ONLY change is leadership churn: pass the
    // (now-ignored) leader signals plus an incremented leaderChanges counter.
    const afterFlap = buildConvergenceProgressToken(frozenFields({
      leaders: [['replica_operations-p1', 'node-X']],
      leaderChanges: 4,
    }));
    t.equal(afterFlap, before,
      'a leadership flap on an otherwise-frozen cluster yields the SAME token ' +
      '(so the no-progress timer would correctly fire instead of resetting)');
    t.end();
  });

test('a draining op IS progress: fewer in-flight ops changes the token', (t) => {
  const before = buildConvergenceProgressToken(frozenFields());
  const afterDrain = buildConvergenceProgressToken(frozenFields({
    effectiveInFlightReplicaOperationCount: 0,
    hasInFlightReplicaOperations: false,
  }));
  t.not(afterDrain, before, 'real drain progress mutates the token (timer resets)');
  t.end();
});

test('a surplus draining (over-target clears) IS progress', (t) => {
  const before = buildConvergenceProgressToken(frozenFields());
  const afterDrain = buildConvergenceProgressToken(frozenFields({
    hasBlockingOverTarget: false,
    voterCounts: [['replica_operations-p1', 3], ['sql_transactions-p1', 3]],
  }));
  t.not(afterDrain, before, 'the surplus voter draining is real convergence progress');
  t.end();
});

test('snapshot revision advancing IS progress; CDC becoming visible IS progress',
  (t) => {
    const base = buildConvergenceProgressToken(frozenFields());
    t.not(buildConvergenceProgressToken(frozenFields({snapshotRevision: 43})), base,
      'a newer snapshot revision counts as progress');
    t.not(
      buildConvergenceProgressToken(frozenFields({cdcProjectionVisibleSatisfied: true})),
      base, 'CDC projection becoming visible counts as progress');
    t.end();
  });
