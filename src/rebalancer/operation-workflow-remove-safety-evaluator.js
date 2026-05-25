import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  NUM,
  TYPEOF,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  buildPriorityRecoveryBlockedPartitionIds,
  isPriorityControlPlanePartition,
  normalizeReplicaRowNodeIds,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX =
  ' operation visibility is deferred for safe removal';

/**
 * Checks if priority publication minimum replica count should be preserved.
 * @param {Object} operation
 * @param {number} projectedVoterReadyCount
 * @param {number} minReplicaCount
 * @returns {boolean}
 */
function shouldPreservePriorityPublicationMinimumReplicaCount(
  operation,
  projectedVoterReadyCount,
  minReplicaCount,
) {
  return (
    isPriorityControlPlanePartition({
      partitionId: operation?.partitionId,
    }) &&
    projectedVoterReadyCount < minReplicaCount
  );
}

/**
 * Evaluate priority recovery completion remove safety.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<Object|null>}
 */
async function evaluatePriorityRecoveryCompletionRemoveSafety(context, operation) {
  if (
    !operation ||
    !isPriorityControlPlanePartition({
      partitionId: operation.partitionId,
    })
  ) {
    return null;
  }

  const planningSnapshot =
    await context.getPriorityRecoveryPlanningSnapshot(operation);
  if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
    return null;
  }

  const priorityRecoveryContext =
    context.buildPriorityRecoveryAssessmentContextForOperation(
      operation,
      planningSnapshot,
    );
  const supersededTargetError =
    context.getPriorityRecoverySupersededTargetErrorFromContext(
      operation,
      priorityRecoveryContext,
    );
  if (supersededTargetError) {
    return context.buildFailedRemoveSafetyEvaluation(supersededTargetError);
  }

  if (
    !context.isPriorityRecoveryRemoveSafetySatisfied(
      priorityRecoveryContext?.completion || null,
    )
  ) {
    return null;
  }

  return context.buildSafeRemoveSafetyEvaluation();
}

/**
 * Evaluate priority published membership remove safety.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @param {Object[]} projectedVoterReadyRows
 * @returns {Promise<Object>}
 */
async function evaluatePriorityPublishedMembershipRemoveSafety(
  context,
  operation,
  projectedVoterReadyRows,
) {
  if (
    !operation ||
    !isPriorityControlPlanePartition({
      partitionId: operation.partitionId,
    })
  ) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const planningSnapshot =
    await context.getPriorityRecoveryPlanningSnapshot(operation);
  if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE,
    );
  }
  const priorityRecoveryContext =
    context.buildPriorityRecoveryAssessmentContextForOperation(
      operation,
      planningSnapshot,
    );
  const priorityRecoveryCompletion =
    priorityRecoveryContext?.completion || null;
  if (
    context.isPriorityRecoveryRemoveSafetySatisfied(priorityRecoveryCompletion)
  ) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const supersededTargetError =
    context.getPriorityRecoverySupersededTargetErrorFromContext(
      operation,
      priorityRecoveryContext,
    );
  if (supersededTargetError) {
    return context.buildFailedRemoveSafetyEvaluation(supersededTargetError);
  }
  if (
    priorityRecoveryCompletion?.state ===
    PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED
  ) {
    const replaceRemovePhase =
      context.repository.isReplaceRemovePhase(operation);
    const deferReason = await context.resolveRemoveSafetyDeferredReason(
      operation,
      replaceRemovePhase,
    );
    const deferredVisibilityError =
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
      operation.partitionId +
      PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX;
    if (!deferReason) {
      return context.buildFailedRemoveSafetyEvaluation(deferredVisibilityError);
    }
    return context.buildDeferredRemoveSafetyEvaluation(
      deferredVisibilityError,
      deferReason,
    );
  }
  const priorityPartitionSummary =
    priorityRecoveryContext?.priorityPartitionSummary || null;
  const membershipSnapshot =
    context.resolvePriorityRemoveSafetyMembershipSnapshot(
      planningSnapshot,
      priorityRecoveryContext,
      projectedVoterReadyRows,
    );
  if (
    !membershipSnapshot.publishedActiveNodeIdsPresent &&
    membershipSnapshot.recoveryProjectionNodeIds.length === NUM.ZERO &&
    projectedVoterReadyRows.length > NUM.ZERO
  ) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN +
        membershipSnapshot.membershipSource +
        OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN +
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFE_REMOVAL_UNAVAILABLE_SUFFIX,
    );
  }

  if (membershipSnapshot.missingMembershipNodeIds.length > NUM.ZERO) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN +
        membershipSnapshot.membershipSource +
        OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN +
        OPERATION_WORKFLOW_OWNER_LITERAL.DOES_NOT_INCLUDE_PROJECTED_VOTER_DASH_READY_NODES +
        membershipSnapshot.missingMembershipNodeIds.join(
          OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE,
        ),
    );
  }

  if (!priorityPartitionSummary) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const blockedPartitionIds = new Set(
    buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary),
  );
  if (
    blockedPartitionIds.has(operation.partitionId) &&
    membershipSnapshot.useRecoveryProjectionMembership !== true
  ) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD_HAS_NOT_CONVERGED,
    );
  }

  const requiredDistinctNodeCount = Number(
    priorityPartitionSummary.requiredDistinctNodeCount,
  );
  if (
    !Number.isFinite(requiredDistinctNodeCount) ||
    requiredDistinctNodeCount <= NUM.ONE
  ) {
    return context.buildSafeRemoveSafetyEvaluation();
  }
  const projectedDistinctNodeCount = normalizeReplicaRowNodeIds(
    projectedVoterReadyRows,
  ).length;
  if (projectedDistinctNodeCount < requiredDistinctNodeCount) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED +
        OPERATION_WORKFLOW_OWNER_LITERAL.REQUIREMENT +
        ` (${projectedDistinctNodeCount}/${requiredDistinctNodeCount})`,
    );
  }

  return context.buildSafeRemoveSafetyEvaluation();
}

/**
 * Evaluate safety validation for REMOVE operations.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @returns {Promise<Object>}
 */
async function evaluateRemoveSafety(context, operation) {
  if (!operation) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const isRemoveInitialDispatch =
    context.isRemoveInitialDispatchPhase(operation);
  const isReplaceRemoveInitialDispatch =
    context.repository.isReplaceRemovePhase(operation);
  if (!isRemoveInitialDispatch && !isReplaceRemoveInitialDispatch) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  if (!context.isCriticalSystemPartition(operation.partitionId)) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  // Concurrent partition operation check
  const allOps = await context.repository.getOperationsByEntity(
    'partition',
    operation.partitionId,
  );
  const concurrentActiveOp = allOps.find(
    (op) =>
      op.operationId !== operation.operationId &&
      !context.repository.isOperationTerminal(op),
  );
  if (concurrentActiveOp) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Quorum check failed: concurrent partition operation ${concurrentActiveOp.operationId} is active`,
    );
  }

  const criticalReplicaRows = await context.getCriticalReplicaRowsForSafety(
    operation.partitionId,
  );
  if (
    !Array.isArray(criticalReplicaRows) ||
    criticalReplicaRows.length === NUM.ZERO
  ) {
    return context.buildFailedRemoveSafetyEvaluation(
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE,
    );
  }

  const removeSafetyReadiness = {
    partitionId: operation.partitionId,
    decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
    participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  };
  const currentVoterReadyRows = criticalReplicaRows.filter((row) =>
    context.isVoterReadyRoutableReplica(row, removeSafetyReadiness),
  );

  const operationReplicaId =
    operation.type === OperationType.REPLACE ?
      context.repository.getReplaceSourceReplicaId(operation) :
      operation.replicaId;

  if (!operationReplicaId) {
    return context.buildFailedRemoveSafetyEvaluation(
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE,
    );
  }

  const removingVoterReady = currentVoterReadyRows.some((row) =>
    context.isOperationReplicaRow(row, {
      ...operation,
      replicaId: operationReplicaId,
    }),
  );
  const removingReplicaRow =
    criticalReplicaRows.find((row) =>
      context.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId,
      }),
    ) || null;
  const replacementReplicaId =
    operation.type === OperationType.REPLACE ?
      context.repository.getReplaceTargetReplicaId(operation) ||
        (typeof operation.replicaId === TYPEOF.STRING &&
        operation.replicaId.length > NUM.ZERO ?
          operation.replicaId :
          null) :
      null;
  const replacementReplicaRow =
    replacementReplicaId === null ?
      null :
      criticalReplicaRows.find((row) =>
        context.isOperationReplicaRow(row, {
          ...operation,
          replicaId: replacementReplicaId,
        }),
      ) || null;
  const replacementLeaderCandidateRow =
    await context.resolvePriorityPublicationReplacementLeaderCandidateRow(
      operation,
      replacementReplicaRow,
      currentVoterReadyRows,
      operationReplicaId,
    );

  const requiresSourceLeaderHandoff =
    operation.type === OperationType.REPLACE &&
    context.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId);
  const priorityRecoveryCompletionEvaluation =
    await context.evaluatePriorityRecoveryCompletionRemoveSafety(operation);
  const priorityRecoveryCompletionSafe =
    priorityRecoveryCompletionEvaluation?.classification ===
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE;

  if (!removingVoterReady && !requiresSourceLeaderHandoff) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  if (isReplaceRemoveInitialDispatch) {
    if (!replacementReplicaId) {
      return context.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          operation.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA +
          OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE,
      );
    }
    const replacementReplicaVoterReady =
      priorityRecoveryCompletionSafe === true ?
        context.isVoterReadyReplicaTopology(replacementReplicaRow) :
        context.isVoterReadyRoutableReplica(
          replacementReplicaRow,
          removeSafetyReadiness,
        ) ||
          context.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
            operation,
            replacementReplicaRow,
          );
    if (!replacementReplicaVoterReady) {
      return context.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          operation.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 +
          replacementReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.IS_NOT_VOTER_DASH_READY,
      );
    }
  }

  if (priorityRecoveryCompletionEvaluation) {
    if (!requiresSourceLeaderHandoff || !priorityRecoveryCompletionSafe) {
      return priorityRecoveryCompletionEvaluation;
    }
  }

  const minReplicaCount = await context.getCriticalMinReplicaCount(
    operation.partitionId,
  );
  const projectedVoterReadyRows = currentVoterReadyRows.filter(
    (row) =>
      !context.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId,
      }),
  );
  const projectedVoterReadyCount = projectedVoterReadyRows.length;
  if (
    !priorityRecoveryCompletionSafe &&
    projectedVoterReadyCount < minReplicaCount
  ) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
        ` (${projectedVoterReadyCount}/${minReplicaCount})`,
    );
  }

  if (!priorityRecoveryCompletionSafe) {
    const priorityPublishedMembershipRemoveSafetyEvaluation =
      await context.evaluatePriorityPublishedMembershipRemoveSafety(
        operation,
        projectedVoterReadyRows,
      );
    if (
      priorityPublishedMembershipRemoveSafetyEvaluation.classification !==
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE
    ) {
      return priorityPublishedMembershipRemoveSafetyEvaluation;
    }
  }

  const replacementLeaderRetargetCandidateAvailable =
    requiresSourceLeaderHandoff &&
    context.hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
      operation,
      currentVoterReadyRows,
      operationReplicaId,
      replacementLeaderCandidateRow,
    );
  const priorityPublicationLeaderRemoveSafetyEvaluation =
    await context.evaluatePriorityPublicationLeaderRemoveSafety(
      operation,
      removingReplicaRow,
      replacementLeaderCandidateRow,
      {
        priorityRecoveryCompletionSafe,
        replacementLeaderElectionNotFoundTerminal:
          requiresSourceLeaderHandoff &&
          !replacementLeaderRetargetCandidateAvailable,
        replacementLeaderRetargetCandidateAvailable,
      },
    );
  if (
    priorityPublicationLeaderRemoveSafetyEvaluation?.classification ===
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE &&
    priorityRecoveryCompletionSafe &&
    shouldPreservePriorityPublicationMinimumReplicaCount(
      operation,
      projectedVoterReadyCount,
      minReplicaCount,
    )
  ) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
        ` (${projectedVoterReadyCount}/${minReplicaCount})`,
    );
  }
  if (priorityPublicationLeaderRemoveSafetyEvaluation &&
      priorityPublicationLeaderRemoveSafetyEvaluation.classification !==
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE) {
    return priorityPublicationLeaderRemoveSafetyEvaluation;
  }

  if (context.messageRouter) {
    const router = context.messageRouter;
    for (const row of projectedVoterReadyRows) {
      const nodeId = row.nodeId || row.node_id;
      if (nodeId && nodeId !== context.nodeId) {
        let isConnected = true;
        if (typeof router.getConnectionState === 'function') {
          if (router.getConnectionState(nodeId) === 'disconnected') {
            isConnected = false;
          }
        }
        if (isConnected && typeof router.pingNode === 'function') {
          const pingResult = await router.pingNode(nodeId).catch(() => false);
          if (!pingResult) {
            isConnected = false;
          }
        }
        if (!isConnected) {
          console.warn(
            `Quorum check failed: peer node ${nodeId} is uncontactable or disconnected`,
          );
          return context.buildDeferredRemoveSafetyEvaluationForOperation(
            operation,
            `Quorum check failed: peer node ${nodeId} is uncontactable`,
          );
        }
      }
    }
  }

  if (priorityPublicationLeaderRemoveSafetyEvaluation) {
    return priorityPublicationLeaderRemoveSafetyEvaluation;
  }

  return context.buildSafeRemoveSafetyEvaluation();
}

export {
  evaluatePriorityRecoveryCompletionRemoveSafety,
  evaluatePriorityPublishedMembershipRemoveSafety,
  evaluateRemoveSafety,
};
