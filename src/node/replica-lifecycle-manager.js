/**
 * Replica Lifecycle Manager - Handles CREATE_REPLICA and REMOVE_REPLICA messages.
 * Manages the lifecycle of partition replicas on a node.
 *
 * NOTE: This class delegates to ReplicaHandler for execution and tracking.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9,
 *               10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16,
 *               10.17, 10.18, 10.19, 10.26, 10.27, 10.28, 10.29
 *               1.1, 1.2 (simplified architecture)
 */

import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  REPLICA_LIFECYCLE_ACK_STATUS,
  REPLICA_LIFECYCLE_DEFAULT,
  REPLICA_LIFECYCLE_ERROR_MSG,
  REPLICA_LIFECYCLE_EVENT,
  REPLICA_LIFECYCLE_LOG_MSG,
  REPLICA_LIFECYCLE_MESSAGE_TYPE,
  REPLICA_LIFECYCLE_NUM,
  REPLICA_LIFECYCLE_PENDING_STATUS,
  REPLICA_LIFECYCLE_STATUS,
  REPLICA_LIFECYCLE_SUBSYSTEM,
  REPLICA_LIFECYCLE_VALID_TRANSITIONS,
} from './replica-lifecycle-constants.js';
import {ReplicaHandler} from './replica-handler.js';
import {
  runReplicaLifecycleRecovery,
} from './replica-lifecycle-recovery.js';

const LOCAL_STR_FAILED_TO_SHUT_DOWN_DELEGATED_REPLICA_HA = 'Failed to shut down delegated replica handler';

/**
 * Replica status values for lifecycle management.
 */
const ReplicaStatus = REPLICA_LIFECYCLE_STATUS;

/**
 * Valid status transitions for replica lifecycle.
 * Key: current status, Value: array of valid next statuses.
 */
const VALID_STATUS_TRANSITIONS = REPLICA_LIFECYCLE_VALID_TRANSITIONS;

/**
 * Message types for replica lifecycle operations.
 */
const MessageType = REPLICA_LIFECYCLE_MESSAGE_TYPE;

/**
 * ACK status values.
 */
const AckStatus = REPLICA_LIFECYCLE_ACK_STATUS;

/**
 * ReplicaLifecycleManager handles CREATE_REPLICA and REMOVE_REPLICA messages.
 * It manages the complete lifecycle of partition replicas on a node.
 *
 * When replicaHandler is set, this class delegates to it for actual execution.
 * The replicaHandler owns local replica state tracking in the new architecture.
 */
class ReplicaLifecycleManager extends EventEmitter {
  /**
   * Create a new ReplicaLifecycleManager.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID hosting this manager.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Object} options.messageGroupService - Message group service for routing.
   * @param {Function} options.createPartitionService - Factory for creating partitions.
   * @param {string} options.dataDir - Base data directory for partition storage.
   * @param {Object} options.replicaStateMachine - Replica state machine instance.
   * @param {Object} options.replicaHandler - ReplicaHandler instance for delegation
   *   (new simplified architecture - Requirements 1.1, 1.2).
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || REPLICA_LIFECYCLE_DEFAULT.UNKNOWN_NODE_ID;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.messageGroupService = options.messageGroupService || null;
    this.createPartitionService = options.createPartitionService || null;
    this.dataDir = options.dataDir || REPLICA_LIFECYCLE_DEFAULT.DATA_DIR;
    this.replicaStateMachine = options.replicaStateMachine || null;
    this.replicaHandler = options.replicaHandler || null;

    // Track pending operations by request_id
    this.pendingOperations = new Map();
    this.ownsReplicaHandler = false;
    this.shutdownPromise = null;
    assertCritical(
      this.replicaHandler || this.createPartitionService,
      REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED,
    );
    if (!this.replicaHandler) {
      this.replicaHandler = new ReplicaHandler({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        createPartitionService: this.createPartitionService,
        dataDir: this.dataDir,
      });
      this.ownsReplicaHandler = true;
    }
    // Backward-compatible test hook: mirrors handler-owned local replica metadata map.
    this.localReplicas = this.replicaHandler.localReplicas ||
      this.replicaHandler.localServices ||
      new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.operationTimeoutMs = config.get(CONFIG_KEY.LIFECYCLE_OPERATION_TIMEOUT_MS) ||
      REPLICA_LIFECYCLE_DEFAULT.OPERATION_TIMEOUT_MS;
    this.syncTimeoutMs = config.get(CONFIG_KEY.LIFECYCLE_SYNC_TIMEOUT_MS) ||
      REPLICA_LIFECYCLE_DEFAULT.SYNC_TIMEOUT_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REPLICA_LIFECYCLE_SUBSYSTEM) : console;

    this.initialized = false;
  }

  /**
   * Initialize the replica lifecycle manager.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.INITIALIZING, {
      nodeId: this.nodeId,
      dataDir: this.dataDir,
      usingReplicaHandler: !!this.replicaHandler,
    });

    if (this.replicaHandler && typeof this.replicaHandler.initialize === 'function') {
      this.replicaHandler.initialize();
    }

    // Register message handlers with message group service
    if (this.messageGroupService) {
      this.registerMessageHandlers();
    }

    this.initialized = true;

    this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Set the ReplicaHandler for delegated execution.
   * When set, operations are delegated to the handler.
   * Requirements: 1.1, 1.2
   * @param {Object} handler - ReplicaHandler instance.
   */
  setReplicaHandler(handler) {
    assertCritical(handler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
    this.replicaHandler = handler;
    this.ownsReplicaHandler = false;
    this.localReplicas = handler.localReplicas || handler.localServices || new Map();

    this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.HANDLER_SET, {
      nodeId: this.nodeId,
      hasHandler: true,
    });
    if (typeof handler.initialize === 'function') {
      handler.initialize();
    }
  }

  /**
   * Register message handlers with the message group service.
   * Note: Message routing is now handled via transport registration
   * at the ${nodeId}/lifecycle address. This method does not register
   * handlers directly.
   * @private
   */
  registerMessageHandlers() {
    if (!this.messageGroupService) {
      this.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.NO_MESSAGE_GROUP);
      return;
    }

    // Message handlers are now registered via transport at ${nodeId}/lifecycle/manager
    // The bootstrap/joining services register the transport handler that calls
    // handleCreateReplica and handleRemoveReplica directly.
    this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.HANDLERS_REGISTERED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Validate a status transition.
   * @param {string} currentStatus - Current replica status.
   * @param {string} newStatus - Proposed new status.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(currentStatus, newStatus) {
    // Any state can transition to FAILED
    if (newStatus === ReplicaStatus.FAILED) {
      return true;
    }

    const validNextStates = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    return validNextStates.includes(newStatus);
  }

  /**
   * Update replica status with validation.
   * @param {string} replicaId - Replica ID.
   * @param {string} newStatus - New status.
   * @param {Object} additionalData - Additional data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
    const replica = this.replicaHandler.getLocalReplica(replicaId);
    const currentStatus = replica?.status || ReplicaStatus.STARTING;

    // Validate transition
    if (!this.isValidTransition(currentStatus, newStatus)) {
      this.logger.error(REPLICA_LIFECYCLE_LOG_MSG.INVALID_TRANSITION, {
        replicaId,
        currentStatus,
        newStatus,
        nodeId: this.nodeId,
      });
      throw new Error(
        REPLICA_LIFECYCLE_ERROR_MSG.invalidTransition(currentStatus, newStatus),
      );
    }

    this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.STATUS_UPDATE, {
      replicaId,
      currentStatus,
      newStatus,
      nodeId: this.nodeId,
    });

    // Update local tracking
    if (replica) {
      replica.status = newStatus;
    }

    // Update via CDC using UPDATE (not upsert/INSERT OR REPLACE)
    // The seed node already inserted the row with all fields before sending
    // CREATE_REPLICA. Using INSERT OR REPLACE would overwrite the entire row
    // and lose fields like partition_id, raft_role, created_at, etc.
    if (this.cdcIntegrationService || this.controlPlaneSystemTableGateway) {
      const result = await this.getControlPlaneSystemTableGateway()
        .submitMutation({
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: SYSTEM_TABLE_NAME.SERVICES,
          whereClause: {service_id: replicaId},
          data: {
            status: newStatus,
            updated_at: Date.now(),
            ...additionalData,
          },
        }, {
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: 'critical',
        });

      if (result && result.success === false) {
        this.logger.error(REPLICA_LIFECYCLE_LOG_MSG.CDC_UPDATE_FAILED, {
          replicaId,
          newStatus,
          error: result.error,
        });
        throw new Error(REPLICA_LIFECYCLE_ERROR_MSG.statusUpdateFailed(result.error));
      }
    }

    this.emit(REPLICA_LIFECYCLE_EVENT.STATUS_CHANGED, {
      replicaId,
      previousStatus: currentStatus,
      newStatus,
      nodeId: this.nodeId,
    });

    return {success: true, previousStatus: currentStatus, newStatus};
  }


  /**
   * Handle CREATE_REPLICA message.
   * Implements idempotent operation handling per Requirements 9.1, 9.2.
   * When replicaHandler is set, delegates to it (Requirements 1.1, 1.2).
   * @param {Object} message - CREATE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   */
  async handleCreateReplica(message) {
    const {
      request_id: requestId,
      partition_id: partitionId,
      table_name: tableName,
      replica_id: replicaId,
      leader_address: _leaderAddress,
      key_range: _keyRange,
      schema: _schema,
    } = message;

    this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.CREATE_REQUEST, {
      requestId,
      partitionId,
      replicaId,
      tableName,
      nodeId: this.nodeId,
      usingReplicaHandler: !!this.replicaHandler,
    });

    assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
    return this.delegateCreateToHandler(message);
  }

  /**
   * Delegate CREATE_REPLICA to ReplicaHandler.
   * Requirements: 1.1, 1.2
   * @param {Object} message - CREATE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async delegateCreateToHandler(message) {
    const {
      request_id: requestId,
      partition_id: partitionId,
      replica_id: replicaId,
      table_name: tableName,
      table_id: tableId,
      schema,
      key_range: keyRange,
      leader_address: leaderAddress,
      replica_ids: replicaIds,
      peer_addresses: peerAddresses,
    } = message;

    // Convert message format for handler
    const handlerRequest = {
      operationId: requestId,
      partitionId,
      replicaId,
      tableName,
      tableId,
      schema,
      keyRange,
      leaderAddress,
      replicaIds,
      peerAddresses: peerAddresses || [],
    };

    const response = await this.replicaHandler.handleCreateReplica(handlerRequest);

    // Convert response format for lifecycle acknowledgments
    return {
      type: MessageType.CREATE_REPLICA_ACK,
      request_id: requestId,
      status: response.status,
      replica_id: response.replicaId,
      node_id: this.nodeId,
    };
  }


  /**
   * Handle REMOVE_REPLICA message.
   * Implements idempotent operation handling per Requirements 9.3, 9.4.
   * When replicaHandler is set, delegates to it (Requirements 1.1, 1.2).
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   */
  async handleRemoveReplica(message) {
    const {
      request_id: requestId,
      partition_id: partitionId,
      replica_id: replicaId,
      reason,
    } = message;

    this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.REMOVE_REQUEST, {
      requestId,
      partitionId,
      replicaId,
      reason,
      nodeId: this.nodeId,
      usingReplicaHandler: !!this.replicaHandler,
    });

    assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
    return this.delegateRemoveToHandler(message);
  }

  /**
   * Delegate REMOVE_REPLICA to ReplicaHandler.
   * Requirements: 1.1, 1.2
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async delegateRemoveToHandler(message) {
    const {
      request_id: requestId,
      partition_id: partitionId,
      replica_id: replicaId,
      reason,
    } = message;

    // Convert message format for handler
    const handlerRequest = {
      operationId: requestId,
      partitionId,
      replicaId,
      reason,
    };

    const response = await this.replicaHandler.handleRemoveReplica(handlerRequest);

    // Convert response format for lifecycle acknowledgments
    return {
      type: MessageType.REMOVE_REPLICA_ACK,
      request_id: requestId,
      status: response.status,
      replica_id: response.replicaId,
      node_id: this.nodeId,
    };
  }

  /**
   * Sync Raft log from leader.
   * @param {string} replicaId - Replica ID.
   * @param {string} leaderAddress - Leader address.
   * @return {Promise<void>}
   * @private
   */
  async syncRaftLog(replicaId, leaderAddress) {
    this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.RAFT_SYNC_START, {
      replicaId,
      leaderAddress,
      nodeId: this.nodeId,
    });

    const replica = this.replicaHandler.getLocalReplica(replicaId);
    if (!replica || !replica.service) {
      throw new Error(REPLICA_LIFECYCLE_ERROR_MSG.replicaServiceMissing(replicaId));
    }

    // The actual sync is handled by the Raft implementation
    // This is a placeholder for the sync coordination
    if (typeof replica.service.syncFromLeader === 'function') {
      await replica.service.syncFromLeader(leaderAddress);
    }

    this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.RAFT_SYNC_COMPLETE, {
      replicaId,
      nodeId: this.nodeId,
    });
  }

  /**
   * Clean up local resources for a replica.
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {Promise<void>}
   * @private
   */
  async cleanupReplicaResources(partitionId, replicaId) {
    const dbPath = this.getPartitionDbPath(partitionId, replicaId);

    this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.CLEANUP_RESOURCES, {
      replicaId,
      partitionId,
      dbPath,
      nodeId: this.nodeId,
    });

    try {
      // Remove SQLite database file
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.REMOVED_DB_FILE, {dbPath});
      }

      // Remove WAL and SHM files if they exist
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;

      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
      }

      // Try to remove partition directory if empty
      const partitionDir = path.dirname(dbPath);
      try {
        const files = fs.readdirSync(partitionDir);
        if (files.length === REPLICA_LIFECYCLE_NUM.ZERO) {
          fs.rmdirSync(partitionDir);
          this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.REMOVED_EMPTY_DIR, {partitionDir});
        }
      } catch (dirError) {
        this.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.CLEANUP_FAILED, {
          replicaId,
          dbPath,
          error: dirError.message,
        });
        throw dirError;
      }
    } catch (error) {
      this.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.CLEANUP_FAILED, {
        replicaId,
        dbPath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get the database path for a partition replica.
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {string} Database file path.
   * @private
   */
  getPartitionDbPath(partitionId, replicaId) {
    return path.join(
      this.dataDir,
      STORAGE_DEFAULT.PARTITIONS_DIRNAME,
      partitionId,
      `${replicaId}${STORAGE_DEFAULT.DB_EXT}`,
    );
  }


  /**
   * Handle node recovery - clean up orphaned replicas.
   * Called when a node recovers after a failure.
   * @return {Promise<void>}
   */
  async handleNodeRecovery() {
    await runReplicaLifecycleRecovery(this);
  }

  /**
   * Get pending operation by request ID.
   * @param {string} requestId - Request ID.
   * @return {Object|null} Pending operation or null.
   */
  getPendingOperation(requestId) {
    return this.pendingOperations.get(requestId) || null;
  }

  /**
   * Get all pending operations.
   * @return {Array<Object>} Array of pending operations.
   */
  getAllPendingOperations() {
    return Array.from(this.pendingOperations.entries()).map(([id, op]) => ({
      requestId: id,
      ...op,
    }));
  }

  /**
   * Clean up expired pending operations.
   * @param {number} maxAgeMs - Maximum age in milliseconds.
   */
  cleanupExpiredOperations(maxAgeMs = REPLICA_LIFECYCLE_DEFAULT.EXPIRED_OPERATION_MAX_AGE_MS) {
    const now = Date.now();
    const expiredIds = [];

    for (const [requestId, op] of this.pendingOperations) {
      const age = now - op.startedAt;
      if (age > maxAgeMs &&
        (op.status === REPLICA_LIFECYCLE_PENDING_STATUS.COMPLETED ||
          op.status === REPLICA_LIFECYCLE_PENDING_STATUS.FAILED)) {
        expiredIds.push(requestId);
      }
    }

    for (const id of expiredIds) {
      this.pendingOperations.delete(id);
    }

    if (expiredIds.length > REPLICA_LIFECYCLE_NUM.ZERO) {
      this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.EXPIRED_OPERATIONS_CLEANED, {
        count: expiredIds.length,
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Register an existing replica (created during bootstrap).
   * This method is idempotent - duplicate registrations are ignored.
   * When replicaHandler is set, delegates to it.
   * @param {Object} replicaInfo - Replica information.
   * @param {string} replicaInfo.replicaId - Unique replica identifier.
   * @param {string} replicaInfo.partitionId - Partition identifier.
   * @param {string} replicaInfo.tableName - Table name.
   * @param {string} [replicaInfo.status] - Replica status (default: 'active').
   * @param {Object} [replicaInfo.service] - Partition service instance.
   */
  registerExistingReplica(replicaInfo) {
    assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
    this.replicaHandler.registerExistingReplica(replicaInfo);
  }

  /**
   * Get local replica by ID.
   * When replicaHandler is set, delegates to it.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Local replica info or null.
   */
  getLocalReplica(replicaId) {
    assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
    return this.replicaHandler.getLocalReplica(replicaId);
  }

  /**
   * Get all local replicas.
   * When replicaHandler is set, delegates to it.
   * @return {Array<Object>} Array of local replica info.
   */
  getAllLocalReplicas() {
    assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
    return this.replicaHandler.getAllLocalReplicas();
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get manager statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    let handlerStats = null;
    if (this.replicaHandler && typeof this.replicaHandler.getStats === 'function') {
      handlerStats = this.replicaHandler.getStats();
    }
    const localReplicaCount = handlerStats ?
      handlerStats.localReplicaCount :
      (this.replicaHandler &&
        typeof this.replicaHandler.getAllLocalReplicas === 'function' ?
        this.replicaHandler.getAllLocalReplicas().length :
        0);

    const stats = {
      nodeId: this.nodeId,
      initialized: this.initialized,
      localReplicaCount,
      pendingOperationCount: this.pendingOperations.size,
      usingReplicaHandler: !!this.replicaHandler,
    };

    // Include handler stats if available
    if (handlerStats) {
      stats.handlerStats = {
        inProgressOperationCount: handlerStats.inProgressOperationCount,
      };
    }

    return stats;
  }

  /**
   * Shutdown the replica lifecycle manager.
   */
  async shutdown() {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.SHUTTING_DOWN, {
        nodeId: this.nodeId,
      });

      this.pendingOperations.clear();
      this.initialized = false;

      if (this.replicaHandler && typeof this.replicaHandler.shutdown === 'function') {
        try {
          await this.replicaHandler.shutdown();
        } catch (error) {
          this.logger.warn(LOCAL_STR_FAILED_TO_SHUT_DOWN_DELEGATED_REPLICA_HA, {
            nodeId: this.nodeId,
            error: error.message,
          });
        }
      }

      this.emit(REPLICA_LIFECYCLE_EVENT.SHUTDOWN, {nodeId: this.nodeId});
    })();

    return this.shutdownPromise;
  }
}

export {
  ReplicaLifecycleManager,
  ReplicaStatus,
  VALID_STATUS_TRANSITIONS,
  MessageType,
  AckStatus,
};
