/**
 * Falsifier + harness for the lever-(a) extension to the surplus-drain write path.
 *
 * Lever (a) (applyLocalPriorityOperationProgressRow, commit 64a18b76) lets a priority
 * operation advance LOCALLY when its durable distributed write defers under control-plane
 * pressure, superseded later via the CDC round-trip. Its deferred-local-progress gate
 * `shouldUsePriorityDispatchDeferredLocalProgress` originally engaged ONLY for
 * `step === CREATING` (the SENDING→CREATING dispatch). It did NOT cover the SURPLUS-DRAIN's
 * later transitions (REPLACE source-removal at ACTIVE → REMOVED terminal).
 *
 * The rolling-restart gate (stat-gate-20260623T100334Z) pinned the binding
 * convergence_timeout witness as a surplus-drain op stuck under transportPressureState=
 * write_backlog at phase source_removal (workflowStep ACTIVE for a REPLACE) / terminal
 * (REMOVED) — exactly the transitions the gate did NOT cover, so no local-commit fallback
 * existed and the over-target voter never drained within MAX_SUSTAINED_OVER_TARGET_MS (120s).
 *
 * The lever extension (default-off LAGRANGE_PR_DRAIN_LOCAL_PROGRESS) covers the drain
 * transitions, scoped to priority control-plane partitions, REPLACE-only for ACTIVE.
 * This test pins both the flag-off gap (the falsifier) and the flag-on coverage (the fix),
 * plus the safety scopes (non-priority / non-REPLACE-ACTIVE / non-retryable stay uncovered).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  OperationWorkflowTransitionOrchestration,
} from '../../src/rebalancer/operation-workflow-transition-orchestration.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const FLAG = 'LAGRANGE_PR_DRAIN_LOCAL_PROGRESS';

// Real prototype so the drain-step helper + module predicates run; only the CREATING
// budget gate is stubbed true (it is exercised separately elsewhere).
function buildOrchestrationProbe() {
  const probe = Object.create(OperationWorkflowTransitionOrchestration.prototype);
  probe.shouldUsePriorityDispatchTransitionMutationBudget = () => true;
  return probe;
}

function shouldUse(probe, operation, step, errorLike) {
  return OperationWorkflowTransitionOrchestration.prototype
    .shouldUsePriorityDispatchDeferredLocalProgress
    .call(probe, operation, step, errorLike);
}

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

function buildWriteBacklogDefer() {
  const error = new Error('Distributed operation failed due to participant failures');
  error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
  error.retryAfterMs = 100;
  return error;
}

const REPLACE_DRAIN_OP = {
  operationId: 'surplus-drain-op',
  partitionId: 'sql_transaction_participants-p1',
  type: OperationType.REPLACE,
};

test('CREATING dispatch defer is absorbed regardless of the drain flag (unchanged baseline)',
  (t) => {
    withFlag(t, undefined);
    t.equal(
      shouldUse(buildOrchestrationProbe(), REPLACE_DRAIN_OP, WORKFLOW_STEP.CREATING,
        buildWriteBacklogDefer()),
      true,
      'SENDING→CREATING coverage is preserved with the flag off');
    t.end();
  });

test('FALSIFIER (flag-off): the surplus-drain REMOVED + ACTIVE source-removal defers are NOT absorbed',
  (t) => {
    withFlag(t, undefined);
    const probe = buildOrchestrationProbe();
    t.equal(shouldUse(probe, REPLACE_DRAIN_OP, WORKFLOW_STEP.REMOVED, buildWriteBacklogDefer()),
      false, 'drain terminal (REMOVED) has no local-commit fallback with the flag off (the gap)');
    t.equal(shouldUse(probe, REPLACE_DRAIN_OP, WORKFLOW_STEP.ACTIVE, buildWriteBacklogDefer()),
      false, 'REPLACE source-removal (ACTIVE) has no local-commit fallback with the flag off');
    t.end();
  });

test('FIX (flag-on): the surplus-drain REMOVED + REPLACE source-removal defers ARE absorbed',
  (t) => {
    withFlag(t, 'true');
    const probe = buildOrchestrationProbe();
    t.equal(shouldUse(probe, REPLACE_DRAIN_OP, WORKFLOW_STEP.REMOVED, buildWriteBacklogDefer()),
      true, 'drain terminal (REMOVED) is now covered → owner advances locally + re-arms durable');
    t.equal(shouldUse(probe, REPLACE_DRAIN_OP, WORKFLOW_STEP.ACTIVE, buildWriteBacklogDefer()),
      true, 'REPLACE source-removal (ACTIVE) is now covered');
    t.end();
  });

test('FIX safety scopes (flag-on): non-REPLACE ACTIVE, non-priority partition, and non-retryable stay uncovered',
  (t) => {
    withFlag(t, 'true');
    const probe = buildOrchestrationProbe();

    // ACTIVE is covered ONLY for REPLACE (an ADD's ACTIVE terminal must not be re-driven here).
    const addOp = {...REPLACE_DRAIN_OP, type: OperationType.ADD};
    t.equal(shouldUse(probe, addOp, WORKFLOW_STEP.ACTIVE, buildWriteBacklogDefer()),
      false, 'ADD ACTIVE terminal is NOT a surplus-drain source-removal → not covered');

    // Drain coverage is scoped to priority control-plane partitions only.
    const nonPriorityOp = {...REPLACE_DRAIN_OP, partitionId: 'user_data-p7'};
    t.equal(shouldUse(probe, nonPriorityOp, WORKFLOW_STEP.REMOVED, buildWriteBacklogDefer()),
      false, 'a non-priority partition REMOVED is not covered by the drain extension');

    // A permanent error never triggers local-commit at any step (safety floor).
    const permanent = new Error('replica operation rejected: schema invalid');
    for (const step of [WORKFLOW_STEP.CREATING, WORKFLOW_STEP.REMOVED, WORKFLOW_STEP.ACTIVE]) {
      t.equal(shouldUse(probe, REPLACE_DRAIN_OP, step, permanent), false,
        `permanent error never triggers local-commit (step=${step})`);
    }
    t.end();
  });
