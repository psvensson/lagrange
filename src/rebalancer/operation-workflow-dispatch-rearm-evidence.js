import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  buildOperationOwnerRetryOutcome,
} from './topology-owner-constants.js';
import {
  deferTransitionRetry,
  handleDeferredTransitionRetryFailure,
  resumeDeferredTransitionOperation,
} from './operation-workflow-transition-retry.js';
const {
  DISPATCH_RETRY_DELAY_MS,
  NUM,
  OPERATION_OWNER_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaStatus,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  TIMEOUT_BUDGET_DEFAULT,
  TYPEOF,
  WORKFLOW_STEP,
  getControlPlaneRetryAfterMs,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;
const DISPATCH_REARM_RECONCILE_BLOCKING_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.FAILED,
  ]),
);
const DISPATCH_REARM_RECONCILE_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  CREATING_WITHOUT_CREATE_REARM: 'creating_without_create_rearm',
  CREATE_REARM_TARGET_STILL_CREATING: 'create_rearm_target_still_creating',
  OBSERVED_BLOCKING_STATUS: 'observed_blocking_status',
  NON_DISPATCH_RETRYABLE_STEP: 'non_dispatch_retryable_step',
  NON_PRIORITY_RECOVERY_PARTITION: 'non_priority_recovery_partition',
  DISPATCH_REARM_BUDGET_EXHAUSTED: 'dispatch_rearm_budget_exhausted',
  REARM_DISPATCH: 'rearm_dispatch',
});
const DISPATCH_REARM_RECONCILE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.CREATING_WITHOUT_CREATE_REARM,
    matches: (evidence) =>
      evidence.observedCreatingWithoutCreateRearm === true,
  }),
  Object.freeze({
    state:
      DISPATCH_REARM_RECONCILE_STATE.CREATE_REARM_TARGET_STILL_CREATING,
    matches: (evidence) =>
      evidence.createRearmTargetStillCreating === true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.OBSERVED_BLOCKING_STATUS,
    matches: (evidence) => evidence.observedBlockingStatus === true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.NON_DISPATCH_RETRYABLE_STEP,
    matches: (evidence) =>
      evidence.dispatchRetryableWorkflowStep !== true,
  }),
  Object.freeze({
    state:
      DISPATCH_REARM_RECONCILE_STATE.NON_PRIORITY_RECOVERY_PARTITION,
    matches: (evidence) => evidence.priorityRecoveryPartition !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.DISPATCH_REARM_BUDGET_EXHAUSTED,
    matches: (evidence) => evidence.dispatchRearmBudgetAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_REARM_RECONCILE_STATE.REARM_DISPATCH,
    matches: () => true,
  }),
]);
const DISPATCH_REARM_RECONCILE_ALLOWED_STATES = Object.freeze(
  new Set([
    DISPATCH_REARM_RECONCILE_STATE.REARM_DISPATCH,
  ]),
);
function resolveTransitionRetryGraceTimeoutCeilingMs(
  owner,
  retryContext,
  workflowStep,
  durableProgressAtMs,
  stepTimeout,
) {
  return owner.transitionRetryGrace.resolveTimeoutCeilingMs(
    retryContext,
    workflowStep,
    durableProgressAtMs,
    stepTimeout,
  );
}
function shouldUseOperationBudgetTransitionRetryGrace(
  owner,
  retryContext,
  workflowStep,
) {
  return owner.transitionRetryGrace.usesOperationBudget(
    retryContext,
    workflowStep,
  );
}
function hasActiveTransitionRetryGrace(owner, operationId, now = Date.now()) {
  return owner.transitionRetryGrace.isActive(operationId, now);
}
function isOperationDeferredRetryActive(owner, operationId) {
  return (
    Boolean(operationId) &&
    (
      owner.dispatchRetryTimerByOperationId.has(operationId) ||
      owner.transitionRetryTimerByOperationId.has(operationId) ||
      owner.hasActiveTransitionRetryGrace(operationId)
    )
  );
}
function shouldDeferRetryableDispatchFailure(owner, operation, errorLike) {
  if (!operation || !isRetryableControlPlaneError(errorLike)) {
    return false;
  }
  return owner.isCriticalSystemPartition(operation.partitionId);
}
function isDispatchRetryableWorkflowStep(owner, operation) {
  if (!operation) {
    return false;
  }
  const workflowStep = operation.workflowStep || operation.workflow_step;
  if (owner.repository.isReplaceRemoveDispatchPhase(operation)) {
    return (
      workflowStep === WORKFLOW_STEP.ACTIVE ||
      workflowStep === WORKFLOW_STEP.STOPPING
    );
  }
  if (
    operation.type === OperationType.REMOVE &&
    workflowStep === WORKFLOW_STEP.STOPPING
  ) {
    return true;
  }
  if (owner.isCreateRearmDispatchPhase(operation)) {
    return true;
  }
  return (
    workflowStep === WORKFLOW_STEP.PENDING ||
    workflowStep === WORKFLOW_STEP.SENDING
  );
}
function isCreateRearmDispatchPhase(owner, operation) {
  if (!operation || !owner.isCriticalSystemPartition(operation.partitionId)) {
    return false;
  }
  if (operation.workflowStep !== WORKFLOW_STEP.CREATING) {
    return false;
  }
  if (owner.repository.isReplaceRemoveDispatchPhase(operation)) {
    return false;
  }
  return (
    operation.type === OperationType.ADD ||
    operation.type === OperationType.REPLACE
  );
}
function isRemoveInitialDispatchPhase(operation) {
  return (
    operation?.type === OperationType.REMOVE &&
    (operation?.workflowStep === WORKFLOW_STEP.PENDING ||
      operation?.workflowStep === WORKFLOW_STEP.SENDING)
  );
}
function isSafetyDeferredRetryableOperation(owner, operation) {
  if (!operation) {
    return false;
  }
  return (
    owner.isRemoveInitialDispatchPhase(operation) ||
    owner.repository.isReplaceRemoveDispatchPhase(operation)
  );
}
function buildDispatchRearmFromProgressReconcileEvidence(
  owner,
  operation,
  actualStatus,
  options = {},
) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const normalizedActualStatus =
    typeof actualStatus === TYPEOF.STRING ?
      actualStatus.toLowerCase() :
      actualStatus;
  const createRearmPhase = owner.isCreateRearmDispatchPhase(operation);
  const timeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(operation, now);
  return Object.freeze({
    operationAvailable: Boolean(operation),
    observedCreatingWithoutCreateRearm:
      normalizedActualStatus === ReplicaStatus.CREATING &&
      !createRearmPhase,
    createRearmTargetStillCreating:
      normalizedActualStatus === ReplicaStatus.CREATING &&
      createRearmPhase === true,
    observedBlockingStatus:
      !(
        normalizedActualStatus === ReplicaStatus.PENDING &&
        operation?.workflowStep === WORKFLOW_STEP.PENDING
      ) &&
      DISPATCH_REARM_RECONCILE_BLOCKING_STATUSES.has(
        normalizedActualStatus,
      ),
    dispatchRetryableWorkflowStep:
      owner.isDispatchRetryableWorkflowStep(operation),
    priorityRecoveryPartition:
      owner.isCriticalSystemPartition(operation?.partitionId || null) ||
      isPriorityControlPlanePartition({
        partitionId: operation?.partitionId || null,
      }),
    dispatchRearmBudgetAvailable:
      timeoutDecision.stepTimedOut !== true ||
      timeoutDecision.operationBudgetActive === true,
  });
}
function resolveOperationStartedAtMs(operation) {
  if (Number.isFinite(operation?.createdAt)) {
    return operation.createdAt;
  }
  if (Number.isFinite(operation?.createdAtMs)) {
    return operation.createdAtMs;
  }
  if (Number.isFinite(operation?.updatedAt)) {
    return operation.updatedAt;
  }
  if (Number.isFinite(operation?.updatedAtMs)) {
    return operation.updatedAtMs;
  }
  return null;
}

function isOperationWithinRetryBudget(operation, now = Date.now()) {
  const operationStartedAtMs = resolveOperationStartedAtMs(operation);
  if (!Number.isFinite(operationStartedAtMs)) {
    return false;
  }
  return (
    now <
    operationStartedAtMs +
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS
  );
}

function isProtectedCreateDispatchRetryBudgetActive(
  owner,
  operation,
  now = Date.now(),
) {
  const operationId = operation?.operationId || null;
  if (
    !operationId ||
    !owner.isCreateRearmDispatchPhase(operation) ||
    !owner.dispatchRetryTimerByOperationId?.has(operationId)
  ) {
    return false;
  }
  return isOperationWithinRetryBudget(operation, now);
}

// When a deferred owner retry timer fires during a transient uninitialized
// window (e.g. mid rolling-restart re-init) the node is not shutting down, so
// the deferred work must not be dropped. Re-arm the timer (bounded by the
// operation budget) instead of silently aborting, mirroring the transition-retry
// precedent (operation-workflow-transition-retry.js). A genuine shutdown is
// still aborted by the caller before reaching these helpers.
function logDeferredRetryRearmDropped(owner, operation, retryKind) {
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_REARM_DROPPED,
    {
      operationId: operation?.operationId || null,
      partitionId: operation?.partitionId || null,
      workflowStep: operation?.workflowStep || null,
      retryKind,
    },
  );
}

function rearmDispatchRetryWhileUninitialized(owner, operation, errorLike) {
  if (
    owner.isDispatchRetryableWorkflowStep(operation) !== true ||
    !isOperationWithinRetryBudget(operation)
  ) {
    logDeferredRetryRearmDropped(owner, operation, 'dispatch_retry');
    return false;
  }
  return owner.deferDispatchRetry(operation, errorLike);
}

function rearmSafetyDeferredRetryWhileUninitialized(
  owner,
  operation,
  deferReason,
  errorMessage,
) {
  if (
    owner.isSafetyDeferredRetryableOperation(operation) !== true ||
    !isOperationWithinRetryBudget(operation)
  ) {
    logDeferredRetryRearmDropped(owner, operation, 'safety_retry');
    return false;
  }
  return owner.scheduleDeferredSafetyRetry(operation, deferReason, errorMessage);
}
function resolveDispatchRearmFromProgressReconcileState(evidence) {
  return (
    DISPATCH_REARM_RECONCILE_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    DISPATCH_REARM_RECONCILE_STATE.DISPATCH_REARM_BUDGET_EXHAUSTED
  );
}
function shouldRearmDispatchFromProgressReconcile(
  owner,
  operation,
  actualStatus,
  options = {},
) {
  const evidence = owner.buildDispatchRearmFromProgressReconcileEvidence(
    operation,
    actualStatus,
    options,
  );
  const state = owner.resolveDispatchRearmFromProgressReconcileState(evidence);
  return DISPATCH_REARM_RECONCILE_ALLOWED_STATES.has(state);
}
function deferDispatchRetry(owner, operation, errorLike) {
  const operationId = operation?.operationId || null;
  const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
  const retryOutcome = buildOperationOwnerRetryOutcome({
    operationId,
    retryable: owner.shouldDeferRetryableDispatchFailure(
      operation,
      errorLike,
    ),
    timerActive: owner.dispatchRetryTimerByOperationId.has(operationId),
    retryAfterMs,
    fallbackDelayMs: DISPATCH_RETRY_DELAY_MS,
    retryKind: OPERATION_OWNER_RETRY_KIND.DISPATCH,
  });
  if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REJECT) {
    return false;
  }
  if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER) {
    return true;
  }
  const delayMs = retryOutcome.delayMs;
  const errorMessage = owner.normalizeErrorMessage(
    errorLike,
    REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
  );
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
    {
      operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      workflowStep: operation.workflowStep,
      delayMs,
      errorMessage,
    },
  );
  const timerHandle = owner.setTimeoutFn(() => {
    owner.dispatchRetryTimerByOperationId.delete(operationId);
    if (owner.isShuttingDown) {
      return;
    }
    if (!owner.isInitialized) {
      rearmDispatchRetryWhileUninitialized(owner, operation, errorLike);
      return;
    }
    return owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(operationId),
      async () => {
        const currentOperation =
          await owner.getDeferredDispatchRetryOperation(
            operationId,
            operation,
          );
        if (
          !currentOperation ||
          owner.repository.isOperationTerminal(currentOperation) ||
          !owner.repository.isOperationLocallyOwned(currentOperation) ||
          !owner.isDispatchRetryableWorkflowStep(currentOperation)
        ) {
          return;
        }
        await owner.runOperationOwnerAction(
          OPERATION_OWNER_ACTION.DISPATCH,
          currentOperation,
          {
            boundary: 'dispatch_retry',
            cause:
              OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_OPERATION_DISPATCH,
            workflowStep: currentOperation.workflowStep || null,
            partitionId: currentOperation.partitionId || null,
            runInlineWhenOwnerLaneHeld: true,
          },
        );
      },
    ).catch((retryError) => {
      owner.handleDeferredDispatchRetryFailure(operation, retryError);
    });
  }, delayMs);
  owner.dispatchRetryTimerByOperationId.set(operationId, timerHandle);
  return true;
}
async function getDeferredDispatchRetryOperation(
  owner,
  operationId,
  fallbackOperation = null,
) {
  const visibilityObservation =
    await owner.repository.getOperationByIdVisibilityObservation(operationId, {
      requireOwnerRpcRead: false,
      allowPriorityRecoveryDeferredVisibility: true,
      allowOwnerPersistedTransitionDeferredVisibility: false,
    });
  return owner.resolveDeferredRetryVisibleOperation(
    visibilityObservation,
    fallbackOperation,
  );
}
function resolveDeferredRetryVisibleOperation(
  owner,
  visibilityObservation,
  fallbackOperation,
) {
  if (visibilityObservation?.operation) {
    return visibilityObservation.operation;
  }
  if (visibilityObservation?.deferredOutcome && fallbackOperation) {
    return owner.cloneOperationSnapshot(fallbackOperation);
  }
  return null;
}
function handleDeferredDispatchRetryFailure(owner, operation, error) {
  if (owner.deferDispatchRetry(operation, error)) {
    return;
  }
  if (
    owner.deferTransitionRetry(operation?.operationId || null, error, {
      boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_RETRY,
      partitionId: operation?.partitionId || null,
      workflowStep: operation?.workflowStep || null,
      updatedAt: operation?.updatedAt,
      createdAt: operation?.createdAt,
    })
  ) {
    return;
  }
  owner.logger.error(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
    {
      operationId: operation?.operationId || null,
      partitionId: operation?.partitionId || null,
      workflowStep: operation?.workflowStep || null,
      error: error?.message || error?.error || String(error),
    },
  );
}
function scheduleDeferredSafetyRetry(owner, operation, deferReason, errorMessage) {
  const operationId = operation?.operationId || null;
  if (!operationId || !owner.isSafetyDeferredRetryableOperation(operation)) {
    return false;
  }
  if (owner.safetyDeferredRetryTimerByOperationId.has(operationId)) {
    return true;
  }
  owner.logger.info(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
    {
      operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      workflowStep: operation.workflowStep,
      delayMs: SAFETY_DEFERRED_RETRY_DELAY_MS,
      deferReason,
      errorMessage,
    },
  );
  const timerHandle = owner.setTimeoutFn(() => {
    owner.safetyDeferredRetryTimerByOperationId.delete(operationId);
    if (owner.isShuttingDown) {
      return;
    }
    if (!owner.isInitialized) {
      rearmSafetyDeferredRetryWhileUninitialized(
        owner,
        operation,
        deferReason,
        errorMessage,
      );
      return;
    }
    return owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(operationId),
      async () => {
        const visibilityObservation =
          await owner.repository.getOperationByIdVisibilityObservation(
            operationId,
            {
              requireOwnerRpcRead: false,
              allowPriorityRecoveryDeferredVisibility: true,
            },
          );
        const currentOperation = owner.resolveDeferredRetryVisibleOperation(
          visibilityObservation,
          operation,
        );
        if (
          !currentOperation ||
          owner.repository.isOperationTerminal(currentOperation) ||
          !owner.repository.isOperationLocallyOwned(currentOperation) ||
          !owner.isSafetyDeferredRetryableOperation(currentOperation)
        ) {
          return;
        }
        await owner.runOperationOwnerAction(
          OPERATION_OWNER_ACTION.EXECUTE,
          currentOperation,
          {
            boundary: 'safety_retry',
            workflowStep: currentOperation.workflowStep || null,
            partitionId: currentOperation.partitionId || null,
            runInlineWhenOwnerLaneHeld: true,
          },
        );
      },
    ).catch((retryError) => {
      if (
        owner.deferTransitionRetry(operationId, retryError, {
          boundary: 'safety_retry',
          partitionId: operation?.partitionId || null,
          workflowStep: operation?.workflowStep || null,
          updatedAt: operation?.updatedAt,
          createdAt: operation?.createdAt,
          operationSnapshot: operation,
        })
      ) {
        return;
      }
      owner.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
        {
          operationId,
          partitionId: operation?.partitionId || null,
          workflowStep: operation?.workflowStep || null,
          deferReason,
          error:
            retryError?.message || retryError?.error || String(retryError),
        },
      );
    });
  }, SAFETY_DEFERRED_RETRY_DELAY_MS);
  owner.safetyDeferredRetryTimerByOperationId.set(operationId, timerHandle);
  return true;
}
function isOperationStepTimedOut(owner, operation, now = Date.now()) {
  if (!operation) {
    return false;
  }
  if (owner.hasActiveTransitionRetryGrace(operation.operationId, now)) {
    return false;
  }
  if (owner.isProtectedCreateDispatchRetryBudgetActive(operation, now)) {
    return false;
  }
  const updatedAt = Number(operation.updatedAt ?? operation.updatedAtMs);
  if (!Number.isFinite(updatedAt)) {
    return false;
  }
  return (
    now - updatedAt >=
    owner.getTimeoutForStep(operation.workflowStep, operation)
  );
}
function cloneOperationSnapshot(operation) {
  if (!operation || typeof operation !== TYPEOF.OBJECT) {
    return null;
  }
  return {
    ...operation,
    stepsHistory: Array.isArray(operation.stepsHistory) ?
      [...operation.stepsHistory] :
      [],
  };
}
function resolveCoordinatorCreatedOperationOwnerNodeId(owner, operation) {
  if (
    !operation ||
    typeof owner.repository?.resolveOperationOwnerNodeId !== TYPEOF.FUNCTION
  ) {
    return null;
  }
  return owner.repository.resolveOperationOwnerNodeId(operation);
}
function isCoordinatorCreatedOperationLocallyOwned(owner, operation) {
  const ownerNodeId =
    owner.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
  return (
    typeof ownerNodeId === TYPEOF.STRING &&
    ownerNodeId.length > NUM.ZERO &&
    ownerNodeId === owner.nodeId
  );
}
function buildCoordinatorCreatedDispatchIngress(nodeId) {
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedNodeId.length === NUM.ZERO) {
    return null;
  }
  return `${normalizedNodeId}/service/replica-dispatch`;
}
function buildCoordinatorCreatedDispatchRow(operation) {
  let stepsHistory = operation?.stepsHistory;
  if (typeof stepsHistory !== TYPEOF.STRING) {
    stepsHistory = Array.isArray(stepsHistory) ?
      JSON.stringify(stepsHistory) :
      OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_JSON_ARRAY;
  }
  return {
    operation_id: operation?.operationId || null,
    type: operation?.type || null,
    partition_id: operation?.partitionId || null,
    replica_id: operation?.replicaId,
    source_node_id: operation?.sourceNodeId,
    target_node_id: operation?.targetNodeId,
    status: operation?.status,
    workflow_step: operation?.workflowStep || null,
    created_at: operation?.createdAt,
    updated_at: operation?.updatedAt,
    completed_at: operation?.completedAt,
    error_message: operation?.errorMessage,
    steps_history: stepsHistory,
    entity_type: operation?.entityType,
    entity_id: operation?.entityId,
  };
}
function shouldRetryCoordinatorCreatedRemoteHandoff(owner, operation) {
  const partitionId = operation?.partitionId || null;
  return (
    owner.isCriticalSystemPartition(partitionId) ||
    isPriorityControlPlanePartition({partitionId})
  );
}
function buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
  owner,
  operation,
  now = Date.now(),
) {
  const workflowStep = operation?.workflowStep || WORKFLOW_STEP.PENDING;
  const stepTimedOut =
    owner.isDispatchRetryableWorkflowStep(operation) &&
    owner.isOperationStepTimedOut(operation, now);
  const operationStartedAtMs = Number.isFinite(operation?.createdAt) ?
    operation.createdAt :
    Number.isFinite(operation?.createdAtMs) ?
      operation.createdAtMs :
      Number.isFinite(operation?.updatedAt) ?
        operation.updatedAt :
        Number.isFinite(operation?.updatedAtMs) ?
          operation.updatedAtMs :
          null;
  const usesOperationBudget =
    owner.shouldUseOperationBudgetTransitionRetryGrace(
      {
        partitionId: operation?.partitionId || null,
        workflowStep,
        updatedAt: operation?.updatedAt ?? operation?.updatedAtMs,
        createdAt: operation?.createdAt ?? operation?.createdAtMs,
      },
      workflowStep,
    );
  const operationBudgetDeadlineMs =
    Number.isFinite(operationStartedAtMs) ?
      operationStartedAtMs +
        TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS :
      null;
  const operationBudgetActive =
    owner.isProtectedCreateDispatchRetryBudgetActive(operation, now) ||
    usesOperationBudget &&
    Number.isFinite(operationBudgetDeadlineMs) &&
    now < operationBudgetDeadlineMs;
  return Object.freeze({
    shouldStop: stepTimedOut && !operationBudgetActive,
    stepTimedOut,
    operationBudgetActive,
    operationBudgetDeadlineMs,
    workflowStep,
  });
}
function canContinueCoordinatorCreatedRemoteHandoff(
  owner,
  operation,
  delayMs,
) {
  const operationId = operation?.operationId || null;
  if (!operationId) {
    return false;
  }
  owner.recordTransitionRetryGrace(
    operationId,
    {
      boundary:
        OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
      partitionId: operation?.partitionId,
      workflowStep: operation?.workflowStep,
      updatedAt: operation?.updatedAt,
      createdAt: operation?.createdAt,
    },
    delayMs,
  );
  return owner.hasActiveTransitionRetryGrace(operationId);
}
function scheduleCoordinatorCreatedRemoteHandoffFollowUp(
  owner,
  operation,
  delayMs,
  options = {},
) {
  const operationId = operation?.operationId || null;
  if (
    !operationId ||
    !owner.shouldRetryCoordinatorCreatedRemoteHandoff(operation) ||
    !owner.canContinueCoordinatorCreatedRemoteHandoff(operation, delayMs)
  ) {
    return false;
  }
  const replaceExisting = options.replaceExisting === true;
  if (owner.hasActiveCreatedOperationHandoffRetry(operationId)) {
    if (!replaceExisting) {
      return true;
    }
    owner.clearCreatedOperationHandoffRetry(operationId);
  }
  const operationSnapshot = owner.cloneOperationSnapshot(operation) || {
    operationId,
  };
  const timerHandle = owner.setTimeoutFn(() => {
    owner.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
    owner.createdOperationHandoffRetryDeadlineMsByOperationId.delete(
      operationId,
    );
    if (owner.isShuttingDown) {
      return;
    }
    return owner.getDeferredDispatchRetryOperation(operationId, operationSnapshot)
      .then((currentOperation) => {
        if (
          !currentOperation ||
          owner.repository.isOperationTerminal(currentOperation) ||
          !owner.shouldRetryCoordinatorCreatedRemoteHandoff(currentOperation)
        ) {
          owner.clearCreatedOperationHandoffRetry(operationId);
          return false;
        }
        const handoffTimeoutDecision =
          owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
            currentOperation,
          );
        if (handoffTimeoutDecision.shouldStop) {
          owner.clearCreatedOperationHandoffRetry(operationId);
          return false;
        }
        return owner.wakeCoordinatorCreatedRemoteOwner(currentOperation);
      }).catch((retryError) => {
        owner.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
          operationSnapshot,
          retryError,
        );
      });
  }, delayMs);
  owner.createdOperationHandoffRetryTimerByOperationId.set(
    operationId,
    timerHandle,
  );
  owner.createdOperationHandoffRetryDeadlineMsByOperationId.set(
    operationId,
    Date.now() + delayMs,
  );
  const targetNodeId = operation?.targetNodeId || null;
  if (targetNodeId) {
    owner.createdOperationHandoffRetryTargetNodeByOperationId.set(
      operationId,
      targetNodeId,
    );
  }
  return true;
}
export {
  buildCoordinatorCreatedDispatchIngress,
  buildCoordinatorCreatedDispatchRow,
  buildCoordinatorCreatedRemoteHandoffTimeoutDecision,
  buildDispatchRearmFromProgressReconcileEvidence,
  canContinueCoordinatorCreatedRemoteHandoff,
  cloneOperationSnapshot,
  deferDispatchRetry,
  deferTransitionRetry,
  getDeferredDispatchRetryOperation,
  handleDeferredDispatchRetryFailure,
  handleDeferredTransitionRetryFailure,
  hasActiveTransitionRetryGrace,
  isCoordinatorCreatedOperationLocallyOwned,
  isCreateRearmDispatchPhase,
  isDispatchRetryableWorkflowStep,
  isOperationDeferredRetryActive,
  isOperationStepTimedOut,
  isProtectedCreateDispatchRetryBudgetActive,
  isRemoveInitialDispatchPhase,
  isSafetyDeferredRetryableOperation,
  resolveCoordinatorCreatedOperationOwnerNodeId,
  resolveDeferredRetryVisibleOperation,
  resolveDispatchRearmFromProgressReconcileState,
  resolveTransitionRetryGraceTimeoutCeilingMs,
  resumeDeferredTransitionOperation,
  scheduleCoordinatorCreatedRemoteHandoffFollowUp,
  scheduleDeferredSafetyRetry,
  shouldDeferRetryableDispatchFailure,
  shouldRearmDispatchFromProgressReconcile,
  shouldRetryCoordinatorCreatedRemoteHandoff,
  shouldUseOperationBudgetTransitionRetryGrace,
};
