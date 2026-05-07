import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerSegment5} from './operation-workflow-owner-segment-5.js';

const {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  NUM,
  INITIAL_PARTITION_IDS,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_MATERIALIZED_STATUSES,
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS,
  ReplicaStatus,
  ReplicaOperationResponseStatus,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryOperationAssessment,
  getWorkflowSteps,
  hasPriorityRecoverySpreadGap,
  isPriorityControlPlanePartition,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  resolvePriorityRecoveryActiveNodeCohort,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX =
  ' operation visibility is deferred for safe removal';
const CONTROL_PLANE_PUBLICATION_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];

const PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE =
  Object.freeze({
    USE_FALLBACK: 'use_fallback',
    USE_CONFIRMED_EVIDENCE: 'use_confirmed_evidence',
    RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP:
      'retarget_after_completed_without_ownership',
    RETARGET_AFTER_NOT_FOUND: 'retarget_after_not_found',
  });

const PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION =
  Object.freeze({
    USE_FALLBACK: 'use_fallback',
    USE_EVIDENCE: 'use_evidence',
    RETARGET: 'retarget',
  });

const PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION_BY_STATE =
  Object.freeze(
    new Map([
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_FALLBACK,
      ],
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .USE_CONFIRMED_EVIDENCE,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_EVIDENCE,
      ],
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.RETARGET,
      ],
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .RETARGET_AFTER_NOT_FOUND,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.RETARGET,
      ],
    ]),
  );

const PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  DEFER: 'defer',
  FAIL: 'fail',
});

const PRIORITY_RECOVERY_SUPERSEDED_TARGET_DEFER_REASON_CODES = Object.freeze(
  new Set([
    CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
    CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
    CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
    CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  ]),
);

const PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.NOT_APPLICABLE,
    matches: (evidence) => evidence.targetOutsideEligibleCohort !== true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.DEFER,
    matches: (evidence) => evidence.materializedPreSyncTarget === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.DEFER,
    matches: (evidence) => evidence.transientReadinessBlockerPresent === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.FAIL,
    matches: (evidence) => evidence.targetOutsideEligibleCohort === true,
  }),
]);

function normalizePriorityRecoverySupersededReasonCodes(readiness) {
  const runtimeAuthority =
    readiness?.runtimeAuthority &&
    typeof readiness.runtimeAuthority === TYPEOF.OBJECT ?
      readiness.runtimeAuthority :
      null;
  const reasonCodes = [
    ...(Array.isArray(readiness?.reasonCodes) ? readiness.reasonCodes : []),
    ...(Array.isArray(runtimeAuthority?.reasonCodes) ?
      runtimeAuthority.reasonCodes :
      []),
  ];
  const normalizedReasonCodes = [];
  const seenReasonCodes = new Set();
  for (const reasonCode of reasonCodes) {
    const normalizedReasonCode = String(reasonCode || '').trim();
    if (
      normalizedReasonCode.length === NUM.ZERO ||
      seenReasonCodes.has(normalizedReasonCode)
    ) {
      continue;
    }
    seenReasonCodes.add(normalizedReasonCode);
    normalizedReasonCodes.push(normalizedReasonCode);
  }
  return Object.freeze(normalizedReasonCodes);
}

function buildPriorityRecoverySupersededTargetEvidence({
  operation,
  priorityPartitionSummary,
  eligibleNodeIds,
  targetReadiness,
  targetLifecycleStatus,
}) {
  const targetNodeId = String(operation?.targetNodeId || '').trim();
  const blockedPartitionIds = priorityPartitionSummary ?
    buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) :
    [];
  const blockedPartitionScopeApplies =
    blockedPartitionIds.length === NUM.ZERO ||
    blockedPartitionIds.includes(operation?.partitionId);
  const targetOutsideEligibleCohort =
    hasPriorityRecoverySpreadGap(priorityPartitionSummary) &&
    eligibleNodeIds.length > NUM.ZERO &&
    targetNodeId.length > NUM.ZERO &&
    !eligibleNodeIds.includes(targetNodeId) &&
    blockedPartitionScopeApplies === true;
  const dimensions =
    targetReadiness?.dimensions &&
    typeof targetReadiness.dimensions === TYPEOF.OBJECT ?
      targetReadiness.dimensions :
      null;
  const reasonCodes =
    normalizePriorityRecoverySupersededReasonCodes(targetReadiness);
  const transientReasonCodePresent = reasonCodes.some((reasonCode) =>
    PRIORITY_RECOVERY_SUPERSEDED_TARGET_DEFER_REASON_CODES.has(reasonCode),
  );
  const transientDimensionBlockerPresent =
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === false ||
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
      false ||
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] ===
      false ||
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] ===
      false;
  const materializedPreSyncTarget =
    operation?.type === OperationType.REPLACE &&
    (operation?.workflowStep === WORKFLOW_STEP.SENDING ||
      operation?.workflowStep === WORKFLOW_STEP.CREATING) &&
    PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_MATERIALIZED_STATUSES.has(
      targetLifecycleStatus,
    );
  return Object.freeze({
    materializedPreSyncTarget,
    targetOutsideEligibleCohort,
    transientReadinessBlockerPresent:
      transientReasonCodePresent || transientDimensionBlockerPresent,
  });
}

function decidePriorityRecoverySupersededTarget(evidence) {
  const decision = PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return Object.freeze({
    state: decision?.state ||
      PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.NOT_APPLICABLE,
  });
}

function shouldPreservePriorityPublicationMinimumReplicaCount(
  operation,
  projectedVoterReadyCount,
  minReplicaCount,
) {
  return (
    operation?.partitionId === CONTROL_PLANE_PUBLICATION_PARTITION_ID &&
    projectedVoterReadyCount < minReplicaCount
  );
}

class OperationWorkflowOwnerSegment6 extends OperationWorkflowOwnerSegment5 {
  buildPriorityRecoveryAssessmentContextForOperation(
    operation,
    planningSnapshot,
  ) {
    if (
      !operation ||
      !planningSnapshot ||
      typeof planningSnapshot !== TYPEOF.OBJECT
    ) {
      return null;
    }

    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
        planningSnapshot.priorityPartitionSummary :
        null;
    const decisionSnapshot =
      this.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId || operation.entityId || '',
        [operation],
        planningSnapshot,
      );
    const effectiveEligibleNodeIds = normalizeNodeIdList(
      decisionSnapshot?.admission?.effectiveEligibleNodeIds ||
        resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    );
    const completion =
      decisionSnapshot?.completion ||
      buildPriorityRecoveryCompletion({
        assessment: buildPriorityRecoveryOperationAssessment({
          operation,
          priorityPartitionSummary,
          effectiveEligibleNodeIds,
        }),
        priorityRecoveryActive: hasPriorityRecoverySpreadGap(
          priorityPartitionSummary,
        ),
      });
    return Object.freeze({
      decisionSnapshot,
      completion,
      effectiveEligibleNodeIds: Object.freeze([...effectiveEligibleNodeIds]),
      planningSnapshot,
      priorityPartitionSummary,
    });
  }

  /**
   * Resolve the canonical priority-recovery completion outcome for the
   * operation currently under safety evaluation.
   *
   * Source-removal safety must consume the shared completion contract instead
   * of rebuilding partial spread truth from publication rows alone.
   *
   * @param {Object} operation
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   */
  buildPriorityRecoveryCompletionForOperation(operation, planningSnapshot) {
    const context = this.buildPriorityRecoveryAssessmentContextForOperation(
      operation,
      planningSnapshot,
    );
    return context?.completion || null;
  }

  /**
   * @param {Object|null} planningSnapshot
   * @return {string[]}
   * @private
   */
  buildPriorityRemoveSafetyRecoveryProjectionNodeIds(planningSnapshot) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return [];
    }
    return normalizeNodeIdList([
      ...normalizeNodeIdList(planningSnapshot.recoveryActiveNodeIds),
      ...normalizeNodeIdList(planningSnapshot.projectedServingNodeIds),
      ...normalizeNodeIdList(planningSnapshot.locallyEligibleNodeIds),
    ]);
  }

  /**
   * Remove safety must consume one canonical membership snapshot instead of
   * locally switching between durable published rows and fresher recovery
   * projection evidence.
   *
   * If the planning owner already projects every currently voter-ready node,
   * that recovery projection remains authoritative even after the summary says
   * spread is satisfied while the last published membership row still lags.
   *
   * @param {Object|null} planningSnapshot
   * @param {Object|null} priorityRecoveryContext
   * @param {Object[]} projectedVoterReadyRows
   * @return {Object}
   * @private
   */
  resolvePriorityRemoveSafetyMembershipSnapshot(
    planningSnapshot,
    priorityRecoveryContext,
    projectedVoterReadyRows,
  ) {
    const publishedActiveNodeIds = normalizeNodeIdList(
      planningSnapshot?.publishedActiveNodeIds,
    );
    const recoveryProjectionNodeIds =
      this.buildPriorityRemoveSafetyRecoveryProjectionNodeIds(planningSnapshot);
    const projectedVoterReadyNodeIds = normalizeReplicaRowNodeIds(
      projectedVoterReadyRows,
    );
    const priorityPartitionSummary =
      priorityRecoveryContext?.priorityPartitionSummary || null;
    const spreadGapPending = hasPriorityRecoverySpreadGap(
      priorityPartitionSummary,
    );
    const publishedActiveNodeIdSet = new Set(publishedActiveNodeIds);
    const recoveryProjectionNodeIdSet = new Set(recoveryProjectionNodeIds);
    const missingPublishedNodeIds = projectedVoterReadyNodeIds.filter(
      (nodeId) => !publishedActiveNodeIdSet.has(nodeId),
    );
    const recoveryProjectionCoversProjectedVoters =
      missingPublishedNodeIds.length > NUM.ZERO &&
      recoveryProjectionNodeIds.length > NUM.ZERO &&
      missingPublishedNodeIds.every((nodeId) => {
        return recoveryProjectionNodeIdSet.has(nodeId);
      });
    const useRecoveryProjectionMembership =
      recoveryProjectionNodeIds.length > NUM.ZERO &&
      (spreadGapPending || recoveryProjectionCoversProjectedVoters);
    const membershipNodeIds = useRecoveryProjectionMembership ?
      recoveryProjectionNodeIds :
      publishedActiveNodeIds;
    const membershipSource = useRecoveryProjectionMembership ?
      PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE.RECOVERY_PROJECTION_MEMBERSHIP :
      PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE.PUBLISHED_MEMBERSHIP;
    const membershipNodeIdSet = useRecoveryProjectionMembership ?
      recoveryProjectionNodeIdSet :
      publishedActiveNodeIdSet;
    const missingMembershipNodeIds = projectedVoterReadyNodeIds.filter(
      (nodeId) => !membershipNodeIdSet.has(nodeId),
    );
    const publishedActiveNodeIdsPresent =
      planningSnapshot?.publishedActiveNodeIdsPresent === true ||
      publishedActiveNodeIds.length > NUM.ZERO;

    return Object.freeze({
      publishedActiveNodeIds: Object.freeze([...publishedActiveNodeIds]),
      recoveryProjectionNodeIds: Object.freeze([...recoveryProjectionNodeIds]),
      projectedVoterReadyNodeIds: Object.freeze([
        ...projectedVoterReadyNodeIds,
      ]),
      membershipNodeIds: Object.freeze([...membershipNodeIds]),
      membershipSource,
      missingMembershipNodeIds: Object.freeze([...missingMembershipNodeIds]),
      publishedActiveNodeIdsPresent,
      useRecoveryProjectionMembership,
    });
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   */
  isPriorityRecoverySupersededTargetFailureApplicable(
    operation,
  ) {
    if (
      !operation ||
      (operation.type !== OperationType.ADD &&
        operation.type !== OperationType.REPLACE)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Source-removal safety should defer only while the shared completion
   * contract remains blocked. Once priority recovery is canonically
   * `spread_satisfied_in_flight`, the remove gate must stop restating the
   * same concern from projected-count math.
   *
   * @param {Object|null} completion
   * @return {boolean}
   */
  isPriorityRecoveryRemoveSafetySatisfied(completion) {
    if (!completion || typeof completion !== TYPEOF.OBJECT) {
      return false;
    }
    if (
      completion.state ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED
    ) {
      return false;
    }
    return completion.blocked !== true;
  }

  /**
   * Critical priority source-removal safety must not restate stale local
   * voter-ready count math once the shared completion owner already reports a
   * non-blocked recovery outcome for the current operation.
   *
   * The replacement target still has to be voter-ready before this short
   * circuit is allowed to proceed.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async evaluatePriorityRecoveryCompletionRemoveSafety(operation) {
    if (
      !operation ||
      !isPriorityControlPlanePartition({
        partitionId: operation.partitionId,
      })
    ) {
      return null;
    }

    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }

    const priorityRecoveryContext =
      this.buildPriorityRecoveryAssessmentContextForOperation(
        operation,
        planningSnapshot,
      );
    const supersededTargetError =
      this.getPriorityRecoverySupersededTargetErrorFromContext(
        operation,
        priorityRecoveryContext,
      );
    if (supersededTargetError) {
      return this.buildFailedRemoveSafetyEvaluation(supersededTargetError);
    }

    if (
      !this.isPriorityRecoveryRemoveSafetySatisfied(
        priorityRecoveryContext?.completion || null,
      )
    ) {
      return null;
    }

    return this.buildSafeRemoveSafetyEvaluation();
  }

  /**
   * @param {Object} operation
   * @return {Promise<string|null>}
   * @private
   */
  async getPriorityRecoverySupersededTargetError(operation) {
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    const context = this.buildPriorityRecoveryAssessmentContextForOperation(
      operation,
      planningSnapshot,
    );
    return this.getPriorityRecoverySupersededTargetErrorFromContext(
      operation,
      context,
    );
  }

  /**
   * @param {Object} operation
   * @param {Object|null} priorityRecoveryContext
   * @return {string|null}
   * @private
   */
  getPriorityRecoverySupersededTargetErrorFromContext(
    operation,
    priorityRecoveryContext,
  ) {
    if (
      !operation ||
      !priorityRecoveryContext ||
      typeof priorityRecoveryContext !== TYPEOF.OBJECT
    ) {
      return null;
    }

    const targetNodeId = String(operation.targetNodeId || '').trim();
    if (targetNodeId.length === NUM.ZERO) {
      return null;
    }

    const priorityPartitionSummary =
      priorityRecoveryContext.priorityPartitionSummary;
    const eligibleNodeIds = normalizeNodeIdList(
      priorityRecoveryContext.effectiveEligibleNodeIds,
    );
    const targetReadiness =
      typeof this.controlPlaneReadinessService?.getNodeReadinessSync ===
        TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
          decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
          participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
        }) :
        null;
    const targetLifecycleStatus =
      this.repository &&
      typeof this.repository.getObservedReplicaStatusFromCache ===
        TYPEOF.FUNCTION ?
        this.repository.getObservedReplicaStatusFromCache(
          operation.replicaId,
          operation.partitionId,
          targetNodeId,
          EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
        ) :
        null;
    const supersededTargetEvidence =
      buildPriorityRecoverySupersededTargetEvidence({
        operation,
        priorityPartitionSummary,
        eligibleNodeIds,
        targetReadiness,
        targetLifecycleStatus,
      });
    const supersededTargetDecision =
      decidePriorityRecoverySupersededTarget(supersededTargetEvidence);
    if (
      supersededTargetDecision.state !==
      PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.FAIL
    ) {
      return null;
    }

    return this.buildPriorityRecoverySupersededTargetError(
      operation,
      targetNodeId,
      eligibleNodeIds,
    );
  }

  /**
   * @param {Object} operation
   * @param {string} targetNodeId
   * @param {string[]} eligibleNodeIds
   * @return {string}
   * @private
   */
  buildPriorityRecoverySupersededTargetError(
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
   * @param {Object} operation
   * @param {Object[]} projectedVoterReadyRows
   * @return {Promise<Object>}
   * @private
   */
  async evaluatePriorityPublishedMembershipRemoveSafety(
    operation,
    projectedVoterReadyRows,
  ) {
    if (
      !operation ||
      !isPriorityControlPlanePartition({
        partitionId: operation.partitionId,
      })
    ) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
          operation.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE,
      );
    }
    const priorityRecoveryContext =
      this.buildPriorityRecoveryAssessmentContextForOperation(
        operation,
        planningSnapshot,
      );
    const priorityRecoveryCompletion =
      priorityRecoveryContext?.completion || null;
    if (
      this.isPriorityRecoveryRemoveSafetySatisfied(priorityRecoveryCompletion)
    ) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    const supersededTargetError =
      this.getPriorityRecoverySupersededTargetErrorFromContext(
        operation,
        priorityRecoveryContext,
      );
    if (supersededTargetError) {
      return this.buildFailedRemoveSafetyEvaluation(supersededTargetError);
    }
    if (
      priorityRecoveryCompletion?.state ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED
    ) {
      const replaceRemovePhase =
        this.repository.isReplaceRemovePhase(operation);
      const deferReason = await this.resolveRemoveSafetyDeferredReason(
        operation,
        replaceRemovePhase,
      );
      const deferredVisibilityError =
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX;
      if (!deferReason) {
        return this.buildFailedRemoveSafetyEvaluation(deferredVisibilityError);
      }
      return this.buildDeferredRemoveSafetyEvaluation(
        deferredVisibilityError,
        deferReason,
      );
    }
    const priorityPartitionSummary =
      priorityRecoveryContext?.priorityPartitionSummary || null;
    const membershipSnapshot =
      this.resolvePriorityRemoveSafetyMembershipSnapshot(
        planningSnapshot,
        priorityRecoveryContext,
        projectedVoterReadyRows,
      );
    if (
      !membershipSnapshot.publishedActiveNodeIdsPresent &&
      membershipSnapshot.recoveryProjectionNodeIds.length === NUM.ZERO &&
      projectedVoterReadyRows.length > NUM.ZERO
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
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
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
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
      return this.buildSafeRemoveSafetyEvaluation();
    }

    const blockedPartitionIds = new Set(
      buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary),
    );
    if (
      blockedPartitionIds.has(operation.partitionId) &&
      membershipSnapshot.useRecoveryProjectionMembership !== true
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
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
      return this.buildSafeRemoveSafetyEvaluation();
    }
    const projectedDistinctNodeCount = normalizeReplicaRowNodeIds(
      projectedVoterReadyRows,
    ).length;
    if (projectedDistinctNodeCount < requiredDistinctNodeCount) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
          operation.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED +
          OPERATION_WORKFLOW_OWNER_LITERAL.REQUIREMENT +
          ` (${projectedDistinctNodeCount}/${requiredDistinctNodeCount})`,
      );
    }

    return this.buildSafeRemoveSafetyEvaluation();
  }

  /**
   * @return {Object}
   * @private
   */
  buildSafeRemoveSafetyEvaluation() {
    return Object.freeze({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      deferReason: null,
      error: null,
      handoffRequest: null,
    });
  }

  /**
   * @param {string} error
   * @param {string} deferReason
   * @param {Object} [options]
   * @return {Object}
   * @private
   */
  buildDeferredRemoveSafetyEvaluation(error, deferReason, options = {}) {
    return Object.freeze({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      deferReason,
      error,
      handoffFailureError: options?.handoffFailureError || error,
      handoffFailurePolicy:
        options?.handoffFailurePolicy ||
        REMOVE_SAFETY_HANDOFF_FAILURE_POLICY.NONE,
      handoffRequest: options?.handoffRequest || null,
    });
  }

  /**
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildFailedRemoveSafetyEvaluation(error) {
    return Object.freeze({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      deferReason: null,
      error,
      handoffRequest: null,
    });
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @return {Promise<string|null>}
   * @private
   */
  async resolveRemoveSafetyDeferredReason(operation, replaceRemovePhase) {
    if (!operation) {
      return null;
    }
    if (operation.type === OperationType.REPLACE && replaceRemovePhase) {
      return REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED;
    }
    if (
      operation.type !== OperationType.REMOVE ||
      !(await this.isCriticalRemoveOverReplicated(operation))
    ) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED;
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {Promise<Object>}
   * @private
   */
  async buildDeferredRemoveSafetyEvaluationForOperation(
    operation,
    errorMessage,
    options = {},
  ) {
    const replaceRemovePhase = this.repository.isReplaceRemovePhase(operation);
    const deferReason = await this.resolveRemoveSafetyDeferredReason(
      operation,
      replaceRemovePhase,
    );
    if (!deferReason) {
      return this.buildFailedRemoveSafetyEvaluation(errorMessage);
    }
    return this.buildDeferredRemoveSafetyEvaluation(
      errorMessage,
      deferReason,
      options,
    );
  }

  /**
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isReplaceSourceLeaderHandoffRequiredPartition(partitionId) {
    return (
      typeof partitionId === TYPEOF.STRING &&
      REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS.has(partitionId)
    );
  }

  /**
   * @param {Object} options
   * @return {string}
   * @private
   */
  resolvePriorityPublicationReplacementLeaderCandidateState(options = {}) {
    if (!options.electionEvidence) {
      return (
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK
      );
    }
    if (
      options.notFoundReplicaIds?.has(options.normalizedReplacementReplicaId) &&
      !options.replacementOwnershipObserved
    ) {
      return (
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .RETARGET_AFTER_NOT_FOUND
      );
    }
    if (
      options.electionEvidence.responseStatus ===
        ReplicaOperationResponseStatus.COMPLETED &&
      options.evidenceCandidateRow &&
      options.evidenceCandidateOwnershipObserved
    ) {
      return (
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .USE_CONFIRMED_EVIDENCE
      );
    }
    if (options.electionRetrySuppressed) {
      return (
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK
      );
    }
    if (
      options.electionEvidence.responseStatus ===
        ReplicaOperationResponseStatus.COMPLETED &&
      options.evidenceCandidateRow &&
      !options.evidenceCandidateOwnershipObserved
    ) {
      return (
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP
      );
    }
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK
    );
  }

  /**
   * @param {string} state
   * @return {string}
   * @private
   */
  resolvePriorityPublicationReplacementLeaderCandidateAction(state) {
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION_BY_STATE.get(
        state,
      ) ||
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_FALLBACK
    );
  }

  resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds(
    electionEvidence,
    candidateRows,
    hasReplacementLeaderOwnership,
  ) {
    const completedReplicaIds = Array.isArray(
      electionEvidence?.completedReplicaIds,
    ) ?
      electionEvidence.completedReplicaIds :
      [];
    return new Set(
      completedReplicaIds.filter((replicaId) => {
        const row =
          candidateRows.find(
            (candidateRow) =>
              this.getReplicaRowIdentity(candidateRow) === replicaId,
          ) || null;
        return !hasReplacementLeaderOwnership(row);
      }),
    );
  }

  hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
    operation,
    currentVoterReadyRows,
    operationReplicaId,
    replacementReplicaRow,
  ) {
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      !this.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId)
    ) {
      return false;
    }
    const currentReplacementReplicaId =
      this.getReplicaRowIdentity(replacementReplicaRow) ||
      this.repository.getReplaceTargetReplicaId(operation) ||
      null;
    if (!currentReplacementReplicaId) {
      return false;
    }
    const sourceNodeId =
      typeof operation.sourceNodeId === TYPEOF.STRING ?
        operation.sourceNodeId.trim() :
        null;
    const normalizedOperationReplicaId =
      typeof operationReplicaId === TYPEOF.STRING ?
        operationReplicaId.trim() :
        null;
    const candidateRows = Array.isArray(currentVoterReadyRows) ?
      currentVoterReadyRows :
      [];
    const electionEvidence =
      this.getFreshPriorityPublicationReplacementLeaderElectionEvidence(
        operation,
      );
    const blockedReplicaIds = new Set(
      Array.isArray(electionEvidence?.notFoundReplicaIds) ?
        electionEvidence.notFoundReplicaIds :
        [],
    );
    const completedReplicaIds = Array.isArray(
      electionEvidence?.completedReplicaIds,
    ) ?
      electionEvidence.completedReplicaIds :
      [];
    for (const completedReplicaId of completedReplicaIds) {
      blockedReplicaIds.add(completedReplicaId);
    }
    blockedReplicaIds.add(currentReplacementReplicaId);
    return candidateRows.some((row) => {
      const rowReplicaId = this.getReplicaRowIdentity(row);
      const rowNodeId =
        typeof row?.node_id === TYPEOF.STRING ? row.node_id.trim() : null;
      return (
        rowReplicaId &&
        rowNodeId &&
        rowReplicaId !== normalizedOperationReplicaId &&
        !blockedReplicaIds.has(rowReplicaId) &&
        (!sourceNodeId || rowNodeId !== sourceNodeId)
      );
    });
  }

  /**
   * @param {Object} operation
   * @param {Object|null} replacementReplicaRow
   * @param {Object[]} currentVoterReadyRows
   * @param {string|null} operationReplicaId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolvePriorityPublicationReplacementLeaderCandidateRow(
    operation,
    replacementReplicaRow,
    currentVoterReadyRows,
    operationReplicaId,
  ) {
    const fallbackReplacementReplicaRow = replacementReplicaRow || null;
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      !this.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId)
    ) {
      return fallbackReplacementReplicaRow;
    }

    const replacementReplicaId =
      this.getReplicaRowIdentity(replacementReplicaRow) ||
      this.repository.getReplaceTargetReplicaId(operation) ||
      null;
    if (!replacementReplicaId) {
      return fallbackReplacementReplicaRow;
    }

    const electionEvidence =
      this.getFreshPriorityPublicationReplacementLeaderElectionEvidence(
        operation,
      );
    const electionRetrySuppressed =
      this.isPriorityPublicationLeaderHandoffRetrySuppressed(electionEvidence);
    if (!electionEvidence) {
      return fallbackReplacementReplicaRow;
    }

    const sourceNodeId =
      typeof operation.sourceNodeId === TYPEOF.STRING ?
        operation.sourceNodeId.trim() :
        null;
    const normalizedOperationReplicaId =
      typeof operationReplicaId === TYPEOF.STRING ?
        operationReplicaId.trim() :
        null;
    const normalizedReplacementReplicaId = replacementReplicaId.trim();
    const candidateRows = Array.isArray(currentVoterReadyRows) ?
      currentVoterReadyRows :
      [];
    const notFoundReplicaIds = new Set(
      Array.isArray(electionEvidence?.notFoundReplicaIds) ?
        electionEvidence.notFoundReplicaIds :
        [],
    );
    const partitionRow = await this.getCriticalPartitionRowForSafety(
      operation.partitionId,
    );
    const partitionLeaderNodeId =
      this.getCriticalPartitionLeaderNodeIdForSafety(partitionRow);
    const hasReplacementLeaderOwnership = (replicaRow) => {
      const replacementRoleState =
        this.getPriorityPublicationReplacementRoleState(replicaRow);
      const replacementNodeId =
        typeof replicaRow?.node_id === TYPEOF.STRING ?
          replicaRow.node_id.trim() :
          typeof operation.targetNodeId === TYPEOF.STRING ?
            operation.targetNodeId.trim() :
            null;
      return (
        replacementRoleState ===
          PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER ||
        (replacementNodeId !== null &&
          partitionLeaderNodeId === replacementNodeId)
      );
    };
    const replacementOwnershipObserved =
      hasReplacementLeaderOwnership(replacementReplicaRow);
    const completedWithoutOwnershipReplicaIds =
      this.resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds(
        electionEvidence,
        candidateRows,
        hasReplacementLeaderOwnership,
      );
    const evidenceReplicaId =
      typeof electionEvidence?.replacementReplicaId === TYPEOF.STRING ?
        electionEvidence.replacementReplicaId.trim() :
        null;
    const isEligibleCandidateRow = (row, blockedReplicaIds) => {
      const rowReplicaId = this.getReplicaRowIdentity(row);
      const rowNodeId =
        typeof row?.node_id === TYPEOF.STRING ? row.node_id.trim() : null;
      return (
        rowReplicaId &&
        rowNodeId &&
        rowReplicaId !== normalizedOperationReplicaId &&
        !blockedReplicaIds.has(rowReplicaId) &&
        (!sourceNodeId || rowNodeId !== sourceNodeId)
      );
    };
    const findEligibleCandidateRow = (blockedReplicaIds) =>
      candidateRows.find((row) =>
        isEligibleCandidateRow(row, blockedReplicaIds),
      ) || null;
    const evidenceCandidateBlockedReplicaIds = new Set(
      [...notFoundReplicaIds].filter(
        (replicaId) => replicaId !== evidenceReplicaId,
      ),
    );

    const evidenceCandidateRow =
      evidenceReplicaId === null ?
        null :
        candidateRows.find(
          (row) =>
            this.getReplicaRowIdentity(row) === evidenceReplicaId &&
              isEligibleCandidateRow(row, evidenceCandidateBlockedReplicaIds),
        ) || null;
    const evidenceCandidateOwnershipObserved =
      hasReplacementLeaderOwnership(evidenceCandidateRow);
    const candidateState =
      this.resolvePriorityPublicationReplacementLeaderCandidateState({
        electionEvidence,
        electionRetrySuppressed,
        evidenceCandidateRow,
        evidenceCandidateOwnershipObserved,
        normalizedReplacementReplicaId,
        notFoundReplicaIds,
        replacementOwnershipObserved,
      });
    const candidateAction =
      this.resolvePriorityPublicationReplacementLeaderCandidateAction(
        candidateState,
      );
    if (
      candidateAction ===
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_EVIDENCE
    ) {
      return evidenceCandidateRow || fallbackReplacementReplicaRow;
    }
    if (
      candidateAction !==
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.RETARGET
    ) {
      return fallbackReplacementReplicaRow;
    }
    const retargetBlockedReplicaIds = new Set([
      ...notFoundReplicaIds,
      ...completedWithoutOwnershipReplicaIds,
    ]);
    if (
      candidateState ===
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
        .RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP &&
      evidenceReplicaId !== null
    ) {
      retargetBlockedReplicaIds.add(evidenceReplicaId);
    }
    return (
      findEligibleCandidateRow(retargetBlockedReplicaIds) ||
      fallbackReplacementReplicaRow
    );
  }

  /**
   * Evaluate safety validation for REMOVE operations.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async evaluateRemoveSafety(operation) {
    if (!operation) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    const isRemoveInitialDispatch =
      this.isRemoveInitialDispatchPhase(operation);
    const isReplaceRemoveInitialDispatch =
      this.repository.isReplaceRemovePhase(operation);
    if (!isRemoveInitialDispatch && !isReplaceRemoveInitialDispatch) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    if (!this.isCriticalSystemPartition(operation.partitionId)) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(
      operation.partitionId,
    );
    if (
      !Array.isArray(criticalReplicaRows) ||
      criticalReplicaRows.length === NUM.ZERO
    ) {
      return this.buildFailedRemoveSafetyEvaluation(
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
      this.isVoterReadyRoutableReplica(row, removeSafetyReadiness),
    );

    const operationReplicaId =
      operation.type === OperationType.REPLACE ?
        this.repository.getReplaceSourceReplicaId(operation) :
        operation.replicaId;

    if (!operationReplicaId) {
      return this.buildFailedRemoveSafetyEvaluation(
        `Critical partition ${operation.partitionId}` +
          OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE,
      );
    }

    const removingVoterReady = currentVoterReadyRows.some((row) =>
      this.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId,
      }),
    );
    const removingReplicaRow =
      criticalReplicaRows.find((row) =>
        this.isOperationReplicaRow(row, {
          ...operation,
          replicaId: operationReplicaId,
        }),
      ) || null;
    const replacementReplicaId =
      operation.type === OperationType.REPLACE ?
        this.repository.getReplaceTargetReplicaId(operation) ||
          (typeof operation.replicaId === TYPEOF.STRING &&
          operation.replicaId.length > NUM.ZERO ?
            operation.replicaId :
            null) :
        null;
    const replacementReplicaRow =
      replacementReplicaId === null ?
        null :
        criticalReplicaRows.find((row) =>
          this.isOperationReplicaRow(row, {
            ...operation,
            replicaId: replacementReplicaId,
          }),
        ) || null;
    const replacementLeaderCandidateRow =
      await this.resolvePriorityPublicationReplacementLeaderCandidateRow(
        operation,
        replacementReplicaRow,
        currentVoterReadyRows,
        operationReplicaId,
      );

    const requiresSourceLeaderHandoff =
      operation.type === OperationType.REPLACE &&
      this.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId);
    const priorityRecoveryCompletionEvaluation =
      await this.evaluatePriorityRecoveryCompletionRemoveSafety(operation);
    const priorityRecoveryCompletionSafe =
      priorityRecoveryCompletionEvaluation?.classification ===
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE;

    if (!removingVoterReady && !requiresSourceLeaderHandoff) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    if (isReplaceRemoveInitialDispatch) {
      if (!replacementReplicaId) {
        return this.buildDeferredRemoveSafetyEvaluationForOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
            operation.partitionId +
            OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA +
            OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE,
        );
      }
      const replacementReplicaVoterReady =
        priorityRecoveryCompletionSafe === true ?
          this.isVoterReadyReplicaTopology(replacementReplicaRow) :
          this.isVoterReadyRoutableReplica(
            replacementReplicaRow,
            removeSafetyReadiness,
          ) ||
            this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
              operation,
              replacementReplicaRow,
            );
      if (!replacementReplicaVoterReady) {
        return this.buildDeferredRemoveSafetyEvaluationForOperation(
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

    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    const projectedVoterReadyRows = currentVoterReadyRows.filter(
      (row) =>
        !this.isOperationReplicaRow(row, {
          ...operation,
          replicaId: operationReplicaId,
        }),
    );
    const projectedVoterReadyCount = projectedVoterReadyRows.length;
    if (
      !priorityRecoveryCompletionSafe &&
      projectedVoterReadyCount < minReplicaCount
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        `Critical partition ${operation.partitionId}` +
          OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
          ` (${projectedVoterReadyCount}/${minReplicaCount})`,
      );
    }

    if (!priorityRecoveryCompletionSafe) {
      const priorityPublishedMembershipRemoveSafetyEvaluation =
        await this.evaluatePriorityPublishedMembershipRemoveSafety(
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
      this.hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
        operation,
        currentVoterReadyRows,
        operationReplicaId,
        replacementLeaderCandidateRow,
      );
    const priorityPublicationLeaderRemoveSafetyEvaluation =
      await this.evaluatePriorityPublicationLeaderRemoveSafety(
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
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        `Critical partition ${operation.partitionId}` +
          OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
          ` (${projectedVoterReadyCount}/${minReplicaCount})`,
      );
    }
    if (priorityPublicationLeaderRemoveSafetyEvaluation) {
      return priorityPublicationLeaderRemoveSafetyEvaluation;
    }

    return this.buildSafeRemoveSafetyEvaluation();
  }

  /**
   * @param {Object} operation
   * @param {Object|null} replacementReplicaRow
   * @return {boolean}
   * @private
   */
  isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
    operation,
    replacementReplicaRow,
  ) {
    return (
      operation?.type === OperationType.REPLACE &&
      operation?.workflowStep === WORKFLOW_STEP.ACTIVE &&
      isPriorityControlPlanePartition({
        partitionId: operation?.partitionId,
      }) &&
      this.isVoterReadyReplicaTopology(replacementReplicaRow)
    );
  }

  /**
   * Get safety validation error for REMOVE operations.
   * @param {Object} operation
   * @return {Promise<string|null>}
   */
  async getRemoveSafetyError(operation) {
    const evaluation = await this.evaluateRemoveSafety(operation);
    return evaluation?.error || null;
  }

  /**
   * Replay REPLACE source-removal from the authoritative row when the local
   * reconcile input is stale at SYNCING but the durable workflow already
   * advanced to ACTIVE on the canonical active-phase owner.
   *
   * This closes the gap where cache-lagged timeout reconciliation observes the
   * target as ACTIVE, replays the ACTIVE transition idempotently, but never
   * re-dispatches source removal because the local row has not caught up.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async replayReplaceActiveSourceRemovalFromAuthoritative(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      typeof operation.operationId !==
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operation.operationId.length === NUM.ZERO
    ) {
      return false;
    }
    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        operation.operationId,
        {requireOwnerRpcRead: true},
      );
    if (
      !authoritativeOperation ||
      authoritativeOperation.workflowStep !== WORKFLOW_STEP.ACTIVE ||
      !this.repository.isOperationLocallyOwned(authoritativeOperation)
    ) {
      return false;
    }
    await this.executeOperationFromReconcilePath(authoritativeOperation);
    return true;
  }

  /**
   * Replay REPLACE source-removal from observed target ACTIVE evidence when
   * the durable ACTIVE transition is retryably backpressured.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async replayReplaceActiveSourceRemovalFromObservedTarget(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      !this.repository.isOperationLocallyOwned(operation) ||
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
      await this.executeOperationFromReconcilePath(activeOperation);
    if (replaceResumeResult?.skipped === true) {
      this.ensurePriorityActiveReplaceRetryArmed(activeOperation);
    }
    return true;
  }

  /**
   * @param {Object} operation
   * @return {number}
   * @private
   */
  getOperationWorkflowStepRank(operation) {
    const steps = getWorkflowSteps(operation?.type);
    const workflowStep =
      operation?.workflowStep ?? operation?.workflow_step ?? null;
    if (
      !Array.isArray(steps) ||
      steps.length === NUM.ZERO ||
      typeof workflowStep !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING
    ) {
      return NUM.NEGATIVE_ONE;
    }
    return steps.indexOf(workflowStep);
  }

  /**
   * @param {Object} targetOperation
   * @param {Object} sourceOperation
   * @return {void}
   * @private
   */
  applyObservedOperationState(targetOperation, sourceOperation) {
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
        this.repository.getReplaceSourceReplicaId(targetOperation) ||
        targetOperation.sourceReplicaId ||
        null;
      const observedSourceReplicaId =
        this.repository.getReplaceSourceReplicaId(sourceOperation) ||
        sourceOperation.sourceReplicaId ||
        null;
      const canonicalSourceReplicaId =
        retainedSourceReplicaId || observedSourceReplicaId;
      const retainedTargetReplicaId =
        this.repository.getReplaceTargetReplicaId(targetOperation);
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
   * Prefer the most advanced observed state for a REPLACE operation before
   * replaying active-phase reconciliation, so stale SYNCING rows cannot
   * overwrite a newer STOPPING/REMOVED state.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async adoptMostAdvancedObservedReplaceState(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      typeof operation.operationId !==
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operation.operationId.length === NUM.ZERO
    ) {
      return null;
    }

    const localRank = this.getOperationWorkflowStepRank(operation);
    let selectedOperation = null;
    let selectedRank = localRank;
    const maybeSelectOperation = (candidate) => {
      if (!candidate || !this.repository.isOperationLocallyOwned(candidate)) {
        return;
      }
      const candidateRank = this.getOperationWorkflowStepRank(candidate);
      if (candidateRank > selectedRank) {
        selectedOperation = candidate;
        selectedRank = candidateRank;
      }
    };

    const cachedRow = this.repository.getReplicaOperationRowFromCache(
      operation.operationId,
    );
    if (cachedRow) {
      maybeSelectOperation(this.repository.rowToOperation(cachedRow));
    }

    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        operation.operationId,
        {requireOwnerRpcRead: true},
      );
    maybeSelectOperation(authoritativeOperation);

    if (!selectedOperation) {
      return null;
    }
    this.applyObservedOperationState(operation, selectedOperation);
    return selectedOperation;
  }

  /**
   * Reconcile a REPLACE operation after the target replica has become ACTIVE.
   * Prefer already-observed STOPPING/REMOVED state before committing another
   * ACTIVE transition from a stale local SYNCING row.
   *
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileReplaceActualActive(operation) {
    const observedOperation =
      await this.adoptMostAdvancedObservedReplaceState(operation);
    if (observedOperation) {
      if (this.repository.isOperationTerminal(operation)) {
        return;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        await this.reconcileOperationProgress(operation);
        return;
      }
      if (operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
        const replaceResumeResult =
          await this.executeOperationFromReconcilePath(operation);
        if (replaceResumeResult?.skipped === true) {
          this.ensurePriorityActiveReplaceRetryArmed(operation);
        }
        return;
      }
    }

    let activeTransitionCommitted = false;
    try {
      activeTransitionCommitted = await this.updateStep(
        operation,
        WORKFLOW_STEP.ACTIVE,
      );
    } catch (error) {
      if (
        await this.replayReplaceActiveSourceRemovalFromObservedTarget(operation)
      ) {
        return;
      }
      throw error;
    }
    if (activeTransitionCommitted) {
      const replaceResumeResult =
        await this.executeOperationFromReconcilePath(operation);
      if (replaceResumeResult?.skipped === true) {
        this.ensurePriorityActiveReplaceRetryArmed(operation);
      }
      return;
    }
    await this.replayReplaceActiveSourceRemovalFromAuthoritative(operation);
  }

  /**
   * Evaluate safety error for a move intent.
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    if (!move) {
      return null;
    }
    const normalizedType =
      typeof move.type === 'string' ? move.type.toUpperCase() : move.type;
    const operation = {
      type: normalizedType,
      partitionId: move.partitionId || move.entityId,
      replicaId: move.replicaId,
      targetNodeId: move.nodeId,
      workflowStep: WORKFLOW_STEP.PENDING,
    };
    return this.getRemoveSafetyError(operation);
  }

  // --- Observed-progress reconciliation ---

  /**
   * @param {Object} operation
   * @return {boolean}
   */
}

export {OperationWorkflowOwnerSegment6};
