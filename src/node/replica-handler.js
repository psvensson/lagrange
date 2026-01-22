/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import fs from 'fs';
import path from 'path';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

/**
 * Message types for replica operations.
 */
const MessageType = {
  CREATE_REPLICA: 'CREATE_REPLICA',
  REMOVE_REPLICA: 'REMOVE_REPLICA',
};

/**
 * Response status values.
 */
const ResponseStatus = {
  INITIATED: 'initiated',
  ALREADY_EXISTS: 'already_exists',
  IN_PROGRESS: 'in_progress',
  NOT_FOUND: 'not_found',
  COMPLETED: 'completed',
  ERROR: 'error',
};

/**
 * ReplicaHandler handles replica creation and removal requests on target nodes.
 * Returns immediately with status, then performs async work.
 */
class ReplicaHandler extends EventEmitter {
  /**
   * Create a new ReplicaHandler.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID hosting this handler.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Object} options.rpcClient - RPC client for responses.
   * @param {Function} options.createPartitionService - Factory for creating partitions.
   * @param {string} options.dataDir - Base data directory for partition storage.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || 'unknown';
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.rpcClient = options.rpcClient || null;
    this.createPartitionService = options.createPartitionService || null;
    this.dataDir = options.dataDir || './data';

    // Track local replicas by replica_id for idempotency checks
    this.localReplicas = new Map();

    // Track in-progress operations by operationId
    this.inProgressOperations = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.syncTimeoutMs = config.get('replicaHandler.syncTimeoutMs') || 60000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('replica-handler') : console;

    this.initialized = false;
  }

  /**
   * Initialize the replica handler.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing ReplicaHandler', {
      nodeId: this.nodeId,
      dataDir: this.dataDir,
    });

    this.initialized = true;
  }

  /**
   * Handle incoming message (called by message router).
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(envelope) {
    const {payload, correlationId} = envelope;
    const type = payload?.type;

    this.logger.debug('ReplicaHandler received message', {
      type,
      correlationId,
      operationId: payload?.operationId,
    });

    let response;
    if (type === MessageType.CREATE_REPLICA) {
      response = await this.handleCreateReplica(payload);
    } else if (type === MessageType.REMOVE_REPLICA) {
      response = await this.handleRemoveReplica(payload);
    } else {
      response = {
        status: ResponseStatus.ERROR,
        error: `Unknown message type: ${type}`,
      };
    }

    // Include correlationId in response for RPC matching
    return {
      ...response,
      correlationId,
    };
  }

  /**
   * Handle CREATE_REPLICA request.
   * Returns immediately with 'initiated', then does async work.
   * Implements idempotency per Requirements 10.2.
   * @param {Object} request - CREATE_REPLICA request.
   * @return {Promise<Object>} Response.
   */
  async handleCreateReplica(request) {
    const {
      operationId,
      partitionId,
      replicaId,
      tableName,
      tableId,
      schema,
      keyRange,
      leaderAddress,
      replicaIds,
    } = request;

    this.logger.info('Handling CREATE_REPLICA request', {
      operationId,
      partitionId,
      replicaId,
      nodeId: this.nodeId,
    });

    // Check idempotency - existing replica
    const existingReplica = this.getLocalReplica(replicaId || partitionId);
    if (existingReplica) {
      if (existingReplica.status === ReplicaStatus.ACTIVE) {
        this.logger.info('Replica already exists in active state', {
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        });
        return {
          status: ResponseStatus.ALREADY_EXISTS,
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        };
      }

      if (existingReplica.status === ReplicaStatus.CREATING ||
          existingReplica.status === ReplicaStatus.SYNCING) {
        this.logger.info('Replica creation already in progress', {
          replicaId: existingReplica.replicaId,
          status: existingReplica.status,
          nodeId: this.nodeId,
        });
        return {
          status: ResponseStatus.IN_PROGRESS,
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        };
      }
    }

    // Check idempotency - in-progress operation
    if (operationId && this.inProgressOperations.has(operationId)) {
      this.logger.info('Operation already in progress', {
        operationId,
        nodeId: this.nodeId,
      });
      return {
        status: ResponseStatus.IN_PROGRESS,
        operationId,
        nodeId: this.nodeId,
      };
    }

    // Generate replica ID if not provided
    const newReplicaId = replicaId || uuidv4();

    // Track in-progress operation
    if (operationId) {
      this.inProgressOperations.set(operationId, {
        type: MessageType.CREATE_REPLICA,
        replicaId: newReplicaId,
        partitionId,
        startedAt: Date.now(),
      });
    }

    // Track local replica
    this.localReplicas.set(newReplicaId, {
      replicaId: newReplicaId,
      partitionId,
      tableName,
      status: ReplicaStatus.CREATING,
      service: null,
    });

    // Start async creation
    this.createReplicaAsync({
      operationId,
      partitionId,
      replicaId: newReplicaId,
      tableName,
      tableId,
      schema,
      keyRange,
      leaderAddress,
      replicaIds,
    }).catch((error) => {
      this.logger.error('Async replica creation failed', {
        operationId,
        replicaId: newReplicaId,
        error: error.message,
        stack: error.stack,
      });
    });

    return {
      status: ResponseStatus.INITIATED,
      operationId,
      replicaId: newReplicaId,
      nodeId: this.nodeId,
    };
  }

  /**
   * Async replica creation - reports progress via CDC.
   * @param {Object} request - Creation request.
   * @return {Promise<void>}
   * @private
   */
  async createReplicaAsync(request) {
    const {
      operationId,
      partitionId,
      replicaId,
      tableName,
      tableId,
      schema,
      keyRange,
      leaderAddress,
      replicaIds,
    } = request;

    try {
      // Generate database path
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);

      // Create PartitionService instance if factory available
      if (this.createPartitionService) {
        const partitionService = await this.createPartitionService({
          partitionId,
          tableId: tableId || partitionId,
          tableName,
          schema,
          keyRange,
          replicaId,
          replicaIds,
          nodeId: this.nodeId,
          dbPath,
          leaderAddress,
        });

        // Update local tracking
        const replica = this.localReplicas.get(replicaId);
        if (replica) {
          replica.service = partitionService;
        }
      }

      // Update status to syncing (via CDC - coordinator will see this)
      await this.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING, {
        partitionId,
        tableName,
      });

      // Sync from leader if address provided
      const replica = this.localReplicas.get(replicaId);
      if (replica?.service && leaderAddress) {
        if (typeof replica.service.syncFromLeader === 'function') {
          await replica.service.syncFromLeader(leaderAddress);
        }
      }

      // Update status to active
      await this.updateReplicaStatus(replicaId, ReplicaStatus.ACTIVE, {
        partitionId,
        tableName,
      });

      // Update local tracking
      if (replica) {
        replica.status = ReplicaStatus.ACTIVE;
      }

      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }

      this.logger.info('Replica creation completed', {
        operationId,
        replicaId,
        partitionId,
        nodeId: this.nodeId,
      });

      this.emit('replicaCreated', {
        operationId,
        replicaId,
        partitionId,
        nodeId: this.nodeId,
      });
    } catch (error) {
      this.logger.error('Replica creation failed', {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        stack: error.stack,
      });

      // Update status to failed
      await this.updateReplicaStatus(replicaId, ReplicaStatus.FAILED, {
        partitionId,
        errorMessage: error.message,
      });

      // Update local tracking
      const replica = this.localReplicas.get(replicaId);
      if (replica) {
        replica.status = ReplicaStatus.FAILED;
      }

      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }

      this.emit('replicaCreationFailed', {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Handle REMOVE_REPLICA request.
   * Returns immediately with 'initiated', then does async work.
   * Implements idempotency per Requirements 10.2.
   * @param {Object} request - REMOVE_REPLICA request.
   * @return {Promise<Object>} Response.
   */
  async handleRemoveReplica(request) {
    const {operationId, partitionId, replicaId, reason} = request;

    this.logger.info('Handling REMOVE_REPLICA request', {
      operationId,
      partitionId,
      replicaId,
      reason,
      nodeId: this.nodeId,
    });

    // Check if replica exists
    const replica = this.getLocalReplica(replicaId);

    if (!replica) {
      this.logger.warn('Replica not found for removal', {
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ResponseStatus.NOT_FOUND,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - already removing
    if (replica.status === ReplicaStatus.REMOVING) {
      this.logger.info('Replica removal already in progress', {
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ResponseStatus.IN_PROGRESS,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - already removed
    if (replica.status === ReplicaStatus.REMOVED) {
      this.logger.info('Replica already removed', {
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ResponseStatus.COMPLETED,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - in-progress operation
    if (operationId && this.inProgressOperations.has(operationId)) {
      this.logger.info('Operation already in progress', {
        operationId,
        nodeId: this.nodeId,
      });
      return {
        status: ResponseStatus.IN_PROGRESS,
        operationId,
        nodeId: this.nodeId,
      };
    }

    // Track in-progress operation
    if (operationId) {
      this.inProgressOperations.set(operationId, {
        type: MessageType.REMOVE_REPLICA,
        replicaId,
        partitionId,
        startedAt: Date.now(),
      });
    }

    // Update local status
    replica.status = ReplicaStatus.REMOVING;

    // Start async removal
    this.removeReplicaAsync({
      operationId,
      partitionId,
      replicaId,
      reason,
    }).catch((error) => {
      this.logger.error('Async replica removal failed', {
        operationId,
        replicaId,
        error: error.message,
        stack: error.stack,
      });
    });

    return {
      status: ResponseStatus.INITIATED,
      operationId,
      replicaId,
      nodeId: this.nodeId,
    };
  }

  /**
   * Async replica removal - reports progress via CDC.
   * @param {Object} request - Removal request.
   * @return {Promise<void>}
   * @private
   */
  async removeReplicaAsync(request) {
    const {operationId, partitionId, replicaId, reason} = request;

    try {
      // Update status to removing (via CDC)
      await this.updateReplicaStatus(replicaId, ReplicaStatus.REMOVING, {
        partitionId,
      });

      // Get the replica service
      const replica = this.localReplicas.get(replicaId);
      const service = replica?.service;

      // Graceful shutdown of service
      if (service && typeof service.shutdown === 'function') {
        this.logger.debug('Initiating graceful shutdown', {
          replicaId,
          nodeId: this.nodeId,
        });
        await service.shutdown();
      }

      // Clean up local resources (SQLite files)
      await this.cleanupReplicaResources(partitionId, replicaId);

      // Update status to removed (via CDC)
      await this.updateReplicaStatus(replicaId, ReplicaStatus.REMOVED, {
        partitionId,
      });

      // Delete service row from services table
      if (this.cdcIntegrationService) {
        try {
          await this.cdcIntegrationService.deleteSystemTableRow(
            SystemTableName.SERVICES,
            {service_id: replicaId},
          );
        } catch (deleteError) {
          this.logger.warn('Failed to delete service row', {
            replicaId,
            error: deleteError.message,
          });
        }
      }

      // Update local tracking
      if (replica) {
        replica.status = ReplicaStatus.REMOVED;
      }

      // Remove from local tracking
      this.localReplicas.delete(replicaId);

      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }

      this.logger.info('Replica removal completed', {
        operationId,
        replicaId,
        partitionId,
        reason,
        nodeId: this.nodeId,
      });

      this.emit('replicaRemoved', {
        operationId,
        replicaId,
        partitionId,
        reason,
        nodeId: this.nodeId,
      });
    } catch (error) {
      this.logger.error('Replica removal failed', {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        stack: error.stack,
      });

      // Update status to failed
      await this.updateReplicaStatus(replicaId, ReplicaStatus.FAILED, {
        partitionId,
        errorMessage: error.message,
      });

      // Update local tracking
      const replica = this.localReplicas.get(replicaId);
      if (replica) {
        replica.status = ReplicaStatus.FAILED;
      }

      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }

      this.emit('replicaRemovalFailed', {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Update replica status via CDC.
   * @param {string} replicaId - Replica ID.
   * @param {string} newStatus - New status.
   * @param {Object} additionalData - Additional data to update.
   * @return {Promise<void>}
   * @private
   */
  async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
    this.logger.debug('Updating replica status', {
      replicaId,
      newStatus,
      nodeId: this.nodeId,
    });

    if (!this.cdcIntegrationService) {
      this.logger.debug('CDC integration service not available');
      return;
    }

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
      // Don't throw - status update failure shouldn't block operation
    }
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
   * Get local replica by ID.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Local replica info or null.
   */
  getLocalReplica(replicaId) {
    return this.localReplicas.get(replicaId) || null;
  }

  /**
   * Get all local replicas.
   * @return {Array<Object>} Array of local replica info.
   */
  getAllLocalReplicas() {
    return Array.from(this.localReplicas.values());
  }

  /**
   * Register an existing replica (created during bootstrap).
   * This method is idempotent - duplicate registrations are ignored.
   * @param {Object} replicaInfo - Replica information.
   * @param {string} replicaInfo.replicaId - Unique replica identifier.
   * @param {string} replicaInfo.partitionId - Partition identifier.
   * @param {string} replicaInfo.tableName - Table name.
   * @param {string} [replicaInfo.status] - Replica status (default: 'active').
   * @param {Object} [replicaInfo.service] - Partition service instance.
   */
  registerExistingReplica(replicaInfo) {
    const {replicaId, partitionId, tableName, status, service} = replicaInfo;

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
   * Get handler statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      nodeId: this.nodeId,
      initialized: this.initialized,
      localReplicaCount: this.localReplicas.size,
      inProgressOperationCount: this.inProgressOperations.size,
    };
  }

  /**
   * Register this handler with a message router.
   * Registers at ${nodeId}/replica-handler address.
   * Requirements: 3.1
   * @param {Object} messageRouter - Message router instance.
   * @param {Object} [options={}] - Registration options.
   * @param {Object} [options.rpcClient] - RPC client for response handling.
   */
  registerWithRouter(messageRouter, options = {}) {
    if (!messageRouter) {
      this.logger.warn('No message router provided for registration');
      return;
    }

    const handlerAddress = `${this.nodeId}/replica-handler`;

    // Store RPC client if provided
    if (options.rpcClient) {
      this.rpcClient = options.rpcClient;
    }

    // Create handler that wraps handleMessage
    const routerHandler = async (envelope) => {
      const response = await this.handleMessage(envelope);

      // If RPC client is available, also notify it of the response
      // This handles the case where the coordinator is on the same node
      if (this.rpcClient && response.correlationId) {
        this.rpcClient.handleResponse(response.correlationId, response);
      }

      return {acknowledged: true, ...response};
    };

    messageRouter.register(handlerAddress, routerHandler);

    this.logger.info('Registered ReplicaHandler with message router', {
      address: handlerAddress,
      nodeId: this.nodeId,
    });
  }

  /**
   * Unregister this handler from a message router.
   * @param {Object} messageRouter - Message router instance.
   */
  unregisterFromRouter(messageRouter) {
    if (!messageRouter) {
      return;
    }

    const handlerAddress = `${this.nodeId}/replica-handler`;
    messageRouter.unregister(handlerAddress);

    this.logger.info('Unregistered ReplicaHandler from message router', {
      address: handlerAddress,
      nodeId: this.nodeId,
    });
  }

  /**
   * Shutdown the replica handler.
   */
  shutdown() {
    this.logger.info('Shutting down ReplicaHandler', {
      nodeId: this.nodeId,
    });

    this.inProgressOperations.clear();
    this.localReplicas.clear();
    this.initialized = false;

    this.emit('shutdown', {nodeId: this.nodeId});
  }
}

export {
  ReplicaHandler,
  MessageType,
  ResponseStatus,
};
