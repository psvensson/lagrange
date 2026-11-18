
const LOCAL_STR_ACTIVE_REPLICAS_BELOW_MINIMUM =
  'would drop active replicas below minimum';
const LOCAL_STR_SAFETY_POLICY_UNAVAILABLE = 'safety policy unavailable';
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
import {DEBT_CENSUS, reconcileMessageGroupMembershipDebt,
  wakeMessageGroupMembershipDebtForRow} from
  './operation-workflow-message-group-membership-recovery.js';
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
import {presentOperationOf} from
  './replica-operation-repository-operation-visibility.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_LOG_MSG,
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

const CRITICAL_REMOVE_REPLICATION_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  OVER_REPLICATED: 'over_replicated',
  AT_OR_BELOW_MINIMUM: 'at_or_below_minimum',
  UNAVAILABLE: 'unavailable',
});
const CRITICAL_REMOVE_DEFERRING_STATES = Object.freeze(new Set([
  CRITICAL_REMOVE_REPLICATION_STATE.OVER_REPLICATED,
  CRITICAL_REMOVE_REPLICATION_STATE.UNAVAILABLE,
]));

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
    // A row still owing a membership obligation, or a hosted witness for its
    // group, re-enters the one debt algorithm; a failure here is logged and
    // the debt waits for its next trigger.
    wakeMessageGroupMembershipDebtForRow(this, tableName, cacheOperation, record)
      .catch((error) => this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.MEMBERSHIP_DEBT_RETAINED,
        {nodeId: this.nodeId, error: error?.message || String(error)}));
    return super.handleObservedReplicaStateChange(
      tableName, cacheOperation, record);
  }

  /** Census every operation still owing a membership obligation and recover
   * the exact learner outcome through the existing recorder; nothing else.
   * The restart trigger: until one AUTHORITATIVE census has answered on this
   * owner (a restart must not trust the cache to list an owing row), each
   * sweep tick reads the owner's census; after that the cache hint serves.
   * A row whose learner proposal may be in flight is left to this owner on
   * restart - nothing fails or re-drives it - so this census is what picks
   * it up. A census that did not answer is retried on the next tick.
   * @param {string} [census] - DEBT_CENSUS; omitted: the restart rule above.
   * @return {Promise<Object>}
   */
  async reconcileMessageGroupMembershipDebt(census) {
    const restartCensusOwed = this.membershipDebtRestartCensusAnswered !== true;
    const resolvedCensus = census ||
      (restartCensusOwed ? DEBT_CENSUS.AUTHORITATIVE : DEBT_CENSUS.CACHE_HINT);
    const summary = await reconcileMessageGroupMembershipDebt(this, resolvedCensus);
    if (resolvedCensus === DEBT_CENSUS.AUTHORITATIVE && summary.available === true) {
      this.membershipDebtRestartCensusAnswered = true;
    }
    return summary;
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
      normalized.includes(LOCAL_STR_ACTIVE_REPLICAS_BELOW_MINIMUM) ||
      normalized.includes(LOCAL_STR_SAFETY_POLICY_UNAVAILABLE) ||
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
    return this.resolveCriticalRemoveDeferReason(operation);
  }

  /**
   * Whether a refused system-partition REMOVE is over-replicated (so it
   * waits for a later removal window) - as a named state: an unavailable
   * replica-row read is UNAVAILABLE, never "not over-replicated" (which
   * turned a blocked REMOVE into a FAIL on a read that did not answer).
   * @param {Object} operation
   * @return {Promise<string>} CRITICAL_REMOVE_REPLICATION_STATE
   */
  async classifyCriticalRemoveReplication(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REMOVE ||
      !classifySystemPartition({partitionId: operation.partitionId}).systemTable
    ) {
      return CRITICAL_REMOVE_REPLICATION_STATE.NOT_APPLICABLE;
    }
    const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(
      operation.partitionId,
    );
    if (criticalReplicaRows.authoritativeReadAvailable === false) {
      return CRITICAL_REMOVE_REPLICATION_STATE.UNAVAILABLE;
    }
    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    return criticalReplicaRows.length > minReplicaCount ?
      CRITICAL_REMOVE_REPLICATION_STATE.OVER_REPLICATED :
      CRITICAL_REMOVE_REPLICATION_STATE.AT_OR_BELOW_MINIMUM;
  }

  /**
   * The remove-safety deferral a refused REMOVE takes, or null (it fails):
   * it waits while over-replicated or while that cannot be read.
   * @param {Object} operation
   * @return {Promise<string|null>}
   */
  async resolveCriticalRemoveDeferReason(operation) {
    return CRITICAL_REMOVE_DEFERRING_STATES.has(
      await this.classifyCriticalRemoveReplication(operation)) ?
      REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED :
      null;
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
            undefined, {stepMetadata}) &&
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
    const durable = presentOperationOf(await this.repository
      .queryReplicaOperationPersistenceAuthorityObservation(operation));
    if (!durable || this.repository.isOperationTerminal(durable)) {
      return false;
    }
    if (durable.workflowStep !== WORKFLOW_STEP.STOPPING) {
      if (this.transitionRetryTimerByOperationId?.has(operation?.operationId)) {
        return false;
      }
      if (await this.updateStep(durable, WORKFLOW_STEP.STOPPING,
        undefined, {stepMetadata}) &&
          replaceIntentEntryOf(durable)) {
        adoptDurableReplaceIntent(operation, durable);
        return true;
      }
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
      // A handler answer or a transport outcome carries its text as `error`.
      errorLike.error,
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
