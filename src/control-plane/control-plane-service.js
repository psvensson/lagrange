/**
 * ControlPlaneService - Processes ordered control plane commands.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {NUM, STATE, STRING, TYPEOF, WORKFLOW_STEP} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  ControlPlaneMessageType,
  ControlPlaneField,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_ERROR_MSG,
  CONTROL_PLANE_EVENT,
  CONTROL_PLANE_LOG_MSG,
  CONTROL_PLANE_SUBSYSTEM,
  DEFAULT_READY_LEASE_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_LEASE_SWEEP_INTERVAL_MS,
} from './control-plane-constants.js';

class ControlPlaneService extends EventEmitter {
  /**
   * Create a new ControlPlaneService.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.messageRouter - MessageRouter instance.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Array<Object>} options.messageGroupServices - MessageGroupService instances.
   * @param {Object} options.rebalanceCoordinator - Optional coordinator instance.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.nodeAddress = options.nodeAddress || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;

    const config = ConfigurationManager.getInstance();
    this.config = {
      readyLeaseMs: config.get(CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS) ||
        DEFAULT_READY_LEASE_MS,
      heartbeatIntervalMs: config.get(CONTROL_PLANE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) ||
        DEFAULT_HEARTBEAT_INTERVAL_MS,
      leaseSweepIntervalMs: config.get(CONTROL_PLANE_CONFIG_KEY.LEASE_SWEEP_INTERVAL_MS) ||
        DEFAULT_LEASE_SWEEP_INTERVAL_MS,
    };

    this.rebalanceCoordinator = options.rebalanceCoordinator || null;

    this.messageGroupServices = new Set();
    this.messageGroupHandlers = new Map();
    this.dispatchInFlight = new Set();

    this.leaseSweepTimer = null;
    this.localHeartbeatTimer = null;
    this.initialized = false;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONTROL_PLANE_SUBSYSTEM) : console;
  }

  /**
   * Initialize the control plane service.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    assertCritical(this.nodeId, CONTROL_PLANE_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(this.nodeAddress, CONTROL_PLANE_ERROR_MSG.MISSING_NODE_ADDRESS);
    assertCritical(this.messageRouter, CONTROL_PLANE_ERROR_MSG.MISSING_ROUTER);
    assertCritical(this.systemTableCache, CONTROL_PLANE_ERROR_MSG.MISSING_CACHE);
    assertCritical(this.cdcIntegrationService, CONTROL_PLANE_ERROR_MSG.MISSING_CDC);
    assertCritical(this.rebalanceCoordinator, CONTROL_PLANE_ERROR_MSG.MISSING_COORDINATOR);

    this.initialized = true;

    this.logger.info(CONTROL_PLANE_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      readyLeaseMs: this.config.readyLeaseMs,
      leaseSweepIntervalMs: this.config.leaseSweepIntervalMs,
    });
  }

  /**
   * Register the local node via the control plane.
   * @param {Object} [options] - Registration options.
   * @param {string} [options.nodeAddress] - Node address override.
   * @param {Array<string>} [options.capabilities] - Node capabilities.
   * @param {Object} [options.stats] - Node stats (cpu/memory/disk).
   * @return {Promise<void>}
   */
  async registerLocalNode(options = {}) {
    assertCritical(this.cdcIntegrationService, CONTROL_PLANE_ERROR_MSG.MISSING_CDC);

    const now = Date.now();
    const stats = options.stats || {};
    const memoryMb = Number.isFinite(stats.memory?.totalBytes) ?
      Math.round(stats.memory.totalBytes / NUM.BYTES_PER_MIB) :
      undefined;

    await this.upsertNodeState({
      nodeId: this.nodeId,
      nodeAddress: options.nodeAddress || this.nodeAddress,
      wsConnectionState: STATE.READY,
      capabilities: options.capabilities,
      lastHeartbeat: now,
      readyLeaseExpiresAt: now + this.config.readyLeaseMs,
      cpuCores: stats.cpu?.count,
      memoryMb,
      diskGb: stats.diskGb,
      cpuUsagePercent: stats.cpu?.usagePercent,
      memoryUsagePercent: stats.memory?.usagePercent,
      diskUsagePercent: stats.diskUsagePercent,
      status: STATE.ACTIVE,
    });
  }

  /**
   * Attach a message group service for control-plane message handling.
   * @param {Object} messageGroupService - MessageGroupService instance.
   */
  attachMessageGroupService(messageGroupService) {
    assertCritical(messageGroupService, CONTROL_PLANE_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE);
    if (this.messageGroupServices.has(messageGroupService)) {
      return;
    }

    const onMessageReceived = (event) => {
      this.handleMessageReceived(messageGroupService, event).catch((error) => {
        this.logger.error(CONTROL_PLANE_LOG_MSG.MESSAGE_HANDLING_FAILED, {
          error: error.message,
          groupId: messageGroupService.groupId,
        });
      });
    };

    const onCdcApplied = (event) => {
      this.handleCdcApplied(messageGroupService, event).catch((error) => {
        this.logger.error(CONTROL_PLANE_LOG_MSG.CDC_HANDLING_FAILED, {
          error: error.message,
          groupId: messageGroupService.groupId,
        });
      });
    };

    messageGroupService.on(CONTROL_PLANE_EVENT.MESSAGE_RECEIVED, onMessageReceived);
    messageGroupService.on(CONTROL_PLANE_EVENT.CDC_APPLIED, onCdcApplied);

    this.messageGroupServices.add(messageGroupService);
    this.messageGroupHandlers.set(messageGroupService, {onMessageReceived, onCdcApplied});

    this.logger.debug(CONTROL_PLANE_LOG_MSG.ATTACHED_MESSAGE_GROUP, {
      groupId: messageGroupService.groupId,
      replicaId: messageGroupService.replicaId,
      nodeId: this.nodeId,
    });
  }

  /**
   * Start periodic lease sweeps for ready nodes.
   */
  startLeaseSweep() {
    if (this.leaseSweepTimer) {
      return;
    }

    this.leaseSweepTimer = setInterval(() => {
      this.sweepExpiredLeases().catch((error) => {
        this.logger.error(CONTROL_PLANE_LOG_MSG.LEASE_SWEEP_FAILED, {
          error: error.message,
        });
      });
    }, this.config.leaseSweepIntervalMs);
  }

  /**
   * Stop periodic lease sweeps.
   */
  stopLeaseSweep() {
    if (this.leaseSweepTimer) {
      clearInterval(this.leaseSweepTimer);
      this.leaseSweepTimer = null;
    }
  }

  /**
   * Start periodic local heartbeats to refresh readiness lease.
   * @param {Object} [options] - Heartbeat options.
   * @param {Function} [options.getStats] - Async function returning node stats.
   * @param {Object} [options.stats] - Static node stats snapshot.
   * @param {string} [options.nodeAddress] - Node address override.
   * @param {Array<string>} [options.capabilities] - Node capabilities override.
   */
  startLocalHeartbeat(options = {}) {
    if (this.localHeartbeatTimer) {
      return;
    }

    const sendHeartbeat = async () => {
      // Check if shutdown has been called - skip heartbeat if so
      if (!this.initialized) {
        return;
      }

      let stats = options.stats;
      if (options.getStats) {
        try {
          stats = await options.getStats();
        } catch (error) {
          this.logger.debug(CONTROL_PLANE_LOG_MSG.LOCAL_HEARTBEAT_FAILED, {
            nodeId: this.nodeId,
            stage: 'stats',
            error: error.message,
          });
          return;
        }
      }

      try {
        await this.registerLocalNode({
          nodeAddress: options.nodeAddress || this.nodeAddress,
          capabilities: options.capabilities,
          stats,
        });
      } catch (error) {
        this.logger.debug(CONTROL_PLANE_LOG_MSG.LOCAL_HEARTBEAT_FAILED, {
          nodeId: this.nodeId,
          stage: 'register',
          error: error.message,
        });
      }
    };

    this.localHeartbeatTimer = setInterval(
      sendHeartbeat,
      this.config.heartbeatIntervalMs,
    );
    sendHeartbeat();
  }

  /**
   * Stop periodic local heartbeats.
   */
  stopLocalHeartbeat() {
    if (this.localHeartbeatTimer) {
      clearInterval(this.localHeartbeatTimer);
      this.localHeartbeatTimer = null;
    }
  }

  /**
   * Shutdown the control plane service.
   */
  shutdown() {
    this.stopLocalHeartbeat();
    this.stopLeaseSweep();

    for (const [messageGroupService, handlers] of this.messageGroupHandlers) {
      messageGroupService.off(CONTROL_PLANE_EVENT.MESSAGE_RECEIVED, handlers.onMessageReceived);
      messageGroupService.off(CONTROL_PLANE_EVENT.CDC_APPLIED, handlers.onCdcApplied);
    }
    this.messageGroupHandlers.clear();
    this.messageGroupServices.clear();
    this.dispatchInFlight.clear();

    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.shutdown();
      this.rebalanceCoordinator = null;
    }

    this.initialized = false;
    this.logger.info(CONTROL_PLANE_LOG_MSG.SHUTDOWN, {nodeId: this.nodeId});
  }

  /**
   * Handle incoming control-plane messages from the message group.
   * @param {Object} messageGroupService - Message group service.
   * @param {Object} event - Message received event.
   * @private
   */
  async handleMessageReceived(messageGroupService, event) {
    const payload = event?.payload;
    const messageId = event?.messageId;

    if (!payload || !this.isControlMessage(payload)) {
      return;
    }

    // NODE_STATE_UPDATE is idempotent (UPSERT into nodes table) and does not require
    // strict control-plane ordering. Processing it on any replica avoids dropped
    // registrations when a follower cannot resolve the current leader yet.
    if (payload.type === ControlPlaneMessageType.NODE_STATE_UPDATE) {
      await this.handleNodeStateUpdate(payload);
      if (messageId && typeof messageGroupService.acknowledgeMessage === TYPEOF.FUNCTION) {
        await messageGroupService.acknowledgeMessage(messageId);
      }
      return;
    }

    if (!messageGroupService.isLeaderReplica()) {
      await this.forwardToLeader(messageGroupService, payload);
      return;
    }

    switch (payload.type) {
    case ControlPlaneMessageType.NODE_STATE_UPDATE:
      await this.handleNodeStateUpdate(payload);
      break;
    case ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH:
      await this.handleReplicaOperationDispatch(payload);
      break;
    default:
      break;
    }

    if (messageId && typeof messageGroupService.acknowledgeMessage === TYPEOF.FUNCTION) {
      await messageGroupService.acknowledgeMessage(messageId);
    }
  }

  /**
   * Handle CDC events for replica operation dispatch.
   * @param {Object} messageGroupService - Message group service.
   * @param {Object} event - CDC event.
   * @private
   */
  async handleCdcApplied(messageGroupService, event) {
    if (!messageGroupService.isLeaderReplica()) {
      return;
    }

    if (event?.tableName !== SystemTableName.REPLICA_OPERATIONS) {
      return;
    }

    const row = event?.data;
    if (!row || !row.operation_id) {
      return;
    }

    const operation = this.buildOperationFromRow(row);

    if (row.workflow_step !== WORKFLOW_STEP.PENDING) {
      return;
    }

    await this.dispatchOperationRow(row);
  }

  /**
   * Handle NODE_STATE_UPDATE messages.
   * @param {Object} payload - Node state update payload.
   * @private
   */
  async handleNodeStateUpdate(payload) {
    const nodeId = payload[ControlPlaneField.NODE_ID];
    const nodeAddress = payload[ControlPlaneField.NODE_ADDRESS];
    const capabilities = payload[ControlPlaneField.CAPABILITIES];
    const state = payload[ControlPlaneField.STATE];

    if (!nodeId || !state) {
      return;
    }

    const now = payload[ControlPlaneField.HEARTBEAT_AT] || Date.now();
    const readyLeaseExpiresAt = state === STATE.READY ?
      now + this.config.readyLeaseMs :
      null;

    if (!CONTROL_PLANE_ALLOWED_STATES.includes(state)) {
      this.logger.debug(CONTROL_PLANE_LOG_MSG.IGNORE_UNKNOWN_NODE_STATE, {
        nodeId,
        state,
      });
      return;
    }

    await this.upsertNodeState({
      nodeId,
      nodeAddress,
      wsConnectionState: state,
      capabilities,
      lastHeartbeat: now,
      readyLeaseExpiresAt,
    });
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

    const systemTableCache = assertCritical(
      this.systemTableCache,
      CONTROL_PLANE_ERROR_MSG.MISSING_CACHE,
    );
    const row = systemTableCache.get(
      SystemTableName.REPLICA_OPERATIONS,
      operationId,
    );

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

    const operation = this.buildOperationFromRow(row);

    this.dispatchInFlight.add(operation.operationId);
    try {
      await this.rebalanceCoordinator.executeOperation(operation);
    } finally {
      this.dispatchInFlight.delete(operation.operationId);
    }
  }

  /**
   * Build an Operation object from a replica_operations row.
   * @param {Object} row - Replica operation row.
   * @return {Object} Operation object.
   * @private
   */
  buildOperationFromRow(row) {
    const stepsHistory = row.steps_history ? JSON.parse(row.steps_history) : [];
    return {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
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
   * Sweep expired readiness leases.
   * @private
   */
  async sweepExpiredLeases() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      CONTROL_PLANE_ERROR_MSG.MISSING_CACHE,
    );
    const hasLeader = Array.from(this.messageGroupServices.values())
      .some((service) => service.isLeaderReplica && service.isLeaderReplica());
    if (!hasLeader) {
      return;
    }

    const now = Date.now();
    const nodes = systemTableCache.getAll(SystemTableName.NODES) || [];

    const expired = nodes.filter((node) =>
      node.ws_connection_state === STATE.READY &&
      node.ready_lease_expires_at &&
      node.ready_lease_expires_at <= now,
    );

    for (const node of expired) {
      await this.upsertNodeState({
        nodeId: node.node_id,
        wsConnectionState: STATE.DISCONNECTED,
        lastHeartbeat: node.last_heartbeat || now,
        readyLeaseExpiresAt: null,
      });
    }
  }

  /**
   * Check if a node is ready based on lease and connection state.
   * @param {string} nodeId - Node ID.
   * @return {boolean} True if node is ready.
   * @private
   */
  isNodeReady(nodeId) {
    if (!nodeId) {
      return false;
    }

    const systemTableCache = assertCritical(
      this.systemTableCache,
      CONTROL_PLANE_ERROR_MSG.MISSING_CACHE,
    );
    const node = systemTableCache.get(SystemTableName.NODES, nodeId);
    if (!node) {
      return false;
    }

    const now = Date.now();
    const leaseValid = node.ready_lease_expires_at && node.ready_lease_expires_at > now;

    if (node.ws_connection_state !== STATE.READY || !leaseValid) {
      return false;
    }

    if (this.messageRouter &&
        typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION) {
      if (this.messageRouter.getConnectionState(nodeId) !== STATE.CONNECTED) {
        return false;
      }
      if (this.messageRouter.isOutboundQueueAvailable &&
          !this.messageRouter.isOutboundQueueAvailable(nodeId)) {
        return false;
      }
      return true;
    }

    return true;
  }

  /**
   * Update or insert a node row in the nodes table.
   * @param {Object} options - Update options.
   * @private
   */
  async upsertNodeState(options) {
    const {
      nodeId,
      nodeAddress,
      wsConnectionState,
      capabilities,
      lastHeartbeat,
      readyLeaseExpiresAt,
      cpuCores,
      memoryMb,
      diskGb,
      cpuUsagePercent,
      memoryUsagePercent,
      diskUsagePercent,
      status,
    } = options;

    if (!nodeId) {
      return;
    }

    const now = Date.now();
    const cache = assertCritical(
      this.systemTableCache,
      CONTROL_PLANE_ERROR_MSG.MISSING_CACHE,
    );
    const existing = cache.get(SystemTableName.NODES, nodeId) || null;

    const baseRow = {
      node_id: nodeId,
      node_address: nodeAddress || existing?.node_address || STRING.UNKNOWN,
      cpu_cores: Number.isFinite(cpuCores) ? cpuCores : (existing?.cpu_cores || NUM.ZERO),
      memory_mb: Number.isFinite(memoryMb) ? memoryMb : (existing?.memory_mb || NUM.ZERO),
      disk_gb: Number.isFinite(diskGb) ? diskGb : (existing?.disk_gb || NUM.ZERO),
      cpu_usage_percent: Number.isFinite(cpuUsagePercent) ?
        cpuUsagePercent : (existing?.cpu_usage_percent || NUM.ZERO),
      memory_usage_percent: Number.isFinite(memoryUsagePercent) ?
        memoryUsagePercent : (existing?.memory_usage_percent || NUM.ZERO),
      disk_usage_percent: Number.isFinite(diskUsagePercent) ?
        diskUsagePercent : (existing?.disk_usage_percent || NUM.ZERO),
      status: status || existing?.status || STATE.ACTIVE,
      ws_connection_state: wsConnectionState || existing?.ws_connection_state ||
        STATE.DISCONNECTED,
      capabilities: capabilities ? JSON.stringify(capabilities) :
        (existing?.capabilities || STRING.EMPTY_JSON_ARRAY),
      last_heartbeat: lastHeartbeat || existing?.last_heartbeat || now,
      ready_lease_expires_at: readyLeaseExpiresAt !== undefined ?
        readyLeaseExpiresAt :
        (existing?.ready_lease_expires_at || null),
      created_at: existing?.created_at || now,
    };

    await this.cdcIntegrationService.upsertSystemTableRow(
      SystemTableName.NODES,
      baseRow,
    );
  }

  /**
   * Forward control message to the current leader.
   * @param {Object} messageGroupService - Message group service.
   * @param {Object} payload - Control message payload.
   * @private
   */
  async forwardToLeader(messageGroupService, payload) {
    const leaderId = messageGroupService.getLeaderId();
    if (!leaderId) {
      return;
    }

    const forwardedBy = Array.isArray(payload[ControlPlaneField.FORWARDED_BY]) ?
      payload[ControlPlaneField.FORWARDED_BY] :
      payload[ControlPlaneField.FORWARDED_BY] ?
        [payload[ControlPlaneField.FORWARDED_BY]] : [];

    if (forwardedBy.includes(this.nodeId)) {
      return;
    }

    const leaderAddress = messageGroupService.buildPeerAddress(leaderId);
    const forwardedPayload = {
      ...payload,
      [ControlPlaneField.FORWARDED_BY]: [...forwardedBy, this.nodeId],
    };

    await messageGroupService.sendMessage(leaderAddress, forwardedPayload);
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
}

export {ControlPlaneService};
