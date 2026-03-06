/**
 * ReplicaDispatchService - Replica operation dispatch and message
 * forwarding. Extracted from ControlPlaneService.
 * Requirements: 8.5, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from './control-plane-readiness-service.js';
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
  DISPATCH_QUEUE_NAME,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
} from './replica-dispatch-service-constants.js';
import {OwnerKeyReconcileQueue} from
  '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from
  '../workflow/reconcile-queue-constants.js';

class ReplicaDispatchService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.messageRouter - MessageRouter instance.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.rebalanceCoordinator - Rebalance coordinator.
   * @param {Object} [options.storageAccountingService] - Storage accounting owner.
   * @param {Object} [options.cdcGroupPropagationService] - CDC publication owner.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.storageAccountingService =
      options.storageAccountingService ||
      this.rebalanceCoordinator?.storageAccountingService ||
      null;
    this.cdcGroupPropagationService =
      options.cdcGroupPropagationService ||
      this.rebalanceCoordinator?.cdcGroupPropagationService ||
      null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        storageAccountingService: this.storageAccountingService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
      });

    this.messageGroupServices = new Set();
    this.messageGroupHandlers = new Map();
    this.dispatchInFlight = new Set();
    this.retryInFlightNodes = new Set();
    this.nodeReadyRetryWatermarks = new Map();
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

    this.operationDispatchQueue = new OwnerKeyReconcileQueue({
      name: DISPATCH_QUEUE_NAME.OPERATION,
      reconcileFn: (ownerKey, _reasons, context) =>
        this.reconcileOperationDispatch(ownerKey, context),
    });

    this.nodeReadyRetryQueue = new OwnerKeyReconcileQueue({
      name: DISPATCH_QUEUE_NAME.NODE_READY,
      reconcileFn: (ownerKey, _reasons, context) =>
        this.reconcileNodeReadyRetry(ownerKey, context),
    });
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
      typeof this.systemTableCache.get === TYPEOF.FUNCTION,
      DISPATCH_ERROR_MSG.MISSING_CACHE_GET,
    );
    assertCritical(
      typeof this.systemTableCache.getAll === TYPEOF.FUNCTION,
      DISPATCH_ERROR_MSG.MISSING_CACHE_GET_ALL,
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
      this.cacheChangeListener = (tableName, operation, record) => {
        this.handleCacheNodeChange(tableName, operation, record);
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
  async handleCdcApplied(_mgService, event) {
      if (event?.tableName === SYSTEM_TABLE_NAME.NODES) {
        const nodeRow = event?.data;
        const nodeId = this.getNodeIdFromRecord(nodeRow);
        if (nodeId) {
          this.nodeReadyRetryQueue.enqueue(
            nodeId,
            RECONCILE_REASON.NODES_CDC_READY,
            {nodeRow},
          );
        }
        return;
      }

      if (event?.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return;
      }

      const row = event?.data;
      if (!row || !row.operation_id) {
        return;
      }

      if (row.type === OperationType.REPLACE &&
          row.workflow_step === WORKFLOW_STEP.ACTIVE) {
        this.operationDispatchQueue.enqueue(
          row.operation_id,
          RECONCILE_REASON.CDC_REPLACE_ACTIVE,
          {row},
        );
        return;
      }

      if (row.workflow_step !== WORKFLOW_STEP.PENDING) {
        return;
      }

      this.operationDispatchQueue.enqueue(
        row.operation_id,
        RECONCILE_REASON.CDC_OPERATION_PENDING,
        {row},
      );
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

      this.operationDispatchQueue.enqueue(
        operation.operationId,
        RECONCILE_REASON.COORDINATOR_OPERATION_CREATED,
        {row: this.buildOperationRowFromCoordinator(operation)},
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
    const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
    const nodeRow = payloadNodeRow &&
      typeof payloadNodeRow === TYPEOF.OBJECT ?
      payloadNodeRow :
      null;

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
        nodeRow?.[COLUMN.NODE_ADDRESS] ||
        existing[COLUMN.NODE_ADDRESS] ||
        STRING.UNKNOWN,
      [COLUMN.CPU_CORES]: Number.isFinite(nodeRow?.[COLUMN.CPU_CORES]) ?
        nodeRow[COLUMN.CPU_CORES] :
        (existing[COLUMN.CPU_CORES] || NUM.ZERO),
      [COLUMN.MEMORY_MB]: Number.isFinite(nodeRow?.[COLUMN.MEMORY_MB]) ?
        nodeRow[COLUMN.MEMORY_MB] :
        (existing[COLUMN.MEMORY_MB] || NUM.ZERO),
      [COLUMN.DISK_GB]: Number.isFinite(nodeRow?.[COLUMN.DISK_GB]) ?
        nodeRow[COLUMN.DISK_GB] :
        (existing[COLUMN.DISK_GB] || NUM.ZERO),
      [COLUMN.CPU_USAGE_PERCENT]:
        Number.isFinite(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]) ?
          nodeRow[COLUMN.CPU_USAGE_PERCENT] :
          (existing[COLUMN.CPU_USAGE_PERCENT] || NUM.ZERO),
      [COLUMN.MEMORY_USAGE_PERCENT]:
        Number.isFinite(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]) ?
          nodeRow[COLUMN.MEMORY_USAGE_PERCENT] :
          (existing[COLUMN.MEMORY_USAGE_PERCENT] || NUM.ZERO),
      [COLUMN.DISK_USAGE_PERCENT]:
        Number.isFinite(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]) ?
          nodeRow[COLUMN.DISK_USAGE_PERCENT] :
          (existing[COLUMN.DISK_USAGE_PERCENT] || NUM.ZERO),
      [COLUMN.STATUS]:
        typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
          nodeRow[COLUMN.STATUS].length > NUM.ZERO ?
          nodeRow[COLUMN.STATUS] :
          (existing[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE),
      [COLUMN.CONNECTION_STATE]: state,
      [COLUMN.CAPABILITIES]: capabilities,
      [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
      [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      [COLUMN.CREATED_AT]:
        Number.isFinite(nodeRow?.[COLUMN.CREATED_AT]) ?
          nodeRow[COLUMN.CREATED_AT] :
          (existing[COLUMN.CREATED_AT] || heartbeatAt),
    };

    await this.cdcIntegrationService.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      baseRow,
    );

    if (state === STATE.READY) {
      this.nodeReadyRetryQueue.enqueue(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_READY,
        {nodeRow: baseRow},
      );
      return;
    }

    this.clearNodeReadyRetryWatermark(nodeId);
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

      this.operationDispatchQueue.enqueue(
        operationId,
        RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST,
      );
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
    const dispatchReadiness = this.captureDispatchReadiness(
      targetNodeId,
    );
    if (!dispatchReadiness.ready) {
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
        readinessSnapshot: dispatchReadiness.snapshot,
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
      const pendingRows = await this.getPendingReplicaOpsForNode(nodeId);
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
   * Read pending replica_operations for one target node.
   * Uses SystemTableCache as the single source of truth.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Array<Object>>} Pending operation rows.
   * @private
   */
  async getPendingReplicaOpsForNode(nodeId) {
    const cacheRows = this.getSystemTableRowsFromCache(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    );
    return cacheRows.filter((row) => {
      return row?.target_node_id === nodeId &&
        row?.workflow_step === WORKFLOW_STEP.PENDING;
    });
  }

  /**
   * Retry pending dispatches for a ready node while deduping duplicate
   * triggers for the same heartbeat row.
   * @param {Object} options - Retry trigger details.
   * @param {string} options.nodeId - Target node ID.
   * @param {Object} [options.nodeRow] - Candidate nodes row.
   * @param {string} [options.source] - Trigger source for diagnostics.
   * @return {Promise<boolean>} True when retry path was executed.
   * @private
   */
  async retryPendingDispatchesForReadyNode(options = {}) {
    const nodeId = options.nodeId;
    if (!nodeId || !this.isNodeReady(nodeId)) {
      this.clearNodeReadyRetryWatermark(nodeId);
      return false;
    }

    const nodeRow = options.nodeRow &&
      typeof options.nodeRow === TYPEOF.OBJECT ?
      options.nodeRow :
      this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.NODES, nodeId);
    if (nodeRow &&
        !wasNodeRecordReadyWhenWritten(nodeRow, {
          requireActiveStatus: true,
        })) {
      return false;
    }

    if (!this.shouldRetryNodeReadyWatermark(nodeId, nodeRow)) {
      this.logger.debug(DISPATCH_LOG_MSG.RETRY_READY_TRIGGER_SKIPPED, {
        nodeId,
        source: options.source || null,
        reason: 'duplicate_ready_trigger',
      });
      return false;
    }

    await this.retryPendingDispatchesForNode(nodeId);
    return true;
  }

  /**
   * Reconcile callback for the operation dispatch queue.
   * Resolves the operation row and dispatches or executes it.
   * @param {string} operationId - The operation to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @private
   */
  async reconcileOperationDispatch(operationId, context) {
    if (!this.rebalanceCoordinator) {
      return;
    }

    let row = context?.row || null;

    if (!row) {
      row = await this.getReplicaOperationRow(operationId);
    }

    if (!row || !row.operation_id) {
      return;
    }

    if (row.type === OperationType.REPLACE &&
        row.workflow_step === WORKFLOW_STEP.ACTIVE) {
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
   * Reconcile callback for the node-ready retry queue.
   * Checks readiness and retries pending dispatches for the node.
   * @param {string} nodeId - The node to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @private
   */
  async reconcileNodeReadyRetry(nodeId, context) {
    const nodeRow = context?.nodeRow || null;
    await this.retryPendingDispatchesForReadyNode({
      nodeId,
      nodeRow,
    });
  }

  /**
   * Handle cache updates and retry dispatch when key rows become available.
   * @param {string} tableName - Updated table name.
   * @param {string|Object} operationOrRecord - Operation or updated row.
   * @param {Object} [recordInput] - Updated row.
   * @private
   */
  handleCacheNodeChange(tableName, operationOrRecord, recordInput) {
      const record = recordInput || operationOrRecord;
      if (!record) {
        return;
      }

      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        const nodeId = this.getNodeIdFromRecord(record);
        if (!nodeId) {
          return;
        }
        this.nodeReadyRetryQueue.enqueue(
          nodeId,
          RECONCILE_REASON.NODES_CACHE_READY,
          {nodeRow: record},
        );
        return;
      }

      if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
        return;
      }

      const nodeId = this.getNodeIdFromRecord(record);
      const status =
        record?.[COLUMN.STATUS] || record?.status || null;
      if (!nodeId ||
          status !== SERVICE_STATUS.ACTIVE ||
          !this.isNodeReady(nodeId)) {
        return;
      }

      this.nodeReadyRetryQueue.enqueue(
        nodeId,
        RECONCILE_REASON.SERVICES_CACHE_ACTIVE,
      );
    }

  /**
   * Resolve node id from a system row shape.
   * @param {Object} record - Row object.
   * @return {string|null} Node ID.
   * @private
   */
  getNodeIdFromRecord(record) {
    return record?.[COLUMN.NODE_ID] ||
      record?.node_id ||
      record?.id ||
      null;
  }

  /**
   * Clear cached ready-trigger watermark for one node.
   * @param {string} nodeId - Node ID.
   * @private
   */
  clearNodeReadyRetryWatermark(nodeId) {
    if (!nodeId) {
      return;
    }
    this.nodeReadyRetryWatermarks.delete(nodeId);
  }

  /**
   * Build a comparable watermark for one ready row.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {Object|null} Comparable watermark or null when unavailable.
   * @private
   */
  getNodeReadyRetryWatermark(nodeRow) {
    const heartbeatAt = Number(
      nodeRow?.[COLUMN.LAST_HEARTBEAT] || nodeRow?.last_heartbeat,
    );
    const readyLeaseExpiresAt = Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ||
      nodeRow?.ready_lease_expires_at,
    );
    if (!Number.isFinite(heartbeatAt) ||
        !Number.isFinite(readyLeaseExpiresAt)) {
      return null;
    }
    return {heartbeatAt, readyLeaseExpiresAt};
  }

  /**
   * Compare two ready-row watermarks for monotonic retry progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Next watermark.
   * @return {boolean} True when next watermark is newer.
   * @private
   */
  isNodeReadyRetryWatermarkNewer(previous, next) {
    if (!next) {
      return !previous;
    }
    if (!previous) {
      return true;
    }
    if (next.heartbeatAt > previous.heartbeatAt) {
      return true;
    }
    if (next.heartbeatAt < previous.heartbeatAt) {
      return false;
    }
    return next.readyLeaseExpiresAt > previous.readyLeaseExpiresAt;
  }

  /**
   * Check and record ready-trigger watermark for deduped retry scheduling.
   * @param {string} nodeId - Node ID.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {boolean} True when retry should run for this trigger.
   * @private
   */
  shouldRetryNodeReadyWatermark(nodeId, nodeRow) {
    const next = this.getNodeReadyRetryWatermark(nodeRow);
    const previous = this.nodeReadyRetryWatermarks.get(nodeId) || null;
    if (!this.isNodeReadyRetryWatermarkNewer(previous, next)) {
      return false;
    }
    this.nodeReadyRetryWatermarks.set(nodeId, next);
    return true;
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
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
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
   * @readModel DISPATCH_NODE_READINESS — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId - Node ID.
   * @return {boolean} True if node is ready.
   * @private
   */
  isNodeReady(nodeId) {
    if (!nodeId ||
        typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
          TYPEOF.FUNCTION) {
      return false;
    }

    const readiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(nodeId);
    if (!readiness || !readiness.dimensions) {
      return false;
    }

    return readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
    ] === true &&
      readiness.dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY
      ] === true;
  }

  /**
   * Capture readiness snapshot for a dispatch decision.
   * Returns both the ready/not-ready verdict and the compact
   * snapshot summary for persistence in diagnostics.
   *
   * @param {string} nodeId - Target node ID.
   * @return {{ready: boolean, snapshot: Object|null}}
   * @private
   */
  captureDispatchReadiness(nodeId) {
    const ready = this.isNodeReady(nodeId);
    if (!nodeId ||
        typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
          TYPEOF.FUNCTION) {
      return {ready, snapshot: null};
    }
    const readiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(nodeId);
    const snapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(readiness);
    return {ready, snapshot};
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
    const serviceRows = this.getSystemTableRowsFromCache(SYSTEM_TABLE_NAME.SERVICES);
    return serviceRows.some((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId &&
        row?.[COLUMN.SERVICE_TYPE] === entityType &&
        row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
    });
  }

  /**
   * Read a node row from SystemTableCache.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Object>} Node row or empty object.
   * @private
   */
  async getNodeRow(nodeId) {
    return this.getSystemTableRowFromCache(
      SYSTEM_TABLE_NAME.NODES,
      nodeId,
    ) || {};
  }

  /**
   * Read a replica operation row from SystemTableCache.
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation row or null.
   * @private
   */
  /**
   * Get a replica operation row from cache.
   * @readModel DISPATCH_OPERATION_LOOKUP — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation row or null.
   * @private
   */
  async getReplicaOperationRow(operationId) {
    return this.getSystemTableRowFromCache(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
    ) || null;
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
    this.nodeReadyRetryWatermarks.clear();

    this.operationDispatchQueue.shutdown();
    this.nodeReadyRetryQueue.shutdown();

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
