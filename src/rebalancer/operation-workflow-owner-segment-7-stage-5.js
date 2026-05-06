import {OperationWorkflowOwnerSegment7Stage4} from './operation-workflow-owner-segment-7-stage-4.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-7-stage-shared.js';

const {
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  WORKFLOW_STEP,
} = SHARED;

class OperationWorkflowOwnerSegment7Stage5 extends OperationWorkflowOwnerSegment7Stage4 {
  async handleRecovery() {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, {
      nodeId: this.nodeId,
    });

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

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, {
      count: incompleteOps.length,
      incompleteOperationObservationState:
        incompleteOperationObservation.state,
      incompleteOperationRetryAfterMs:
        incompleteOperationObservation.retryAfterMs,
      nodeId: this.nodeId,
    });

    for (const op of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        op.operationId,
      );

      try {
        await this.operationWorkflowRunExclusive(
          singleFlightKey,
          () => this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        if (this.deferTransitionRetry(op.operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
          workflowStep: op?.workflowStep || null,
          partitionId: op?.partitionId || null,
          updatedAt: op?.updatedAt,
          createdAt: op?.createdAt,
        })) {
          continue;
        }
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
          {
            operationId: op.operationId,
            workflowStep: originalStep,
            partitionId: op.partitionId,
            error: error.message,
          },
        );
        continue;
      }

      if (
        this.isPreSyncStep(originalStep) ||
        originalStep === WORKFLOW_STEP.STOPPING
      ) {
        result.markedFailed++;
      } else if (originalStep === WORKFLOW_STEP.SYNCING) {
        result.reconciled++;
      }
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, {
      nodeId: this.nodeId,
      ...result,
    });

    const reservationResult = await this.reconcileReservations();
    result.reservationsExpired = reservationResult.expired;
    result.reservationsOrphansReleased =
      reservationResult.orphansReleased;

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
      result,
    );

    return result;
  }

  isSafetyPolicyFailure(errorMessage) {
    if (
      typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      !errorMessage
    ) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL
          .WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY_PROJECTION_MEMBERSHIP,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL
          .IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR
          .trim(),
      )
    );
  }

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
    if (
      operation.type !== OperationType.REMOVE ||
      !await this.isCriticalRemoveOverReplicated(operation)
    ) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED;
  }

  async isCriticalRemoveOverReplicated(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REMOVE ||
      !this.isCriticalSystemPartition(operation.partitionId)
    ) {
      return false;
    }
    const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(
      operation.partitionId,
    );
    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    return criticalReplicaRows.length > minReplicaCount;
  }

  clearDeferredSafetyBlockState(operationId) {
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return;
    }
    this.clearSafetyDeferredRetry(operationId);
    this.safetyDeferredLogStateByOperationId.delete(operationId);
  }

  logDeferredSafetyBlockedRemove(
    operation,
    errorMessage,
    deferReason,
  ) {
    const operationId = operation?.operationId;
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return;
    }
    const now = Date.now();
    const previousState =
      this.safetyDeferredLogStateByOperationId.get(operationId) || null;
    const errorChanged = previousState?.errorMessage !== errorMessage;
    const throttleElapsed = !previousState ||
      now - previousState.loggedAtMs >=
        SAFETY_DEFERRED_LOG_THROTTLE_MS;

    this.safetyDeferredLogStateByOperationId.set(operationId, {
      errorMessage,
      loggedAtMs: now,
    });

    if (!errorChanged && !throttleElapsed) {
      return;
    }

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DEFERRED_BY_SAFETY_POLICY,
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

  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (
      typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      errorLike.trim()
    ) {
      return errorLike;
    }

    if (
      !errorLike ||
      typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
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
      if (
        typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        candidate.trim()
      ) {
        return candidate;
      }
    }

    return fallbackMessage;
  }
}

export {OperationWorkflowOwnerSegment7Stage5};
