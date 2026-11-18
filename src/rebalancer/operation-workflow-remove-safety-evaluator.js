import {readCommittedNodeFloor} from './operation-workflow-committed-node-floor.js';
import {
  COMMITTED_VOTER_CREDIT_NOT_REQUIRED,
  describeCommittedVoterCreditWait,
  resolveCommittedVoterCredit,
} from './operation-workflow-committed-voter-floor.js';
import {noteReplaceOwnerObservedReplicaRows} from './operation-workflow-replace-owner-wake.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  STOPPING_REMOVE_RESEND,
  STOPPING_REMOVE_RESEND_DEFERRAL,
  classifyStoppingRemoveResend,
} from './operation-workflow-remove-safety-stopping-resend.js';
import {
  evaluateProjectedPeersContactable,
  evaluateReplaceReplacementVoterReady,
  evaluateUniversalPartitionRemoveSafety,
  isRemoveSafetyGuardPassed,
} from './operation-workflow-remove-safety-universal-tier.js';
import {
  evaluateEntityRemoveSafety,
} from './operation-workflow-remove-safety-entity-tier.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {
  evaluateRemovalLeadershipSafety,
} from './operation-workflow-removal-leadership-gate.js';
import {evaluateConcurrentOperationRemoveSafety} from
  './operation-workflow-remove-safety-concurrent-operation.js';
import {
  createRemoveSafetyPlanningSnapshotReader,
  resolveRemoveSafetyPlanningSnapshotReader,
} from './priority-recovery-planning-read.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  SERVICE_TYPE,
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
  // over-removal seam; plain REMOVE only - a REPLACE passes SIMPLE_FLOOR first).
  COMPLETION_SAFE_FLOOR: 'completion-safe-floor',
  // Distinct-NODE spread vs the published requiredDistinctNodeCount.
  PUBLISHED_SPREAD: 'published-spread',
});

/**
 * Project the distinct-node spread floor for one serialized removal.
 * @param {Object} input
 * @param {Object[]} projectedVoterReadyRows
 * @param {number} projectedVoterReadyCount
 * @param {number} effectiveProjectedVoterReadyCount
 * @returns {Object}
 */
function projectPublishedSpreadAfterRemoval(
  input,
  projectedVoterReadyRows,
  projectedVoterReadyCount,
  effectiveProjectedVoterReadyCount,
) {
  const requiredDistinctNodeCount = Number(input.requiredDistinctNodeCount);
  const projectedDistinctNodeCount = normalizeReplicaRowNodeIds(
    projectedVoterReadyRows,
  ).length;
  const currentVoterReadyRows =
    Array.isArray(input.currentVoterReadyRows) &&
    input.currentVoterReadyRows.length > 0 ?
      input.currentVoterReadyRows :
      null;
  const currentDistinctNodeCount = currentVoterReadyRows === null ?
    null :
    normalizeReplicaRowNodeIds(currentVoterReadyRows).length;
  const publishedTargetApplies =
    Number.isFinite(requiredDistinctNodeCount) &&
    requiredDistinctNodeCount > 1;
  // The published value is the convergence destination, not a requirement
  // that every serialized intermediate REPLACE can satisfy by itself. During
  // cold formation a first count-neutral move can take a partition from one
  // node to two while the final target is three. Requiring 3/3 before its
  // source may be removed strands that operation behind the ledger interlock,
  // so the second move that reaches three can never start. The remove-safety
  // owner instead protects the stronger local invariant: a step may close or
  // preserve the current spread deficit, never enlarge it. If callers do not
  // supply a current authoritative row set, retain the old final-target floor
  // (fail closed rather than inferring a weaker baseline).
  const requiredPostRemovalDistinctNodeCount =
    publishedTargetApplies && currentDistinctNodeCount !== null ?
      Math.min(currentDistinctNodeCount, requiredDistinctNodeCount) :
      requiredDistinctNodeCount;
  const floorSatisfied =
    !publishedTargetApplies ||
    projectedDistinctNodeCount >= requiredPostRemovalDistinctNodeCount;
  const reason = floorSatisfied ?
    null :
    {
      kind: 'below-spread',
      got: projectedDistinctNodeCount,
      need: requiredPostRemovalDistinctNodeCount,
    };
  return Object.freeze({
    projectedVoterReadyCount,
    effectiveProjectedVoterReadyCount,
    projectedDistinctNodeCount,
    currentDistinctNodeCount,
    requiredDistinctNodeCount,
    requiredPostRemovalDistinctNodeCount,
    completionSafe: input.completionSafe === true,
    floorSatisfied,
    reason,
  });
}

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

  if (input.scope === QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD) {
    return projectPublishedSpreadAfterRemoval(
      input,
      projectedVoterReadyRows,
      projectedVoterReadyCount,
      effectiveProjectedVoterReadyCount,
    );
  }

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
  readPlanningSnapshot,
) {
  const planningSnapshot = await resolveRemoveSafetyPlanningSnapshotReader(
    context, operation, readPlanningSnapshot)();
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
async function evaluatePriorityRecoveryCompletionRemoveSafety(
  context,
  operation,
  readPlanningSnapshot,
) {
  if (
    !operation ||
    !classifySystemPartition({
      partitionId: operation.partitionId,
    }).priorityControlPlane
  ) {
    return null;
  }

  const planningSnapshot = await resolveRemoveSafetyPlanningSnapshotReader(
    context, operation, readPlanningSnapshot)();
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
  currentVoterReadyRows,
  readPlanningSnapshot,
) {
  if (
    !operation ||
    !classifySystemPartition({
      partitionId: operation.partitionId,
    }).priorityControlPlane
  ) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const planningSnapshot = await resolveRemoveSafetyPlanningSnapshotReader(
    context, operation, readPlanningSnapshot)();
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
      context.repository.isReplaceRemoveDispatchPhase(operation);
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

  // No blanket "priority spread has not converged" defer for a blocked
  // partition: the spread floor below already refuses any removal that
  // would lower the distinct-node spread, and a count-neutral removal while
  // the partition is unspread must not loop on retry (owner decision
  // 2026-10-04).
  const requiredDistinctNodeCount = Number(
    priorityPartitionSummary.requiredDistinctNodeCount,
  );
  const spreadFloor = projectQuorumAfterRemoval({
    currentVoterReadyRows,
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
        ` (${spreadFloor.projectedDistinctNodeCount}/` +
        `${spreadFloor.requiredPostRemovalDistinctNodeCount})`,
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
  // A REPLACE's removal effect is evaluated at every send, not the first
  // only: the ACTIVE dispatch and every post-intent re-send at STOPPING (the
  // T5' re-send, the post-WAIT redrive) run the same checks (F3).
  const isReplaceRemoveDispatch =
    context.repository.isReplaceRemoveDispatchPhase(operation);
  if (!isRemoveInitialDispatch && !isReplaceRemoveDispatch) {
    const resend = await classifyStoppingRemoveResend(context, operation);
    if (resend === STOPPING_REMOVE_RESEND.SUBJECT_UNOBSERVED) {
      return context.buildDeferredRemoveSafetyEvaluation(
        STOPPING_REMOVE_RESEND_DEFERRAL + operation.replicaId,
        REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED);
    }
    if (resend !== STOPPING_REMOVE_RESEND.STARTS_FRESH) {
      return context.buildSafeRemoveSafetyEvaluation();
    }
  }

  const {entityType, entityId} =
    assertCanonicalRebalancerEntityIdentity(operation);

  // The operation ledger serializes the actual entity (not its partition):
  // the ledger owner's answer, never the cache projection.
  const concurrentOperationEvaluation =
    await evaluateConcurrentOperationRemoveSafety(
      context, operation, {entityType, entityId});
  if (concurrentOperationEvaluation) {
    return concurrentOperationEvaluation;
  }

  if (entityType !== SERVICE_TYPE.PARTITION) {
    return evaluateEntityRemoveSafety(
      context,
      operation,
      {partitionId: operation.partitionId, entityType, entityId},
    );
  }
  // Every partition removal that its floors admit passes the one removal
  // leadership gate last: a leading replica is never removed (any class).
  const floors =
    await evaluatePartitionRemoveFloors(context, operation, isReplaceRemoveDispatch);
  return floors.classification === REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE ?
    evaluateRemovalLeadershipSafety(context, operation) : floors;
}

/**
 * The partition removal floors (voter-ready minimum, spread, published
 * membership, peers), universal across PARTITIONS; only the published
 * membership / publication / priority checks stay scoped to system ones.
 * @param {Object} context
 * @param {Object} operation
 * @param {boolean} isReplaceRemoveDispatch
 * @returns {Promise<Object>}
 */
async function evaluatePartitionRemoveFloors(
  context, operation, isReplaceRemoveDispatch) {
  const partitionClassification = classifySystemPartition({
    partitionId: operation.partitionId,
  });
  const criticalReplicaRows = await context.getCriticalReplicaRowsForSafety(
    operation.partitionId,
  );
  if (
    !Array.isArray(criticalReplicaRows) ||
    criticalReplicaRows.length === 0
  ) {
    const errorMessage =
      `Critical partition ${operation.partitionId}` +
      OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE;
    if (criticalReplicaRows?.authoritativeReadAvailable === false) {
      return context.buildDeferredRemoveSafetyEvaluation(
        errorMessage,
        operation.type === OperationType.REPLACE ?
          REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED :
          REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
      );
    }
    return context.buildFailedRemoveSafetyEvaluation(errorMessage);
  }
  noteReplaceOwnerObservedReplicaRows(context, operation, criticalReplicaRows);

  const committedNodeFloor = await readCommittedNodeFloor(context, criticalReplicaRows);
  if (committedNodeFloor.state !== SERVE_ELIGIBILITY_STATE.READY) {
    return context.buildDeferredRemoveSafetyEvaluation(
      `Partition ${operation.partitionId} committed node authority unavailable: ` +
        committedNodeFloor.reason,
      operation.type === OperationType.REPLACE ?
        REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED :
        REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
    );
  }
  const removeSafetyReadiness = {
    committedNodeFloor,
    partitionId: operation.partitionId,
    decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
    participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  };
  const currentVoterReadyRows = criticalReplicaRows.filter((row) =>
    context.isVoterReadyFloorCountableReplica(row, removeSafetyReadiness),
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

  // A priority control-plane REPLACE keeps its replacement and published
  // membership floors even for a non-voter-ready source (a floor class, not
  // a leadership one: leadership is the gate's, for every partition).
  const priorityReplaceFloors = isReplaceRemoveDispatch &&
    partitionClassification.priorityControlPlane;
  if (!removingVoterReady && !priorityReplaceFloors) {
    // The removed replica is not a voter-ready routable row: its removal
    // cannot drop the post-removal voter-ready count, spread, or quorum.
    return context.buildSafeRemoveSafetyEvaluation();
  }

  if (!partitionClassification.systemTable) {
    return evaluateUniversalPartitionRemoveSafety(context, operation, {
      isReplaceRemoveInitialDispatch: isReplaceRemoveDispatch,
      removeSafetyReadiness,
      currentVoterReadyRows,
      projectedVoterReadyRows:
        currentVoterReadyRows.filter(
          (row) =>
            !context.isOperationReplicaRow(row, {
              ...operation,
              replicaId: operationReplicaId,
            }),
        ),
      operationReplicaId,
      replacementReplicaId,
      replacementReplicaRow,
      projectQuorumAfterRemoval,
      QUORUM_PROJECTION_SCOPE,
    });
  }

  // One remove-safety evaluation, one authoritative planning read. Every
  // priority sub-check below shares this resolver.
  const readRemoveSafetyPlanningSnapshot =
    createRemoveSafetyPlanningSnapshotReader(context, operation);
  const priorityRecoveryCompletionEvaluation =
    await context.evaluatePriorityRecoveryCompletionRemoveSafety(
      operation,
      readRemoveSafetyPlanningSnapshot,
    );
  const priorityRecoveryCompletionSafe =
    priorityRecoveryCompletionEvaluation?.classification ===
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE;

  // A remaining voter whose node holds no ready lease (a formation joiner
  // behind its barrier) is credited only by the group's own committed
  // evidence; when that cannot be read the floor below waits, typed.
  let committedVoterCredit = COMMITTED_VOTER_CREDIT_NOT_REQUIRED;
  if (isReplaceRemoveDispatch) {
    committedVoterCredit = await resolveCommittedVoterCredit(context, operation, {
      criticalReplicaRows,
      nodeReadyRows: currentVoterReadyRows,
      sourceReplicaId: operationReplicaId,
      replacementReplicaRow,
      removeSafetyReadiness,
    });
    currentVoterReadyRows.push(...committedVoterCredit.creditedRows);
    const replacementGuard = evaluateReplaceReplacementVoterReady(
      context,
      operation,
      {
        replacementReplicaId,
        replacementReplicaRow,
        removeSafetyReadiness,
        committedVoterCredit,
      },
    );
    if (!isRemoveSafetyGuardPassed(replacementGuard)) {
      return replacementGuard;
    }
  }

  // The priority-recovery completion contract answers the SPREAD concern. It
  // never stands in for a REPLACE's voter floor: that removal is decided on
  // the remaining voters' own liveness below, completion-safe or not.
  if (
    priorityRecoveryCompletionEvaluation &&
    (!priorityRecoveryCompletionSafe || !isReplaceRemoveDispatch)
  ) {
    return priorityRecoveryCompletionEvaluation;
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
  if (
    (isReplaceRemoveDispatch || !priorityRecoveryCompletionSafe) &&
    !simpleFloor.floorSatisfied
  ) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
        ` (${projectedVoterReadyCount}/${minReplicaCount})` +
        describeCommittedVoterCreditWait(committedVoterCredit),
    );
  }
  if (!priorityRecoveryCompletionSafe) {
    const priorityPublishedMembershipRemoveSafetyEvaluation =
      await context.evaluatePriorityPublishedMembershipRemoveSafety(
        operation,
        projectedVoterReadyRows,
        currentVoterReadyRows,
        readRemoveSafetyPlanningSnapshot,
      );
    if (
      priorityPublishedMembershipRemoveSafetyEvaluation.classification !==
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE
    ) {
      return priorityPublishedMembershipRemoveSafetyEvaluation;
    }
  }

  // The publication partition's publication waits (null when none applies).
  const publicationWait =
    await context.evaluatePriorityPublicationLeaderRemoveSafety(
      operation,
      removingReplicaRow,
      replacementReplicaRow,
      {
        currentVoterReadyRows,
        priorityRecoveryCompletionSafe,
        readAuthoritativePlanningSnapshot: readRemoveSafetyPlanningSnapshot,
      },
    );
  if (publicationWait) {
    return publicationWait;
  }
  // Completion-safe implies a priority partition and, here, a REPLACE.
  if (priorityRecoveryCompletionSafe) {
    const completionSafeFloor =
      await resolvePriorityRecoveryQuorumProjection(
        context,
        operation,
        projectedVoterReadyRows,
        minReplicaCount,
        priorityRecoveryCompletionSafe,
        readRemoveSafetyPlanningSnapshot,
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

  const peerPingGuard = await evaluateProjectedPeersContactable(
    context,
    operation,
    projectedVoterReadyRows,
  );
  if (peerPingGuard) {
    return peerPingGuard;
  }

  return context.buildSafeRemoveSafetyEvaluation();
}

export {
  evaluatePriorityRecoveryCompletionRemoveSafety,
  evaluatePriorityPublishedMembershipRemoveSafety,
  evaluateRemoveSafety,
  evaluateUniversalPartitionRemoveSafety,
  projectQuorumAfterRemoval,
  QUORUM_PROJECTION_SCOPE,
};
