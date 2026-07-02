import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  isPriorityControlPlanePartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Replays REPLACE source-removal from authoritative replica row.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<boolean>}
 */
async function replayReplaceActiveSourceRemovalFromAuthoritative(context, operation) {
  if (
    !operation ||
    operation.type !== OperationType.REPLACE ||
    typeof operation.operationId !==
      OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
    operation.operationId.length === 0
  ) {
    return false;
  }
  const authoritativeOperation =
    await context.repository.queryAuthoritativeOperationById(
      operation.operationId,
      {requireOwnerRpcRead: true},
    );
  if (
    !authoritativeOperation ||
    authoritativeOperation.workflowStep !== WORKFLOW_STEP.ACTIVE ||
    !context.repository.isOperationLocallyOwned(authoritativeOperation)
  ) {
    return false;
  }
  await context.executeOperationFromReconcilePath(authoritativeOperation);
  return true;
}

/**
 * Replays REPLACE source-removal from observed target active evidence.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<boolean>}
 */
async function replayReplaceActiveSourceRemovalFromObservedTarget(context, operation) {
  if (
    !operation ||
    operation.type !== OperationType.REPLACE ||
    !context.repository.isOperationLocallyOwned(operation) ||
    !isPriorityControlPlanePartition({
      partitionId: operation.partitionId,
    })
  ) {
    return false;
  }
  const activeOperation = {
    ...operation,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    status: ReplicaStatus.ACTIVE,
  };
  const replaceResumeResult =
    await context.executeOperationFromReconcilePath(activeOperation);
  if (replaceResumeResult?.skipped === true) {
    context.ensurePriorityActiveReplaceRetryArmed(activeOperation);
  }
  return true;
}

export {
  replayReplaceActiveSourceRemovalFromAuthoritative,
  replayReplaceActiveSourceRemovalFromObservedTarget,
};
