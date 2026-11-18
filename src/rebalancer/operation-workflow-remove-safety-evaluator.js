import {readCommittedNodeFloor} from './operation-workflow-committed-node-floor.js';
import {noteReplaceOwnerObservedReplicaRows} from './operation-workflow-replace-owner-wake.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
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
  ReplicaStatus,
  SERVICE_TYPE,
  classifySystemPartition,
  normalizeReplicaRowNodeIds,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX =
  ' operation visibility is deferred for safe removal';

// Scopes for the single authoritative post-removal quorum predicate. Each names a
// distinct floor (see projectQuorumAfterRemoval).
const QUORUM_PROJECTION_SCOPE = Object.freeze({
  // Voter-ready ROW count (the partition's voter rows on READY-lease nodes) vs
  // minReplicaCount. Every partition removal, REMOVE and REPLACE source
  // removal alike, on every path: no cluster-node union ever raises it.
  SIMPLE_FLOOR: 'simple-floor',
  // Distinct-NODE spread vs the published requiredDistinctNodeCount.
  PUBLISHED_SPREAD: 'published-spread',
});

/**
 * Project the distinct-node spread floor for one serialized removal.
 * @param {Object} input
 * @param {Object[]} projectedVoterReadyRows
 * @returns {Object}
 */
function projectPublishedSpreadAfterRemoval(input, projectedVoterReadyRows) {
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
    projectedVoterReadyCount: projectedVoterReadyRows.length,
    projectedDistinctNodeCount,
    currentDistinctNodeCount,
    requiredDistinctNodeCount,
    requiredPostRemovalDistinctNodeCount,
    floorSatisfied,
    reason,
  });
}

/**
 * One authoritative projection of the post-removal quorum, shared by the floor
 * sites in this module and the universal tier. Pure and synchronous. The
 * `scope` names which floor is projected: the voter-ready row count against
 * minReplicaCount, or the distinct-node spread against the published
 * requirement.
 * @param {Object} input
 * @returns {Object}
 */
function projectQuorumAfterRemoval(input) {
  const projectedVoterReadyRows = Array.isArray(input.projectedVoterReadyRows) ?
    input.projectedVoterReadyRows :
    [];
  if (input.scope === QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD) {
    return projectPublishedSpreadAfterRemoval(input, projectedVoterReadyRows);
  }
  const projectedVoterReadyCount = projectedVoterReadyRows.length;
  const floorSatisfied = projectedVoterReadyCount >= input.minReplicaCount;
  return Object.freeze({
    projectedVoterReadyCount,
    minReplicaCount: input.minReplicaCount,
    floorSatisfied,
    reason: floorSatisfied ?
      null :
      {kind: 'below-min', got: projectedVoterReadyCount, need: input.minReplicaCount},
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

// The typed states of the one remove-safety projection input.
const REMOVE_SAFETY_PROJECTION_STATE = Object.freeze({
  READY: 'ready',
  NODE_FLOOR_UNAVAILABLE: 'node_floor_unavailable',
  REPLICA_IDENTITY_UNAVAILABLE: 'replica_identity_unavailable',
});

/**
 * The one derivation of a partition removal's floor inputs, shared by this
 * evaluator and the placement owner's planning (quest
 * replica-placement-admission-owner, design section 2.8): the committed node
 * floor, the readiness it is read under, the voter-ready rows counted by
 * isVoterReadyFloorCountableReplica, the removed replica's identity and the
 * rows left after its removal. Answered in the evaluator's order: an
 * unavailable committed node floor first, then a missing replica identity.
 * @param {Object} context - The remove-safety owner's context.
 * @param {Object} operation - The REMOVE or REPLACE.
 * @param {Array<Object>} criticalReplicaRows - The partition's replica rows.
 * @return {Promise<Object>} Frozen {state: REMOVE_SAFETY_PROJECTION_STATE,
 *   ...the inputs when READY}.
 */
async function buildRemoveSafetyProjectionInput(context, operation,
  criticalReplicaRows) {
  const committedNodeFloor = await readCommittedNodeFloor(context, criticalReplicaRows);
  if (committedNodeFloor.state !== SERVE_ELIGIBILITY_STATE.READY) {
    return Object.freeze({
      state: REMOVE_SAFETY_PROJECTION_STATE.NODE_FLOOR_UNAVAILABLE,
      committedNodeFloor});
  }
  const removeSafetyReadiness = {
    committedNodeFloor,
    partitionId: operation.partitionId,
    decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
    participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  };
  const currentVoterReadyRows = criticalReplicaRows.filter(
    (row) =>
      context.isVoterReadyFloorCountableReplica(row, removeSafetyReadiness) &&
      (operation.type !== OperationType.REMOVE ||
        row.status === ReplicaStatus.ACTIVE),
  );
  const operationReplicaId =
    operation.type === OperationType.REPLACE ?
      context.repository.getReplaceSourceReplicaId(operation) :
      operation.replicaId;
  if (!operationReplicaId) {
    return Object.freeze({
      state: REMOVE_SAFETY_PROJECTION_STATE.REPLICA_IDENTITY_UNAVAILABLE});
  }
  return Object.freeze({state: REMOVE_SAFETY_PROJECTION_STATE.READY,
    committedNodeFloor, removeSafetyReadiness, currentVoterReadyRows,
    operationReplicaId,
    projectedVoterReadyRows: currentVoterReadyRows.filter((row) =>
      !context.isOperationReplicaRow(row, {...operation,
        replicaId: operationReplicaId}))});
}

/**
 * The simple voter-ready floor of a removal: the partition's policy minimum
 * (the async authoritative policy read) against the projected rows.
 * @param {Object} context - The remove-safety owner's context.
 * @param {Object} operation - The REMOVE or REPLACE.
 * @param {Array<Object>} projectedVoterReadyRows - Rows after the removal.
 * @return {Promise<Object>} projectQuorumAfterRemoval's SIMPLE_FLOOR answer.
 */
async function resolveRemoveSafetySimpleFloor(context, operation,
  projectedVoterReadyRows) {
  const minReplicaCount = await context.getCriticalMinReplicaCount(
    operation.partitionId);
  return projectQuorumAfterRemoval({projectedVoterReadyRows, minReplicaCount,
    scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR});
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
    return context.buildSafeRemoveSafetyEvaluation();
  }

  // The execution-time safety floor is universal across PARTITIONS: ordinary
  // user partitions get the same voter/minimum protection as system
  // partitions. It is not universal across entity types. Message groups and
  // runtime services have explicit row-identity and lifecycle safety owners.
  // Only the deeper published-membership / leader-tenure /
  // priority-control-plane checks below stay scoped to system partitions.
  const partitionClassification = classifySystemPartition({
    partitionId: operation.partitionId,
  });

  const {entityType, entityId} =
    assertCanonicalRebalancerEntityIdentity(operation);

  // The operation ledger serializes the actual entity. Hard-coding partition
  // here lets runtime/message-group replacements overtake their own source
  // retirement while unrelated partition rows appear idle.
  const allOps = await context.repository.getOperationsByEntity(
    entityType,
    entityId,
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
      `Safety check failed: concurrent ${entityType} operation ` +
        `${concurrentActiveOp.operationId} is active`,
    );
  }

  if (entityType !== SERVICE_TYPE.PARTITION) {
    return evaluateEntityRemoveSafety(
      context,
      operation,
      {partitionId: operation.partitionId, entityType, entityId},
    );
  }

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

  const projection = await buildRemoveSafetyProjectionInput(
    context, operation, criticalReplicaRows);
  if (projection.state === REMOVE_SAFETY_PROJECTION_STATE.NODE_FLOOR_UNAVAILABLE) {
    return context.buildDeferredRemoveSafetyEvaluation(
      `Partition ${operation.partitionId} committed node authority unavailable: ` +
        projection.committedNodeFloor.reason,
      operation.type === OperationType.REPLACE ?
        REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED :
        REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
    );
  }
  if (projection.state ===
      REMOVE_SAFETY_PROJECTION_STATE.REPLICA_IDENTITY_UNAVAILABLE) {
    return context.buildFailedRemoveSafetyEvaluation(
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE,
    );
  }
  const {removeSafetyReadiness, currentVoterReadyRows, operationReplicaId,
    projectedVoterReadyRows} = projection;

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

  const requiresSourceLeaderHandoff =
    operation.type === OperationType.REPLACE &&
    context.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId);

  if (!removingVoterReady && !requiresSourceLeaderHandoff) {
    // The removed replica is not a voter-ready routable row and no source
    // leader handoff is required: its removal cannot drop the post-removal
    // voter-ready count, spread, or quorum. The universal floor needs no
    // further projection for this operation.
    return context.buildSafeRemoveSafetyEvaluation();
  }

  if (!partitionClassification.systemTable) {
    return evaluateUniversalPartitionRemoveSafety(context, operation, {
      isReplaceRemoveInitialDispatch: isReplaceRemoveDispatch,
      removeSafetyReadiness,
      currentVoterReadyRows,
      projectedVoterReadyRows,
      operationReplicaId,
      replacementReplicaId,
      replacementReplicaRow,
      resolveRemoveSafetySimpleFloor,
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

  if (isReplaceRemoveDispatch) {
    const replacementGuard = evaluateReplaceReplacementVoterReady(
      context,
      operation,
      {
        replacementReplicaId,
        replacementReplicaRow,
        removeSafetyReadiness,
        priorityRecoveryCompletionSafe,
      },
    );
    if (!isRemoveSafetyGuardPassed(replacementGuard)) {
      return replacementGuard;
    }
  }

  if (priorityRecoveryCompletionEvaluation && !priorityRecoveryCompletionSafe) {
    return priorityRecoveryCompletionEvaluation;
  }

  // One voter-ready floor for every removal: the partition's voter-ready
  // rows on READY-lease nodes after the removal, against minReplicaCount.
  // A completion-safe priority recovery may still answer its source-leader
  // handoff first (below); the removal itself always waits for this floor.
  const simpleFloor = await resolveRemoveSafetySimpleFloor(context, operation,
    projectedVoterReadyRows);
  const deferBelowVoterReadyFloor = () =>
    context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
        ` (${simpleFloor.projectedVoterReadyCount}/${simpleFloor.minReplicaCount})`,
    );
  if (!priorityRecoveryCompletionSafe && !simpleFloor.floorSatisfied) {
    return deferBelowVoterReadyFloor();
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

  const priorityPublicationLeaderRemoveSafetyEvaluation =
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
  if (
    priorityPublicationLeaderRemoveSafetyEvaluation &&
    priorityPublicationLeaderRemoveSafetyEvaluation.classification !==
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE
  ) {
    return priorityPublicationLeaderRemoveSafetyEvaluation;
  }
  if (!simpleFloor.floorSatisfied) {
    return deferBelowVoterReadyFloor();
  }

  const peerPingGuard = await evaluateProjectedPeersContactable(
    context,
    operation,
    projectedVoterReadyRows,
  );
  if (peerPingGuard) {
    return peerPingGuard;
  }

  return priorityPublicationLeaderRemoveSafetyEvaluation ||
    context.buildSafeRemoveSafetyEvaluation();
}

export {
  REMOVE_SAFETY_PROJECTION_STATE,
  buildRemoveSafetyProjectionInput,
  resolveRemoveSafetySimpleFloor,
  evaluatePriorityRecoveryCompletionRemoveSafety,
  evaluatePriorityPublishedMembershipRemoveSafety,
  evaluateRemoveSafety,
  evaluateUniversalPartitionRemoveSafety,
  projectQuorumAfterRemoval,
  QUORUM_PROJECTION_SCOPE,
};
