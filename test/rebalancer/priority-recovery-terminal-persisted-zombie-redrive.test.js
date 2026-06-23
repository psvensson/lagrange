/**
 * Falsifier for census rank-1 `pr-terminal-persisted-zombie-no-redrive`.
 *
 * A surplus-drain priority-recovery op can end up `actuation.state =
 * persisted_not_dispatched` (the op was persisted to SQL but never dispatched) while a
 * split operation-context resolves its `workflowProgressPhaseId` to TERMINAL
 * (priority-recovery-snapshot-actuation.js evaluates IN_FLIGHT_OPERATION before
 * TERMINAL_OPERATION). Every dispatch-pending re-entry / re-arm path AND-gates on
 * `workflowProgressPhaseId === DISPATCH_PENDING`
 * (operation-workflow-recovery-reconcile-dispatch-pending.js:418-425), so the op is
 * classified NOT_DISPATCH_PENDING and SKIPPED — never re-armed — even though it is
 * persisted-but-never-dispatched. The surplus voter never drains -> convergence_timeout.
 *
 * This test pins the gating empirically: the ONLY difference between the two cases below
 * is the workflow-progress phase (DISPATCH_PENDING vs TERMINAL); everything else
 * (persisted_not_dispatched, owner-advance evidence) is identical. The phase alone flips
 * the same persisted-not-dispatched op from re-armed (REENTER) to stranded
 * (NOT_DISPATCH_PENDING). It is a characterization of the current (buggy) behavior; the
 * fix should make the TERMINAL + persisted_not_dispatched + passed-deadline case
 * reconcilable (re-arm / retire-and-reissue) instead of skipped.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoveryDispatchPendingReentryEvidence,
  resolvePriorityRecoveryDispatchPendingReentryState,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';

// State-enum string values (the enum itself is module-internal).
const REENTER_STATE = 'reenter';
const NOT_DISPATCH_PENDING_STATE = 'not_dispatch_pending';

// Minimal owner whose evidence-helper predicates all resolve so that, for a
// dispatch-pending op, the reentry state-table falls through to REENTER.
function buildReentryOwnerStub() {
  return {
    shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry: () => false,
    isDispatchRetryableWorkflowStep: () => true,
    isOperationOwnerLaneHeld: () => false,
    hasActiveCreatedOperationHandoffRetry: () => false,
    repository: {isOperationLocallyOwned: () => true},
  };
}

// A persisted-not-dispatched, owner-advancing snapshot, parameterized only by the
// workflow-progress phase.
function buildPersistedNotDispatchedSnapshot(workflowProgressPhaseId) {
  return {
    actuation: {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      workflowProgressPhaseId,
    },
    progress: {
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      workflowProgressPhaseId,
    },
  };
}

const ZOMBIE_OPERATION = {operationId: 'zombie-surplus-drain-op'};

test('census rank-1: a persisted_not_dispatched op with DISPATCH_PENDING phase re-enters (control)',
  (t) => {
    const owner = buildReentryOwnerStub();
    const snapshot = buildPersistedNotDispatchedSnapshot(
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    );

    const evidence = buildPriorityRecoveryDispatchPendingReentryEvidence(
      owner,
      snapshot,
      ZOMBIE_OPERATION,
    );

    t.equal(evidence.dispatchPending, true,
      'a persisted_not_dispatched op in DISPATCH_PENDING phase is recognized as dispatch-pending');
    t.equal(
      resolvePriorityRecoveryDispatchPendingReentryState(evidence),
      REENTER_STATE,
      'and therefore re-enters (re-arms) — the op is re-driven',
    );
    t.end();
  });

test('census rank-1 FALSIFIER: the SAME persisted_not_dispatched op is stranded when phase=TERMINAL',
  (t) => {
    const owner = buildReentryOwnerStub();
    const snapshot = buildPersistedNotDispatchedSnapshot(
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL,
    );

    const evidence = buildPriorityRecoveryDispatchPendingReentryEvidence(
      owner,
      snapshot,
      ZOMBIE_OPERATION,
    );

    // The phase is the ONLY thing changed vs the control case above.
    t.equal(evidence.dispatchPending, false,
      'persisted_not_dispatched is NOT recognized as dispatch-pending once phase resolves TERMINAL');
    t.equal(
      resolvePriorityRecoveryDispatchPendingReentryState(evidence),
      NOT_DISPATCH_PENDING_STATE,
      'so the persisted-but-never-dispatched op is classified NOT_DISPATCH_PENDING -> SKIP -> never re-armed (the zombie). The fix should make this reconcilable.',
    );
    t.end();
  });
