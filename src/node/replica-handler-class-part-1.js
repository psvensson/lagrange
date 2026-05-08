/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
 */
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, WORKFLOW_STEP} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {PARTITION_SERVICE_INIT_STAGE} from '../partition/partition-service-constants.js';
import {ReplicaCreationProgressReporter} from '../utils/replica-creation-progress-reporter.js';
import {ReplicaStateMachine} from './replica-state-machine.js';
const REPLICA_HANDLER_LEADER_HANDOFF_STATE = Object.freeze({
  COMPLETED: 'completed',
  NOT_APPLICABLE: 'not_applicable',
  NOT_SUPPORTED: 'not_supported',
});
const REPLICA_HANDLER_LITERAL = Object.freeze({
  READY_LEASE_EXPIRES_AT: 'ready_lease_expires_at',
  READYLEASEEXPIRESAT: 'readyLeaseExpiresAt',
  READYLEASEEXPIRESATMS: 'readyLeaseExpiresAtMs',
  READYLEASEEXPIRES: 'readyLeaseExpires',
  VALUE: '',
  DURABLE_REMOVE_CLEANUP_COMPLETE: 'durable_remove_cleanup_complete',
  ADD: 'ADD',
  REPLICAHANDLER: 'ReplicaHandler',
  READ: 'read',
  SYSTEM_TABLE_QUERY_FAILED: 'system table query failed',
});
const REPLICA_CREATE_IN_PROGRESS_OUTCOME_BY_STATUS = Object.freeze(
  new Map([
    [
      ReplicaStatus.SYNCING,
      Object.freeze({
        outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
      }),
    ],
  ]),
);
/**
 * ReplicaHandler handles replica creation and removal requests on target nodes.
 * Returns immediately with status, then performs async work.
 */
class ReplicaHandlerPart1 extends EventEmitter {
  /**
   * Create a new ReplicaHandler.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID hosting this handler.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Object} options.rpcClient - RPC client for responses.
   * @param {Function} options.createPartitionService - Factory for creating partitions.
   * @param {string} options.dataDir - Base data directory for partition storage.
   * @param {Object} [options.replicaStateMachine] - Replica lifecycle state machine.
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || REPLICA_HANDLER_DEFAULT.NODE_ID;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.partitionServiceRowOwner = null;
    this.rpcClient = options.rpcClient || null;
    this.createPartitionService = options.createPartitionService || null;
    this.dataDir = options.dataDir || REPLICA_HANDLER_DEFAULT.DATA_DIR;
    assertCritical(
      this.systemTableCache,
      REPLICA_HANDLER_ERROR_MSG.CACHE_NOT_AVAILABLE,
    );
    assertCritical(
      typeof this.systemTableCache.filter === REPLICA_HANDLER_TYPEOF.FUNCTION,
      REPLICA_HANDLER_ERROR_MSG.CACHE_MISSING_FILTER,
    );
    assertCritical(
      this.cdcIntegrationService,
      REPLICA_HANDLER_ERROR_MSG.CDC_REQUIRED,
    );
    assertCritical(
      this.createPartitionService,
      REPLICA_HANDLER_ERROR_MSG.CREATE_PARTITION_SERVICE_REQUIRED,
    );
    this.replicaStateMachine =
      options.replicaStateMachine ||
      new ReplicaStateMachine({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        systemTableCache: this.systemTableCache,
      });
    // Track live service references by replica_id (needed for shutdown, voter-readiness)
    this.localServices = new Map();
    // Backward-compatible replica metadata map used by lifecycle tests.
    this.localReplicas = new Map();
    // Track in-progress operations by operationId
    this.inProgressOperations = new Map();
    this.operationTasks = new Set();
    this.shuttingDown = false;
    this.shutdownPromise = null;
    this.hydratedMetadataByPartitionId = new Map();
    // Executor outcome emitter — replaces direct replica_operations writes.
    // The coordinator subscribes to outcomes via this emitter (Task 3.2).
    this.executorOutcomeEmitter = options.executorOutcomeEmitter || null;
    // Configuration
    const config = ConfigurationManager.getInstance();
    this.syncTimeoutMs =
      config.get(CONFIG_KEY.REPLICA_HANDLER_SYNC_TIMEOUT_MS) ||
      REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS;
    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REPLICA_HANDLER_SUBSYSTEM) :
      console;
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
  failReplicaCreationProgress(
    progress,
    error,
    finalStage = ReplicaStatus.FAILED,
  ) {
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
   * Track one detached async replica operation so shutdown can await it.
   * @param {Promise<*>} taskPromise
   * @return {Promise<*>}
   * @private
   */
  registerOperationTask(taskPromise) {
    let trackedTask = null;
    trackedTask = Promise.resolve(taskPromise).finally(() => {
      this.operationTasks.delete(trackedTask);
    });
    this.operationTasks.add(trackedTask);
    return trackedTask;
  }
  /**
   * Throw when the replica handler is shutting down.
   * @return {void}
   * @private
   */
  throwIfShuttingDown() {
    if (this.shuttingDown) {
      throw new Error(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN);
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
    const spinner =
      progress.spinnerFrame || REPLICA_HANDLER_PROGRESS.SPINNER_IDLE;
    const peerTotal = Number.isFinite(progress.peerTotal) ?
      progress.peerTotal :
      NUM.ZERO;
    const peerJoined = Number.isFinite(progress.peerJoined) ?
      progress.peerJoined :
      NUM.ZERO;
    const countPendingReplica =
      !status && !this.localServices.has(progress.replicaId);
    const localReplicas =
      this.localServices.size + (countPendingReplica ? NUM.ONE : NUM.ZERO);
    const statusText = status ? ` status=${status}` : '';
    const errorText = error ?
      ` error=${this.formatReplicaCreationError(error)}` :
      '';
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
      return REPLICA_HANDLER_LITERAL.VALUE;
    }
    return typeof error === REPLICA_HANDLER_TYPEOF.STRING ?
      error :
      error.message;
  }
  buildReplicaOperationResponse(status, fields = {}) {
    return {
      status,
      ...fields,
    };
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
    } else if (type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
      response = await this.handleStepDownReplica(payload);
    } else {
      const unknownMessageType = REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
      response = this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {error: unknownMessageType(type)},
      );
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
    const explicitOperationType =
      typeof request?.[ReplicaOperationField.OPERATION_TYPE] ===
      REPLICA_HANDLER_TYPEOF.STRING ?
        request[ReplicaOperationField.OPERATION_TYPE] :
        null;
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const bootstrapReplicaIds = Array.isArray(
      request?.[ReplicaOperationField.REPLICA_IDS],
    ) ?
      request[ReplicaOperationField.REPLICA_IDS] :
      [];
    const bootstrapPeerAddresses = Array.isArray(
      request?.[ReplicaOperationField.PEER_ADDRESSES],
    ) ?
      request[ReplicaOperationField.PEER_ADDRESSES] :
      [];
    const bootstrapTableMetadata =
      request?.[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] &&
      typeof request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] ===
        REPLICA_HANDLER_TYPEOF.OBJECT ?
        request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] :
        null;
    const bootstrapPartitionMetadata =
      request?.[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] &&
      typeof request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] ===
        REPLICA_HANDLER_TYPEOF.OBJECT ?
        request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] :
        null;
    const tableName = request?.tableName || null;
    this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_REQUEST, {
      operationId,
      explicitOperationType,
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
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error: REPLICA_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
          nodeId: this.nodeId,
        },
      );
    }
    // Check idempotency - existing replica
    const existingReplica = this.getLocalReplica(replicaId);
    const needsReplicaRuntimeRepair =
      existingReplica?.status === ReplicaStatus.ACTIVE &&
      !this.isReplicaCreateAlreadySatisfied(existingReplica);
    if (existingReplica) {
      if (this.isReplicaCreateAlreadySatisfied(existingReplica)) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, {
          replicaId: existingReplica.replicaId,
          nodeId: this.nodeId,
        });
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
          operationId,
          WORKFLOW_STEP.ACTIVE,
          {replicaId: existingReplica.replicaId},
        );
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          {
            replicaId: existingReplica.replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      if (
        existingReplica.status === ReplicaStatus.PENDING ||
        existingReplica.status === ReplicaStatus.CREATING ||
        existingReplica.status === ReplicaStatus.SYNCING
      ) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, {
          replicaId: existingReplica.replicaId,
          status: existingReplica.status,
          nodeId: this.nodeId,
        });
        this.emitReplicaCreateInProgressOutcome(
          existingReplica,
          operationId,
        );
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.IN_PROGRESS,
          {
            replicaId: existingReplica.replicaId,
            nodeId: this.nodeId,
          },
        );
      }
    }
    // Check idempotency - in-progress operation
    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
        operationId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS,
        {
          operationId,
          nodeId: this.nodeId,
        },
      );
    }
    // Track in-progress operation
    this.setLocalReplica(replicaId, {
      replicaId,
      partitionId,
      tableName,
      status: ReplicaStatus.PENDING,
    });
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId,
      partitionId,
      tableName,
      startedAt: Date.now(),
    });
    // Start async creation after ACK has returned.
    this.registerOperationTask(
      new Promise((resolve) => {
        setImmediate(() => {
          if (this.shuttingDown) {
            this.inProgressOperations.delete(operationId);
            this.localServices.delete(replicaId);
            this.localReplicas.delete(replicaId);
            resolve();
            return;
          }
          resolve(
            this.createReplicaAsync({
              operationId,
              explicitOperationType,
              partitionId,
              replicaId,
              bootstrapReplicaIds,
              bootstrapPeerAddresses,
              bootstrapTableMetadata,
              bootstrapPartitionMetadata,
              skipLifecycleStatusPersistence: needsReplicaRuntimeRepair,
            }).catch((error) => {
              this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack,
              });
            }),
          );
        });
      }),
    );
    return this.buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.INITIATED,
      {
        operationId,
        replicaId,
        nodeId: this.nodeId,
      },
    );
  }
  emitReplicaCreateInProgressOutcome(existingReplica, operationId) {
    const outcome = REPLICA_CREATE_IN_PROGRESS_OUTCOME_BY_STATUS.get(
      existingReplica?.status,
    );
    if (!outcome) {
      return false;
    }
    this.emitExecutorOutcome(
      outcome.outcomeType,
      operationId,
      outcome.workflowStep,
      {replicaId: existingReplica.replicaId},
    );
    return true;
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
      explicitOperationType,
      partitionId,
      replicaId,
      bootstrapReplicaIds,
      bootstrapPeerAddresses,
      bootstrapTableMetadata,
      bootstrapPartitionMetadata,
      skipLifecycleStatusPersistence = false,
    } = request;
    const progress = this.startReplicaCreationProgress({
      partitionId,
      replicaId,
      peerTotal: NUM.ZERO,
    });
    let partitionService = null;
    try {
      this.throwIfShuttingDown();
      if (!skipLifecycleStatusPersistence) {
        await this.updateReplicaStatus(replicaId, ReplicaStatus.PENDING, {
          partitionId,
        });
        this.throwIfShuttingDown();
        await this.updateReplicaStatus(replicaId, ReplicaStatus.CREATING, {
          partitionId,
        });
      } else {
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          status: ReplicaStatus.CREATING,
        });
      }
      this.applyBootstrapMetadataPayload({
        partitionId,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata,
      });
      this.updateReplicaCreationProgress(progress, {
        stage: REPLICA_HANDLER_PROGRESS.STAGE_RESOLVING_CONTEXT,
      });
      const context = await this.resolveReplicaContextWithRetry(
        partitionId,
        replicaId,
        {
          bootstrapReplicaIds,
          bootstrapPeerAddresses,
          bootstrapTableMetadata,
          bootstrapPartitionMetadata,
        },
      );
      this.throwIfShuttingDown();
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
      // Determine if this replica is joining an already-established Raft group.
      // Provisional sibling service rows alone are not enough; fresh partition
      // bring-up must bootstrap voters until a leader or active voter exists.
      const isJoiningExistingGroup = existingReplicaCount > 0;
      this.updateReplicaCreationProgress(progress, {
        peerTotal: Array.isArray(replicaIds) ?
          Math.max(NUM.ZERO, replicaIds.length - NUM.ONE) :
          NUM.ZERO,
      });
      partitionService = await this.createPartitionService({
        partitionId,
        tableId,
        tableName,
        schema,
        keyRange,
        replicaId,
        replicaIds,
        peerAddresses: peerAddresses || [],
        // Pass unified peer addresses for routing
        nodeId: this.nodeId,
        dbPath,
        leaderAddress,
        isJoiningExistingGroup,
        // Start as learner if joining existing group
        suppressLifecycleLogs: true,
        onInitializationStage: (stageEvent) =>
          this.updateReplicaCreationProgress(progress, stageEvent),
      });
      if (
        this.shuttingDown &&
        typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        await partitionService.shutdown();
      }
      this.throwIfShuttingDown();
      // Store service reference in localServices
      this.localServices.set(replicaId, partitionService);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        tableName,
        service: partitionService,
      });
      // Emit syncing outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
        operationId,
        WORKFLOW_STEP.SYNCING,
        {replicaId},
      );
      this.updateReplicaCreationProgress(progress, {
        stage: ReplicaStatus.SYNCING,
      });
      if (!skipLifecycleStatusPersistence) {
        await this.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING, {
          partitionId,
        });
      } else {
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          tableName,
          status: ReplicaStatus.SYNCING,
          service: partitionService,
        });
      }
      // Sync from leader if address provided
      const service = this.localServices.get(replicaId);
      if (service && leaderAddress) {
        if (typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION) {
          await service.syncFromLeader(leaderAddress);
        }
      }
      this.throwIfShuttingDown();
      if (
        this.shouldGateActivationOnVoterReadiness(
          partitionId,
          operationId,
          isJoiningExistingGroup,
          explicitOperationType,
        )
      ) {
        this.updateReplicaCreationProgress(progress, {
          stage: REPLICA_HANDLER_PROGRESS.STAGE_WAITING_VOTER_READY,
        });
        await this.waitForVoterReadyActivation(replicaId, partitionId);
      }
      // Emit active outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        operationId,
        WORKFLOW_STEP.ACTIVE,
        {replicaId},
      );
      if (!skipLifecycleStatusPersistence) {
        await this.persistReplicaStatusWithRetry(
          replicaId,
          ReplicaStatus.ACTIVE,
          {partitionId},
        );
      } else {
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          tableName,
          status: ReplicaStatus.ACTIVE,
          service: partitionService,
        });
      }
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
      if (this.shuttingDown) {
        this.clearReplicaCreationProgress(progress);
        if (
          partitionService &&
          typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          try {
            await partitionService.shutdown();
          } catch (_shutdownErr) {
            void _shutdownErr;
          }
        }
        if (operationId) {
          this.inProgressOperations.delete(operationId);
        }
        this.localServices.delete(replicaId);
        this.localReplicas.delete(replicaId);
        return;
      }
      this.failReplicaCreationProgress(progress, error);
      this.logger.error(REPLICA_HANDLER_LOG_MSG.CREATE_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        stack: error.stack,
      });
      const failedOutcomeOptions = {
        replicaId,
        errorMessage: error.message,
      };
      const errorCode =
        typeof error?.errorCode === REPLICA_HANDLER_TYPEOF.STRING ?
          error.errorCode :
          typeof error?.code === REPLICA_HANDLER_TYPEOF.STRING ?
            error.code :
            REPLICA_HANDLER_LITERAL.VALUE;
      if (errorCode.length > NUM.ZERO) {
        failedOutcomeOptions.errorCode = errorCode;
      }
      if (
        Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > NUM.ZERO
      ) {
        failedOutcomeOptions.retryAfterMs = Math.floor(error.retryAfterMs);
      }
      if (error?.deferRetry === true) {
        failedOutcomeOptions.deferRetry = true;
      }
      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        failedOutcomeOptions,
      );
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
   * @param {string} replicaId
   * @return {boolean}
   * @private
   */
  hasInProgressReplicaRemoval(replicaId) {
    for (const operation of this.inProgressOperations.values()) {
      if (
        operation?.type === ReplicaOperationMessageType.REMOVE_REPLICA &&
        operation?.replicaId === replicaId
      ) {
        return true;
      }
    }
    return false;
  }
  /**
   * @param {string} operationId
   * @param {string} partitionId
   * @param {string} replicaId
   * @return {void}
   * @private
   */
  trackReplicaRemovalOperation(operationId, partitionId, replicaId) {
    this.inProgressOperations.set(operationId, {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId,
      partitionId,
      startedAt: Date.now(),
    });
  }
  /**
   * @param {Object} request
   * @return {void}
   * @private
   */
  startRemoveReplicaAsync(request) {
    const operationId = request?.[ReplicaOperationField.OPERATION_ID];
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const reason = request?.[ReplicaOperationField.REASON];
    this.registerOperationTask(
      new Promise((resolve) => {
        setImmediate(() => {
          if (this.shuttingDown) {
            this.inProgressOperations.delete(operationId);
            resolve();
            return;
          }
          resolve(
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
            }),
          );
        });
      }),
    );
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
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error: REPLICA_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
          nodeId: this.nodeId,
        },
      );
    }
    // Check if replica exists
    const replica = this.getLocalReplica(replicaId);
    if (!replica) {
      try {
        await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
      } catch (error) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          stack: error.stack,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: error.message,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, {
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.NOT_FOUND,
        {
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    // Check idempotency - already removing
    if (replica.status === ReplicaStatus.REMOVING) {
      if (!this.hasInProgressReplicaRemoval(replicaId)) {
        this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
        this.startRemoveReplicaAsync(request);
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, {
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS,
        {
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    // Check idempotency - already removed
    if (replica.status === ReplicaStatus.REMOVED) {
      try {
        await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
      } catch (error) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          stack: error.stack,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: error.message,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, {
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    // Check idempotency - in-progress operation
    if (this.inProgressOperations.has(operationId)) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
        operationId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS,
        {
          operationId,
          nodeId: this.nodeId,
        },
      );
    }
    // Track in-progress operation
    this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
    const removalIngressStatus =
      replica.status === ReplicaStatus.FAILED ?
        ReplicaStatus.FAILED :
        ReplicaStatus.REMOVING;
    this.setLocalReplica(replicaId, {
      replicaId,
      partitionId,
      status: removalIngressStatus,
      service: replica.service || this.getTrackedService(replicaId),
    });
    // Start async removal after ACK has returned.
    this.startRemoveReplicaAsync(request);
    return this.buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.INITIATED,
      {
        operationId,
        replicaId,
        nodeId: this.nodeId,
      },
    );
  }
  /**
   * Handle STEP_DOWN_REPLICA request.
   * Returns immediately with a synchronous leader-handoff result.
   * @param {Object} request - STEP_DOWN_REPLICA request.
   * @return {Promise<Object>} Response.
   */
  async handleStepDownReplica(request) {
    const operationId = request?.[ReplicaOperationField.OPERATION_ID];
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const reason = request?.[ReplicaOperationField.REASON];
    this.logger.info(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_REQUEST, {
      operationId,
      partitionId,
      replicaId,
      reason,
      nodeId: this.nodeId,
    });
    if (!operationId || !partitionId || !replicaId) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_MISSING_FIELDS, {
        operationId,
        partitionId,
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_REQUIRED_FIELDS,
          nodeId: this.nodeId,
        },
      );
    }
    try {
      const handoffState = this.requestTrackedPartitionLeaderHandoff(
        replicaId,
        reason,
      );
      if (
        handoffState === REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE
      ) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_NOT_FOUND, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.NOT_FOUND,
          {
            operationId,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      if (handoffState === REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_FAILED, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
          error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_NOT_SUPPORTED,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_NOT_SUPPORTED,
            operationId,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_COMPLETED, {
        operationId,
        partitionId,
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          operationId,
          replicaId,
          nodeId: this.nodeId,
        },
      );
    } catch (error) {
      this.logger.error(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_FAILED, {
        operationId,
        partitionId,
        replicaId,
        nodeId: this.nodeId,
        error: error.message,
        stack: error.stack,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error: error.message,
          operationId,
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
  }
}
export {ReplicaHandlerPart1};
