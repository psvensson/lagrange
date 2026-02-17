/**
 * ReplicaDispatchService - Replica operation dispatch and message
 * forwarding. Extracted from ControlPlaneService.
 * Requirements: 8.5, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {REBALANCE_COORDINATOR_EVENT} from '../rebalancer/rebalancer-constants.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  ControlPlaneMessageType,
  ControlPlaneField,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  DEFAULT_READY_LEASE_MS,
  CONTROL_PLANE_EVENT,
} from './control-plane-constants.js';
import {
  DISPATCH_ERROR_MSG,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
} from './replica-dispatch-service-constants.js';

const SQL_SELECT_PENDING_REPLICA_OPS_FOR_NODE =
  'SELECT * FROM replica_operations WHERE target_node_id = ?' +
  ' AND workflow_step = ?';

class ReplicaDispatchService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.messageRouter - MessageRouter instance.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.rebalanceCoordinator - Rebalance coordinator.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;

    this.messageGroupServices = new Set();
    this.messageGroupHandlers = new Map();
    this.dispatchInFlight = new Set();
    this.retryInFlightNodes = new Set();
    this.cacheChangeListener = null;
    this.coordinatorOperationCreatedListener = null;
    this.state = DISPATCH_STATE.CREATED;
    const config = ConfigurationManager.getInstance();
    this.readyLeaseMs =
      config.get(CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS) ||
      DEFAULT_READY_LEASE_MS;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(DISPATCH_SUBSYSTEM) : console;
  }

  /**
   * Initialize the dispatch service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    assertCritical(this.nodeId, DISPATCH_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(this.messageRouter, DISPATCH_ERROR_MSG.MISSING_ROUTER);
    assertCritical(
      this.systemTableCache, DISPATCH_ERROR_MSG.MISSING_CACHE,
    );
    assertCritical(
      this.cdcIntegrationService, DISPATCH_ERROR_MSG.MISSING_CDC,
    );
    assertCritical(
      this.rebalanceCoordinator, DISPATCH_ERROR_MSG.MISSING_COORDINATOR,
    );

    this.state = DISPATCH_STATE.INITIALIZED;
    this.logger.info(DISPATCH_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
    });

    if (this.systemTableCache &&
        typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION) {
      this.cacheChangeListener = (tableName, _operation, record) => {
        this.handleCacheNodeChange(tableName, record);
      };
      this.systemTableCache.onCacheChange(this.cacheChangeListener);
    }

    if (this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.on === TYPEOF.FUNCTION) {
      this.coordinatorOperationCreatedListener = (event = {}) => {
        this.handleCoordinatorOperationCreated(event.operation)
          .catch((error) => {
            this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, {
              operationId: event?.operation?.operationId,
              error: error.message,
              source: 'coordinator.event',
            });
          });
      };
      this.rebalanceCoordinator.on(
        REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED,
        this.coordinatorOperationCreatedListener,
      );
    }
  }

  /**
   * Attach a message group service for dispatch handling.
   * @param {Object} messageGroupService - MessageGroupService instance.
   */
  attachMessageGroupService(messageGroupService) {
    if (this.messageGroupServices.has(messageGroupService)) {
      return;
    }

    const onMessageReceived = (event) => {
      this.handleMessageReceived(messageGroupService, event)
        .catch((error) => {
          this.logger.error(DISPATCH_LOG_MSG.MESSAGE_HANDLING_FAILED, {
            error: error.message,
            groupId: messageGroupService.groupId,
          });
        });
    };

    const onCdcApplied = (event) => {
      this.handleCdcApplied(messageGroupService, event)
        .catch((error) => {
          this.logger.error(DISPATCH_LOG_MSG.CDC_HANDLING_FAILED, {
            error: error.message,
            groupId: messageGroupService.groupId,
          });
        });
    };

    messageGroupService.on(
      CONTROL_PLANE_EVENT.MESSAGE_RECEIVED, onMessageReceived,
    );
    messageGroupService.on(
      CONTROL_PLANE_EVENT.CDC_APPLIED, onCdcApplied,
    );

    this.messageGroupServices.add(messageGroupService);
    this.messageGroupHandlers.set(
      messageGroupService, {onMessageReceived, onCdcApplied},
    );
  }

  /**
   * Handle incoming messages from the message group.
   * @param {Object} mgService - Message group service.
   * @param {Object} event - Message received event.
   * @private
   */
  async handleMessageReceived(mgService, event) {
    const payload = event?.payload;
    const messageId = event?.messageId;

    if (!payload || !this.isControlMessage(payload)) {
      return;
    }

    // NODE_STATE_UPDATE is idempotent — process on any replica
    if (payload.type === ControlPlaneMessageType.NODE_STATE_UPDATE) {
      await this.handleNodeStateUpdate(payload);
      if (messageId &&
          typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION) {
        await mgService.acknowledgeMessage(messageId);
      }
      return;
    }

    if (!mgService.isLeaderReplica()) {
      await this.forwardToLeader(mgService, payload);
      return;
    }

    if (payload.type ===
        ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH) {
      await this.handleReplicaOperationDispatch(payload);
    }

    if (messageId &&
        typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION) {
      await mgService.acknowledgeMessage(messageId);
    }
  }

  /**
   * Handle CDC events for replica operation dispatch.
   * @param {Object} mgService - Message group service.
   * @param {Object} event - CDC event.
   * @private
   */
  async handleCdcApplied(mgService, event) {
    if (event?.tableName === SystemTableName.NODES) {
      const nodeRow = event?.data;
      const nodeId =
        nodeRow?.[COLUMN.NODE_ID] ||
        nodeRow?.node_id ||
        nodeRow?.id ||
        null;

      if (nodeId && this.isNodeReady(nodeId)) {
        await this.retryPendingDispatchesForNode(nodeId);
      }
      return;
    }

    if (event?.tableName !== SystemTableName.REPLICA_OPERATIONS) {
      return;
    }

    const row = event?.data;
    if (!row || !row.operation_id) {
      return;
    }

    this.buildOperationFromRow(row);

    if (row.type === OperationType.REPLACE &&
        row.workflow_step === WORKFLOW_STEP.ACTIVE) {
      if (!mgService.isLeaderReplica()) {
        return;
      }
      const operation = this.buildOperationFromRow(row);
      await this.rebalanceCoordinator.executeOperation(operation);
      return;
    }

    if (row.workflow_step !== WORKFLOW_STEP.PENDING) {
      return;
    }

    await this.dispatchOperationRow(row);
  }

  /**
   * Handle local coordinator operation-created events.
   * This provides a deterministic dispatch trigger when CDC fan-out is delayed.
   * @param {Object} operation - RebalanceCoordinator operation object.
   * @return {Promise<void>}
   * @private
   */
  async handleCoordinatorOperationCreated(operation) {
    if (!operation || !operation.operationId) {
      return;
    }

    if (operation.workflowStep !== WORKFLOW_STEP.PENDING) {
      return;
    }

    await this.dispatchOperationRow(
      this.buildOperationRowFromCoordinator(operation),
    );
  }

  /**
   * Handle NODE_STATE_UPDATE messages.
   * @param {Object} payload - Node state update payload.
   * @private
   */
  async handleNodeStateUpdate(payload) {
    const nodeId = payload[ControlPlaneField.NODE_ID];
    const state = payload[ControlPlaneField.STATE];

    if (!nodeId || !state) {
      return;
    }

    if (!CONTROL_PLANE_ALLOWED_STATES.includes(state)) {
      return;
    }

    const existing = await this.getNodeRow(nodeId);
    const now = Date.now();
    const heartbeatAt = Number.isFinite(payload[ControlPlaneField.HEARTBEAT_AT]) ?
      payload[ControlPlaneField.HEARTBEAT_AT] :
      now;
    const requestedLeaseExpiry = payload[ControlPlaneField.READY_LEASE_EXPIRES_AT];
    const readyLeaseExpiresAt = state === STATE.READY ?
      (
        Number.isFinite(requestedLeaseExpiry) &&
          requestedLeaseExpiry > heartbeatAt ?
          requestedLeaseExpiry :
          heartbeatAt + this.readyLeaseMs
      ) :
      null;
    const payloadCapabilities = payload[ControlPlaneField.CAPABILITIES];
    const capabilities = Array.isArray(payloadCapabilities) ?
      JSON.stringify(payloadCapabilities) :
      (
        typeof payloadCapabilities === TYPEOF.STRING ?
          payloadCapabilities :
          (existing.capabilities || STRING.EMPTY_JSON_ARRAY)
      );

    const baseRow = {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.NODE_ADDRESS]: payload[ControlPlaneField.NODE_ADDRESS] ||
        existing[COLUMN.NODE_ADDRESS] ||
        STRING.UNKNOWN,
      [COLUMN.CPU_CORES]: existing[COLUMN.CPU_CORES] || NUM.ZERO,
      [COLUMN.MEMORY_MB]: existing[COLUMN.MEMORY_MB] || NUM.ZERO,
      [COLUMN.DISK_GB]: existing[COLUMN.DISK_GB] || NUM.ZERO,
      [COLUMN.CPU_USAGE_PERCENT]: existing[COLUMN.CPU_USAGE_PERCENT] || NUM.ZERO,
      [COLUMN.MEMORY_USAGE_PERCENT]: existing[COLUMN.MEMORY_USAGE_PERCENT] ||
        NUM.ZERO,
      [COLUMN.DISK_USAGE_PERCENT]: existing[COLUMN.DISK_USAGE_PERCENT] || NUM.ZERO,
      [COLUMN.STATUS]: existing[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: state,
      [COLUMN.CAPABILITIES]: capabilities,
      [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
      [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      [COLUMN.CREATED_AT]: existing[COLUMN.CREATED_AT] || heartbeatAt,
    };

    await this.cdcIntegrationService.upsertSystemTableRow(
      SystemTableName.NODES,
      baseRow,
    );

    if (state === STATE.READY) {
      await this.retryPendingDispatchesForNode(nodeId);
    }
  }

  /**
   * Handle dispatch requests for replica operations.
   * @param {Object} payload - Dispatch payload.
   * @private
   */
  async handleReplicaOperationDispatch(payload) {
    const operationId = payload[ControlPlaneField.OPERATION_ID];
    if (!operationId) {
      return;
    }

    const row = await this.getReplicaOperationRow(operationId);

    if (!row || row.workflow_step !== WORKFLOW_STEP.PENDING) {
      return;
    }

    await this.dispatchOperationRow(row);
  }

  /**
   * Dispatch an operation record to its target node.
   * @param {Object} row - Replica operation row.
   * @private
   */
  async dispatchOperationRow(row) {
    if (!row || !row.operation_id) {
      return;
    }

    if (!this.rebalanceCoordinator) {
      return;
    }

    if (this.dispatchInFlight.has(row.operation_id)) {
      return;
    }

    const targetNodeId = row.target_node_id;
    if (!this.isNodeReady(targetNodeId)) {
      return;
    }

    const entityType =
      row[COLUMN.ENTITY_TYPE] || SERVICE_TYPE.PARTITION;
    if (row.type !== OperationType.ADD &&
        row.type !== OperationType.REPLACE &&
        !await this.hasHandlerOnTarget(targetNodeId, entityType)) {
      this.logger.warn(DISPATCH_LOG_MSG.NO_HANDLER_ON_TARGET, {
        operationId: row.operation_id,
        targetNodeId,
        entityType,
      });
      return;
    }

    const claimed = await this.claimPendingDispatch(row.operation_id);
    if (!claimed) {
      this.logger.debug(DISPATCH_LOG_MSG.CLAIM_SKIPPED, {
        operationId: row.operation_id,
        nodeId: this.nodeId,
      });
      return;
    }

    row.workflow_step = WORKFLOW_STEP.SENDING;
    row[COLUMN.UPDATED_AT] = Date.now();

    const operation = this.buildOperationFromRow(row);

    this.dispatchInFlight.add(operation.operationId);
    try {
      await this.rebalanceCoordinator.executeOperation(operation);

      this.emit(DISPATCH_EVENT.OPERATION_DISPATCHED, {
        operationId: operation.operationId,
        targetNodeId,
      });
    } finally {
      this.dispatchInFlight.delete(operation.operationId);
    }
  }

  /**
   * Retry pending dispatches for operations targeting a ready node.
   * Uses the same dispatchOperationRow claim path to avoid duplicate ownership.
   * @param {string} nodeId - Ready node ID.
   * @return {Promise<void>}
   * @private
   */
  async retryPendingDispatchesForNode(nodeId) {
    if (!nodeId || this.retryInFlightNodes.has(nodeId)) {
      return;
    }

    this.retryInFlightNodes.add(nodeId);
    try {
      if (!this.sqlQueryEngine ||
          typeof this.sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION) {
        return;
      }

      const result = await this.sqlQueryEngine.executeQuery(
        SQL_SELECT_PENDING_REPLICA_OPS_FOR_NODE,
        [nodeId, WORKFLOW_STEP.PENDING],
      );
      const pendingRows = Array.isArray(result?.rows) ? result.rows : [];
      if (pendingRows.length === NUM.ZERO) {
        return;
      }

      this.logger.info(DISPATCH_LOG_MSG.RETRY_PENDING_READY_NODE, {
        nodeId,
        pendingCount: pendingRows.length,
      });

      for (const row of pendingRows) {
        await this.dispatchOperationRow(row);
      }
    } finally {
      this.retryInFlightNodes.delete(nodeId);
    }
  }

  /**
   * Handle node-table cache updates and retry dispatch when a node becomes ready.
   * @param {string} tableName - Updated table name.
   * @param {Object} record - Updated row.
   * @private
   */
  handleCacheNodeChange(tableName, record) {
    if (tableName !== SystemTableName.NODES) {
      return;
    }
    const nodeId =
      record?.[COLUMN.NODE_ID] ||
      record?.node_id ||
      record?.id ||
      null;
    if (!nodeId || !this.isNodeReady(nodeId)) {
      return;
    }

    this.retryPendingDispatchesForNode(nodeId).catch((error) => {
      this.logger.warn(DISPATCH_LOG_MSG.CDC_HANDLING_FAILED, {
        nodeId,
        error: error.message,
      });
    });
  }

  /**
   * Claim a pending operation for dispatch via atomic conditional update.
   * Only one claimant can transition PENDING -> SENDING.
   * @param {string} operationId - Operation ID.
   * @return {Promise<boolean>} True if claim succeeded.
   * @private
   */
  async claimPendingDispatch(operationId) {
    if (!this.cdcIntegrationService ||
        typeof this.cdcIntegrationService.updateSystemTableRow !==
          TYPEOF.FUNCTION) {
      throw new Error(DISPATCH_ERROR_MSG.MISSING_CDC_UPDATE);
    }

    const claimResult = await this.cdcIntegrationService.updateSystemTableRow(
      SystemTableName.REPLICA_OPERATIONS,
      {
        [COLUMN.OPERATION_ID]: operationId,
        workflow_step: WORKFLOW_STEP.PENDING,
      },
      {
        workflow_step: WORKFLOW_STEP.SENDING,
        [COLUMN.UPDATED_AT]: Date.now(),
      },
    );

    const affectedRows = this.getClaimAffectedRows(claimResult?.partitionResult);
    return affectedRows === NUM.ONE;
  }

  /**
   * Extract affected-row count from CDC update result payload.
   * @param {Object} partitionResult - Partition update result.
   * @return {number} Affected rows count.
   * @private
   */
  getClaimAffectedRows(partitionResult) {
    if (typeof partitionResult?.affectedRows === TYPEOF.NUMBER) {
      return partitionResult.affectedRows;
    }
    if (typeof partitionResult?.changes === TYPEOF.NUMBER) {
      return partitionResult.changes;
    }
    return NUM.ZERO;
  }

  /**
   * Build an Operation object from a replica_operations row.
   * @param {Object} row - Replica operation row.
   * @return {Object} Operation object.
   * @private
   */
  buildOperationFromRow(row) {
    const stepsHistory = row.steps_history ?
      JSON.parse(row.steps_history) : [];
    return {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
      entityType: row[COLUMN.ENTITY_TYPE] || SERVICE_TYPE.PARTITION,
      entityId: row[COLUMN.ENTITY_ID] || row.partition_id,
      replicaId: row.replica_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      status: row.status,
      workflowStep: row.workflow_step,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      stepsHistory,
    };
  }

  /**
   * Convert a coordinator operation object to replica_operations row shape.
   * @param {Object} operation - RebalanceCoordinator operation object.
   * @return {Object} Row-like object compatible with dispatchOperationRow.
   * @private
   */
  buildOperationRowFromCoordinator(operation) {
    let stepsHistory = operation.stepsHistory;
    if (typeof stepsHistory !== TYPEOF.STRING) {
      stepsHistory = Array.isArray(stepsHistory) ?
        JSON.stringify(stepsHistory) :
        STRING.EMPTY_JSON_ARRAY;
    }

    return {
      operation_id: operation.operationId,
      type: operation.type,
      partition_id: operation.partitionId,
      replica_id: operation.replicaId,
      source_node_id: operation.sourceNodeId,
      target_node_id: operation.targetNodeId,
      status: operation.status,
      workflow_step: operation.workflowStep,
      created_at: operation.createdAt,
      updated_at: operation.updatedAt,
      completed_at: operation.completedAt,
      error_message: operation.errorMessage,
      steps_history: stepsHistory,
      [COLUMN.ENTITY_TYPE]: operation.entityType,
      [COLUMN.ENTITY_ID]: operation.entityId,
    };
  }

  /**
   * Check if a node is ready.
   * @param {string} nodeId - Node ID.
   * @return {boolean} True if node is ready.
   * @private
   */
  isNodeReady(nodeId) {
    if (!nodeId || !this.systemTableCache ||
        typeof this.systemTableCache.get !== TYPEOF.FUNCTION) {
      return false;
    }

    const nodeRow = this.systemTableCache.get(SystemTableName.NODES, nodeId);
    return isNodeRecordReady(nodeRow, {
      requireActiveStatus: true,
    });
  }

  /**
   * Check if target node has an active handler for the entity type.
   * @param {string} nodeId - Target node ID.
   * @param {string} entityType - Entity type from the operation.
   * @return {Promise<boolean>} True if a matching active service
   *   exists.
   * @private
   */
  async hasHandlerOnTarget(nodeId, entityType) {
    if (this.sqlQueryEngine) {
      const result = await this.sqlQueryEngine.executeQuery(
        'SELECT service_id FROM services WHERE node_id = ?' +
        ' AND service_type = ? AND status = ?',
        [nodeId, entityType, SERVICE_STATUS.ACTIVE],
      );
      return (result.rows?.length || NUM.ZERO) > NUM.ZERO;
    }
    return false;
  }

  /**
   * Read a node row via SQL engine.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Object>} Node row or empty object.
   * @private
   */
  async getNodeRow(nodeId) {
    if (this.sqlQueryEngine) {
      const result = await this.sqlQueryEngine.executeQuery(
        'SELECT * FROM nodes WHERE node_id = ?', [nodeId],
      );
      return result.rows?.[0] || {};
    }
    return {};
  }

  /**
   * Read a replica operation row via SQL engine.
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation row or null.
   * @private
   */
  async getReplicaOperationRow(operationId) {
    if (this.sqlQueryEngine) {
      const result = await this.sqlQueryEngine.executeQuery(
        'SELECT * FROM replica_operations' +
        ' WHERE operation_id = ?',
        [operationId],
      );
      return result.rows?.[0] || null;
    }
    return null;
  }

  /**
   * Forward control message to the current leader.
   * @param {Object} mgService - Message group service.
   * @param {Object} payload - Control message payload.
   * @private
   */
  async forwardToLeader(mgService, payload) {
    const leaderId = mgService.getLeaderId();
    if (!leaderId) {
      return;
    }

    const forwardedBy = Array.isArray(
      payload[ControlPlaneField.FORWARDED_BY],
    ) ?
      payload[ControlPlaneField.FORWARDED_BY] :
      payload[ControlPlaneField.FORWARDED_BY] ?
        [payload[ControlPlaneField.FORWARDED_BY]] : [];

    if (forwardedBy.includes(this.nodeId)) {
      return;
    }

    const leaderAddress = mgService.buildPeerAddress(leaderId);
    const forwardedPayload = {
      ...payload,
      [ControlPlaneField.FORWARDED_BY]: [
        ...forwardedBy, this.nodeId,
      ],
    };

    await mgService.sendMessage(leaderAddress, forwardedPayload);
  }

  /**
   * Check if a payload is a control-plane message.
   * @param {Object} payload - Message payload.
   * @return {boolean} True if control-plane message.
   * @private
   */
  isControlMessage(payload) {
    return Object.values(ControlPlaneMessageType).includes(payload?.type);
  }

  /**
   * Stop the dispatch service.
   */
  stop() {
    if (this.coordinatorOperationCreatedListener &&
        this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.off === TYPEOF.FUNCTION) {
      this.rebalanceCoordinator.off(
        REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED,
        this.coordinatorOperationCreatedListener,
      );
    }
    this.coordinatorOperationCreatedListener = null;

    if (this.cacheChangeListener &&
        this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION) {
      this.systemTableCache.offCacheChange(this.cacheChangeListener);
    }
    this.cacheChangeListener = null;

    for (const [mgService, handlers] of this.messageGroupHandlers) {
      mgService.off(
        CONTROL_PLANE_EVENT.MESSAGE_RECEIVED,
        handlers.onMessageReceived,
      );
      mgService.off(
        CONTROL_PLANE_EVENT.CDC_APPLIED,
        handlers.onCdcApplied,
      );
    }
    this.messageGroupHandlers.clear();
    this.messageGroupServices.clear();
    this.dispatchInFlight.clear();
    this.retryInFlightNodes.clear();

    this.state = DISPATCH_STATE.STOPPED;
    this.logger.info(DISPATCH_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    return this.state;
  }
}

export {ReplicaDispatchService};
