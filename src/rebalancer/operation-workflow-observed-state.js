import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  NUM,
  TYPEOF,
  OperationType,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Apply observed operation state updates to target operation.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} targetOperation
 * @param {Object} sourceOperation
 */
function applyObservedOperationState(context, targetOperation, sourceOperation) {
  if (!targetOperation || !sourceOperation) {
    return;
  }
  const operationType = sourceOperation.type || targetOperation.type;
  const retainedStepsHistory = Array.isArray(targetOperation.stepsHistory) ?
    targetOperation.stepsHistory :
    [];
  const observedStepsHistory = Array.isArray(sourceOperation.stepsHistory) ?
    sourceOperation.stepsHistory :
    [];
  const adoptedStepsHistory =
    observedStepsHistory.length > NUM.ZERO ?
      observedStepsHistory :
      retainedStepsHistory;
  const clonedStepsHistory = adoptedStepsHistory.map((entry) => {
    return entry && typeof entry === TYPEOF.OBJECT ? {...entry} : entry;
  });
  if (operationType === OperationType.REPLACE) {
    const retainedSourceReplicaId =
      context.repository.getReplaceSourceReplicaId(targetOperation) ||
      targetOperation.sourceReplicaId ||
      null;
    const observedSourceReplicaId =
      context.repository.getReplaceSourceReplicaId(sourceOperation) ||
      sourceOperation.sourceReplicaId ||
      null;
    const canonicalSourceReplicaId =
      retainedSourceReplicaId || observedSourceReplicaId;
    const retainedTargetReplicaId =
      context.repository.getReplaceTargetReplicaId(targetOperation);
    const observedReplicaId =
      typeof sourceOperation.replicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      sourceOperation.replicaId.length > NUM.ZERO ?
        sourceOperation.replicaId :
        null;
    const observedTargetReplicaId =
      typeof canonicalSourceReplicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      canonicalSourceReplicaId.length > NUM.ZERO &&
      typeof observedReplicaId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      observedReplicaId !== canonicalSourceReplicaId ?
        observedReplicaId :
        null;
    const canonicalTargetReplicaId =
      retainedTargetReplicaId || observedTargetReplicaId;
    if (
      typeof canonicalTargetReplicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      canonicalTargetReplicaId.length > NUM.ZERO
    ) {
      targetOperation.replicaId = canonicalTargetReplicaId;
    }
    if (
      typeof canonicalSourceReplicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      canonicalSourceReplicaId.length > NUM.ZERO
    ) {
      targetOperation.sourceReplicaId = canonicalSourceReplicaId;
      const hasObservedSourceReplicaMetadata = clonedStepsHistory.some(
        (entry) => {
          return (
            entry &&
            typeof entry === TYPEOF.OBJECT &&
            entry[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] ===
              canonicalSourceReplicaId
          );
        },
      );
      if (
        !hasObservedSourceReplicaMetadata &&
        clonedStepsHistory.length > NUM.ZERO &&
        clonedStepsHistory[NUM.ZERO] &&
        typeof clonedStepsHistory[NUM.ZERO] === TYPEOF.OBJECT
      ) {
        clonedStepsHistory[NUM.ZERO] = {
          ...clonedStepsHistory[NUM.ZERO],
          [OPERATION_METADATA_KEY.SOURCE_REPLICA_ID]:
            canonicalSourceReplicaId,
        };
      }
    }
  } else {
    targetOperation.replicaId = sourceOperation.replicaId;
    targetOperation.sourceReplicaId = sourceOperation.sourceReplicaId;
  }
  targetOperation.workflowStep = sourceOperation.workflowStep;
  targetOperation.status = sourceOperation.status;
  targetOperation.updatedAt = sourceOperation.updatedAt;
  targetOperation.completedAt = sourceOperation.completedAt;
  targetOperation.errorMessage = sourceOperation.errorMessage;
  targetOperation.stepsHistory = clonedStepsHistory;
}

/**
 * Adopt the most advanced observed state for a REPLACE operation.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<Object|null>}
 */
async function adoptMostAdvancedObservedReplaceState(context, operation) {
  if (
    !operation ||
    operation.type !== OperationType.REPLACE ||
    typeof operation.operationId !==
      OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
    operation.operationId.length === NUM.ZERO
  ) {
    return null;
  }

  const localRank = context.getOperationWorkflowStepRank(operation);
  let selectedOperation = null;
  let selectedRank = localRank;
  const maybeSelectOperation = (candidate) => {
    if (!candidate || !context.repository.isOperationLocallyOwned(candidate)) {
      return;
    }
    const candidateRank = context.getOperationWorkflowStepRank(candidate);
    if (candidateRank > selectedRank) {
      selectedOperation = candidate;
      selectedRank = candidateRank;
    }
  };

  const cachedRow = context.repository.getReplicaOperationRowFromCache(
    operation.operationId,
  );
  if (cachedRow) {
    maybeSelectOperation(context.repository.rowToOperation(cachedRow));
  }

  const authoritativeOperation =
    await context.repository.queryAuthoritativeOperationById(
      operation.operationId,
      {requireOwnerRpcRead: true},
    );
  maybeSelectOperation(authoritativeOperation);

  if (!selectedOperation) {
    return null;
  }
  applyObservedOperationState(context, operation, selectedOperation);
  return selectedOperation;
}

export {
  applyObservedOperationState,
  adoptMostAdvancedObservedReplaceState,
};
