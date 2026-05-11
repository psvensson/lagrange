import {OperationWorkflowOwnerSegment7Stage4} from './operation-workflow-owner-segment-7-stage-4.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-7-stage-shared.js';

const {
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  TRANSITION_RETRY_DELAY_MS,
  WORKFLOW_STEP,
} = SHARED;

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  NOT_OWNER_ADVANCE: 'not_owner_advance',
  NOT_DISPATCH_PENDING: 'not_dispatch_pending',
  NOT_DISPATCH_RETRYABLE: 'not_dispatch_retryable',
  OWNER_LANE_RETRY_REQUIRED: 'owner_lane_retry_required',
  OWNER_LANE_HELD: 'owner_lane_held',
  REMOTE_RETRY_ACTIVE: 'remote_retry_active',
  REENTER: 'reenter',
});

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION = Object.freeze({
  SKIP: 'skip',
  ARM_NOW: 'arm_now',
  RETRY_AFTER_OWNER_LANE: 'retry_after_owner_lane',
});

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION_BY_STATE =
  Object.freeze(new Map([
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REENTER,
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.ARM_NOW,
    ],
    [
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE
        .OWNER_LANE_RETRY_REQUIRED,
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
        .RETRY_AFTER_OWNER_LANE,
    ],
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTUATION_STATES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.NOT_OWNER_ADVANCE,
    matches: (evidence) => evidence.ownerAdvance !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.NOT_DISPATCH_PENDING,
    matches: (evidence) => evidence.dispatchPending !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.NOT_DISPATCH_RETRYABLE,
    matches: (evidence) => evidence.dispatchRetryable !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE
        .OWNER_LANE_RETRY_REQUIRED,
    matches: (evidence) =>
      evidence.ownerLaneHeld === true &&
      evidence.ownerLaneRetryAllowed === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.OWNER_LANE_HELD,
    matches: (evidence) => evidence.ownerLaneHeld === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REMOTE_RETRY_ACTIVE,
    matches: (evidence) => evidence.remoteRetryActive === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.REENTER,
    matches: () => true,
  }),
]);

class OperationWorkflowOwnerSegment7Stage5 extends OperationWorkflowOwnerSegment7Stage4 {
  async getPriorityRecoveryDecisionSnapshotForPartitionOperations(
    partitionId,
    operations = [],
  ) {
    const snapshot =
      await super.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
        partitionId,
        operations,
      );
    this.schedulePriorityRecoveryDispatchPendingReentry(snapshot, operations);
    return snapshot;
  }

  selectPriorityRecoveryDispatchPendingReentryOperation(
    snapshot,
    operations = [],
  ) {
    const snapshotOperationId = String(
      snapshot?.coordinator?.operation?.operationId ||
        snapshot?.operationId ||
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    const operationRecords = Array.isArray(operations) ? operations : [];
    const matchingOperation = operationRecords.find((operation) => {
      return (
        operation &&
        typeof operation === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT &&
        operation.operationId === snapshotOperationId
      );
    });
    if (matchingOperation) {
      return matchingOperation;
    }
    const snapshotOperation = snapshot?.coordinator?.operation || null;
    if (
      !snapshotOperation ||
      typeof snapshotOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ||
      snapshotOperationId.length === NUM.ZERO
    ) {
      return null;
    }
    return Object.freeze({
      ...snapshotOperation,
      operationId: snapshotOperationId,
      createdAt: snapshotOperation.createdAtMs,
      updatedAt: snapshotOperation.updatedAtMs,
      completedAt: snapshotOperation.completedAtMs,
    });
  }

  buildPriorityRecoveryDispatchPendingReentryEvidence(
    snapshot,
    operation,
    options = {},
  ) {
    const operationId = String(
      operation?.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    return Object.freeze({
      operationAvailable:
        operation &&
        typeof operation === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT &&
        operationId.length > NUM.ZERO,
      ownerAdvance:
        snapshot?.actuation?.owner ===
          PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
        snapshot?.progress?.currentOwner ===
          PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
        snapshot?.progress?.nextRequiredAction ===
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
        snapshot?.progress?.blockingBoundary ===
          PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
        snapshot?.progress?.waitMode ===
          PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      dispatchPending:
        PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTUATION_STATES.has(
          snapshot?.actuation?.state,
        ) &&
        snapshot?.actuation?.workflowProgressPhaseId ===
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
        snapshot?.progress?.workflowProgressPhaseId ===
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      dispatchRetryable: this.isDispatchRetryableWorkflowStep(operation),
      ownerLaneHeld: this.isOperationOwnerLaneHeld(operationId),
      ownerLaneRetryAllowed: options.allowOwnerLaneRetry === true,
      remoteRetryActive:
        !this.repository.isOperationLocallyOwned(operation) &&
        this.hasActiveCreatedOperationHandoffRetry(operationId),
    });
  }

  resolvePriorityRecoveryDispatchPendingReentryState(evidence) {
    return (
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE.UNAVAILABLE
    );
  }

  resolvePriorityRecoveryDispatchPendingReentryAction(
    snapshot,
    operation,
    options = {},
  ) {
    const evidence =
      this.buildPriorityRecoveryDispatchPendingReentryEvidence(
        snapshot,
        operation,
        options,
      );
    const state = this.resolvePriorityRecoveryDispatchPendingReentryState(
      evidence,
    );
    return (
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION_BY_STATE.get(state) ||
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.SKIP
    );
  }

  applyPriorityRecoveryDispatchPendingReentryAction(operation, action) {
    if (
      action ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION.ARM_NOW
    ) {
      this.armCoordinatorCreatedOperation(operation).catch((error) => {
        this.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
          operation,
          error,
        );
      });
      return true;
    }
    if (
      action ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_ACTION
        .RETRY_AFTER_OWNER_LANE
    ) {
      return this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        operation,
        TRANSITION_RETRY_DELAY_MS,
      );
    }
    return false;
  }

  schedulePriorityRecoveryDispatchPendingReentry(
    snapshot,
    operations = [],
    options = {},
  ) {
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const action = this.resolvePriorityRecoveryDispatchPendingReentryAction(
      snapshot,
      operation,
      options,
    );
    return this.applyPriorityRecoveryDispatchPendingReentryAction(
      operation,
      action,
    );
  }

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
