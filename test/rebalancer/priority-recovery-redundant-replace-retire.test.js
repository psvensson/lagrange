/**
 * Directed below-gate falsifier for lever (c) — redundant-REPLACE retirement
 * (epic control-plane-write-wedge-leader-local-establishment.md).
 *
 * The residual rolling-restart binder is a priority-control-plane REPLACE whose
 * owner IS its (un-materialized) targetNodeId — a remote node stuck
 * `connecting`/`reconnecting`, so the drain perpetually picks ownerAction =
 * WAKE_REMOTE_OWNER and the op never dispatches. Meanwhile an INDEPENDENT sibling
 * already drove the partition to CONVERGED spread. The un-dispatched op is a pure
 * no-op that holds quiesce open; neither SUPERSEDED_TARGET (target eligible, not
 * excluded) nor the stale-FAIL path (stepTimeoutMs=0) retires it.
 *
 * These tests pin the new retirement:
 *  - flag-on + provably redundant + safe -> the op's replica_operations row is
 *    failed (retired) and the wake branch is skipped;
 *  - flag-off -> byte-identical no-op;
 *  - the SAFETY gate holds: an op is NEVER retired unless completion.state ===
 *    CONVERGED (independent materialized-replica spread, NOT the in-flight-counted
 *    SPREAD_SATISFIED_IN_FLIGHT), it is not itself a counted spread satisfier, its
 *    target is not MATERIALIZED, its owner-action is WAKE_REMOTE_OWNER, it is wedged
 *    past the wall-clock stall floor, and the authoritative re-read still confirms it.
 *
 * Uses the prototype-probe idiom: the REAL gating method runs; only true leaf
 * dependencies (repository, planning context, leaf target-state/staleness inputs)
 * are stubbed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {OperationWorkflowRecoveryDrain} from '../../src/rebalancer/operation-workflow-recovery-drain.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from '../../src/control-plane/priority-recovery-completion.js';

const {
  OperationType,
  WORKFLOW_STEP,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE,
} = SHARED;

const FLAG = 'LAGRANGE_PR_REDUNDANT_REPLACE_RETIRE';
const PARTITION_ID = 'control_plane_publications-p1';
const OPERATION_ID = 'redundant-replace-op';
const NOW = 1_000_000_000_000;
const STALE_TS = NOW - 60_000; // 60s old, past the 45s wall floor
const FRESH_TS = NOW - 1_000; // 1s old, below the floor

const WAKE_REMOTE_OWNER =
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER;
const WAKE_DRAIN_SNAPSHOT = Object.freeze({ownerAction: WAKE_REMOTE_OWNER});

function withFlag(t, value) {
  const previous = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  t.teardown(() => {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  });
}

function buildOp(overrides = {}) {
  return {
    operationId: OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
    targetNodeId: 'unreachable-remote',
    replicaId: 'replica-1',
    stepsHistory: [{step: WORKFLOW_STEP.PENDING, timestamp: STALE_TS}],
    ...overrides,
  };
}

function buildProbe({
  completionState = PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
  satisfyingOperationIds = [],
  targetState = PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.UNMATERIALIZED,
  rereadOperation = null,
} = {}) {
  const probe = Object.create(OperationWorkflowRecoveryDrain.prototype);
  const failCalls = [];
  probe.failCalls = failCalls;
  probe.timeSource = {now: () => NOW};
  probe.logger = {info() {}, warn() {}, error() {}};
  probe.repository = {
    isOperationTerminal: (op) => op?.terminal === true,
    getOperationByIdVisibilityObservation: async () => ({
      operation: rereadOperation,
    }),
  };
  // Leaf inputs the lever consumes — controlled directly so each gate is
  // exercised in isolation (their own resolution logic is covered elsewhere).
  probe.resolvePriorityRecoveryPreSyncReplaceTargetState = () => targetState;
  probe.getTimeoutForStep = () => 0; // no per-step deadline -> wall-floor staleness
  probe.getPriorityRecoveryPlanningSnapshot = async () => ({});
  probe.buildPriorityRecoveryAssessmentContextForOperation = () => ({
    completion: {state: completionState},
    decisionSnapshot: {spreadCompletion: {satisfyingOperationIds}},
  });
  probe.getOperationOwnerSingleFlightKey = (id) => id;
  probe.operationWorkflowRunExclusive = (_key, fn) => fn();
  probe.selectTimeoutReconcileOperation = (observation, op) =>
    observation?.operation ?? op;
  probe.failOperation = async (op, errorMessage, options) => {
    failCalls.push({op, errorMessage, options});
  };
  return probe;
}

test('flag-on: a redundant, safe, wedged REPLACE is retired (failOperation)', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe();
  const operation = buildOp();
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    operation,
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, true, 'returns true (caller skips the wake branch)');
  t.equal(probe.failCalls.length, 1, 'failOperation called exactly once');
  t.equal(
    probe.failCalls[0].errorMessage,
    OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRED,
    'retired with the redundant-replace error literal',
  );
  t.equal(
    probe.failCalls[0].op.operationId,
    OPERATION_ID,
    'failed the witnessed op',
  );
});

test('flag-off: byte-identical no-op (never retires)', async (t) => {
  withFlag(t, undefined);
  const probe = buildProbe();
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp(),
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'returns false when flag is unset');
  t.equal(probe.failCalls.length, 0, 'no failOperation when flag is unset');

  withFlag(t, 'false');
  const probeFalse = buildProbe();
  const retiredFalse =
    await probeFalse.retireRedundantPriorityReplaceFromDrainSnapshot(
      buildOp(),
      WAKE_DRAIN_SNAPSHOT,
    );
  t.equal(retiredFalse, false, 'returns false when flag is explicitly false');
  t.equal(probeFalse.failCalls.length, 0, 'no failOperation when flag false');
});

test('SAFETY: SPREAD_SATISFIED_IN_FLIGHT (not CONVERGED) is NEVER retired', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe({
    completionState: PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
  });
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp(),
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'in-flight-counted spread does not authorize retire');
  t.equal(probe.failCalls.length, 0, 'no failOperation');
});

test('SAFETY: an op that is itself a counted spread satisfier is NEVER retired', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe({satisfyingOperationIds: [OPERATION_ID]});
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp(),
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'op counted as a satisfier is not redundant');
  t.equal(probe.failCalls.length, 0, 'no failOperation');
});

test('SAFETY: a MATERIALIZED target is NEVER retired (it should complete)', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe({
    targetState: PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.MATERIALIZED,
  });
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp(),
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'a built target is not retired');
  t.equal(probe.failCalls.length, 0, 'no failOperation');
});

test('a non-WAKE_REMOTE_OWNER drain snapshot is NEVER retired here', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe();
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp(),
    {ownerAction: PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE},
  );
  t.equal(retired, false, 'locally-driveable ops are left to the reconcile path');
  t.equal(probe.failCalls.length, 0, 'no failOperation');
});

test('a fresh (not-yet-stale) op is NEVER retired', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe();
  const operation = buildOp({
    stepsHistory: [{step: WORKFLOW_STEP.PENDING, timestamp: FRESH_TS}],
  });
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    operation,
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'below the wall-clock stall floor -> wait, do not retire');
  t.equal(probe.failCalls.length, 0, 'no failOperation');
});

test('authoritative re-read showing a terminal op aborts the retire (idempotent)', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe({rereadOperation: buildOp({terminal: true})});
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp(),
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'a since-terminated op is not double-failed');
  t.equal(probe.failCalls.length, 0, 'no failOperation under the lock');
});

test('a non-REPLACE op (ADD) is NEVER retired by this lever', async (t) => {
  withFlag(t, 'true');
  const probe = buildProbe();
  const retired = await probe.retireRedundantPriorityReplaceFromDrainSnapshot(
    buildOp({type: OperationType.ADD}),
    WAKE_DRAIN_SNAPSHOT,
  );
  t.equal(retired, false, 'only REPLACE ops are in scope');
  t.equal(probe.failCalls.length, 0, 'no failOperation');
});
