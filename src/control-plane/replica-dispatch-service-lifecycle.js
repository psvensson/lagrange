import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  REPLICA_DISPATCH_STATE_PUBLICATION_METHODS,
} from './replica-dispatch-state-publication.js';
import {
  REPLICA_DISPATCH_DIRECT_WAKEUP_METHODS,
} from './replica-dispatch-direct-wakeup.js';

const {
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_EVENT,
  ConfigurationManager,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_READY_LEASE_MS,
  DISPATCH_DEFAULT,
  DISPATCH_ERROR_MSG,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
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
  SYSTEM_TABLE_NAME,
  WORKFLOW_STEP,
  assertCritical,
  createControlPlaneRuntimeBundle,
  getControlPlaneMessageRequiredTables,
  getControlPlaneMessageCompletionKind,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const READINESS_PLANNING_SNAPSHOT_TOKEN_CONTEXT_FIELD =
  'readinessPlanningSnapshotTokenKey';

function isNodeReadyRetryErrorRetryable() {
  return true;
}

function getNodeReadyRetryAfterMs() {
  return DISPATCH_DEFAULT.NODE_READY_RETRY_AFTER_MS;
}

function shouldResetNodeReadyRetryAttempts(previousContext, nextContext) {
  const previousToken = previousContext?.[
    READINESS_PLANNING_SNAPSHOT_TOKEN_CONTEXT_FIELD
  ];
  const nextToken = nextContext?.[
    READINESS_PLANNING_SNAPSHOT_TOKEN_CONTEXT_FIELD
  ];
  return typeof nextToken === 'string' && nextToken !== previousToken;
}

class ReplicaDispatchServiceLifecycle extends EventEmitter {
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
    // Node-owned readiness service: resolve from the coordinator container
    // before constructing (quest single-readiness-owner); a private instance
    // exists only for standalone/unit composition without a container.
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      this.rebalanceCoordinator?.controlPlaneReadinessService ||
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
    this.priorityDispatchInFlight = new Set();
    this.retryInFlightNodes = new Set();
    this.nodeStateUpdateWatermarks = new Map();
    // Retained per-node high-water boot incarnation: lets the missing-row
    // upsert path fence a stale-incarnation writer even when the durable row
    // (and its boot_incarnation column) is not yet visible to this receiver.
    this.nodeBootIncarnationWatermarks = new Map();
    this.nodeReadyRetryWatermarks = new Map();
    this.readinessPlanningSnapshotTokenByOwnerKey = new Map();
    this.readinessPlanningSnapshotPendingTokenByOwnerKey = new Map();
    this.dispatchFailureSignaturesByOperationId = new Map();
    this.operationDispatchDeferredRetries = new Map();
    this.directDispatchWakeupsInFlight = new Map();
    this.nodeStateUpdateDeferredRetries = new Map();
    this.membershipPublicationAckDeferredRetries = new Map();
    this.nodeStateUpdateRetryStateByNodeId = new Map();
    this.nodeStateUpdateQueueAssignments = new Map();
    this.nextNodeStateUpdateQueueIndex = 0;
    this.cacheChangeListener = null;
    this.readinessPlanningSnapshotUnsubscribe = null;
    this.coordinatorOperationCreatedListener = null;
    this.state = DISPATCH_STATE.CREATED;
    this.setTimeoutFn =
      typeof options.setTimeoutFn === 'function' ?
        options.setTimeoutFn :
        setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === 'function' ?
        options.clearTimeoutFn :
        clearTimeout;
    const config = ConfigurationManager.getInstance();
    this.readyLeaseMs =
      config.get(CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS) ||
      DEFAULT_READY_LEASE_MS;
    this.nodeStateUpdateQueryTimeoutMs = Math.max(
      1,
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
    this.priorityControlPlaneDispatchMaxInFlight =
      this.normalizePriorityControlPlaneDispatchMaxInFlight(
        options.priorityControlPlaneDispatchMaxInFlight,
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
    this.nodeStateUpdateQueue = this.nodeStateUpdateQueues[0];

    this.nodeReadyRetryQueue = new OwnerKeyReconcileQueue({
      name: DISPATCH_QUEUE_NAME.NODE_READY,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
      retryPolicy: {
        isRetryableError: isNodeReadyRetryErrorRetryable,
        getRetryAfterMs: getNodeReadyRetryAfterMs,
        shouldResetAttempts: shouldResetNodeReadyRetryAttempts,
        maxAttempts: DISPATCH_DEFAULT.NODE_READY_RETRY_MAX_ATTEMPTS,
      },
      reconcileFn: (ownerKey, _reasons, context) =>
        this.reconcileNodeReadyRetry(ownerKey, context),
    });
    this.membershipPublicationAdvanceQueue = new OwnerKeyReconcileQueue({
      name: DISPATCH_QUEUE_NAME.MEMBERSHIP_PUBLICATION_ADVANCE,
      reconcileFn: (ownerKey, _reasons, context) =>
        this.reconcileLocalReadyNodeMembershipPublicationAdvance(
          ownerKey,
          context,
        ),
    });
  }

  subscribeToReadinessPlanningSnapshots() {
    if (
      typeof this.controlPlaneReadinessService
        ?.subscribeReadinessPlanningSnapshots !== 'function'
    ) {
      return;
    }
    this.readinessPlanningSnapshotUnsubscribe =
      this.controlPlaneReadinessService.subscribeReadinessPlanningSnapshots(
        (event) => this.handleReadinessPlanningSnapshotPublished(event),
      );
  }

  handleReadinessPlanningSnapshotPublished(event = {}) {
    const nodeId = event?.ownerKey;
    if (!nodeId) {
      return;
    }
    const tokenKey = typeof event?.capturedToken?.tokenKey === 'string' ?
      event.capturedToken.tokenKey :
      null;
    if (
      tokenKey &&
      (this.readinessPlanningSnapshotTokenByOwnerKey.get(nodeId) === tokenKey ||
      this.readinessPlanningSnapshotPendingTokenByOwnerKey.get(nodeId) ===
        tokenKey)
    ) {
      return;
    }
    this.nodeReadyRetryQueue.enqueue(
      nodeId,
      RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED,
      {
        source: RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED,
        [READINESS_PLANNING_SNAPSHOT_TOKEN_CONTEXT_FIELD]: tokenKey,
      },
    );
    if (tokenKey) {
      this.readinessPlanningSnapshotPendingTokenByOwnerKey.set(
        nodeId,
        tokenKey,
      );
    }
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
      typeof this.systemTableCache.get === 'function',
      DISPATCH_ERROR_MSG.MISSING_CACHE_GET,
    );
    assertCritical(
      typeof this.systemTableCache.getAll === 'function',
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
      typeof this.systemTableCache.onCacheChange === 'function'
    ) {
      this.cacheChangeListener = (tableName, operation, record) => {
        this.handleCacheNodeChange(tableName, operation, record);
      };
      this.systemTableCache.onCacheChange(this.cacheChangeListener);
    }
    this.subscribeToReadinessPlanningSnapshots();

    if (
      this.messageRouter &&
      typeof this.messageRouter.register === 'function'
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
      typeof this.rebalanceCoordinator.on === 'function'
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

    this.enqueueCachedReadyNodeRetriesOnInitialize().catch((error) => {
      this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, {
        error: error?.message || String(error),
        source: REPLICA_DISPATCH_SERVICE_LITERAL.INITIALIZE,
      });
    });
    this.enqueueCachedReplicaOperationRetriesOnInitialize().catch((error) => {
      this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, {
        error: error?.message || String(error),
        source: REPLICA_DISPATCH_SERVICE_LITERAL.INITIALIZE,
      });
    });
  }

  /**
   * Replay already-ready cached nodes through the canonical ready-node queue.
   * Restart recovery can miss the original ready/cache trigger window, so
   * initialization must re-enter the same queue path instead of waiting for an
   * unrelated later heartbeat or cache update.
   * @private
   */
  async enqueueCachedReadyNodeRetriesOnInitialize() {
    const nodeRows = await this.getOwnerBackedSystemTableRowsFromCache(
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
  async enqueueCachedReplicaOperationRetriesOnInitialize() {
    const operationRows = await this.getOwnerBackedSystemTableRowsFromCache(
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

    const onMessageReceived = async (event) => {
      try {
        return await this.handleMessageReceived(messageGroupService, event);
      } catch (error) {
        this.logger.error(DISPATCH_LOG_MSG.MESSAGE_HANDLING_FAILED, {
          error: error.message,
          groupId: messageGroupService.groupId,
        });
        throw error;
      }
    };

    const onCdcApplied = (event) => {
      this.handleCdcApplied(messageGroupService, event).catch((error) => {
        this.logger.error(DISPATCH_LOG_MSG.CDC_HANDLING_FAILED, {
          error: error.message,
          groupId: messageGroupService.groupId,
        });
      });
    };

    const ownsApplicationCompletion =
      typeof messageGroupService.registerApplicationMessageCompletionHandler ===
        'function';
    const ownedMessageTypes = Object.values(ControlPlaneMessageType);
    if (ownsApplicationCompletion) {
      messageGroupService.registerApplicationMessageCompletionHandler(
        ownedMessageTypes,
        onMessageReceived,
      );
    } else {
      messageGroupService.on(
        CONTROL_PLANE_EVENT.MESSAGE_RECEIVED,
        onMessageReceived,
      );
    }
    messageGroupService.on(CONTROL_PLANE_EVENT.CDC_APPLIED, onCdcApplied);

    this.messageGroupServices.add(messageGroupService);
    this.messageGroupHandlers.set(messageGroupService, {
      onMessageReceived,
      onCdcApplied,
      ownsApplicationCompletion,
      ownedMessageTypes,
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

    const completionKind = getControlPlaneMessageCompletionKind(payload.type);
    const completion = () => ({completionKind, completionCompleted: true});

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
          typeof mgService.acknowledgeMessage === 'function'
        ) {
          await mgService.acknowledgeMessage(messageId);
        }
        return completion();
      }
      await this.enqueueNodeStateUpdateAndWait(payload);
      if (
        messageId &&
        typeof mgService.acknowledgeMessage === 'function'
      ) {
        await mgService.acknowledgeMessage(messageId);
      }
      return completion();
    }

    if (!mgService.isLeaderReplica()) {
      await this.forwardToLeader(mgService, payload);
      return completion();
    }

    if (payload.type === ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH) {
      await this.handleReplicaOperationDispatch(payload);
    }

    if (messageId && typeof mgService.acknowledgeMessage === 'function') {
      await mgService.acknowledgeMessage(messageId);
    }
    return completion();
  }

  resolveControlPlaneMessageRequiredTables(payload) {
    return getControlPlaneMessageRequiredTables(payload?.type);
  }

  resolveMessageGroupIngressReadiness(mgService, requiredTables = []) {
    if (
      !mgService ||
      typeof mgService.getMetadataIngressReadiness !== 'function'
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
        typeof readiness?.reason === 'string' &&
        readiness.reason.length > 0 ?
          readiness.reason :
          null,
      retryAfterMs:
        Number.isFinite(readiness?.retryAfterMs) &&
        readiness.retryAfterMs > 0 ?
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
      'function'
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
    if (!mgService || typeof mgService !== 'object') {
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
      'function'
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
      selection.retryAfterMs > 0 ?
        selection.retryAfterMs :
        Number.isFinite(selection?.strictForwardRetryAfterMs) &&
            selection.strictForwardRetryAfterMs > 0 ?
          selection.strictForwardRetryAfterMs :
          null;
    return this.buildMessageGroupIngressDecision(
      selectionAction,
      {
        ready: selection?.ready === true,
        reason:
          typeof selection?.reason === 'string' ?
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
   * Extract durable startup-owned storage-budget fields from one node-state
   * payload. Heartbeat-only NODE_STATE_UPDATE messages omit these fields, so
   * this preserves budget ownership without letting routine heartbeats clear it.
   * @param {Object|null} nodeRow
   * @return {Object}
   * @private
  */
}

Object.defineProperties(
  ReplicaDispatchServiceLifecycle.prototype,
  Object.fromEntries(
    Object.entries({
      ...REPLICA_DISPATCH_STATE_PUBLICATION_METHODS,
      ...REPLICA_DISPATCH_DIRECT_WAKEUP_METHODS,
    }).map(
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

export {ReplicaDispatchServiceLifecycle};
