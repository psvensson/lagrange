import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from './executor-outcome-constants.js';
import {
  RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS,
  TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_WORKFLOW_STEPS,
} from './replica-operation-step-policy.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const {
  CONTROL_PLANE_OPERATION_HANDOFF_MODE,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_LOG_MSG,
  TIMEOUT_BUDGET_DEFAULT,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  classifySystemPartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const COORDINATOR_CREATED_REMOTE_HANDOFF_MODE =
  CONTROL_PLANE_OPERATION_HANDOFF_MODE;

const EXECUTOR_OUTCOME_REMOTE_OWNER_WAKE_TYPES = Object.freeze(
  new Set([
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
  ]),
);

const TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_TYPES = Object.freeze(
  new Set([
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
  ]),
);

const TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_OPERATION_TYPES = Object.freeze(
  new Set([
    OperationType.ADD,
    OperationType.REPLACE,
  ]),
);

const TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_STEPS_BY_ENTITY_TYPE =
  Object.freeze(
    new Map([
      [
        UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS,
      ],
    ]),
  );

const COORDINATOR_HANDOFF_RETRY_CLEARED_OUTCOME = 'handoff_retry_cleared';
const COORDINATOR_HANDOFF_RETRY_WAIT = Object.freeze({
  wait: 'COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT',
  awaited: 'coordinator-created operation handed off to its remote owner',
});

/**
 * Log one coordinator-created handoff retry stop. A stop because the step
 * timeout and operation budget are spent is a spent wait (one
 * wait_bound_spent ERROR); any other stop (terminal, ineligible, degenerate
 * snapshot) keeps its warn.
 * @param {Object} owner
 * @param {Object} operation - The operation (or retained snapshot) observed.
 * @param {Object} logFields - The stop's diagnostic fields.
 * @param {boolean} timedOut - True when the stop is the spent budget.
 * @return {void}
 */
function logCoordinatorHandoffRetryStopped(
  owner, operation, logFields, timedOut) {
  if (timedOut === true) {
    reportCoordinatorHandoffRetrySpent(owner, operation, logFields);
    return;
  }
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.COORDINATOR_HANDOFF_RETRY_STOPPED,
    logFields,
  );
}

// The bound is the step timeout (isOperationStepTimedOut), anchored on the
// step-entry timestamp; the operation budget, when it applied, is in
// lastObserved as operationBudgetDeadlineMs.
function reportCoordinatorHandoffRetrySpent(owner, operation, logFields) {
  const {operationId, partitionId, ...observed} = logFields;
  const snapshot = operation ?? {};
  reportWaitBoundSpent(owner.logger, {
    ...COORDINATOR_HANDOFF_RETRY_WAIT,
    boundMs: owner.getTimeoutForStep?.(snapshot.workflowStep, snapshot),
    startedAtMs: owner.resolveOperationStepEnteredAtMs?.(snapshot) ??
      snapshot.updatedAt ?? snapshot.updatedAtMs,
    lastObserved: {
      ...observed,
      type: snapshot.type ?? null,
      status: snapshot.status ?? null,
    },
    scope: {nodeId: owner.nodeId ?? null, partitionId, operationId},
  });
}

// The step bound and its anchor, read on the expiry branch only; a read
// that fails leaves the field unmeasured rather than reaching the caller.
function readHandoffStepBound(owner, snapshot) {
  try {
    return {
      boundMs: owner.getTimeoutForStep?.(snapshot.workflowStep, snapshot),
      startedAtMs: owner.resolveOperationStepEnteredAtMs?.(snapshot) ??
        snapshot.updatedAt ?? snapshot.updatedAtMs,
    };
  } catch (_readError) {
    return {boundMs: null, startedAtMs: undefined};
  }
}

/**
 * Report a coordinator-created handoff stopped because its step timeout is
 * spent, from the arm path (owner-handoff-state) or the remote-owner wake
 * path (owner-ports). Both can observe the same expiry of one operation,
 * and the wake path re-observes it on every stale-progress pass, so the
 * report is folded per operation (subject) over an observation that names
 * the decision only, never the site: one line per operation and state per
 * fold window, repeats counted.
 * @param {Object} owner
 * @param {Object} operation - The operation the decision was built for.
 * @param {Object} decision - buildCoordinatorCreatedRemoteHandoffTimeoutDecision.
 * @return {void}
 */
function reportCoordinatorHandoffStepTimeoutStop(owner, operation, decision) {
  const snapshot = operation ?? {};
  const bound = readHandoffStepBound(owner, snapshot);
  reportWaitBoundSpent(owner.logger, {
    ...COORDINATOR_HANDOFF_RETRY_WAIT,
    boundMs: bound.boundMs,
    startedAtMs: bound.startedAtMs,
    lastObserved: () => ({
      workflowStep: decision?.workflowStep ?? null,
      stepTimedOut: decision?.stepTimedOut === true,
      operationBudgetActive: decision?.operationBudgetActive === true,
      operationBudgetDeadlineMs: decision?.operationBudgetDeadlineMs ?? null,
      type: snapshot.type ?? null,
      status: snapshot.status ?? null,
      outcome: COORDINATOR_HANDOFF_RETRY_CLEARED_OUTCOME,
    }),
    scope: () => ({
      nodeId: owner.nodeId ?? null,
      partitionId: snapshot.partitionId ?? null,
      operationId: snapshot.operationId ?? null,
    }),
    subject: snapshot.operationId ?? null,
  });
}

function cloneOperationSnapshot(operation) {
  if (!operation || typeof operation !== 'object') {
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
    typeof owner.repository?.resolveOperationOwnerNodeId !== 'function'
  ) {
    return null;
  }
  return owner.repository.resolveOperationOwnerNodeId(operation);
}

function isCoordinatorCreatedOperationLocallyOwned(owner, operation) {
  const ownerNodeId =
    owner.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
  return (
    typeof ownerNodeId === 'string' &&
    ownerNodeId.length > 0 &&
    ownerNodeId === owner.nodeId
  );
}

function buildCoordinatorCreatedDispatchIngress(nodeId) {
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedNodeId.length === 0) {
    return null;
  }
  return `${normalizedNodeId}/service/replica-dispatch`;
}

function buildCoordinatorCreatedDispatchRow(operation) {
  let stepsHistory = operation?.stepsHistory;
  if (typeof stepsHistory !== 'string') {
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

function isInitialCoordinatorCreatedRemoteHandoffEligible(operation) {
  const partitionId = operation?.partitionId || null;
  const partitionClassification = classifySystemPartition({partitionId});
  return (
    partitionClassification.systemTable ||
    partitionClassification.priorityControlPlane
  );
}

function isTargetCreateOutcomeHandoffEligible(operation) {
  const partitionClassification = classifySystemPartition({
    partitionId: operation?.partitionId || null,
  });
  const targetCreateOperation =
    TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_OPERATION_TYPES.has(
      operation?.type,
    );
  const eligibleSteps =
    TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_STEPS_BY_ENTITY_TYPE.get(
      operation?.entityType,
    ) || TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_WORKFLOW_STEPS;
  const targetCreateInProgress = eligibleSteps.has(operation?.workflowStep);
  return (
    targetCreateOperation &&
    targetCreateInProgress &&
    partitionClassification.systemTable !== true &&
    partitionClassification.priorityControlPlane !== true
  );
}

function shouldRetryCoordinatorCreatedRemoteHandoff(
  owner,
  operation,
  options = {},
) {
  if (
    options.handoffMode ===
      COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME
  ) {
    return isTargetCreateOutcomeHandoffEligible(operation);
  }
  return isInitialCoordinatorCreatedRemoteHandoffEligible(operation);
}

function resolveExecutorOutcomeRemoteOwnerHandoffMode(
  owner,
  operation,
  outcome,
) {
  const outcomeType = outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
  const outcomeWorkflowStep = outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
  if (
    TARGET_CREATE_ACTIVE_REMOTE_OWNER_WAKE_TYPES.has(outcomeType) &&
    outcomeWorkflowStep === WORKFLOW_STEP.ACTIVE &&
    isTargetCreateOutcomeHandoffEligible(operation)
  ) {
    return COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME;
  }
  if (
    EXECUTOR_OUTCOME_REMOTE_OWNER_WAKE_TYPES.has(outcomeType) &&
    isInitialCoordinatorCreatedRemoteHandoffEligible(operation) &&
    owner.isDispatchRetryableWorkflowStep(operation) === true
  ) {
    return COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.INITIAL_DISPATCH;
  }
  return COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.NONE;
}

function buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
  owner,
  operation,
  now = Date.now(),
  options = {},
) {
  const workflowStep = operation?.workflowStep || WORKFLOW_STEP.PENDING;
  const targetOutcomeHandoff =
    options.handoffMode ===
      COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME;
  const stepTimedOut =
    (
      owner.isDispatchRetryableWorkflowStep(operation) ||
      targetOutcomeHandoff
    ) &&
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

function resolveSnapshotHandoffRetryStop(
  owner,
  operationSnapshot,
  options,
) {
  const hasBoundingTimestamp = [
    operationSnapshot?.createdAt,
    operationSnapshot?.createdAtMs,
    operationSnapshot?.updatedAt,
    operationSnapshot?.updatedAtMs,
  ].some((value) => Number.isFinite(value));
  if (!hasBoundingTimestamp) {
    return {stop: true, degenerateSnapshot: true};
  }
  if (
    owner.repository.isOperationTerminal(operationSnapshot) ||
    !owner.shouldRetryCoordinatorCreatedRemoteHandoff(
      operationSnapshot,
      options,
    )
  ) {
    return {stop: true};
  }
  const handoffTimeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
      operationSnapshot,
      Date.now(),
      options,
    );
  if (handoffTimeoutDecision.shouldStop) {
    return {
      stop: true,
      timedOut: true,
      workflowStep: handoffTimeoutDecision.workflowStep,
      operationBudgetDeadlineMs:
        handoffTimeoutDecision.operationBudgetDeadlineMs,
    };
  }
  return {stop: false};
}

function resolveCoordinatorCreatedHandoffDiagnosticDestination(
  owner,
  operation,
  options = {},
) {
  const targetExecutorOutcome =
    options.handoffMode ===
      COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME;
  const nodeId = targetExecutorOutcome ?
    owner.resolveCoordinatorCreatedOperationOwnerNodeId(operation) || null :
    operation?.targetNodeId || null;
  return Object.freeze({
    nodeId,
    logFields: Object.freeze(
      targetExecutorOutcome ?
        {handoffDestinationNodeId: nodeId} :
        {targetNodeId: nodeId},
    ),
  });
}

function buildSnapshotHandoffRetryLogFields(
  owner,
  operationId,
  operationSnapshot,
  options,
  stopDecision = {},
) {
  return {
    operationId,
    partitionId: operationSnapshot?.partitionId || null,
    ...resolveCoordinatorCreatedHandoffDiagnosticDestination(
      owner,
      operationSnapshot,
      options,
    ).logFields,
    workflowStep:
      stopDecision.workflowStep || operationSnapshot?.workflowStep || null,
    degenerateSnapshot: stopDecision.degenerateSnapshot === true,
    operationBudgetDeadlineMs:
      stopDecision.operationBudgetDeadlineMs || null,
  };
}

function retryCoordinatorCreatedRemoteHandoffFromSnapshot(
  owner,
  operationId,
  operationSnapshot,
  options,
) {
  const stopDecision = resolveSnapshotHandoffRetryStop(
    owner,
    operationSnapshot,
    options,
  );
  if (stopDecision.stop) {
    logCoordinatorHandoffRetryStopped(
      owner,
      operationSnapshot,
      buildSnapshotHandoffRetryLogFields(
        owner,
        operationId,
        operationSnapshot,
        options,
        stopDecision,
      ),
      stopDecision.timedOut,
    );
    owner.clearCreatedOperationHandoffRetry(operationId);
    return false;
  }
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.COORDINATOR_HANDOFF_RETRY_FROM_SNAPSHOT,
    buildSnapshotHandoffRetryLogFields(
      owner,
      operationId,
      operationSnapshot,
      options,
    ),
  );
  return owner.wakeCoordinatorCreatedRemoteOwner(
    owner.cloneOperationSnapshot(operationSnapshot),
    options,
  );
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
    !owner.shouldRetryCoordinatorCreatedRemoteHandoff(operation, options) ||
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
        if (!currentOperation) {
          return retryCoordinatorCreatedRemoteHandoffFromSnapshot(
            owner,
            operationId,
            operationSnapshot,
            options,
          );
        }
        if (
          owner.repository.isOperationTerminal(currentOperation) ||
          !owner.shouldRetryCoordinatorCreatedRemoteHandoff(
            currentOperation,
            options,
          )
        ) {
          owner.clearCreatedOperationHandoffRetry(operationId);
          return false;
        }
        const handoffTimeoutDecision =
          owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
            currentOperation,
            Date.now(),
            options,
          );
        if (handoffTimeoutDecision.shouldStop) {
          logCoordinatorHandoffRetryStopped(
            owner,
            currentOperation,
            {
              operationId,
              partitionId: currentOperation?.partitionId || null,
              ...resolveCoordinatorCreatedHandoffDiagnosticDestination(
                owner,
                currentOperation,
                options,
              ).logFields,
              workflowStep: handoffTimeoutDecision.workflowStep,
              operationBudgetDeadlineMs:
                handoffTimeoutDecision.operationBudgetDeadlineMs,
            },
            true,
          );
          owner.clearCreatedOperationHandoffRetry(operationId);
          return false;
        }
        return owner.wakeCoordinatorCreatedRemoteOwner(
          currentOperation,
          options,
        );
      }).catch((retryError) => {
        owner.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
          operationSnapshot,
          retryError,
          options,
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
  owner.createdOperationHandoffRetryModeByOperationId.set(
    operationId,
    options.handoffMode ||
      COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.INITIAL_DISPATCH,
  );
  const ownerNodeId =
    owner.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
  if (ownerNodeId) {
    owner.createdOperationHandoffRetryTargetNodeByOperationId.set(
      operationId,
      ownerNodeId,
    );
  }
  return true;
}

export {
  COORDINATOR_CREATED_REMOTE_HANDOFF_MODE,
  buildCoordinatorCreatedDispatchIngress,
  buildCoordinatorCreatedDispatchRow,
  buildCoordinatorCreatedRemoteHandoffTimeoutDecision,
  canContinueCoordinatorCreatedRemoteHandoff,
  cloneOperationSnapshot,
  isCoordinatorCreatedOperationLocallyOwned,
  reportCoordinatorHandoffStepTimeoutStop,
  resolveCoordinatorCreatedOperationOwnerNodeId,
  resolveCoordinatorCreatedHandoffDiagnosticDestination,
  resolveExecutorOutcomeRemoteOwnerHandoffMode,
  scheduleCoordinatorCreatedRemoteHandoffFollowUp,
  shouldRetryCoordinatorCreatedRemoteHandoff,
};
