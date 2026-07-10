import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {VOTER_RAFT_ROLES} from '../raft/constants.js';

const {
  OperationType,
  ReplicaStatus,
  REPLICA_ID_SEPARATOR,
  REPLICA_ID_START_INDEX,
  SERVICE_TYPE,
  STORAGE_ADMISSION_DECISION_TYPE,
  TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
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
const RETIRED_REPLACE_SOURCE_OPERATION_STATUSES = new Set([
  ReplicaStatus.REMOVED,
]);
const RETIRED_REPLACE_SOURCE_WORKFLOW_STEPS = new Set([
  WORKFLOW_STEP.REMOVED,
]);
const REPLACE_SOURCE_RETIREMENT_SAFETY_STATE = Object.freeze({
  NOT_REPLACE: 'not_replace',
  SOURCE_UNAVAILABLE: 'source_unavailable',
  ENTITY_UNAVAILABLE: 'entity_unavailable',
  SOURCE_ACTIVE: 'source_active',
  SOURCE_RETIRED: 'source_retired',
});
const REPLACE_SOURCE_RETIREMENT_SAFETY_ERROR_BY_STATE = Object.freeze({
  [REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_RETIRED]:
    'replace source replica already retired by completed operation',
});
const TOPOLOGY_GUARD_ALLOWED_DECISION = Object.freeze({
  state: TOPOLOGY_GUARD_STATE.ALLOWED,
});

function extractCanonicalReplicaIndex(replicaId, canonicalPrefix) {
  if (typeof replicaId !== LOCAL_STR_STRING || replicaId.length === 0) {
    return null;
  }
  if (
    typeof canonicalPrefix !== LOCAL_STR_STRING ||
    canonicalPrefix.length === 0 ||
    !replicaId.startsWith(canonicalPrefix)
  ) {
    return null;
  }

  const rawIndex = replicaId.slice(canonicalPrefix.length);
  if (rawIndex.length === 0) {
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

class RebalanceCoordinatorTopologyGuardMethods {
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

  /**
   * An ORPHANED occupancy: a row that reached status=active but is NOT an
   * authoritative raft voter and has NO live in-flight ADD-like operation
   * bringing it toward voter membership. This is the phantom a lost
   * promotion-to-voter write-back leaves behind (its REPLACE completed, the
   * source drained, yet raft_role never advanced) — it occupies a node in
   * placement but can never contribute a quorum vote or complete a spread.
   *
   * Such a row must NOT count toward the TARGET_REPLICA_COUNT_SATISFIED census,
   * otherwise it blocks the very spread ADD that would mint a real replacement
   * voter (the interlock, which counts raft voters, correctly sees the group
   * under-replicated and concentrated — a self-referential formation deadlock).
   *
   * Conservative by construction: a row still catching up
   * (status pending/creating/syncing) OR one with a live in-flight ADD-like op
   * is NOT an orphan (it is a legitimate in-flight voter-to-be and still counts,
   * so a redundant fourth ADD is not admitted). Only a status=active,
   * non-voter, no-in-flight-op row is dropped. Durable over-creation is
   * independently capped planner-side by the raft_role voter count.
   * @param {Object} row
   * @param {Set<string>} liveAddTargetNodeIds distinct target nodes of live
   *   in-flight ADD-like operations for this entity
   * @return {boolean}
   */
  isTopologyGuardOrphanedServiceRow(row, liveAddTargetNodeIds) {
    const normalizedRaftRole = String(row?.raft_role || '')
      .trim()
      .toLowerCase();
    if (VOTER_RAFT_ROLES.has(normalizedRaftRole)) {
      return false;
    }
    const normalizedStatus = String(
      row?.status ?? TOPOLOGY_GUARD_DEFAULT_SERVICE_STATUS,
    ).toLowerCase();
    if (normalizedStatus !== ReplicaStatus.ACTIVE) {
      return false;
    }
    const nodeId = String(row?.node_id || row?.nodeId || '').trim();
    return !liveAddTargetNodeIds.has(nodeId);
  }

  /**
   * Distinct target nodes of the entity's live (non-terminal) ADD-like
   * operations — the nodes that are actively being brought toward a voter.
   * @param {Object} options
   * @return {Set<string>}
   */
  resolveTopologyGuardLiveAddTargetNodeIds({entityType, entityId}) {
    const liveOperationRows =
      this.getEntityInFlightOperationRows({entityType, entityId}) || [];
    const targetNodeIds = new Set();
    for (const operation of liveOperationRows) {
      const targetNodeId =
        this.resolveTopologyGuardAddTargetNodeId(operation);
      if (targetNodeId !== null) {
        targetNodeIds.add(targetNodeId);
      }
    }
    return targetNodeIds;
  }

  /**
   * The target node of one live ADD-like operation row, or null when the
   * operation is not ADD-like (or names no target node).
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveTopologyGuardAddTargetNodeId(operation) {
    const row = operation || {};
    const normalizedType = this.normalizeMoveType(
      row.type || row.operation_type || row.operationType,
    );
    if (!TOPOLOGY_INCREASING_CREATE_OPERATION_TYPES.has(normalizedType)) {
      return null;
    }
    const targetNodeId = String(
      row.target_node_id || row.targetNodeId || row.node_id || row.nodeId ||
        '',
    ).trim();
    return targetNodeId.length > 0 ? targetNodeId : null;
  }

  async resolveTopologyGuardTargetReplicaCount({partitionId, entityType}) {
    if (entityType !== SERVICE_TYPE.PARTITION) {
      return null;
    }
    let policy = null;
    try {
      if (
        this.tablePolicyService &&
        typeof this.tablePolicyService.getPolicyForPartition === LOCAL_STR_FUNCTION
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
      rawTargetReplicaCount > 0
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
      targetNodeId.length === 0
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
    // Full occupancy set — one row per node, ANY non-removed status/role. Backs
    // the TARGET_NODE_OCCUPIED check (one-node-per-replica), which must stay
    // status-inclusive so an orphaned row still forbids double-placing its node.
    const observedDistinctNodeIds = [
      ...new Set(
        topologyBlockingServiceRows
          .map((row) => String(row?.node_id || row?.nodeId || '').trim())
          .filter((nodeId) => nodeId.length > 0),
      ),
    ];
    // Count-census set — excludes orphaned rows (status=active, non-voter, no
    // live in-flight ADD-like op). A dropped orphan lets the spread ADD that
    // would mint a real replacement voter through; catching-up learners and
    // in-flight targets still count, so over-creation is not admitted. Backs the
    // TARGET_REPLICA_COUNT_SATISFIED check only.
    const liveAddTargetNodeIds = this.resolveTopologyGuardLiveAddTargetNodeIds({
      entityType,
      entityId,
    });
    const countedDistinctNodeIds = [
      ...new Set(
        topologyBlockingServiceRows
          .filter(
            (row) =>
              !this.isTopologyGuardOrphanedServiceRow(
                row,
                liveAddTargetNodeIds,
              ),
          )
          .map((row) => String(row?.node_id || row?.nodeId || '').trim())
          .filter((nodeId) => nodeId.length > 0),
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
          countedDistinctNodeIds.length >= targetReplicaCount,
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
   * Resolve every replica ID already allocated by prior entity operations.
   * Completed replacement targets can remain visible to runtime membership
   * and publication convergence after they stop being in-flight, so replica ID
   * allocation must be monotonic across operation history, not just current
   * service rows and in-flight rows.
   * @param {Object} params - Lookup parameters.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} Operation-owned replica IDs.
   * @private
   */
  async getEntityAllocatedOperationReplicaIds({entityType, entityId}) {
    const replicaIds = new Set();
    const authoritativeOperations =
      typeof this.repository?.getOperationsByEntityAuthoritative ===
      LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntityAuthoritative(
          entityType,
          entityId,
        ) :
        [];
    const cacheVisibleOperations =
      typeof this.repository?.getOperationsByEntity === LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntity(entityType, entityId) :
        [];
    const operationSets = [
      authoritativeOperations,
      cacheVisibleOperations,
    ];
    for (const operations of operationSets) {
      if (!Array.isArray(operations)) {
        continue;
      }
      for (const operation of operations) {
        this.addAllocatedOperationReplicaIds(replicaIds, operation);
      }
    }
    return replicaIds;
  }

  /**
   * @param {Set<string>} replicaIds
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  addAllocatedOperationReplicaIds(replicaIds, operation) {
    if (!operation) {
      return;
    }
    const operationReplicaId = operation.replicaId;
    if (
      typeof operationReplicaId === LOCAL_STR_STRING &&
      operationReplicaId.length > 0
    ) {
      replicaIds.add(operationReplicaId);
    }
    const sourceReplicaId =
      typeof this.getReplaceSourceReplicaId === LOCAL_STR_FUNCTION ?
        this.getReplaceSourceReplicaId(operation) :
        operation.sourceReplicaId;
    if (
      typeof sourceReplicaId === LOCAL_STR_STRING &&
      sourceReplicaId.length > 0
    ) {
      replicaIds.add(sourceReplicaId);
    }
  }

  /**
   * Completed REPLACE source replicas are retired even if stale service rows
   * remain cache-visible. This authoritative evidence prevents a later
   * replacement from reusing an already-retired source and creating a surplus
   * target replica.
   * @param {Object} params - Lookup parameters.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} Retired source replica IDs.
   * @private
   */
  async getEntityRetiredReplaceSourceReplicaIds({entityType, entityId}) {
    const retiredSourceReplicaIds = new Set();
    const authoritativeOperations =
      typeof this.repository?.getOperationsByEntityAuthoritative ===
      LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntityAuthoritative(
          entityType,
          entityId,
        ) :
        [];
    const cacheVisibleOperations =
      typeof this.repository?.getOperationsByEntity === LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntity(entityType, entityId) :
        [];
    const operationSets = [
      authoritativeOperations,
      cacheVisibleOperations,
    ];
    for (const operations of operationSets) {
      if (!Array.isArray(operations)) {
        continue;
      }
      for (const operation of operations) {
        this.addRetiredReplaceSourceReplicaId(
          retiredSourceReplicaIds,
          operation,
        );
      }
    }
    return retiredSourceReplicaIds;
  }

  /**
   * @param {Set<string>} retiredSourceReplicaIds
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  addRetiredReplaceSourceReplicaId(retiredSourceReplicaIds, operation) {
    if (!this.isRetiredReplaceSourceOperation(operation)) {
      return;
    }
    const sourceReplicaId =
      typeof this.getReplaceSourceReplicaId === LOCAL_STR_FUNCTION ?
        this.getReplaceSourceReplicaId(operation) :
        operation.sourceReplicaId;
    if (
      typeof sourceReplicaId === LOCAL_STR_STRING &&
      sourceReplicaId.length > 0
    ) {
      retiredSourceReplicaIds.add(sourceReplicaId);
    }
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  isRetiredReplaceSourceOperation(operation) {
    if (!operation) {
      return false;
    }
    const operationType = this.normalizeMoveType(
      operation.type || operation.operation_type || operation.operationType,
    );
    const workflowStep =
      operation.workflowStep ?? operation.workflow_step ?? null;
    return (
      operationType === OperationType.REPLACE &&
      (
        RETIRED_REPLACE_SOURCE_OPERATION_STATUSES.has(operation.status) ||
        RETIRED_REPLACE_SOURCE_WORKFLOW_STEPS.has(workflowStep)
      )
    );
  }

  /**
   * @param {Object|null} move
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildReplaceSourceRetirementEvidence(move, context = {}) {
    return {
      moveType: this.normalizeMoveType(move?.type),
      sourceReplicaId:
        typeof move?.replicaId === LOCAL_STR_STRING ?
          move.replicaId.trim() :
          '',
      entityType:
        context.entityType || move?.entityType || SERVICE_TYPE.PARTITION,
      entityId:
        context.entityId || move?.entityId || move?.partitionId ||
        '',
    };
  }

  /**
   * @param {Object} evidence
   * @param {Set<string>} retiredSourceReplicaIds
   * @return {string}
   * @private
   */
  resolveReplaceSourceRetirementSafetyState(
    evidence,
    retiredSourceReplicaIds,
  ) {
    if (evidence.moveType !== OperationType.REPLACE) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.NOT_REPLACE;
    }
    if (evidence.sourceReplicaId.length === 0) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_UNAVAILABLE;
    }
    if (
      typeof evidence.entityId !== LOCAL_STR_STRING ||
      evidence.entityId.length === 0
    ) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.ENTITY_UNAVAILABLE;
    }
    if (retiredSourceReplicaIds.has(evidence.sourceReplicaId)) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_RETIRED;
    }
    return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_ACTIVE;
  }

  /**
   * Return a safety error when a REPLACE move targets a source replica already
   * retired by a completed replacement operation.
   * @param {Object|null} move
   * @param {Object} context
   * @return {Promise<string|null>}
   * @private
   */
  async getRetiredReplaceSourceMoveSafetyError(move, context = {}) {
    const evidence = this.buildReplaceSourceRetirementEvidence(move, context);
    const shouldReadRetirementEvidence =
      evidence.moveType === OperationType.REPLACE &&
      evidence.sourceReplicaId.length > 0 &&
      typeof evidence.entityId === LOCAL_STR_STRING &&
      evidence.entityId.length > 0;
    const retiredSourceReplicaIds = shouldReadRetirementEvidence ?
      await this.getEntityRetiredReplaceSourceReplicaIds({
        entityType: evidence.entityType,
        entityId: evidence.entityId,
      }) :
      new Set();
    const safetyState = this.resolveReplaceSourceRetirementSafetyState(
      evidence,
      retiredSourceReplicaIds,
    );
    return REPLACE_SOURCE_RETIREMENT_SAFETY_ERROR_BY_STATE[safetyState] ||
      null;
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
    const allocatedOperationReplicaIds =
      await this.getEntityAllocatedOperationReplicaIds({
        entityType,
        entityId,
      });

    for (const row of serviceRows) {
      const replicaId = row?.service_id || row?.replica_id;
      if (typeof replicaId === LOCAL_STR_STRING && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    for (const row of authoritativeServiceRows) {
      const replicaId = row?.service_id || row?.replica_id;
      if (typeof replicaId === LOCAL_STR_STRING && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    for (const replicaId of inFlightReplicaIds) {
      usedReplicaIds.add(replicaId);
    }

    for (const replicaId of allocatedOperationReplicaIds) {
      usedReplicaIds.add(replicaId);
    }

    for (const replicaId of excludeReplicaIds) {
      if (typeof replicaId === LOCAL_STR_STRING && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    const canonicalPrefix = `${entityId}${REPLICA_ID_SEPARATOR}`;
    let highestObservedReplicaIndex = REPLICA_ID_START_INDEX - 1;
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

    const candidateIndex = highestObservedReplicaIndex + 1;
    return `${canonicalPrefix}${candidateIndex}`;
  }
}

function applyRebalanceCoordinatorTopologyGuardMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorTopologyGuardMethods.prototype;
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

export {applyRebalanceCoordinatorTopologyGuardMethods};
