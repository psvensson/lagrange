/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
 */

import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import {AddressManager} from '../address/address-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {STATE, WORKFLOW_STEP} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
} from '../rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
  REPLICA_HANDLER_WORKFLOW,
} from './replica-handler-constants.js';

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

    this.nodeId = options.nodeId || REPLICA_HANDLER_DEFAULT.NODE_ID;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.rpcClient = options.rpcClient || null;
    this.createPartitionService = options.createPartitionService || null;
    this.dataDir = options.dataDir || REPLICA_HANDLER_DEFAULT.DATA_DIR;

    assertCritical(this.systemTableCache, REPLICA_HANDLER_ERROR_MSG.CACHE_NOT_AVAILABLE);
    assertCritical(
      typeof this.systemTableCache.filter === REPLICA_HANDLER_TYPEOF.FUNCTION,
      REPLICA_HANDLER_ERROR_MSG.CACHE_MISSING_FILTER,
    );
    assertCritical(this.cdcIntegrationService, REPLICA_HANDLER_ERROR_MSG.CDC_REQUIRED);
    assertCritical(
      this.createPartitionService,
      REPLICA_HANDLER_ERROR_MSG.CREATE_PARTITION_SERVICE_REQUIRED,
    );

    // Track local replicas by replica_id for idempotency checks
    this.localReplicas = new Map();

    // Track in-progress operations by operationId
    this.inProgressOperations = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.syncTimeoutMs = config.get(CONFIG_KEY.REPLICA_HANDLER_SYNC_TIMEOUT_MS) ||
      REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REPLICA_HANDLER_SUBSYSTEM) : console;

    this.initialized = false;
  }

  /**
   * Initialize the replica handler.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(REPLICA_HANDLER_LOG_MSG.INITIALIZING, {
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
    const type = payload?.[ReplicaOperationField.TYPE];

    this.logger.debug(REPLICA_HANDLER_LOG_MSG.MESSAGE_RECEIVED, {
      type,
      correlationId,
      operationId: payload?.operationId,
    });

    let response;
    if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
      response = await this.handleCreateReplica(payload);
    } else if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
      response = await this.handleRemoveReplica(payload);
    } else {
      const unknownMessageType = REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
      response = {
        status: ReplicaOperationResponseStatus.ERROR,
        error: unknownMessageType(type),
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
    const operationId = request?.[ReplicaOperationField.OPERATION_ID];
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];

    this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_REQUEST, {
      operationId,
      partitionId,
      replicaId,
      nodeId: this.nodeId,
    });

    if (!operationId || !partitionId || !replicaId) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS, {
        operationId,
        partitionId,
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.ERROR,
        error: REPLICA_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - existing replica
    const existingReplica = this.getLocalReplica(replicaId);
    if (existingReplica) {
      if (existingReplica.status === ReplicaStatus.ACTIVE) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, {
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        });
        return {
          status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        };
      }

      if (existingReplica.status === ReplicaStatus.CREATING ||
          existingReplica.status === ReplicaStatus.SYNCING) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, {
          replicaId: existingReplica.replicaId,
          status: existingReplica.status,
          nodeId: this.nodeId,
        });
        return {
          status: ReplicaOperationResponseStatus.IN_PROGRESS,
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        };
      }
    }

    // Check idempotency - in-progress operation
    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
        operationId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        operationId,
        nodeId: this.nodeId,
      };
    }

    // Track in-progress operation
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId,
      partitionId,
      startedAt: Date.now(),
    });

    // Track local replica
    this.localReplicas.set(replicaId, {
      replicaId,
      partitionId,
      tableName: null,
      status: ReplicaStatus.CREATING,
      service: null,
    });

    // Start async creation after ACK has returned.
    setImmediate(() => {
      this.createReplicaAsync({
        operationId,
        partitionId,
        replicaId,
      }).catch((error) => {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, {
          operationId,
          replicaId,
          error: error.message,
          stack: error.stack,
        });
      });
    });

    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      operationId,
      replicaId,
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
    } = request;

    try {
      const context = this.resolveReplicaContext(partitionId, replicaId);
      const {
        tableName,
        tableId,
        schema,
        keyRange,
        leaderAddress,
        replicaIds,
        peerAddresses,
      } = context;

      const replica = this.localReplicas.get(replicaId);
      if (replica) {
        replica.tableName = tableName;
      }

      // Generate database path
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);

      // Determine if this replica is joining an existing Raft group
      // If peerAddresses are provided, this is a new replica joining existing peers
      // It should start as a learner to avoid disrupting existing leadership
      const isJoiningExistingGroup = peerAddresses && peerAddresses.length > 0;

      const partitionService = await this.createPartitionService({
        partitionId,
        tableId,
        tableName,
        schema,
        keyRange,
        replicaId,
        replicaIds,
        peerAddresses: peerAddresses || [], // Pass unified peer addresses for routing
        nodeId: this.nodeId,
        dbPath,
        leaderAddress,
        isJoiningExistingGroup, // Start as learner if joining existing group
      });

      // Update local tracking
      const createdReplica = this.localReplicas.get(replicaId);
      if (createdReplica) {
        createdReplica.service = partitionService;
      }

      // Update status to syncing (via CDC - coordinator will see this)
      await this.updateOperationStep(operationId, WORKFLOW_STEP.SYNCING, {
        replicaId,
      });
      await this.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING, {
        partitionId,
      });

      // Sync from leader if address provided
      const replicaForSync = this.localReplicas.get(replicaId);
      if (replicaForSync) {
        replicaForSync.status = ReplicaStatus.SYNCING;
      }
      if (replicaForSync?.service && leaderAddress) {
        if (typeof replicaForSync.service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION) {
          await replicaForSync.service.syncFromLeader(leaderAddress);
        }
      }

      // Update status to active
      await this.updateOperationStep(operationId, WORKFLOW_STEP.ACTIVE, {
        replicaId,
      });
      await this.updateReplicaStatus(replicaId, ReplicaStatus.ACTIVE, {
        partitionId,
      });

      // Update local tracking
      if (replicaForSync) {
        replicaForSync.status = ReplicaStatus.ACTIVE;
      }

      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }

      this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_COMPLETED, {
        operationId,
        replicaId,
        partitionId,
        nodeId: this.nodeId,
      });

      this.emit(REPLICA_HANDLER_EVENT.CREATED, {
        operationId,
        replicaId,
        partitionId,
        nodeId: this.nodeId,
      });
    } catch (error) {
      this.logger.error(REPLICA_HANDLER_LOG_MSG.CREATE_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        stack: error.stack,
      });

      // Update status to failed
      await this.updateOperationStep(operationId, WORKFLOW_STEP.FAILED, {
        replicaId,
        errorMessage: error.message,
      });
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

      this.emit(REPLICA_HANDLER_EVENT.CREATION_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        nodeId: this.nodeId,
      });
      throw error;
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
    const operationId = request?.[ReplicaOperationField.OPERATION_ID];
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const reason = request?.[ReplicaOperationField.REASON];

    this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_REQUEST, {
      operationId,
      partitionId,
      replicaId,
      reason,
      nodeId: this.nodeId,
    });

    if (!operationId || !partitionId || !replicaId) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS, {
        operationId,
        partitionId,
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.ERROR,
        error: REPLICA_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
        nodeId: this.nodeId,
      };
    }

    // Check if replica exists
    const replica = this.getLocalReplica(replicaId);

    if (!replica) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, {
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.NOT_FOUND,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - already removing
    if (replica.status === ReplicaStatus.REMOVING) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, {
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - already removed
    if (replica.status === ReplicaStatus.REMOVED) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, {
        replicaId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.COMPLETED,
        replicaId,
        nodeId: this.nodeId,
      };
    }

    // Check idempotency - in-progress operation
    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
        operationId,
        nodeId: this.nodeId,
      });
      return {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        operationId,
        nodeId: this.nodeId,
      };
    }

    // Track in-progress operation
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId,
      partitionId,
      startedAt: Date.now(),
    });

    // Update local status
    replica.status = ReplicaStatus.REMOVING;

    // Start async removal after ACK has returned.
    setImmediate(() => {
      this.removeReplicaAsync({
        operationId,
        partitionId,
        replicaId,
        reason,
      }).catch((error) => {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, {
          operationId,
          replicaId,
          error: error.message,
          stack: error.stack,
        });
      });
    });

    return {
      status: ReplicaOperationResponseStatus.INITIATED,
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
      if (service && typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION) {
        this.logger.debug(REPLICA_HANDLER_LOG_MSG.GRACEFUL_SHUTDOWN, {
          replicaId,
          nodeId: this.nodeId,
        });
        await service.shutdown();
      }

      // Clean up local resources (SQLite files)
      await this.cleanupReplicaResources(partitionId, replicaId);

      // Update status to removed (via CDC)
      await this.updateOperationStep(operationId, WORKFLOW_STEP.REMOVED, {
        replicaId,
      });
      await this.updateReplicaStatus(replicaId, ReplicaStatus.REMOVED, {
        partitionId,
      });

      // Delete service row from services table
      try {
        await this.cdcIntegrationService.deleteSystemTableRow(
          SystemTableName.SERVICES,
          {service_id: replicaId},
        );
      } catch (deleteError) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.DELETE_SERVICE_ROW_FAILED, {
          replicaId,
          error: deleteError.message,
        });
        throw deleteError;
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

      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_COMPLETED, {
        operationId,
        replicaId,
        partitionId,
        reason,
        nodeId: this.nodeId,
      });

      this.emit(REPLICA_HANDLER_EVENT.REMOVED, {
        operationId,
        replicaId,
        partitionId,
        reason,
        nodeId: this.nodeId,
      });
    } catch (error) {
      this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        stack: error.stack,
      });

      // Update status to failed
      await this.updateOperationStep(operationId, WORKFLOW_STEP.FAILED, {
        replicaId,
        errorMessage: error.message,
      });
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

      this.emit(REPLICA_HANDLER_EVENT.REMOVAL_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        nodeId: this.nodeId,
      });
      throw error;
    }
  }

  /**
   * Update replica status via CDC.
   * Uses upsert to ensure the status is persisted even if the row doesn't exist yet
   * (handles race conditions during replica creation).
   * @param {string} replicaId - Replica ID.
   * @param {string} newStatus - New status.
   * @param {Object} additionalData - Additional data to update.
   * @return {Promise<void>}
   * @private
   */
  async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
    this.logger.debug(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS, {
      replicaId,
      newStatus,
      nodeId: this.nodeId,
    });

    try {
      const now = Date.now();
      const existing = this.systemTableCache.get(SystemTableName.SERVICES, replicaId);
      const partitionId = additionalData.partitionId !== undefined ?
        additionalData.partitionId :
        (existing?.partition_id || null);
      const addressManager = AddressManager.getInstance();
      const address = existing?.address ||
        addressManager.format(this.nodeId, REPLICA_HANDLER_SERVICE.TYPE, replicaId);

      // Upsert with full column set to avoid dropping existing fields.
      await this.cdcIntegrationService.upsertSystemTableRow(
        SystemTableName.SERVICES,
        {
          service_id: replicaId,
          service_type: existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
          node_id: existing?.node_id || this.nodeId,
          partition_id: partitionId,
          group_id: existing?.group_id || null,
          replica_id: existing?.replica_id || replicaId,
          raft_role: existing?.raft_role || null,
          status: newStatus,
          state_entered_at: existing?.state_entered_at || null,
          previous_state: existing?.previous_state || null,
          trigger_reason: existing?.trigger_reason || null,
          error_message: additionalData.errorMessage || existing?.error_message || null,
          address,
          created_at: existing?.created_at || now,
          updated_at: now,
        },
      );
    } catch (error) {
      this.logger.error(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED, {
        replicaId,
        newStatus,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update replica operation workflow step via CDC.
   * @param {string} operationId - Operation ID.
   * @param {string} workflowStep - Workflow step name.
   * @param {Object} [options={}] - Optional data for updates.
   * @param {string} [options.replicaId] - Replica ID to set if missing.
   * @param {string} [options.errorMessage] - Error message for failures.
   * @return {Promise<void>}
   * @private
   */
  async updateOperationStep(operationId, workflowStep, options = {}) {
    if (!operationId) {
      return;
    }

    const existing = this.systemTableCache.get(
      SystemTableName.REPLICA_OPERATIONS,
      operationId,
    );

    if (!existing && !options.replicaId) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.OPERATION_NOT_FOUND, {
        operationId,
        workflowStep,
        nodeId: this.nodeId,
      });
      return;
    }

    const now = Date.now();
    let stepsHistory = [];
    if (Array.isArray(existing?.steps_history)) {
      stepsHistory = [...existing.steps_history];
    } else if (existing?.steps_history) {
      try {
        stepsHistory = JSON.parse(existing.steps_history);
      } catch (error) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.PARSE_STEPS_HISTORY_FAILED, {
          operationId,
          error: error.message,
        });
        throw error;
      }
    }

    stepsHistory.push({step: workflowStep, timestamp: now});

    const status = workflowStep === WORKFLOW_STEP.FAILED ?
      ReplicaStatus.FAILED :
      (WORKFLOW_STEP_TO_STATUS[workflowStep] ||
        existing?.status ||
        ReplicaStatus.PENDING);

    const updateData = {
      workflow_step: workflowStep,
      status,
      updated_at: now,
      steps_history: JSON.stringify(stepsHistory),
    };

    if (options.replicaId) {
      updateData.replica_id = options.replicaId;
    }
    if (options.errorMessage) {
      updateData.error_message = options.errorMessage;
    }
    if (REPLICA_HANDLER_WORKFLOW.COMPLETION_STEPS.includes(workflowStep)) {
      updateData.completed_at = now;
    }

    try {
      if (!existing) {
        await this.cdcIntegrationService.upsertSystemTableRow(
          SystemTableName.REPLICA_OPERATIONS,
          {
            operation_id: operationId,
            replica_id: options.replicaId,
            partition_id: options.partitionId || null,
            workflow_step: updateData.workflow_step,
            status: updateData.status,
            steps_history: updateData.steps_history,
            error_message: updateData.error_message || null,
            created_at: now,
            updated_at: now,
            completed_at: updateData.completed_at || null,
          },
        );
        return;
      }

      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.REPLICA_OPERATIONS,
        {operation_id: operationId},
        updateData,
      );
    } catch (error) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED, {
        operationId,
        workflowStep,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Resolve replica metadata from the system table cache.
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {Object} Resolved metadata.
   * @private
   */
  resolveReplicaContext(partitionId, replicaId) {
    if (!this.systemTableCache) {
      throw new Error(REPLICA_HANDLER_ERROR_MSG.CACHE_NOT_AVAILABLE);
    }
    if (typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION) {
      throw new Error(REPLICA_HANDLER_ERROR_MSG.CACHE_MISSING_FILTER);
    }

    const partition = this.systemTableCache.get(
      SystemTableName.PARTITIONS,
      partitionId,
    );
    if (!partition) {
      const partitionMetadataMissing = REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
      throw new Error(partitionMetadataMissing(partitionId));
    }

    const table = this.systemTableCache.get(SystemTableName.TABLES, partition.table_id);
    if (!table) {
      const tableMetadataMissing = REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
      throw new Error(tableMetadataMissing(partition.table_id));
    }

    let schema = null;
    try {
      schema = typeof table.schema_definition === REPLICA_HANDLER_TYPEOF.STRING ?
        JSON.parse(table.schema_definition) :
        table.schema_definition;
    } catch (error) {
      const schemaParseFailed = REPLICA_HANDLER_ERROR_MSG.SCHEMA_PARSE_FAILED;
      throw new Error(schemaParseFailed(error.message));
    }

    const keyRange = {
      start: partition.partition_key_start || null,
      end: partition.partition_key_end || null,
    };

    const services = this.systemTableCache.filter(
      SystemTableName.SERVICES,
      (service) =>
        service.partition_id === partitionId &&
        service.service_type === REPLICA_HANDLER_SERVICE.TYPE,
    );

    const addressManager = AddressManager.getInstance();
    const replicaIds = [];
    const peerAddresses = [];
    const seenReplicaIds = new Set();

    for (const service of services) {
      const serviceReplicaId = service.service_id || service.replica_id;
      if (!serviceReplicaId) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }

      const peerAddress = service.address ||
        addressManager.format(service.node_id, REPLICA_HANDLER_SERVICE.TYPE, serviceReplicaId);
      if (!peerAddresses.includes(peerAddress)) {
        peerAddresses.push(peerAddress);
      }
    }

    if (replicaId && !seenReplicaIds.has(replicaId)) {
      replicaIds.push(replicaId);
      seenReplicaIds.add(replicaId);

      const selfAddress = addressManager.format(
        this.nodeId,
        REPLICA_HANDLER_SERVICE.TYPE,
        replicaId,
      );
      if (!peerAddresses.includes(selfAddress)) {
        peerAddresses.push(selfAddress);
      }
    }

    let leaderAddress = null;
    const leaderService = services.find((service) => service.raft_role === STATE.LEADER);

    if (leaderService) {
      leaderAddress = leaderService.address ||
        addressManager.format(
          leaderService.node_id,
          REPLICA_HANDLER_SERVICE.TYPE,
          leaderService.service_id,
        );
    }

    return {
      tableId: partition.table_id,
      tableName: table.table_name,
      schema,
      keyRange,
      leaderAddress,
      replicaIds,
      peerAddresses,
    };
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

    this.logger.debug(REPLICA_HANDLER_LOG_MSG.CLEANUP_RESOURCES, {
      replicaId,
      partitionId,
      dbPath,
      nodeId: this.nodeId,
    });

    try {
      // Remove SQLite database file
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_DB_FILE, {dbPath});
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
        if (files.length === REPLICA_HANDLER_NUM.ZERO) {
          fs.rmdirSync(partitionDir);
          this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_EMPTY_DIR, {partitionDir});
        }
      } catch (dirError) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, {
          replicaId,
          dbPath,
          error: dirError.message,
        });
        throw dirError;
      }
    } catch (error) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, {
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
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.ALREADY_REGISTERED, {
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

    this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_REPLICA, {
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
   * Registers at ${nodeId}/service/replica-handler address.
   * Requirements: 3.1
   * @param {Object} messageRouter - Message router instance.
   * @param {Object} [options={}] - Registration options.
   * @param {Object} [options.rpcClient] - RPC client for response handling.
   */
  registerWithRouter(messageRouter, options = {}) {
    if (!messageRouter) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER);
      return;
    }

    const handlerAddress = `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`;

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

    this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_ROUTER, {
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

    const handlerAddress = `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
      `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`;
    messageRouter.unregister(handlerAddress);

    this.logger.info(REPLICA_HANDLER_LOG_MSG.UNREGISTERED_ROUTER, {
      address: handlerAddress,
      nodeId: this.nodeId,
    });
  }

  /**
   * Shutdown the replica handler.
   */
  shutdown() {
    this.logger.info(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, {
      nodeId: this.nodeId,
    });

    this.inProgressOperations.clear();
    this.localReplicas.clear();
    this.initialized = false;

    this.emit(REPLICA_HANDLER_EVENT.SHUTDOWN, {nodeId: this.nodeId});
  }
}

export {
  ReplicaHandler,
};
