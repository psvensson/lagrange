import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  REPLICA_DISPATCH_STATE_PUBLICATION_METHODS,
} from './replica-dispatch-state-publication.js';

const {
  COLUMN,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_EVENT,
  ConfigurationManager,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_READY_LEASE_MS,
  DISPATCH_ERROR_MSG,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_READINESS_ERROR_REASON,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
  EventEmitter,
  LoggingService,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OwnerKeyReconcileQueue,
  REBALANCE_COORDINATOR_EVENT,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  SERVICE_STATUS,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  assertCritical,
  classifyTransportDeliveryOutcome,
  createControlPlaneRuntimeBundle,
  getControlPlaneMessageRequiredTables,
  getNodeHeartbeatWatermark,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  wasNodeRecordReadyWhenWritten,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const DIRECT_DISPATCH_WAKEUP_EMPTY_VALUE = null;
const DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD = Object.freeze({
  DELIVERY_PRIORITY: 'deliveryPriority',
  DELIVERY_SOURCE: 'deliverySource',
  TARGET_NODE_ID: 'targetNodeId',
  TIMEOUT_MS: 'timeoutMs',
});
const DIRECT_DISPATCH_WAKEUP_CLASSIFY_OPTION_FIELD = Object.freeze({
  DEFAULT_RETRY_AFTER_MS: 'defaultRetryAfterMs',
});

class ReplicaDispatchServiceSegment1 extends EventEmitter {
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      (this.cdcIntegrationService ||
      options.sqlQueryEngine ||
      options.systemTableCache ||
      this.messageRouter ?
        createControlPlaneRuntimeBundle({
          nodeId: this.nodeId,
          cdcIntegrationService: this.cdcIntegrationService,
          sqlQueryEngine: options.sqlQueryEngine || null,
          systemTableCache: options.systemTableCache || null,
          messageRouter: this.messageRouter,
        }).controlPlaneSystemTableGateway :
        null);
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
    this.directDispatchServiceAddress = null;
    this.directDispatchServiceHandler = null;
    this.dispatchInFlight = new Set();
    this.retryInFlightNodes = new Set();
    this.nodeStateUpdateWatermarks = new Map();
    this.nodeReadyRetryWatermarks = new Map();
    this.dispatchFailureSignaturesByOperationId = new Map();
    this.operationDispatchDeferredRetries = new Map();
    this.nodeStateUpdateDeferredRetries = new Map();
    this.membershipPublicationAckDeferredRetries = new Map();
    this.nodeStateUpdateRetryStateByNodeId = new Map();
    this.nodeStateUpdateQueueAssignments = new Map();
    this.nextNodeStateUpdateQueueIndex = NUM.ZERO;
    this.cacheChangeListener = null;
    this.coordinatorOperationCreatedListener = null;
    this.state = DISPATCH_STATE.CREATED;
    this.setTimeoutFn =
      typeof options.setTimeoutFn === TYPEOF.FUNCTION ?
        options.setTimeoutFn :
        setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === TYPEOF.FUNCTION ?
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
    this.operationDispatchRetryAfterMs =
      this.normalizeOperationDispatchRetryAfterMs(
        options.operationDispatchRetryAfterMs,
      );
    this.replicaOperationDispatchTimeoutMs =
      this.normalizeReplicaOperationDispatchTimeoutMs(
        options.replicaOperationDispatchTimeoutMs,
      );
    this.operationDispatchQueueShardCount =
      this.normalizeOperationDispatchQueueShardCount(
        options.operationDispatchQueueShardCount,
      );
    this.dispatchReadinessRefreshTimeoutMs =
      this.normalizeDispatchReadinessRefreshTimeoutMs(
        options.dispatchReadinessRefreshTimeoutMs,
      );

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(DISPATCH_SUBSYSTEM) :
      console;

    this.operationDispatchQueues = Array.from(
      {length: this.operationDispatchQueueShardCount},
      (_unused, shardIndex) => {
        return new OwnerKeyReconcileQueue({
          name: this.buildOperationDispatchQueueName(shardIndex),
          reconcileFn: (ownerKey, _reasons, context) =>
            this.reconcileOperationDispatch(ownerKey, context),
        });
      },
    );
    this.operationDispatchQueue = this.buildOperationDispatchQueueFacade();

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
    assertCritical(this.systemTableCache, DISPATCH_ERROR_MSG.MISSING_CACHE);
    assertCritical(
      typeof this.systemTableCache.get === TYPEOF.FUNCTION,
      DISPATCH_ERROR_MSG.MISSING_CACHE_GET,
    );
    assertCritical(
      typeof this.systemTableCache.getAll === TYPEOF.FUNCTION,
      DISPATCH_ERROR_MSG.MISSING_CACHE_GET_ALL,
    );
    assertCritical(this.cdcIntegrationService, DISPATCH_ERROR_MSG.MISSING_CDC);
    assertCritical(
      this.rebalanceCoordinator,
      DISPATCH_ERROR_MSG.MISSING_COORDINATOR,
    );

    this.state = DISPATCH_STATE.INITIALIZED;
    this.logger.info(DISPATCH_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
    });

    if (
      this.systemTableCache &&
      typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION
    ) {
      this.cacheChangeListener = (tableName, operation, record) => {
        this.handleCacheNodeChange(tableName, operation, record);
      };
      this.systemTableCache.onCacheChange(this.cacheChangeListener);
    }

    if (
      this.messageRouter &&
      typeof this.messageRouter.register === TYPEOF.FUNCTION
    ) {
      this.directDispatchServiceAddress =
        this.buildDirectDispatchServiceAddress(this.nodeId);
      if (this.directDispatchServiceAddress) {
        this.directDispatchServiceHandler = async (envelope = {}) => {
          const payload = envelope?.payload || {};
          if (
            payload.type !== ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH
          ) {
            return {
              acknowledged: false,
              error:
                REPLICA_DISPATCH_SERVICE_LITERAL.UNSUPPORTED_DISPATCH_CONTROL_MESSAGE,
            };
          }
          await this.handleReplicaOperationDispatch(payload);
          return {acknowledged: true};
        };
        this.messageRouter.register(
          this.directDispatchServiceAddress,
          this.directDispatchServiceHandler,
        );
      }
    }

    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.on === TYPEOF.FUNCTION
    ) {
      this.coordinatorOperationCreatedListener = (event = {}) => {
        this.handleCoordinatorOperationCreated(event.operation).catch(
          (error) => {
            this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, {
              operationId: event?.operation?.operationId,
              error: error.message,
              source: REPLICA_DISPATCH_SERVICE_LITERAL.COORDINATOR_DOT_EVENT,
            });
          },
        );
      };
      this.rebalanceCoordinator.on(
        REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED,
        this.coordinatorOperationCreatedListener,
      );
    }

    this.enqueueCachedReadyNodeRetriesOnInitialize();
    this.enqueueCachedReplicaOperationRetriesOnInitialize();
  }

  /**
   * Replay already-ready cached nodes through the canonical ready-node queue.
   * Restart recovery can miss the original ready/cache trigger window, so
   * initialization must re-enter the same queue path instead of waiting for an
   * unrelated later heartbeat or cache update.
   * @private
   */
  enqueueCachedReadyNodeRetriesOnInitialize() {
    const nodeRows = this.getSystemTableRowsFromCache(
      SYSTEM_TABLE_NAME.NODES,
    );
    for (const nodeRow of nodeRows) {
      const nodeId = this.getNodeIdFromRecord(nodeRow);
      if (
        !nodeId ||
        !wasNodeRecordReadyWhenWritten(nodeRow, {
          requireActiveStatus: true,
        })
      ) {
        continue;
      }
      this.nodeReadyRetryQueue.enqueue(
        nodeId,
        RECONCILE_REASON.NODES_CACHE_READY,
        {nodeRow},
      );
    }
  }

  /**
   * Replay cached dispatchable replica operation rows through the canonical
   * dispatch replay path. Restart recovery can lose in-memory queue/timer
   * state after an acknowledged owner wake, while the durable operation row is
   * already cache-visible.
   * @private
   */
  enqueueCachedReplicaOperationRetriesOnInitialize() {
    const operationRows = this.getSystemTableRowsFromCache(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    );
    for (const operationRow of operationRows) {
      this.replayReplicaOperationRow(operationRow, {
        pendingReason: RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
        replaceActiveReason:
          RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE,
      });
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
      this.handleMessageReceived(messageGroupService, event).catch((error) => {
        this.logger.error(DISPATCH_LOG_MSG.MESSAGE_HANDLING_FAILED, {
          error: error.message,
          groupId: messageGroupService.groupId,
        });
      });
    };

    const onCdcApplied = (event) => {
      this.handleCdcApplied(messageGroupService, event).catch((error) => {
        this.logger.error(DISPATCH_LOG_MSG.CDC_HANDLING_FAILED, {
          error: error.message,
          groupId: messageGroupService.groupId,
        });
      });
    };

    messageGroupService.on(
      CONTROL_PLANE_EVENT.MESSAGE_RECEIVED,
      onMessageReceived,
    );
    messageGroupService.on(CONTROL_PLANE_EVENT.CDC_APPLIED, onCdcApplied);

    this.messageGroupServices.add(messageGroupService);
    this.messageGroupHandlers.set(messageGroupService, {
      onMessageReceived,
      onCdcApplied,
    });
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
      const ingressDecision = await this.resolveMessageGroupIngressDecision(
        mgService,
        requiredTables,
      );
      if (
        ingressDecision.action !== MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL
      ) {
        await this.forwardToLeader(mgService, payload, {
          requiredTables,
          ingressDecision,
        });
        if (
          messageId &&
          typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION
        ) {
          await mgService.acknowledgeMessage(messageId);
        }
        return;
      }
      this.enqueueNodeStateUpdate(payload);
      if (
        messageId &&
        typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION
      ) {
        await mgService.acknowledgeMessage(messageId);
      }
      return;
    }

    if (!mgService.isLeaderReplica()) {
      await this.forwardToLeader(mgService, payload);
      return;
    }

    if (payload.type === ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH) {
      await this.handleReplicaOperationDispatch(payload);
    }

    if (messageId && typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION) {
      await mgService.acknowledgeMessage(messageId);
    }
  }

  resolveControlPlaneMessageRequiredTables(payload) {
    return getControlPlaneMessageRequiredTables(payload?.type);
  }

  resolveMessageGroupIngressReadiness(mgService, requiredTables = []) {
    if (
      !mgService ||
      typeof mgService.getMetadataIngressReadiness !== TYPEOF.FUNCTION
    ) {
      return {
        ready: false,
        reason:
          REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE,
      };
    }
    return mgService.getMetadataIngressReadiness({requiredTables});
  }

  buildMessageGroupIngressDecision(action, readiness = {}, extra = {}) {
    return Object.freeze({
      action,
      ready: readiness?.ready === true,
      reason:
        typeof readiness?.reason === TYPEOF.STRING &&
        readiness.reason.length > NUM.ZERO ?
          readiness.reason :
          null,
      retryAfterMs:
        Number.isFinite(readiness?.retryAfterMs) &&
        readiness.retryAfterMs > NUM.ZERO ?
          Math.floor(readiness.retryAfterMs) :
          null,
      ...extra,
    });
  }

  resolveMessageGroupIngressFallbackDecision(mgService, requiredTables = []) {
    const readiness = this.resolveMessageGroupIngressReadiness(
      mgService,
      requiredTables,
    );
    if (readiness.ready === true) {
      return this.buildMessageGroupIngressDecision(
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        readiness,
      );
    }
    if (
      typeof mgService?.forwardMetadataIngressPayloadToLeader ===
      TYPEOF.FUNCTION
    ) {
      return this.buildMessageGroupIngressDecision(
        MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
        readiness,
      );
    }
    return this.buildMessageGroupIngressDecision(
      MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
      readiness,
    );
  }

  async resolveMessageGroupIngressDecision(mgService, requiredTables = []) {
    if (!mgService || typeof mgService !== TYPEOF.OBJECT) {
      return this.buildMessageGroupIngressDecision(
        MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
        {
          ready: false,
          reason:
            REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE,
        },
      );
    }
    if (
      typeof mgService.resolveMetadataIngressForwardSelection !==
      TYPEOF.FUNCTION
    ) {
      return this.resolveMessageGroupIngressFallbackDecision(
        mgService,
        requiredTables,
      );
    }
    const selection = await mgService.resolveMetadataIngressForwardSelection({
      requiredTables,
    });
    const selectionAction =
      selection?.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL ||
      selection?.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD ||
      selection?.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER ?
        selection.action :
        MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER;
    const retryAfterMs =
      Number.isFinite(selection?.retryAfterMs) &&
      selection.retryAfterMs > NUM.ZERO ?
        selection.retryAfterMs :
        Number.isFinite(selection?.strictForwardRetryAfterMs) &&
            selection.strictForwardRetryAfterMs > NUM.ZERO ?
          selection.strictForwardRetryAfterMs :
          null;
    return this.buildMessageGroupIngressDecision(
      selectionAction,
      {
        ready: selection?.ready === true,
        reason:
          typeof selection?.reason === TYPEOF.STRING ?
            selection.reason :
            REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_DASH_GROUP_INGRESS_SELECTION_UNAVAILABLE,
        retryAfterMs,
      },
      {selection},
    );
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

    if (event?.tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS) {
      this.scheduleLocalReadyNodeMembershipPublicationAdvance(
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CDC_UPDATE,
        event?.data,
      );
      this.enqueueLocalReadyNodeDispatchRetry(
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CDC_UPDATE,
      );
      return;
    }

    if (event?.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      return;
    }

    this.replayReplicaOperationRow(event?.data, {
      pendingReason: RECONCILE_REASON.CDC_OPERATION_PENDING,
      replaceActiveReason: RECONCILE_REASON.CDC_REPLACE_ACTIVE,
    });
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

    if (!this.isReplicaOperationLocallyOwned(operation)) {
      await this.sendDirectDispatchWakeup(operation);
      return;
    }

    this.operationDispatchQueue.enqueue(
      operation.operationId,
      RECONCILE_REASON.COORDINATOR_OPERATION_CREATED,
      {row: this.buildOperationRowFromCoordinator(operation)},
    );
  }

  /**
   * Build the direct router address used to wake one replica-operation owner.
   * @param {string} nodeId
   * @return {string|null}
   * @private
   */
  buildDirectDispatchServiceAddress(nodeId) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (normalizedNodeId.length === NUM.ZERO) {
      return null;
    }
    return `${normalizedNodeId}/service/replica-dispatch`;
  }

  /**
   * Resolve the current owner node for one replica operation.
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveReplicaOperationOwnerNodeId(operation) {
    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId ===
        TYPEOF.FUNCTION
    ) {
      return this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation);
    }
    return operation?.targetNodeId || operation?.target_node_id || null;
  }

  /**
   * Build bounded transport options for direct replica-dispatch wake-ups.
   * @param {Object} operation
   * @param {string} ownerNodeId
   * @return {Object}
   * @private
   */
  buildDirectDispatchWakeupDeliveryOptions(operation, ownerNodeId) {
    const deliveryOptions = {
      [DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.TARGET_NODE_ID]:
        ownerNodeId,
      [DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.TIMEOUT_MS]:
        this.replicaOperationDispatchTimeoutMs,
      [DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.DELIVERY_SOURCE]:
        OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
    };
    const partitionId =
      operation?.partitionId ||
      operation?.partition_id ||
      DIRECT_DISPATCH_WAKEUP_EMPTY_VALUE;
    if (isPriorityControlPlanePartition({partitionId})) {
      deliveryOptions[
        DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.DELIVERY_PRIORITY
      ] = OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
    }
    return deliveryOptions;
  }

  /**
   * Send one bounded direct owner wake-up when a newly created operation is
   * owned by another node and CDC/cache visibility may lag.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async sendDirectDispatchWakeup(operation) {
    if (
      !operation?.operationId ||
      !this.messageRouter ||
      typeof this.messageRouter.deliver !== TYPEOF.FUNCTION
    ) {
      return false;
    }
    const operationRow = this.buildOperationRowFromCoordinator(operation);
    const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
    const targetAddress = this.buildDirectDispatchServiceAddress(ownerNodeId);
    if (!targetAddress) {
      return false;
    }
    try {
      const deliveryOutcome = classifyTransportDeliveryOutcome(
        await this.messageRouter.deliver(
          targetAddress,
          {
            type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
            [ControlPlaneField.OPERATION_ID]: operation.operationId,
            [ControlPlaneField.OPERATION_ROW]: operationRow,
          },
          this.buildDirectDispatchWakeupDeliveryOptions(
            operation,
            ownerNodeId,
          ),
        ),
        {
          [DIRECT_DISPATCH_WAKEUP_CLASSIFY_OPTION_FIELD.DEFAULT_RETRY_AFTER_MS]:
            this.operationDispatchRetryAfterMs,
        },
      );
      if (isDeliveredTransportDeliveryOutcome(deliveryOutcome)) {
        this.scheduleRemoteDispatchWakeupVerification(
          operation.operationId,
          operationRow,
        );
        return true;
      }
      this.deferOperationDispatchRetry(
        operation.operationId,
        deliveryOutcome,
        operationRow,
      );
      return false;
    } catch (error) {
      this.deferOperationDispatchRetry(
        operation.operationId,
        error,
        operationRow,
      );
      return false;
    }
  }

  /**
   * Extract durable startup-owned storage-budget fields from one node-state
   * payload. Heartbeat-only NODE_STATE_UPDATE messages omit these fields, so
   * this preserves budget ownership without letting routine heartbeats clear it.
   * @param {Object|null} nodeRow
   * @return {Object}
   * @private
  */
}

Object.defineProperties(
  ReplicaDispatchServiceSegment1.prototype,
  Object.fromEntries(
    Object.entries(REPLICA_DISPATCH_STATE_PUBLICATION_METHODS).map(
      ([name, value]) => [
        name,
        {
          value,
          configurable: true,
          writable: true,
        },
      ],
    ),
  ),
);

export {ReplicaDispatchServiceSegment1};
