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
const STALE_TERMINAL_REDRIVE_STATE = 'stale_terminal_redrive';
const ZOMBIE_REDRIVE_FLAG = 'LAGRANGE_PR_ZOMBIE_REDRIVE';

function withZombieRedriveFlag(t, value) {
  const previous = process.env[ZOMBIE_REDRIVE_FLAG];
  if (value === undefined) {
    delete process.env[ZOMBIE_REDRIVE_FLAG];
  } else {
    process.env[ZOMBIE_REDRIVE_FLAG] = value;
  }
  t.teardown(() => {
    if (previous === undefined) {
      delete process.env[ZOMBIE_REDRIVE_FLAG];
    } else {
      process.env[ZOMBIE_REDRIVE_FLAG] = previous;
    }
  });
}

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
function buildPersistedNotDispatchedSnapshot(
  workflowProgressPhaseId,
  {timeoutReconcileDue = false} = {},
) {
  return {
    actuation: {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      workflowProgressPhaseId,
      timeoutReconcileDue,
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

test('census rank-1 FALSIFIER (flag-off): the SAME persisted_not_dispatched op is stranded when phase=TERMINAL',
  (t) => {
    withZombieRedriveFlag(t, undefined);
    const owner = buildReentryOwnerStub();
    const snapshot = buildPersistedNotDispatchedSnapshot(
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL,
      {timeoutReconcileDue: true},
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
      'with the fix flag off the persisted-but-never-dispatched op stays NOT_DISPATCH_PENDING -> SKIP (the zombie, unchanged default behavior)',
    );
    t.end();
  });

test('census rank-1 FIX (flag-on): a reconcile-due TERMINAL persisted_not_dispatched op is re-driven',
  (t) => {
    withZombieRedriveFlag(t, 'true');
    const owner = buildReentryOwnerStub();
    const snapshot = buildPersistedNotDispatchedSnapshot(
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL,
      {timeoutReconcileDue: true},
    );

    const evidence = buildPriorityRecoveryDispatchPendingReentryEvidence(
      owner,
      snapshot,
      ZOMBIE_OPERATION,
    );

    t.equal(evidence.staleTerminalDispatchable, true,
      'flag-on: a reconcile-due persisted_not_dispatched + terminal-phase op is flagged stale-terminal-dispatchable');
    t.equal(
      resolvePriorityRecoveryDispatchPendingReentryState(evidence),
      STALE_TERMINAL_REDRIVE_STATE,
      'so it resolves to STALE_TERMINAL_REDRIVE (-> ARM_NOW) instead of being stranded',
    );
    t.end();
  });

test('census rank-1 FIX safety (flag-on): a NOT-yet-reconcile-due TERMINAL op is left alone',
  (t) => {
    withZombieRedriveFlag(t, 'true');
    const owner = buildReentryOwnerStub();
    const snapshot = buildPersistedNotDispatchedSnapshot(
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL,
      {timeoutReconcileDue: false},
    );

    const evidence = buildPriorityRecoveryDispatchPendingReentryEvidence(
      owner,
      snapshot,
      ZOMBIE_OPERATION,
    );

    t.equal(evidence.staleTerminalDispatchable, false,
      'a fresh (not reconcile-due) terminal op must NOT be treated as a stale zombie');
    t.equal(
      resolvePriorityRecoveryDispatchPendingReentryState(evidence),
      NOT_DISPATCH_PENDING_STATE,
      'so a not-yet-stale terminal op is left on the default path (no premature re-drive)',
    );
    t.end();
  });
