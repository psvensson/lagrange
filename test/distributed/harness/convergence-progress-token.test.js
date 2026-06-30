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

const {
  buildConvergenceProgressToken,
  buildEffectiveInFlightReplicaOperationProgress,
} = ASSERTIONS_CONVERGENCE_WAIT;

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

test('operation-owner workflow progress IS progress even when the in-flight ' +
  'count is unchanged', (t) => {
  const beforeProgress = buildEffectiveInFlightReplicaOperationProgress([
    {
      operationId: 'op-1',
      partitionId: 'sql_transactions-p1',
      type: 'REMOVE',
      status: 'pending',
      workflowStep: 'PENDING',
      updatedAt: 1000,
      inFlight: true,
    },
  ], true);
  const afterProgress = buildEffectiveInFlightReplicaOperationProgress([
    {
      operationId: 'op-1',
      partitionId: 'sql_transactions-p1',
      type: 'REMOVE',
      status: 'pending',
      workflowStep: 'SENDING',
      updatedAt: 1221,
      inFlight: true,
    },
  ], true);
  const before = buildConvergenceProgressToken(frozenFields({
    effectiveInFlightReplicaOperationProgress: beforeProgress,
  }));
  const afterOwnerProgress = buildConvergenceProgressToken(frozenFields({
    effectiveInFlightReplicaOperationProgress: afterProgress,
  }));

  t.not(afterOwnerProgress, before,
    'workflow-step progress for the effective in-flight operation mutates the ' +
    'token without relying on leader churn or aggregate count changes');
  t.end();
});

test('updatedAt-only operation churn is NOT owner workflow progress', (t) => {
  const first = buildEffectiveInFlightReplicaOperationProgress([
    {
      operationId: 'op-1',
      partitionId: 'sql_transactions-p1',
      type: 'REMOVE',
      status: 'pending',
      workflowStep: 'SENDING',
      updatedAt: 1221,
      inFlight: true,
    },
  ], true);
  const retryChurn = buildEffectiveInFlightReplicaOperationProgress([
    {
      operationId: 'op-1',
      partitionId: 'sql_transactions-p1',
      type: 'REMOVE',
      status: 'pending',
      workflowStep: 'SENDING',
      updatedAt: 2222,
      inFlight: true,
    },
  ], true);

  t.same(retryChurn, first,
    're-persisting the same step/status with a newer timestamp is not progress');
  t.equal(
    buildConvergenceProgressToken(frozenFields({
      effectiveInFlightReplicaOperationProgress: retryChurn,
    })),
    buildConvergenceProgressToken(frozenFields({
      effectiveInFlightReplicaOperationProgress: first,
    })),
    'updatedAt-only churn does not reset the no-progress token');
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

test('operation progress token includes only effective in-flight rows', (t) => {
  const progress = buildEffectiveInFlightReplicaOperationProgress([
    {
      operationId: 'stale-op',
      partitionId: 'replica_operations-p1',
      type: 'REPLACE',
      status: 'pending',
      workflowStep: 'PENDING',
      updatedAt: 1000,
      inFlight: true,
      staleDiscountApplied: true,
    },
    {
      operationId: 'discounted-op',
      partitionId: 'services-p1',
      type: 'REMOVE',
      status: 'active',
      workflowStep: 'ACTIVE',
      updatedAt: 1200,
      inFlight: true,
      additionalInFlightDiscountEligible: true,
    },
    {
      operationId: 'effective-op',
      partitionId: 'sql_transactions-p1',
      type: 'REMOVE',
      status: 'pending',
      workflowStep: 'SENDING',
      updatedAt: 1221,
      inFlight: true,
    },
  ], true);

  t.same(progress, [
    'effective-op:sql_transactions-p1:REMOVE:pending:SENDING',
  ]);
  t.same(
    buildEffectiveInFlightReplicaOperationProgress([
      {
        operationId: 'partial-row',
        partitionId: 'sql_transactions-p1',
        type: 'REMOVE',
        status: 'pending',
        workflowStep: 'SENDING',
        updatedAt: 1221,
        inFlight: true,
      },
    ], false),
    [],
    'partial drain-row coverage does not invent owner-progress resets');
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
