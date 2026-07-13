import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS,
} from './replica-operation-step-policy.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OperationType,
  PRIORITY_RECENT_INTENT_TTL_MS,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECENT_INTENT_TTL_MS,
  RECENT_OPERATION_INTENT_VISIBILITY_STATE,
  ReplicaStatus,
  SERVICE_TYPE,
  STRING,
  WORKFLOW_STEP,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const REUSED_OPERATION_REARM_ACTION = Object.freeze({
  SKIP_NOT_PENDING: 'skip_not_pending',
  SKIP_LIVE_DEFERRED_RETRY: 'skip_live_deferred_retry',
  REARM_DISPATCH: 'rearm_dispatch',
});
const LOCAL_STR_FAILED_TO_REFRESH_RECENT_OPERATION_INTEN = 'Failed to refresh recent operation intent from cache-visible state';
const PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);

class RebalanceCoordinatorOperationIntentMethods {
  /**
   * Normalize one move type to canonical upper-case enum representation.
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (typeof moveType !== LOCAL_STR_STRING) {
      return null;
    }
    const normalized = moveType.toUpperCase();
    if (normalized.length === 0) {
      return null;
    }
    return normalized;
  }

  /**
   * Build a stable in-memory idempotency key for a move intent.
   * @param {Object} move - Move specification.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {string} Intent key.
   * @private
   */
  buildOperationIntentKey(move, entityType, entityId) {
    const normalizedType = this.normalizeMoveType(move?.type) || '';
    const targetNodeId = move?.nodeId || '';
    const replicaIntent =
      normalizedType === OperationType.REMOVE ||
      normalizedType === OperationType.REPLACE ?
        move?.replicaId || '' :
        '';
    return `${entityType}:${entityId}:${normalizedType}:${targetNodeId}:${replicaIntent}`;
  }

  /**
   * Critical system partitions allow only one add-like recovery lifecycle in
   * flight. Use one broader key so target-node churn or authoritative entity
   * read misses cannot mint a second PENDING replacement for the same entity.
   *
   * @param {string|null} normalizedMoveType
   * @param {string} partitionId
   * @param {string} entityType
   * @param {string} entityId
   * @return {string|null}
   * @private
   */
  buildCriticalAddLikeIntentKey(
    move,
    normalizedMoveType,
    partitionId,
    entityType,
    entityId,
  ) {
    if (
      move?.enforceConcurrentOperationBudget !== true ||
      (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE) ||
      !this.isCriticalSystemPartition(partitionId)
    ) {
      return null;
    }
    return `${entityType}:${entityId}:critical_add_like`;
  }

  /**
   * Determine whether an in-flight operation matches a new move intent.
   * @param {Object} operation - Existing operation.
   * @param {Object} move - New move request.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {boolean} True when intents match.
   * @private
   */
  operationMatchesMoveIntent(operation, move, entityType, entityId) {
    if (!operation || !move) {
      return false;
    }

    const operationType = this.normalizeMoveType(operation.type) || '';
    const moveType = this.normalizeMoveType(move.type) || '';
    if (operationType !== moveType) {
      return false;
    }

    if (operation.targetNodeId !== move.nodeId) {
      return false;
    }

    if ((operation.entityType || SERVICE_TYPE.PARTITION) !== entityType) {
      return false;
    }

    if ((operation.entityId || operation.partitionId) !== entityId) {
      return false;
    }

    if (moveType === OperationType.REMOVE) {
      return operation.replicaId === move.replicaId;
    }

    if (moveType === OperationType.REPLACE) {
      return this.getReplaceSourceReplicaId(operation) === move.replicaId;
    }

    return true;
  }

  /**
   * Get a recently remembered operation intent.
   * @param {string} dedupeKey - Intent key.
   * @return {Object|null} Cached operation or null.
   * @private
   */
  async getRecentOperationIntent(dedupeKey) {
    const cached = this.recentOperationIntents.get(dedupeKey);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }
    const cachedOperation = cached.operation;
    if (!cachedOperation || this.isRecentOperationIntentTerminal(cachedOperation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }

    const cachedOperationId = cachedOperation.operationId;
    if (
      typeof cachedOperationId !== LOCAL_STR_STRING ||
      cachedOperationId.length === 0
    ) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }

    let cacheVisibleOperation = null;
    try {
      cacheVisibleOperation = await this.queryOperationById(cachedOperationId);
    } catch (error) {
      this.logger.debug(
        LOCAL_STR_FAILED_TO_REFRESH_RECENT_OPERATION_INTEN,
        {
          operationId: cachedOperationId,
          dedupeKey,
          error: error?.message || String(error),
        },
      );
    }
    if (
      cacheVisibleOperation &&
      this.isRecentOperationIntentTerminal(cacheVisibleOperation)
    ) {
      this.pruneRecentOperationIntentsForOperation(cacheVisibleOperation);
      return null;
    }
    const operationForMissReuse =
      cacheVisibleOperation && !this.isOperationTerminal(cacheVisibleOperation) ?
        cacheVisibleOperation :
        cachedOperation;

    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(cachedOperationId, {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      });
    if (!authoritativeOperation) {
      const authoritativeEntityVisibility =
        await this.inspectRecentOperationIntentEntityVisibility(
          operationForMissReuse,
        );
      if (
        authoritativeEntityVisibility.state ===
        RECENT_OPERATION_INTENT_VISIBILITY_STATE.MATCHING
      ) {
        if (this.isRecentOperationIntentTerminal(
          authoritativeEntityVisibility.operation,
        )) {
          this.pruneRecentOperationIntentsForOperation(
            authoritativeEntityVisibility.operation,
          );
          return null;
        }
        this.rememberOperationIntent(
          dedupeKey,
          authoritativeEntityVisibility.operation,
        );
        return authoritativeEntityVisibility.operation;
      }
      if (
        authoritativeEntityVisibility.state ===
        RECENT_OPERATION_INTENT_VISIBILITY_STATE.MISSING
      ) {
        this.pruneRecentOperationIntentsForOperation(operationForMissReuse);
        return null;
      }
      if (
        this.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
          operationForMissReuse,
        )
      ) {
        this.rememberOperationIntent(dedupeKey, operationForMissReuse);
        return operationForMissReuse;
      }
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }
    if (this.isRecentOperationIntentTerminal(authoritativeOperation)) {
      this.pruneRecentOperationIntentsForOperation(authoritativeOperation);
      return null;
    }

    this.rememberOperationIntent(dedupeKey, authoritativeOperation);
    return authoritativeOperation;
  }

  /**
   * Resolve whether the entity-scoped authoritative operation view still
   * substantiates one cached priority recent intent after the exact
   * operation-id read misses. This prevents stale create-intent entries from
   * suppressing the next recovery operation until the hard TTL expires once
   * the partition-level authoritative view has already moved on.
   *
   * @param {Object|null} operation
   * @return {Promise<Object>}
   * @private
   */
  async inspectRecentOperationIntentEntityVisibility(operation) {
    if (!operation) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const partitionId = String(
      operation.partitionId || operation.entityId || '',
    ).trim();
    if (
      partitionId.length === 0 ||
      !this.isPriorityControlPlanePartition(partitionId)
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const entityType = String(
      operation.entityType || SERVICE_TYPE.PARTITION,
    ).trim();
    const entityId = String(
      operation.entityId || operation.partitionId || '',
    ).trim();
    if (entityId.length === 0) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const observation = await this.getEntityAuthoritativeOperationObservation(
      entityType,
      entityId,
    );
    if (
      observation?.deferredOutcome ||
      observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const operationId = String(operation?.operationId || '').trim();
    const matchingOperation = Array.isArray(observation?.operations) ?
      observation.operations.find(
        (entry) => String(entry?.operationId || '').trim() === operationId,
      ) || null :
      null;
    if (matchingOperation) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.MATCHING,
        operation: matchingOperation,
      });
    }
    if (
      observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.MISSING,
        operation: null,
      });
    }
    if (
      !Array.isArray(observation?.operations) ||
      observation.operations.length === 0
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    return Object.freeze({
      state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.MISSING,
      operation: null,
    });
  }

  /**
   * Remember a recently created/reused operation intent.
   * @param {string} dedupeKey - Intent key.
   * @param {Object} operation - Operation payload.
   * @private
   */
  rememberOperationIntent(dedupeKey, operation) {
    if (!operation || this.isRecentOperationIntentTerminal(operation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return;
    }
    this.recentOperationIntents.set(dedupeKey, {
      operation,
      expiresAt: Date.now() + this.getRecentOperationIntentTtlMs(operation),
    });
  }

  /**
   * Recent create-intent rows are suppression hints, not semantic owners.
   * A removed row must retire the hint even when the original operation type
   * was add-like and the generic lifecycle grammar would treat removed as
   * type-inconsistent rather than terminal.
   *
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  isRecentOperationIntentTerminal(operation) {
    if (!operation) {
      return false;
    }
    if (this.isOperationTerminal(operation)) {
      return true;
    }
    return (
      operation.workflowStep === WORKFLOW_STEP.REMOVED ||
      operation.workflow_step === WORKFLOW_STEP.REMOVED ||
      operation.status === ReplicaStatus.REMOVED
    );
  }

  /**
   * Remember one operation under one or more intent keys.
   * @param {string[]|Set<string>} intentKeys
   * @param {Object} operation
   * @private
   */
  rememberOperationIntents(intentKeys, operation) {
    const keys = Array.isArray(intentKeys) ?
      intentKeys :
      Array.from(intentKeys || []);
    for (const key of keys) {
      if (typeof key !== LOCAL_STR_STRING || key.length === 0) {
        continue;
      }
      this.rememberOperationIntent(key, operation);
    }
  }

  /**
   * Reused create-intent rows may still be the correct in-flight operation
   * while remaining stuck at PENDING because the first owner-side handoff was
   * deferred or missed. Re-arm those rows through the canonical owner path so
   * later planning retries do not keep returning one limbo operation forever.
   *
   * @param {Object|null} operation
   * @param {Object} [options={}]
   * @param {boolean} [options.shouldEmitOperationCreated]
   * @return {Promise<Object|null>}
   * @private
   */
  async maybeRearmReusedPendingOperation(operation, _options = {}) {
    if (!operation) {
      return operation;
    }
    const workflowStep = String(
      operation?.workflowStep || operation?.workflow_step || '',
    ).trim();
    const rearmAction = this.resolveReusedOperationRearmAction(
      operation,
      workflowStep,
    );
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.REUSED_IN_FLIGHT_OPERATION,
      {
        operationId:
          operation.operationId || operation.operation_id || null,
        partitionId:
          operation.partitionId || operation.partition_id || null,
        moveTargetNodeId:
          operation.targetNodeId || operation.target_node_id || null,
        type: operation.type || operation.operation_type || null,
        workflowStep,
        rearmAction,
      },
    );
    if (rearmAction !== REUSED_OPERATION_REARM_ACTION.REARM_DISPATCH) {
      return operation;
    }
    await this.armCoordinatorCreatedOperationProgress(operation);
    return operation;
  }

  /**
   * Decide whether a reused operation needs a dispatch rearm. A live
   * deferred retry (dispatch retry, transition retry/grace, or
   * created-operation handoff retry) means the dispatch layer already owns
   * the next attempt, so a planning-tick rearm would only add a redundant
   * authoritative read, claim write, and remote dispatch attempt. Rearm is
   * reserved for the missed-handoff state: PENDING with no live timer.
   * @param {Object} operation
   * @param {string} workflowStep
   * @return {string} One REUSED_OPERATION_REARM_ACTION value.
   * @private
   */
  resolveReusedOperationRearmAction(operation, workflowStep) {
    if (
      this.isOperationTerminal(operation) ||
      workflowStep !== WORKFLOW_STEP.PENDING
    ) {
      return REUSED_OPERATION_REARM_ACTION.SKIP_NOT_PENDING;
    }
    if (this.hasLiveDeferredDispatchRetry(operation)) {
      return REUSED_OPERATION_REARM_ACTION.SKIP_LIVE_DEFERRED_RETRY;
    }
    return REUSED_OPERATION_REARM_ACTION.REARM_DISPATCH;
  }

  /**
   * Resolve whether the workflow owner already has a live deferred retry
   * scheduled for one operation. Checks both the dispatch/transition retry
   * timers and the created-operation handoff retry lane — the latter is not
   * covered by isOperationDeferredRetryActive.
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  hasLiveDeferredDispatchRetry(operation) {
    const operationId = String(
      operation?.operationId || operation?.operation_id || '',
    ).trim();
    if (operationId.length === 0) {
      return false;
    }
    const owner = this.workflowOwner;
    if (!owner) {
      return false;
    }
    if (
      typeof owner.isOperationDeferredRetryActive === LOCAL_STR_FUNCTION &&
      owner.isOperationDeferredRetryActive(operationId)
    ) {
      return true;
    }
    return (
      typeof owner.hasActiveCreatedOperationHandoffRetry ===
        LOCAL_STR_FUNCTION &&
      owner.hasActiveCreatedOperationHandoffRetry(operationId) === true
    );
  }

  /**
   * Drop cached create-intent entries that point at one terminal operation.
   * This keeps failed/completed priority recovery rows from suppressing the
   * next required operation while cache/owner reads are under pressure.
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  pruneRecentOperationIntentsForOperation(operation) {
    const operationId = String(
      operation?.operationId || operation?.operation_id || '',
    ).trim();
    if (operationId.length === 0) {
      return;
    }
    for (const [dedupeKey, entry] of this.recentOperationIntents.entries()) {
      if (String(entry?.operation?.operationId || '').trim() !== operationId) {
        continue;
      }
      this.recentOperationIntents.delete(dedupeKey);
    }
  }

  /**
   * Extend recent-intent retention for priority control-plane partitions so
   * transient owner-read misses do not create a new PENDING operation every
   * few seconds while the original one is still the intended recovery op.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationIntentTtlMs(operation) {
    const partitionId = String(
      operation?.partitionId || operation?.entityId || STRING.EMPTY,
    ).trim();
    if (!partitionId || !this.isPriorityControlPlanePartition(partitionId)) {
      return RECENT_INTENT_TTL_MS;
    }
    const configuredPendingTimeoutMs =
      Number.isFinite(this.config?.pendingTimeoutMs) &&
      this.config.pendingTimeoutMs > 0 ?
        Math.floor(this.config.pendingTimeoutMs) :
        RECENT_INTENT_TTL_MS;
    return Math.max(
      RECENT_INTENT_TTL_MS,
      PRIORITY_RECENT_INTENT_TTL_MS,
      configuredPendingTimeoutMs * NUM.FOUR,
    );
  }

  /**
   * Resolve the authoritative-miss reuse policy from one normalized operation
   * snapshot.
   * @param {Object|null} operation
   * @return {Object}
   * @private
   */
  resolveRecentOperationMissReuseSnapshot(operation) {
    const partitionId = String(
      operation?.partitionId || operation?.entityId || STRING.EMPTY,
    ).trim();
    const workflowStep = String(
      operation?.workflowStep || STRING.EMPTY,
    ).trim();
    const operationType = this.normalizeMoveType(operation?.type);
    const priorityPartition =
      partitionId.length > 0 &&
      this.isPriorityControlPlanePartition(partitionId);
    const usePriorityCreatePhaseBudget =
      priorityPartition &&
      PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_OPERATION_TYPES.has(
        operationType,
      ) &&
      PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS.has(
        workflowStep,
      );

    return Object.freeze({
      operationType,
      partitionId,
      priorityPartition,
      usePriorityCreatePhaseBudget,
      workflowStep,
    });
  }

  /**
   * Resolve the workflow-timeout window that defines how long a missing
   * recent intent is still credible as an in-flight recovery operation.
   * Priority ADD/REPLACE create-phase work keeps the longer recent-intent TTL
   * because deferred owner reads should not mint duplicate PENDING operations.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationMissReuseBudgetMs(operation) {
    const missReuseSnapshot =
      this.resolveRecentOperationMissReuseSnapshot(operation);
    if (missReuseSnapshot.usePriorityCreatePhaseBudget) {
      return this.getRecentOperationIntentTtlMs(operation);
    }

    const workflowStep = missReuseSnapshot.workflowStep;
    if (workflowStep === WORKFLOW_STEP.CREATING) {
      return this.config.creatingTimeoutMs;
    }
    if (workflowStep === WORKFLOW_STEP.SYNCING) {
      return this.config.syncingTimeoutMs;
    }
    if (
      workflowStep === WORKFLOW_STEP.STOPPING ||
      workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return this.config.removingTimeoutMs;
    }
    return this.config.pendingTimeoutMs;
  }

  /**
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getOperationAgeMs(operation) {
    // Intentionally anchored on updatedAt (recency-of-activity), NOT the
    // time-in-step anchor used by the CL-044 staleness sweep: this drives
    // intent-reuse exclusivity (shouldReuseRecentOperationIntentOnAuthoritativeMiss),
    // where a recently-touched op must KEEP its intent exclusive to avoid
    // multiplying replacement replicas. Aging it out on step time would re-admit
    // a duplicate intent — the opposite of the safety intent here.
    const updatedAt = Number(operation?.updatedAt);
    const createdAt = Number(operation?.createdAt);
    const startedAt =
      Number.isFinite(updatedAt) && updatedAt > 0 ?
        updatedAt :
        createdAt;
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      return 0;
    }
    return Math.max(0, Date.now() - startedAt);
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldReuseRecentOperationIntentOnAuthoritativeMiss(operation) {
    if (!operation || this.isOperationTerminal(operation)) {
      return false;
    }
    const missReuseSnapshot =
      this.resolveRecentOperationMissReuseSnapshot(operation);
    if (!missReuseSnapshot.priorityPartition) {
      return false;
    }

    // Source-removal phase must stay exclusive until entity visibility
    // explicitly proves the older REPLACE cleared. Timing out this recent
    // intent on a deferred read admits a second replacement and can multiply
    // active replicas for the same critical partition.
    const keepSourceRemovalIntentExclusive =
      missReuseSnapshot.operationType === OperationType.REPLACE &&
      this.isReplaceRemoveDispatchPhase(operation);
    if (keepSourceRemovalIntentExclusive) {
      return true;
    }

    const reuseBudgetMs = this.getRecentOperationMissReuseBudgetMs(operation);
    if (!Number.isFinite(reuseBudgetMs) || reuseBudgetMs <= 0) {
      return false;
    }

    return this.getOperationAgeMs(operation) < reuseBudgetMs;
  }
}

function applyRebalanceCoordinatorOperationIntentMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorOperationIntentMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorOperationIntentMethods};
