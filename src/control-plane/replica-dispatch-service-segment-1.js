import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

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
  createControlPlaneRuntimeBundle,
  getControlPlaneMessageRequiredTables,
  getNodeHeartbeatWatermark,
  isRetryableControlPlaneError,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

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
      return;
    }

    if (event?.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      return;
    }

    this.enqueueReplicaOperationRow(event?.data, {
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
   * Send one best-effort direct owner wake-up when a newly created operation
   * is owned by another node and CDC/cache visibility may lag.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async sendDirectDispatchWakeup(operation) {
    if (
      !operation?.operationId ||
      !this.messageRouter ||
      typeof this.messageRouter.deliver !== TYPEOF.FUNCTION
    ) {
      return;
    }
    const operationRow = this.buildOperationRowFromCoordinator(operation);
    const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
    const targetAddress = this.buildDirectDispatchServiceAddress(ownerNodeId);
    if (!targetAddress) {
      return;
    }
    try {
      await this.messageRouter.deliver(targetAddress, {
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operation.operationId,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
      });
    } catch (_error) {
      // Best-effort wake-up only. CDC/cache visibility remains the fallback.
    }
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
    const previousWatermark =
      this.nodeStateUpdateWatermarks.get(nodeId) || null;
    if (
      !this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark)
    ) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_OR_DUPLICATE_ENQUEUE,
      });
      return false;
    }

    if (nextWatermark) {
      this.nodeStateUpdateWatermarks.set(nodeId, nextWatermark);
    }

    if (this.replaceDeferredNodeStateUpdatePayload(nodeId, payload)) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.DEFERRED_RETRY_PENDING,
      });
      return false;
    }

    const nodeStateUpdateQueue = this.resolveNodeStateUpdateQueue(nodeId);
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
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
    const nodeRow =
      payloadNodeRow && typeof payloadNodeRow === TYPEOF.OBJECT ?
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
    const requestedHeartbeatAt = Number(
      payload[ControlPlaneField.HEARTBEAT_AT],
    );
    // Apply-time liveness timestamp prevents delayed messages from
    // immediately writing an already-stale heartbeat.
    const heartbeatAt = Number.isFinite(requestedHeartbeatAt) ?
      Math.max(requestedHeartbeatAt, now) :
      now;
    const requestedLeaseExpiry =
      payload[ControlPlaneField.READY_LEASE_EXPIRES_AT];
    const promotedToReadyFromConnected =
      state === STATE.CONNECTED &&
      existingConnectionState === STATE.READY &&
      Number.isFinite(existingReadyLeaseExpiresAt) &&
      existingReadyLeaseExpiresAt > now;
    const nextState = promotedToReadyFromConnected ? STATE.READY : state;
    const readyLeaseExpiresAt =
      nextState === STATE.READY ?
        Number.isFinite(requestedLeaseExpiry) &&
          requestedLeaseExpiry > heartbeatAt ?
          requestedLeaseExpiry :
          heartbeatAt + this.readyLeaseMs :
        null;
    const existingWatermark = getNodeHeartbeatWatermark(existing);
    const effectiveReadyWatermark = {
      lastHeartbeat: heartbeatAt,
      readyLeaseExpiresAt,
      connectionState: nextState,
    };
    const staleCheckWatermark =
      state === STATE.READY ? effectiveReadyWatermark : payloadWatermark;
    if (
      !this.isNodeStateUpdateWatermarkNewer(
        existingWatermark,
        staleCheckWatermark,
      )
    ) {
      if (
        state === STATE.READY &&
        isHeartbeatOnly === true &&
        wasNodeRecordReadyWhenWritten(existing, {
          requireActiveStatus: true,
        })
      ) {
        await this.maybeAdvanceReadyNodeMembershipPublication(nodeId, existing);
      }
      if (
        state === STATE.READY &&
        !isHeartbeatOnly &&
        wasNodeRecordReadyWhenWritten(existing, {
          requireActiveStatus: true,
        })
      ) {
        this.enqueueMembershipPublicationReconcile(
          RECONCILE_REASON.NODE_STATE_UPDATE_READY,
          {
            nodeId,
            state: STATE.READY,
            nodeRow: existing,
          },
        );
        this.nodeReadyRetryQueue.enqueue(
          nodeId,
          RECONCILE_REASON.NODE_STATE_UPDATE_READY,
          {nodeRow: existing},
        );
        await this.acknowledgeMembershipPublicationForNode(nodeId);
      }
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_AGAINST_EXISTING_ROW,
      });
      return;
    }
    const baseRow = this.buildNodeStateUpdateRow({
      nodeId,
      nodeRow,
      existing,
      nextState,
      heartbeatAt,
      readyLeaseExpiresAt,
      payloadNodeAddress: payload[ControlPlaneField.NODE_ADDRESS],
      payload,
      isHeartbeatOnly,
    });

    const updateResult =
      await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        {[COLUMN.NODE_ID]: nodeId},
        baseRow,
        this.buildNodeStateUpdateWriteOptions(
          nodeId,
          nextState,
          isHeartbeatOnly,
          payload,
        ),
      );
    const updateAffectedRows = Number(
      updateResult?.partitionResult?.affectedRows,
    );
    if (updateAffectedRows === NUM.ZERO) {
      const bootstrapped = await this.tryBootstrapMissingNodeStateUpdateRow(
        nodeId,
        nextState,
        baseRow,
        existing,
        isHeartbeatOnly,
        payload,
      );
      if (!bootstrapped) {
        throw await this.resolveMissingNodeRowUpdateError(nodeId, existing);
      }
    }

    if (nextState === STATE.READY && !isHeartbeatOnly) {
      this.enqueueMembershipPublicationReconcile(
        RECONCILE_REASON.NODE_STATE_UPDATE_READY,
        {
          nodeId,
          state: nextState,
          nodeRow: {
            ...existing,
            [COLUMN.NODE_ID]: nodeId,
            ...baseRow,
          },
        },
      );
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
      await this.acknowledgeMembershipPublicationForNode(nodeId);
      return;
    }

    if (nextState === STATE.READY && isHeartbeatOnly) {
      await this.maybeAdvanceReadyNodeMembershipPublication(nodeId, {
        ...existing,
        [COLUMN.NODE_ID]: nodeId,
        ...baseRow,
      });
    }

    this.clearNodeReadyRetryWatermark(nodeId);
  }

  /**
   * Build the persisted NODE_STATE_UPDATE row shape.
   * Heartbeat-only updates intentionally avoid mutating payload participation
   * fields such as utilization and resource budgets.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object|null} options.nodeRow
   * @param {Object|null} options.existing
   * @param {string} options.nextState
   * @param {number} options.heartbeatAt
   * @param {number|null} options.readyLeaseExpiresAt
   * @param {string} [options.payloadNodeAddress]
   * @param {Object} options.payload
   * @param {boolean} options.isHeartbeatOnly
   * @return {Object}
   * @private
   */
  buildNodeStateUpdateRow(options) {
    const {
      nodeId,
      nodeRow,
      existing,
      nextState,
      heartbeatAt,
      readyLeaseExpiresAt,
      payloadNodeAddress,
      payload,
      isHeartbeatOnly,
    } = options || {};

    const baseNodeAddress =
      payloadNodeAddress ||
      nodeRow?.[COLUMN.NODE_ADDRESS] ||
      existing?.[COLUMN.NODE_ADDRESS] ||
      STRING.UNKNOWN;

    if (isHeartbeatOnly === true) {
      const payloadCapabilities = payload?.[ControlPlaneField.CAPABILITIES];
      const capabilities = Array.isArray(payloadCapabilities) ?
        JSON.stringify(payloadCapabilities) :
        typeof payloadCapabilities === TYPEOF.STRING ?
          payloadCapabilities :
          existing?.[COLUMN.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY;
      const heartbeatOnlyRow = {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.NODE_ADDRESS]: baseNodeAddress,
        [COLUMN.CONNECTION_STATE]: nextState,
        [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
        [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      };
      if (
        nextState === STATE.READY &&
        capabilities !== STRING.EMPTY_JSON_ARRAY
      ) {
        heartbeatOnlyRow[COLUMN.CAPABILITIES] = capabilities;
      }
      if (
        this.shouldReviveHeartbeatOnlyNodeStatus({
          existing,
          isHeartbeatOnly,
          nextState,
        })
      ) {
        heartbeatOnlyRow[COLUMN.STATUS] = SERVICE_STATUS.ACTIVE;
      }
      return heartbeatOnlyRow;
    }

    const payloadCapabilities = payload?.[ControlPlaneField.CAPABILITIES];
    const capabilities = Array.isArray(payloadCapabilities) ?
      JSON.stringify(payloadCapabilities) :
      typeof payloadCapabilities === TYPEOF.STRING ?
        payloadCapabilities :
        existing?.[COLUMN.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY;

    return {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.NODE_ADDRESS]: baseNodeAddress,
      [COLUMN.CPU_CORES]: Number.isFinite(nodeRow?.[COLUMN.CPU_CORES]) ?
        nodeRow[COLUMN.CPU_CORES] :
        existing?.[COLUMN.CPU_CORES] || NUM.ZERO,
      [COLUMN.MEMORY_MB]: Number.isFinite(nodeRow?.[COLUMN.MEMORY_MB]) ?
        nodeRow[COLUMN.MEMORY_MB] :
        existing?.[COLUMN.MEMORY_MB] || NUM.ZERO,
      [COLUMN.DISK_GB]: Number.isFinite(nodeRow?.[COLUMN.DISK_GB]) ?
        nodeRow[COLUMN.DISK_GB] :
        existing?.[COLUMN.DISK_GB] || NUM.ZERO,
      [COLUMN.CPU_USAGE_PERCENT]: Number.isFinite(
        nodeRow?.[COLUMN.CPU_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.CPU_USAGE_PERCENT] :
        existing?.[COLUMN.CPU_USAGE_PERCENT] || NUM.ZERO,
      [COLUMN.MEMORY_USAGE_PERCENT]: Number.isFinite(
        nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.MEMORY_USAGE_PERCENT] :
        existing?.[COLUMN.MEMORY_USAGE_PERCENT] || NUM.ZERO,
      [COLUMN.DISK_USAGE_PERCENT]: Number.isFinite(
        nodeRow?.[COLUMN.DISK_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.DISK_USAGE_PERCENT] :
        existing?.[COLUMN.DISK_USAGE_PERCENT] || NUM.ZERO,
      [COLUMN.STATUS]:
        nextState === STATE.READY ?
          SERVICE_STATUS.ACTIVE :
          typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
              nodeRow[COLUMN.STATUS].length > NUM.ZERO ?
            nodeRow[COLUMN.STATUS] :
            existing?.[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: nextState,
      [COLUMN.CAPABILITIES]: capabilities,
      [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
      [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      ...this.resolveNodeStateUpdateBudgetFields(nodeRow),
    };
  }

  /**
   * Detect heartbeat-only NODE_STATE_UPDATEs and avoid durable participation
   * mutation side effects on the receiving path.
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
  isHeartbeatOnlyNodeStateUpdate(payload) {
    return payload?.[ControlPlaneField.HEARTBEAT_ONLY] === true;
  }

  shouldReviveHeartbeatOnlyNodeStatus(options = {}) {
    if (
      options.isHeartbeatOnly !== true ||
      options.nextState !== STATE.READY
    ) {
      return false;
    }
    const existingStatus =
      typeof options.existing?.[COLUMN.STATUS] === TYPEOF.STRING ?
        options.existing[COLUMN.STATUS].toLowerCase() :
        options.existing?.[COLUMN.STATUS];
    return existingStatus !== SERVICE_STATUS.ACTIVE;
  }

  /**
   * Bootstrap one missing node row from a NODE_STATE_UPDATE payload when
   * startup registration visibility lags behind steady-state updates.
   *
   * @param {string} nodeId
   * @param {string} nextState
   * @param {Object} baseRow
   * @param {Object} existing
   * @return {Promise<boolean>}
   * @private
   */
  async tryBootstrapMissingNodeStateUpdateRow(
    nodeId,
    nextState,
    baseRow,
    existing,
    isHeartbeatOnly,
    payload = null,
  ) {
    if (!baseRow || typeof baseRow !== TYPEOF.OBJECT) {
      return false;
    }
    if (existing?.[COLUMN.NODE_ID]) {
      return false;
    }
    if (nextState !== STATE.CONNECTED && nextState !== STATE.READY) {
      return false;
    }
    const nodeAddress = String(baseRow?.[COLUMN.NODE_ADDRESS] || '').trim();
    if (nodeAddress.length === NUM.ZERO || nodeAddress === STRING.UNKNOWN) {
      return false;
    }

    const gateway = this.getControlPlaneSystemTableGateway();
    if (typeof gateway.upsertSystemTableRow !== TYPEOF.FUNCTION) {
      return false;
    }

    try {
      const upsertResult = await gateway.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        baseRow,
        this.buildNodeStateUpdateWriteOptions(
          nodeId,
          nextState,
          isHeartbeatOnly,
          payload,
        ),
      );
      if (upsertResult?.success === false) {
        const upsertError = new Error(
          'Failed to bootstrap missing node row from NODE_STATE_UPDATE: ' +
            String(
              upsertResult.error || DISPATCH_READINESS_ERROR_REASON.UNKNOWN,
            ),
        );
        upsertError.code =
          upsertResult.error ||
          REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED;
        if (upsertResult.deferRetry === true) {
          upsertError.deferRetry = true;
          upsertError.retryAfterMs = Number.isFinite(upsertResult.retryAfterMs) ?
            upsertResult.retryAfterMs :
            this.nodeStateUpdateRetryAfterMs;
        }
        throw upsertError;
      }
      this.logger.info(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_BOOTSTRAP_UPSERTED, {
        nodeId,
        state: nextState,
      });
      return true;
    } catch (error) {
      if (error?.deferRetry === true || isRetryableControlPlaneError(error)) {
        error.deferRetry = true;
        error.retryAfterMs = Number.isFinite(error?.retryAfterMs) ?
          error.retryAfterMs :
          this.nodeStateUpdateRetryAfterMs;
      }
      throw error;
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

export {ReplicaDispatchServiceSegment1};
