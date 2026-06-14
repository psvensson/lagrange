/**
 * Owner contract:
 * Owner: OperationWorkflowOwner priority-recovery reentry helpers own
 * target-progress reentry classification and scheduling.
 * Inputs: priority-recovery snapshots, operation rows, owner scheduling ports.
 * Canonical output: dispatch-pending readiness and target-progress reentry
 * actions for OperationWorkflowOwner.
 * Prohibited fallbacks: callers must not bypass OperationWorkflowOwner.
 * Primary tests: test/rebalancer/replace-replica-workflow.test.js.
 */
import {
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_PROVENANCE_SOURCE,
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from '../control-plane/priority-recovery-snapshot-contract.js';

const OPERATION_WORKFLOW_OWNER_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_TABLE_NAME =
  PRIORITY_RECOVERY_PROVENANCE_SOURCE.PRIORITY_RECOVERY_SNAPSHOT;
const OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_CACHE_OPERATION =
  PRIORITY_RECOVERY_PROVENANCE_SOURCE.PRIORITY_RECOVERY_SNAPSHOT;

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  NOT_OPERATION_WORKFLOW_OWNER: 'not_operation_workflow_owner',
  NOT_TARGET_PROGRESS: 'not_target_progress',
  TARGET_NOT_TERMINAL: 'target_not_terminal',
  OWNER_UNAVAILABLE: 'owner_unavailable',
  REMOTE_OWNER: 'remote_owner',
  OWNER_LANE_HELD: 'owner_lane_held',
  REENTER: 'reenter',
});

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION = Object.freeze({
  SKIP: 'skip',
  RECONCILE_NOW: 'reconcile_now',
  WAKE_REMOTE_OWNER: 'wake_remote_owner',
  RETRY_AFTER_OWNER_LANE: 'retry_after_owner_lane',
});

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION_BY_STATE =
  Object.freeze(new Map([
    [
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE.REENTER,
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.RECONCILE_NOW,
    ],
    [
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE.OWNER_LANE_HELD,
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
        .RETRY_AFTER_OWNER_LANE,
    ],
    [
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE.REMOTE_OWNER,
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
        .WAKE_REMOTE_OWNER,
    ],
  ]));

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_PHASES = Object.freeze(
  new Set([
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
  ]),
);

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_TARGET_PROGRESS_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
  ]));

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_TARGET_PROGRESS_ACTIONS =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  ]));

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_TABLE = Object.freeze([
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
        .OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
        .NOT_OPERATION_WORKFLOW_OWNER,
    matches: (evidence) => evidence.operationWorkflowOwner !== true,
  }),
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
        .NOT_TARGET_PROGRESS,
    matches: (evidence) => evidence.targetProgressWait !== true,
  }),
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
        .TARGET_NOT_TERMINAL,
    matches: (evidence) => evidence.targetServiceTerminal !== true,
  }),
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
        .OWNER_UNAVAILABLE,
    matches: (evidence) =>
      evidence.locallyOwned !== true &&
      evidence.remoteOwnerAvailable !== true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE.REMOTE_OWNER,
    matches: (evidence) => evidence.remoteOwnerAvailable === true,
  }),
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE.OWNER_LANE_HELD,
    matches: (evidence) => evidence.ownerLaneHeld === true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE.REENTER,
    matches: () => true,
  }),
]);

function normalizeOperationWorkflowOwnerTargetProgressOperationId(operation) {
  const operationId = String(
    operation?.operationId || OPERATION_WORKFLOW_OWNER_EMPTY_TEXT,
  ).trim();
  return operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length ?
    operationId :
    OPERATION_WORKFLOW_OWNER_EMPTY_TEXT;
}

function resolveOperationWorkflowOwnerTargetVisibilityState(
  snapshot,
  operation,
) {
  return snapshot?.coordinator?.operation?.targetVisibilityState ||
    operation?.targetVisibilityState ||
    OPERATION_WORKFLOW_OWNER_EMPTY_TEXT;
}

function isOperationWorkflowOwnerEventDrivenWorkflowProgressBoundary(snapshot) {
  return snapshot?.progress?.blockingBoundary ===
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
    snapshot?.progress?.waitMode === PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN;
}

function isOperationWorkflowOwnerDispatchPendingTargetProgressReady(
  snapshot,
  targetVisibilityState,
) {
  return snapshot?.actuation?.workflowProgressPhaseId ===
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
    snapshot?.progress?.workflowProgressPhaseId ===
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
    isOperationWorkflowOwnerEventDrivenWorkflowProgressBoundary(snapshot) ===
      true &&
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_TARGET_PROGRESS_ACTIONS.has(
      snapshot?.progress?.nextRequiredAction,
    ) &&
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_TARGET_PROGRESS_STATES.has(
      targetVisibilityState,
    );
}

function isOperationWorkflowOwnerTargetPhaseProgressWait(snapshot) {
  return OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_PHASES.has(
    snapshot?.actuation?.workflowProgressPhaseId,
  ) &&
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_PHASES.has(
      snapshot?.progress?.workflowProgressPhaseId,
    ) &&
    snapshot?.progress?.nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS &&
    isOperationWorkflowOwnerEventDrivenWorkflowProgressBoundary(snapshot) ===
      true;
}

function buildOperationWorkflowOwnerTargetProgressReentryEvidence(
  owner,
  snapshot,
  operation,
) {
  const operationId =
    normalizeOperationWorkflowOwnerTargetProgressOperationId(operation);
  const targetVisibilityState =
    resolveOperationWorkflowOwnerTargetVisibilityState(snapshot, operation);
  const ownerNodeId =
    owner.repository.resolveOperationOwnerNodeId(operation) ||
    OPERATION_WORKFLOW_OWNER_EMPTY_TEXT;
  const dispatchPendingTargetProgressWait =
    isOperationWorkflowOwnerDispatchPendingTargetProgressReady(
      snapshot,
      targetVisibilityState,
    );
  const representativeRerunRoute =
    snapshot?.progressContract?.representativeRerunRoute ||
    snapshot?.progress?.progressContract?.representativeRerunRoute ||
    'eligible';
  return Object.freeze({
    operationAvailable: Boolean(operationId),
    operationWorkflowOwner:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    targetProgressWait:
      representativeRerunRoute !== 'blocked_model_route' && (
        isOperationWorkflowOwnerTargetPhaseProgressWait(snapshot) === true ||
        dispatchPendingTargetProgressWait === true
      ),
    targetServiceTerminal:
      snapshot?.coordinator?.operation?.targetServiceTerminalState ===
        PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL ||
      operation?.targetServiceTerminalState ===
        PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL ||
      dispatchPendingTargetProgressWait === true,
    locallyOwned: owner.repository.isOperationLocallyOwned(operation),
    remoteOwnerAvailable:
      typeof ownerNodeId === typeof OPERATION_WORKFLOW_OWNER_EMPTY_TEXT &&
      ownerNodeId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length &&
      ownerNodeId !== owner.nodeId,
    ownerLaneHeld:
      Boolean(operationId) && owner.isOperationOwnerLaneHeld(operationId),
  });
}


function resolveOperationWorkflowOwnerTargetProgressReentryState(evidence) {
  return (
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
      .OPERATION_UNAVAILABLE
  );
}

function resolveOperationWorkflowOwnerTargetProgressReentryAction(
  owner,
  snapshot,
  operation,
) {
  const evidence = buildOperationWorkflowOwnerTargetProgressReentryEvidence(
    owner,
    snapshot,
    operation,
  );
  const state =
    resolveOperationWorkflowOwnerTargetProgressReentryState(evidence);
  return (
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION_BY_STATE
      .get(state) ||
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.SKIP
  );
}

function applyOperationWorkflowOwnerTargetProgressReentryAction(
  owner,
  operation,
  action,
) {
  const operationId =
    normalizeOperationWorkflowOwnerTargetProgressOperationId(operation);
  if (!operationId) {
    return false;
  }
  if (
    action ===
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
      .RETRY_AFTER_OWNER_LANE
  ) {
    return owner.scheduleObservedProgressRetry(
      operationId,
      OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_TABLE_NAME,
      OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_CACHE_OPERATION,
    );
  }
  if (
    action !==
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.RECONCILE_NOW
  ) {
    if (
      action ===
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.WAKE_REMOTE_OWNER
    ) {
      owner.wakeCoordinatorCreatedRemoteOwner(operation).catch((error) => {
        owner.handleObservedProgressFailure(
          operationId,
          OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_TABLE_NAME,
          OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_CACHE_OPERATION,
          error,
        );
      });
      return true;
    }
    return false;
  }
  owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(operationId),
    () => owner.reconcileObservedProgressOperation(operationId),
  ).catch((error) => {
    owner.handleObservedProgressFailure(
      operationId,
      OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_TABLE_NAME,
      OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_CACHE_OPERATION,
      error,
    );
  });
  return true;
}

export {
  applyOperationWorkflowOwnerTargetProgressReentryAction,
  isOperationWorkflowOwnerDispatchPendingTargetProgressReady,
  resolveOperationWorkflowOwnerTargetProgressReentryAction,
};
