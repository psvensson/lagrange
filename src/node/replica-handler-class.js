/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * This file owns the public ReplicaHandler class: construction and the
 * composition of the responsibility-scoped method mixins (lifecycle,
 * create/remove request handling, progress, leader handoff, status
 * persistence, voter-readiness gating, remove execution, and runtime
 * metadata).
 *
 * Requirements: 10.2, 3.1
 */
import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import {AddressManager} from '../address/address-manager.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {NUM} from '../constants/index.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {PartitionServiceRowOwner} from '../partition/partition-service-row-owner.js';
import {createSystemMetadataGatewayRequiredError} from '../control-plane/system-metadata-access-error.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {ReplicaCreationProgressReporter} from '../utils/replica-creation-progress-reporter.js';
import {ReplicaStateMachine} from './replica-state-machine.js';
import {assignReplicaHandlerLifecycleMethods} from './replica-handler-lifecycle-methods.js';
import {assignReplicaHandlerCreateMethods} from './replica-handler-create-methods.js';
import {
  assignReplicaHandlerCreateStatusMethods,
} from './replica-handler-create-status-methods.js';
import {assignReplicaHandlerProgressMethods} from './replica-handler-progress-methods.js';
import {
  assignReplicaHandlerRemoveRequestMethods,
} from './replica-handler-remove-request-methods.js';
import {assignReplicaHandlerLeaderHandoffMethods} from './replica-handler-leader-handoff-methods.js';
import {assignReplicaHandlerStatusMethods} from './replica-handler-status-methods.js';
import {assignReplicaHandlerVoterReadinessMethods} from './replica-handler-voter-readiness-methods.js';
import {assignReplicaHandlerRuntimeMethods} from './replica-handler-runtime-methods.js';
import {
  assignReplicaHandlerRemoveExecutionMethods,
} from './replica-handler-remove-execution-methods.js';
import {VOTER_RAFT_ROLES} from '../raft/replica-voter-readiness.js';
import {
  METADATA_RESOLUTION_POLL_INTERVAL_MS,
  PARTITION_METADATA_MISSING_PREFIX,
  REPLICA_HANDLER_LITERAL,
  SYSTEM_TABLE_HYDRATION_SQL,
  TABLE_METADATA_MISSING_PREFIX,
  isFreshPartitionBootstrapWindow,
  isReplicaJoinNodeViable,
  partitionMetadataMissingError,
} from './replica-handler-transition-policy.js';

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
    this.messageRouter = options.messageRouter || null;
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
}

assignReplicaHandlerLifecycleMethods(ReplicaHandler);
assignReplicaHandlerProgressMethods(ReplicaHandler);
assignReplicaHandlerCreateStatusMethods(ReplicaHandler);
assignReplicaHandlerCreateMethods(ReplicaHandler);
assignReplicaHandlerRemoveRequestMethods(ReplicaHandler);
assignReplicaHandlerLeaderHandoffMethods(ReplicaHandler);
assignReplicaHandlerStatusMethods(ReplicaHandler);
assignReplicaHandlerVoterReadinessMethods(ReplicaHandler);
assignReplicaHandlerRemoveExecutionMethods(ReplicaHandler);
assignReplicaHandlerRuntimeMethods(ReplicaHandler, {
  AddressManager,
  VOTER_RAFT_ROLES,
  METADATA_RESOLUTION_POLL_INTERVAL_MS,
  NUM,
  PRESSURE_WORK_CLASS,
  PARTITION_METADATA_MISSING_PREFIX,
  PartitionServiceRowOwner,
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LITERAL,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
  ReplicaStatus,
  STORAGE_DEFAULT,
  SYSTEM_TABLE_HYDRATION_SQL,
  SYSTEM_TABLE_NAME,
  TABLE_METADATA_MISSING_PREFIX,
  classifySystemPartition,
  createControlPlaneRuntimeBundle,
  createSystemMetadataGatewayRequiredError,
  fs,
  isFreshPartitionBootstrapWindow,
  isReplicaJoinNodeViable,
  path,
  partitionMetadataMissingError,
});

export {ReplicaHandler};
