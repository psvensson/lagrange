/** Dispatch-pending reentry decision of OperationWorkflowOwner.
 * Pure evidence/state tables and the owner-driven normalization that decides
 * whether a priority-recovery dispatch-pending snapshot re-enters the owner.
 * Subordinate to OperationWorkflowOwner; it holds no lane, timer or store.
 */
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../control-plane/priority-recovery-snapshot.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE,
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
} from './operation-workflow-owner-ports.js';
import {
  isOperationWorkflowOwnerDispatchPendingTargetProgressReady,
} from './operation-workflow-owner-priority-recovery-reentry.js';

const OPERATION_WORKFLOW_OWNER_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID = null;
const OPERATION_WORKFLOW_OWNER_FUNCTION_TYPE = 'function';
const OPERATION_WORKFLOW_OWNER_OBJECT_REFERENCE = Object.freeze({});
const OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_OPTION =
  Object.freeze({
    ALLOW_OWNER_LANE_RETRY: 'allowOwnerLaneRetry',
    EXECUTE_OWNER_OBSERVATION_EFFECT: 'executeOwnerObservationEffect',
  });
const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE =
  Object.freeze({
    OPERATION_UNAVAILABLE: 'operation_unavailable',
    NOT_OPERATION_WORKFLOW_OWNER: 'not_operation_workflow_owner',
    NOT_DISPATCH_PENDING: 'not_dispatch_pending',
    REBALANCER_HANDOFF_RETRY_ACTIVE: 'rebalancer_handoff_retry_active',
    REBALANCER_HANDOFF_RETRY_SNAPSHOT: 'rebalancer_handoff_retry_snapshot',
    PERSISTED_NOT_DISPATCHED: 'persisted_not_dispatched',
    EVENT_DRIVEN_ADVANCE: 'event_driven_advance',
    NOT_REENTERABLE: 'not_reenterable',
  });

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE =
  Object.freeze({
    REBALANCER_HANDOFF_RETRY_ACTIVE: 'rebalancer_handoff_retry_active',
    TIMEOUT_RECONCILE_DUE: 'timeout_reconcile_due',
    OWNER_RECONCILE: 'owner_reconcile',
  });

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_ALLOWED_STATES =
  Object.freeze(new Set([
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .PERSISTED_NOT_DISPATCHED,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .EVENT_DRIVEN_ADVANCE,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .REBALANCER_HANDOFF_RETRY_ACTIVE,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .REBALANCER_HANDOFF_RETRY_SNAPSHOT,
  ]));

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_ACTUATION_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  ]));

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .OPERATION_UNAVAILABLE,
      matches: (evidence) => evidence.operationAvailable !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_OPERATION_WORKFLOW_OWNER,
      matches: (evidence) => evidence.operationWorkflowOwner !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_DISPATCH_PENDING,
      matches: (evidence) => evidence.dispatchPending !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_REENTERABLE,
      matches: (evidence) =>
        evidence.dispatchPendingTargetProgressReady === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .REBALANCER_HANDOFF_RETRY_ACTIVE,
      matches: (evidence) => evidence.rebalancerHandoffRetryActive === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .REBALANCER_HANDOFF_RETRY_SNAPSHOT,
      matches: (evidence) => evidence.rebalancerHandoffRetrySnapshot === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .PERSISTED_NOT_DISPATCHED,
      matches: (evidence) => evidence.persistedNotDispatched === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .EVENT_DRIVEN_ADVANCE,
      matches: (evidence) => evidence.eventDrivenAdvance === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_REENTERABLE,
      matches: () => true,
    }),
  ]);

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
          .REBALANCER_HANDOFF_RETRY_ACTIVE,
      matches: (evidence) => evidence.rebalancerHandoffRetryActive === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
          .TIMEOUT_RECONCILE_DUE,
      matches: (evidence) =>
        evidence.timeoutReconcileDue === true ||
        evidence.timeoutProgressWait === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
          .OWNER_RECONCILE,
      matches: () => true,
    }),
  ]);

function resolveDispatchPendingTargetVisibilityState(snapshot, operation) {
  return snapshot?.coordinator?.operation?.targetVisibilityState ||
    operation?.targetVisibilityState ||
    OPERATION_WORKFLOW_OWNER_EMPTY_TEXT;
}
function isDispatchPendingOperationWorkflowOwner(snapshot) {
  return snapshot?.actuation?.owner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    snapshot?.progress?.currentOwner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER;
}
function isDispatchPendingActuation(snapshot) {
  return OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_ACTUATION_STATES.has(
    snapshot?.actuation?.state,
  ) &&
    snapshot?.actuation?.workflowProgressPhaseId ===
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
    snapshot?.progress?.workflowProgressPhaseId ===
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING;
}
function isDispatchPendingEventDrivenAdvance(snapshot) {
  const eventDrivenWorkflowProgressBoundary =
    snapshot?.progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
    snapshot?.progress?.waitMode ===
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN;
  return snapshot?.progress?.nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
    eventDrivenWorkflowProgressBoundary === true;
}
function buildOperationWorkflowOwnerDispatchPendingReentryEvidence(
  snapshot,
  operation,
  rebalancerHandoffRetryActive,
) {
  return Object.freeze({
    operationAvailable: Boolean(operation),
    operationWorkflowOwner: isDispatchPendingOperationWorkflowOwner(snapshot),
    dispatchPending: isDispatchPendingActuation(snapshot),
    dispatchPendingTargetProgressReady:
      isOperationWorkflowOwnerDispatchPendingTargetProgressReady(
        snapshot,
        resolveDispatchPendingTargetVisibilityState(snapshot, operation),
      ),
    persistedNotDispatched:
      snapshot?.actuation?.state ===
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    rebalancerHandoffRetryActive,
    rebalancerHandoffRetrySnapshot:
      isOperationWorkflowOwnerDispatchPendingHandoffRetrySnapshot(snapshot),
    eventDrivenAdvance: isDispatchPendingEventDrivenAdvance(snapshot),
  });
}

function resolveOperationWorkflowOwnerDispatchPendingReentryState(evidence) {
  return (
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .OPERATION_UNAVAILABLE
  );
}

function isOperationWorkflowOwnerSnapshotCandidate(value) {
  return Boolean(value) &&
    typeof value === typeof OPERATION_WORKFLOW_OWNER_OBJECT_REFERENCE &&
    !Array.isArray(value);
}

function normalizeOperationWorkflowOwnerSnapshotOperationId(operation) {
  const operationId = String(
    operation?.operationId || OPERATION_WORKFLOW_OWNER_EMPTY_TEXT,
  ).trim();
  return operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length ?
    operationId :
    OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID;
}

function hasActiveOperationWorkflowOwnerDispatchPendingHandoffRetry(
  owner,
  operation,
) {
  const operationId = normalizeOperationWorkflowOwnerSnapshotOperationId(
    operation,
  );
  if (
    typeof operationId !== typeof OPERATION_WORKFLOW_OWNER_EMPTY_TEXT ||
    operationId.length <= OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length
  ) {
    return false;
  }
  return owner.hasActiveCreatedOperationHandoffRetry(operationId) === true ||
    (
      typeof owner.hasActiveOperationDispatchDeferredRetry ===
        OPERATION_WORKFLOW_OWNER_FUNCTION_TYPE &&
      owner.hasActiveOperationDispatchDeferredRetry(operationId) === true
    );
}

function isOperationWorkflowOwnerDispatchPendingHandoffRetrySnapshot(
  snapshot,
) {
  return (
    snapshot?.progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF &&
    snapshot?.progress?.waitMode ===
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED &&
    snapshot?.progress?.nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS
  );
}

function isOperationWorkflowOwnerDispatchPendingOwnerLaneHeld(
  owner,
  operation,
) {
  const operationId = normalizeOperationWorkflowOwnerSnapshotOperationId(
    operation,
  );
  return (
    typeof operationId === typeof OPERATION_WORKFLOW_OWNER_EMPTY_TEXT &&
    operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length &&
    owner.isOperationOwnerLaneHeld(operationId)
  );
}

function shouldReenterOperationWorkflowOwnerDispatchPending(
  owner,
  snapshot,
  operation,
) {
  const evidence = buildOperationWorkflowOwnerDispatchPendingReentryEvidence(
    snapshot,
    operation,
    hasActiveOperationWorkflowOwnerDispatchPendingHandoffRetry(
      owner,
      operation,
    ),
  );
  return OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_ALLOWED_STATES.has(
    resolveOperationWorkflowOwnerDispatchPendingReentryState(evidence),
  );
}

function buildOperationWorkflowOwnerDispatchPendingReentryContextEvidence(
  owner,
  snapshot,
  operation,
) {
  const ownerLaneHeld =
    isOperationWorkflowOwnerDispatchPendingOwnerLaneHeld(owner, operation);
  return Object.freeze({
    rebalancerHandoffRetryActive:
      hasActiveOperationWorkflowOwnerDispatchPendingHandoffRetry(
        owner,
        operation,
      ) && ownerLaneHeld !== true,
    ownerLaneHeld,
    timeoutReconcileDue: snapshot?.actuation?.timeoutReconcileDue === true,
    timeoutProgressWait:
      snapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT &&
      snapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
  });
}

function resolveOperationWorkflowOwnerDispatchPendingReentryContextState(
  evidence,
) {
  return (
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_TABLE.find(
      (entry) => entry.matches(evidence),
    )?.state ||
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
      .OWNER_RECONCILE
  );
}

function buildPriorityRecoveryDispatchPendingOwnerReentryContext(
  owner,
  snapshot,
  operation,
) {
  const baseContext = Object.freeze({
    mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
  });
  const state =
    resolveOperationWorkflowOwnerDispatchPendingReentryContextState(
      buildOperationWorkflowOwnerDispatchPendingReentryContextEvidence(
        owner,
        snapshot,
        operation,
      ),
    );
  return state ===
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
      .TIMEOUT_RECONCILE_DUE ?
    Object.freeze({
      ...baseContext,
      cause: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE.TIMEOUT,
    }) :
    baseContext;
}

function normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
  owner,
  snapshot,
  operation,
) {
  if (!shouldReenterOperationWorkflowOwnerDispatchPending(
    owner,
    snapshot,
    operation,
  )) {
    return snapshot;
  }
  const normalizedSnapshot =
    normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
      snapshot,
      owner.operationWorkflowOwnerAdapter.decide(
        operation,
        buildPriorityRecoveryDispatchPendingOwnerReentryContext(
          owner,
          snapshot,
          operation,
        ),
      ),
    );
  owner.schedulePriorityRecoveryDispatchPendingReentry(
    normalizedSnapshot,
    [operation],
    {
      [OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_OPTION
        .ALLOW_OWNER_LANE_RETRY]: true,
      [OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_OPTION
        .EXECUTE_OWNER_OBSERVATION_EFFECT]: true,
    },
  );
  return normalizedSnapshot;
}

export {
  OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID,
  isOperationWorkflowOwnerSnapshotCandidate,
  normalizeOperationWorkflowOwnerSnapshotOperationId,
  normalizePriorityRecoveryDispatchPendingOwnerSnapshot,
};
