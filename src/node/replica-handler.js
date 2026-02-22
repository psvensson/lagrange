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
import {NUM, STATE, WORKFLOW_STEP} from '../constants/index.js';
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
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
  REPLICA_HANDLER_WORKFLOW,
} from './replica-handler-constants.js';
import {PARTITION_SERVICE_INIT_STAGE} from '../partition/partition-service-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  ReplicaCreationProgressReporter,
} from '../utils/replica-creation-progress-reporter.js';

const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SystemTableName).map((tableName) => `${tableName}-p1`),
);

const VOTER_READY_CHECK_INTERVAL_MS = 250;

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

    // Track live service references by replica_id (needed for shutdown, voter-readiness)
    this.localServices = new Map();
    // Backward-compatible replica metadata map used by lifecycle tests.
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

    // One-line staged progress reporting for dynamic replica creation.
    this.creationProgressReporter = new ReplicaCreationProgressReporter({
      logger: this.logger,
      formatLine: (progress, status, error) =>
        this.formatReplicaCreationProgressLine(progress, status, error),
      buildContext: (progress, status, error) =>
        this.buildReplicaCreationProgressContext(progress, status, error),
    });
    this.creationProgressByReplica = new Map();

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
   * Start staged one-line progress reporting for replica creation.
   * @param {Object} details - Initial progress details.
   * @return {Object} Progress context.
   * @private
   */
  startReplicaCreationProgress(details) {
    const progress = this.creationProgressReporter.start({
      ...details,
      stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
      peerTotal: Math.max(NUM.ZERO, details.peerTotal || NUM.ZERO),
      peerJoined: NUM.ZERO,
    });
    if (progress && progress.replicaId) {
      this.creationProgressByReplica.set(progress.replicaId, progress);
    }
    return progress;
  }

  /**
   * Update replica creation progress with stage callback data.
   * @param {Object|null} progress - Progress context.
   * @param {Object} stageEvent - Stage event payload.
   * @private
   */
  updateReplicaCreationProgress(progress, stageEvent) {
    if (!progress || !stageEvent) {
      return;
    }

    const update = {};
    if (stageEvent.stage) {
      update.stage = stageEvent.stage;
    }
    if (Number.isFinite(stageEvent.peerTotal)) {
      update.peerTotal = Math.max(NUM.ZERO, stageEvent.peerTotal);
    }
    if (Number.isFinite(stageEvent.peerJoined)) {
      update.peerJoined = Math.max(NUM.ZERO, stageEvent.peerJoined);
    }
    if (stageEvent.peerId) {
      update.peerId = stageEvent.peerId;
    }
    if (stageEvent.partitionId) {
      update.partitionId = stageEvent.partitionId;
    }

    this.creationProgressReporter.update(progress, update);
  }

  /**
   * Complete replica creation progress reporting.
   * @param {Object|null} progress - Progress context.
   * @param {string} finalStage - Final stage label.
   * @private
   */
  finishReplicaCreationProgress(progress, finalStage = ReplicaStatus.ACTIVE) {
    this.creationProgressReporter.finish(progress, {stage: finalStage});
    this.clearReplicaCreationProgress(progress);
  }

  /**
   * Fail replica creation progress reporting.
   * @param {Object|null} progress - Progress context.
   * @param {Error|string|null} error - Failure reason.
   * @param {string} finalStage - Final stage label.
   * @private
   */
  failReplicaCreationProgress(progress, error, finalStage = ReplicaStatus.FAILED) {
    this.creationProgressReporter.fail(progress, error, {stage: finalStage});
    this.clearReplicaCreationProgress(progress);
  }

  /**
   * Remove progress context tracking for a replica.
   * @param {Object|null} progress - Progress context.
   * @private
   */
  clearReplicaCreationProgress(progress) {
    if (progress && progress.replicaId) {
      this.creationProgressByReplica.delete(progress.replicaId);
    }
  }

  /**
   * Format staged replica creation progress line.
   * @param {Object} progress - Progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @return {string} Formatted line.
   * @private
   */
  formatReplicaCreationProgressLine(progress, status, error) {
    const spinner = progress.spinnerFrame || REPLICA_HANDLER_PROGRESS.SPINNER_IDLE;
    const peerTotal = Number.isFinite(progress.peerTotal) ? progress.peerTotal : NUM.ZERO;
    const peerJoined = Number.isFinite(progress.peerJoined) ? progress.peerJoined : NUM.ZERO;
    const countPendingReplica = !status && !this.localServices.has(progress.replicaId);
    const localReplicas = this.localServices.size +
      (countPendingReplica ? NUM.ONE : NUM.ZERO);
    const statusText = status ? ` status=${status}` : '';
    const errorText = error ? ` error=${this.formatReplicaCreationError(error)}` : '';

    return (
      `${REPLICA_HANDLER_PROGRESS.PREFIX} ${spinner} ` +
      `service=${progress.partitionId} replica=${progress.replicaId} ` +
      `type=${REPLICA_HANDLER_SERVICE.TYPE} stage=${progress.stage} ` +
      `peers=${peerJoined}/${peerTotal} local_replicas=${localReplicas}` +
      `${statusText}${errorText}`
    );
  }

  /**
   * Build structured fallback context for progress logs.
   * @param {Object} progress - Progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @return {Object} Structured context.
   * @private
   */
  buildReplicaCreationProgressContext(progress, status = null, error = null) {
    const context = {
      nodeId: this.nodeId,
      partitionId: progress.partitionId,
      replicaId: progress.replicaId,
      stage: progress.stage,
      peerTotal: progress.peerTotal,
      peerJoined: progress.peerJoined,
      localReplicas: this.localServices.size,
    };
    if (status) {
      context.status = status;
    }
    if (error) {
      context.error = this.formatReplicaCreationError(error);
    }
    return context;
  }

  /**
   * Normalize error values for progress output.
   * @param {Error|string|null} error - Error value.
   * @return {string} Error message.
   * @private
   */
  formatReplicaCreationError(error) {
    if (!error) {
      return '';
    }
    return typeof error === 'string' ? error : error.message;
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
    const tableName = request?.tableName || null;

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
    this.setLocalReplica(replicaId, {
      replicaId,
      partitionId,
      tableName,
      status: ReplicaStatus.CREATING,
    });
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId,
      partitionId,
      tableName,
      startedAt: Date.now(),
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
    const progress = this.startReplicaCreationProgress({
      partitionId,
      replicaId,
      peerTotal: NUM.ZERO,
    });

    try {
      this.updateReplicaCreationProgress(progress, {
        stage: REPLICA_HANDLER_PROGRESS.STAGE_RESOLVING_CONTEXT,
      });

      const context = this.resolveReplicaContext(partitionId, replicaId);
      const {
        tableName,
        tableId,
        schema,
        keyRange,
        leaderAddress,
        replicaIds,
        peerAddresses,
        existingReplicaCount,
      } = context;

      // Generate database path
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);

      // Determine if this replica is joining an existing Raft group
      // If peerAddresses are provided, this is a new replica joining existing peers
      // It should start as a learner to avoid disrupting existing leadership
      const isJoiningExistingGroup = existingReplicaCount > 0;

      this.updateReplicaCreationProgress(progress, {
        peerTotal: Array.isArray(replicaIds) ?
          Math.max(NUM.ZERO, replicaIds.length - NUM.ONE) :
          NUM.ZERO,
      });

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
        suppressLifecycleLogs: true,
        onInitializationStage: (stageEvent) =>
          this.updateReplicaCreationProgress(progress, stageEvent),
      });

      // Store service reference in localServices
      this.localServices.set(replicaId, partitionService);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        tableName,
        service: partitionService,
      });

      // Update status to syncing (via CDC - coordinator will see this)
      await this.updateOperationStep(operationId, WORKFLOW_STEP.SYNCING, {
        replicaId,
      });
      this.updateReplicaCreationProgress(progress, {
        stage: ReplicaStatus.SYNCING,
      });
      await this.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING, {
        partitionId,
      });

      // Sync from leader if address provided
      const service = this.localServices.get(replicaId);
      if (service && leaderAddress) {
        if (typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION) {
          await service.syncFromLeader(leaderAddress);
        }
      }

      if (this.shouldGateActivationOnVoterReadiness(
        partitionId,
        operationId,
        isJoiningExistingGroup,
      )) {
        this.updateReplicaCreationProgress(progress, {
          stage: REPLICA_HANDLER_PROGRESS.STAGE_WAITING_VOTER_READY,
        });
        await this.waitForVoterReadyActivation(replicaId, partitionId);
      }

      // Update status to active
      await this.updateOperationStep(operationId, WORKFLOW_STEP.ACTIVE, {
        replicaId,
      });
      await this.updateReplicaStatus(replicaId, ReplicaStatus.ACTIVE, {
        partitionId,
      });
      this.finishReplicaCreationProgress(progress, ReplicaStatus.ACTIVE);

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
      this.failReplicaCreationProgress(progress, error);
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
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.FAILED,
      });

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
    this.setLocalReplica(replicaId, {
      replicaId,
      partitionId,
      status: ReplicaStatus.REMOVING,
      service: replica.service || this.getTrackedService(replicaId),
    });

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
      const service = this.getTrackedService(replicaId);

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

      // Remove from local service tracking
      this.localServices.delete(replicaId);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: null,
      });

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
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.FAILED,
      });

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
      const localService = this.getTrackedService(replicaId);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: newStatus,
        service: localService,
      });

      const rowData = {
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
      };

      if (
        typeof this.cdcIntegrationService.upsertSystemTableRow ===
          REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        await this.cdcIntegrationService.upsertSystemTableRow(
          SystemTableName.SERVICES,
          rowData,
        );
      } else if (
        typeof this.cdcIntegrationService.updateSystemTableRow === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.SERVICES,
          {service_id: replicaId},
          rowData,
        );
      } else if (
        typeof this.cdcIntegrationService.insertSystemTableRow === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        await this.cdcIntegrationService.insertSystemTableRow(
          SystemTableName.SERVICES,
          rowData,
        );
      } else {
        throw new Error(REPLICA_HANDLER_LOG_MSG.CDC_UNAVAILABLE);
      }
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
   * Determine whether activation should be gated on voter readiness.
   * Critical partitions gate activation for explicit ADD operations. When ADD
   * metadata is not yet visible, we only gate if there is an in-flight paired
   * REMOVE for the same partition.
   * @param {string} partitionId - Partition ID.
   * @param {string} operationId - Replica operation ID.
   * @param {boolean} [isJoiningExistingGroup=false] - Whether this replica is
   * joining an existing Raft group.
   * @return {boolean} True when voter-ready activation is required.
   * @private
   */
  shouldGateActivationOnVoterReadiness(
    partitionId,
    operationId,
    isJoiningExistingGroup = false,
  ) {
    if (typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING ||
        !CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId)) {
      return false;
    }

    if (!this.systemTableCache ||
        typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION) {
      return false;
    }

    if (!operationId) {
      return isJoiningExistingGroup && this.hasInFlightCriticalRemove(partitionId);
    }

    const operationRow = this.systemTableCache.get(
      SystemTableName.REPLICA_OPERATIONS,
      operationId,
    );

    if (!operationRow) {
      return isJoiningExistingGroup && this.hasInFlightCriticalRemove(partitionId);
    }

    const operationType = typeof operationRow.type === REPLICA_HANDLER_TYPEOF.STRING ?
      operationRow.type.toUpperCase() :
      null;

    if (!operationType) {
      return false;
    }

    return operationType === 'ADD';
  }

  /**
   * Check whether a critical partition has an in-flight REMOVE operation.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when a non-terminal REMOVE exists.
   * @private
   */
  hasInFlightCriticalRemove(partitionId) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION) {
      return false;
    }

    const removeOperations = this.systemTableCache.filter(
      SystemTableName.REPLICA_OPERATIONS,
      (row) => row?.partition_id === partitionId &&
        typeof row?.type === REPLICA_HANDLER_TYPEOF.STRING &&
        row.type.toUpperCase() === 'REMOVE',
    );

    return removeOperations.some((row) => {
      const status = typeof row?.status === REPLICA_HANDLER_TYPEOF.STRING ?
        row.status.toLowerCase() :
        null;
      return status !== ReplicaStatus.ACTIVE &&
        status !== ReplicaStatus.REMOVED &&
        status !== ReplicaStatus.FAILED;
    });
  }

  /**
   * Wait for replica to become non-learner and routable.
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForVoterReadyActivation(replicaId, partitionId) {
    this.logger.info(REPLICA_HANDLER_LOG_MSG.WAITING_VOTER_READY, {
      replicaId,
      partitionId,
      timeoutMs: this.syncTimeoutMs,
      nodeId: this.nodeId,
    });

    const deadline = Date.now() + this.syncTimeoutMs;
    while (Date.now() <= deadline) {
      if (this.isReplicaVoterReady(replicaId)) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.VOTER_READY_ACTIVATED, {
          replicaId,
          partitionId,
          nodeId: this.nodeId,
        });
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, VOTER_READY_CHECK_INTERVAL_MS);
      });
    }

    this.logger.warn(REPLICA_HANDLER_LOG_MSG.VOTER_READY_TIMEOUT, {
      replicaId,
      partitionId,
      timeoutMs: this.syncTimeoutMs,
      nodeId: this.nodeId,
    });

    throw new Error(
      `Replica ${replicaId} did not become voter-ready within ${this.syncTimeoutMs}ms`,
    );
  }

  /**
   * Check if a local replica is voter-ready and routable.
   * @param {string} replicaId - Replica ID.
   * @return {boolean} True when replica is non-learner with routable address.
   * @private
   */
  isReplicaVoterReady(replicaId) {
    const service = this.getTrackedService(replicaId);
    if (!service) {
      return false;
    }

    const role = typeof service.getRole === REPLICA_HANDLER_TYPEOF.FUNCTION ?
      service.getRole() :
      service.role;
    const normalizedRole = typeof role === REPLICA_HANDLER_TYPEOF.STRING ?
      role.toLowerCase() :
      null;

    if (!normalizedRole || normalizedRole === RAFT_ROLE.LEARNER) {
      return false;
    }

    const serviceRow = this.systemTableCache.get(SystemTableName.SERVICES, replicaId);
    if (!serviceRow || !serviceRow.address) {
      return false;
    }

    if (serviceRow.status === ReplicaStatus.FAILED ||
        serviceRow.status === ReplicaStatus.REMOVING ||
        serviceRow.status === ReplicaStatus.REMOVED) {
      return false;
    }

    return true;
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
        // Avoid creating partial replica_operations rows when cache lag causes
        // the operation row to be temporarily missing. A partial upsert can
        // violate NOT NULL constraints (e.g., type/source/target columns).
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.REPLICA_OPERATIONS,
          {operation_id: operationId},
          updateData,
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
    const activeExistingReplicaIds = new Set();

    for (const service of services) {
      const serviceReplicaId = service.service_id || service.replica_id;
      if (!serviceReplicaId) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }
      if (service.status !== ReplicaStatus.REMOVED &&
          service.status !== ReplicaStatus.FAILED) {
        activeExistingReplicaIds.add(serviceReplicaId);
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
      existingReplicaCount: activeExistingReplicaIds.size,
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
   * Reads from System_Table_Cache and merges with local service reference.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Local replica info or null.
   */
  getLocalReplica(replicaId) {
    const localReplica = this.localReplicas.get(replicaId);
    if (localReplica && typeof localReplica === REPLICA_HANDLER_TYPEOF.OBJECT) {
      const trackedService = this.getTrackedService(replicaId);
      if (!localReplica.replicaId) {
        localReplica.replicaId = replicaId;
      }
      if (localReplica.service === undefined) {
        localReplica.service = trackedService;
      } else if (!localReplica.service && trackedService) {
        localReplica.service = trackedService;
      }
      return localReplica;
    }

    // Read from cache (single source of truth for replica state)
    const cacheEntry = this.systemTableCache.get(SystemTableName.SERVICES, replicaId);
    const service = this.getTrackedService(replicaId);

    // Check if this replica belongs to this node
    if (!cacheEntry || cacheEntry.node_id !== this.nodeId) {
      // Compatibility fallback for legacy tests that seed in-memory local replicas
      // directly on the lifecycle manager.
      if (service &&
          typeof service === REPLICA_HANDLER_TYPEOF.OBJECT &&
          service.status) {
        const compatibilityService = service.service || (
          typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION ||
          typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION ?
            service :
            null
        );
        return {
          replicaId: service.replicaId || replicaId,
          partitionId: service.partitionId || null,
          tableName: service.tableName || null,
          status: service.status,
          service: compatibilityService,
        };
      }
      return null;
    }

    // Merge cache state with local service reference
    return {
      replicaId: cacheEntry.service_id || cacheEntry.replica_id,
      partitionId: cacheEntry.partition_id,
      tableName: null, // Not stored in services table
      status: cacheEntry.status,
      service: service || null,
    };
  }

  /**
   * Get all local replicas.
   * Reads from System_Table_Cache filtered by node_id.
   * @return {Array<Object>} Array of local replica info.
   */
  getAllLocalReplicas() {
    const replicasById = new Map();
    const localServices = this.systemTableCache.filter(
      SystemTableName.SERVICES,
      (row) => row.node_id === this.nodeId,
    );

    for (const cacheEntry of localServices) {
      const replicaId = cacheEntry.service_id || cacheEntry.replica_id;
      const tracked = this.localReplicas.get(replicaId);
      replicasById.set(replicaId, {
        replicaId,
        partitionId: cacheEntry.partition_id,
        tableName: tracked?.tableName || null,
        status: tracked?.status || cacheEntry.status,
        service: this.getTrackedService(replicaId),
      });
    }

    for (const [replicaId, trackedReplica] of this.localReplicas.entries()) {
      if (!replicasById.has(replicaId)) {
        replicasById.set(replicaId, {
          replicaId: trackedReplica?.replicaId || replicaId,
          partitionId: trackedReplica?.partitionId || null,
          tableName: trackedReplica?.tableName || null,
          status: trackedReplica?.status || null,
          service: this.getTrackedService(replicaId),
        });
      }
    }

    return Array.from(replicasById.values());
  }

  /**
   * Register an existing replica (created during bootstrap).
   * Stores only the service reference in localServices.
   * This method is idempotent - duplicate registrations are ignored.
   * @param {Object} replicaInfo - Replica information.
   * @param {string} replicaInfo.replicaId - Unique replica identifier.
   * @param {string} replicaInfo.partitionId - Partition identifier.
   * @param {string} replicaInfo.tableName - Table name.
   * @param {string} [replicaInfo.status] - Replica status (default: 'active').
   * @param {Object} [replicaInfo.service] - Partition service instance.
   */
  registerExistingReplica(replicaInfo) {
    const {replicaId, service} = replicaInfo;

    // Idempotent: no error on duplicate registration
    if (this.localReplicas.has(replicaId)) {
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.ALREADY_REGISTERED, {
        replicaId,
        nodeId: this.nodeId,
      });
      return;
    }

    this.setLocalReplica(replicaId, {
      replicaId,
      partitionId: replicaInfo.partitionId || null,
      tableName: replicaInfo.tableName || null,
      status: replicaInfo.status || ReplicaStatus.ACTIVE,
      service: service || null,
    });

    // Store service reference when provided
    if (service) {
      this.localServices.set(replicaId, service);
    }

    this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_REPLICA, {
      replicaId,
      partitionId: replicaInfo.partitionId,
      tableName: replicaInfo.tableName,
      nodeId: this.nodeId,
    });
  }

  /**
   * Aggregate pending-request tracker telemetry from local replica services.
   * @return {Object}
   * @private
   */
  getPendingRequestTrackerAggregate() {
    const aggregate = {
      pendingCount: NUM.ZERO,
      maxPendingRequests: NUM.ZERO,
      availableCapacity: NUM.ZERO,
      saturationPercent: NUM.ZERO,
      trackedTotal: NUM.ZERO,
      resolvedTotal: NUM.ZERO,
      rejectedTotal: NUM.ZERO,
      timedOutTotal: NUM.ZERO,
      staleCleanedTotal: NUM.ZERO,
      backpressureRejectTotal: NUM.ZERO,
      maxPendingObserved: NUM.ZERO,
      replicaCountWithTracker: NUM.ZERO,
    };

    for (const service of this.localServices.values()) {
      if (!service || typeof service.getStats !== REPLICA_HANDLER_TYPEOF.FUNCTION) {
        continue;
      }

      let serviceStats = null;
      try {
        serviceStats = service.getStats();
      } catch (_error) {
        continue;
      }

      const tracker = serviceStats?.pendingRequestTracker;
      if (!tracker || typeof tracker !== REPLICA_HANDLER_TYPEOF.OBJECT) {
        continue;
      }

      aggregate.replicaCountWithTracker += NUM.ONE;
      aggregate.pendingCount += Number.isFinite(tracker.pendingCount) ?
        tracker.pendingCount :
        NUM.ZERO;
      aggregate.maxPendingRequests += Number.isFinite(tracker.maxPendingRequests) ?
        tracker.maxPendingRequests :
        NUM.ZERO;
      aggregate.availableCapacity += Number.isFinite(tracker.availableCapacity) ?
        tracker.availableCapacity :
        NUM.ZERO;
      aggregate.trackedTotal += Number.isFinite(tracker.trackedTotal) ?
        tracker.trackedTotal :
        NUM.ZERO;
      aggregate.resolvedTotal += Number.isFinite(tracker.resolvedTotal) ?
        tracker.resolvedTotal :
        NUM.ZERO;
      aggregate.rejectedTotal += Number.isFinite(tracker.rejectedTotal) ?
        tracker.rejectedTotal :
        NUM.ZERO;
      aggregate.timedOutTotal += Number.isFinite(tracker.timedOutTotal) ?
        tracker.timedOutTotal :
        NUM.ZERO;
      aggregate.staleCleanedTotal += Number.isFinite(tracker.staleCleanedTotal) ?
        tracker.staleCleanedTotal :
        NUM.ZERO;
      aggregate.backpressureRejectTotal +=
        Number.isFinite(tracker.backpressureRejectTotal) ?
          tracker.backpressureRejectTotal :
          NUM.ZERO;
      aggregate.maxPendingObserved = Math.max(
        aggregate.maxPendingObserved,
        Number.isFinite(tracker.maxPendingObserved) ?
          tracker.maxPendingObserved :
          NUM.ZERO,
      );
    }

    if (aggregate.maxPendingRequests > NUM.ZERO) {
      aggregate.saturationPercent = Math.round(
        (aggregate.pendingCount / aggregate.maxPendingRequests) * NUM.HUNDRED,
      );
    }

    return aggregate;
  }

  /**
   * Get handler statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    const pendingRequestTracker = this.getPendingRequestTrackerAggregate();
    return {
      nodeId: this.nodeId,
      initialized: this.initialized,
      localReplicaCount: this.localReplicas.size,
      inProgressOperationCount: this.inProgressOperations.size,
      pendingRequestTracker,
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

    for (const progress of this.creationProgressByReplica.values()) {
      this.creationProgressReporter.fail(
        progress,
        REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN,
        {stage: ReplicaStatus.FAILED},
      );
    }
    this.creationProgressByReplica.clear();

    this.inProgressOperations.clear();
    this.localServices.clear();
    this.localReplicas.clear();
    this.initialized = false;

    this.emit(REPLICA_HANDLER_EVENT.SHUTDOWN, {nodeId: this.nodeId});
  }

  /**
   * Get service reference for a replica from local tracking.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Service instance or null.
   * @private
   */
  getTrackedService(replicaId) {
    const service = this.localServices.get(replicaId);
    if (service) {
      return service;
    }

    const trackedReplica = this.localReplicas.get(replicaId);
    if (!trackedReplica || typeof trackedReplica !== REPLICA_HANDLER_TYPEOF.OBJECT) {
      return null;
    }

    if (trackedReplica.service) {
      return trackedReplica.service;
    }
    if (typeof trackedReplica.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION ||
        typeof trackedReplica.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION) {
      return trackedReplica;
    }

    return null;
  }

  /**
   * Update local replica metadata while preserving existing fields.
   * @param {string} replicaId - Replica ID.
   * @param {Object} updates - Fields to merge.
   * @return {Object} Updated local replica metadata.
   * @private
   */
  setLocalReplica(replicaId, updates) {
    const existing = this.localReplicas.get(replicaId) || {};
    const merged = {
      ...existing,
      ...updates,
      replicaId: updates.replicaId || existing.replicaId || replicaId,
    };
    this.localReplicas.set(replicaId, merged);
    return merged;
  }
}

export {
  ReplicaHandler,
};
