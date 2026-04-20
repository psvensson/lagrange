import { OPERATION_WORKFLOW_OWNER_SHARED } from './operation-workflow-owner-shared.js';
import { OperationWorkflowOwnerSegment7 } from './operation-workflow-owner-segment-7.js';

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

class OperationWorkflowOwner extends OperationWorkflowOwnerSegment7 {
  async handleRecovery() {
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START,
      {nodeId: this.nodeId},
    );

    const result = {
      totalIncomplete: NUM.ZERO,
      markedFailed: NUM.ZERO,
      reconciled: NUM.ZERO,
      errors: [],
    };

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryCachedIncompleteOperations() :
      [];
    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE
            .CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
    result.totalIncomplete = incompleteOps.length;
    result.incompleteOperationObservationState =
      incompleteOperationObservation.state;
    result.incompleteOperationRetryAfterMs =
      incompleteOperationObservation.retryAfterMs;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND,
      {
        count: incompleteOps.length,
        incompleteOperationObservationState:
          incompleteOperationObservation.state,
        incompleteOperationRetryAfterMs:
          incompleteOperationObservation.retryAfterMs,
        nodeId: this.nodeId,
      },
    );

    for (const op of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;

      const singleFlightKey =
        this.getOperationOwnerSingleFlightKey(
          op.operationId,
        );

      try {
        await this.operationWorkflowRunExclusive(
          singleFlightKey,
          () => this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        if (this.deferTransitionRetry(
          op.operationId,
          error,
          {
            boundary: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
            workflowStep: op?.workflowStep || null,
            partitionId: op?.partitionId || null,
            updatedAt: op?.updatedAt,
            createdAt: op?.createdAt,
          },
        )) {
          continue;
        }
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG
            .RECOVERY_MARK_FAILED,
          {
            operationId: op.operationId,
            workflowStep: originalStep,
            partitionId: op.partitionId,
            error: error.message,
          },
        );
        continue;
      }

      if (this.isPreSyncStep(originalStep) ||
          originalStep === WORKFLOW_STEP.STOPPING) {
        result.markedFailed++;
      } else if (originalStep === WORKFLOW_STEP.SYNCING) {
        result.reconciled++;
      }
    }

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED,
      {nodeId: this.nodeId, ...result},
    );

    const reservationResult =
      await this.reconcileReservations();
    result.reservationsExpired = reservationResult.expired;
    result.reservationsOrphansReleased =
      reservationResult.orphansReleased;

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
      result,
    );

    return result;
  }

  // --- Helpers ---

  /**
   * @param {string} errorMessage
   * @return {boolean}
   */
  isSafetyPolicyFailure(errorMessage) {
    if (typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING || !errorMessage) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return normalized.includes(
      OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
    ) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY_PROJECTION_MEMBERSHIP) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD) ||
      normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR.trim(),
      );
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @param {string} removeSafetyError
   * @return {boolean}
   */
  async getRemoveSafetyDeferReason(
    operation,
    replaceRemovePhase,
    removeSafetyError,
  ) {
    if (!operation || !this.isSafetyPolicyFailure(removeSafetyError)) {
      return null;
    }
    if (operation.type === OperationType.REPLACE && replaceRemovePhase) {
      return REBALANCE_COORDINATOR_DEFER_REASON
        .REPLACE_REMOVE_SAFETY_BLOCKED;
    }
    if (operation.type !== OperationType.REMOVE ||
        !await this.isCriticalRemoveOverReplicated(operation)) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON
      .REMOVE_SAFETY_BLOCKED;
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   */
  async isCriticalRemoveOverReplicated(operation) {
    if (!operation ||
        operation.type !== OperationType.REMOVE ||
        !this.isCriticalSystemPartition(operation.partitionId)) {
      return false;
    }
    const criticalReplicaRows =
      await this.getCriticalReplicaRowsForSafety(
        operation.partitionId,
      );
    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    return criticalReplicaRows.length > minReplicaCount;
  }

  /**
   * @param {string|null|undefined} operationId
   * @return {void}
   */
  clearDeferredSafetyBlockState(operationId) {
    if (typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
        operationId.length === NUM.ZERO) {
      return;
    }
    this.clearSafetyDeferredRetry(operationId);
    this.safetyDeferredLogStateByOperationId
      .delete(operationId);
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {void}
   */
  logDeferredSafetyBlockedRemove(
    operation,
    errorMessage,
    deferReason,
  ) {
    const operationId = operation?.operationId;
    if (typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
        operationId.length === NUM.ZERO) {
      return;
    }
    const now = Date.now();
    const previousState =
      this.safetyDeferredLogStateByOperationId
        .get(operationId) || null;
    const errorChanged = previousState?.errorMessage !==
      errorMessage;
    const throttleElapsed = !previousState ||
      now - previousState.loggedAtMs >=
        SAFETY_DEFERRED_LOG_THROTTLE_MS;

    this.safetyDeferredLogStateByOperationId.set(
      operationId,
      {
        errorMessage,
        loggedAtMs: now,
      },
    );

    if (!errorChanged && !throttleElapsed) {
      return;
    }

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG
        .OPERATION_DEFERRED_BY_SAFETY_POLICY,
      {
        operationId,
        partitionId: operation.partitionId,
        sourceNodeId: operation.sourceNodeId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        reason: deferReason,
        errorMessage,
      },
    );
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING && errorLike.trim()) {
      return errorLike;
    }

    if (!errorLike || typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return fallbackMessage;
    }

    const candidateValues = [
      errorLike.message,
      errorLike.errorMessage,
      errorLike.error?.message,
      errorLike.error?.errorMessage,
      errorLike.details?.message,
      errorLike.details?.errorMessage,
    ];

    for (const candidate of candidateValues) {
      if (typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
          candidate.trim()) {
        return candidate;
      }
    }

    return fallbackMessage;
  }
}
export {OperationWorkflowOwner};

