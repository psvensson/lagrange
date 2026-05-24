import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchServiceSegment3} from './replica-dispatch-service-segment-3.js';
import {MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS} from '../node/message-group-service-handler-constants.js';
import {REPLICA_HANDLER_ADDRESS} from '../node/replica-handler-constants.js';
import {RUNTIME_SERVICE_HANDLER_ADDRESS} from '../node/runtime-service-handler-constants.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/index.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  ControlPlaneField,
  ControlPlaneReadinessService,
  DISPATCH_ERROR_MSG,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_READINESS_ERROR_REASON,
  DISPATCH_READINESS_MESSAGE,
  DISPATCH_READINESS_REASON,
  DISPATCH_SUBSYSTEM,
  NUM,
  OPERATION_METADATA_KEY,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  ReplicaOperationField,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isSystemTablePartition,
  isRetryableControlPlaneError,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
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
const DISPATCH_RETRY_READY_NODE_DIMENSIONS = Object.freeze([
  CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
]);


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
      workflowStep: payload.workflowStep || null,
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
      typeof this.messageRouter.isRegistered === TYPEOF.FUNCTION &&
      this.messageRouter.isRegistered(localHandlerAddress)
    ) {
      return true;
    }

    const serviceRows =
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION ?
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
      typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION
    ) {
      const result = await this.nodesOwner.getNodeFromCache(nodeId);
      return unwrapRowReadResult(result) || {};
    }
    return (
      this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.NODES, nodeId) || {}
    );
  }

  /**
   * Read one authoritative node row directly from the control-plane gateway.
   * This lets restart recovery distinguish a genuinely missing node row from a
   * transiently unavailable authoritative path.
   * @param {string} nodeId
   * @return {Promise<Object>}
   * @private
   */
  async getAuthoritativeNodeRow(nodeId) {
    const gateway = this.getControlPlaneSystemTableGateway();
    let result = null;

    if (typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION) {
      result = await gateway.readAuthoritativeRows(
        SYSTEM_TABLE_NAME.NODES,
        REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK,
        [nodeId],
        {owner: DISPATCH_SUBSYSTEM},
      );
    } else if (typeof gateway.executeRead === TYPEOF.FUNCTION) {
      result = await gateway.executeRead(
        {
          tableName: SYSTEM_TABLE_NAME.NODES,
          sql: REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK,
          params: [nodeId],
          strategy: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE,
        },
        {
          owner: DISPATCH_SUBSYSTEM,
        },
      );
    } else if (typeof gateway.readRows === TYPEOF.FUNCTION) {
      result = await gateway.readRows(
        SYSTEM_TABLE_NAME.NODES,
        REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK,
        [nodeId],
        {owner: DISPATCH_SUBSYSTEM},
      );
    }

    if (result?.success === false) {
      return {
        success: false,
        error:
          result.error ||
          DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        deferRetry:
          result.deferRetry === true ||
          result.error ===
            DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        retryAfterMs: Number.isFinite(result.retryAfterMs) ?
          result.retryAfterMs :
          this.nodeStateUpdateRetryAfterMs,
      };
    }

    const rows = Array.isArray(result?.rows) ?
      result.rows :
      Array.isArray(result) ?
        result :
        [];
    const row = rows[0] || null;
    return {
      success: true,
      row,
    };
  }

  /**
   * Classify a zero-row NODE_STATE_UPDATE write miss.
   * Previously known nodes may be temporarily invisible while authoritative
   * control-plane recovery is still converging, so misses remain retryable
   * through the owner queue when authoritative visibility lags.
   * @param {string} nodeId
   * @param {Object} existing
   * @return {Promise<Error>}
   * @private
   */
  async resolveMissingNodeRowUpdateError(nodeId, existing) {
    const error = this.buildMissingNodeRowError(nodeId);
    if (!existing || !existing[COLUMN.NODE_ID]) {
      return error;
    }

    try {
      const authoritativeNodeRow = await this.getAuthoritativeNodeRow(nodeId);
      if (authoritativeNodeRow?.success === true) {
        if (authoritativeNodeRow.row?.[COLUMN.NODE_ID]) {
          this.applyRetryableNodeRowUpdateError(
            error,
            DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_NODE_ROW_VISIBILITY_LAG,
            this.nodeStateUpdateRetryAfterMs,
          );
        }
        return error;
      }

      if (authoritativeNodeRow?.deferRetry === true) {
        this.applyRetryableNodeRowUpdateError(
          error,
          authoritativeNodeRow.error ||
            DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
          authoritativeNodeRow.retryAfterMs,
        );
      }
      return error;
    } catch (readError) {
      const readMessage = readError?.message || String(readError);
      if (
        readError?.deferRetry === true ||
        (typeof this.cdcIntegrationService?.isTransientCdcError ===
          TYPEOF.FUNCTION &&
          this.cdcIntegrationService.isTransientCdcError(readMessage)) ||
        readMessage.includes(
          DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        )
      ) {
        this.applyRetryableNodeRowUpdateError(
          error,
          readError?.code ||
            DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
          Number.isFinite(readError?.retryAfterMs) ?
            readError.retryAfterMs :
            this.nodeStateUpdateRetryAfterMs,
        );
      }
      return error;
    }
  }

  /**
   * Apply one retryable node-row update classification.
   * @param {Error} error
   * @param {string} reasonCode
   * @param {number|null|undefined} retryAfterMs
   * @return {Error}
   * @private
   */
  applyRetryableNodeRowUpdateError(error, reasonCode, retryAfterMs) {
    error.deferRetry = true;
    error.retryAfterMs = retryAfterMs;
    error.reasonCode = reasonCode;
    return error;
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
   * Read one authoritative replica_operations row directly from the control-
   * plane gateway. Dispatch retries use this to recover when owner-local cache
   * visibility lags behind the persisted operation row.
   * @param {string} operationId
   * @return {Promise<Object|null>}
   * @private
   */
  async getAuthoritativeReplicaOperationRow(operationId) {
    const authoritativeOperationQuery =
      this.rebalanceCoordinator?.repository &&
      typeof this.rebalanceCoordinator.repository
        .queryAuthoritativeOperationById === TYPEOF.FUNCTION ?
        this.rebalanceCoordinator.repository.queryAuthoritativeOperationById.bind(
          this.rebalanceCoordinator.repository,
        ) :
        null;
    if (authoritativeOperationQuery) {
      const authoritativeOperation = await authoritativeOperationQuery(
        operationId,
        {
          requireOwnerRpcRead: false,
        },
      );
      if (authoritativeOperation) {
        return this.buildOperationRowFromCoordinator(authoritativeOperation);
      }
      return null;
    }

    const gateway = this.controlPlaneSystemTableGateway;
    if (!operationId || !gateway || typeof gateway !== TYPEOF.OBJECT) {
      return null;
    }

    let result = null;
    if (typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION) {
      result = await gateway.readAuthoritativeRows(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK,
        [operationId],
        {owner: DISPATCH_SUBSYSTEM},
      );
    } else if (typeof gateway.executeRead === TYPEOF.FUNCTION) {
      result = await gateway.executeRead(
        {
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          sql: REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK,
          params: [operationId],
          strategy: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE,
        },
        {
          owner: DISPATCH_SUBSYSTEM,
        },
      );
    } else if (typeof gateway.readRows === TYPEOF.FUNCTION) {
      result = await gateway.readRows(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK,
        [operationId],
        {owner: DISPATCH_SUBSYSTEM},
      );
    }

    if (result?.success === false) {
      return null;
    }

    const rows = Array.isArray(result?.rows) ?
      result.rows :
      Array.isArray(result) ?
        result :
        [];
    return rows[REPLICA_DISPATCH_SERVICE_LITERAL.ZERO] || null;
  }

  /**
   * Resolve the best available owner-path operation visibility for direct
   * dispatch retries. Prefer the canonical repository visibility observation
   * when available so deferred retries inherit the same fallback row and
   * retry metadata the rebalancer owner already uses.
   *
   * @param {string} operationId
   * @return {Promise<Object>}
   * @private
   */
  async getDispatchRetryOperationVisibilityObservation(operationId) {
    const visibilityObservationQuery =
      this.rebalanceCoordinator?.repository &&
      typeof this.rebalanceCoordinator.repository
        .getOperationByIdVisibilityObservation === TYPEOF.FUNCTION ?
        this.rebalanceCoordinator.repository.getOperationByIdVisibilityObservation.bind(
          this.rebalanceCoordinator.repository,
        ) :
        null;
    if (visibilityObservationQuery) {
      const observation = await visibilityObservationQuery(operationId, {
        requireOwnerRpcRead: false,
        allowPriorityRecoveryDeferredVisibility: true,
      });
      const operation =
        observation?.operation && typeof observation.operation === TYPEOF.OBJECT ?
          observation.operation :
          null;
      return Object.freeze({
        row: operation ?
          this.buildOperationRowFromCoordinator(operation) :
          null,
        deferredOutcome:
          observation?.deferredOutcome &&
          typeof observation.deferredOutcome === TYPEOF.OBJECT ?
            {...observation.deferredOutcome} :
            null,
      });
    }
    return Object.freeze({
      row: await this.getAuthoritativeReplicaOperationRow(operationId),
      deferredOutcome: null,
    });
  }

  /**
   * Get a replica operation row from cache, with authoritative fallback when
   * the persisted row is still invisible to the local cache.
   * @readModel DISPATCH_OPERATION_LOOKUP — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation row or null.
   * @private
   */
  async getReplicaOperationRow(operationId) {
    if (
      this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.getReplicaOperationFromCache ===
        TYPEOF.FUNCTION
    ) {
      const result =
        await this.replicaOperationsOwner.getReplicaOperationFromCache(
          operationId,
        );
      const cachedRow = unwrapRowReadResult(result);
      if (cachedRow) {
        return cachedRow;
      }
      return this.getAuthoritativeReplicaOperationRow(operationId);
    }
    const cachedRow =
      this.getSystemTableRowFromCache(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        operationId,
      ) || null;
    if (cachedRow) {
      return cachedRow;
    }
    return this.getAuthoritativeReplicaOperationRow(operationId);
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

}

function createReplicaDispatchServiceDispatchObservationMethods() {
  return Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(ReplicaDispatchServiceDispatchObservationMethods.prototype))
      .filter(([name]) => name !== 'constructor'),
  );
}

export {createReplicaDispatchServiceDispatchObservationMethods};
