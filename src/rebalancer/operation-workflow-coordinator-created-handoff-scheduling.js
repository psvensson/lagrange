import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from './executor-outcome-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_LOG_MSG,
  TIMEOUT_BUDGET_DEFAULT,
  WORKFLOW_STEP,
  classifySystemPartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const COORDINATOR_CREATED_REMOTE_HANDOFF_MODE = Object.freeze({
  NONE: 'none',
  INITIAL_DISPATCH: 'initial_dispatch',
  TARGET_EXECUTOR_OUTCOME: 'target_executor_outcome',
});

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
    operation?.type === OperationType.ADD ||
    operation?.type === OperationType.REPLACE;
  const targetCreateInProgress =
    operation?.workflowStep === WORKFLOW_STEP.CREATING ||
    operation?.workflowStep === WORKFLOW_STEP.SYNCING;
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
    owner.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.COORDINATOR_HANDOFF_RETRY_STOPPED,
      buildSnapshotHandoffRetryLogFields(
        owner,
        operationId,
        operationSnapshot,
        options,
        stopDecision,
      ),
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
          owner.logger.warn(
            REBALANCE_COORDINATOR_LOG_MSG.COORDINATOR_HANDOFF_RETRY_STOPPED,
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
  resolveCoordinatorCreatedOperationOwnerNodeId,
  resolveCoordinatorCreatedHandoffDiagnosticDestination,
  resolveExecutorOutcomeRemoteOwnerHandoffMode,
  scheduleCoordinatorCreatedRemoteHandoffFollowUp,
  shouldRetryCoordinatorCreatedRemoteHandoff,
};
