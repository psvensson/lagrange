/**
 * Replica Lifecycle Manager - Handles CREATE_REPLICA and REMOVE_REPLICA messages.
 * Manages the lifecycle of partition replicas on a node.
 *
 * NOTE: This class now delegates to ReplicaHandler when available.
 * The ReplicaHandler owns local replica state tracking in the new architecture.
 * Local state tracking in this class is deprecated when replicaHandler is used.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9,
 *               10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16,
 *               10.17, 10.18, 10.19, 10.26, 10.27, 10.28, 10.29
 *               1.1, 1.2 (simplified architecture)
 */

import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Replica status values for lifecycle management.
 *
 * @deprecated This enum is deprecated in favor of ReplicaStatus from
 * '../rebalancer/replica-status.js'. The unified ReplicaStatus enum should
 * be used by all components for consistency.
 *
 * Migration guide:
 * - Import ReplicaStatus from '../rebalancer/replica-status.js'
 * - Replace STARTING with CREATING
 * - Replace STOPPING with REMOVING
 * - Replace STOPPED with REMOVED
 *
 * This enum is kept for backward compatibility during migration.
 */
const ReplicaStatus = {
  STARTING: 'starting',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
};

/**
 * Valid status transitions for replica lifecycle.
 * Key: current status, Value: array of valid next statuses.
 *
 * @deprecated This transition map is deprecated. The RebalanceCoordinator
 * now owns workflow step transitions. Use the workflow step progression
 * defined in '../rebalancer/replica-status.js' instead.
 *
 * This map is kept for backward compatibility during migration.
 */
const VALID_STATUS_TRANSITIONS = {
  [ReplicaStatus.STARTING]: [ReplicaStatus.SYNCING, ReplicaStatus.FAILED],
  [ReplicaStatus.SYNCING]: [ReplicaStatus.ACTIVE, ReplicaStatus.FAILED],
  [ReplicaStatus.ACTIVE]: [ReplicaStatus.STOPPING, ReplicaStatus.FAILED],
  [ReplicaStatus.STOPPING]: [ReplicaStatus.STOPPED, ReplicaStatus.FAILED],
  [ReplicaStatus.STOPPED]: [], // Terminal state
  [ReplicaStatus.FAILED]: [], // Terminal state (can transition from any state)
};

/**
 * Message types for replica lifecycle operations.
 */
const MessageType = {
  CREATE_REPLICA: 'CREATE_REPLICA',
  REMOVE_REPLICA: 'REMOVE_REPLICA',
  CREATE_REPLICA_ACK: 'CREATE_REPLICA_ACK',
  REMOVE_REPLICA_ACK: 'REMOVE_REPLICA_ACK',
};

/**
 * ACK status values.
 */
const AckStatus = {
  INITIATED: 'initiated',
  ALREADY_EXISTS: 'already_exists',
  IN_PROGRESS: 'in_progress',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
};


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

    this.nodeId = options.nodeId || 'unknown';
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.messageGroupService = options.messageGroupService || null;
    this.createPartitionService = options.createPartitionService || null;
    this.dataDir = options.dataDir || './data';
    this.replicaStateMachine = options.replicaStateMachine || null;

    // ReplicaHandler for delegated execution (Requirements 1.1, 1.2)
    // When set, operations are delegated to the handler
    this.replicaHandler = options.replicaHandler || null;

    // Track pending operations by request_id
    this.pendingOperations = new Map();

    // Track local replicas by replica_id
    /**
     * @deprecated localReplicas tracking is deprecated when replicaHandler is used.
     * The ReplicaHandler owns local replica state tracking in the new architecture.
     * Use replicaHandler.getAllLocalReplicas() instead.
     */
    // NOTE: This is deprecated when replicaHandler is used
    this.localReplicas = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.operationTimeoutMs = config.get('lifecycle.operationTimeoutMs') || 30000;
    this.syncTimeoutMs = config.get('lifecycle.syncTimeoutMs') || 60000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('replica-lifecycle') : console;

    this.initialized = false;
  }

  /**
   * Initialize the replica lifecycle manager.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing replica lifecycle manager', {
      nodeId: this.nodeId,
      dataDir: this.dataDir,
      usingReplicaHandler: !!this.replicaHandler,
    });

    // Register message handlers with message group service
    if (this.messageGroupService) {
      this.registerMessageHandlers();
    }

    this.initialized = true;

    this.logger.info('Replica lifecycle manager initialized', {
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
    this.replicaHandler = handler;

    this.logger.info('ReplicaHandler set for lifecycle manager', {
      nodeId: this.nodeId,
      hasHandler: !!handler,
    });

    // Clear local state tracking when switching to handler
    if (handler && this.localReplicas.size > 0) {
      this.logger.warn('Clearing local replica tracking after handler set', {
        nodeId: this.nodeId,
        localReplicasCount: this.localReplicas.size,
      });
      this.localReplicas.clear();
    }
  }

  /**
   * Register message handlers with the message group service.
   * Note: Message routing is now handled via transport registration
   * at the ${nodeId}/lifecycle address. This method is kept for
   * compatibility but does not register handlers directly.
   * @private
   */
  registerMessageHandlers() {
    if (!this.messageGroupService) {
      this.logger.warn('No message group service available for handler registration');
      return;
    }

    // Message handlers are now registered via transport at ${nodeId}/lifecycle/manager
    // The bootstrap/joining services register the transport handler that calls
    // handleCreateReplica and handleRemoveReplica directly.
    this.logger.debug('Registered lifecycle message handlers', {
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
    const replica = this.localReplicas.get(replicaId);
    const currentStatus = replica?.status || ReplicaStatus.STARTING;

    // Validate transition
    if (!this.isValidTransition(currentStatus, newStatus)) {
      this.logger.error('Invalid status transition attempted', {
        replicaId,
        currentStatus,
        newStatus,
        nodeId: this.nodeId,
      });
      throw new Error(
        `Invalid status transition: ${currentStatus} -> ${newStatus}`,
      );
    }

    this.logger.info('Updating replica status', {
      replicaId,
      currentStatus,
      newStatus,
      nodeId: this.nodeId,
    });

    // Update local tracking
    if (replica) {
      replica.status = newStatus;
    }

    // Update via CDC
    if (this.cdcIntegrationService) {
      try {
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.SERVICES,
          {service_id: replicaId},
          {status: newStatus, ...additionalData},
        );
      } catch (error) {
        this.logger.error('Failed to update replica status via CDC', {
          replicaId,
          newStatus,
          error: error.message,
        });
        throw error;
      }
    }

    this.emit('statusChanged', {
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
      request_id,
      partition_id,
      table_name,
      replica_id,
      leader_address,
      key_range,
      schema,
    } = message;

    this.logger.info('Received CREATE_REPLICA message', {
      requestId: request_id,
      partitionId: partition_id,
      replicaId: replica_id,
      tableName: table_name,
      nodeId: this.nodeId,
      usingReplicaHandler: !!this.replicaHandler,
    });

    // Delegate to ReplicaHandler if available (Requirements 1.1, 1.2)
    if (this.replicaHandler) {
      return this.delegateCreateToHandler(message);
    }

    // Legacy behavior - direct handling
    return this.handleCreateReplicaLegacy(message);
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
      request_id,
      partition_id,
      replica_id,
      table_name,
      table_id,
      schema,
      key_range,
      leader_address,
      replica_ids,
    } = message;

    // Convert message format for handler
    const handlerRequest = {
      operationId: request_id,
      partitionId: partition_id,
      replicaId: replica_id,
      tableName: table_name,
      tableId: table_id,
      schema,
      keyRange: key_range,
      leaderAddress: leader_address,
      replicaIds: replica_ids,
    };

    const response = await this.replicaHandler.handleCreateReplica(handlerRequest);

    // Convert response format for legacy compatibility
    return {
      type: MessageType.CREATE_REPLICA_ACK,
      request_id,
      status: response.status,
      replica_id: response.replicaId,
      node_id: this.nodeId,
    };
  }

  /**
   * Legacy CREATE_REPLICA handling (when no ReplicaHandler).
   * @param {Object} message - CREATE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async handleCreateReplicaLegacy(message) {
    const {
      request_id,
      partition_id,
      table_name,
      replica_id,
      leader_address,
      key_range,
      schema,
    } = message;

    // Check for existing replica (idempotency)
    const existingReplica = this.localReplicas.get(replica_id);
    if (existingReplica) {
      // Requirement 9.1: Return already_exists for active replicas
      if (existingReplica.status === ReplicaStatus.ACTIVE) {
        this.logger.info('Replica already exists in active state', {
          replicaId: replica_id,
          nodeId: this.nodeId,
        });

        return {
          type: MessageType.CREATE_REPLICA_ACK,
          request_id,
          status: AckStatus.ALREADY_EXISTS,
          replica_id,
          node_id: this.nodeId,
        };
      }

      // Requirement 9.2: Return in_progress for creating/syncing replicas
      if (existingReplica.status === ReplicaStatus.STARTING ||
          existingReplica.status === ReplicaStatus.SYNCING) {
        this.logger.info('Replica creation already in progress', {
          replicaId: replica_id,
          status: existingReplica.status,
          nodeId: this.nodeId,
        });

        return {
          type: MessageType.CREATE_REPLICA_ACK,
          request_id,
          status: AckStatus.IN_PROGRESS,
          replica_id,
          node_id: this.nodeId,
        };
      }

      // For other states (STOPPING, STOPPED, FAILED), return already_exists
      this.logger.info('Replica exists in non-active state', {
        replicaId: replica_id,
        status: existingReplica.status,
        nodeId: this.nodeId,
      });

      return {
        type: MessageType.CREATE_REPLICA_ACK,
        request_id,
        status: AckStatus.ALREADY_EXISTS,
        replica_id,
        node_id: this.nodeId,
      };
    }

    // Send immediate ACK with 'initiated' status
    const ack = {
      type: MessageType.CREATE_REPLICA_ACK,
      request_id,
      status: AckStatus.INITIATED,
      replica_id,
      node_id: this.nodeId,
    };

    // Track pending operation
    this.pendingOperations.set(request_id, {
      type: MessageType.CREATE_REPLICA,
      partition_id,
      replica_id,
      startedAt: Date.now(),
      status: 'pending',
    });

    // Start async replica creation
    this.createReplicaAsync(message).catch((error) => {
      this.logger.error('Async replica creation failed', {
        requestId: request_id,
        replicaId: replica_id,
        error: error.message,
        stack: error.stack,
      });
    });

    return ack;
  }

  /**
   * Asynchronously create a replica.
   * @param {Object} message - CREATE_REPLICA message.
   * @return {Promise<void>}
   * @private
   */
  async createReplicaAsync(message) {
    const {
      request_id,
      partition_id,
      table_name,
      replica_id,
      schema,
      table_id,
      replica_ids,
    } = message;

    try {
      // NOTE: The seed node already inserted the services row with status 'starting'
      // before sending CREATE_REPLICA. We only need to track locally and update status.

      // Track locally
      this.localReplicas.set(replica_id, {
        replicaId: replica_id,
        partitionId: partition_id,
        tableName: table_name,
        status: ReplicaStatus.STARTING,
        service: null,
      });

      // Generate database path
      const dbPath = this.getPartitionDbPath(partition_id, replica_id);

      // Create PartitionService instance
      if (this.createPartitionService) {
        const partitionService = await this.createPartitionService({
          partitionId: partition_id,
          tableId: table_id || partition_id,
          tableName: table_name,
          schema,
          keyRange: message.key_range,
          replicaId: replica_id,
          replicaIds: replica_ids,
          nodeId: this.nodeId,
          dbPath,
          leaderAddress: message.leader_address,
        });

        this.localReplicas.get(replica_id).service = partitionService;

        // Update status to 'syncing' after message group registration
        await this.updateReplicaStatus(replica_id, ReplicaStatus.SYNCING);

        // Sync Raft log from leader
        await this.syncRaftLog(replica_id, message.leader_address);

        // Update status to 'active' on sync completion
        await this.updateReplicaStatus(replica_id, ReplicaStatus.ACTIVE);

        this.logger.info('Replica creation completed successfully', {
          requestId: request_id,
          replicaId: replica_id,
          partitionId: partition_id,
          nodeId: this.nodeId,
        });

        // Update pending operation
        const pending = this.pendingOperations.get(request_id);
        if (pending) {
          pending.status = 'completed';
          pending.completedAt = Date.now();
        }

        this.emit('replicaCreated', {
          requestId: request_id,
          replicaId: replica_id,
          partitionId: partition_id,
          nodeId: this.nodeId,
        });
      }
    } catch (error) {
      this.logger.error('Replica creation failed', {
        requestId: request_id,
        replicaId: replica_id,
        partitionId: partition_id,
        error: error.message,
        stack: error.stack,
        nodeId: this.nodeId,
      });

      // Update status to 'failed'
      try {
        await this.updateReplicaStatus(replica_id, ReplicaStatus.FAILED, {
          error_message: error.message,
        });
      } catch (updateError) {
        this.logger.error('Failed to update replica status to failed', {
          replicaId: replica_id,
          error: updateError.message,
        });
      }

      // Update pending operation
      const pending = this.pendingOperations.get(request_id);
      if (pending) {
        pending.status = 'failed';
        pending.error = error.message;
        pending.completedAt = Date.now();
      }

      this.emit('replicaCreationFailed', {
        requestId: request_id,
        replicaId: replica_id,
        partitionId: partition_id,
        error: error.message,
        nodeId: this.nodeId,
      });
    }
  }


  /**
   * Handle REMOVE_REPLICA message.
   * Implements idempotent operation handling per Requirements 9.3, 9.4.
   * When replicaHandler is set, delegates to it (Requirements 1.1, 1.2).
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   */
  async handleRemoveReplica(message) {
    const {request_id, partition_id, replica_id, reason} = message;

    this.logger.info('Received REMOVE_REPLICA message', {
      requestId: request_id,
      partitionId: partition_id,
      replicaId: replica_id,
      reason,
      nodeId: this.nodeId,
      usingReplicaHandler: !!this.replicaHandler,
    });

    // Delegate to ReplicaHandler if available (Requirements 1.1, 1.2)
    if (this.replicaHandler) {
      return this.delegateRemoveToHandler(message);
    }

    // Legacy behavior - direct handling
    return this.handleRemoveReplicaLegacy(message);
  }

  /**
   * Delegate REMOVE_REPLICA to ReplicaHandler.
   * Requirements: 1.1, 1.2
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async delegateRemoveToHandler(message) {
    const {request_id, partition_id, replica_id, reason} = message;

    // Convert message format for handler
    const handlerRequest = {
      operationId: request_id,
      partitionId: partition_id,
      replicaId: replica_id,
      reason,
    };

    const response = await this.replicaHandler.handleRemoveReplica(handlerRequest);

    // Convert response format for legacy compatibility
    return {
      type: MessageType.REMOVE_REPLICA_ACK,
      request_id,
      status: response.status,
      replica_id: response.replicaId,
      node_id: this.nodeId,
    };
  }

  /**
   * Legacy REMOVE_REPLICA handling (when no ReplicaHandler).
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async handleRemoveReplicaLegacy(message) {
    const {request_id, partition_id, replica_id, reason} = message;

    // Check if replica exists
    const replica = this.localReplicas.get(replica_id);

    // Requirement 9.3: Return not_found for non-existent replicas
    if (!replica) {
      this.logger.warn('Replica not found for removal', {
        replicaId: replica_id,
        nodeId: this.nodeId,
      });

      return {
        type: MessageType.REMOVE_REPLICA_ACK,
        request_id,
        status: AckStatus.NOT_FOUND,
        replica_id,
        node_id: this.nodeId,
      };
    }

    // Requirement 9.4: Return in_progress for replicas already being removed
    if (replica.status === ReplicaStatus.STOPPING) {
      this.logger.info('Replica removal already in progress', {
        replicaId: replica_id,
        status: replica.status,
        nodeId: this.nodeId,
      });

      return {
        type: MessageType.REMOVE_REPLICA_ACK,
        request_id,
        status: AckStatus.IN_PROGRESS,
        replica_id,
        node_id: this.nodeId,
      };
    }

    // Send immediate ACK with 'initiated' status
    const ack = {
      type: MessageType.REMOVE_REPLICA_ACK,
      request_id,
      status: AckStatus.INITIATED,
      replica_id,
      node_id: this.nodeId,
    };

    // Track pending operation
    this.pendingOperations.set(request_id, {
      type: MessageType.REMOVE_REPLICA,
      partition_id,
      replica_id,
      reason,
      startedAt: Date.now(),
      status: 'pending',
    });

    // Start async replica removal
    this.removeReplicaAsync(message).catch((error) => {
      this.logger.error('Async replica removal failed', {
        requestId: request_id,
        replicaId: replica_id,
        error: error.message,
        stack: error.stack,
      });
    });

    return ack;
  }

  /**
   * Asynchronously remove a replica.
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<void>}
   * @private
   */
  async removeReplicaAsync(message) {
    const {request_id, partition_id, replica_id, reason} = message;

    try {
      // Update status to 'stopping'
      await this.updateReplicaStatus(replica_id, ReplicaStatus.STOPPING);

      // Get the replica service
      const replica = this.localReplicas.get(replica_id);
      const service = replica?.service;

      // Complete in-flight operations via graceful shutdown
      if (service && typeof service.shutdown === 'function') {
        this.logger.debug('Initiating graceful shutdown', {
          replicaId: replica_id,
          nodeId: this.nodeId,
        });
        await service.shutdown();
      }

      // Update status to 'stopped'
      await this.updateReplicaStatus(replica_id, ReplicaStatus.STOPPED);

      // Delete service row from services table
      if (this.cdcIntegrationService) {
        await this.cdcIntegrationService.deleteSystemTableRow(
          SystemTableName.SERVICES,
          {service_id: replica_id},
        );
      }

      // Clean up local resources (SQLite files)
      await this.cleanupReplicaResources(partition_id, replica_id);

      // Remove from local tracking
      this.localReplicas.delete(replica_id);

      this.logger.info('Replica removal completed successfully', {
        requestId: request_id,
        replicaId: replica_id,
        partitionId: partition_id,
        reason,
        nodeId: this.nodeId,
      });

      // Update pending operation
      const pending = this.pendingOperations.get(request_id);
      if (pending) {
        pending.status = 'completed';
        pending.completedAt = Date.now();
      }

      this.emit('replicaRemoved', {
        requestId: request_id,
        replicaId: replica_id,
        partitionId: partition_id,
        reason,
        nodeId: this.nodeId,
      });
    } catch (error) {
      this.logger.error('Replica removal failed', {
        requestId: request_id,
        replicaId: replica_id,
        partitionId: partition_id,
        error: error.message,
        stack: error.stack,
        nodeId: this.nodeId,
      });

      // Update status to 'failed'
      try {
        await this.updateReplicaStatus(replica_id, ReplicaStatus.FAILED, {
          error_message: error.message,
        });
      } catch (updateError) {
        this.logger.error('Failed to update replica status to failed', {
          replicaId: replica_id,
          error: updateError.message,
        });
      }

      // Update pending operation
      const pending = this.pendingOperations.get(request_id);
      if (pending) {
        pending.status = 'failed';
        pending.error = error.message;
        pending.completedAt = Date.now();
      }

      this.emit('replicaRemovalFailed', {
        requestId: request_id,
        replicaId: replica_id,
        partitionId: partition_id,
        error: error.message,
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Sync Raft log from leader.
   * @param {string} replicaId - Replica ID.
   * @param {string} leaderAddress - Leader address.
   * @return {Promise<void>}
   * @private
   */
  async syncRaftLog(replicaId, leaderAddress) {
    this.logger.debug('Starting Raft log sync', {
      replicaId,
      leaderAddress,
      nodeId: this.nodeId,
    });

    const replica = this.localReplicas.get(replicaId);
    if (!replica || !replica.service) {
      throw new Error(`Replica service not found: ${replicaId}`);
    }

    // The actual sync is handled by the Raft implementation
    // This is a placeholder for the sync coordination
    if (typeof replica.service.syncFromLeader === 'function') {
      await replica.service.syncFromLeader(leaderAddress);
    }

    this.logger.debug('Raft log sync completed', {
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

    this.logger.debug('Cleaning up replica resources', {
      replicaId,
      partitionId,
      dbPath,
      nodeId: this.nodeId,
    });

    try {
      // Remove SQLite database file
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        this.logger.debug('Removed database file', {dbPath});
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
        if (files.length === 0) {
          fs.rmdirSync(partitionDir);
          this.logger.debug('Removed empty partition directory', {partitionDir});
        }
      } catch {
        // Ignore errors when removing directory
      }
    } catch (error) {
      this.logger.warn('Error cleaning up replica resources', {
        replicaId,
        dbPath,
        error: error.message,
      });
      // Don't throw - cleanup errors shouldn't fail the removal
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
      'partitions',
      partitionId,
      `${replicaId}.db`,
    );
  }


  /**
   * Handle node recovery - clean up orphaned replicas.
   * Called when a node recovers after a failure.
   * @return {Promise<void>}
   */
  async handleNodeRecovery() {
    this.logger.info('Handling node recovery - checking for orphaned replicas', {
      nodeId: this.nodeId,
    });

    if (!this.systemTableCache) {
      this.logger.warn('No system table cache available for recovery check');
      return;
    }

    // Query services table for replicas on this node in transitional states
    const services = this.systemTableCache.filter(
      SystemTableName.SERVICES,
      (service) =>
        service.node_id === this.nodeId &&
        service.service_type === 'partition' &&
        [
          ReplicaStatus.STARTING,
          ReplicaStatus.SYNCING,
          ReplicaStatus.STOPPING,
        ].includes(service.status),
    );

    this.logger.info('Found orphaned replicas in transitional states', {
      count: services.length,
      nodeId: this.nodeId,
    });

    for (const service of services) {
      const {service_id, partition_id, status} = service;

      this.logger.info('Processing orphaned replica', {
        replicaId: service_id,
        partitionId: partition_id,
        status,
        nodeId: this.nodeId,
      });

      try {
        if (status === ReplicaStatus.STARTING || status === ReplicaStatus.SYNCING) {
          // Mark 'starting'/'syncing' replicas as 'failed'
          await this.cdcIntegrationService.updateSystemTableRow(
            SystemTableName.SERVICES,
            {service_id},
            {status: ReplicaStatus.FAILED, error_message: 'Node recovery cleanup'},
          );

          // Clean up local resources
          await this.cleanupReplicaResources(partition_id, service_id);

          this.logger.info('Marked orphaned replica as failed', {
            replicaId: service_id,
            previousStatus: status,
            nodeId: this.nodeId,
          });
        } else if (status === ReplicaStatus.STOPPING) {
          // Complete removal for 'stopping' replicas
          await this.cdcIntegrationService.updateSystemTableRow(
            SystemTableName.SERVICES,
            {service_id},
            {status: ReplicaStatus.STOPPED},
          );

          await this.cdcIntegrationService.deleteSystemTableRow(
            SystemTableName.SERVICES,
            {service_id},
          );

          // Clean up local resources
          await this.cleanupReplicaResources(partition_id, service_id);

          this.logger.info('Completed removal of stopping replica', {
            replicaId: service_id,
            nodeId: this.nodeId,
          });
        }
      } catch (error) {
        this.logger.error('Failed to clean up orphaned replica', {
          replicaId: service_id,
          status,
          error: error.message,
          nodeId: this.nodeId,
        });
      }
    }

    this.emit('recoveryComplete', {
      nodeId: this.nodeId,
      orphanedCount: services.length,
    });
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
  cleanupExpiredOperations(maxAgeMs = 300000) {
    const now = Date.now();
    const expiredIds = [];

    for (const [requestId, op] of this.pendingOperations) {
      const age = now - op.startedAt;
      if (age > maxAgeMs && (op.status === 'completed' || op.status === 'failed')) {
        expiredIds.push(requestId);
      }
    }

    for (const id of expiredIds) {
      this.pendingOperations.delete(id);
    }

    if (expiredIds.length > 0) {
      this.logger.debug('Cleaned up expired pending operations', {
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
    const {replicaId, partitionId, tableName, status, service} = replicaInfo;

    // Delegate to handler if available
    if (this.replicaHandler) {
      this.replicaHandler.registerExistingReplica(replicaInfo);
      return;
    }

    // Legacy: use local tracking
    // Idempotent: no error on duplicate registration
    if (this.localReplicas.has(replicaId)) {
      this.logger.debug('Replica already registered', {
        replicaId,
        nodeId: this.nodeId,
      });
      return;
    }

    this.localReplicas.set(replicaId, {
      replicaId,
      partitionId,
      tableName,
      status: status || ReplicaStatus.ACTIVE,
      service: service || null,
    });

    this.logger.info('Registered existing replica', {
      replicaId,
      partitionId,
      tableName,
      nodeId: this.nodeId,
    });
  }

  /**
   * Get local replica by ID.
   * When replicaHandler is set, delegates to it.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Local replica info or null.
   */
  getLocalReplica(replicaId) {
    // Delegate to handler if available
    if (this.replicaHandler) {
      return this.replicaHandler.getLocalReplica(replicaId);
    }

    // Legacy: use local tracking
    return this.localReplicas.get(replicaId) || null;
  }

  /**
   * Get all local replicas.
   * When replicaHandler is set, delegates to it.
   * @return {Array<Object>} Array of local replica info.
   */
  getAllLocalReplicas() {
    // Delegate to handler if available
    if (this.replicaHandler) {
      return this.replicaHandler.getAllLocalReplicas();
    }

    // Legacy: use local tracking
    return Array.from(this.localReplicas.values());
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
    const stats = {
      nodeId: this.nodeId,
      initialized: this.initialized,
      localReplicaCount: this.replicaHandler ?
        this.replicaHandler.getAllLocalReplicas().length :
        this.localReplicas.size,
      pendingOperationCount: this.pendingOperations.size,
      usingReplicaHandler: !!this.replicaHandler,
    };

    // Include handler stats if available
    if (this.replicaHandler) {
      const handlerStats = this.replicaHandler.getStats();
      stats.handlerStats = {
        inProgressOperationCount: handlerStats.inProgressOperationCount,
      };
    }

    return stats;
  }

  /**
   * Shutdown the replica lifecycle manager.
   */
  shutdown() {
    this.logger.info('Shutting down replica lifecycle manager', {
      nodeId: this.nodeId,
    });

    this.pendingOperations.clear();
    this.localReplicas.clear();
    this.initialized = false;

    this.emit('shutdown', {nodeId: this.nodeId});
  }
}

export {
  ReplicaLifecycleManager,
  ReplicaStatus,
  VALID_STATUS_TRANSITIONS,
  MessageType,
  AckStatus,
};
