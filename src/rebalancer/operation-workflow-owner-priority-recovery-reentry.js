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
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../control-plane/priority-recovery-snapshot.js';
import {
  PRIORITY_RECOVERY_PROVENANCE_SOURCE,
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from '../control-plane/priority-recovery-snapshot-contract.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
} from './operation-workflow-owner-constants.js';

const OPERATION_WORKFLOW_OWNER_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_OWNER_FUNCTION_TYPE = 'function';
const OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_TABLE_NAME =
  PRIORITY_RECOVERY_PROVENANCE_SOURCE.PRIORITY_RECOVERY_SNAPSHOT;
const OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_CACHE_OPERATION =
  PRIORITY_RECOVERY_PROVENANCE_SOURCE.PRIORITY_RECOVERY_SNAPSHOT;
const OPERATION_WORKFLOW_OWNER_REPRESENTATIVE_RERUN_ROUTE = Object.freeze({
  ELIGIBLE: 'eligible',
  BLOCKED_MODEL_ROUTE: 'blocked_model_route',
});
const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_STATE = Object.freeze({
  AVAILABLE: 'target_progress_owner_outcome_available',
  UNAVAILABLE: 'target_progress_owner_outcome_unavailable',
});
const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_UNAVAILABLE =
  Object.freeze({
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_STATE.UNAVAILABLE,
  });

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  NOT_OPERATION_WORKFLOW_OWNER: 'not_operation_workflow_owner',
  NOT_TARGET_PROGRESS: 'not_target_progress',
  TARGET_NOT_TERMINAL: 'target_not_terminal',
  OWNER_UNAVAILABLE: 'owner_unavailable',
  REBALANCER_HANDOFF_RETRY_ACTIVE: 'rebalancer_handoff_retry_active',
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

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_BY_ACTION =
  Object.freeze(new Map([
    [
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.RECONCILE_NOW,
      Object.freeze({
        outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        effectCommand:
          OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
            .ADVANCE_EXISTING_OPERATION_COMMAND,
      }),
    ],
    [
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.WAKE_REMOTE_OWNER,
      Object.freeze({
        outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
        effectCommand:
          OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.WAKE_REMOTE_OWNER_COMMAND,
      }),
    ],
    [
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
        .RETRY_AFTER_OWNER_LANE,
      Object.freeze({
        outcome:
          OPERATION_WORKFLOW_OUTCOME_VALUES
            .WAIT_FOR_REBALANCER_HANDOFF_RETRY,
        effectCommand: OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .NO_OPERATION_EFFECT,
      }),
    ],
  ]));

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_PHASES = Object.freeze(
  new Set([
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
  ]),
);

const OPERATION_WORKFLOW_OWNER_SOURCE_REMOVAL_PROGRESS_PHASES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
    ]),
  );

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_TARGET_PROGRESS_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
  ]));

const OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_ACTIONS =
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
    state:
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
        .REBALANCER_HANDOFF_RETRY_ACTIVE,
    matches: (evidence) => evidence.rebalancerHandoffRetryActive === true,
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
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_ACTIONS.has(
      snapshot?.progress?.nextRequiredAction,
    ) &&
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_TARGET_PROGRESS_STATES.has(
      targetVisibilityState,
    );
}

function isOperationWorkflowOwnerTargetSyncActiveProgressReady(
  snapshot,
  targetVisibilityState,
) {
  return snapshot?.actuation?.workflowProgressPhaseId ===
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC &&
    snapshot?.progress?.workflowProgressPhaseId ===
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC &&
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_ACTIONS.has(
      snapshot?.progress?.nextRequiredAction,
    ) &&
    isOperationWorkflowOwnerEventDrivenWorkflowProgressBoundary(snapshot) ===
      true &&
    targetVisibilityState ===
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL;
}

function isOperationWorkflowOwnerTargetPhaseProgressWait(snapshot) {
  return OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_PHASES.has(
    snapshot?.actuation?.workflowProgressPhaseId,
  ) &&
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_PHASES.has(
      snapshot?.progress?.workflowProgressPhaseId,
    ) &&
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_ACTIONS.has(
      snapshot?.progress?.nextRequiredAction,
    ) &&
    isOperationWorkflowOwnerEventDrivenWorkflowProgressBoundary(snapshot) ===
      true;
}

function isOperationWorkflowOwnerSourceRemovalProgressWait(snapshot) {
  return OPERATION_WORKFLOW_OWNER_SOURCE_REMOVAL_PROGRESS_PHASES.has(
    snapshot?.actuation?.workflowProgressPhaseId,
  ) &&
    OPERATION_WORKFLOW_OWNER_SOURCE_REMOVAL_PROGRESS_PHASES.has(
      snapshot?.progress?.workflowProgressPhaseId,
    ) &&
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_ACTIONS.has(
      snapshot?.progress?.nextRequiredAction,
    ) &&
    isOperationWorkflowOwnerEventDrivenWorkflowProgressBoundary(snapshot) ===
      true;
}

function isOperationWorkflowOwnerProgressOwnedByOperationWorkflow(snapshot) {
  return snapshot?.actuation?.owner ===
    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    snapshot?.progress?.currentOwner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER;
}

function isOperationWorkflowOwnerTargetProgressWaitEligible(
  snapshot,
  representativeRerunRoute,
  dispatchPendingTargetProgressWait,
  sourceRemovalProgressWait,
) {
  return representativeRerunRoute !==
    OPERATION_WORKFLOW_OWNER_REPRESENTATIVE_RERUN_ROUTE.BLOCKED_MODEL_ROUTE && (
    isOperationWorkflowOwnerTargetPhaseProgressWait(snapshot) === true ||
    dispatchPendingTargetProgressWait === true ||
    sourceRemovalProgressWait === true
  );
}

function isOperationWorkflowOwnerTargetServiceTerminalOrReady(
  snapshot,
  operation,
  dispatchPendingTargetProgressWait,
  targetSyncActiveProgressWait,
  sourceRemovalProgressWait,
) {
  return snapshot?.coordinator?.operation?.targetServiceTerminalState ===
    PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL ||
    operation?.targetServiceTerminalState ===
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL ||
    dispatchPendingTargetProgressWait === true ||
    targetSyncActiveProgressWait === true ||
    sourceRemovalProgressWait === true;
}

function isOperationWorkflowOwnerRemoteOwnerAvailable(
  owner,
  operation,
  ownerNodeId,
) {
  const ownerNodeKnown =
    typeof ownerNodeId === typeof OPERATION_WORKFLOW_OWNER_EMPTY_TEXT &&
    ownerNodeId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length &&
    ownerNodeId !== owner.nodeId;
  // Remote owners that are no longer repair-eligible must not be woken.
  const ownerUnavailable =
    typeof owner.isPriorityRecoveryDrainOwnerUnavailable ===
      OPERATION_WORKFLOW_OWNER_FUNCTION_TYPE &&
    owner.isPriorityRecoveryDrainOwnerUnavailable(ownerNodeId, operation);
  return ownerNodeKnown === true && ownerUnavailable !== true;
}

function hasActiveOperationWorkflowOwnerTargetProgressHandoffRetry(
  owner,
  operation,
) {
  const operationId =
    normalizeOperationWorkflowOwnerTargetProgressOperationId(operation);
  return Boolean(operationId) &&
    (
      owner.hasActiveCreatedOperationHandoffRetry(operationId) === true ||
      (
        typeof owner.hasActiveOperationDispatchDeferredRetry ===
          OPERATION_WORKFLOW_OWNER_FUNCTION_TYPE &&
        owner.hasActiveOperationDispatchDeferredRetry(operationId) === true
      )
    );
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
  const targetSyncActiveProgressWait =
    isOperationWorkflowOwnerTargetSyncActiveProgressReady(
      snapshot,
      targetVisibilityState,
    );
  const sourceRemovalProgressWait =
    isOperationWorkflowOwnerSourceRemovalProgressWait(snapshot);
  const representativeRerunRoute =
    snapshot?.progressContract?.representativeRerunRoute ||
    snapshot?.progress?.progressContract?.representativeRerunRoute ||
    OPERATION_WORKFLOW_OWNER_REPRESENTATIVE_RERUN_ROUTE.ELIGIBLE;
  return Object.freeze({
    operationAvailable: Boolean(operationId),
    operationWorkflowOwner:
      isOperationWorkflowOwnerProgressOwnedByOperationWorkflow(snapshot),
    targetProgressWait: isOperationWorkflowOwnerTargetProgressWaitEligible(
      snapshot,
      representativeRerunRoute,
      dispatchPendingTargetProgressWait,
      sourceRemovalProgressWait,
    ),
    targetServiceTerminal: isOperationWorkflowOwnerTargetServiceTerminalOrReady(
      snapshot,
      operation,
      dispatchPendingTargetProgressWait,
      targetSyncActiveProgressWait,
      sourceRemovalProgressWait,
    ),
    locallyOwned: owner.repository.isOperationLocallyOwned(operation),
    remoteOwnerAvailable: isOperationWorkflowOwnerRemoteOwnerAvailable(
      owner,
      operation,
      ownerNodeId,
    ),
    rebalancerHandoffRetryActive:
      hasActiveOperationWorkflowOwnerTargetProgressHandoffRetry(
        owner,
        operation,
      ),
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

function shouldNormalizeOperationWorkflowOwnerTargetProgressHandoffRetry(
  owner,
  snapshot,
  operation,
) {
  const evidence = buildOperationWorkflowOwnerTargetProgressReentryEvidence(
    owner,
    snapshot,
    operation,
  );
  return resolveOperationWorkflowOwnerTargetProgressReentryState(evidence) ===
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_STATE
      .REBALANCER_HANDOFF_RETRY_ACTIVE;
}

function buildOperationWorkflowOwnerTargetProgressOwnerOutcome(
  operation,
  action,
) {
  const outcome =
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_BY_ACTION.get(action);
  if (!outcome) {
    return OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_UNAVAILABLE;
  }
  const operationId =
    normalizeOperationWorkflowOwnerTargetProgressOperationId(operation);
  return Object.freeze({
    state: OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_STATE.AVAILABLE,
    ownerOutcome: Object.freeze({
      owner: OPERATION_WORKFLOW_OWNER,
      boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
      state: outcome.outcome,
      outcome: outcome.outcome,
      nextRequiredAction: outcome.outcome,
      effectCommand: outcome.effectCommand,
      correlationKey: operationId,
      sourceRevision: operation?.updatedAt || operation?.createdAt || null,
    }),
  });
}

// Stall-scoped guard (mirrors the 3aad7631 spread un-mask contract): a
// source-removal-phase snapshot that still carries the optimistic
// spread_satisfied_in_flight certification is, by the spread classifier's
// stall discriminator (isReplaceRemoveDispatchSpreadStalled: voter-ready or
// within the 60s grace window), NOT stalled — the owner-outcome rewrite must
// not strip that certification by re-deriving semanticState. A stalled op is
// un-masked upstream (it never classifies spread_satisfied_in_flight), so it
// still normalizes and re-drives. An active rebalancer handoff retry keeps
// normalizing (that route predates the source-removal progress contract and
// its retry-scheduled surface must stay exposed).
function isOperationWorkflowOwnerSpreadCertifiedSourceRemovalProgressWait(
  snapshot,
) {
  return isOperationWorkflowOwnerSourceRemovalProgressWait(snapshot) ===
    true &&
    snapshot?.semanticState ===
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
}

function normalizeOperationWorkflowOwnerTargetProgressOwnerSnapshot(
  owner,
  snapshot,
  operation,
) {
  const handoffRetryActive =
    shouldNormalizeOperationWorkflowOwnerTargetProgressHandoffRetry(
      owner,
      snapshot,
      operation,
    );
  if (
    handoffRetryActive !== true &&
    isOperationWorkflowOwnerSpreadCertifiedSourceRemovalProgressWait(snapshot)
  ) {
    return snapshot;
  }
  const action = handoffRetryActive ?
    OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
      .RETRY_AFTER_OWNER_LANE :
    resolveOperationWorkflowOwnerTargetProgressReentryAction(
      owner,
      snapshot,
      operation,
    );
  const ownerOutcomeResult =
    buildOperationWorkflowOwnerTargetProgressOwnerOutcome(operation, action);
  if (
    ownerOutcomeResult.state !==
      OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_OUTCOME_STATE.AVAILABLE
  ) {
    return snapshot;
  }
  return normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
    snapshot,
    ownerOutcomeResult.ownerOutcome,
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
  OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION,
  applyOperationWorkflowOwnerTargetProgressReentryAction,
  isOperationWorkflowOwnerDispatchPendingTargetProgressReady,
  normalizeOperationWorkflowOwnerTargetProgressOwnerSnapshot,
  resolveOperationWorkflowOwnerTargetProgressReentryAction,
  shouldNormalizeOperationWorkflowOwnerTargetProgressHandoffRetry,
};
