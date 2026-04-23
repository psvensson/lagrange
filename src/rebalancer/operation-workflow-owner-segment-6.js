import { OPERATION_WORKFLOW_OWNER_SHARED } from "./operation-workflow-owner-shared.js";
import { OperationWorkflowOwnerSegment5 } from "./operation-workflow-owner-segment-5.js";

const {
  AUTHORITATIVE_TRANSITION_RECOVERY_STATUS,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_MIN_REPLICA_COUNT,
  DIRECT_TRANSITION_PERSIST_PARTITION_IDS,
  DISPATCH_RETRY_DELAY_MS,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  FAILURE_LOG_LEVEL,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INITIAL_PARTITION_IDS,
  METRICS_LOG_TAG,
  NUM,
  OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_HANDLER,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_METADATA_KEY,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_TRANSITION_REASON,
  OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  PARTITION_SERVICE_ERROR_MSG,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  QUERY_ERROR_MSG,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECOVERABLE_TRANSITION_COMMIT_STATUS,
  RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  SERVICE_TYPE,
  SQL_RECONCILIATION_REASON,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TRANSACTION_STATUS,
  TRANSITION_RECOVERY_READ_OPTIONS,
  TRANSITION_RECOVERY_SQL,
  TRANSITION_RETRY_DELAY_MS,
  TRANSITION_STEP_OPTIONS,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  buildControlPlaneQueryOptions,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryOperationAssessment,
  buildSelectRowsByTransactionIdsSql,
  buildTimeoutClassification,
  classifyTransportDeliveryOutcome,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  getControlPlaneRetryAfterMs,
  getWorkflowSteps,
  hasPriorityRecoverySpreadGap,
  isCoordinatorOwnedOperationType,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX =
  " operation visibility is deferred for safe removal";

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
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
        ? planningSnapshot.priorityPartitionSummary
        : null;
    const decisionSnapshot =
      this.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId || operation.entityId || "",
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
    const membershipNodeIds = useRecoveryProjectionMembership
      ? recoveryProjectionNodeIds
      : publishedActiveNodeIds;
    const membershipSource = useRecoveryProjectionMembership
      ? PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE.RECOVERY_PROJECTION_MEMBERSHIP
      : PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE.PUBLISHED_MEMBERSHIP;
    const membershipNodeIdSet = useRecoveryProjectionMembership
      ? recoveryProjectionNodeIdSet
      : publishedActiveNodeIdSet;
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
   * @param {boolean} replaceRemoveDispatchPhase
   * @return {boolean}
   */
  isPriorityRecoverySupersededTargetFailureApplicable(
    operation,
    replaceRemoveDispatchPhase,
  ) {
    if (
      !operation ||
      (operation.type !== OperationType.ADD &&
        operation.type !== OperationType.REPLACE)
    ) {
      return false;
    }
    return replaceRemoveDispatchPhase !== true;
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
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        supersededTargetError,
      );
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

    const targetNodeId = String(operation.targetNodeId || "").trim();
    if (targetNodeId.length === NUM.ZERO) {
      return null;
    }

    const priorityPartitionSummary =
      priorityRecoveryContext.priorityPartitionSummary;
    const eligibleNodeIds = normalizeNodeIdList(
      priorityRecoveryContext.effectiveEligibleNodeIds,
    );
    if (
      !hasPriorityRecoverySpreadGap(priorityPartitionSummary) ||
      eligibleNodeIds.length === NUM.ZERO ||
      eligibleNodeIds.includes(targetNodeId)
    ) {
      return null;
    }

    const blockedPartitionIds = priorityPartitionSummary
      ? buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary)
      : [];
    if (
      blockedPartitionIds.length > NUM.ZERO &&
      !blockedPartitionIds.includes(operation.partitionId)
    ) {
      return null;
    }

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
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        supersededTargetError,
      );
    }
    if (
      priorityRecoveryCompletion?.state ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED
    ) {
      const replaceRemovePhase = this.repository.isReplaceRemovePhase(
        operation,
      );
      const deferReason = await this.resolveRemoveSafetyDeferredReason(
        operation,
        replaceRemovePhase,
      );
      const deferredVisibilityError =
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
        operation.partitionId +
        PRIORITY_OPERATION_VISIBILITY_DEFERRED_SAFE_REMOVAL_SUFFIX;
      if (!deferReason) {
        return this.buildFailedRemoveSafetyEvaluation(
          deferredVisibilityError,
        );
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
      operation.type === OperationType.REPLACE
        ? this.repository.getReplaceSourceReplicaId(operation)
        : operation.replicaId;

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

    const requiresSourceLeaderHandoff =
      operation.type === OperationType.REPLACE &&
      this.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId);

    if (!removingVoterReady && !requiresSourceLeaderHandoff) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    if (isReplaceRemoveInitialDispatch) {
      const replacementReplicaId =
        this.repository.getReplaceTargetReplicaId(operation);
      if (!replacementReplicaId) {
        return this.buildDeferredRemoveSafetyEvaluationForOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
            operation.partitionId +
            OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA +
            OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE,
        );
      }
      const replacementReplica = criticalReplicaRows.find((row) => {
        return (
          row?.service_id === replacementReplicaId ||
          row?.replica_id === replacementReplicaId
        );
      });
      if (
        !this.isVoterReadyRoutableReplica(
          replacementReplica,
          removeSafetyReadiness,
        )
      ) {
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

    const priorityPublicationLeaderRemoveSafetyEvaluation =
      await this.evaluatePriorityPublicationLeaderRemoveSafety(
        operation,
        removingReplicaRow,
      );
    if (priorityPublicationLeaderRemoveSafetyEvaluation) {
      return priorityPublicationLeaderRemoveSafetyEvaluation;
    }

    const priorityRecoveryCompletionEvaluation =
      await this.evaluatePriorityRecoveryCompletionRemoveSafety(operation);
    if (priorityRecoveryCompletionEvaluation) {
      return priorityRecoveryCompletionEvaluation;
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
    if (projectedVoterReadyCount < minReplicaCount) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        `Critical partition ${operation.partitionId}` +
          OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
          ` (${projectedVoterReadyCount}/${minReplicaCount})`,
      );
    }

    return this.evaluatePriorityPublishedMembershipRemoveSafety(
      operation,
      projectedVoterReadyRows,
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
        { requireOwnerRpcRead: true },
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
    const retainedStepsHistory = Array.isArray(targetOperation.stepsHistory)
      ? targetOperation.stepsHistory
      : [];
    const observedStepsHistory = Array.isArray(sourceOperation.stepsHistory)
      ? sourceOperation.stepsHistory
      : [];
    const adoptedStepsHistory =
      observedStepsHistory.length > NUM.ZERO ?
        observedStepsHistory :
        retainedStepsHistory;
    const clonedStepsHistory = adoptedStepsHistory.map((entry) => {
      return entry && typeof entry === TYPEOF.OBJECT ?
        {...entry} :
        entry;
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
        sourceOperation.replicaId.length > NUM.ZERO
          ? sourceOperation.replicaId
          : null;
      const observedTargetReplicaId =
        typeof canonicalSourceReplicaId ===
          OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        canonicalSourceReplicaId.length > NUM.ZERO &&
        typeof observedReplicaId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        observedReplicaId !== canonicalSourceReplicaId
          ? observedReplicaId
          : null;
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
        { requireOwnerRpcRead: true },
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

    const activeTransitionCommitted = await this.updateStep(
      operation,
      WORKFLOW_STEP.ACTIVE,
    );
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
      typeof move.type === "string" ? move.type.toUpperCase() : move.type;
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

export { OperationWorkflowOwnerSegment6 };
