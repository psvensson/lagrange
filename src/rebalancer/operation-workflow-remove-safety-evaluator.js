import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  buildPriorityRecoveryBlockedPartitionIds,
  classifySystemPartition,
  normalizeReplicaRowNodeIds,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX =
  ' operation visibility is deferred for safe removal';

// Scopes for the single authoritative post-removal quorum predicate. Each names a
// distinct floor that the remove-safety evaluation enforces at a different call site —
// they are NOT three copies of one floor (see projectQuorumAfterRemoval).
const QUORUM_PROJECTION_SCOPE = Object.freeze({
  // Voter-ready ROW count vs minReplicaCount, on the non-completion-safe path.
  SIMPLE_FLOOR: 'simple-floor',
  // Voter-ready count vs minReplicaCount on the completion-safe (R1) path, where the
  // OPTIMISTIC recovery-projection node-union may raise the count (the documented
  // over-removal seam — recoveryProjectionNodeIds can include catch-up learners).
  COMPLETION_SAFE_FLOOR: 'completion-safe-floor',
  // Distinct-NODE spread vs the published requiredDistinctNodeCount.
  PUBLISHED_SPREAD: 'published-spread',
});

/**
 * One authoritative projection of the post-removal quorum, shared by the three floor
 * sites in this module. Pure and synchronous — the caller resolves the async planning
 * snapshot (see resolvePriorityRecoveryQuorumProjection) and passes its
 * recoveryProjectionNodeIds in. It does NOT collapse the three floors into one uniform
 * rule: the `scope` parameter is the explicit encoding of today's asymmetry (the
 * completion-safe path counts the optimistic node-union; the others do not), so the
 * asymmetry lives in one function instead of three drifting call sites. The structured
 * result exposes BOTH the strict `projectedVoterReadyCount` and the optimistic
 * `effectiveProjectedVoterReadyCount`, so a future over-removal fix has a single place to
 * branch on `completionSafe && effectiveProjectedVoterReadyCount > projectedVoterReadyCount`.
 * This is a behavior-PRESERVING consolidation; it changes no accept/defer decision.
 * @param {Object} input
 * @returns {Object}
 */
function projectQuorumAfterRemoval(input) {
  const projectedVoterReadyRows = Array.isArray(input.projectedVoterReadyRows) ?
    input.projectedVoterReadyRows :
    [];
  const projectedVoterReadyCount = projectedVoterReadyRows.length;
  const recoveryProjectionNodeIds = Array.isArray(input.recoveryProjectionNodeIds) ?
    input.recoveryProjectionNodeIds :
    null;
  const effectiveProjectedVoterReadyCount =
    input.completionSafe === true && recoveryProjectionNodeIds ?
      Math.max(projectedVoterReadyCount, recoveryProjectionNodeIds.length) :
      projectedVoterReadyCount;
  const requiredDistinctNodeCount = Number(input.requiredDistinctNodeCount);

  let floorSatisfied = true;
  let reason = null;
  if (input.scope === QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR) {
    floorSatisfied = projectedVoterReadyCount >= input.minReplicaCount;
    if (!floorSatisfied) {
      reason = {kind: 'below-min', got: projectedVoterReadyCount, need: input.minReplicaCount};
    }
  } else if (input.scope === QUORUM_PROJECTION_SCOPE.COMPLETION_SAFE_FLOOR) {
    floorSatisfied = effectiveProjectedVoterReadyCount >= input.minReplicaCount;
    if (!floorSatisfied) {
      reason = {kind: 'below-min', got: effectiveProjectedVoterReadyCount, need: input.minReplicaCount};
    }
  } else if (input.scope === QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD) {
    const projectedDistinctNodeCount = normalizeReplicaRowNodeIds(
      projectedVoterReadyRows,
    ).length;
    floorSatisfied =
      !Number.isFinite(requiredDistinctNodeCount) ||
      requiredDistinctNodeCount <= 1 ||
      projectedDistinctNodeCount >= requiredDistinctNodeCount;
    if (!floorSatisfied) {
      reason = {kind: 'below-spread', got: projectedDistinctNodeCount, need: requiredDistinctNodeCount};
    }
    return Object.freeze({
      projectedVoterReadyCount,
      effectiveProjectedVoterReadyCount,
      projectedDistinctNodeCount,
      requiredDistinctNodeCount,
      completionSafe: input.completionSafe === true,
      floorSatisfied,
      reason,
    });
  }

  return Object.freeze({
    projectedVoterReadyCount,
    effectiveProjectedVoterReadyCount,
    minReplicaCount: input.minReplicaCount,
    completionSafe: input.completionSafe === true,
    floorSatisfied,
    reason,
  });
}

/**
 * Async wrapper for the completion-safe floor: resolves the priority-recovery planning
 * snapshot, derives the optimistic recovery-projection node-union, and runs the pure
 * predicate. Equivalent to the former resolvePriorityRecoveryProjectedVoterReadyCount
 * (no snapshot => effective count is just the row count), now returning the structured
 * projection instead of a bare number.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @param {Object[]} projectedVoterReadyRows
 * @param {number} minReplicaCount
 * @param {boolean} completionSafe
 * @returns {Promise<Object>}
 */
async function resolvePriorityRecoveryQuorumProjection(
  context,
  operation,
  projectedVoterReadyRows,
  minReplicaCount,
  completionSafe,
) {
  const planningSnapshot =
    await context.getPriorityRecoveryPlanningSnapshot(operation);
  let recoveryProjectionNodeIds = null;
  if (planningSnapshot && typeof planningSnapshot === 'object') {
    const priorityRecoveryContext =
      context.buildPriorityRecoveryAssessmentContextForOperation(
        operation,
        planningSnapshot,
      );
    recoveryProjectionNodeIds = context.resolvePriorityRemoveSafetyMembershipSnapshot(
      planningSnapshot,
      priorityRecoveryContext,
      projectedVoterReadyRows,
    ).recoveryProjectionNodeIds;
  }
  return projectQuorumAfterRemoval({
    projectedVoterReadyRows,
    minReplicaCount,
    recoveryProjectionNodeIds,
    completionSafe,
    scope: QUORUM_PROJECTION_SCOPE.COMPLETION_SAFE_FLOOR,
  });
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
    !classifySystemPartition({
      partitionId: operation.partitionId,
    }).priorityControlPlane
  ) {
    return null;
  }

  const planningSnapshot =
    await context.getPriorityRecoveryPlanningSnapshot(operation);
  if (!planningSnapshot || typeof planningSnapshot !== 'object') {
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
    !classifySystemPartition({
      partitionId: operation.partitionId,
    }).priorityControlPlane
  ) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const planningSnapshot =
    await context.getPriorityRecoveryPlanningSnapshot(operation);
  if (!planningSnapshot || typeof planningSnapshot !== 'object') {
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
    membershipSnapshot.recoveryProjectionNodeIds.length === 0 &&
    projectedVoterReadyRows.length > 0
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

  if (membershipSnapshot.missingMembershipNodeIds.length > 0) {
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
  const spreadFloor = projectQuorumAfterRemoval({
    projectedVoterReadyRows,
    requiredDistinctNodeCount,
    scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
  });
  if (!spreadFloor.floorSatisfied) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED +
        OPERATION_WORKFLOW_OWNER_LITERAL.REQUIREMENT +
        ` (${spreadFloor.projectedDistinctNodeCount}/${requiredDistinctNodeCount})`,
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

  if (
    !classifySystemPartition({partitionId: operation.partitionId}).systemTable
  ) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  // Concurrent partition operation check
  const allOps = await context.repository.getOperationsByEntity(
    'partition',
    operation.partitionId,
  );
  // CL-043: a persist-failed concurrent op (coordination row never committed)
  // stays non-terminal with no terminal-timeout anchor and would otherwise block
  // every peer surplus-drain forever. Exclude ops whose configured step timeout
  // has already elapsed — they are reaper candidates, not genuinely in-flight.
  const concurrentOperationNowMs = context.resolveTimeoutCheckNowMs();
  let concurrentActiveOp = null;
  for (const op of allOps) {
    if (
      op.operationId === operation.operationId ||
      context.repository.isOperationTerminal(op) ||
      context.isConcurrentOperationStalePastStepTimeout(
        op,
        concurrentOperationNowMs,
      )
    ) {
      continue;
    }
    // CL-044: an op stuck SYNCING/moving to a down target makes no progress yet
    // would head-of-line-block this peer recovery that targets a LIVE node. Its
    // ~1s dispatch-retry loop keeps the step-timeout staleness clock fresh, so
    // the exclusion above can lag the recovery deadline. An op whose move target
    // fails a live ping is not genuinely in-flight, so it must not hold the
    // partition serialization lock. The independent voter-ready-minimum,
    // published-membership, and per-peer-ping checks below still protect quorum
    // for the operation that is now allowed to proceed.
    if (await context.isConcurrentOperationTargetUncontactable(op)) {
      continue;
    }
    concurrentActiveOp = op;
    break;
  }
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
    criticalReplicaRows.length === 0
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
        (typeof operation.replicaId === 'string' &&
        operation.replicaId.length > 0 ?
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
  const simpleFloor = projectQuorumAfterRemoval({
    projectedVoterReadyRows,
    minReplicaCount,
    completionSafe: priorityRecoveryCompletionSafe,
    scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  if (!priorityRecoveryCompletionSafe && !simpleFloor.floorSatisfied) {
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
        currentVoterReadyRows,
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
    classifySystemPartition({
      partitionId: operation?.partitionId,
    }).priorityControlPlane
  ) {
    const completionSafeFloor =
      await resolvePriorityRecoveryQuorumProjection(
        context,
        operation,
        projectedVoterReadyRows,
        minReplicaCount,
        priorityRecoveryCompletionSafe,
      );
    if (!completionSafeFloor.floorSatisfied) {
      return context.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        `Critical partition ${operation.partitionId}` +
          OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
          ` (${completionSafeFloor.effectiveProjectedVoterReadyCount}/${minReplicaCount})`,
      );
    }
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
  projectQuorumAfterRemoval,
  QUORUM_PROJECTION_SCOPE,
};
