import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OperationType,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// Unless some step entry already names the canonical source replica, the
// first entry carries it.
function stampCanonicalSourceReplica(stepsHistory, sourceReplicaId) {
  const hasObservedSourceReplicaMetadata = stepsHistory.some(
    (entry) => {
      return (
        entry &&
        typeof entry === 'object' &&
        entry[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] === sourceReplicaId
      );
    },
  );
  if (
    !hasObservedSourceReplicaMetadata &&
    stepsHistory.length > 0 &&
    stepsHistory[0] &&
    typeof stepsHistory[0] === 'object'
  ) {
    stepsHistory[0] = {
      ...stepsHistory[0],
      [OPERATION_METADATA_KEY.SOURCE_REPLICA_ID]: sourceReplicaId,
    };
  }
}

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
    observedStepsHistory.length > 0 ?
      observedStepsHistory :
      retainedStepsHistory;
  const clonedStepsHistory = adoptedStepsHistory.map((entry) => {
    return entry && typeof entry === 'object' ? {...entry} : entry;
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
      sourceOperation.replicaId.length > 0 ?
        sourceOperation.replicaId :
        null;
    const observedTargetReplicaId =
      typeof canonicalSourceReplicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      canonicalSourceReplicaId.length > 0 &&
      typeof observedReplicaId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      observedReplicaId !== canonicalSourceReplicaId ?
        observedReplicaId :
        null;
    const canonicalTargetReplicaId =
      retainedTargetReplicaId || observedTargetReplicaId;
    if (
      typeof canonicalTargetReplicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      canonicalTargetReplicaId.length > 0
    ) {
      targetOperation.replicaId = canonicalTargetReplicaId;
    }
    if (
      typeof canonicalSourceReplicaId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      canonicalSourceReplicaId.length > 0
    ) {
      targetOperation.sourceReplicaId = canonicalSourceReplicaId;
      stampCanonicalSourceReplica(clonedStepsHistory, canonicalSourceReplicaId);
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
    operation.operationId.length === 0
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

  // A cached row is a hint, with one exception: a terminal row is committed
  // and final, so it is never rewound by a lagging authoritative read.
  const cachedRow = context.repository.getReplicaOperationRowFromCache(
    operation.operationId,
  );
  const cachedOperation = cachedRow ?
    context.repository.rowToOperation(cachedRow) :
    null;
  if (context.repository.isOperationTerminal(cachedOperation)) {
    maybeSelectOperation(cachedOperation);
  }

  const authoritativeOperation =
    await context.repository.queryAuthoritativeOperationById(
      operation.operationId,
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      },
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
