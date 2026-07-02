import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {resolvePriorityRecoverySupersededTargetDecision} from './operation-workflow-priority-recovery-superseded-target-decision.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Build priority recovery superseded target error message.
 * @param {Object} operation
 * @param {string} targetNodeId
 * @param {string[]} eligibleNodeIds
 * @returns {string}
 */
function buildPriorityRecoverySupersededTargetError(
  operation,
  targetNodeId,
  eligibleNodeIds,
) {
  return (
    OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE +
    targetNodeId +
    OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR +
    operation.partitionId +
    OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN +
    eligibleNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE) +
    OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN
  );
}

/**
 * Get priority recovery superseded target error from context.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @param {Object|null} priorityRecoveryContext
 * @returns {string|null}
 */
function getPriorityRecoverySupersededTargetErrorFromContext(
  context,
  operation,
  priorityRecoveryContext,
) {
  if (
    !operation ||
    !priorityRecoveryContext ||
    typeof priorityRecoveryContext !== 'object'
  ) {
    return null;
  }

  const targetNodeId = String(operation?.targetNodeId || '').trim();
  if (targetNodeId.length === 0) {
    return null;
  }

  const targetReadiness =
    typeof context.controlPlaneReadinessService?.getNodeReadinessSync ===
      'function' ?
      context.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
        decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
        participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
      }) :
      null;
  const targetLifecycleStatus =
    context.repository &&
    typeof context.repository.getObservedReplicaStatusFromCache ===
      'function' ?
      context.repository.getObservedReplicaStatusFromCache(
        operation.replicaId,
        operation.partitionId,
        targetNodeId,
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      ) :
      null;

  const supersededTargetDecision =
    resolvePriorityRecoverySupersededTargetDecision({
      operation,
      priorityRecoveryContext,
      targetReadiness,
      targetLifecycleStatus,
    });
  if (!supersededTargetDecision.isFailure) {
    return null;
  }

  return buildPriorityRecoverySupersededTargetError(
    operation,
    targetNodeId,
    supersededTargetDecision.eligibleNodeIds,
  );
}

/**
 * Get priority recovery superseded target error.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<string|null>}
 */
async function getPriorityRecoverySupersededTargetError(context, operation) {
  const planningSnapshot =
    await context.getPriorityRecoveryPlanningSnapshot(operation);
  const priorityContext = context.buildPriorityRecoveryAssessmentContextForOperation(
    operation,
    planningSnapshot,
  );
  return getPriorityRecoverySupersededTargetErrorFromContext(
    context,
    operation,
    priorityContext,
  );
}

export {
  buildPriorityRecoverySupersededTargetError,
  getPriorityRecoverySupersededTargetErrorFromContext,
  getPriorityRecoverySupersededTargetError,
};
