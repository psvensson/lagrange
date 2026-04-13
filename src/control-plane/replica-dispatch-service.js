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
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {
  createControlPlaneRuntimeBundle,
} from './control-plane-runtime-bundle.js';
import {
  OperationType,
  OPERATION_METADATA_KEY,
  getOperationMetadataObject,
  getOperationMetadataStringArray,
  isCoordinatorOwnedOperationType,
} from '../rebalancer/replica-status.js';
import {
  ReplicaOperationField,
} from '../rebalancer/replica-operation-constants.js';
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
import {
  unwrapRowReadResult,
} from './owners/system-metadata-owner-base.js';
import {
  shouldUseAuthoritativePriorityRecoveryRediscovery,
} from './priority-recovery-snapshot.js';
import {OwnerKeyReconcileQueue} from
  '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from
  '../workflow/reconcile-queue-constants.js';
const REPLICA_DISPATCH_SERVICE_LITERAL = Object.freeze({
  AUTHORITATIVE: "authoritative",
  AUTHORITATIVE_PRIORITY_RECOVERY_RETRY: "authoritative_priority_recovery_retry",
  BACKGROUND: "background",
  CLOSED: "closed",
  CONNECTION_TO_NODE: "Connection to node",
  CONTROL_PLANE_READINESS_REFRESH_TIMEOUT: "CONTROL_PLANE_READINESS_REFRESH_TIMEOUT",
  COORDINATOR_DOT_EVENT: "coordinator.event",
  CRITICAL: "critical",
  DEFERRED_RETRY_PENDING: "deferred_retry_pending",
  DELETE: "DELETE",
  DISPATCH_UNSUCCESSFUL: "dispatch_unsuccessful",
  DUPLICATE_READY_TRIGGER: "duplicate_ready_trigger",
  EMPTY_STRING: "",
  ERROR: "error",
  FAILED_TO_FORWARD_WRITE_TO_LEADER: "Failed to forward write to leader",
  FOUR: 4,
  MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY: "membership_publication_owner_dispatch_retry",
  MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE: "message-group ingress readiness unavailable",
  MESSAGE_TIMEOUT: "Message timeout",
  NO_CONNECTION_TO_NODE: "No connection to node",
  NODE_ROW_MISSING: "NODE_ROW_MISSING",
  NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED: "NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED",
  QUERY_ROUTING_FAILED: "Query routing failed",
  REPLICADISPATCHSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY: "ReplicaDispatchService requires controlPlaneSystemTableGateway",
  SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK: "SELECT * FROM nodes WHERE node_id = ?",
  SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK: "SELECT * FROM replica_operations WHERE operation_id = ?",
  STALE_AGAINST_EXISTING_ROW: "stale_against_existing_row",
  STALE_OR_DUPLICATE_ENQUEUE: "stale_or_duplicate_enqueue",
  TARGET_NODE_NOT_READY: "target_node_not_ready",
  THIRTY_ONE: 31,
  UNKNOWN: "unknown",
  UNSUPPORTED_DISPATCH_CONTROL_MESSAGE: "unsupported_dispatch_control_message",
  ZERO: 0,
});


const DISPATCH_READINESS_ERROR_CODE = Object.freeze({
  TARGET_NODE_NOT_READY: 'TARGET_NODE_NOT_READY',
  TARGET_NODE_READINESS_REFRESH_FAILED:
    'TARGET_NODE_READINESS_REFRESH_FAILED',
});

const DISPATCH_READINESS_ERROR_REASON = Object.freeze({
  AUTHORITATIVE_NODE_ROW_VISIBILITY_LAG:
    'authoritative_node_row_visibility_lag',
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE:
    'authoritative_row_source_unavailable',
  TARGET_NODE_READINESS_REFRESH_FAILED:
    'target_node_readiness_refresh_failed',
  UNKNOWN: 'unknown_error',
});

const DISPATCH_READINESS_MESSAGE = Object.freeze({
  CONTROL_PLANE_LEADER_NOT_READY:
    'Control-plane leader is not ready',
});

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
      options.controlPlaneSystemTableGateway ||
      (this.cdcIntegrationService || options.sqlQueryEngine ||
          options.systemTableCache || this.messageRouter ?
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
      loggingService.forSubsystem(DISPATCH_SUBSYSTEM) : console;

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
    this.operationDispatchQueue =
      this.buildOperationDispatchQueueFacade();

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

    if (this.messageRouter &&
        typeof this.messageRouter.register === TYPEOF.FUNCTION) {
      this.directDispatchServiceAddress =
        this.buildDirectDispatchServiceAddress(this.nodeId);
      if (this.directDispatchServiceAddress) {
        this.directDispatchServiceHandler = async (envelope = {}) => {
          const payload = envelope?.payload || {};
          if (payload.type !==
              ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH) {
            return {
              acknowledged: false,
              error: REPLICA_DISPATCH_SERVICE_LITERAL.UNSUPPORTED_DISPATCH_CONTROL_MESSAGE,
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

    if (this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.on === TYPEOF.FUNCTION) {
      this.coordinatorOperationCreatedListener = (event = {}) => {
        this.handleCoordinatorOperationCreated(event.operation)
          .catch((error) => {
            this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, {
              operationId: event?.operation?.operationId,
              error: error.message,
              source: REPLICA_DISPATCH_SERVICE_LITERAL.COORDINATOR_DOT_EVENT,
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
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE,
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

    this.enqueueReplicaOperationRow(
      event?.data,
      {
        pendingReason: RECONCILE_REASON.CDC_OPERATION_PENDING,
        replaceActiveReason: RECONCILE_REASON.CDC_REPLACE_ACTIVE,
      },
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
    if (this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId ===
          TYPEOF.FUNCTION) {
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
    if (!operation?.operationId ||
        !this.messageRouter ||
        typeof this.messageRouter.deliver !== TYPEOF.FUNCTION) {
      return;
    }
    const operationRow = this.buildOperationRowFromCoordinator(operation);
    const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
    const targetAddress =
      this.buildDirectDispatchServiceAddress(ownerNodeId);
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
    const previousWatermark = this.nodeStateUpdateWatermarks.get(nodeId) || null;
    if (!this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark)) {
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
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
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
          !isHeartbeatOnly &&
          wasNodeRecordReadyWhenWritten(existing, {
            requireActiveStatus: true,
          })) {
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
        this.buildNodeStateUpdateWriteOptions(nodeId, nextState, isHeartbeatOnly),
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

    const baseNodeAddress = payloadNodeAddress ||
      nodeRow?.[COLUMN.NODE_ADDRESS] ||
      existing?.[COLUMN.NODE_ADDRESS] ||
      STRING.UNKNOWN;

    if (isHeartbeatOnly === true) {
      return {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.NODE_ADDRESS]: baseNodeAddress,
        [COLUMN.CONNECTION_STATE]: nextState,
        [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
        [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      };
    }

    const payloadCapabilities = payload?.[ControlPlaneField.CAPABILITIES];
    const capabilities = Array.isArray(payloadCapabilities) ?
      JSON.stringify(payloadCapabilities) :
      (
        typeof payloadCapabilities === TYPEOF.STRING ?
          payloadCapabilities :
          (existing?.[COLUMN.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY)
      );

    return {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.NODE_ADDRESS]: baseNodeAddress,
      [COLUMN.CPU_CORES]: Number.isFinite(nodeRow?.[COLUMN.CPU_CORES]) ?
        nodeRow[COLUMN.CPU_CORES] :
        (existing?.[COLUMN.CPU_CORES] || NUM.ZERO),
      [COLUMN.MEMORY_MB]: Number.isFinite(nodeRow?.[COLUMN.MEMORY_MB]) ?
        nodeRow[COLUMN.MEMORY_MB] :
        (existing?.[COLUMN.MEMORY_MB] || NUM.ZERO),
      [COLUMN.DISK_GB]: Number.isFinite(nodeRow?.[COLUMN.DISK_GB]) ?
        nodeRow[COLUMN.DISK_GB] :
        (existing?.[COLUMN.DISK_GB] || NUM.ZERO),
      [COLUMN.CPU_USAGE_PERCENT]:
        Number.isFinite(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]) ?
          nodeRow[COLUMN.CPU_USAGE_PERCENT] :
          (existing?.[COLUMN.CPU_USAGE_PERCENT] || NUM.ZERO),
      [COLUMN.MEMORY_USAGE_PERCENT]:
        Number.isFinite(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]) ?
          nodeRow[COLUMN.MEMORY_USAGE_PERCENT] :
          (existing?.[COLUMN.MEMORY_USAGE_PERCENT] || NUM.ZERO),
      [COLUMN.DISK_USAGE_PERCENT]:
        Number.isFinite(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]) ?
          nodeRow[COLUMN.DISK_USAGE_PERCENT] :
          (existing?.[COLUMN.DISK_USAGE_PERCENT] || NUM.ZERO),
      [COLUMN.STATUS]:
        nextState === STATE.READY ?
          SERVICE_STATUS.ACTIVE :
          (
            typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
              nodeRow[COLUMN.STATUS].length > NUM.ZERO ?
              nodeRow[COLUMN.STATUS] :
              (existing?.[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE)
          ),
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
  ) {
    if (!baseRow || typeof baseRow !== TYPEOF.OBJECT) {
      return false;
    }
    if (existing?.[COLUMN.NODE_ID]) {
      return false;
    }
    if (nextState !== STATE.CONNECTED &&
        nextState !== STATE.READY) {
      return false;
    }
    const nodeAddress = String(baseRow?.[COLUMN.NODE_ADDRESS] || '').trim();
    if (nodeAddress.length === NUM.ZERO ||
        nodeAddress === STRING.UNKNOWN) {
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
        ),
      );
      if (upsertResult?.success === false) {
        const upsertError = new Error(
          `Failed to bootstrap missing node row from NODE_STATE_UPDATE: ` +
          String(
            upsertResult.error ||
              DISPATCH_READINESS_ERROR_REASON.UNKNOWN,
          ),
        );
        upsertError.code =
          upsertResult.error || REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED;
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
      if (error?.deferRetry === true ||
          isRetryableControlPlaneError(error)) {
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
    assertCritical(
      this.controlPlaneSystemTableGateway,
      REPLICA_DISPATCH_SERVICE_LITERAL.REPLICADISPATCHSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY,
    );
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Handle dispatch requests for replica operations.
   * @param {Object} payload - Dispatch payload.
   * @private
   */
  async handleReplicaOperationDispatch(payload) {
    const operationRow =
      payload?.[ControlPlaneField.OPERATION_ROW] &&
      typeof payload[ControlPlaneField.OPERATION_ROW] === TYPEOF.OBJECT ?
        payload[ControlPlaneField.OPERATION_ROW] :
        null;
    const operationId =
      payload[ControlPlaneField.OPERATION_ID] ||
      operationRow?.operation_id ||
      null;
    if (!operationId) {
      return;
    }

    this.operationDispatchQueue.enqueue(
      operationId,
      RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST,
      operationRow ? {row: operationRow} : undefined,
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

    const operationId = row.operation_id;
    if (!this.isReplicaOperationLocallyOwned(row)) {
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }

    const targetNodeId = row.target_node_id;
    const rowOperation = this.buildOperationFromRow(row);
    const dispatchReadiness = await this.captureDispatchReadiness(
      targetNodeId,
    );
    if (dispatchReadiness.error) {
      const readinessError =
        this.buildDispatchReadinessRefreshFailureError(
          targetNodeId,
          dispatchReadiness,
        );
      this.recordDispatchFailure({
        operationId,
        targetNodeId,
        workflowStep: row.workflow_step || null,
        skipped: true,
        reason:
          DISPATCH_READINESS_ERROR_REASON
            .TARGET_NODE_READINESS_REFRESH_FAILED,
        error: readinessError.message,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
      if (this.deferOperationDispatchRetry(
        operationId,
        readinessError,
        row,
      )) {
        return;
      }
      throw readinessError;
    }
    if (!dispatchReadiness.ready) {
      const readinessError = this.buildDispatchNotReadyError(
        targetNodeId,
        dispatchReadiness,
      );
      this.recordDispatchFailure({
        operationId,
        targetNodeId,
        workflowStep: row.workflow_step || null,
        skipped: true,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.TARGET_NODE_NOT_READY,
        error: readinessError.message,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
      if (this.deferOperationDispatchRetry(
        operationId,
        readinessError,
        row,
      )) {
        return;
      }
      return;
    }

    this.dispatchInFlight.add(operationId);
    try {
      let dispatchResult = null;
      if (typeof this.rebalanceCoordinator.dispatchOperation ===
          TYPEOF.FUNCTION) {
        dispatchResult = await this.rebalanceCoordinator.dispatchOperation(
          rowOperation,
        );
      } else {
        const claimedOperation = await this.rebalanceCoordinator
          .claimDispatchTransition(operationId);
        if (!claimedOperation) {
          this.logger.debug(DISPATCH_LOG_MSG.CLAIM_SKIPPED, {
            operationId,
            nodeId: this.nodeId,
          });
          return;
        }
        const operation = {
          ...claimedOperation,
        };
        if (!Array.isArray(operation.stepsHistory) &&
            Array.isArray(rowOperation.stepsHistory)) {
          operation.stepsHistory = rowOperation.stepsHistory;
        }
        if (!Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) &&
            Array.isArray(rowOperation[ReplicaOperationField.REPLICA_IDS])) {
          operation[ReplicaOperationField.REPLICA_IDS] =
            rowOperation[ReplicaOperationField.REPLICA_IDS];
        }
        if (!Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) &&
            Array.isArray(rowOperation[ReplicaOperationField.PEER_ADDRESSES])) {
          operation[ReplicaOperationField.PEER_ADDRESSES] =
            rowOperation[ReplicaOperationField.PEER_ADDRESSES];
        }
        dispatchResult = await this.rebalanceCoordinator
          .executeOperation(operation);
      }

      if (!dispatchResult || dispatchResult.success !== true) {
        if (this.deferOperationDispatchRetry(
          operationId,
          dispatchResult,
          row,
        )) {
          return;
        }
        this.recordDispatchFailure({
          operationId,
          targetNodeId,
          workflowStep: row.workflow_step || null,
          skipped: dispatchResult?.skipped === true,
          reason: dispatchResult?.reason || REPLICA_DISPATCH_SERVICE_LITERAL.DISPATCH_UNSUCCESSFUL,
          error: dispatchResult?.error || null,
          readinessSnapshot: dispatchReadiness.snapshot,
        });
        return;
      }

      this.clearDeferredOperationDispatchRetry(operationId);
      this.dispatchFailureSignaturesByOperationId.delete(operationId);

      this.emit(DISPATCH_EVENT.OPERATION_DISPATCHED, {
        operationId,
        targetNodeId,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
    } catch (error) {
      if (this.deferOperationDispatchRetry(
        operationId,
        error,
        row,
      )) {
        return;
      }
      throw error;
    } finally {
      this.dispatchInFlight.delete(operationId);
    }
  }

  /**
   * Build one retryable readiness-gate error for dispatch.
   * @param {string} targetNodeId
   * @param {string} message
   * @param {string} code
   * @param {number|null|undefined} retryAfterMs
   * @param {Error|null} [cause=null]
   * @return {Error}
   * @private
   */
  buildDispatchReadinessGateError(
    targetNodeId,
    message,
    code,
    retryAfterMs,
    cause = null,
  ) {
    const error = new Error(message);
    error.code = code;
    error.targetNodeId = targetNodeId || null;
    error.deferRetry = true;
    error.retryAfterMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
        retryAfterMs :
        this.operationDispatchRetryAfterMs;
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  /**
   * Build one readiness-refresh failure error.
   * @param {string} targetNodeId
   * @param {Object} dispatchReadiness
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshFailureError(targetNodeId, dispatchReadiness) {
    const originalError = dispatchReadiness?.error;
    const originalMessage =
      typeof originalError?.message === TYPEOF.STRING &&
        originalError.message.length > NUM.ZERO ?
        originalError.message :
          String(
            originalError ||
              DISPATCH_READINESS_ERROR_REASON.UNKNOWN,
          );
    const code =
      typeof originalError?.code === TYPEOF.STRING &&
        originalError.code.length > NUM.ZERO ?
        originalError.code :
        DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_READINESS_REFRESH_FAILED;
    return this.buildDispatchReadinessGateError(
      targetNodeId,
      `Target node ${targetNodeId || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN} readiness refresh failed: ` +
        originalMessage,
      code,
      dispatchReadiness?.retryAfterMs,
      originalError,
    );
  }

  /**
   * Build one target-not-ready error.
   * @param {string} targetNodeId
   * @param {Object} dispatchReadiness
   * @return {Error}
   * @private
   */
  buildDispatchNotReadyError(targetNodeId, dispatchReadiness) {
    return this.buildDispatchReadinessGateError(
      targetNodeId,
      `Target node ${targetNodeId || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN} is not ready for dispatch`,
      DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_NOT_READY,
      dispatchReadiness?.retryAfterMs,
    );
  }

  /**
   * Retry dispatches for operations targeting a ready node.
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
      const dispatchRows = await this.getDispatchRetryRowsForNode(nodeId);
      if (dispatchRows.length === NUM.ZERO) {
        return;
      }

      this.logger.info(DISPATCH_LOG_MSG.RETRY_PENDING_READY_NODE, {
        nodeId,
        pendingCount: dispatchRows.length,
      });

      for (const row of dispatchRows) {
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
   * Read dispatch-retry replica_operations for one target node.
   * Uses SystemTableCache first, then falls back to the authoritative
   * repository owner path when unresolved priority recovery indicates cache
   * visibility may be lagging.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Array<Object>>} Dispatchable operation rows.
   * @private
   */
  async getDispatchRetryRowsForNode(nodeId) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (membershipPublicationService &&
        typeof membershipPublicationService.getDispatchRetryRowsForNode ===
          TYPEOF.FUNCTION) {
      try {
        const dispatchRows = await membershipPublicationService
          .getDispatchRetryRowsForNode(nodeId);
        return Array.isArray(dispatchRows) ? dispatchRows : [];
      } catch (error) {
        this.logger.warn(
          DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED,
          {
            nodeId,
            error: error?.message || String(error),
            path: REPLICA_DISPATCH_SERVICE_LITERAL.MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY,
          },
        );
      }
    }

    const cacheRows = this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.listReplicaOperationsFromCache ===
        TYPEOF.FUNCTION ?
      (await this.replicaOperationsOwner.listReplicaOperationsFromCache())
        .rows || [] :
      this.getSystemTableRowsFromCache(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      );
    const dispatchRows = cacheRows.filter((row) => {
      return isCoordinatorOwnedOperationType(row?.type) &&
        this.isReplicaOperationLocallyOwned(row) &&
        row?.target_node_id === nodeId &&
        (row?.workflow_step === WORKFLOW_STEP.PENDING ||
          row?.workflow_step === WORKFLOW_STEP.SENDING);
    });
    if (dispatchRows.length > NUM.ZERO) {
      return dispatchRows;
    }

    if (!await this.shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId)) {
      return dispatchRows;
    }

    return this.getAuthoritativeDispatchRetryRowsForNode(nodeId);
  }

  /**
   * Compatibility alias for older tests/callers. Ready-node retry now
   * re-enters both PENDING and SENDING rows, but the historical method name
   * is kept to avoid a second compatibility seam.
   *
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   */
  async getPendingReplicaOpsForNode(nodeId) {
    return this.getDispatchRetryRowsForNode(nodeId);
  }

  /**
   * Decide whether ready-node retry should bypass cache-only rediscovery for
   * unresolved priority control-plane recovery.
   * @param {string} nodeId
   * @return {Promise<boolean>}
   * @private
   */
  async shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId) {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return false;
    }

    try {
      return shouldUseAuthoritativePriorityRecoveryRediscovery(
        nodeId,
        {
          cacheVisible: false,
          publicationConvergence:
            await this.resolvePriorityRecoveryPublicationConvergence(
              readinessService,
              nodeId,
            ),
        },
      );
    } catch (error) {
      this.logger.warn(
        DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_REFRESH_FAILED,
        {
          nodeId,
          error: error?.message || String(error),
        },
      );
      return false;
    }
  }

  /**
   * Resolve one publication-convergence snapshot for priority-recovery
   * rediscovery.
   * @param {Object} readinessService
   * @param {string} nodeId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolvePriorityRecoveryPublicationConvergence(
    readinessService,
    nodeId,
  ) {
    if (typeof readinessService.getMembershipPublicationDiagnosticsSync ===
        TYPEOF.FUNCTION) {
      const syncDiagnostics =
        readinessService.getMembershipPublicationDiagnosticsSync(
          nodeId,
          Date.now(),
        );
      if (syncDiagnostics) {
        return syncDiagnostics;
      }
    }
    if (typeof readinessService.getMembershipPublicationDiagnostics ===
        TYPEOF.FUNCTION) {
      return readinessService.getMembershipPublicationDiagnostics(
        nodeId,
        Date.now(),
      );
    }
    return null;
  }

  /**
   * Read dispatch-retry operations through the canonical repository owner path
   * when cache coverage is missing under priority recovery.
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeDispatchRetryRowsForNode(nodeId) {
    const repository = this.rebalanceCoordinator?.repository || null;
    if (!repository ||
        typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION) {
      return [];
    }

    try {
      const operations = await repository.queryIncompleteOperations({
        preferAuthoritativeRead: true,
      });
      if (!Array.isArray(operations) || operations.length === NUM.ZERO) {
        return [];
      }

      return operations
        .filter((operation) => {
          return isCoordinatorOwnedOperationType(operation?.type) &&
            this.isReplicaOperationLocallyOwned(operation) &&
            operation?.targetNodeId === nodeId &&
            (operation?.workflowStep === WORKFLOW_STEP.PENDING ||
              operation?.workflowStep === WORKFLOW_STEP.SENDING);
        })
        .map((operation) => this.buildOperationRowFromCoordinator(operation));
    } catch (error) {
      this.logger.warn(
        DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED,
        {
          nodeId,
          error: error?.message || String(error),
          path: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE_PRIORITY_RECOVERY_RETRY,
        },
      );
      return [];
    }
  }

  /**
   * Check whether one replica operation row is owned by this node.
   * Ready-node retries must only re-enter operations through the canonical
   * owner, even though replica_operations rows are globally replicated.
   * @param {Object} operation - Replica operation row or object.
   * @return {boolean}
   * @private
   */
  isReplicaOperationLocallyOwned(operation) {
    if (!operation || typeof operation !== TYPEOF.OBJECT) {
      return false;
    }
    if (this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.isOperationLocallyOwned ===
          TYPEOF.FUNCTION) {
      return this.rebalanceCoordinator.isOperationLocallyOwned(operation);
    }
    if (this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId ===
          TYPEOF.FUNCTION) {
      return this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation) ===
        this.nodeId;
    }
    return String(
      operation?.sourceNodeId || operation?.source_node_id || REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
    ) === this.nodeId;
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
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.DUPLICATE_READY_TRIGGER,
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
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }
    if (!isCoordinatorOwnedOperationType(row.type)) {
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }

    try {
      if (row.type === OperationType.REPLACE &&
          row.workflow_step === WORKFLOW_STEP.ACTIVE) {
        this.clearDeferredOperationDispatchRetry(operationId);
        const operation = this.buildOperationFromRow(row);
        if (typeof this.rebalanceCoordinator.dispatchOperation ===
          TYPEOF.FUNCTION) {
          await this.rebalanceCoordinator.dispatchOperation(operation);
        } else {
          await this.rebalanceCoordinator.executeOperation(operation);
        }
        return;
      }

      if (row.workflow_step !== WORKFLOW_STEP.PENDING &&
          row.workflow_step !== WORKFLOW_STEP.SENDING) {
        this.clearDeferredOperationDispatchRetry(operationId);
        return;
      }

      await this.dispatchOperationRow(row);
    } catch (error) {
      if (this.deferOperationDispatchRetry(
        operationId,
        error,
        row,
      )) {
        return;
      }
      throw error;
    }
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
    const operation = typeof operationOrRecord === TYPEOF.STRING ?
      operationOrRecord :
      null;
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

    if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      if (operation === REPLICA_DISPATCH_SERVICE_LITERAL.DELETE) {
        return;
      }
      this.enqueueReplicaOperationRow(
        record,
        {
          pendingReason: RECONCILE_REASON
            .REPLICA_OPERATIONS_CACHE_PENDING,
          replaceActiveReason: RECONCILE_REASON
            .REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE,
        },
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
   * Enqueue a locally owned replica operation row for dispatch reconciliation.
   * Cache and CDC visibility can arrive on different nodes or at different
   * times, so both paths must converge on the same local-owner gate. SENDING
   * rows remain replayable because retryable dispatch failures deliberately
   * park persisted workflow state in SENDING until the owner re-arms it.
   * @param {Object} row - Replica operation row.
   * @param {Object} reasons - Reconcile reason overrides.
   * @param {string} reasons.pendingReason - Reason for pending rows.
   * @param {string} reasons.replaceActiveReason - Reason for active REPLACE rows.
   * @return {boolean} True when a reconcile item was enqueued.
   * @private
   */
  enqueueReplicaOperationRow(row, reasons) {
    if (!row || !row.operation_id) {
      return false;
    }
    if (!isCoordinatorOwnedOperationType(row.type) ||
        !this.isReplicaOperationLocallyOwned(row)) {
      return false;
    }

    if (row.type === OperationType.REPLACE &&
        row.workflow_step === WORKFLOW_STEP.ACTIVE) {
      this.operationDispatchQueue.enqueue(
        row.operation_id,
        reasons.replaceActiveReason,
        {row},
      );
      return true;
    }

    if (row.workflow_step !== WORKFLOW_STEP.PENDING &&
        row.workflow_step !== WORKFLOW_STEP.SENDING) {
      return false;
    }

    this.operationDispatchQueue.enqueue(
      row.operation_id,
      reasons.pendingReason,
      {row},
    );
    return true;
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
    return compareNodeHeartbeatWatermarks(previous, next) > REPLICA_DISPATCH_SERVICE_LITERAL.ZERO;
  }

  /**
   * Normalize operation-dispatch queue shard count to a safe positive integer.
   * One blocked operation reconcile must not head-of-line block unrelated
   * operation ids on the same node.
   *
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeOperationDispatchQueueShardCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_QUEUE_SHARD_COUNT;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
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
      return REPLICA_DISPATCH_SERVICE_LITERAL.FOUR;
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
   * Normalize one retry-after default for deferred replica dispatch retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeOperationDispatchRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_RETRY_AFTER_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Keep dispatch readiness refresh bounded so one slow authoritative read
   * cannot head-of-line block the owner queue while sync recovery evidence is
   * already available locally.
   *
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeDispatchReadinessRefreshTimeoutMs(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(numeric));
    }
    return Math.max(
      this.operationDispatchRetryAfterMs,
      DISPATCH_DEFAULT.OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS,
    );
  }

  /**
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveOperationDispatchRetryAfterMs(errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(retryAfterMs));
    }
    return this.operationDispatchRetryAfterMs;
  }

  /**
   * @param {string} nodeId
   * @param {number} timeoutMs
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs) {
    const error = new Error(
      'Message timeout while refreshing readiness for dispatch target ' +
      String(nodeId || 'unknown') +
      ' after ' +
      String(timeoutMs) +
      'ms',
    );
    error.code = REPLICA_DISPATCH_SERVICE_LITERAL.CONTROL_PLANE_READINESS_REFRESH_TIMEOUT;
    error.retryAfterMs = this.operationDispatchRetryAfterMs;
    error.deferRetry = true;
    error.targetNodeId = nodeId || null;
    return error;
  }

  /**
   * Bound one authoritative readiness refresh so dispatch progression can fall
   * back to the already-visible sync snapshot instead of stalling indefinitely.
   *
   * @param {string} nodeId
   * @param {string} decisionDimension
   * @return {Promise<Object|null>}
   * @private
   */
  async getBoundedDispatchReadiness(nodeId, decisionDimension) {
    if (typeof this.controlPlaneReadinessService.getNodeReadiness !==
        TYPEOF.FUNCTION) {
      return null;
    }

    const timeoutMs = this.dispatchReadinessRefreshTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      return this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
        allowAuthoritativeRefresh: true,
        decisionDimension,
        maxCachedAgeMs: NUM.ZERO,
      });
    }

    let timeoutHandle = null;
    try {
      return await Promise.race([
        this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
          allowAuthoritativeRefresh: true,
          decisionDimension,
          maxCachedAgeMs: NUM.ZERO,
        }),
        new Promise((_resolve, reject) => {
          timeoutHandle = this.setTimeoutFn(() => {
            reject(
              this.buildDispatchReadinessRefreshTimeoutError(
                nodeId,
                timeoutMs,
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        this.clearTimeoutFn(timeoutHandle);
      }
    }
  }

  /**
   * Defer one retryable operation-dispatch failure onto the existing owner queue.
   * @param {string} operationId
   * @param {*} errorLike
   * @param {Object|null} [row=null]
   * @return {boolean}
   * @private
   */
  deferOperationDispatchRetry(operationId, errorLike, row = null) {
    if (!operationId || !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    const retryAfterMs =
      this.resolveOperationDispatchRetryAfterMs(errorLike);
    const desiredAttemptAt = Date.now() + retryAfterMs;
    const errorMessage =
      errorLike?.message ||
      errorLike?.error ||
      null;
    const existing =
      this.operationDispatchDeferredRetries.get(operationId);
    if (existing) {
      existing.errorMessage = errorMessage;
      if (row) {
        existing.row = this.cloneDeferredOperationDispatchRow(row);
      }
      if (desiredAttemptAt < existing.nextAttemptAt) {
        if (existing.timeoutHandle) {
          this.clearTimeoutFn(existing.timeoutHandle);
        }
        existing.nextAttemptAt = desiredAttemptAt;
        existing.timeoutHandle = this.armDeferredOperationDispatchRetry(
          operationId,
          retryAfterMs,
        );
      }
      return true;
    }

    const deferredRetry = {
      errorMessage,
      nextAttemptAt: desiredAttemptAt,
      row: row ? this.cloneDeferredOperationDispatchRow(row) : null,
      timeoutHandle: this.armDeferredOperationDispatchRetry(
        operationId,
        retryAfterMs,
      ),
    };
    this.operationDispatchDeferredRetries.set(operationId, deferredRetry);
    this.logger.info(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED, {
      nodeId: this.nodeId,
      operationId,
      retryAfterMs,
      error: errorMessage,
    });
    return true;
  }

  /**
   * @param {string} operationId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredOperationDispatchRetry(operationId, delayMs) {
    return this.setTimeoutFn(() => {
      const deferredRetry =
        this.operationDispatchDeferredRetries.get(operationId);
      if (!deferredRetry) {
        return;
      }
      this.operationDispatchDeferredRetries.delete(operationId);
      const row = deferredRetry?.row ?
        this.cloneDeferredOperationDispatchRow(deferredRetry.row) :
        null;
      this.operationDispatchQueue.enqueue(
        operationId,
        RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        row ? {row} : undefined,
      );
      this.logger.debug(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED_RETRY, {
        nodeId: this.nodeId,
        operationId,
        retryAfterMs: delayMs,
      });
    }, delayMs);
  }

  /**
   * Preserve one dispatchable replica_operations row across deferred retries so
   * direct wake-up payloads can survive until cache visibility converges.
   * @param {Object|null} row
   * @return {Object|null}
   * @private
   */
  cloneDeferredOperationDispatchRow(row) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return null;
    }
    return {
      ...row,
    };
  }

  /**
   * @param {string} operationId
   * @return {void}
   * @private
   */
  clearDeferredOperationDispatchRetry(operationId) {
    const deferredRetry =
      this.operationDispatchDeferredRetries.get(operationId);
    if (!deferredRetry) {
      return;
    }
    if (deferredRetry.timeoutHandle) {
      this.clearTimeoutFn(deferredRetry.timeoutHandle);
    }
    this.operationDispatchDeferredRetries.delete(operationId);
  }

  /**
   * Build canonical write options for NODE_STATE_UPDATE persistence.
   * @param {string} nodeId
   * @param {string} nextState
   * @param {boolean} [isHeartbeatOnly=false]
   * @return {Object}
   * @private
   */
  buildNodeStateUpdateWriteOptions(nodeId, nextState, isHeartbeatOnly = false) {
    const isReady = nextState === STATE.READY;
    const isHeartbeatOnlyUpdate = isHeartbeatOnly === true;
    return {
      allowCoalescing: true,
      allowPressureDefer: isHeartbeatOnlyUpdate || !isReady,
      coalescingKey: `node-state:${nodeId}`,
      deliveryPriority: isHeartbeatOnlyUpdate || !isReady ? REPLICA_DISPATCH_SERVICE_LITERAL.BACKGROUND :
        REPLICA_DISPATCH_SERVICE_LITERAL.CRITICAL,
      pressureRetryAfterMs: this.nodeStateUpdateRetryAfterMs,
      queryTimeoutMs: this.nodeStateUpdateQueryTimeoutMs,
      skipCacheWait: true,
      workClass: isHeartbeatOnlyUpdate || !isReady ?
        PRESSURE_WORK_CLASS.BACKGROUND :
        PRESSURE_WORK_CLASS.CRITICAL,
    };
  }

  resolveMembershipPublicationService() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return null;
    }
    const membershipPublicationService =
      readinessService.membershipPublicationService;
    return membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT ?
      membershipPublicationService :
      null;
  }

  /**
   * READY node-state updates must re-enter the canonical publication owner
   * queue so cluster publication convergence advances through the durable
   * control-plane writer rather than only via later read-time repair.
   *
   * @param {string} reason
   * @param {Object} [context={}]
   * @return {boolean}
   * @private
   */
  enqueueMembershipPublicationReconcile(reason, context = {}) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (!membershipPublicationService ||
        typeof membershipPublicationService.enqueueClusterMembershipReconcile !==
          TYPEOF.FUNCTION) {
      return false;
    }
    membershipPublicationService.enqueueClusterMembershipReconcile(
      reason,
      context,
    );
    return true;
  }

  async acknowledgeMembershipPublicationForNode(nodeId) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (!membershipPublicationService ||
        typeof membershipPublicationService.acknowledgeMembershipPublicationForNode !==
          TYPEOF.FUNCTION) {
      return null;
    }

    try {
      return await membershipPublicationService
        .acknowledgeMembershipPublicationForNode(nodeId);
    } catch (error) {
      this.logger.warn(
        DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_FAILED,
        {
          nodeId,
          error: error?.message || String(error),
        },
      );
      return null;
    }
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
    if (error?.deferRetry === true) {
      return true;
    }
    if (error?.code === REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > NUM.ZERO) {
      return true;
    }
    if (isRetryableControlPlaneError(error)) {
      return true;
    }
    const message = error?.message || String(error);
    if (typeof this.cdcIntegrationService?.isTransientCdcError ===
      TYPEOF.FUNCTION &&
      this.cdcIntegrationService.isTransientCdcError(message)) {
      return true;
    }
    return (
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) &&
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED)
    ) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_TIMEOUT);
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
   * Build one queue name for an operation-dispatch shard.
   * @param {number} shardIndex - Zero-based shard index.
   * @return {string}
   * @private
   */
  buildOperationDispatchQueueName(shardIndex) {
    if (this.operationDispatchQueueShardCount <= NUM.ONE) {
      return DISPATCH_QUEUE_NAME.OPERATION;
    }
    return `${DISPATCH_QUEUE_NAME.OPERATION}-${shardIndex}`;
  }

  /**
   * Resolve one reconcile shard for an operation-dispatch owner key.
   * Distinct operation ids may progress concurrently, while each owner key
   * still remains single-flight inside its assigned shard.
   *
   * @param {string} ownerKey - Operation owner key.
   * @return {OwnerKeyReconcileQueue}
   * @private
   */
  resolveOperationDispatchQueue(ownerKey) {
    if (!Array.isArray(this.operationDispatchQueues) ||
        this.operationDispatchQueues.length <= NUM.ONE) {
      return Array.isArray(this.operationDispatchQueues) &&
        this.operationDispatchQueues.length === NUM.ONE ?
        this.operationDispatchQueues[NUM.ZERO] :
        this.operationDispatchQueue;
    }

    const normalizedOwnerKey =
      typeof ownerKey === TYPEOF.STRING ?
        ownerKey :
        String(ownerKey || '');
    let hash = NUM.ZERO;
    for (const char of normalizedOwnerKey) {
      hash = ((hash * REPLICA_DISPATCH_SERVICE_LITERAL.THIRTY_ONE) + char.charCodeAt(NUM.ZERO)) >>> NUM.ZERO;
    }
    const queueIndex = hash % this.operationDispatchQueues.length;
    return this.operationDispatchQueues[queueIndex];
  }

  /**
   * Expose one compatibility queue facade while routing distinct operation ids
   * across dedicated shards under the hood.
   *
   * Tests and diagnostics still observe `operationDispatchQueue`, but one
   * slow operation reconcile can no longer stall every other owner key.
   *
   * @return {Object}
   * @private
   */
  buildOperationDispatchQueueFacade() {
    return {
      enqueue: (ownerKey, reason, context, options) =>
        this.resolveOperationDispatchQueue(ownerKey)
          .enqueue(ownerKey, reason, context, options),
      shutdown: () => {
        for (const queue of this.operationDispatchQueues) {
          queue.shutdown();
        }
      },
      get size() {
        return this.operationDispatchQueues.reduce((sum, queue) =>
          sum + queue.size, NUM.ZERO);
      },
      get draining() {
        return this.operationDispatchQueues.some((queue) =>
          queue.draining === true);
      },
      operationDispatchQueues: this.operationDispatchQueues,
    };
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
    const operation = {
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
    const replicaIds = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.REPLICA_IDS,
    );
    if (replicaIds.length > NUM.ZERO) {
      operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;
    }
    const peerAddresses = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.PEER_ADDRESSES,
    );
    if (peerAddresses.length > NUM.ZERO) {
      operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
    }
    const bootstrapTableMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA,
    );
    if (bootstrapTableMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
        bootstrapTableMetadata;
    }
    const bootstrapPartitionMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
    );
    if (bootstrapPartitionMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] =
        bootstrapPartitionMetadata;
    }
    return operation;
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
   * Dispatch is internal control-plane progression, so readiness gating uses
   * recovery eligibility to avoid deadlocking on publication convergence.
   *
   * @return {string}
   * @private
   */
  resolveDispatchReadinessDecisionDimension() {
    return CONTROL_PLANE_READINESS_DIMENSION
      .CONTROL_PLANE_RECOVERY_ELIGIBLE;
  }

  /**
   * Check readiness eligibility for one decision dimension.
   * Falls back to repairEligible only when legacy snapshots do not expose
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions = readiness?.dimensions &&
      typeof readiness.dimensions === TYPEOF.OBJECT ?
      readiness.dimensions :
      null;
    if (!dimensions) {
      return false;
    }
    if (dimensions[decisionDimension] === true) {
      return true;
    }
    if (decisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE) {
      return false;
    }
    if (Object.hasOwn(dimensions, decisionDimension)) {
      return false;
    }
    return dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] ===
      true;
  }

  /**
   * Allow control-plane recovery dispatch to reuse the already visible sync
   * readiness snapshot when the bounded authoritative refresh path fails for a
   * retryable reason. This keeps critical recovery progressing under transient
   * control-plane pressure without widening dispatch eligibility beyond the
   * canonical recovery-eligible snapshot already in hand.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */
  shouldUseSyncDispatchReadinessFallback(
    readiness,
    decisionDimension,
    error,
  ) {
    if (decisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE) {
      return false;
    }
    if (!this.isReadinessDimensionSatisfied(readiness, decisionDimension)) {
      return false;
    }
    if (!isRetryableControlPlaneError(error)) {
      return false;
    }
    return true;
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

    const decisionDimension =
      this.resolveDispatchReadinessDecisionDimension();
    const readiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
        decisionDimension:
          decisionDimension,
      });
    return this.isReadinessDimensionSatisfied(
      readiness,
      decisionDimension,
    );
  }

  /**
   * Capture readiness snapshot for a dispatch decision.
   * Returns both the ready/not-ready verdict and the compact
   * snapshot summary for persistence in diagnostics.
   *
   * @param {string} nodeId - Target node ID.
   * @return {Promise<{
   *   ready: boolean,
   *   snapshot: Object|null,
   *   retryAfterMs: number|null,
   *   error?: Error,
   * }>}
   * @private
   */
  async captureDispatchReadiness(nodeId) {
    if (!nodeId) {
      return this.buildDispatchReadinessResult(
        null,
        null,
        {
          ready: false,
          snapshot: null,
          retryAfterMs: null,
        },
      );
    }
    const decisionDimension =
      this.resolveDispatchReadinessDecisionDimension();
    let readiness = null;
    if (typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
        TYPEOF.FUNCTION) {
      readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
        decisionDimension,
      });
    }
    if (typeof this.controlPlaneReadinessService.getNodeReadiness ===
        TYPEOF.FUNCTION) {
      try {
        const authoritativeReadiness =
          await this.getBoundedDispatchReadiness(
            nodeId,
            decisionDimension,
          );
        if (authoritativeReadiness &&
            typeof authoritativeReadiness === TYPEOF.OBJECT) {
          readiness = authoritativeReadiness;
        }
      } catch (error) {
        if (this.shouldUseSyncDispatchReadinessFallback(
          readiness,
          decisionDimension,
          error,
        )) {
          const retryAfterMs =
            Number.isFinite(readiness?.retryAfterMs) &&
              readiness.retryAfterMs > NUM.ZERO ?
              Math.floor(readiness.retryAfterMs) :
              null;
          return this.buildDispatchReadinessResult(
            readiness,
            decisionDimension,
            {
              ready: true,
              retryAfterMs,
            },
          );
        }
        return this.buildDispatchReadinessResult(
          readiness,
          decisionDimension,
          {
            ready: false,
            retryAfterMs:
              this.resolveOperationDispatchRetryAfterMs(error),
            error,
          },
        );
      }
    }
    return this.buildDispatchReadinessResult(
      readiness,
      decisionDimension,
    );
  }

  /**
   * Build one dispatch-readiness result object.
   * @param {Object|null} readiness
   * @param {string|null} decisionDimension
   * @param {Object} [overrides={}]
   * @return {{
   *   ready: boolean,
   *   snapshot: Object|null,
   *   retryAfterMs: number|null,
   *   error?: Error,
   * }}
   * @private
   */
  buildDispatchReadinessResult(
    readiness,
    decisionDimension,
    overrides = {},
  ) {
    const snapshot =
      Object.prototype.hasOwnProperty.call(overrides, 'snapshot') ?
        overrides.snapshot :
        ControlPlaneReadinessService.compactSnapshotSummary(
          readiness,
          decisionDimension,
        );
    const retryAfterMs =
      Object.prototype.hasOwnProperty.call(overrides, 'retryAfterMs') ?
        overrides.retryAfterMs :
        (Number.isFinite(readiness?.retryAfterMs) &&
          readiness.retryAfterMs > NUM.ZERO ?
          Math.floor(readiness.retryAfterMs) :
          null);
    const result = {
      ready:
        Object.prototype.hasOwnProperty.call(overrides, 'ready') ?
          overrides.ready :
          this.isReadinessDimensionSatisfied(
            readiness,
            decisionDimension,
          ),
      snapshot,
      retryAfterMs,
    };
    if (Object.prototype.hasOwnProperty.call(overrides, REPLICA_DISPATCH_SERVICE_LITERAL.ERROR)) {
      result.error = overrides.error;
    }
    return result;
  }

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
    if (this.dispatchFailureSignaturesByOperationId.get(operationId) ===
      signature) {
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
      return unwrapRowReadResult(result) || {};
    }
    return this.getSystemTableRowFromCache(
      SYSTEM_TABLE_NAME.NODES,
      nodeId,
    ) || {};
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
      result = await gateway.executeRead({
        tableName: SYSTEM_TABLE_NAME.NODES,
        sql: REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK,
        params: [nodeId],
        strategy: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE,
      }, {
        owner: DISPATCH_SUBSYSTEM,
      });
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
          DISPATCH_READINESS_ERROR_REASON
            .AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        deferRetry: result.deferRetry === true ||
          result.error ===
            DISPATCH_READINESS_ERROR_REASON
              .AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        retryAfterMs: Number.isFinite(result.retryAfterMs) ?
          result.retryAfterMs :
          this.nodeStateUpdateRetryAfterMs,
      };
    }

    const rows = Array.isArray(result?.rows) ?
      result.rows :
      (Array.isArray(result) ? result : []);
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
            DISPATCH_READINESS_ERROR_REASON
              .AUTHORITATIVE_NODE_ROW_VISIBILITY_LAG,
            this.nodeStateUpdateRetryAfterMs,
          );
        }
        return error;
      }

      if (authoritativeNodeRow?.deferRetry === true) {
        this.applyRetryableNodeRowUpdateError(
          error,
          authoritativeNodeRow.error ||
            DISPATCH_READINESS_ERROR_REASON
              .AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
          authoritativeNodeRow.retryAfterMs,
        );
      }
      return error;
    } catch (readError) {
      const readMessage = readError?.message || String(readError);
      if (readError?.deferRetry === true ||
          (typeof this.cdcIntegrationService?.isTransientCdcError ===
            TYPEOF.FUNCTION &&
            this.cdcIntegrationService.isTransientCdcError(readMessage)) ||
          readMessage.includes(
            DISPATCH_READINESS_ERROR_REASON
              .AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
          )) {
        this.applyRetryableNodeRowUpdateError(
          error,
          readError?.code ||
            DISPATCH_READINESS_ERROR_REASON
              .AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
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
        this.rebalanceCoordinator.repository
          .queryAuthoritativeOperationById.bind(
            this.rebalanceCoordinator.repository,
          ) :
        null;
    if (authoritativeOperationQuery) {
      const authoritativeOperation =
        await authoritativeOperationQuery(
          operationId,
          {
            requireOwnerRpcRead: false,
          },
        );
      if (authoritativeOperation) {
        return this.buildOperationRowFromCoordinator(
          authoritativeOperation,
        );
      }
      return null;
    }

    const gateway = this.controlPlaneSystemTableGateway;
    if (!operationId ||
        !gateway ||
        typeof gateway !== TYPEOF.OBJECT) {
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
      result = await gateway.executeRead({
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        sql: REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK,
        params: [operationId],
        strategy: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE,
      }, {
        owner: DISPATCH_SUBSYSTEM,
      });
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
      (Array.isArray(result) ? result : []);
    return rows[REPLICA_DISPATCH_SERVICE_LITERAL.ZERO] || null;
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
    if (this.replicaOperationsOwner &&
        typeof this.replicaOperationsOwner.getReplicaOperationFromCache ===
          TYPEOF.FUNCTION) {
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
    const cachedRow = this.getSystemTableRowFromCache(
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

  /**
   * Forward control message to the current leader.
   * @param {Object} mgService - Message group service.
   * @param {Object} payload - Control message payload.
   * @private
   */
  async forwardToLeader(mgService, payload, options = {}) {
    const requiredTables = Array.isArray(options.requiredTables) ?
      [...new Set(options.requiredTables.filter((tableName) =>
        typeof tableName === TYPEOF.STRING && tableName.length > NUM.ZERO,
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
        throw this.buildIngressReadinessError(
          readiness,
          DISPATCH_ERROR_MSG.METADATA_FORWARD_PATH_UNAVAILABLE,
        );
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
      throw this.buildIngressReadinessError(
        readiness,
        DISPATCH_READINESS_MESSAGE.CONTROL_PLANE_LEADER_NOT_READY,
      );
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
   * Build one ingress-readiness error.
   * @param {Object|null} readiness
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildIngressReadinessError(readiness, fallbackMessage) {
    const error = new Error(
      readiness?.reason || fallbackMessage,
    );
    if (Number.isFinite(readiness?.retryAfterMs) &&
        readiness.retryAfterMs > NUM.ZERO) {
      error.deferRetry = true;
      error.retryAfterMs = readiness.retryAfterMs;
    }
    return error;
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
    if (this.directDispatchServiceAddress &&
        this.messageRouter &&
        typeof this.messageRouter.unregister === TYPEOF.FUNCTION) {
      this.messageRouter.unregister(this.directDispatchServiceAddress);
    }
    this.directDispatchServiceHandler = null;
    this.directDispatchServiceAddress = null;

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
    for (const operationId of this.operationDispatchDeferredRetries.keys()) {
      this.clearDeferredOperationDispatchRetry(operationId);
    }
    for (const nodeId of this.nodeStateUpdateDeferredRetries.keys()) {
      this.clearDeferredNodeStateUpdateRetry(nodeId);
    }
    this.nodeStateUpdateQueueAssignments.clear();
    this.nextNodeStateUpdateQueueIndex = NUM.ZERO;

    if (Array.isArray(this.operationDispatchQueues) &&
        this.operationDispatchQueues.length > NUM.ZERO) {
      for (const operationDispatchQueue of this.operationDispatchQueues) {
        operationDispatchQueue.shutdown();
      }
    } else {
      this.operationDispatchQueue.shutdown();
    }
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
