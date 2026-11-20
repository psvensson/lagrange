import {isDeepStrictEqual} from 'node:util';
import {
  AUTHORITATIVE_REPLICA_OBSERVATION_STATE,
  readAuthoritativeReplicaLifecycleObservationState,
} from './replica-operation-repository-observation-methods.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {resolvePriorityRecoverySupersededTargetDecision} from './operation-workflow-priority-recovery-superseded-target-decision.js';

const {
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Build priority recovery superseded target error message.
 * @param {Object} operation
 * @param {string} targetNodeId
 * @param {string[]} eligibleNodeIds
 * @param {Object} targetObservation
 * @returns {Object}
 */
function buildPriorityRecoverySupersededTargetFailure(
  operation,
  targetNodeId,
  eligibleNodeIds,
  targetObservation,
) {
  const error = (
    OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE +
    targetNodeId +
    OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR +
    operation.partitionId +
    OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN +
    eligibleNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE) +
    OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN
  );
  return Object.freeze({
    error,
    operationId: operation.operationId,
    partitionId: operation.partitionId,
    replicaId: operation.replicaId,
    targetNodeId,
    targetObservation,
  });
}

async function isPriorityRecoverySupersessionCurrent(owner, operation, failure) {
  if (
    failure.operationId !== operation.operationId ||
    failure.partitionId !== operation.partitionId ||
    failure.replicaId !== operation.replicaId ||
    failure.targetNodeId !== operation.targetNodeId
  ) {
    return false;
  }
  const prior = failure.targetObservation;
  const current = await owner.observePriorityRecoveryTarget(operation);
  const state = readAuthoritativeReplicaLifecycleObservationState(current);
  if (state !== readAuthoritativeReplicaLifecycleObservationState(prior)) {
    return false;
  }
  if (state === AUTHORITATIVE_REPLICA_OBSERVATION_STATE.ABSENT) {
    return true;
  }
  return state === AUTHORITATIVE_REPLICA_OBSERVATION_STATE.OBSERVED &&
    prior.lifecycleStatus === current.lifecycleStatus &&
    isDeepStrictEqual(prior.observedTargetIdentity, current.observedTargetIdentity) &&
    isDeepStrictEqual(prior.lifecyclePrecondition, current.lifecyclePrecondition);
}

/**
 * Get priority recovery superseded target failure from context.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @param {Object|null} priorityRecoveryContext
 * @returns {Promise<Object|null>}
 */
async function getPriorityRecoverySupersededTargetFailureFromContext(
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

  const targetReadiness = context.controlPlaneReadinessService.getNodeReadinessSync(
    targetNodeId, {
      decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
      participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
    },
  );
  const supersededTargetDecision =
    await resolvePriorityRecoverySupersededTargetDecision({
      operation,
      priorityRecoveryContext,
      targetReadiness,
      observeTarget: () => context.observePriorityRecoveryTarget(operation),
    });
  if (!supersededTargetDecision.isFailure) {
    return null;
  }

  return buildPriorityRecoverySupersededTargetFailure(
    operation,
    targetNodeId,
    supersededTargetDecision.eligibleNodeIds,
    supersededTargetDecision.targetObservation,
  );
}

/**
 * Get priority recovery superseded target failure.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<Object|null>}
 */
async function getPriorityRecoverySupersededTargetFailure(context, operation) {
  const planningSnapshot =
    await context.readAvailablePriorityRecoveryPlanningSnapshot(operation);
  const priorityContext = context.buildPriorityRecoveryAssessmentContextForOperation(
    operation,
    planningSnapshot,
  );
  return getPriorityRecoverySupersededTargetFailureFromContext(
    context,
    operation,
    priorityContext,
  );
}

export {
  buildPriorityRecoverySupersededTargetFailure,
  getPriorityRecoverySupersededTargetFailureFromContext,
  getPriorityRecoverySupersededTargetFailure,
  isPriorityRecoverySupersessionCurrent,
};
