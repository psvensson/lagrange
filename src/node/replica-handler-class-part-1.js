/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
 */
import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {ReplicaCreationProgressReporter} from '../utils/replica-creation-progress-reporter.js';
import {assignReplicaHandlerCreateMethods} from './replica-handler-create-methods.js';
import {assignReplicaHandlerProgressMethods} from './replica-handler-progress-methods.js';
import {
  assignReplicaHandlerRemoveRequestMethods,
} from './replica-handler-remove-request-methods.js';
import {ReplicaStateMachine} from './replica-state-machine.js';

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
    // Executor outcome emitter - replaces direct replica_operations writes.
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
}

assignReplicaHandlerProgressMethods(ReplicaHandlerPart1);
assignReplicaHandlerCreateMethods(ReplicaHandlerPart1);
assignReplicaHandlerRemoveRequestMethods(ReplicaHandlerPart1);

export {ReplicaHandlerPart1};
