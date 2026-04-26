import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {RebalanceCoordinatorSegment1} from './rebalance-coordinator-segment-1.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OperationType,
  ReplicaStatus,
  PRIORITY_RECENT_INTENT_TTL_MS,
  RECENT_INTENT_TTL_MS,
  RECENT_OPERATION_INTENT_VISIBILITY_STATE,
  REPLICA_ID_SEPARATOR,
  REPLICA_ID_START_INDEX,
  SERVICE_TYPE,
  STRING,
  STORAGE_ADMISSION_DECISION_TYPE,
  TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
} = REBALANCE_COORDINATOR_SHARED;

const CANONICAL_REPLICA_ID_DECIMAL_RADIX = 10;
const TOPOLOGY_GUARD_ENTITY_TYPES = new Set([
  SERVICE_TYPE.PARTITION,
  SERVICE_TYPE.MESSAGE_GROUP,
  UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
]);
const TOPOLOGY_INCREASING_CREATE_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const TOPOLOGY_GUARD_TARGET_COUNT_OPERATION_TYPES = new Set([
  OperationType.ADD,
]);
const TOPOLOGY_GUARD_DEFAULT_SERVICE_STATUS = ReplicaStatus.ACTIVE;
const TOPOLOGY_GUARD_IGNORED_SERVICE_STATUSES = new Set([
  ReplicaStatus.REMOVED,
]);
const PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS = new Set([
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
]);
const TOPOLOGY_GUARD_ALLOWED_DECISION = Object.freeze({
  state: TOPOLOGY_GUARD_STATE.ALLOWED,
});

function extractCanonicalReplicaIndex(replicaId, canonicalPrefix) {
  if (typeof replicaId !== 'string' || replicaId.length === NUM.ZERO) {
    return null;
  }
  if (
    typeof canonicalPrefix !== 'string' ||
    canonicalPrefix.length === NUM.ZERO ||
    !replicaId.startsWith(canonicalPrefix)
  ) {
    return null;
  }

  const rawIndex = replicaId.slice(canonicalPrefix.length);
  if (rawIndex.length === NUM.ZERO) {
    return null;
  }

  const parsedIndex = Number.parseInt(
    rawIndex,
    CANONICAL_REPLICA_ID_DECIMAL_RADIX,
  );
  if (
    !Number.isInteger(parsedIndex) ||
    parsedIndex < REPLICA_ID_START_INDEX
  ) {
    return null;
  }
  return parsedIndex;
}

class RebalanceCoordinatorSegment2 extends RebalanceCoordinatorSegment1 {
  isTopologyGuardEntityType(entityType) {
    return TOPOLOGY_GUARD_ENTITY_TYPES.has(entityType);
  }

  isTopologyIncreasingCreateOperationType(normalizedMoveType) {
    return TOPOLOGY_INCREASING_CREATE_OPERATION_TYPES.has(normalizedMoveType);
  }

  isTopologyGuardTargetCountOperationType(normalizedMoveType) {
    return TOPOLOGY_GUARD_TARGET_COUNT_OPERATION_TYPES.has(
      normalizedMoveType,
    );
  }

  isTopologyGuardBlockingServiceRow(row) {
    const normalizedStatus = String(
      row?.status ?? TOPOLOGY_GUARD_DEFAULT_SERVICE_STATUS,
    ).toLowerCase();
    return !TOPOLOGY_GUARD_IGNORED_SERVICE_STATUSES.has(normalizedStatus);
  }

  async resolveTopologyGuardTargetReplicaCount({partitionId, entityType}) {
    if (entityType !== SERVICE_TYPE.PARTITION) {
      return null;
    }
    let policy = null;
    try {
      if (
        this.tablePolicyService &&
        typeof this.tablePolicyService.getPolicyForPartition === 'function'
      ) {
        policy =
          await this.tablePolicyService.getPolicyForPartition(partitionId);
      }
    } catch (_error) {
      policy = null;
    }
    const rawTargetReplicaCount = Number(
      policy?.targetReplicaCount || policy?.replicaCount,
    );
    if (
      Number.isFinite(rawTargetReplicaCount) &&
      rawTargetReplicaCount > NUM.ZERO
    ) {
      return Math.floor(rawTargetReplicaCount);
    }
    return TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT;
  }

  /**
   * Build one blocked create-result payload when the canonical topology
   * snapshot proves an add-like move would violate one-node-per-replica or
   * exceed the steady-state distinct-node target.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async buildTopologyGuardSnapshot(context) {
    const normalizedMoveType = context?.normalizedMoveType || null;
    const entityType = context?.entityType || SERVICE_TYPE.PARTITION;
    const entityId = context?.entityId || context?.partitionId || null;
    const partitionId = context?.partitionId || entityId;
    const targetNodeId = String(context?.move?.nodeId || '').trim();
    if (
      !this.isTopologyGuardEntityType(entityType) ||
      !this.isTopologyIncreasingCreateOperationType(normalizedMoveType) ||
      context?.move?.enforceConcurrentOperationBudget !== true ||
      targetNodeId.length === NUM.ZERO
    ) {
      return Object.freeze({
        state: TOPOLOGY_GUARD_STATE.ALLOWED,
        admissionResult: null,
      });
    }

    const cacheServiceRows = this.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    const authoritativeObservation =
      await this.getAuthoritativeEntityServiceRowsObservation({
        partitionId,
        entityType,
        entityId,
      });
    const mergedServiceRows = this.mergeEntityServiceRows(
      cacheServiceRows,
      authoritativeObservation.rows,
    );
    const topologyBlockingServiceRows = mergedServiceRows.filter((row) =>
      this.isTopologyGuardBlockingServiceRow(row),
    );
    const observedDistinctNodeIds = [
      ...new Set(
        topologyBlockingServiceRows
          .map((row) => String(row?.node_id || row?.nodeId || '').trim())
          .filter((nodeId) => nodeId.length > NUM.ZERO),
      ),
    ];
    const targetReplicaCount =
      await this.resolveTopologyGuardTargetReplicaCount({
        partitionId,
        entityType,
      });
    const topologyGuardDecisionTable = Object.freeze([
      Object.freeze({
        matches: observedDistinctNodeIds.includes(targetNodeId),
        state: TOPOLOGY_GUARD_STATE.TARGET_NODE_OCCUPIED,
        blockingReason: TOPOLOGY_GUARD_REASON.TARGET_NODE_ALREADY_OCCUPIED,
      }),
      Object.freeze({
        matches:
          this.isTopologyGuardTargetCountOperationType(normalizedMoveType) &&
          Number.isFinite(targetReplicaCount) &&
          observedDistinctNodeIds.length >= targetReplicaCount,
        state: TOPOLOGY_GUARD_STATE.TARGET_REPLICA_COUNT_SATISFIED,
        blockingReason:
          TOPOLOGY_GUARD_REASON.TARGET_REPLICA_COUNT_ALREADY_SATISFIED,
      }),
    ]);
    const topologyGuardDecision =
      topologyGuardDecisionTable.find((decision) => decision.matches) ||
      TOPOLOGY_GUARD_ALLOWED_DECISION;
    const state = topologyGuardDecision.state;

    if (state === TOPOLOGY_GUARD_STATE.ALLOWED) {
      return Object.freeze({
        state,
        admissionResult: null,
      });
    }

    const blockingReason = topologyGuardDecision.blockingReason;
    return Object.freeze({
      state,
      admissionResult: Object.freeze({
        allowed: false,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
        blockingReasons: Object.freeze([blockingReason]),
        eligibleNodeIds: Object.freeze([]),
        ineligibleNodes: Object.freeze([]),
        reason: blockingReason,
        topologySnapshot: Object.freeze({
          observedDistinctNodeIds: Object.freeze(observedDistinctNodeIds),
          observedDistinctNodeCount: observedDistinctNodeIds.length,
          observedServiceRowCount: topologyBlockingServiceRows.length,
          targetNodeId,
          targetReplicaCount,
          authoritativeAvailable: authoritativeObservation.available === true,
          authoritativeReasonCode: authoritativeObservation.reasonCode || null,
          authoritativeRetryAfterMs:
            authoritativeObservation.retryAfterMs || null,
        }),
      }),
    });
  }

  /**
   * Fail create-time add-like work closed when the canonical topology snapshot
   * already proves the target node is occupied or the steady-state target is
   * satisfied.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureCreateTopologyGuardAllowed(context) {
    const topologyGuard = await this.buildTopologyGuardSnapshot(context);
    if (topologyGuard.state === TOPOLOGY_GUARD_STATE.ALLOWED) {
      return;
    }
    throw this.createTopologyGuardAdmissionError(
      context?.move || null,
      topologyGuard.admissionResult,
    );
  }

  /**
   * Get in-flight operation rows for an entity.
   * @readModel COORDINATOR_ENTITY_IN_FLIGHT —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching in-flight operations.
   * @private
   */
  getEntityInFlightOperationRows({entityType, entityId}) {
    return this.repository.getEntityInFlightOperationRows({
      entityType,
      entityId,
    });
  }

  /**
   * Read one replica_operations row from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {string} operationId
   * @return {Object|null}
   * @private
   */
  getReplicaOperationRowFromCache(operationId) {
    return this.repository.getReplicaOperationRowFromCache(operationId);
  }

  /**
   * Filter replica_operations rows from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {Function} predicate
   * @return {Object[]|null}
   * @private
   */
  filterReplicaOperationRowsFromCache(predicate) {
    return this.repository.filterReplicaOperationRowsFromCache(predicate);
  }

  /**
   * Return true when one operation can advance from observed replica
   * progress. Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isObservedProgressOperationCandidate(operation) {
    return this.workflowOwner.isObservedProgressOperationCandidate(operation);
  }

  /**
   * Filter candidate operation ids for one observed services row.
   * Delegates to workflow owner (D7.1).
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   * @private
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    return this.workflowOwner.findObservedProgressOperationIds(
      serviceRow,
      cacheOperation,
    );
  }

  /**
   * Reconcile one observed replica-progress event.
   * Delegates to workflow owner (D7.1).
   * @param {string} operationId
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileObservedProgressOperation(operationId) {
    return this.workflowOwner.reconcileObservedProgressOperation(operationId);
  }

  /**
   * Observe cache progress and re-enter the owner lane.
   * Delegates to workflow owner (D7.1).
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   * @return {void}
   * @private
   */
  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    return this.workflowOwner.handleObservedReplicaStateChange(
      tableName,
      cacheOperation,
      record,
    );
  }

  /**
   * Resolve in-flight replica IDs for an entity from authoritative SQL.
   * Single read-model path — no cache fallback.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID compatibility key.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} In-flight replica IDs.
   * @private
   */
  async getEntityInFlightReplicaIds({partitionId, entityType, entityId}) {
    return this.repository.getEntityInFlightReplicaIds({
      partitionId,
      entityType,
      entityId,
    });
  }

  /**
   * Allocate canonical replica ID for ADD/REPLACE create phase.
   * Canonical format mirrors bootstrap replicas: `${entityId}-rN`.
   * @param {Object} params - Allocation parameters.
   * @param {string} params.partitionId - Partition ID.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @param {Array<string>} [params.excludeReplicaIds] - IDs that cannot be
   *   selected (e.g., REPLACE source replica during create phase).
   * @return {Promise<string>} Allocated canonical replica ID.
   * @private
   */
  async allocateCanonicalReplicaId({
    partitionId,
    entityType,
    entityId,
    excludeReplicaIds = [],
  }) {
    const usedReplicaIds = new Set();
    const serviceRows = this.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    const authoritativeServiceRows =
      await this.getAuthoritativeEntityServiceRows({
        partitionId,
        entityType,
        entityId,
      });
    const inFlightReplicaIds = await this.getEntityInFlightReplicaIds({
      partitionId,
      entityType,
      entityId,
    });

    for (const row of serviceRows) {
      const replicaId = row?.service_id || row?.replica_id;
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    for (const row of authoritativeServiceRows) {
      const replicaId = row?.service_id || row?.replica_id;
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    for (const replicaId of inFlightReplicaIds) {
      usedReplicaIds.add(replicaId);
    }

    for (const replicaId of excludeReplicaIds) {
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    const canonicalPrefix = `${entityId}${REPLICA_ID_SEPARATOR}`;
    let highestObservedReplicaIndex = REPLICA_ID_START_INDEX - NUM.ONE;
    for (const replicaId of usedReplicaIds) {
      const replicaIndex = extractCanonicalReplicaIndex(
        replicaId,
        canonicalPrefix,
      );
      if (
        Number.isInteger(replicaIndex) &&
        replicaIndex > highestObservedReplicaIndex
      ) {
        highestObservedReplicaIndex = replicaIndex;
      }
    }

    const candidateIndex = highestObservedReplicaIndex + NUM.ONE;
    return `${canonicalPrefix}${candidateIndex}`;
  }

  /**
   * Normalize one move type to canonical upper-case enum representation.
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (typeof moveType !== 'string') {
      return null;
    }
    const normalized = moveType.toUpperCase();
    if (normalized.length === NUM.ZERO) {
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
    if (!cachedOperation || this.isOperationTerminal(cachedOperation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }

    const cachedOperationId = cachedOperation.operationId;
    if (
      typeof cachedOperationId !== 'string' ||
      cachedOperationId.length === NUM.ZERO
    ) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }

    let cacheVisibleOperation = null;
    try {
      cacheVisibleOperation = await this.queryOperationById(cachedOperationId);
    } catch (error) {
      this.logger.debug(
        'Failed to refresh recent operation intent from cache-visible state',
        {
          operationId: cachedOperationId,
          dedupeKey,
          error: error?.message || String(error),
        },
      );
    }
    if (
      cacheVisibleOperation &&
      this.isOperationTerminal(cacheVisibleOperation)
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
        if (this.isOperationTerminal(authoritativeEntityVisibility.operation)) {
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
    if (this.isOperationTerminal(authoritativeOperation)) {
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
      partitionId.length === NUM.ZERO ||
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
    if (entityId.length === NUM.ZERO) {
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
      observation.operations.length === NUM.ZERO
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
    if (!operation || this.isOperationTerminal(operation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return;
    }
    this.recentOperationIntents.set(dedupeKey, {
      operation,
      expiresAt: Date.now() + this.getRecentOperationIntentTtlMs(operation),
    });
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
      if (typeof key !== 'string' || key.length === NUM.ZERO) {
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
    const workflowStep = String(
      operation?.workflowStep || operation?.workflow_step || '',
    ).trim();
    if (
      !operation ||
      this.isOperationTerminal(operation) ||
      workflowStep !== WORKFLOW_STEP.PENDING
    ) {
      return operation;
    }
    await this.armCoordinatorCreatedOperationProgress(operation);
    return operation;
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
    if (operationId.length === NUM.ZERO) {
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
      this.config.pendingTimeoutMs > NUM.ZERO ?
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
      partitionId.length > NUM.ZERO &&
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
    const updatedAt = Number(operation?.updatedAt);
    const createdAt = Number(operation?.createdAt);
    const startedAt =
      Number.isFinite(updatedAt) && updatedAt > NUM.ZERO ?
        updatedAt :
        createdAt;
    if (!Number.isFinite(startedAt) || startedAt <= NUM.ZERO) {
      return NUM.ZERO;
    }
    return Math.max(NUM.ZERO, Date.now() - startedAt);
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
    if (!Number.isFinite(reuseBudgetMs) || reuseBudgetMs <= NUM.ZERO) {
      return false;
    }

    return this.getOperationAgeMs(operation) < reuseBudgetMs;
  }

  /**
   * Prune expired recent operation intents.
   * @private
   */
  pruneExpiredOperationIntents() {
    const now = Date.now();
    for (const [key, entry] of this.recentOperationIntents.entries()) {
      if (!entry || entry.expiresAt <= now) {
        this.recentOperationIntents.delete(key);
      }
    }
  }

  /**
   * Build one operation single-flight key for shared workflow coordination.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string} Single-flight owner key.
   * @private
   */
  buildOperationSingleFlightKey(scope, key) {
    return this.workflowOwner.buildOperationSingleFlightKey(scope, key);
  }

  /**
   * Build create-operation single-flight key.
   * @param {string} dedupeKey - Move-intent dedupe key.
   * @return {string}
   * @private
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    return this.workflowOwner.getCreateOperationSingleFlightKey(dedupeKey);
  }

  /**
   * Build the shared single-flight key for concurrent create-budget checks.
   * @param {string} scope
   * @return {string}
   * @private
   */
  getCreateBudgetSingleFlightKey(scope) {
    return this.workflowOwner.getCreateBudgetSingleFlightKey(scope);
  }

  /**
   * Build execute-operation single-flight key.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getExecuteOperationSingleFlightKey(operationId) {
    return this.workflowOwner.getExecuteOperationSingleFlightKey(operationId);
  }

  /**
   * Build the shared owner-key single-flight gate for one persisted
   * operation.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getOperationOwnerSingleFlightKey(operationId) {
    return this.workflowOwner.getOperationOwnerSingleFlightKey(operationId);
  }

  /**
   * Claim a PENDING operation for dispatch by transitioning it to
   * SENDING through the coordinator-owned workflow path.
   *
   * This is the single-owner replacement for the direct
   * cdcIntegrationService.updateSystemTableRow call that previously
   * lived in ReplicaDispatchService.claimPendingDispatch.
   *
   * Design reference: §2 — dispatch claim routed through coordinator.
   *
   * @param {string} operationId - The operation to claim.
   * @return {Promise<Object|null>} The claimed operation in SENDING
   *   state, or null if the claim could not be acquired (operation
   *   not found, not PENDING, or not locally owned).
   */
  async claimDispatchTransition(operationId) {
    return this.workflowOwner.claimDispatchTransition(operationId);
  }

  /**
   * Dispatch one operation through the coordinator-owned single-flight lane.
   * This is the canonical owner entry point for PENDING dispatch and any
   * retry of an already-claimed SENDING operation.
   *
   * Accepts either an operation id, a SQL row, or a canonical operation
   * payload. Callers that carry extra in-memory metadata (for example initial
   * bootstrap peer lists) should pass the canonical operation object so that
   * this owner path can preserve it.
   *
   * @param {string|Object} operationInput - Operation id or payload.
   * @return {Promise<Object>} Execution result or typed skip.
   */
  async dispatchOperation(operationInput) {
    return this.workflowOwner.dispatchOperation(operationInput);
  }

  /**
   * Normalize one topology mutation work class for coordinator callers.
   * Background work is deferable; interactive/critical work keeps its current
   * caller-visible behavior.
   *
   * @param {Object} move
   * @return {string}
   * @private
   */
  normalizeControlPlaneMutationWorkClass(move) {
    return this.provisioningAdmissionPolicy.normalizeControlPlaneMutationWorkClass(
      move,
    );
  }

  /**
   * Build an admission result for local control-plane mutation unhealthiness.
   * @param {Object} blocker
   * @return {Object}
   * @private
   */
  buildLocalControlPlaneMutationAdmissionResult(blocker) {
    return this.provisioningAdmissionPolicy.buildLocalControlPlaneMutationAdmissionResult(
      blocker,
    );
  }

  /**
   * Defer optional background topology mutation when the local control-plane
   * mutation contract is not currently healthy.
   * @param {Object} move
   * @return {void}
   * @private
   */
  assertLocalControlPlaneMutationReady(move) {
    return this.provisioningAdmissionPolicy.assertLocalControlPlaneMutationReady(
      move,
    );
  }

  /**
   * Resolve the current published membership epoch, when available.
   * @return {number|null}
   * @private
   */
  getCurrentPublishedMembershipEpoch() {
    if (
      !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService
        .getCurrentPublishedMembershipEpochSync !== 'function'
    ) {
      return null;
    }
    return this.controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync(
      this.nodeId,
      Date.now(),
    );
  }

  /**
   * Reject stale epoch-bound placement requests after membership cutover.
   * @param {Object} move
   * @return {void}
   * @private
   */
}

export {RebalanceCoordinatorSegment2};
