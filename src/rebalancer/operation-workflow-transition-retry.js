import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OPERATION_OWNER_RESUME_ACTION,
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  buildOperationOwnerResumeOutcome,
  buildOperationOwnerRetryOutcome,
} from './topology-owner-constants.js';

import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED,
} from './operation-workflow-recovery-reconcile-shared.js';
import {
  isActiveReplaceSourceRemovalPhase,
  isReplaceExemptFromTimeBudget,
} from './replica-operation-step-policy.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {
  OPERATION_VISIBILITY_STATE,
  buildOperationVisibilityUnavailableError,
  readOperationVisibilityState,
} from './replica-operation-repository-operation-visibility.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  OPERATION_OWNER_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaStatus,
  TIMEOUT_BUDGET_DEFAULT,
  TRANSITION_RETRY_DELAY_MS,
  WORKFLOW_STEP,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;
const {STOPPING_REPLICA_OBSERVATION_STATE} =
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
const DEFERRED_STEP_WRITE_WAIT = Object.freeze({
  wait: 'REBALANCE_OPERATION_BUDGET_MS',
  awaited: 'durable write of a replica operation step whose effect was performed',
});

// --- Deferred step write ---------------------------------------------------
// An operation's step advances only by its committed row. When the write of
// a step whose effect was already performed fails retryably, nothing
// advances: the write is recorded as owed (owner field
// deferredStepWriteByOperationId) and retried. Retrying the write never
// repeats the effect; the effect is re-sent only when the authoritative
// replica row shows it did not take. The owed write is bounded by the
// operation budget (TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS from
// the operation's creation), not by the durable step's own timeout.
// Wakes: the transition-retry timer and every timeout-sweep tick.

function readDurableOperationForStepWrite(owner, operationId) {
  return owner.repository.getOperationByIdVisibilityObservation(operationId, {
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    allowOwnerPersistedTransitionDeferredVisibility: false,
  });
}

function hasDurableRowReachedStep(owner, durableOperation, step) {
  return owner.getOperationWorkflowStepRank(durableOperation) >=
    owner.getOperationWorkflowStepRank({...durableOperation, workflowStep: step});
}

// A step write that records an intent BEFORE its effect: the SENDING claim,
// and a REPLACE's ACTIVE -> STOPPING source-removal intent (admitted by
// admitActiveReplaceSourceRemovalIntent against a fresh witness, source row
// and owner level; the removal is sent only after it commits). Its failed
// write is never owed: a later retry would commit a stale intent without
// that revalidation. The transition is only retried, and the retry re-enters
// the owner, which re-admits the intent.
function isIntentStepWrite(operation, step) {
  return step === WORKFLOW_STEP.SENDING ||
    (step === WORKFLOW_STEP.STOPPING &&
      isActiveReplaceSourceRemovalPhase(operation.type, operation.workflowStep));
}

/**
 * Defer one step transition whose write failed retryably. A step write that
 * follows a performed effect is recorded as owed; an intent write (the
 * SENDING claim, a REPLACE's STOPPING intent) precedes its effect and is
 * only retried.
 * @param {Object} owner
 * @param {Object} operation - The owner's copy, still at its durable step.
 * @param {Object} write - {step, reason, stepMetadata}.
 * @param {Error|Object} errorLike
 * @return {boolean} Whether a retry is armed.
 */
function deferStepWrite(owner, operation, write, errorLike) {
  const operationId = operation.operationId;
  const effectPerformed = !isIntentStepWrite(operation, write.step);
  if (effectPerformed && !owner.deferredStepWriteByOperationId.has(operationId)) {
    owner.deferredStepWriteByOperationId.set(operationId, Object.freeze({
      ...write,
      durableStep: operation.workflowStep,
      createdAt: operation.createdAt,
      partitionId: operation.partitionId,
    }));
  }
  return owner.deferTransitionRetry(operationId, errorLike, {
    boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DEFERRED_STEP_WRITE,
    workflowStep: operation.workflowStep,
    partitionId: operation.partitionId,
    updatedAt: operation.updatedAt,
    createdAt: operation.createdAt,
    operationSnapshot: operation,
    deferredStepWrite: effectPerformed,
  });
}

/**
 * The owed write's budget: the operation budget from the operation's
 * creation. Null when the operation owes no step write.
 * @param {Object} owner
 * @param {string} operationId
 * @param {number} now
 * @return {Object|null} Frozen {owed, spent}.
 */
function readDeferredStepWriteBudget(owner, operationId, now) {
  const owed = owner.deferredStepWriteByOperationId.get(operationId);
  if (!owed) {
    return null;
  }
  const startedAtMs = Number(owed.createdAt);
  return Object.freeze({
    owed,
    spent: !Number.isFinite(startedAtMs) ||
      now >= startedAtMs + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
  });
}

// The owed write is discharged only by authoritative evidence: the owner
// confirmed the row absent, or its row is terminal, owned elsewhere or
// already at (or past) the step. UNAVAILABLE discharges nothing.
const STEP_WRITE_EVIDENCE = Object.freeze({
  DISCHARGED: 'discharged',
  OWED: 'owed',
  UNAVAILABLE: 'unavailable',
});

function classifyStepWriteEvidence(owner, observation, step) {
  const state = readOperationVisibilityState(observation);
  if (state === OPERATION_VISIBILITY_STATE.UNAVAILABLE) {
    return STEP_WRITE_EVIDENCE.UNAVAILABLE;
  }
  if (state === OPERATION_VISIBILITY_STATE.ABSENT) {
    return STEP_WRITE_EVIDENCE.DISCHARGED;
  }
  const durable = observation.operation;
  return owner.repository.isOperationTerminal(durable) ||
    !owner.repository.isOperationLocallyOwned(durable) ||
    hasDurableRowReachedStep(owner, durable, step) ?
    STEP_WRITE_EVIDENCE.DISCHARGED :
    STEP_WRITE_EVIDENCE.OWED;
}

// The owner read did not answer: the owed write and its retry stay, with
// the failure's retry delay.
function retainOwedStepWrite(owner, operationId, owed, observation) {
  const snapshot = owner.getTransitionRetryOperationSnapshot(operationId);
  return owner.deferTransitionRetry(
    operationId,
    buildOperationVisibilityUnavailableError(observation, operationId),
    {
      boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DEFERRED_STEP_WRITE,
      workflowStep: owed.durableStep,
      partitionId: owed.partitionId,
      createdAt: owed.createdAt,
      operationSnapshot: snapshot,
      deferredStepWrite: true,
    },
  );
}

// The operation moves on the moment its row commits, when there is
// something to move on to: a placed REPLACE's source removal, or target
// progress already observed. Otherwise the next wake decides; a committed
// write alone is no reason to re-drive an effect.
function hasProgressToMoveOnTo(owner, durable) {
  return isActiveReplaceSourceRemovalPhase(durable.type, durable.workflowStep) ||
    owner.hasObservedOperationRowTargetProgress(durable);
}

/**
 * Retry the owed write against the owner's row. Authoritative evidence that
 * the write is no longer owed discharges it; an unavailable owner read
 * retains it with its retry armed (whatever the cache projects).
 * @param {Object} owner
 * @param {string} operationId
 * @return {Promise<boolean>} Whether this call committed the step.
 */
async function resumeDeferredStepWrite(owner, operationId) {
  const owed = owner.deferredStepWriteByOperationId.get(operationId);
  const observation = await readDurableOperationForStepWrite(owner, operationId);
  const evidence = classifyStepWriteEvidence(owner, observation, owed.step);
  if (evidence === STEP_WRITE_EVIDENCE.UNAVAILABLE) {
    retainOwedStepWrite(owner, operationId, owed, observation);
    return false;
  }
  if (evidence === STEP_WRITE_EVIDENCE.DISCHARGED) {
    owner.deferredStepWriteByOperationId.delete(operationId);
    owner.clearTransitionRetry(operationId);
    return false;
  }
  const durable = observation.operation;
  const committed = await owner.updateStep(durable, owed.step, owed.reason, {
    stepMetadata: owed.stepMetadata,
  }) === true;
  if (committed && hasProgressToMoveOnTo(owner, durable)) {
    await owner.reconcileOperationProgress(durable, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
    });
  }
  return committed;
}

/**
 * The timeout sweep's turn for an operation that owes a step write: each
 * tick retries the write (nothing else is decided from a row known to be
 * behind), and a spent operation budget fails the operation with its typed
 * cause. A time-exempt REPLACE keeps retrying.
 * @param {Object} owner
 * @param {Object} operation
 * @param {number} now
 * @return {Promise<boolean>} Whether the operation owed a step write.
 */
async function reconcileDeferredStepWriteOnTimeout(owner, operation, now) {
  const budget = readDeferredStepWriteBudget(owner, operation?.operationId, now);
  if (!budget) {
    return false;
  }
  if (!budget.spent || isReplaceExemptFromTimeBudget(operation)) {
    await resumeDeferredStepWrite(owner, operation.operationId);
    return true;
  }
  const elapsedMs = now - budget.owed.createdAt;
  reportWaitBoundSpent(owner.logger, {
    ...DEFERRED_STEP_WRITE_WAIT,
    boundMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    elapsedMs,
    lastObserved: {
      type: operation.type || null,
      workflowStep: operation.workflowStep,
      deferredWorkflowStep: budget.owed.step,
    },
    scope: {
      nodeId: owner.nodeId || null,
      partitionId: operation.partitionId || null,
      operationId: operation.operationId,
    },
    subject: operation.operationId,
  });
  await owner.failOperation(
    operation,
    `${OPERATION_WORKFLOW_OWNER_LITERAL.STEP_WRITE_DEFERRED}: ` +
      `${budget.owed.step} not durable after ${elapsedMs}ms`,
    {stepMetadata: {
      deferredWorkflowStep: budget.owed.step,
      elapsedMs,
      timedOutAtMs: now,
      budgetExhausted: true,
    }},
  );
  owner.stats.operationsTimedOut++;
  return true;
}

/**
 * Before a later step is written, persist the earlier step this operation
 * still owes, so the durable history advances in order. Throws while the
 * owed write still fails (the caller's transition stays deferred).
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} step - The step about to be written.
 * @return {Promise<void>}
 */
async function persistOwedStepBefore(owner, operation, step) {
  const owed = owner.deferredStepWriteByOperationId.get(operation.operationId);
  if (
    !owed ||
    owed.step === step ||
    operation.workflowStep !== owed.durableStep ||
    hasDurableRowReachedStep(owner, {...operation, workflowStep: owed.step}, step)
  ) {
    return;
  }
  await owner.updateStep(operation, owed.step, owed.reason, {
    stepMetadata: owed.stepMetadata,
  });
}

// The replica whose authoritative row tells whether the owed step's effect
// took: the created target, or the replica a REMOVE stops. (A REPLACE's
// STOPPING is an intent, never owed - isIntentStepWrite.)
function resolveDeferredStepEffectReplica(operation) {
  return {replicaId: operation.replicaId, nodeId: operation.targetNodeId};
}

// The effect is re-sent only on the services owner's own answer (an
// OWNER_RPC_REQUIRED read, whose ABSENT is also corroborated against the
// cache): the CREATE target absent, or the removed replica still ACTIVE. An
// unavailable read waits (the execute is skipped, typed). The re-send is the
// same idempotent request: a CREATE carries the committed row's admission
// key, a removal targets the same replica.
async function isDeferredStepEffectNeeded(owner, operation, owed) {
  const {replicaId, nodeId} = resolveDeferredStepEffectReplica(operation);
  const observation = await owner.repository.getActualReplicaObservation(
    replicaId,
    operation.partitionId,
    nodeId,
    {authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED},
  );
  if (owed.step === WORKFLOW_STEP.CREATING) {
    return observation?.state === STOPPING_REPLICA_OBSERVATION_STATE.ABSENT;
  }
  return observation?.state === STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED &&
    observation.lifecycleStatus === ReplicaStatus.ACTIVE;
}

function buildDeferredStepWriteSkip(owner, operation, owed) {
  return owner.buildSkippedOperationResult(
    REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    operation.operationId,
    {
      error: OPERATION_WORKFLOW_OWNER_LITERAL.STEP_WRITE_DEFERRED,
      deferredWorkflowStep: owed.step,
      durableWorkflowStep: owed.durableStep,
    },
  );
}

/**
 * Whether an execute would only repeat the effect of a step whose write is
 * owed. It is skipped (typed) unless the authoritative replica row shows the
 * effect did not take; an operation past the owed step is never skipped.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object|null>} Typed skip, or null to execute.
 */
async function resolveDeferredStepWriteEffectSkip(owner, operation) {
  const owed = owner.deferredStepWriteByOperationId.get(operation?.operationId);
  if (
    !owed ||
    owed.step === WORKFLOW_STEP.ACTIVE ||
    (operation.workflowStep !== owed.step &&
      operation.workflowStep !== owed.durableStep) ||
    await isDeferredStepEffectNeeded(owner, operation, owed)
  ) {
    return null;
  }
  return buildDeferredStepWriteSkip(owner, operation, owed);
}

/**
 * A result is not a success while the step it reached is not durable.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} result
 * @return {Object}
 */
function typeDeferredStepWriteResult(owner, operation, result) {
  const owed = owner.deferredStepWriteByOperationId.get(operation?.operationId);
  return owed && result?.success === true ?
    buildDeferredStepWriteSkip(owner, operation, owed) :
    result;
}

function selectTransitionRetryRetainedOperation(
  owner,
  operationId,
  retryContext,
) {
  return retryContext.operationSnapshot ||
    retryContext.operation ||
    owner.getTransitionRetryOperationSnapshot(operationId);
}

function buildUninitializedTransitionRetryError(retryContext) {
  const error = new Error(
    OPERATION_WORKFLOW_OWNER_LITERAL
      .RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
  );
  error.code =
    OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
  error.errorCode =
    OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
  error.deferRetry = true;
  error.retryAfterMs = TRANSITION_RETRY_DELAY_MS;
  error.partitionId = retryContext.partitionId || null;
  return error;
}

function shouldRetainTransitionRetryWhileUninitialized(
  owner,
  operationId,
  retryContext,
) {
  const operation = selectTransitionRetryRetainedOperation(
    owner,
    operationId,
    retryContext,
  );
  if (!operation) {
    return false;
  }
  // The deferral's recorded step, else the operation's own (NOT NULL) step.
  const recordedStep = readStateField(retryContext.workflowStep);
  const workflowStep = recordedStep === STATE_ABSENT ?
    operation.workflowStep :
    recordedStep;
  const now = Date.now();
  if (
    owner.isDispatchRetryableWorkflowStep(operation) !== true ||
    owner.hasActiveTransitionRetryGrace(operationId, now) !== true ||
    owner.shouldUseOperationBudgetTransitionRetryGrace(
      retryContext,
      workflowStep,
    ) !== true
  ) {
    return false;
  }
  const handoffTimeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision?.(
      operation,
      now,
    );
  return handoffTimeoutDecision?.shouldStop !== true;
}

function rearmTransitionRetryWhileUninitialized(
  owner,
  operationId,
  retryContext,
) {
  if (
    !shouldRetainTransitionRetryWhileUninitialized(
      owner,
      operationId,
      retryContext,
    )
  ) {
    return false;
  }
  return owner.deferTransitionRetry(
    operationId,
    buildUninitializedTransitionRetryError(retryContext),
    retryContext,
  );
}

async function resumeDeferredTransitionOperation(owner, operationId) {
  if (owner.deferredStepWriteByOperationId.has(operationId)) {
    await resumeDeferredStepWrite(owner, operationId);
    return;
  }
  // Clearing the retry on absence drops the wake, so absence must be the
  // owner's; an unavailable read re-arms the retry (the timer's failure
  // handler) and no retained snapshot stands in for the row.
  const visibilityObservation =
    await owner.repository.getOperationByIdVisibilityObservation(operationId, {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      allowPriorityRecoveryDeferredVisibility: true,
    });
  if (
    readOperationVisibilityState(visibilityObservation) ===
    OPERATION_VISIBILITY_STATE.UNAVAILABLE
  ) {
    throw buildOperationVisibilityUnavailableError(
      visibilityObservation,
      operationId,
    );
  }
  const operation = visibilityObservation.operation;
  const now = Date.now();
  const resumeOutcome = buildOperationOwnerResumeOutcome({
    operationAvailable: Boolean(operation),
    terminalOperation: operation ?
      owner.repository.isOperationTerminal(operation) :
      false,
    locallyOwned: operation ?
      owner.repository.isOperationLocallyOwned(operation) :
      false,
    dispatchRetryable: operation ?
      owner.isDispatchRetryableWorkflowStep(operation) :
      false,
    retryGraceActive: owner.hasActiveTransitionRetryGrace(operationId, now),
    stepTimedOut: operation ?
      owner.isOperationStepTimedOut(operation, now) :
      false,
  });
  if (resumeOutcome.action === OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY) {
    owner.clearTransitionRetry(operationId);
    return;
  }
  if (resumeOutcome.action === OPERATION_OWNER_RESUME_ACTION.DISPATCH) {
    await owner.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.DISPATCH,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_RETRY_RESUME,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId || null,
        runInlineWhenOwnerLaneHeld: true,
      },
    );
    return;
  }
  await owner.reconcileTimeoutOperation(operation, now);
}

function cannotRegisterTransitionRetry(owner, retryContext) {
  if (owner.isShuttingDown) {
    return true;
  }
  const expectedOwnershipFenceEpoch =
    retryContext.operationOwnershipFenceEpoch;
  if (!Number.isInteger(expectedOwnershipFenceEpoch)) {
    return false;
  }
  return (
    typeof owner.getOperationOwnershipFenceEpoch === 'function' &&
    owner.getOperationOwnershipFenceEpoch() !== expectedOwnershipFenceEpoch
  );
}

function deferTransitionRetry(
  owner,
  operationId,
  errorLike,
  retryContext = {},
) {
  if (cannotRegisterTransitionRetry(owner, retryContext)) {
    return false;
  }
  const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
  const retryOutcome = buildOperationOwnerRetryOutcome({
    operationId,
    retryable: isRetryableControlPlaneError(errorLike),
    timerActive: owner.transitionRetryTimerByOperationId.has(operationId),
    retryAfterMs,
    fallbackDelayMs: TRANSITION_RETRY_DELAY_MS,
    retryKind: OPERATION_OWNER_RETRY_KIND.TRANSITION,
  });
  if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REJECT) {
    return false;
  }
  owner.recordTransitionRetryOperationSnapshot(
    retryContext.operationSnapshot || retryContext.operation || null,
  );
  const delayMs = retryOutcome.delayMs;
  owner.recordTransitionRetryGrace(operationId, retryContext, delayMs);
  if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER) {
    return true;
  }
  const errorMessage = owner.normalizeErrorMessage(
    errorLike,
    'Retryable control-plane transition failure',
  );
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
    {
      operationId,
      boundary: retryContext.boundary || null,
      partitionId: retryContext.partitionId || null,
      workflowStep: retryContext.workflowStep,
      delayMs,
      errorMessage,
    },
  );
  let timerHandle = null;
  timerHandle = owner.setTimeoutFn(() => {
    if (owner.transitionRetryTimerByOperationId.get(operationId) !== timerHandle) {
      return;
    }
    owner.transitionRetryTimerByOperationId.delete(operationId);
    if (owner.isShuttingDown) {
      return;
    }
    if (!owner.isInitialized) {
      rearmTransitionRetryWhileUninitialized(
        owner,
        operationId,
        retryContext,
      );
      return;
    }
    return owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(operationId),
      () => owner.resumeDeferredTransitionOperation(operationId),
    ).catch((retryError) => {
      owner.handleDeferredTransitionRetryFailure(
        operationId,
        retryError,
        retryContext,
      );
    });
  }, delayMs);
  owner.transitionRetryTimerByOperationId.set(operationId, timerHandle);
  return true;
}

function handleDeferredTransitionRetryFailure(
  owner,
  operationId,
  error,
  retryContext = {},
) {
  if (owner.deferTransitionRetry(operationId, error, retryContext)) {
    return;
  }
  owner.logger.error(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_FAILED,
    {
      operationId,
      boundary: retryContext.boundary || null,
      partitionId: retryContext.partitionId || null,
      workflowStep: retryContext.workflowStep,
      error: error?.message || error?.error || String(error),
    },
  );
}

export {
  deferStepWrite,
  deferTransitionRetry,
  handleDeferredTransitionRetryFailure,
  persistOwedStepBefore,
  reconcileDeferredStepWriteOnTimeout,
  resolveDeferredStepWriteEffectSkip,
  resumeDeferredTransitionOperation,
  typeDeferredStepWriteResult,
};
