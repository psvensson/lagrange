import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS} from '../node/message-group-service-handler-constants.js';
import {REPLICA_HANDLER_ADDRESS} from '../node/replica-handler-constants.js';
import {RUNTIME_SERVICE_HANDLER_ADDRESS} from '../node/runtime-service-handler-constants.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/index.js';
import {
  OPERATION_VISIBILITY_STATE,
  buildOperationVisibilityUnavailableError,
  readOperationVisibilityState,
} from '../rebalancer/replica-operation-repository-operation-visibility.js';

const {
  COLUMN,
  DISPATCH_ERROR_MSG,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  unwrapRowReadResult,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const LOCAL_DISPATCH_HANDLER_ADDRESS = Object.freeze({
  [SERVICE_TYPE.PARTITION]: Object.freeze({
    serviceSegment: REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT,
    handlerId: REPLICA_HANDLER_ADDRESS.HANDLER_ID,
  }),
  [SERVICE_TYPE.MESSAGE_GROUP]: Object.freeze({
    serviceSegment: MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT,
    handlerId: MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID,
  }),
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: Object.freeze({
    serviceSegment: RUNTIME_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT,
    handlerId: RUNTIME_SERVICE_HANDLER_ADDRESS.HANDLER_ID,
  }),
});
class ReplicaDispatchServiceDispatchObservationMethods {
  /**
   * Emit one dispatch failure diagnostic and dedupe exact repeats.
   * @param {Object} payload
   * @return {void}
   * @private
   */
  recordDispatchFailure(payload = {}) {
    const operationId = payload.operationId || null;
    if (!operationId) {
      return;
    }

    const signature = JSON.stringify({
      skipped: payload.skipped === true,
      reason: payload.reason || null,
      error: payload.error || null,
      readinessSnapshot: payload.readinessSnapshot || null,
    });
    if (
      this.dispatchFailureSignaturesByOperationId.get(operationId) === signature
    ) {
      return;
    }
    this.dispatchFailureSignaturesByOperationId.set(operationId, signature);

    const eventPayload = {
      operationId,
      targetNodeId: payload.targetNodeId || null,
      workflowStep: payload.workflowStep,
      skipped: payload.skipped === true,
      reason: payload.reason || null,
      error: payload.error || null,
      readinessSnapshot: payload.readinessSnapshot || null,
    };

    this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, {
      nodeId: this.nodeId,
      ...eventPayload,
    });
    this.emit(DISPATCH_EVENT.OPERATION_FAILED, eventPayload);
  }

  /**
   * Check if target node has an active handler for the entity type.
   * @readModel DISPATCH_HANDLER_CHECK — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId - Target node ID.
   * @param {string} entityType - Entity type from the operation.
   * @return {Promise<boolean>} True if a matching active service
   *   exists.
   * @private
   */
  async hasHandlerOnTarget(nodeId, entityType) {
    const localHandlerAddress = this.resolveLocalHandlerCapabilityAddress(
      nodeId,
      entityType,
    );
    if (
      localHandlerAddress &&
      this.messageRouter &&
      typeof this.messageRouter.isRegistered === 'function' &&
      this.messageRouter.isRegistered(localHandlerAddress)
    ) {
      return true;
    }

    const serviceRows =
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesFromCache === 'function' ?
        (await this.servicesOwner.listServicesFromCache()).rows || [] :
        this.getSystemTableRowsFromCache(SYSTEM_TABLE_NAME.SERVICES);
    return serviceRows.some((row) => {
      return (
        row?.[COLUMN.NODE_ID] === nodeId &&
        row?.[COLUMN.SERVICE_TYPE] === entityType &&
        row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE
      );
    });
  }

  /**
   * Resolve the canonical local handler address for same-node dispatch.
   * Join/restart recovery may register the executor with the router before the
   * durable `services` row reaches ACTIVE, so the router registration is the
   * authoritative local capability signal on this bounded path.
   *
   * @param {string} nodeId
   * @param {string} entityType
   * @return {string|null}
   * @private
   */
  resolveLocalHandlerCapabilityAddress(nodeId, entityType) {
    if (!nodeId || nodeId !== this.nodeId) {
      return null;
    }
    const handlerAddress = LOCAL_DISPATCH_HANDLER_ADDRESS[entityType] || null;
    if (!handlerAddress) {
      return null;
    }
    return (
      `${nodeId}/` +
      `${handlerAddress.serviceSegment}/` +
      `${handlerAddress.handlerId}`
    );
  }

  /**
   * Read a node row from SystemTableCache.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Object>} Node row or empty object.
   * @private
   */
  async getNodeRow(nodeId) {
    if (
      this.nodesOwner &&
      typeof this.nodesOwner.getNodeFromCache === 'function'
    ) {
      const result = await this.nodesOwner.getNodeFromCache(nodeId);
      return unwrapRowReadResult(result) || {};
    }
    return (
      this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.NODES, nodeId) || {}
    );
  }

  /**
   * Build one typed missing-node-row error for steady-state updates.
   * @param {string} nodeId
   * @return {Error}
   * @private
   */
  buildMissingNodeRowError(nodeId) {
    const error = new Error(
      `${DISPATCH_ERROR_MSG.NODE_ROW_MISSING}: ${nodeId}`,
    );
    error.code = REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING;
    error.nodeId = nodeId;
    return error;
  }

  /**
   * The one owner read of one replica_operations row for dispatch: the
   * repository's by-id visibility contract (PRESENT / ABSENT / UNAVAILABLE),
   * with the row in the dispatch row shape. UNAVAILABLE never carries a row.
   * @param {string} operationId
   * @param {Object} [options]
   * @param {boolean} [options.allowPriorityRecoveryDeferredVisibility]
   * @return {Promise<Object>} {state, row, deferredOutcome}
   * @private
   */
  async observeAuthoritativeReplicaOperationRow(operationId, options = {}) {
    const observation =
      await this.rebalanceCoordinator.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          allowPriorityRecoveryDeferredVisibility:
            options.allowPriorityRecoveryDeferredVisibility === true,
          allowOwnerPersistedTransitionDeferredVisibility: false,
        },
      );
    const state = readOperationVisibilityState(observation);
    return Object.freeze({
      state,
      row: state === OPERATION_VISIBILITY_STATE.PRESENT ?
        this.buildOperationRowFromCoordinator(observation.operation) :
        null,
      deferredOutcome: observation.deferredOutcome ?
        {...observation.deferredOutcome} :
        null,
    });
  }

  /**
   * The owner-path visibility of one operation for a direct dispatch retry:
   * the typed observation, so an unanswered read defers the retry on its
   * own retry semantics instead of reading as "no row".
   * @param {string} operationId
   * @return {Promise<Object>} {state, row, deferredOutcome}
   * @private
   */
  async getDispatchRetryOperationVisibilityObservation(operationId) {
    return this.observeAuthoritativeReplicaOperationRow(operationId, {
      allowPriorityRecoveryDeferredVisibility: true,
    });
  }

  /**
   * Get a replica operation row from cache; on a cache miss, the owner's
   * answer (readOwnerReplicaOperationRowOnCacheMiss).
   * @readModel DISPATCH_OPERATION_LOOKUP — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation row or null.
   * @private
   */
  async getReplicaOperationRow(operationId) {
    if (
      this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.getReplicaOperationFromCache ===
        'function'
    ) {
      const result =
        await this.replicaOperationsOwner.getReplicaOperationFromCache(
          operationId,
        );
      const cachedRow = unwrapRowReadResult(result);
      if (cachedRow) {
        return cachedRow;
      }
      return this.readOwnerReplicaOperationRowOnCacheMiss(operationId);
    }
    const cachedRow =
      this.getSystemTableRowFromCache(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        operationId,
      ) || null;
    if (cachedRow) {
      return cachedRow;
    }
    return this.readOwnerReplicaOperationRowOnCacheMiss(operationId);
  }

  /**
   * The owner's row on a cache miss: the row when PRESENT, null when the
   * owner confirmed it ABSENT. An unanswered read is never null (absence is
   * not inferred from it): the dispatch holds on the named visibility-lag
   * retry, which re-reads the row when it fires, and the pass ends with the
   * typed unavailability.
   * @param {string} operationId
   * @return {Promise<Object|null>}
   * @private
   */
  async readOwnerReplicaOperationRowOnCacheMiss(operationId) {
    const observation =
      await this.observeAuthoritativeReplicaOperationRow(operationId);
    if (observation.state === OPERATION_VISIBILITY_STATE.UNAVAILABLE) {
      this.deferOperationDispatchRetry(
        operationId,
        this.buildReplicaOperationVisibilityLagError(
          operationId, observation.deferredOutcome),
        null,
        {[REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]: true},
      );
      throw buildOperationVisibilityUnavailableError(observation, operationId);
    }
    return observation.row;
  }

  /**
   * Read one row from SystemTableCache if key access is available.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key.
   * @return {Object|null} Cached row or null.
   * @private
   */
  getSystemTableRowFromCache(tableName, key) {
    return this.systemTableCache.get(tableName, key) || null;
  }

  /**
   * Read all rows from SystemTableCache if table scans are available.
   * @param {string} tableName - System table name.
   * @return {Array<Object>|null} Cached rows or null when unavailable.
   * @private
   */
  getSystemTableRowsFromCache(tableName) {
    const rows = this.systemTableCache.getAll(tableName);
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Read all rows through injected metadata owners when available, falling back
   * to direct cache scans only when this dispatch service owns no row reader.
   * @param {string} tableName - System table name.
   * @return {Promise<Array<Object>>} Cached rows.
   * @private
   */
  async getOwnerBackedSystemTableRowsFromCache(tableName) {
    if (
      tableName === SYSTEM_TABLE_NAME.NODES &&
      this.nodesOwner &&
      typeof this.nodesOwner.listNodesFromCache === 'function'
    ) {
      const result = await this.nodesOwner.listNodesFromCache();
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
      this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.listReplicaOperationsFromCache ===
        'function'
    ) {
      const result =
        await this.replicaOperationsOwner.listReplicaOperationsFromCache();
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      tableName === SYSTEM_TABLE_NAME.SERVICES &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesFromCache === 'function'
    ) {
      const result = await this.servicesOwner.listServicesFromCache();
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      (
        tableName === SYSTEM_TABLE_NAME.NODES &&
        this.nodesOwner
      ) ||
      (
        tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        this.replicaOperationsOwner
      ) ||
      (
        tableName === SYSTEM_TABLE_NAME.SERVICES &&
        this.servicesOwner
      )
    ) {
      return [];
    }
    return this.getSystemTableRowsFromCache(tableName);
  }
}

function createReplicaDispatchServiceDispatchObservationMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        ReplicaDispatchServiceDispatchObservationMethods.prototype,
      ),
    )
      .filter(([name]) => name !== 'constructor'),
  );
}

export {createReplicaDispatchServiceDispatchObservationMethods};
