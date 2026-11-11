import {readOperationRecordWorkflowStep} from './replica-operation-progress.js';
import {CREATE_ADMISSION_ERROR_CODE} from '../node/replica-create-admission-owner.js';
import {readStateField} from '../utils/state-field-read.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {
  OPERATION_VISIBILITY_STATE,
  readOperationVisibilityState,
} from './replica-operation-repository-operation-visibility.js';
import {
  ReplicaOperationField,
  ReplicaOperationVisibilityClass,
} from './replica-operation-constants.js';
import {
  CREATE_REARM_DISPATCH_OPERATION_TYPES,
  DISPATCH_PENDING_WORKFLOW_STEPS,
  REMOVE_INITIAL_DISPATCH_WORKFLOW_STEPS,
  REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS,
  WORKFLOW_STEP_PROGRESS_RANK,
} from './replica-operation-step-policy.js';
import {
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  buildOperationOwnerRetryOutcome,
} from './topology-owner-constants.js';
const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  DISPATCH_RETRY_DELAY_MS,
  OPERATION_OWNER_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaStatus,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  TIMEOUT_BUDGET_DEFAULT,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  buildHandoffDeferralTransportDiagnostics,
  classifySystemPartition,
  getControlPlaneRetryAfterMs,
  isBootstrapTopologyDispatchDeferred,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;
const DISPATCH_RETRY_BOUNDARY = 'dispatch_retry';
const SAFETY_DEFERRED_RETRY_BOUNDARY = 'safety_retry';
const DEFERRED_RETRY_REARM_WAIT = Object.freeze({
  wait: 'REBALANCE_OPERATION_BUDGET_MS',
  awaited: 'deferred replica operation retry re-armed after re-initialization',
});
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
// The one reader of an operation's armed owner retries. `retryWakeArmed` is
// true only while a timer that will re-enter the owner exists; the
// transition-retry grace is a deadline, not a wake, so it counts toward
// `transitionRetryArmed` and never toward `retryWakeArmed`.
function readOperationRetryArmedState(owner, operationId) {
  const safetyRetryArmed =
    owner.safetyDeferredRetryTimerByOperationId.has(operationId);
  const dispatchRetryArmed =
    owner.dispatchRetryTimerByOperationId.has(operationId);
  const activeReplaceRetryArmed =
    owner.priorityActiveReplaceRetryTimerByOperationId.has(operationId);
  const transitionRetryTimerArmed =
    owner.transitionRetryTimerByOperationId.has(operationId);
  return Object.freeze({
    safetyRetryArmed,
    dispatchRetryArmed,
    activeReplaceRetryArmed,
    transitionRetryArmed: transitionRetryTimerArmed ||
      owner.hasActiveTransitionRetryGrace(operationId),
    retryWakeArmed: safetyRetryArmed || dispatchRetryArmed ||
      activeReplaceRetryArmed || transitionRetryTimerArmed,
  });
}
function isOperationDeferredRetryActive(owner, operationId) {
  const armed = readOperationRetryArmedState(owner, operationId);
  return armed.dispatchRetryArmed || armed.transitionRetryArmed;
}
function isRetryableControlPlaneOperationTarget(operation) {
  if (!operation) {
    return false;
  }
  if (
    operation.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE
  ) {
    return true;
  }
  return classifySystemPartition({
    partitionId: operation.partitionId,
  }).systemTable;
}
// The node-side CREATE admission owner's recoverable refusal: the target
// could not decide admission yet. It defers for every target class; the
// operation's own step budget bounds the retries.
function isCreateAdmissionDeferredError(errorLike) {
  return errorLike?.code === CREATE_ADMISSION_ERROR_CODE.DEFERRED ||
    errorLike?.errorCode === CREATE_ADMISSION_ERROR_CODE.DEFERRED;
}
function shouldDeferRetryableDispatchFailure(owner, operation, errorLike) {
  if (!operation || !isRetryableControlPlaneError(errorLike)) {
    return false;
  }
  return isCreateAdmissionDeferredError(errorLike) ||
    isRetryableControlPlaneOperationTarget(operation);
}
function isDispatchRetryableWorkflowStep(owner, operation) {
  if (!operation) {
    return false;
  }
  const workflowStep = readOperationRecordWorkflowStep(operation);
  if (owner.repository.isReplaceRemoveDispatchPhase(operation)) {
    return REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS.has(workflowStep);
  }
  if (
    owner.isRemoveInitialDispatchPhase(operation) ||
    (
      operation.type === OperationType.REMOVE &&
      workflowStep === WORKFLOW_STEP.STOPPING
    )
  ) {
    return true;
  }
  if (owner.isCreateRearmDispatchPhase(operation)) {
    return true;
  }
  return DISPATCH_PENDING_WORKFLOW_STEPS.has(workflowStep);
}
function isCreateRearmDispatchPhase(owner, operation) {
  if (!isRetryableControlPlaneOperationTarget(operation)) {
    return false;
  }
  if (operation.workflowStep !== WORKFLOW_STEP.CREATING) {
    return false;
  }
  if (owner.repository.isReplaceRemoveDispatchPhase(operation)) {
    return false;
  }
  return CREATE_REARM_DISPATCH_OPERATION_TYPES.has(operation.type);
}
function isRemoveInitialDispatchPhase(operation) {
  return (
    operation?.type === OperationType.REMOVE &&
    REMOVE_INITIAL_DISPATCH_WORKFLOW_STEPS.has(operation?.workflowStep)
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
    typeof actualStatus === 'string' ?
      actualStatus.toLowerCase() :
      actualStatus;
  const createRearmPhase = owner.isCreateRearmDispatchPhase(operation);
  const timeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(operation, now);
  const partitionClassification = classifySystemPartition({
    partitionId: operation?.partitionId || null,
  });
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
      !isBootstrapTopologyDispatchDeferred(operation) &&
      owner.isDispatchRetryableWorkflowStep(operation),
    priorityRecoveryPartition:
      partitionClassification.systemTable ||
      partitionClassification.priorityControlPlane,
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
  if (!isOperationWithinRetryBudget(operation)) {
    reportDeferredRetryRearmBudgetSpent(owner, operation, retryKind);
    return;
  }
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_REARM_DROPPED,
    {
      operationId: operation?.operationId || null,
      partitionId: operation?.partitionId || null,
      workflowStep: readStateField(operation?.workflowStep),
      retryKind,
    },
  );
}

// The drop is the operation budget spent (the timer fired while the node was
// uninitialized): one wait_bound_spent ERROR instead of the drop warn.
function reportDeferredRetryRearmBudgetSpent(owner, operation, retryKind) {
  reportWaitBoundSpent(owner.logger, {
    ...DEFERRED_RETRY_REARM_WAIT,
    boundMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    startedAtMs: resolveOperationStartedAtMs(operation),
    lastObserved: {
      retryKind,
      workflowStep: readStateField(operation?.workflowStep),
      type: operation?.type || null,
      initialized: owner.isInitialized === true,
    },
    scope: {
      nodeId: owner.nodeId || null,
      partitionId: operation?.partitionId || null,
      operationId: operation?.operationId || null,
    },
  });
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
      ...buildHandoffDeferralTransportDiagnostics(owner, operation, errorLike),
    },
  );
  let timerHandle = null;
  timerHandle = owner.setTimeoutFn(() => {
    if (owner.dispatchRetryTimerByOperationId.get(operationId) !== timerHandle) return;
    owner.dispatchRetryTimerByOperationId.delete(operationId);
    if (owner.isShuttingDown) return;
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
            boundary: DISPATCH_RETRY_BOUNDARY,
            cause:
              OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_OPERATION_DISPATCH,
            workflowStep: currentOperation.workflowStep,
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
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      allowPriorityRecoveryDeferredVisibility: true,
      allowOwnerPersistedTransitionDeferredVisibility: false,
    });
  return owner.resolveDeferredRetryVisibleOperation(
    visibilityObservation,
    fallbackOperation,
  );
}
/**
 * The operation a deferred retry re-enters with. A retry whose caller drops
 * it on null reads OWNER_RPC_REQUIRED, so null is the owner's confirmed
 * absence (or an unavailable read with no previous copy to keep).
 * @param {Object} owner
 * @param {Object} visibilityObservation - Named-state by-id observation.
 * @param {Object|null} fallbackOperation - The retry's previous copy.
 * @return {Object|null}
 */
function resolveDeferredRetryVisibleOperation(
  owner,
  visibilityObservation,
  fallbackOperation,
) {
  const state = readOperationVisibilityState(visibilityObservation);
  if (state === OPERATION_VISIBILITY_STATE.PRESENT) {
    return visibilityObservation.operation;
  }
  if (state === OPERATION_VISIBILITY_STATE.UNAVAILABLE && fallbackOperation) {
    // BR12: the copy is the previous snapshot, marked as such so an effect
    // boundary waits on it rather than acting.
    return {
      ...owner.cloneOperationSnapshot(fallbackOperation),
      [ReplicaOperationField.VISIBILITY_CLASS]:
        ReplicaOperationVisibilityClass.DEFERRED_SNAPSHOT,
    };
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
      workflowStep: readStateField(operation?.workflowStep),
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
      workflowStep: readStateField(operation?.workflowStep),
      error: error?.message || error?.error || String(error),
    },
  );
}
// The deferred remove-safety re-entry: one owner body shared by the 1 s
// fallback timer and the readiness wake (quest replace-source-removal-owner,
// design R-2). It re-reads the operation, and only a non-terminal, locally
// owned, still-deferrable operation re-runs EXECUTE, which re-evaluates
// remove safety from authoritative reads. A wake is never authority.
async function runDeferredSafetyRetryInLane(
  owner,
  operationId,
  operation,
  boundary,
) {
  const visibilityObservation =
    await owner.repository.getOperationByIdVisibilityObservation(
      operationId,
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
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
    !owner.repository.isOperationLocallyOwned(currentOperation)
  ) {
    return;
  }
  let retryOperation = currentOperation;
  if (!owner.isSafetyDeferredRetryableOperation(currentOperation)) {
    // The caller's copy re-enters only while the visible copy lags behind
    // it; a visible copy at or past it (a REMOVE already at STOPPING) ended
    // the wait - its older snapshot is never re-dispatched.
    if (operation && owner.isSafetyDeferredRetryableOperation(operation) &&
        isWorkflowStepBehind(currentOperation, operation)) {
      retryOperation = operation;
    } else {
      return;
    }
  }
  await owner.runOperationOwnerAction(
    OPERATION_OWNER_ACTION.EXECUTE,
    retryOperation,
    {
      boundary,
      // retryOperation is the repository's decoded operation or, when that
      // one is no longer safety-retryable, the caller's in-memory operation.
      workflowStep: readStateField(retryOperation.workflowStep),
      partitionId: retryOperation.partitionId || null,
      runInlineWhenOwnerLaneHeld: true,
    },
  );
}
function isWorkflowStepBehind(copy, reference) {
  const rankOf = (operation) => WORKFLOW_STEP_PROGRESS_RANK.get(
    readStateField(operation?.workflowStep)) ?? 0;
  return rankOf(copy) < rankOf(reference);
}
// Run the deferred remove-safety body in its OWN operation-lane turn. A plain
// lane submission JOINS an in-flight holder and discards the new factory
// (durable-workflow-coordinator runExclusive), which lost 5 of 11 lab timer
// fires (BR2a). The owner's retained turn (runRetainedOperationOwnerAction,
// OPERATION_OWNER_TURN_POLICY.RETAIN) waits for the holder and resubmits, so
// the re-entry always runs. context.onAdmitted runs when the turn starts.
function runDeferredSafetyReentryTurn(owner, operation, context) {
  const operationId = operation?.operationId || null;
  return owner.runRetainedOperationOwnerAction(operationId, () => {
    if (typeof context.onAdmitted === 'function') {
      context.onAdmitted();
    }
    return runDeferredSafetyRetryInLane(
      owner,
      operationId,
      operation,
      context.boundary,
    );
  }).catch((retryError) => {
    handleDeferredSafetyRetryFailure(owner, operation, retryError, context);
  });
}
function handleDeferredSafetyRetryFailure(owner, operation, retryError, context) {
  const operationId = operation?.operationId || null;
  if (
    owner.deferTransitionRetry(operationId, retryError, {
      boundary: context.boundary,
      partitionId: operation?.partitionId || null,
      workflowStep: readStateField(operation?.workflowStep),
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
      workflowStep: readStateField(operation?.workflowStep),
      deferReason: context.deferReason ?? null,
      error:
        retryError?.message || retryError?.error || String(retryError),
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
      ...buildHandoffDeferralTransportDiagnostics(owner, operation, null),
    },
  );
  let timerHandle = null;
  timerHandle = owner.setTimeoutFn(() => {
    if (
      owner.safetyDeferredRetryTimerByOperationId.get(operationId) !==
      timerHandle
    ) {
      return;
    }
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
    // A fire that finds the lane held must not be lost (BR2a): it takes its
    // own retained turn after the holder.
    return runDeferredSafetyReentryTurn(owner, operation, {
      boundary: SAFETY_DEFERRED_RETRY_BOUNDARY,
      deferReason,
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
  // Prefer time-in-current-step over updatedAt: a wedged op whose dispatch retry
  // loop re-persists updatedAt every ~1s would otherwise never age past its step
  // timeout, so this reaper could never retire it (CL-044). updateStep appends a
  // step-history entry only on a real transition, so the step-entry anchor is
  // immune to same-step retry churn; fall back to updatedAt when it is absent.
  const stepEnteredAtMs = owner.resolveOperationStepEnteredAtMs?.(operation);
  const updatedAt = Number.isFinite(stepEnteredAtMs) ?
    stepEnteredAtMs :
    Number(operation.updatedAt ?? operation.updatedAtMs);
  if (!Number.isFinite(updatedAt)) {
    return false;
  }
  return (
    now - updatedAt >=
    owner.getTimeoutForStep(operation.workflowStep, operation)
  );
}
export {
  buildDispatchRearmFromProgressReconcileEvidence,
  deferDispatchRetry,
  getDeferredDispatchRetryOperation,
  handleDeferredDispatchRetryFailure,
  hasActiveTransitionRetryGrace,
  isCreateRearmDispatchPhase,
  isDispatchRetryableWorkflowStep,
  isOperationDeferredRetryActive,
  isOperationStepTimedOut,
  isProtectedCreateDispatchRetryBudgetActive,
  isRemoveInitialDispatchPhase,
  isSafetyDeferredRetryableOperation,
  readOperationRetryArmedState,
  resolveDeferredRetryVisibleOperation,
  resolveDispatchRearmFromProgressReconcileState,
  resolveTransitionRetryGraceTimeoutCeilingMs,
  runDeferredSafetyReentryTurn,
  scheduleDeferredSafetyRetry,
  shouldDeferRetryableDispatchFailure,
  shouldRearmDispatchFromProgressReconcile,
  shouldUseOperationBudgetTransitionRetryGrace,
};
