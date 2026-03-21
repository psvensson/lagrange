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
  compareNodeHeartbeatWatermarks,
  getNodeHeartbeatWatermark,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from './control-plane-readiness-service.js';
import {
  resolveControlPlaneSystemTableGateway,
} from './control-plane-gateway-resolution.js';
import {
  OperationType,
  isCoordinatorOwnedOperationType,
} from '../rebalancer/replica-status.js';
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
  getControlPlaneMessageRequiredTables,
} from './control-plane-constants.js';
import {
  DISPATCH_ERROR_MSG,
  DISPATCH_DEFAULT,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
} from './replica-dispatch-service-constants.js';
import {PRESSURE_WORK_CLASS} from './pressure-governor.js';
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
    this.controlPlaneSystemTableGateway =
      resolveControlPlaneSystemTableGateway({
        controlPlaneSystemTableGateway:
          options.controlPlaneSystemTableGateway || null,
        sourceGateway:
          options.rebalanceCoordinator?.controlPlaneSystemTableGateway || null,
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        sqlQueryEngine: options.sqlQueryEngine || null,
        systemTableCache: options.systemTableCache || null,
        messageRouter: this.messageRouter,
      });
    this.systemTableCache = options.systemTableCache || null;
    this.nodesOwner = options.nodesOwner || null;
    this.servicesOwner = options.servicesOwner || null;
    this.replicaOperationsOwner = options.replicaOperationsOwner || null;
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
        nodesOwner: this.nodesOwner,
        servicesOwner: this.servicesOwner,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      });

    this.messageGroupServices = new Set();
    this.messageGroupHandlers = new Map();
    this.dispatchInFlight = new Set();
    this.retryInFlightNodes = new Set();
    this.nodeStateUpdateWatermarks = new Map();
    this.nodeReadyRetryWatermarks = new Map();
    this.nodeStateUpdateDeferredRetries = new Map();
    this.nodeStateUpdateQueueAssignments = new Map();
    this.nextNodeStateUpdateQueueIndex = NUM.ZERO;
    this.cacheChangeListener = null;
    this.coordinatorOperationCreatedListener = null;
    this.state = DISPATCH_STATE.CREATED;
    this.setTimeoutFn = typeof options.setTimeoutFn === TYPEOF.FUNCTION ?
      options.setTimeoutFn :
      setTimeout;
    this.clearTimeoutFn = typeof options.clearTimeoutFn === TYPEOF.FUNCTION ?
      options.clearTimeoutFn :
      clearTimeout;
    const config = ConfigurationManager.getInstance();
    this.readyLeaseMs =
      config.get(CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS) ||
      DEFAULT_READY_LEASE_MS;
    this.nodeStateUpdateQueryTimeoutMs = Math.max(
      NUM.ONE,
      Math.floor(this.readyLeaseMs / NUM.THREE),
    );
    this.nodeStateUpdateRetryAfterMs =
      this.normalizeNodeStateUpdateRetryAfterMs(
        options.nodeStateUpdateRetryAfterMs,
      );

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(DISPATCH_SUBSYSTEM) : console;

    this.operationDispatchQueue = new OwnerKeyReconcileQueue({
      name: DISPATCH_QUEUE_NAME.OPERATION,
      reconcileFn: (ownerKey, _reasons, context) =>
        this.reconcileOperationDispatch(ownerKey, context),
    });

    this.nodeStateUpdateQueueShardCount =
      this.normalizeNodeStateUpdateQueueShardCount(
        options.nodeStateUpdateQueueShardCount,
      );
    this.nodeStateUpdateQueues = Array.from(
      {length: this.nodeStateUpdateQueueShardCount},
      (_unused, shardIndex) => {
        return new OwnerKeyReconcileQueue({
          name: this.buildNodeStateUpdateQueueName(shardIndex),
          reconcileFn: (ownerKey, _reasons, context) =>
            this.reconcileNodeStateUpdate(ownerKey, context),
        });
      },
    );
    // Keep the first shard exposed for compatibility with existing diagnostics.
    this.nodeStateUpdateQueue = this.nodeStateUpdateQueues[NUM.ZERO];

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

    const requiredTables =
      this.resolveControlPlaneMessageRequiredTables(payload);

    // NODE_STATE_UPDATE is idempotent, but it still produces shared metadata
    // writes. Only process it locally when this replica is already ready to
    // carry that write set through the canonical metadata ingress path.
    if (payload.type === ControlPlaneMessageType.NODE_STATE_UPDATE) {
      const ingressReadiness =
        this.resolveMessageGroupIngressReadiness(
          mgService,
          requiredTables,
        );
      if (ingressReadiness.ready !== true) {
        await this.forwardToLeader(
          mgService,
          payload,
          {requiredTables, ingressReadiness},
        );
        if (messageId &&
            typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION) {
          await mgService.acknowledgeMessage(messageId);
        }
        return;
      }
      this.enqueueNodeStateUpdate(payload);
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

  resolveControlPlaneMessageRequiredTables(payload) {
    return getControlPlaneMessageRequiredTables(payload?.type);
  }

  resolveMessageGroupIngressReadiness(mgService, requiredTables = []) {
    if (!mgService ||
        typeof mgService.getMetadataIngressReadiness !== TYPEOF.FUNCTION) {
      return {
        ready: false,
        reason: 'message-group ingress readiness unavailable',
      };
    }
    return mgService.getMetadataIngressReadiness({requiredTables});
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
      if (!isCoordinatorOwnedOperationType(row.type)) {
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
   * Enqueue one node-state update onto the dedicated owner-key lane.
   * This keeps heartbeat acknowledgements decoupled from the system-table
   * writer under sustained load while still coalescing to the latest
   * watermark per node.
   * @param {Object} payload - Node state update payload.
   * @return {boolean}
   * @private
   */
  enqueueNodeStateUpdate(payload) {
    const nodeId = payload?.[ControlPlaneField.NODE_ID];
    const state = payload?.[ControlPlaneField.STATE];
    if (!nodeId || !state) {
      return false;
    }
    if (!CONTROL_PLANE_ALLOWED_STATES.includes(state)) {
      return false;
    }

    const nextWatermark = this.getNodeStateUpdateWatermark(payload);
    const previousWatermark = this.nodeStateUpdateWatermarks.get(nodeId) || null;
    if (!this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark)) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: 'stale_or_duplicate_enqueue',
      });
      return false;
    }

    if (nextWatermark) {
      this.nodeStateUpdateWatermarks.set(nodeId, nextWatermark);
    }

    if (this.replaceDeferredNodeStateUpdatePayload(nodeId, payload)) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
        nodeId,
        reason: 'deferred_retry_pending',
      });
      return false;
    }

    const nodeStateUpdateQueue =
      this.resolveNodeStateUpdateQueue(nodeId);
    const enqueued = nodeStateUpdateQueue.enqueue(
      nodeId,
      RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      {payload},
    );
    this.logger.debug(DISPATCH_LOG_MSG.ENQUEUE_NODE_STATE_UPDATE, {
      nodeId,
      enqueued,
    });
    return enqueued;
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
    const payloadWatermark = this.getNodeStateUpdateWatermark(payload);
    const now = Date.now();
    const existingConnectionState = String(
      existing?.[COLUMN.CONNECTION_STATE] || '',
    ).toLowerCase();
    const existingReadyLeaseExpiresAt = Number(
      existing?.[COLUMN.READY_LEASE_EXPIRES_AT],
    );
    const requestedHeartbeatAt = Number(payload[ControlPlaneField.HEARTBEAT_AT]);
    // Apply-time liveness timestamp prevents delayed messages from
    // immediately writing an already-stale heartbeat.
    const heartbeatAt = Number.isFinite(requestedHeartbeatAt) ?
      Math.max(requestedHeartbeatAt, now) :
      now;
    const requestedLeaseExpiry = payload[ControlPlaneField.READY_LEASE_EXPIRES_AT];
    const promotedToReadyFromConnected = state === STATE.CONNECTED &&
      existingConnectionState === STATE.READY &&
      Number.isFinite(existingReadyLeaseExpiresAt) &&
      existingReadyLeaseExpiresAt > now;
    const nextState = promotedToReadyFromConnected ?
      STATE.READY :
      state;
    const readyLeaseExpiresAt = nextState === STATE.READY ?
      (
        Number.isFinite(requestedLeaseExpiry) &&
          requestedLeaseExpiry > heartbeatAt ?
          requestedLeaseExpiry :
          heartbeatAt + this.readyLeaseMs
      ) :
      null;
    const existingWatermark = getNodeHeartbeatWatermark(existing);
    const effectiveReadyWatermark = {
      lastHeartbeat: heartbeatAt,
      readyLeaseExpiresAt,
      connectionState: nextState,
    };
    const staleCheckWatermark = state === STATE.READY ?
      effectiveReadyWatermark :
      payloadWatermark;
    if (!this.isNodeStateUpdateWatermarkNewer(
      existingWatermark,
      staleCheckWatermark,
    )) {
      if (state === STATE.READY &&
          wasNodeRecordReadyWhenWritten(existing, {
            requireActiveStatus: true,
          })) {
        this.nodeReadyRetryQueue.enqueue(
          nodeId,
          RECONCILE_REASON.NODE_STATE_UPDATE_READY,
          {nodeRow: existing},
        );
      }
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: 'stale_against_existing_row',
      });
      return;
    }
    const payloadCapabilities = payload[ControlPlaneField.CAPABILITIES];
    const capabilities = Array.isArray(payloadCapabilities) ?
      JSON.stringify(payloadCapabilities) :
      (
        typeof payloadCapabilities === TYPEOF.STRING ?
          payloadCapabilities :
          (existing.capabilities || STRING.EMPTY_JSON_ARRAY)
      );
    const persistedBudgetFields =
      this.resolveNodeStateUpdateBudgetFields(nodeRow);

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
      [COLUMN.CONNECTION_STATE]: nextState,
      [COLUMN.CAPABILITIES]: capabilities,
      [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
      [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      ...persistedBudgetFields,
    };

    const updateResult =
      await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {[COLUMN.NODE_ID]: nodeId},
      baseRow,
      this.buildNodeStateUpdateWriteOptions(nodeId, nextState),
    );
    const updateAffectedRows = Number(
      updateResult?.partitionResult?.affectedRows,
    );
    if (updateAffectedRows === NUM.ZERO) {
      throw this.buildMissingNodeRowError(nodeId);
    }

    if (nextState === STATE.READY) {
      this.nodeReadyRetryQueue.enqueue(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_READY,
        {
          nodeRow: {
            ...existing,
            [COLUMN.NODE_ID]: nodeId,
            ...baseRow,
          },
        },
      );
      return;
    }

    this.clearNodeReadyRetryWatermark(nodeId);
  }

  /**
   * Extract durable startup-owned storage-budget fields from one node-state
   * payload. Heartbeat-only NODE_STATE_UPDATE messages omit these fields, so
   * this preserves budget ownership without letting routine heartbeats clear it.
   * @param {Object|null} nodeRow
   * @return {Object}
   * @private
   */
  resolveNodeStateUpdateBudgetFields(nodeRow) {
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return {};
    }

    const budgetFields = {};
    const storageBudgetBytes = Number(nodeRow?.[COLUMN.STORAGE_BUDGET_BYTES]);
    if (Number.isFinite(storageBudgetBytes) && storageBudgetBytes > NUM.ZERO) {
      budgetFields[COLUMN.STORAGE_BUDGET_BYTES] =
        Math.floor(storageBudgetBytes);
    }

    const storageBudgetSource = nodeRow?.[COLUMN.STORAGE_BUDGET_SOURCE];
    if (typeof storageBudgetSource === TYPEOF.STRING &&
        storageBudgetSource.length > NUM.ZERO) {
      budgetFields[COLUMN.STORAGE_BUDGET_SOURCE] = storageBudgetSource;
    }

    const storageBudgetUpdatedAt = Number(
      nodeRow?.[COLUMN.STORAGE_BUDGET_UPDATED_AT],
    );
    if (Number.isFinite(storageBudgetUpdatedAt) &&
        storageBudgetUpdatedAt > NUM.ZERO) {
      budgetFields[COLUMN.STORAGE_BUDGET_UPDATED_AT] =
        Math.floor(storageBudgetUpdatedAt);
    }

    return budgetFields;
  }

  /**
   * Resolve the canonical system-table gateway for dispatch writes.
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway =
      resolveControlPlaneSystemTableGateway({
        sourceGateway:
          this.rebalanceCoordinator?.controlPlaneSystemTableGateway || null,
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        sqlQueryEngine: this.sqlQueryEngine || null,
        systemTableCache: this.systemTableCache,
        messageRouter: this.messageRouter || null,
      });
    assertCritical(
      this.controlPlaneSystemTableGateway,
      'ReplicaDispatchService requires controlPlaneSystemTableGateway',
    );
    return this.controlPlaneSystemTableGateway;
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
    if (!isCoordinatorOwnedOperationType(row.type)) {
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

    const operationId = row.operation_id;
    this.dispatchInFlight.add(operationId);
    try {
      let dispatchResult = null;
      if (typeof this.rebalanceCoordinator.dispatchOperation ===
        TYPEOF.FUNCTION) {
        dispatchResult = await this.rebalanceCoordinator.dispatchOperation(
          operationId,
        );
      } else {
        const operation = await this.rebalanceCoordinator
          .claimDispatchTransition(operationId);
        if (!operation) {
          this.logger.debug(DISPATCH_LOG_MSG.CLAIM_SKIPPED, {
            operationId,
            nodeId: this.nodeId,
          });
          return;
        }
        dispatchResult = await this.rebalanceCoordinator
          .executeOperation(operation);
      }

      if (!dispatchResult || dispatchResult.success !== true) {
        return;
      }

      this.emit(DISPATCH_EVENT.OPERATION_DISPATCHED, {
        operationId,
        targetNodeId,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
    } finally {
      this.dispatchInFlight.delete(operationId);
    }
  }

  /**
   * Retry pending dispatches for operations targeting a ready node.
   * Re-enters the canonical per-operation queue so ready-node retries cannot
   * create a second inline dispatch owner path.
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
        if (!row?.operation_id) {
          continue;
        }
        this.operationDispatchQueue.enqueue(
          row.operation_id,
          RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
          {row},
        );
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
    const cacheRows = this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.listReplicaOperationsFromCache ===
        TYPEOF.FUNCTION ?
      (await this.replicaOperationsOwner.listReplicaOperationsFromCache())
        .rows || [] :
      this.getSystemTableRowsFromCache(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      );
    return cacheRows.filter((row) => {
      return isCoordinatorOwnedOperationType(row?.type) &&
        row?.target_node_id === nodeId &&
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
      await this.getNodeRow(nodeId);
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
    if (!isCoordinatorOwnedOperationType(row.type)) {
      return;
    }

    if (row.type === OperationType.REPLACE &&
        row.workflow_step === WORKFLOW_STEP.ACTIVE) {
      const operation = this.buildOperationFromRow(row);
      if (typeof this.rebalanceCoordinator.dispatchOperation ===
        TYPEOF.FUNCTION) {
        await this.rebalanceCoordinator.dispatchOperation(operation);
      } else {
        await this.rebalanceCoordinator.executeOperation(operation);
      }
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
   * Reconcile callback for the node-state update queue.
   * Applies the latest queued payload for one node.
   * @param {string} nodeId - The node to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @return {Promise<void>}
   * @private
   */
  async reconcileNodeStateUpdate(nodeId, context) {
    const payload = context?.payload || null;
    if (!payload ||
        payload[ControlPlaneField.NODE_ID] !== nodeId) {
      return;
    }
    try {
      await this.handleNodeStateUpdate(payload);
      this.clearDeferredNodeStateUpdateRetry(nodeId);
    } catch (error) {
      if (!this.shouldDeferNodeStateUpdateRetry(error)) {
        throw error;
      }
      const retryAfterMs =
        this.deferNodeStateUpdateRetry(nodeId, payload, error);
      this.logger.info(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
        nodeId,
        retryAfterMs,
        error: error.message,
        errorCode: error?.code || null,
      });
    }
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
    if (!previous) {
      return true;
    }
    if (!next) {
      return true;
    }

    if (next.readyLeaseExpiresAt > previous.readyLeaseExpiresAt) {
      return true;
    }
    if (next.readyLeaseExpiresAt < previous.readyLeaseExpiresAt) {
      return false;
    }

    if (next.heartbeatAt > previous.heartbeatAt) {
      return true;
    }
    if (next.heartbeatAt < previous.heartbeatAt) {
      return false;
    }

    return false;
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
   * Build a comparable watermark from one NODE_STATE_UPDATE payload.
   * @param {Object} payload - Control-plane node-state payload.
   * @return {Object|null}
   * @private
   */
  getNodeStateUpdateWatermark(payload) {
    if (!payload || typeof payload !== TYPEOF.OBJECT) {
      return null;
    }

    const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
    const watermarkRow = payloadNodeRow &&
      typeof payloadNodeRow === TYPEOF.OBJECT ?
      {...payloadNodeRow} :
      {};
    const heartbeatAt = Number(payload[ControlPlaneField.HEARTBEAT_AT]);
    const readyLeaseExpiresAt = Number(
      payload[ControlPlaneField.READY_LEASE_EXPIRES_AT],
    );
    if (Number.isFinite(heartbeatAt)) {
      watermarkRow[COLUMN.LAST_HEARTBEAT] = heartbeatAt;
    }
    if (Number.isFinite(readyLeaseExpiresAt)) {
      watermarkRow[COLUMN.READY_LEASE_EXPIRES_AT] = readyLeaseExpiresAt;
    }
    if (typeof payload[ControlPlaneField.STATE] === TYPEOF.STRING) {
      watermarkRow[COLUMN.CONNECTION_STATE] = payload[ControlPlaneField.STATE];
    }
    const watermark = getNodeHeartbeatWatermark(watermarkRow);
    if (!watermark) {
      return null;
    }
    if (watermark.lastHeartbeat === null &&
        watermark.readyLeaseExpiresAt === null &&
        watermark.connectionState === null) {
      return null;
    }
    return watermark;
  }

  /**
   * Accept only forward node-state watermark progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Candidate watermark.
   * @return {boolean}
   * @private
   */
  isNodeStateUpdateWatermarkNewer(previous, next) {
    if (!previous) {
      return true;
    }
    if (!next) {
      return true;
    }
    if (previous.lastHeartbeat === null &&
        next.lastHeartbeat !== null) {
      return true;
    }
    if (previous.lastHeartbeat !== null &&
        next.lastHeartbeat === null) {
      return false;
    }
    if (previous.readyLeaseExpiresAt === null &&
        next.readyLeaseExpiresAt !== null) {
      return true;
    }
    if (previous.readyLeaseExpiresAt !== null &&
        next.readyLeaseExpiresAt === null) {
      return false;
    }
    return compareNodeHeartbeatWatermarks(previous, next) > 0;
  }

  /**
   * Normalize node-state queue shard count to a safe positive integer.
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateQueueShardCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 4;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred node-state retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return DISPATCH_DEFAULT.NODE_STATE_UPDATE_RETRY_AFTER_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Build canonical write options for NODE_STATE_UPDATE persistence.
   * @param {string} nodeId
   * @param {string} nextState
   * @return {Object}
   * @private
   */
  buildNodeStateUpdateWriteOptions(nodeId, nextState) {
    const isReady = nextState === STATE.READY;
    return {
      allowCoalescing: true,
      allowPressureDefer: true,
      coalescingKey: `node-state:${nodeId}`,
      deliveryPriority: isReady ? 'critical' : 'background',
      pressureRetryAfterMs: this.nodeStateUpdateRetryAfterMs,
      queryTimeoutMs: this.nodeStateUpdateQueryTimeoutMs,
      skipCacheWait: true,
      workClass: isReady ?
        PRESSURE_WORK_CLASS.INTERACTIVE :
        PRESSURE_WORK_CLASS.BACKGROUND,
    };
  }

  /**
   * Determine whether one node-state write failure should be retried through
   * the owner queue instead of surfacing as a terminal reconcile error.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  shouldDeferNodeStateUpdateRetry(error) {
    if (!error) {
      return false;
    }
    if (error?.code === 'NODE_ROW_MISSING') {
      return false;
    }
    if (error?.deferRetry === true) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > NUM.ZERO) {
      return true;
    }
    const message = error?.message || String(error);
    if (typeof this.cdcIntegrationService?.isTransientCdcError ===
      TYPEOF.FUNCTION &&
      this.cdcIntegrationService.isTransientCdcError(message)) {
      return true;
    }
    return (
      message.includes('Connection to node') &&
      message.includes('closed')
    ) ||
      message.includes('No connection to node') ||
      message.includes('Query routing failed') ||
      message.includes('Failed to forward write to leader') ||
      message.includes('Message timeout');
  }

  /**
   * Resolve one retry delay for deferred node-state writes.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveNodeStateUpdateRetryAfterMs(error) {
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(error.retryAfterMs));
    }
    return this.nodeStateUpdateRetryAfterMs;
  }

  /**
   * Store the latest node-state payload and arm one deferred retry timer.
   * @param {string} nodeId
   * @param {Object} payload
   * @param {Error} error
   * @return {number}
   * @private
   */
  deferNodeStateUpdateRetry(nodeId, payload, error) {
    if (!nodeId || !payload) {
      return this.nodeStateUpdateRetryAfterMs;
    }

    const retryAfterMs = this.resolveNodeStateUpdateRetryAfterMs(error);
    const desiredAttemptAt = Date.now() + retryAfterMs;
    const existing = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (existing) {
      existing.payload = payload;
      existing.errorMessage = error?.message || null;
      if (desiredAttemptAt < existing.nextAttemptAt) {
        if (existing.timeoutHandle) {
          this.clearTimeoutFn(existing.timeoutHandle);
        }
        existing.nextAttemptAt = desiredAttemptAt;
        existing.timeoutHandle = this.armDeferredNodeStateUpdateRetry(
          nodeId,
          retryAfterMs,
        );
      }
      return retryAfterMs;
    }

    const deferredRetry = {
      payload,
      nextAttemptAt: desiredAttemptAt,
      errorMessage: error?.message || null,
      timeoutHandle: null,
    };
    deferredRetry.timeoutHandle = this.armDeferredNodeStateUpdateRetry(
      nodeId,
      retryAfterMs,
    );
    this.nodeStateUpdateDeferredRetries.set(nodeId, deferredRetry);
    return retryAfterMs;
  }

  /**
   * Arm the deferred retry timer for one node-state update owner key.
   * @param {string} nodeId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredNodeStateUpdateRetry(nodeId, delayMs) {
    return this.setTimeoutFn(() => {
      const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
      if (!deferredRetry) {
        return;
      }
      this.nodeStateUpdateDeferredRetries.delete(nodeId);
      this.resolveNodeStateUpdateQueue(nodeId).enqueue(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
        {payload: deferredRetry.payload},
      );
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED_RETRY, {
        nodeId,
        retryAfterMs: delayMs,
      });
    }, delayMs);
  }

  /**
   * Replace the deferred retry payload for one node without scheduling another
   * immediate write attempt.
   * @param {string} nodeId
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
  replaceDeferredNodeStateUpdatePayload(nodeId, payload) {
    const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (!deferredRetry) {
      return false;
    }
    deferredRetry.payload = payload;
    return true;
  }

  /**
   * Cancel and clear one deferred node-state retry slot.
   * @param {string} nodeId
   * @private
   */
  clearDeferredNodeStateUpdateRetry(nodeId) {
    const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (!deferredRetry) {
      return;
    }
    if (deferredRetry.timeoutHandle) {
      this.clearTimeoutFn(deferredRetry.timeoutHandle);
    }
    this.nodeStateUpdateDeferredRetries.delete(nodeId);
  }

  /**
   * Build one queue name for a node-state update shard.
   * @param {number} shardIndex - Zero-based shard index.
   * @return {string}
   * @private
   */
  buildNodeStateUpdateQueueName(shardIndex) {
    if (this.nodeStateUpdateQueueShardCount <= NUM.ONE) {
      return DISPATCH_QUEUE_NAME.NODE_STATE_UPDATE;
    }
    return `${DISPATCH_QUEUE_NAME.NODE_STATE_UPDATE}-${shardIndex}`;
  }

  /**
   * Resolve one node-state update reconcile shard for a node.
   * Assignments are stable for process lifetime to preserve owner-key ordering.
   * @param {string} nodeId - Node ID.
   * @return {OwnerKeyReconcileQueue}
   * @private
   */
  resolveNodeStateUpdateQueue(nodeId) {
    if (!Array.isArray(this.nodeStateUpdateQueues) ||
        this.nodeStateUpdateQueues.length <= NUM.ONE) {
      return this.nodeStateUpdateQueue;
    }

    const assignedQueueIndex =
      this.nodeStateUpdateQueueAssignments.get(nodeId);
    if (Number.isFinite(assignedQueueIndex)) {
      return this.nodeStateUpdateQueues[assignedQueueIndex];
    }

    const queueIndex =
      this.nextNodeStateUpdateQueueIndex %
      this.nodeStateUpdateQueues.length;
    this.nextNodeStateUpdateQueueIndex += NUM.ONE;
    this.nodeStateUpdateQueueAssignments.set(nodeId, queueIndex);
    return this.nodeStateUpdateQueues[queueIndex];
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
   * Check whether a node is ready for internal topology dispatch work.
   * Dispatch is an internal topology consumer and gates on repairEligible
   * only (Req 4.2). Serve-only dimensions do not block dispatch.
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
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE
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
      ControlPlaneReadinessService.compactSnapshotSummary(
        readiness,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );
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
    const serviceRows = this.servicesOwner &&
      typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION ?
      (await this.servicesOwner.listServicesFromCache()).rows || [] :
      this.getSystemTableRowsFromCache(SYSTEM_TABLE_NAME.SERVICES);
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
    if (this.nodesOwner &&
        typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.getNodeFromCache(nodeId);
      return result?.rows?.[0] || {};
    }
    return this.getSystemTableRowFromCache(
      SYSTEM_TABLE_NAME.NODES,
      nodeId,
    ) || {};
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
    error.code = 'NODE_ROW_MISSING';
    error.nodeId = nodeId;
    return error;
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
    if (this.replicaOperationsOwner &&
        typeof this.replicaOperationsOwner.getReplicaOperationFromCache ===
          TYPEOF.FUNCTION) {
      const result =
        await this.replicaOperationsOwner.getReplicaOperationFromCache(
          operationId,
        );
      return result?.rows?.[0] || null;
    }
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
  async forwardToLeader(mgService, payload, options = {}) {
    const requiredTables = Array.isArray(options.requiredTables) ?
      [...new Set(options.requiredTables.filter((tableName) =>
        typeof tableName === TYPEOF.STRING && tableName.length > NUM.ZERO
      ))] :
      [];
    if (requiredTables.length > NUM.ZERO) {
      const readiness = options.ingressReadiness ||
        this.resolveMessageGroupIngressReadiness(
          mgService,
          requiredTables,
        );
      if (typeof mgService?.forwardMetadataIngressPayloadToLeader !==
          TYPEOF.FUNCTION) {
        const error = new Error(
          readiness.reason ||
          DISPATCH_ERROR_MSG.METADATA_FORWARD_PATH_UNAVAILABLE,
        );
        if (Number.isFinite(readiness.retryAfterMs) &&
            readiness.retryAfterMs > NUM.ZERO) {
          error.deferRetry = true;
          error.retryAfterMs = readiness.retryAfterMs;
        }
        throw error;
      }
      await mgService.forwardMetadataIngressPayloadToLeader(payload, {
        requiredTables,
        forwardedByNodeId: this.nodeId,
      });
      return;
    }

    const leaderId = mgService.getLeaderId();
    if (!leaderId) {
      const readiness = options.ingressReadiness ||
        this.resolveMessageGroupIngressReadiness(
          mgService,
          requiredTables,
        );
      const error = new Error(
        readiness.reason || 'Control-plane leader is not ready',
      );
      if (Number.isFinite(readiness.retryAfterMs) &&
          readiness.retryAfterMs > NUM.ZERO) {
        error.deferRetry = true;
        error.retryAfterMs = readiness.retryAfterMs;
      }
      throw error;
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
    this.nodeStateUpdateWatermarks.clear();
    this.nodeReadyRetryWatermarks.clear();
    for (const nodeId of this.nodeStateUpdateDeferredRetries.keys()) {
      this.clearDeferredNodeStateUpdateRetry(nodeId);
    }
    this.nodeStateUpdateQueueAssignments.clear();
    this.nextNodeStateUpdateQueueIndex = NUM.ZERO;

    this.operationDispatchQueue.shutdown();
    for (const nodeStateUpdateQueue of this.nodeStateUpdateQueues) {
      nodeStateUpdateQueue.shutdown();
    }
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
