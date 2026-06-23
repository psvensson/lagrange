import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION,
} from '../control-plane/priority-recovery-operation-owner-observation.js';
import {
  OPERATION_LIFECYCLE_STATE,
  OPERATION_PROGRESS_RETRY_STATE,
} from './operation-lifecycle.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
} from './operation-workflow-owner-ports.js';

const {
  NUM,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
  TRANSITION_RETRY_DELAY_MS,
  normalizeNodeIdList,
} = SHARED;

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  NOT_OWNER_ADVANCE: 'not_owner_advance',
  // Census rank-1 fix (default-off LAGRANGE_PR_ZOMBIE_REDRIVE): a persisted-but-never-
  // dispatched op whose phase resolved TERMINAL (split-context) past its step deadline.
  // Without this it falls through to NOT_DISPATCH_PENDING -> SKIP -> never re-armed.
  STALE_TERMINAL_REDRIVE: 'stale_terminal_redrive',
  NOT_DISPATCH_PENDING: 'not_dispatch_pending',
  NOT_DISPATCH_RETRYABLE: 'not_dispatch_retryable',
  OWNER_LANE_RETRY_REQUIRED: 'owner_lane_retry_required',
  OWNER_LANE_HELD: 'owner_lane_held',
  REMOTE_RETRY_ACTIVE: 'remote_retry_active',
  REENTER: 'reenter',
});

// Default-off flag for the census rank-1 zombie re-drive (un-strand a
// persisted_not_dispatched + terminal-phase + reconcile-due op). Opt-in until
// gate-validated, exactly like the other convergence levers.
const PRIORITY_RECOVERY_ZOMBIE_REDRIVE_FLAG = 'LAGRANGE_PR_ZOMBIE_REDRIVE';
function isPriorityRecoveryZombieRedriveEnabled() {
  return process.env[PRIORITY_RECOVERY_ZOMBIE_REDRIVE_FLAG] === 'true';
}

const PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD = Object.freeze({
  CONDITIONS: 'conditions',
  LATEST_OPERATION_STATUS: 'latestOperationStatus',
  LATEST_OPERATION_WORKFLOW_STEP: 'latestOperationWorkflowStep',
  LATEST_TIMELINE_STATUS: 'latestTimelineStatus',
  LATEST_TIMELINE_STEP: 'latestTimelineStep',
  STATUS: 'status',
  WORKFLOW_STEP: 'workflowStep',
});

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION = Object.freeze({
  SKIP: 'skip',
  ARM_NOW: 'arm_now',
  RETRY_AFTER_OWNER_LANE: 'retry_after_owner_lane',
  RECORD_REMOTE_RETRY_PROGRESS: 'record_remote_retry_progress',
});

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION_BY_STATE =
  Object.freeze(new Map([
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REENTER,
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.ARM_NOW,
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.STALE_TERMINAL_REDRIVE,
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.ARM_NOW,
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE
        .OWNER_LANE_RETRY_REQUIRED,
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
        .RETRY_AFTER_OWNER_LANE,
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REMOTE_RETRY_ACTIVE,
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
        .RECORD_REMOTE_RETRY_PROGRESS,
    ],
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTUATION_STATES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_COMPLETION_STATES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
      PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_PARTITION_IDS =
  Object.freeze(
    new Set([
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
      INITIAL_PARTITION_IDS[
        SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS
      ],
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.NOT_OWNER_ADVANCE,
    matches: (evidence) => evidence.ownerAdvance !== true,
  }),
  // Census rank-1: catch the persisted-not-dispatched + terminal-phase + reconcile-due
  // zombie BEFORE the NOT_DISPATCH_PENDING skip and route it to ARM_NOW. Owner-advance
  // already holds here (NOT_OWNER_ADVANCE matched first otherwise).
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.STALE_TERMINAL_REDRIVE,
    matches: (evidence) => evidence.staleTerminalDispatchable === true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.NOT_DISPATCH_PENDING,
    matches: (evidence) => evidence.dispatchPending !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.NOT_DISPATCH_RETRYABLE,
    matches: (evidence) => evidence.dispatchRetryable !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE
        .OWNER_LANE_RETRY_REQUIRED,
    matches: (evidence) =>
      evidence.ownerLaneHeld === true &&
      evidence.ownerLaneRetryAllowed === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.OWNER_LANE_HELD,
    matches: (evidence) => evidence.ownerLaneHeld === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REMOTE_RETRY_ACTIVE,
    matches: (evidence) => evidence.remoteRetryActive === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REENTER,
    matches: () => true,
  }),
]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_PROGRESS_STATES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_BOUNDARIES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_WAIT_MODES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_COMMAND =
  Object.freeze({
    ADVANCE_EXISTING_OPERATION: 'advance_existing_operation_command',
    RECONCILE_STALE_PROGRESS: 'reconcile_stale_progress_command',
    WAKE_REMOTE_OWNER: 'wake_remote_owner_command',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION =
  Object.freeze({
    ADVANCE_EXISTING_OPERATION: 'advance_existing_operation',
    ARM_OWNER: 'arm_owner',
    RECONCILE_STALE_PROGRESS: 'reconcile_stale_progress',
    SCHEDULE_REMOTE_HANDOFF_RETRY: 'schedule_remote_handoff_retry',
    WAKE_REMOTE_OWNER: 'wake_remote_owner',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION_BY_COMMAND =
  Object.freeze(new Map([
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_COMMAND
        .ADVANCE_EXISTING_OPERATION,
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .ADVANCE_EXISTING_OPERATION,
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_COMMAND
        .RECONCILE_STALE_PROGRESS,
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .RECONCILE_STALE_PROGRESS,
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_COMMAND
        .WAKE_REMOTE_OWNER,
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .WAKE_REMOTE_OWNER,
    ],
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_LOG_MESSAGE = Object.freeze({
  BYPASS_REENTRANT_SCHEDULING:
    'Bypassing re-entrant priority recovery dispatch scheduling',
  ERROR_DURING_REENTRY:
    'Error during priority recovery dispatch reentry',
});

function resolvePriorityRecoveryDispatchPendingDecisionSnapshotCapturedAt(
  decisionSnapshot,
) {
  const capturedAtMs = Number(
    decisionSnapshot?.observation?.provenance?.capturedAt ??
      decisionSnapshot?.capturedAt,
  );
  return Number.isFinite(capturedAtMs) ? capturedAtMs : null;
}

function applyPriorityRecoveryDispatchPendingAdvanceExistingOperationEffect(
  owner,
  operation,
  decisionSnapshot,
) {
  if (owner.repository.isOperationLocallyOwned(operation) === true) {
    return owner.armCoordinatorCreatedOperation(operation);
  }
  const operationId =
    operation?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
  if (
    owner.shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry(
      operation,
      decisionSnapshot,
    ) &&
    owner.hasActiveCreatedOperationHandoffRetry(operationId)
  ) {
    owner.clearCreatedOperationHandoffRetry(operationId);
  }
  const capturedAtMs =
    resolvePriorityRecoveryDispatchPendingDecisionSnapshotCapturedAt(
      decisionSnapshot,
    );
  return owner.operationWorkflowOwnerPorts.wakeRemoteOwner(operation, {
    nowMs: capturedAtMs ?? Date.now(),
  });
}

function shouldApplyPriorityRecoveryDispatchPendingOwnerEffectBeforeDrain(
  decisionSnapshot,
  options = {},
) {
  const operationOwnerObservation =
    decisionSnapshot?.operationOwnerObservation;
  return (
    options.executeOwnerObservationEffect !== false &&
    operationOwnerObservation?.effectCommand ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_COMMAND
        .ADVANCE_EXISTING_OPERATION &&
    operationOwnerObservation?.effectExecution ===
      PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION.NOT_EXECUTED
  );
}

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_HANDLER =
  Object.freeze(new Map([
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .ADVANCE_EXISTING_OPERATION,
      (owner, operation, decisionSnapshot) =>
        applyPriorityRecoveryDispatchPendingAdvanceExistingOperationEffect(
          owner,
          operation,
          decisionSnapshot,
        ),
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION.ARM_OWNER,
      (owner, operation) => owner.armCoordinatorCreatedOperation(operation),
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .RECONCILE_STALE_PROGRESS,
      (owner, operation) =>
        owner.operationWorkflowOwnerPorts.reconcileStaleProgress(operation),
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .SCHEDULE_REMOTE_HANDOFF_RETRY,
      (owner, operation) =>
        owner.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
          operation,
          TRANSITION_RETRY_DELAY_MS,
        ),
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION.WAKE_REMOTE_OWNER,
      (owner, operation) =>
        owner.operationWorkflowOwnerPorts.wakeRemoteOwner(operation),
    ],
  ]));

function selectPriorityRecoveryDispatchPendingReentryOperation(
  snapshot,
  operations = [],
) {
  const snapshotOperationId = String(
    snapshot?.coordinator?.operation?.operationId ||
      snapshot?.operationId ||
      OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
  ).trim();
  const operationRecords = Array.isArray(operations) ? operations : [];
  const matchingOperation = operationRecords.find((operation) => {
    return (
      operation &&
      typeof operation === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT &&
      operation.operationId === snapshotOperationId
    );
  });
  if (matchingOperation) {
    return matchingOperation;
  }
  const snapshotOperation = snapshot?.coordinator?.operation || null;
  if (
    !snapshotOperation ||
    typeof snapshotOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ||
    snapshotOperationId.length === NUM.ZERO
  ) {
    return null;
  }
  const snapshotConditions =
    snapshot?.[
      PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD.CONDITIONS
    ] || {};
  const workflowStep = String(
    snapshotOperation[
      PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD.WORKFLOW_STEP
    ] ||
      snapshotOperation[
        PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD
          .LATEST_TIMELINE_STEP
      ] ||
      snapshotConditions[
        PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD
          .LATEST_OPERATION_WORKFLOW_STEP
      ] ||
      OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
  ).trim();
  const status = String(
    snapshotOperation[
      PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD.STATUS
    ] ||
      snapshotOperation[
        PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD
          .LATEST_TIMELINE_STATUS
      ] ||
      snapshotConditions[
        PRIORITY_RECOVERY_DISPATCH_PENDING_SNAPSHOT_FIELD
          .LATEST_OPERATION_STATUS
      ] ||
      OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
  ).trim();
  return Object.freeze({
    ...snapshotOperation,
    operationId: snapshotOperationId,
    ...(workflowStep.length > NUM.ZERO ? {workflowStep} : {}),
    ...(status.length > NUM.ZERO ? {status} : {}),
    createdAt: snapshotOperation.createdAtMs,
    updatedAt: snapshotOperation.updatedAtMs,
    completedAt: snapshotOperation.completedAtMs,
  });
}

function buildPriorityRecoveryDispatchPendingReentryEvidence(
  owner,
  snapshot,
  operation,
  options = {},
) {
  const operationId = String(
    operation?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
  ).trim();
  const remoteRetryRefreshDue =
    owner.shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry(
      operation,
      snapshot,
    );
  return Object.freeze({
    operationAvailable:
      operation &&
      typeof operation === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT &&
      operationId.length > NUM.ZERO,
    ownerAdvance:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_PROGRESS_STATES.has(
        snapshot?.progress?.nextRequiredAction,
      ) &&
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_BOUNDARIES.has(
        snapshot?.progress?.blockingBoundary,
      ) &&
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_WAIT_MODES.has(
        snapshot?.progress?.waitMode,
      ),
    dispatchPending:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTUATION_STATES.has(
        snapshot?.actuation?.state,
      ) &&
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    // Census rank-1 (flag-gated): a re-driveable actuation state whose phase resolved
    // TERMINAL (split-context) and whose step deadline has passed (timeoutReconcileDue).
    // This is the zombie the DISPATCH_PENDING gate above silently drops.
    staleTerminalDispatchable:
      isPriorityRecoveryZombieRedriveEnabled() &&
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTUATION_STATES.has(
        snapshot?.actuation?.state,
      ) &&
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL &&
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL &&
      snapshot?.actuation?.timeoutReconcileDue === true &&
      // Backoff: once a handoff retry is already in flight for this op, stop
      // re-matching every reconcile cycle (mirrors remoteRetryActive suppression).
      owner.hasActiveCreatedOperationHandoffRetry(operationId) !== true,
    dispatchRetryable: owner.isDispatchRetryableWorkflowStep(operation),
    ownerLaneHeld: owner.isOperationOwnerLaneHeld(operationId),
    ownerLaneRetryAllowed: options.allowOwnerLaneRetry === true,
    remoteRetryActive:
      remoteRetryRefreshDue !== true &&
      !owner.repository.isOperationLocallyOwned(operation) &&
      owner.hasActiveCreatedOperationHandoffRetry(operationId),
    remoteRetryRefreshDue,
  });
}

function resolvePriorityRecoveryDispatchPendingReentryState(evidence) {
  return (
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.UNAVAILABLE
  );
}

function resolvePriorityRecoveryDispatchPendingReentryAction(
  owner,
  snapshot,
  operation,
  options = {},
) {
  const evidence =
    owner.buildPriorityRecoveryDispatchPendingReentryEvidence(
      snapshot,
      operation,
      options,
    );
  const state = owner.resolvePriorityRecoveryDispatchPendingReentryState(
    evidence,
  );
  return (
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION_BY_STATE.get(state) ||
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.SKIP
  );
}

function applyPriorityRecoveryDispatchPendingReentryAction(
  owner,
  operation,
  action,
  decisionSnapshot = null,
  options = {},
) {
  if (
    action ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.ARM_NOW
  ) {
    owner.applyPriorityRecoveryDispatchPendingOwnerProgress(
      operation,
      decisionSnapshot,
      options,
    ).catch((error) => {
      owner.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
        operation,
        error,
      );
    });
    return true;
  }
  if (
    action ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
      .RETRY_AFTER_OWNER_LANE
  ) {
    return owner.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
      operation,
      TRANSITION_RETRY_DELAY_MS,
    );
  }
  if (
    action ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
      .RECORD_REMOTE_RETRY_PROGRESS
  ) {
    const operationId = operation?.operationId || null;
    if (
      !operationId ||
      hasPriorityRecoveryDispatchPendingRemoteRetryProgress(
        owner,
        operation,
      )
    ) {
      return false;
    }
    owner._remoteRetryProgressLocks =
      owner._remoteRetryProgressLocks || new Set();
    if (owner._remoteRetryProgressLocks.has(operationId)) {
      return false;
    }
    owner._remoteRetryProgressLocks.add(operationId);
    owner.runOperationWorkflowOwnerAdapter(
      operation,
      {mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE},
    ).catch((error) => {
      owner.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
        operation,
        error,
      );
    }).finally(() => {
      owner._remoteRetryProgressLocks.delete(operationId);
    });
    return false;
  }
  return false;
}

function hasPriorityRecoveryDispatchPendingRemoteRetryProgress(
  owner,
  operation,
) {
  const operationId = operation?.operationId || null;
  const records =
    owner.operationProgressStore?.listOperationProgressRecords?.() || [];
  const progress = records.find((record) =>
    record.operationId === operationId,
  );
  return (
    progress?.state === OPERATION_LIFECYCLE_STATE.RETRY_PENDING &&
    progress?.retryState === OPERATION_PROGRESS_RETRY_STATE.RETRY_REQUESTED &&
    owner.hasActiveCreatedOperationHandoffRetry(operationId) === true
  );
}

async function applyPriorityRecoveryDispatchPendingOwnerProgress(
  owner,
  operation,
  decisionSnapshot,
  options = {},
) {
  if (
    shouldApplyPriorityRecoveryDispatchPendingOwnerEffectBeforeDrain(
      decisionSnapshot,
      options,
    )
  ) {
    return applyPriorityRecoveryDispatchPendingOwnerEffectOrArm(
      owner,
      operation,
      decisionSnapshot,
      options,
    );
  }
  if (
    owner.shouldReconcilePriorityRecoveryDispatchPendingDrain(
      decisionSnapshot,
    ) &&
    await owner.reconcilePriorityRecoveryDispatchPendingDrain(
      operation,
      decisionSnapshot,
    )
  ) {
    return true;
  }
  return applyPriorityRecoveryDispatchPendingOwnerEffectOrArm(
    owner,
    operation,
    decisionSnapshot,
    options,
  );
}

function buildPriorityRecoveryDispatchPendingDrainEvidence(decisionSnapshot) {
  return Object.freeze({
    completionAccepted:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_COMPLETION_STATES.has(
        decisionSnapshot?.completion?.state,
      ),
    persistedNotDispatched:
      decisionSnapshot?.actuation?.state ===
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    dispatchPending:
      decisionSnapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
      decisionSnapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    ownerProgressRequested:
      decisionSnapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OWNER_PROGRESS_STATES.has(
        decisionSnapshot?.progress?.nextRequiredAction,
      ),
    workflowProgressBoundary:
      decisionSnapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
      decisionSnapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    priorityDrainPartition:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_PARTITION_IDS.has(
        decisionSnapshot?.partitionId,
      ),
  });
}

function shouldReconcilePriorityRecoveryDispatchPendingDrain(
  owner,
  decisionSnapshot,
) {
  const evidence =
    owner.buildPriorityRecoveryDispatchPendingDrainEvidence(decisionSnapshot);
  return (
    evidence.completionAccepted === true &&
    evidence.persistedNotDispatched === true &&
    evidence.dispatchPending === true &&
    evidence.ownerProgressRequested === true &&
    evidence.workflowProgressBoundary === true &&
    evidence.priorityDrainPartition === true
  );
}

function shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry(
  owner,
  operation,
  decisionSnapshot,
) {
  if (
    !operation?.operationId ||
    owner.repository.isOperationLocallyOwned(operation) === true
  ) {
    return false;
  }
  const operationOwnerObservation =
    decisionSnapshot?.operationOwnerObservation;
  const stepAgeMs = Number(
    decisionSnapshot?.progress?.stepAgeMs ??
      decisionSnapshot?.actuation?.stepAgeMs,
  );
  const stepTimeoutMs = Number(
    decisionSnapshot?.progress?.stepTimeoutMs ??
      decisionSnapshot?.actuation?.stepTimeoutMs,
  );
  return (
    operationOwnerObservation?.effectExecution ===
      PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION.NOT_EXECUTED &&
    operationOwnerObservation?.effectCommand ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_COMMAND
        .ADVANCE_EXISTING_OPERATION &&
    decisionSnapshot?.actuation?.timeoutReconcileDue === true &&
    decisionSnapshot?.progress?.nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
    decisionSnapshot?.progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
    decisionSnapshot?.progress?.waitMode ===
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN &&
    decisionSnapshot?.actuation?.workflowProgressPhaseId ===
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
    decisionSnapshot?.progress?.workflowProgressPhaseId ===
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
    Number.isFinite(stepAgeMs) &&
    Number.isFinite(stepTimeoutMs) &&
    stepTimeoutMs > NUM.ZERO &&
    stepAgeMs >= stepTimeoutMs
  );
}

function buildPriorityRecoveryDispatchPendingDrainContext(decisionSnapshot) {
  return Object.freeze({
    decisionSnapshot,
    completion: decisionSnapshot?.completion || null,
    effectiveEligibleNodeIds: Object.freeze(normalizeNodeIdList(
      decisionSnapshot?.admission?.effectiveEligibleNodeIds,
    )),
    planningSnapshot: null,
    priorityPartitionSummary: null,
  });
}

async function buildPriorityRecoveryDispatchPendingDrainSnapshot(
  owner,
  operation,
  decisionSnapshot,
) {
  if (!owner.isPriorityRecoveryOperationDrainCandidate(operation)) {
    const action =
      PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
      ) || OPERATION_LIFECYCLE_ACTION.NOOP;
    const ownerState =
      owner.resolvePriorityRecoveryOperationDrainOwnerState(
        operation,
        action,
      );
    return Object.freeze({
      state: PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
      action,
      ownerState,
      ownerAction:
        owner.resolvePriorityRecoveryOperationDrainOwnerAction(ownerState),
      completionState:
        PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE,
    });
  }
  const priorityRecoveryContext =
    owner.buildPriorityRecoveryDispatchPendingDrainContext(decisionSnapshot);
  const completion =
    priorityRecoveryContext.completion ||
    null;
  const supersededTargetError =
    owner.resolvePriorityRecoveryRemoteSupersededTargetDrainError(
      operation,
      priorityRecoveryContext,
    );
  const supersededTargetState =
    supersededTargetError ?
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.SUPERSEDED_TARGET :
      null;
  const completionState =
    completion?.state ||
    PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE;
  const sourceSnapshot =
    supersededTargetState ?
      Object.freeze({
        state: PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED,
        sourceReplicaId: null,
        observationState: null,
        lifecycleStatus: null,
      }) :
      await owner.buildPriorityRecoveryOperationDrainSourceSnapshot(
        operation,
        completionState,
        priorityRecoveryContext,
      );
  const releaseEvidence =
    owner.buildPriorityRecoveryOperationDrainReleaseEvidence(
      operation,
      completion,
      sourceSnapshot,
    );
  const state =
    supersededTargetState ||
    owner.resolvePriorityRecoveryOperationDrainState(
      completion,
      sourceSnapshot,
      releaseEvidence,
      operation,
    );
  const action =
    PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(state) ||
    OPERATION_LIFECYCLE_ACTION.NOOP;
  const ownerState =
    owner.resolvePriorityRecoveryOperationDrainOwnerState(
      operation,
      action,
    );
  return Object.freeze({
    state,
    action,
    ownerState,
    ownerAction:
      owner.resolvePriorityRecoveryOperationDrainOwnerAction(ownerState),
    completionState,
    sourceState: sourceSnapshot.state,
    sourceReplicaId: sourceSnapshot.sourceReplicaId,
    sourceObservationState: sourceSnapshot.observationState,
    sourceLifecycleStatus: sourceSnapshot.lifecycleStatus,
    supersededTargetError,
  });
}

async function reconcilePriorityRecoveryDispatchPendingDrain(
  owner,
  operation,
  decisionSnapshot,
) {
  const drainSnapshot =
    await owner.buildPriorityRecoveryDispatchPendingDrainSnapshot(
      operation,
      decisionSnapshot,
    );
  return owner.reconcilePriorityRecoveryOperationDrain(
    operation,
    drainSnapshot,
  );
}

function schedulePriorityRecoveryDispatchPendingReentry(
  owner,
  snapshot,
  operations = [],
  options = {},
) {
  const operation =
    owner.selectPriorityRecoveryDispatchPendingReentryOperation(
      snapshot,
      operations,
    );
  if (!operation || !operation.operationId) {
    return false;
  }
  const immediateAction =
    owner.resolvePriorityRecoveryDispatchPendingReentryAction(
      snapshot,
      operation,
      options,
    );
  if (
    immediateAction ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.SKIP
  ) {
    return false;
  }
  if (
    immediateAction ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
      .RETRY_AFTER_OWNER_LANE
  ) {
    return owner.applyPriorityRecoveryDispatchPendingReentryAction(
      operation,
      immediateAction,
      snapshot,
      options,
    );
  }
  if (
    immediateAction ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
      .RECORD_REMOTE_RETRY_PROGRESS
  ) {
    return owner.applyPriorityRecoveryDispatchPendingReentryAction(
      operation,
      immediateAction,
      snapshot,
      options,
    );
  }
  const operationId = operation.operationId;
  owner._reentryLocks = owner._reentryLocks || new Set();
  if (owner._reentryLocks.has(operationId)) {
    owner.logger.debug(
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_LOG_MESSAGE
        .BYPASS_REENTRANT_SCHEDULING,
      {
        operationId,
        partitionId: operation.partitionId,
      },
    );
    return false;
  }
  owner._reentryLocks.add(operationId);

  setTimeout(() => {
    try {
      owner.applyPriorityRecoveryDispatchPendingReentryAction(
        operation,
        immediateAction,
        snapshot,
        options,
      );
    } catch (error) {
      owner.logger.error(
        PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_LOG_MESSAGE
          .ERROR_DURING_REENTRY,
        {
          operationId,
          error: error.message,
        },
      );
    } finally {
      owner._reentryLocks.delete(operationId);
    }
  }, NUM.ZERO);
  return true;
}

function resolvePriorityRecoveryDispatchPendingOwnerEffectAction(
  owner,
  operation,
  decisionSnapshot,
  options,
) {
  if (options.executeOwnerObservationEffect === false) {
    if (owner.repository.isOperationLocallyOwned(operation) !== true) {
      return PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .SCHEDULE_REMOTE_HANDOFF_RETRY;
    }
    return PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION.ARM_OWNER;
  }
  const operationOwnerObservation =
    decisionSnapshot?.operationOwnerObservation;
  const commandAction =
    PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION_BY_COMMAND.get(
      operationOwnerObservation?.effectCommand,
    );
  if (commandAction) {
    return commandAction;
  }
  return (
    !operationOwnerObservation &&
      owner.repository.isOperationLocallyOwned(operation) !== true ?
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION
        .WAKE_REMOTE_OWNER :
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_ACTION.ARM_OWNER
  );
}

function applyPriorityRecoveryDispatchPendingOwnerEffectOrArm(
  owner,
  operation,
  decisionSnapshot,
  options,
) {
  const action = resolvePriorityRecoveryDispatchPendingOwnerEffectAction(
    owner,
    operation,
    decisionSnapshot,
    options,
  );
  return PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_EFFECT_HANDLER.get(action)(
    owner,
    operation,
    decisionSnapshot,
  );
}

export {
  applyPriorityRecoveryDispatchPendingOwnerProgress,
  applyPriorityRecoveryDispatchPendingReentryAction,
  buildPriorityRecoveryDispatchPendingDrainContext,
  buildPriorityRecoveryDispatchPendingDrainEvidence,
  buildPriorityRecoveryDispatchPendingReentryEvidence,
  buildPriorityRecoveryDispatchPendingDrainSnapshot,
  hasPriorityRecoveryDispatchPendingRemoteRetryProgress,
  reconcilePriorityRecoveryDispatchPendingDrain,
  resolvePriorityRecoveryDispatchPendingReentryAction,
  resolvePriorityRecoveryDispatchPendingReentryState,
  schedulePriorityRecoveryDispatchPendingReentry,
  selectPriorityRecoveryDispatchPendingReentryOperation,
  shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry,
  shouldReconcilePriorityRecoveryDispatchPendingDrain,
};
