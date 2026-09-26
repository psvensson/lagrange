import {NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {OperationWorkflowRecoveryDrain} from './operation-workflow-recovery-drain.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  attachReplicaConsensusEvents,
  captureReplaceOwnerLevel,
  clearReplaceOwnerWaiter,
  registerReplaceOwnerWaiter,
  shutdownReplaceOwnerWake,
  wakeReplaceOwnersForReplicaRow,
} from './operation-workflow-replace-owner-wake.js';
import {
  REPLACE_WAIT_REASON,
  clearAllReplaceOwnerState,
  clearReplaceOwnerState,
  reconcileReplaceStoppingOwner,
  recordReplaceOwnerWait,
} from './operation-workflow-replace-owner.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {
  REPLACE_OWNER_RESTART_CLASS,
  startReplaceOwnerSession,
} from './operation-workflow-replace-owner-recovery.js';
import {replaceIntentEntryOf} from './operation-workflow-replace-owner-state.js';
import {
  applyPriorityRecoveryDispatchPendingOwnerProgress,
  applyPriorityRecoveryDispatchPendingReentryAction,
  buildPriorityRecoveryDispatchPendingDrainContext,
  buildPriorityRecoveryDispatchPendingDrainEvidence,
  buildPriorityRecoveryDispatchPendingDrainSnapshot,
  buildPriorityRecoveryDispatchPendingReentryEvidence,
  reconcilePriorityRecoveryDispatchPendingDrain,
  resolvePriorityRecoveryDispatchPendingReentryAction,
  resolvePriorityRecoveryDispatchPendingReentryState,
  schedulePriorityRecoveryDispatchPendingReentry,
  selectPriorityRecoveryDispatchPendingReentryOperation,
  shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry,
  shouldReconcilePriorityRecoveryDispatchPendingDrain,
} from './operation-workflow-recovery-reconcile-dispatch-pending.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  WORKFLOW_STEP,
  classifySystemPartition,
} = SHARED;
const {
  REBALANCER_SKIP_REASON,
  ReplicaOperationResponseStatus,
  SYSTEM_TABLE_NAME,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// The durable STOPPING row's step and history become the owner's copy.
function adoptDurableReplaceIntent(operation, durable) {
  operation.workflowStep = durable.workflowStep;
  operation.status = durable.status;
  operation.stepsHistory = [...durable.stepsHistory];
}

// The intent's metadata on the newest STOPPING entry (its timestamp - the
// step's entry time - is kept).
function recordIntentOnCurrentStoppingEntry(stepsHistory, stepMetadata) {
  const history = Array.isArray(stepsHistory) ? [...stepsHistory] : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.step === WORKFLOW_STEP.STOPPING) {
      history[index] = {...history[index], ...stepMetadata};
      return history;
    }
  }
  return history;
}

class OperationWorkflowRecoveryReconcile extends OperationWorkflowRecoveryDrain {
  constructor(options) {
    super(options);
    // A new owner instance begins its REPLACE-owner session: an operation
    // whose step began earlier may have lost its attempt state (BR10).
    startReplaceOwnerSession(this, REPLACE_OWNER_RESTART_CLASS.PROCESS_RESTART);
  }

  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    this.releaseObservedTerminalOperationState(
      tableName, cacheOperation, record);
    if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
      wakeReplaceOwnersForReplicaRow(this, record);
    }
    return super.handleObservedReplicaStateChange(
      tableName, cacheOperation, record);
  }

  /**
   * BR17: any terminal observation of an operation - written here or by
   * another node and seen only through the replicated row, or the row's
   * deletion - releases the owner's waiter, its fallback timer and its
   * REPLACE-owner state for it. Nothing waits on, or reads the witness for,
   * an operation that is over.
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object|null} record - The replicated row.
   */
  releaseObservedTerminalOperationState(tableName, cacheOperation, record) {
    const operationId = record?.operation_id;
    if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
        typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING) {
      return;
    }
    const deleted = cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE;
    if (!deleted && (record.completed_at === null ||
        record.completed_at === undefined)) {
      return;
    }
    this.clearDeferredSafetyBlockState(operationId);
    clearReplaceOwnerState(this, operationId);
  }

  async getPriorityRecoveryDecisionSnapshotForPartitionOperations(
    partitionId,
    operations = [],
  ) {
    const snapshot =
      await super.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
        partitionId,
        operations,
      );
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const normalizedSnapshot =
      typeof this.normalizePriorityRecoveryDispatchPendingOwnerSnapshot ===
        'function' ?
        this.normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
          snapshot,
          operation,
        ) :
        snapshot;
    this.schedulePriorityRecoveryDispatchPendingReentry(
      normalizedSnapshot,
      operation ? [operation] : operations, {executeOwnerObservationEffect: false},
    );
    return normalizedSnapshot;
  }

  selectPriorityRecoveryDispatchPendingReentryOperation(
    snapshot,
    operations = [],
  ) {
    return selectPriorityRecoveryDispatchPendingReentryOperation(
      snapshot,
      operations,
    );
  }

  buildPriorityRecoveryDispatchPendingReentryEvidence(
    snapshot,
    operation,
    options = {},
  ) {
    return buildPriorityRecoveryDispatchPendingReentryEvidence(
      this,
      snapshot,
      operation,
      options,
    );
  }

  resolvePriorityRecoveryDispatchPendingReentryState(evidence) {
    return resolvePriorityRecoveryDispatchPendingReentryState(evidence);
  }

  resolvePriorityRecoveryDispatchPendingReentryAction(
    snapshot,
    operation,
    options = {},
  ) {
    return resolvePriorityRecoveryDispatchPendingReentryAction(
      this,
      snapshot,
      operation,
      options,
    );
  }

  shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry(
    operation,
    decisionSnapshot,
  ) {
    return shouldRefreshPriorityRecoveryDispatchPendingRemoteRetry(
      this,
      operation,
      decisionSnapshot,
    );
  }

  applyPriorityRecoveryDispatchPendingReentryAction(
    operation,
    action,
    decisionSnapshot = null,
    options = {},
  ) {
    return applyPriorityRecoveryDispatchPendingReentryAction(
      this,
      operation,
      action,
      decisionSnapshot,
      options,
    );
  }

  async applyPriorityRecoveryDispatchPendingOwnerProgress(
    operation,
    decisionSnapshot,
    options = {},
  ) {
    return applyPriorityRecoveryDispatchPendingOwnerProgress(
      this,
      operation,
      decisionSnapshot,
      options,
    );
  }

  buildPriorityRecoveryDispatchPendingDrainEvidence(decisionSnapshot) {
    return buildPriorityRecoveryDispatchPendingDrainEvidence(decisionSnapshot);
  }

  shouldReconcilePriorityRecoveryDispatchPendingDrain(decisionSnapshot) {
    return shouldReconcilePriorityRecoveryDispatchPendingDrain(
      this,
      decisionSnapshot,
    );
  }

  buildPriorityRecoveryDispatchPendingDrainContext(decisionSnapshot) {
    return buildPriorityRecoveryDispatchPendingDrainContext(decisionSnapshot);
  }

  async buildPriorityRecoveryDispatchPendingDrainSnapshot(
    operation,
    decisionSnapshot,
  ) {
    return buildPriorityRecoveryDispatchPendingDrainSnapshot(
      this,
      operation,
      decisionSnapshot,
    );
  }

  async reconcilePriorityRecoveryDispatchPendingDrain(
    operation,
    decisionSnapshot,
  ) {
    return reconcilePriorityRecoveryDispatchPendingDrain(
      this,
      operation,
      decisionSnapshot,
    );
  }

  schedulePriorityRecoveryDispatchPendingReentry(
    snapshot,
    operations = [],
    options = {},
  ) {
    return schedulePriorityRecoveryDispatchPendingReentry(
      this,
      snapshot,
      operations,
      options,
    );
  }

  async handleRecovery() {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, {
      nodeId: this.nodeId,
    });

    const result = {
      totalIncomplete: 0,
      markedFailed: 0,
      reconciled: 0,
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

      if (NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS.has(originalStep)) {
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
      !classifySystemPartition({partitionId: operation.partitionId}).systemTable
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
      operationId.length === 0
    ) {
      return;
    }
    this.clearSafetyDeferredRetry(operationId);
    clearReplaceOwnerWaiter(this, operationId);
    this.safetyDeferredLogStateByOperationId.delete(operationId);
  }

  /**
   * The REPLACE owner waits: the 1 s fallback is armed (the liveness
   * backstop) and the wait is registered with the single REPLACE-owner wake
   * against the level captured before the waiting decision's reads.
   * @param {Object} operation
   * @param {string} reason - REPLACE_WAIT_REASON.
   * @param {Object|null} entryLevel
   * @return {boolean}
   */
  armReplaceOwnerWait(operation, reason, entryLevel) {
    this.scheduleDeferredSafetyRetry(operation, reason, reason);
    return registerReplaceOwnerWaiter(this, operation, entryLevel);
  }

  /**
   * T5': the STOPPING owner re-sends the source's removal effect through the
   * same remove-safety evaluation and effect boundary.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  executeReplaceSourceRemovalEffect(operation) {
    return this.executeOperationInternal(operation, {
      replaceStoppingEffect: true,
    });
  }

  /**
   * Persist a REPLACE's removal intent: the STOPPING CAS with its witness
   * metadata, counted only when the durable row holds an intent entry. The
   * first intent's witness commit index (C0) is kept: a durable STOPPING
   * that already carries an intent is adopted as it is; one that does not
   * (another writer's STOPPING, or an idempotent transition that wrote no
   * entry) gets this intent's metadata on its STOPPING entry.
   * @param {Object} operation
   * @param {Object} stepMetadata
   * @return {Promise<boolean>}
   */
  async persistReplaceRemovalIntent(operation, stepMetadata) {
    try {
      if (operation.workflowStep !== WORKFLOW_STEP.STOPPING &&
          await this.updateStep(operation, WORKFLOW_STEP.STOPPING,
            undefined, {stepMetadata, requireDurable: true}) &&
          replaceIntentEntryOf(operation)) {
        // This owner's own durable transition committed the intent entry.
        return true;
      }
      return await this.ensureReplaceRemovalIntentRecorded(
        operation, stepMetadata);
    } catch (error) {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.REPLACE_SOURCE_REMOVAL_WAITING,
        {operationId: operation?.operationId || null,
          reason: REPLACE_WAIT_REASON.REMOVAL_INTENT_NOT_DURABLE,
          error: error?.message || String(error)});
      return false;
    }
  }

  /**
   * @param {Object} operation
   * @param {Object} stepMetadata
   * @return {Promise<boolean>} Whether the durable row holds the intent.
   * @private
   */
  async ensureReplaceRemovalIntentRecorded(operation, stepMetadata) {
    const durable = await this.repository
      .queryReplicaOperationPersistenceAuthorityOperation(operation);
    if (durable?.workflowStep !== WORKFLOW_STEP.STOPPING) {
      return false;
    }
    if (replaceIntentEntryOf(durable)) {
      adoptDurableReplaceIntent(operation, durable);
      return true;
    }
    const recorded = {
      ...durable,
      stepsHistory: recordIntentOnCurrentStoppingEntry(
        durable.stepsHistory, stepMetadata),
    };
    const persisted = await this.repository.persistOperationUpdate(recorded, {
      ...this.buildOperationTransitionPersistOptions(),
      expectedWorkflowStep: WORKFLOW_STEP.STOPPING,
      returnDisposition: true,
    });
    if (persisted?.persisted === false) {
      return false;
    }
    adoptDurableReplaceIntent(operation, recorded);
    return true;
  }

  /**
   * Run the STOPPING owner of a partition REPLACE and answer as an execute
   * result: the T5' re-send's own result; COMPLETED when the owner reached a
   * terminal; IN_PROGRESS while it waits.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async runReplaceStoppingOwner(operation) {
    const entryLevel = captureReplaceOwnerLevel(this, operation);
    const outcome = await reconcileReplaceStoppingOwner(
      this, operation, {entryLevel});
    if (outcome && typeof outcome === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return outcome;
    }
    // Progress completed or failed the operation; a wait keeps its source
    // removal in progress under the same owner.
    return this.buildSuccessfulOperationResult(operation.operationId, {
      status: outcome === true ?
        ReplicaOperationResponseStatus.COMPLETED :
        OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS,
    });
  }

  /**
   * The removal-effect boundary said wait: record it and arm the owner's
   * wake against the level the SAFE evaluation started from.
   * @param {Object} operation
   * @param {Object} effect
   * @param {Object|null} entryLevel - Captured before the SAFE evaluation.
   * @return {Object}
   */
  waitReplaceSourceRemovalEffect(operation, effect, entryLevel) {
    if (recordReplaceOwnerWait(this, operation, effect.reason,
      {observation: effect.witness || null})) {
      this.armReplaceOwnerWait(operation, effect.reason, entryLevel);
    }
    return this.buildSkippedOperationResult(
      REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
      operation.operationId,
      {deferReason: effect.reason},
    );
  }

  /**
   * @param {Object|null} source - The node's partition consensus relay.
   * @return {boolean}
   */
  attachReplicaConsensusEvents(source) {
    return attachReplicaConsensusEvents(this, source);
  }

  /**
   * Release owner-local deferred retry state, including the REPLACE-owner
   * wake's subscriptions, waiters and in-memory attempt state.
   */
  shutdown() {
    shutdownReplaceOwnerWake(this);
    clearAllReplaceOwnerState(this);
    super.shutdown();
  }

  logDeferredSafetyBlockedRemove(
    operation,
    errorMessage,
    deferReason,
  ) {
    const operationId = operation?.operationId;
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === 0
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

export {OperationWorkflowRecoveryReconcile};
