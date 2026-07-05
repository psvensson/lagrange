import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

const {
  CONTROL_PLANE_QUERY_OPTIONS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAME,
  UNIFIED_SERVICE_TYPE,
  getControlPlaneRetryAfterMs,
  readAuthoritativeControlPlaneRows,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorOperationReadMethods {
  /**
   * Query an operation by ID using SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   * @private
   */
  async queryOperationById(operationId) {
    return this.repository.queryOperationById(operationId);
  }

  /**
   * Resolve one operation's visibility from the authoritative owner path,
   * BYPASSING the cache-first read. Unlike queryOperationById (cache-first, so
   * it returns a leadership-handoff-frozen ghost verbatim), this issues the
   * strict owner-RPC read so a bookkeeping-lag ghost resolves to its true
   * terminal state.
   * @param {string} operationId
   * @param {Object} [options]
   * @return {Promise<{operation: (Object|null), deferredOutcome: (Object|null)}>}
   * @private
   */
  async queryAuthoritativeOperationVisibilityObservation(operationId, options = {}) {
    return this.repository.queryAuthoritativeOperationVisibilityObservation(
      operationId,
      options,
    );
  }

  /**
   * Query incomplete operations using SQL engine.
   * @readModel COORDINATOR_TIMEOUT_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   * @param {Object} [options={}]
   * @param {string} [options.visibilityReadMode]
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   * @private
   */
  async queryIncompleteOperations(options = {}) {
    const visibilityReadMode =
      this.resolveIncompleteOperationVisibilityReadMode(options);
    if (
      visibilityReadMode !==
        REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED &&
      this.shouldPauseAdmissionReadForLocalRouterPressure(options)
    ) {
      return this.queryCachedIncompleteOperations();
    }
    return this.repository.queryIncompleteOperations({
      visibilityReadMode,
    });
  }

  /**
   * Normalize coordinator-facing incomplete-operation visibility reads to one
   * named repository contract.
   *
   * Boolean adapters stay local here so hot rebalancer callers can move
   * incrementally without reopening the repository boolean bag.
   *
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  resolveIncompleteOperationVisibilityReadMode(options = {}) {
    if (
      options?.visibilityReadMode ===
      REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
    ) {
      return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY;
    }
    if (
      options?.visibilityReadMode ===
      REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED
    ) {
      return REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED;
    }
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK;
  }

  /**
   * Query only the cache-visible incomplete operations.
   * This keeps cache-bound observation semantics explicit instead of exposing
   * cache-empty fallback tuning on the general repository API.
   *
   * @return {Promise<Array<Object>>}
   * @private
   */
  async queryCachedIncompleteOperations() {
    if (
      typeof this.repository?.queryCachedIncompleteOperations ===
        LOCAL_STR_FUNCTION
    ) {
      return this.repository.queryCachedIncompleteOperations();
    }
    return this.repository.queryIncompleteOperations({
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY,
    });
  }

  /**
   * Observe in-flight operations during shutdown from the cache boundary only.
   * Shutdown diagnostics must not reopen authoritative owner reads or retry
   * loops while the coordinator is tearing down.
   *
   * @return {Promise<Array<Object>>}
   * @private
   */
  async queryShutdownIncompleteOperations() {
    return this.queryCachedIncompleteOperations();
  }

  /**
   * Resolve the canonical incomplete-operation observation state from the
   * repository owner. Empty and deferred observations must stay distinct so
   * admission logic does not collapse a pressured owner read into true zero.
   *
   * @param {Array<Object>} [operations=[]]
   * @return {Object}
   * @private
   */
  getIncompleteOperationObservation(operations = []) {
    if (
      typeof this.repository?.resolveIncompleteOperationObservation ===
      LOCAL_STR_FUNCTION
    ) {
      return this.repository.resolveIncompleteOperationObservation(operations);
    }
    const operationCount = Array.isArray(operations) ? operations.length : 0;
    return Object.freeze({
      state:
        operationCount > 0 ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      operationCount,
      deferredOutcome: null,
      retryAfterMs: null,
    });
  }

  /**
   * Resolve one canonical entity-scoped authoritative operation observation.
   * Callers must not collapse deferred owner visibility into true zero.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Object>}
   * @private
   */
  async getEntityAuthoritativeOperationObservation(entityType, entityId) {
    const hasCustomObservationMethod =
      typeof this.repository?.getOperationsByEntityAuthoritativeObservation ===
        LOCAL_STR_FUNCTION &&
      this.repository.getOperationsByEntityAuthoritativeObservation !==
        ReplicaOperationRepository.prototype
          .getOperationsByEntityAuthoritativeObservation;
    if (hasCustomObservationMethod) {
      return this.repository.getOperationsByEntityAuthoritativeObservation(
        entityType,
        entityId,
      );
    }
    const hasCustomReadMethod =
      typeof this.repository?.getOperationsByEntityAuthoritative ===
        LOCAL_STR_FUNCTION &&
      this.repository.getOperationsByEntityAuthoritative !==
        ReplicaOperationRepository.prototype.getOperationsByEntityAuthoritative;
    const operations = hasCustomReadMethod ?
      await this.repository.getOperationsByEntityAuthoritative(
        entityType,
        entityId,
      ) :
      typeof this.repository
        ?.getOperationsByEntityAuthoritativeObservation ===
        LOCAL_STR_FUNCTION ?
        (
          await this.repository.getOperationsByEntityAuthoritativeObservation(
            entityType,
            entityId,
          )
        )?.operations :
        await this.repository.getOperationsByEntityAuthoritative(
          entityType,
          entityId,
        );
    const operationCount = Array.isArray(operations) ? operations.length : 0;
    return Object.freeze({
      state:
        operationCount > 0 ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      operationCount,
      operations: Array.isArray(operations) ? operations : [],
      deferredOutcome: null,
      retryAfterMs: null,
    });
  }

  /**
   * @param {Object|null} observation
   * @return {void}
   * @private
   */
  reconcileIncompleteOperationEmptyQueryDelay(observation = null) {
    if (observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY) {
      this.markEmptyIncompleteOperationQueryAt();
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();
  }

  /**
   * @param {Object|null} observation
   * @return {boolean}
   * @private
   */
  shouldBlockOperationAdmissionOnIncompleteOperationObservation(
    observation = null,
  ) {
    return (
      observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    );
  }

  /**
   * Check for existing in-flight operation for entity/node combination.
   * Prevents duplicate operations (deduplication).
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {string} partitionId - Partition ID compatibility key.
   * @param {string} targetNodeId - Target node ID.
   * @param {string} entityType - Entity type (partition/message_group).
   * @param {string} entityId - Entity ID.
   * @return {Promise<Object|null>} Existing operation or null.
   * @private
   */
  async queryExistingInFlightOperation(
    partitionId,
    targetNodeId,
    entityType,
    entityId,
    move,
    options = {},
  ) {
    return this.repository.queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      move,
      this.operationMatchesMoveIntent.bind(this),
      options,
    );
  }

  /**
   * Convert database row to Operation object.
   * @param {Object} row - Database row.
   * @return {Object} Operation object.
   * @private
   */
  rowToOperation(row) {
    return this.repository.rowToOperation(row);
  }

  /**
   * Determine whether an operation has reached its terminal workflow step.
   * Falls back to status when workflow data is incomplete.
   * @param {Object} operation - Operation row or payload.
   * @return {boolean} True when terminal.
   * @private
   */
  isOperationTerminal(operation) {
    return this.repository.isOperationTerminal(operation);
  }

  /**
   * Resolve the canonical owner node for one operation lifecycle.
   * Source node owns operation progression. Older rows may use to
   * target node ownership when source is unavailable.
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveOperationOwnerNodeId(operation) {
    return this.repository.resolveOperationOwnerNodeId(operation);
  }

  /**
   * Return true when this coordinator owns operation lifecycle progression.
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationLocallyOwned(operation) {
    return this.repository.isOperationLocallyOwned(operation);
  }

  /**
   * Resolve source replica ID for REPLACE operations.
   * @param {Object} operation - Operation payload.
   * @return {string|null} Source replica ID or null.
   * @private
   */
  getReplaceSourceReplicaId(operation) {
    return this.repository.getReplaceSourceReplicaId(operation);
  }

  /**
   * Check whether a REPLACE operation is in source-removal phase.
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE should remove the source replica.
   * @private
   */
  isReplaceRemovePhase(operation) {
    return this.repository.isReplaceRemovePhase(operation);
  }

  /**
   * Check whether a REPLACE operation is dispatching/reconciling source
   * removal (ACTIVE/STOPPING).
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE is in source-removal dispatch phase.
   * @private
   */
  isReplaceRemoveDispatchPhase(operation) {
    return this.repository.isReplaceRemoveDispatchPhase(operation);
  }

  /**
   * Resolve target replica ID for REPLACE operations.
   * @param {Object} operation - Operation record.
   * @return {string|null} Target replacement replica ID.
   * @private
   */
  getReplaceTargetReplicaId(operation) {
    return this.repository.getReplaceTargetReplicaId(operation);
  }

  /**
   * Get service rows for an entity.
   * @readModel COORDINATOR_ENTITY_SERVICES —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching services rows.
   * @private
   */
  getEntityServiceRows({partitionId, entityType, entityId}) {
    return this.repository.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
  }

  /**
   * Read entity service rows from the authoritative services owner path.
   * Falls back to an empty list when the authoritative read is unavailable.
   * @readModel COORDINATOR_ENTITY_SERVICES_AUTHORITATIVE —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeEntityServiceRows({
    partitionId,
    entityType,
    entityId,
  }) {
    const observation = await this.getAuthoritativeEntityServiceRowsObservation(
      {
        partitionId,
        entityType,
        entityId,
      },
    );
    return observation.rows;
  }

  /**
   * Read entity service rows from the authoritative services owner path and
   * preserve whether the read succeeded so create-time topology guards can
   * distinguish "no rows" from "no authoritative answer".
   * @param {Object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Object>}
   * @private
   */
  async getAuthoritativeEntityServiceRowsObservation({
    partitionId,
    entityType,
    entityId,
  }) {
    let sql = SQL.SELECT_PARTITION_SERVICES_BY_ENTITY;
    let params = [
      entityType || SERVICE_TYPE.PARTITION,
      partitionId || entityId,
    ];

    if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
      sql = SQL.SELECT_MESSAGE_GROUP_SERVICES_BY_ENTITY;
      params = [entityType, entityId];
    } else if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
      sql = SQL.SELECT_RUNTIME_SERVICES_BY_ENTITY;
      params = [entityType, entityId];
    }

    const result = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.SERVICES,
      sql,
      params,
      CONTROL_PLANE_QUERY_OPTIONS,
    );
    return Object.freeze({
      available: result.success === true && Array.isArray(result.rows),
      rows:
        result.success === true && Array.isArray(result.rows) ?
          result.rows :
          [],
      error: result?.error || null,
      reasonCode: result?.reasonCode || null,
      retryAfterMs: getControlPlaneRetryAfterMs(result),
    });
  }

  /**
   * Merge cache-visible and authoritative entity service rows into one node
   * occupancy snapshot so create-time invariants are adjudicated once.
   * @param {Array<Object>} cacheServiceRows
   * @param {Array<Object>} authoritativeServiceRows
   * @return {Array<Object>}
   * @private
   */
  mergeEntityServiceRows(cacheServiceRows = [], authoritativeServiceRows = []) {
    const mergedRowsByTopologyKey = new Map();
    const allRows = [
      ...(Array.isArray(cacheServiceRows) ? cacheServiceRows : []),
      ...(Array.isArray(authoritativeServiceRows) ?
        authoritativeServiceRows :
        []),
    ];
    for (const row of allRows) {
      if (!row || typeof row !== LOCAL_STR_OBJECT) {
        continue;
      }
      const serviceId = String(
        row.service_id ||
          row.serviceId ||
          row.replica_id ||
          row.replicaId ||
          '',
      ).trim();
      const partitionKey = String(
        row.partition_id || row.partitionId || '',
      ).trim();
      const nodeId = String(row.node_id || row.nodeId || '').trim();
      const topologyKey =
        serviceId.length > 0 ?
          serviceId :
          [partitionKey, nodeId].join(':');
      if (topologyKey.length === 0) {
        continue;
      }
      mergedRowsByTopologyKey.set(topologyKey, row);
    }
    return [...mergedRowsByTopologyKey.values()];
  }
}

function applyRebalanceCoordinatorOperationReadMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorOperationReadMethods.prototype;
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

export {applyRebalanceCoordinatorOperationReadMethods};
