/**
 * ReplicaWorkerManager - Manages replica worker process lifecycle.
 *
 * This manager handles the creation, monitoring, and termination of worker
 * processes for partition and message group replicas. Each replica runs in
 * its own piscina worker process with independent memory.
 *
 * Also handles MessageRouter registration on behalf of workers (workers don't
 * self-register). After successful replica creation, the manager registers a
 * handler with MessageRouter that forwards messages to the worker.
 *
 * @module worker/replica-worker-manager
 * @see Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 - Worker Process Management
 * @see Requirements 11.1, 11.2 - Manager-Based Worker Registration
 */

import Piscina from 'piscina';
import {EventEmitter} from 'events';
import {
  resolveModuleDirectory,
  resolvePackagedRuntimeFile,
} from '../sea/runtime-file-resolution.js';
import {
  WORKER_OPERATION,
  WORKER_STATUS,
  WORKER_EVENT,
  WORKER_HEALTH_STATUS,
  WORKER_ENTITY_TYPE,
  WORKER_ERROR_MSG,
  WORKER_RESPONSE_STATUS,
  FACADE_MESSAGE_TYPE,
  LEADERSHIP_MESSAGE_TYPE,
} from './worker-constants.js';
import {NUM} from '../constants/index.js';
import {
  ReplicaCreationProgressReporter,
} from '../utils/replica-creation-progress-reporter.js';

/**
 * Error messages for ReplicaWorkerManager.
 * @type {Readonly<Object>}
 */
const MANAGER_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'ReplicaWorkerManager not initialized',
  ALREADY_INITIALIZED: 'ReplicaWorkerManager already initialized',
  REPLICA_NOT_FOUND: 'Replica not found',
  REPLICA_ALREADY_EXISTS: 'Replica already exists',
  MISSING_PARTITION_ID: 'partitionId is required',
  MISSING_REPLICA_ID: 'replicaId is required',
  MISSING_GROUP_ID: 'groupId is required',
  MISSING_NODE_ID: 'nodeId is required',
  WORKER_SPAWN_FAILED: 'Failed to spawn worker process',
  WORKER_STOP_FAILED: 'Failed to stop worker process',
  MISSING_MESSAGE_ROUTER: 'messageRouter is required',
  INVALID_TARGET_ADDRESS_FORMAT: 'Invalid target address format',
  // Timeout error message generators - Requirements 7.1, 7.2
  createReplicaTimeout: (timeoutMs) => `CREATE_REPLICA timeout after ${timeoutMs}ms`,
});
const WORKER_MANAGER_ADDRESS_SEGMENT = Object.freeze({
  REPLICA_INDEX: 2,
  MIN_LENGTH: 3,
});

/**
 * Log messages for ReplicaWorkerManager.
 * @type {Readonly<Object>}
 */
const MANAGER_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing ReplicaWorkerManager',
  INITIALIZED: 'ReplicaWorkerManager initialized',
  CREATING_PARTITION_REPLICA: 'Creating partition replica in worker process',
  PARTITION_REPLICA_CREATED: 'Partition replica created in worker process',
  CREATING_MESSAGE_GROUP_REPLICA: 'Creating message group replica in worker process',
  MESSAGE_GROUP_REPLICA_CREATED: 'Message group replica created in worker process',
  STOPPING_REPLICA: 'Stopping replica worker process',
  REPLICA_STOPPED: 'Replica worker process stopped',
  WORKER_CRASHED: 'Worker process crashed',
  HEALTH_CHECK_STARTED: 'Health check started',
  HEALTH_CHECK_COMPLETED: 'Health check completed',
  SHUTTING_DOWN: 'Shutting down ReplicaWorkerManager',
  SHUTDOWN_COMPLETE: 'ReplicaWorkerManager shutdown complete',
  HANDLER_REGISTERED: 'Registered MessageRouter handler for worker',
  HANDLER_UNREGISTERED: 'Unregistered MessageRouter handler for worker',
  // Timeout cleanup messages - Requirement 7.3
  TIMEOUT_CLEANUP_STARTED: 'Cleaning up partial replica after timeout',
  TIMEOUT_CLEANUP_COMPLETED: 'Partial replica cleanup completed',
  TIMEOUT_CLEANUP_FAILED: 'Partial replica cleanup failed',
});

/**
 * Default configuration for ReplicaWorkerManager.
 * @type {Readonly<Object>}
 */
const MANAGER_DEFAULT = Object.freeze({
  /** Maximum concurrent workers */
  MAX_WORKERS: 16,
  /** Minimum workers to keep alive */
  MIN_WORKERS: 1,
  /** Health check interval in milliseconds */
  HEALTH_CHECK_INTERVAL_MS: 5000,
  /** Crash detection threshold in milliseconds */
  CRASH_THRESHOLD_MS: 5000,
  /** Worker idle timeout in milliseconds */
  IDLE_TIMEOUT_MS: 30000,
  /** Default CREATE_REPLICA operation timeout in milliseconds */
  CREATE_REPLICA_TIMEOUT_MS: 30000,
});

/**
 * Replica creation progress constants.
 * @type {Readonly<Object>}
 */
const REPLICA_CREATE_PROGRESS = Object.freeze({
  PREFIX: '[replica-create]',
  SPINNER_IDLE: '|',
  STATE_STARTING: 'starting',
  STATE_SPAWNING: 'spawning_worker',
  STATE_WORKER_READY: 'worker_ready',
  STATE_REGISTERING: 'registering_router',
  STATE_RUNNING: 'running',
  STATE_TIMEOUT: 'timeout',
  STATE_FAILED: 'failed',
});

const REPLICA_WORKER_MODULE_DIR = resolveModuleDirectory(resolveModuleDirectory);

function resolveReplicaWorkerPath() {
  return resolvePackagedRuntimeFile({
    moduleDir: REPLICA_WORKER_MODULE_DIR,
    sourceFileName: 'replica-worker.js',
    bundledFileName: 'replica-worker.bundle.cjs',
  });
}

/**
 * WorkerReplicaHandle - Handle returned when creating a worker replica.
 * @typedef {Object} WorkerReplicaHandle
 * @property {string} replicaId - Unique replica identifier.
 * @property {number} workerId - Piscina worker ID.
 * @property {string} entityType - 'partition' or 'message-group'.
 * @property {string} unifiedAddress - Full unified address.
 * @property {string} status - 'starting', 'running', 'stopping', 'stopped'.
 * @property {number} createdAt - Creation timestamp.
 * @property {number} lastHealthCheck - Last health check timestamp.
 * @property {string} healthStatus - 'healthy', 'unhealthy', 'unknown'.
 */

/**
 * ReplicaWorkerManager - Manages replica worker process lifecycle.
 * Replaces direct replica creation in main process.
 * Handles MessageRouter registration for workers (workers don't self-register).
 *
 * @extends EventEmitter
 */
class ReplicaWorkerManager extends EventEmitter {
  /**
   * Create a new ReplicaWorkerManager instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID where this manager runs.
   * @param {Object} options.messageRouter - MessageRouter instance for handler registration.
   * @param {string} options.workerPath - Path to worker entry point.
   * @param {Object} [options.logger=console] - Logger instance.
   * @param {number} [options.maxWorkers] - Maximum concurrent workers.
   * @param {number} [options.healthCheckIntervalMs] - Health check interval.
   */
  constructor(options = {}) {
    super();

    if (!options.nodeId) {
      throw new Error(MANAGER_ERROR_MSG.MISSING_NODE_ID);
    }

    if (!options.messageRouter) {
      throw new Error(MANAGER_ERROR_MSG.MISSING_MESSAGE_ROUTER);
    }

    /** @type {string} Node ID */
    this.nodeId = options.nodeId;

    /** @type {Object} MessageRouter instance for handler registration */
    this.messageRouter = options.messageRouter;

    /** @type {string} Path to worker entry point */
    this.workerPath = options.workerPath || resolveReplicaWorkerPath();

    /** @type {Object} Logger instance */
    this.logger = options.logger || console;

    /** @type {number} Maximum concurrent workers */
    this.maxWorkers = options.maxWorkers || MANAGER_DEFAULT.MAX_WORKERS;

    /** @type {number} Health check interval in milliseconds */
    this.healthCheckIntervalMs = options.healthCheckIntervalMs ||
      MANAGER_DEFAULT.HEALTH_CHECK_INTERVAL_MS;

    /** @type {Piscina|null} Piscina worker pool */
    this.pool = null;

    /** @type {Map<string, WorkerReplicaHandle>} Worker handles by replica ID */
    this.workers = new Map();

    /** @type {Map<string, Piscina>} Dedicated worker pool per replica */
    this.replicaPools = new Map();

    /** @type {boolean} Whether the manager is initialized */
    this.initialized = false;

    /** @type {NodeJS.Timeout|null} Health check interval timer */
    this.healthCheckTimer = null;

    /** @type {boolean} Whether the manager is shutting down */
    this.shuttingDown = false;

    /** @type {ReplicaCreationProgressReporter} Replica creation progress reporter */
    this.creationProgressReporter = new ReplicaCreationProgressReporter({
      logger: this.logger,
      formatLine: (progress, status, error) =>
        this.formatReplicaCreationProgressLine(progress, status, error),
      buildContext: (progress, status, error) =>
        this.buildReplicaCreationProgressContext(progress, status, error),
    });
  }

  /**
   * Start a replica creation progress line.
   * Falls back to structured logs when terminal control is unavailable.
   * @param {Object} details - Progress details.
   * @param {string} details.entityType - Replica entity type.
   * @param {string} details.replicaId - Replica ID.
   * @param {string} details.serviceId - Parent service ID.
   * @return {Object} Progress context.
   * @private
   */
  startReplicaCreationProgress(details) {
    return this.creationProgressReporter.start({
      ...details,
      state: REPLICA_CREATE_PROGRESS.STATE_STARTING,
    });
  }

  /**
   * Update the state of an existing replica creation progress line.
   * @param {Object|null} progress - Progress context.
   * @param {string} nextState - Next state label.
   * @private
   */
  updateReplicaCreationProgress(progress, nextState) {
    this.creationProgressReporter.update(progress, {state: nextState});
  }

  /**
   * Complete a replica creation progress line.
   * @param {Object|null} progress - Progress context.
   * @param {string} finalState - Final state label.
   * @private
   */
  finishReplicaCreationProgress(progress, finalState) {
    this.creationProgressReporter.finish(progress, {state: finalState});
  }

  /**
   * Mark a replica creation progress line as failed.
   * @param {Object|null} progress - Progress context.
   * @param {string} finalState - Final state label.
   * @param {Error|string|null} error - Failure reason.
   * @private
   */
  failReplicaCreationProgress(progress, finalState, error) {
    this.creationProgressReporter.fail(progress, error, {state: finalState});
  }

  /**
   * Build the formatted line shown in interactive and fallback modes.
   * @param {Object} progress - Progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @return {string} Formatted progress line.
   * @private
   */
  formatReplicaCreationProgressLine(progress, status, error) {
    const spinner = progress.spinnerFrame || REPLICA_CREATE_PROGRESS.SPINNER_IDLE;
    const totalLocal = this.getWorkerCount();
    const localByType = this.getWorkersByType(progress.entityType).length;
    const statusText = status ? ` status=${status}` : '';
    const errorText = error ?
      ` error=${this.formatReplicaCreationError(error)}` :
      '';

    return (
      `${REPLICA_CREATE_PROGRESS.PREFIX} ${spinner} ` +
      `service=${progress.serviceId} replica=${progress.replicaId} ` +
      `type=${progress.entityType} state=${progress.state} ` +
      `local_replicas=${totalLocal} type_replicas=${localByType}` +
      `${statusText}${errorText}`
    );
  }

  /**
   * Build structured context for fallback log output.
   * @param {Object} progress - Progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @return {Object} Structured context object.
   * @private
   */
  buildReplicaCreationProgressContext(progress, status = null, error = null) {
    const context = {
      nodeId: this.nodeId,
      serviceId: progress.serviceId,
      replicaId: progress.replicaId,
      entityType: progress.entityType,
      state: progress.state,
      localReplicas: this.getWorkerCount(),
      typeReplicas: this.getWorkersByType(progress.entityType).length,
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
   * Normalize replica creation errors for display.
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
   * Initialize the worker manager.
   * Creates the piscina worker pool.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      throw new Error(MANAGER_ERROR_MSG.ALREADY_INITIALIZED);
    }

    this.logger.info(MANAGER_LOG_MSG.INITIALIZING, {
      nodeId: this.nodeId,
      maxWorkers: this.maxWorkers,
    });

    // Create piscina worker pool
    this.pool = new Piscina({
      filename: this.workerPath,
      maxThreads: this.maxWorkers,
      minThreads: MANAGER_DEFAULT.MIN_WORKERS,
      idleTimeout: MANAGER_DEFAULT.IDLE_TIMEOUT_MS,
    });

    // Set up pool event handlers
    this.setupPoolEventHandlers();

    // Start health check timer
    this.startHealthCheckTimer();

    this.initialized = true;

    this.logger.info(MANAGER_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
    });

    this.emit(WORKER_EVENT.INITIALIZED, {nodeId: this.nodeId});
  }

  /**
   * Set up piscina pool event handlers.
   * @private
   */
  setupPoolEventHandlers() {
    this.setupPoolEventHandlersFor(this.pool);
  }

  /**
   * Set up piscina pool event handlers for a specific pool.
   * @param {Piscina} pool - Piscina pool to wire.
   * @private
   */
  setupPoolEventHandlersFor(pool) {
    if (!pool) {
      return;
    }

    // Handle worker errors
    pool.on('error', (error) => {
      this.logger.error(MANAGER_LOG_MSG.WORKER_CRASHED, {
        nodeId: this.nodeId,
        error: error.message,
      });
    });

    // Handle messages from workers (IPC messages for Raft packet routing)
    // Workers send WORKER_SEND messages via parentPort.postMessage()
    // Piscina emits these as 'message' events on the pool
    pool.on('message', (message) => {
      this.handleWorkerMessage(message).catch((error) => {
        this.logger.error('Failed to handle worker message', {
          nodeId: this.nodeId,
          error: error.message,
          messageType: message?.type,
        });
      });
    });
  }

  /**
   * Check if manager should use dedicated per-replica pools.
   * Real Piscina instances use dedicated pools; mocked pools in unit tests do not.
   * @return {boolean} True if dedicated pools should be used.
   * @private
   */
  usesDedicatedReplicaPools() {
    return this.pool instanceof Piscina;
  }

  /**
   * Create a dedicated single-thread pool for one replica.
   * @param {string} replicaId - Replica ID for logging.
   * @return {Piscina} Dedicated pool.
   * @private
   */
  createDedicatedReplicaPool(replicaId) {
    const pool = new Piscina({
      filename: this.workerPath,
      maxThreads: NUM.ONE,
      minThreads: NUM.ONE,
      idleTimeout: MANAGER_DEFAULT.IDLE_TIMEOUT_MS,
    });
    this.setupPoolEventHandlersFor(pool);
    this.logger.debug('Created dedicated replica pool', {
      nodeId: this.nodeId,
      replicaId,
    });
    return pool;
  }

  /**
   * Resolve execution pool for a replica operation.
   * @param {string} replicaId - Replica ID.
   * @return {Piscina|Object|null} Pool-like object with run().
   * @private
   */
  getReplicaExecutionPool(replicaId) {
    return this.replicaPools.get(replicaId) || this.pool;
  }

  /**
   * Destroy dedicated pool for a replica if present.
   * @param {string} replicaId - Replica ID.
   * @return {Promise<void>}
   * @private
   */
  async destroyDedicatedReplicaPool(replicaId) {
    const pool = this.replicaPools.get(replicaId);
    if (!pool) {
      return;
    }
    this.replicaPools.delete(replicaId);
    await pool.destroy();
  }

  /**
   * Handle IPC message from a worker process.
   * Routes messages between workers via the MessageRouter.
   * @param {Object} message - IPC message from worker.
   * @return {Promise<void>}
   * @private
   */
  async handleWorkerMessage(message) {
    if (!message || !message.type) {
      return;
    }

    // Handle WORKER_SEND messages - route to target worker
    if (message.type === 'WORKER_SEND') {
      await this.routeWorkerMessage(message);
      return;
    }
  }

  /**
   * Route a message from one worker to another.
   * @param {Object} envelope - Message envelope with source, target, and payload.
   * @return {Promise<void>}
   * @private
   */
  async routeWorkerMessage(envelope) {
    const {targetAddress, sourceAddress, payload, messageId, correlationId} = envelope;

    this.logger.debug('Routing worker message', {
      nodeId: this.nodeId,
      sourceAddress,
      targetAddress,
      messageId,
    });

    // Extract replica ID from target address (format: nodeId/entityType/replicaId)
    const targetParts = targetAddress.split('/');
    if (targetParts.length < WORKER_MANAGER_ADDRESS_SEGMENT.MIN_LENGTH) {
      this.logger.warn('Invalid target address format', {
        targetAddress,
        messageId,
      });
      return;
    }

    const targetReplicaId = targetParts[WORKER_MANAGER_ADDRESS_SEGMENT.REPLICA_INDEX];

    // Check if target replica exists in this manager
    const targetHandle = this.workers.get(targetReplicaId);
    if (!targetHandle) {
      this.logger.debug('Target replica not found locally', {
        targetReplicaId,
        messageId,
      });
      // If we have a messageRouter, try to route externally
      if (this.messageRouter) {
        try {
          await this.messageRouter.deliver(targetAddress, payload);
        } catch (error) {
          this.logger.warn('Failed to route external worker message', {
            nodeId: this.nodeId,
            sourceAddress,
            targetAddress,
            messageId,
            correlationId,
            error: error.message,
          });
        }
      }
      return;
    }
    try {
      await this.deliverMessage(targetReplicaId, payload);

      this.logger.debug('Worker message delivered', {
        nodeId: this.nodeId,
        targetReplicaId,
        messageId,
      });
    } catch (error) {
      this.logger.warn('Failed to route local worker message', {
        nodeId: this.nodeId,
        sourceAddress,
        targetAddress,
        targetReplicaId,
        messageId,
        correlationId,
        error: error.message,
      });
    }
  }

  /**
   * Start the health check timer.
   * @private
   */
  startHealthCheckTimer() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks().catch((error) => {
        this.logger.error('Health check failed', {
          nodeId: this.nodeId,
          error: error.message,
        });
      });
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop the health check timer.
   * @private
   */
  stopHealthCheckTimer() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Execute a promise with a timeout.
   * @param {Promise} promise - Promise to execute.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise} Result of the promise or timeout error.
   * @private
   * @see Requirements 7.1, 7.2 - CREATE_REPLICA timeout handling
   */
  withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  /**
   * Clean up a partially created replica after timeout.
   * Removes the replica from the workers map and unregisters from router.
   * @param {string} replicaId - Replica ID to clean up.
   * @return {Promise<void>}
   * @private
   * @see Requirement 7.3 - Clean up partial resources on timeout
   */
  async cleanupPartialReplica(replicaId) {
    this.logger.info(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_STARTED, {
      nodeId: this.nodeId,
      replicaId,
    });

    const handle = this.workers.get(replicaId);
    if (handle) {
      // Unregister handler from MessageRouter if it was registered
      if (handle.unifiedAddress) {
        try {
          this.unregisterWorkerFromRouter(handle.unifiedAddress);
        } catch (error) {
          this.logger.warn(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_FAILED, {
            nodeId: this.nodeId,
            replicaId,
            error: error.message,
          });
        }
      }

      // Remove from workers map
      this.workers.delete(replicaId);
    }

    await this.destroyDedicatedReplicaPool(replicaId).catch((error) => {
      this.logger.warn(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_FAILED, {
        nodeId: this.nodeId,
        replicaId,
        error: error.message,
      });
    });

    this.logger.info(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_COMPLETED, {
      nodeId: this.nodeId,
      replicaId,
    });
  }

  /**
   * Perform health checks on all workers.
   * @return {Promise<void>}
   * @private
   */
  async performHealthChecks() {
    if (this.shuttingDown || !this.initialized) {
      return;
    }

    this.logger.debug(MANAGER_LOG_MSG.HEALTH_CHECK_STARTED, {
      nodeId: this.nodeId,
      workerCount: this.workers.size,
    });

    const now = Date.now();
    const healthCheckPromises = [];

    for (const [replicaId, handle] of this.workers) {
      if (handle.status === WORKER_STATUS.RUNNING) {
        healthCheckPromises.push(
          this.checkWorkerHealth(replicaId, handle, now),
        );
      }
    }

    await Promise.allSettled(healthCheckPromises);

    this.logger.debug(MANAGER_LOG_MSG.HEALTH_CHECK_COMPLETED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Check health of a single worker.
   * @param {string} replicaId - Replica ID.
   * @param {WorkerReplicaHandle} handle - Worker handle.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async checkWorkerHealth(replicaId, handle, now) {
    try {
      const executionPool = this.getReplicaExecutionPool(replicaId);
      const result = await executionPool.run({
        operation: WORKER_OPERATION.HEALTH_CHECK,
        replicaId,
      });

      handle.lastHealthCheck = now;
      handle.healthStatus = result.healthy ?
        WORKER_HEALTH_STATUS.HEALTHY :
        WORKER_HEALTH_STATUS.UNHEALTHY;
    } catch (error) {
      handle.healthStatus = WORKER_HEALTH_STATUS.UNHEALTHY;
      this.logger.warn('Worker health check failed', {
        replicaId,
        error: error.message,
      });
    }
  }

  /**
   * Start one replica group's deferred elections once every expected replica
   * exists and is routable.
   * @param {Array<string>} replicaIds
   * @return {Promise<void>}
   * @private
   */
  async maybeStartReplicaGroupElection(replicaIds) {
    const expectedReplicaIds = Array.isArray(replicaIds) ?
      [...new Set(replicaIds.filter((replicaId) =>
        typeof replicaId === 'string' && replicaId.length > 0,
      ))] :
      [];
    if (expectedReplicaIds.length <= NUM.ONE) {
      return;
    }

    const allReplicasReady = expectedReplicaIds.every((replicaId) => {
      const handle = this.workers.get(replicaId);
      return handle?.status === WORKER_STATUS.RUNNING;
    });
    if (!allReplicasReady) {
      return;
    }

    await Promise.all(expectedReplicaIds.map((replicaId) => {
      return this.deliverMessage(replicaId, {
        type: FACADE_MESSAGE_TYPE.START_ELECTION,
      });
    }));
  }

  /**
   * Create a new partition replica in a worker process.
   * After successful creation, registers handler with MessageRouter.
   * @param {Object} options - Partition configuration.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.replicaId - Replica ID.
   * @param {string} options.tableId - Table ID.
   * @param {string} options.tableName - Table name.
   * @param {Object} options.schema - Table schema.
   * @param {string} options.dbPath - SQLite database path.
   * @param {Array<string>} [options.replicaIds] - All replica IDs.
   * @param {Array<string>} [options.peerAddresses] - Peer unified addresses.
   * @param {number} [options.timeoutMs] - Operation timeout in milliseconds.
   * @return {Promise<WorkerReplicaHandle|Object>} Handle to the worker replica or error object.
   * @see Requirements 7.1, 7.2, 7.3 - CREATE_REPLICA timeout handling
   */
  async createPartitionReplica(options) {
    if (!this.initialized) {
      throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!options.partitionId) {
      throw new Error(MANAGER_ERROR_MSG.MISSING_PARTITION_ID);
    }

    if (!options.replicaId) {
      throw new Error(MANAGER_ERROR_MSG.MISSING_REPLICA_ID);
    }

    if (this.workers.has(options.replicaId)) {
      throw new Error(MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
    }

    const now = Date.now();
    const unifiedAddress = `${this.nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${options.replicaId}`;
    const timeoutMs = options.timeoutMs || MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS;
    const shouldDeferElection = Array.isArray(options.replicaIds) &&
      options.replicaIds.length > NUM.ONE;

    // Create worker handle
    const handle = {
      replicaId: options.replicaId,
      workerId: NUM.ZERO, // Will be set by piscina
      entityType: WORKER_ENTITY_TYPE.PARTITION,
      unifiedAddress,
      status: WORKER_STATUS.STARTING,
      createdAt: now,
      lastHealthCheck: now,
      healthStatus: WORKER_HEALTH_STATUS.UNKNOWN,
      partitionId: options.partitionId,
      tableId: options.tableId,
      tableName: options.tableName,
    };

    // Store handle before spawning
    this.workers.set(options.replicaId, handle);
    const creationProgress = this.startReplicaCreationProgress({
      entityType: WORKER_ENTITY_TYPE.PARTITION,
      replicaId: options.replicaId,
      serviceId: options.partitionId,
    });
    this.updateReplicaCreationProgress(
      creationProgress,
      REPLICA_CREATE_PROGRESS.STATE_SPAWNING,
    );

    let dedicatedPool = null;

    try {
      dedicatedPool = this.usesDedicatedReplicaPools() ?
        this.createDedicatedReplicaPool(options.replicaId) :
        null;
      const executionPool = dedicatedPool || this.pool;

      // Spawn worker and create replica with timeout
      const result = await this.withTimeout(
        executionPool.run({
          operation: WORKER_OPERATION.CREATE_PARTITION_REPLICA,
          nodeId: this.nodeId,
          partitionId: options.partitionId,
          replicaId: options.replicaId,
          tableId: options.tableId,
          tableName: options.tableName,
          schema: options.schema,
          dbPath: options.dbPath,
          replicaIds: options.replicaIds,
          peerAddresses: options.peerAddresses,
          deferElection: shouldDeferElection,
        }),
        timeoutMs,
      );

      handle.workerId = result.workerId || NUM.ZERO;
      handle.status = WORKER_STATUS.RUNNING;
      handle.healthStatus = WORKER_HEALTH_STATUS.HEALTHY;
      this.updateReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_WORKER_READY,
      );

      if (dedicatedPool) {
        this.replicaPools.set(options.replicaId, dedicatedPool);
      }

      this.updateReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_REGISTERING,
      );
      // Register handler with MessageRouter to forward messages to this worker
      // Requirements 11.1, 11.2 - Manager-based registration
      this.registerWorkerWithRouter(options.replicaId, unifiedAddress);
      await this.maybeStartReplicaGroupElection(options.replicaIds);

      this.emit(WORKER_EVENT.REPLICA_CREATED, {
        replicaId: options.replicaId,
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        unifiedAddress,
      });

      this.finishReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_RUNNING,
      );
      return handle;
    } catch (error) {
      // Check if this is a timeout error - Requirements 7.1, 7.2, 7.3
      if (error.message.includes('timeout')) {
        // Clean up any partially created resources
        await this.cleanupPartialReplica(options.replicaId);
        this.failReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_TIMEOUT,
          error,
        );

        return {
          success: false,
          error: MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs),
          replicaId: options.replicaId,
        };
      }

      // Clean up on other failures
      this.workers.delete(options.replicaId);
      if (dedicatedPool) {
        await dedicatedPool.destroy().catch(() => {});
      }
      this.failReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_FAILED,
        error,
      );

      this.logger.error(MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED, {
        nodeId: this.nodeId,
        replicaId: options.replicaId,
        error: error.message,
      });

      throw new Error(`${MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED}: ${error.message}`);
    }
  }

  /**
   * Create a new message group replica in a worker process.
   * After successful creation, registers handler with MessageRouter.
   * @param {Object} options - Message group configuration.
   * @param {string} options.groupId - Message group ID.
   * @param {string} options.replicaId - Replica ID.
   * @param {Array<string>} [options.replicaIds] - All replica IDs in group.
   * @param {Array<string>} [options.peerAddresses] - Peer unified addresses.
   * @param {number} [options.timeoutMs] - Operation timeout in milliseconds.
   * @return {Promise<WorkerReplicaHandle|Object>} Handle to the worker replica or error object.
   * @see Requirements 7.1, 7.2, 7.3 - CREATE_REPLICA timeout handling
   */
  async createMessageGroupReplica(options) {
    if (!this.initialized) {
      throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!options.groupId) {
      throw new Error(MANAGER_ERROR_MSG.MISSING_GROUP_ID);
    }

    if (!options.replicaId) {
      throw new Error(MANAGER_ERROR_MSG.MISSING_REPLICA_ID);
    }

    if (this.workers.has(options.replicaId)) {
      throw new Error(MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
    }

    const now = Date.now();
    const unifiedAddress =
      `${this.nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${options.replicaId}`;
    const timeoutMs = options.timeoutMs || MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS;
    const shouldDeferElection = Array.isArray(options.replicaIds) &&
      options.replicaIds.length > NUM.ONE;

    // Create worker handle
    const handle = {
      replicaId: options.replicaId,
      workerId: NUM.ZERO, // Will be set by piscina
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      unifiedAddress,
      status: WORKER_STATUS.STARTING,
      createdAt: now,
      lastHealthCheck: now,
      healthStatus: WORKER_HEALTH_STATUS.UNKNOWN,
      groupId: options.groupId,
    };

    // Store handle before spawning
    this.workers.set(options.replicaId, handle);
    const creationProgress = this.startReplicaCreationProgress({
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      replicaId: options.replicaId,
      serviceId: options.groupId,
    });
    this.updateReplicaCreationProgress(
      creationProgress,
      REPLICA_CREATE_PROGRESS.STATE_SPAWNING,
    );

    let dedicatedPool = null;

    try {
      dedicatedPool = this.usesDedicatedReplicaPools() ?
        this.createDedicatedReplicaPool(options.replicaId) :
        null;
      const executionPool = dedicatedPool || this.pool;

      // Spawn worker and create replica with timeout
      const result = await this.withTimeout(
        executionPool.run({
          operation: WORKER_OPERATION.CREATE_MESSAGE_GROUP_REPLICA,
          nodeId: this.nodeId,
          groupId: options.groupId,
          replicaId: options.replicaId,
          replicaIds: options.replicaIds,
          peerAddresses: options.peerAddresses,
          deferElection: shouldDeferElection,
        }),
        timeoutMs,
      );

      handle.workerId = result.workerId || NUM.ZERO;
      handle.status = WORKER_STATUS.RUNNING;
      handle.healthStatus = WORKER_HEALTH_STATUS.HEALTHY;
      this.updateReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_WORKER_READY,
      );

      if (dedicatedPool) {
        this.replicaPools.set(options.replicaId, dedicatedPool);
      }

      this.updateReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_REGISTERING,
      );
      // Register handler with MessageRouter to forward messages to this worker
      // Requirements 11.1, 11.2 - Manager-based registration
      this.registerWorkerWithRouter(options.replicaId, unifiedAddress);
      await this.maybeStartReplicaGroupElection(options.replicaIds);

      this.emit(WORKER_EVENT.REPLICA_CREATED, {
        replicaId: options.replicaId,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        unifiedAddress,
      });

      this.finishReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_RUNNING,
      );
      return handle;
    } catch (error) {
      // Check if this is a timeout error - Requirements 7.1, 7.2, 7.3
      if (error.message.includes('timeout')) {
        // Clean up any partially created resources
        await this.cleanupPartialReplica(options.replicaId);
        this.failReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_TIMEOUT,
          error,
        );

        return {
          success: false,
          error: MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs),
          replicaId: options.replicaId,
        };
      }

      // Clean up on other failures
      this.workers.delete(options.replicaId);
      if (dedicatedPool) {
        await dedicatedPool.destroy().catch(() => {});
      }
      this.failReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_FAILED,
        error,
      );

      this.logger.error(MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED, {
        nodeId: this.nodeId,
        replicaId: options.replicaId,
        error: error.message,
      });

      throw new Error(`${MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED}: ${error.message}`);
    }
  }

  /**
   * Stop a replica and terminate its worker process.
   * Unregisters handler from MessageRouter.
   * @param {string} replicaId - Replica ID to stop.
   * @return {Promise<void>}
   * @see Requirements 11.4 - Unregister handler on stop
   */
  async stopReplica(replicaId) {
    if (!this.initialized) {
      throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
    }

    const handle = this.workers.get(replicaId);
    if (!handle) {
      throw new Error(MANAGER_ERROR_MSG.REPLICA_NOT_FOUND);
    }

    this.logger.info(MANAGER_LOG_MSG.STOPPING_REPLICA, {
      nodeId: this.nodeId,
      replicaId,
      entityType: handle.entityType,
    });

    handle.status = WORKER_STATUS.STOPPING;
    const executionPool = this.getReplicaExecutionPool(replicaId);

    try {
      // Send stop command to worker
      await executionPool.run({
        operation: WORKER_OPERATION.STOP_REPLICA,
        replicaId,
      });

      handle.status = WORKER_STATUS.STOPPED;

      this.logger.info(MANAGER_LOG_MSG.REPLICA_STOPPED, {
        nodeId: this.nodeId,
        replicaId,
      });

      this.emit(WORKER_EVENT.REPLICA_STOPPED, {
        replicaId,
        entityType: handle.entityType,
      });
    } catch (error) {
      this.logger.error(MANAGER_ERROR_MSG.WORKER_STOP_FAILED, {
        nodeId: this.nodeId,
        replicaId,
        error: error.message,
      });

      // Still mark as stopped and remove
      handle.status = WORKER_STATUS.STOPPED;
    } finally {
      // Unregister handler from MessageRouter
      // Requirements 11.4 - Unregister handler on stop
      this.unregisterWorkerFromRouter(handle.unifiedAddress);

      // Remove from workers map
      this.workers.delete(replicaId);

      await this.destroyDedicatedReplicaPool(replicaId).catch((error) => {
        this.logger.warn('Failed to destroy dedicated replica pool', {
          nodeId: this.nodeId,
          replicaId,
          error: error.message,
        });
      });
    }
  }

  /**
   * Deliver a message to a worker replica.
   * @param {string} replicaId - Target replica ID.
   * @param {Object} message - Message to deliver.
   * @return {Promise<Object>} Response from worker.
   */
  async deliverMessage(replicaId, message) {
    if (!this.initialized) {
      throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
    }

    const handle = this.workers.get(replicaId);
    if (!handle) {
      throw new Error(MANAGER_ERROR_MSG.REPLICA_NOT_FOUND);
    }

    if (handle.status !== WORKER_STATUS.RUNNING) {
      throw new Error(WORKER_ERROR_MSG.WORKER_NOT_RUNNING);
    }

    const executionPool = this.getReplicaExecutionPool(replicaId);
    return executionPool.run({
      operation: WORKER_OPERATION.DELIVER_MESSAGE,
      replicaId,
      message,
    });
  }

  /**
   * Query leadership status of a replica.
   * Sends GET_LEADERSHIP_STATUS message to the worker.
   * @param {string} replicaId - Replica ID to query.
   * @return {Promise<{isLeader: boolean, leaderActivated: boolean, term: number, leaderId: string|null}>}
   *         Leadership status.
   * @see Requirements 10.4 - Leadership queries via message
   */
  async getLeadershipStatus(replicaId) {
    if (!this.initialized) {
      throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
    }

    const handle = this.workers.get(replicaId);
    if (!handle) {
      throw new Error(MANAGER_ERROR_MSG.REPLICA_NOT_FOUND);
    }

    if (handle.status !== WORKER_STATUS.RUNNING) {
      throw new Error(WORKER_ERROR_MSG.WORKER_NOT_RUNNING);
    }

    const executionPool = this.getReplicaExecutionPool(replicaId);
    const response = await executionPool.run({
      operation: WORKER_OPERATION.DELIVER_MESSAGE,
      replicaId,
      message: {
        type: LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS,
      },
    });

    return {
      isLeader: response.isLeader || false,
      leaderActivated: response.leaderActivated === true,
      term: response.term || NUM.ZERO,
      leaderId: response.leaderId || null,
      replicaId: response.replicaId || replicaId,
    };
  }

  /**
   * Get health status of all worker processes.
   * @return {Map<string, Object>} Health status by replica ID.
   */
  getHealthStatus() {
    const status = new Map();

    for (const [replicaId, handle] of this.workers) {
      status.set(replicaId, {
        replicaId,
        entityType: handle.entityType,
        status: handle.status,
        healthStatus: handle.healthStatus,
        lastHealthCheck: handle.lastHealthCheck,
        createdAt: handle.createdAt,
        unifiedAddress: handle.unifiedAddress,
      });
    }

    return status;
  }

  /**
   * Get a worker handle by replica ID.
   * @param {string} replicaId - Replica ID.
   * @return {WorkerReplicaHandle|undefined} Worker handle or undefined.
   */
  getWorker(replicaId) {
    return this.workers.get(replicaId);
  }

  /**
   * Get all worker handles.
   * @return {Map<string, WorkerReplicaHandle>} All worker handles.
   */
  getAllWorkers() {
    return new Map(this.workers);
  }

  /**
   * Get the number of active workers.
   * @return {number} Number of active workers.
   */
  getWorkerCount() {
    return this.workers.size;
  }

  /**
   * Get workers by entity type.
   * @param {string} entityType - Entity type to filter by.
   * @return {Array<WorkerReplicaHandle>} Matching worker handles.
   */
  getWorkersByType(entityType) {
    const result = [];
    for (const handle of this.workers.values()) {
      if (handle.entityType === entityType) {
        result.push(handle);
      }
    }
    return result;
  }

  /**
   * Register a worker with MessageRouter.
   * Creates a handler that forwards messages to the worker via deliverMessage().
   * Requirements 11.1, 11.2 - Manager-based registration.
   * @param {string} replicaId - Replica ID.
   * @param {string} unifiedAddress - Worker unified address.
   * @private
   */
  registerWorkerWithRouter(replicaId, unifiedAddress) {
    // Create handler that forwards messages to this worker via deliverMessage
    const deliverToWorker = async (envelope) => {
      return this.deliverMessage(replicaId, envelope?.payload || envelope);
    };

    this.messageRouter.registerWorkerHandler(unifiedAddress, deliverToWorker);

    this.logger.debug(MANAGER_LOG_MSG.HANDLER_REGISTERED, {
      nodeId: this.nodeId,
      replicaId,
      unifiedAddress,
    });
  }

  /**
   * Unregister a worker from MessageRouter.
   * Removes the handler that forwards messages to the worker.
   * Requirements 11.4, 11.5 - Unregister handler on stop/crash.
   * @param {string} unifiedAddress - Worker unified address.
   * @private
   */
  unregisterWorkerFromRouter(unifiedAddress) {
    this.messageRouter.unregisterWorkerHandler(unifiedAddress);

    this.logger.debug(MANAGER_LOG_MSG.HANDLER_UNREGISTERED, {
      nodeId: this.nodeId,
      unifiedAddress,
    });
  }

  /**
   * Handle worker process crash.
   * Unregisters from MessageRouter and emits failure event.
   * @param {string} replicaId - Crashed replica ID.
   * @param {Error} error - Crash error.
   * @see Requirements 11.5 - Unregister handler on crash
   */
  handleWorkerCrash(replicaId, error) {
    const handle = this.workers.get(replicaId);
    if (!handle) {
      return;
    }

    this.logger.error(MANAGER_LOG_MSG.WORKER_CRASHED, {
      nodeId: this.nodeId,
      replicaId,
      entityType: handle.entityType,
      error: error.message,
    });

    handle.status = WORKER_STATUS.STOPPED;
    handle.healthStatus = WORKER_HEALTH_STATUS.UNHEALTHY;

    // Unregister handler from MessageRouter
    // Requirements 11.5 - Unregister handler on crash
    this.unregisterWorkerFromRouter(handle.unifiedAddress);

    // Remove from workers map
    this.workers.delete(replicaId);

    this.destroyDedicatedReplicaPool(replicaId).catch((destroyError) => {
      this.logger.warn('Failed to destroy dedicated replica pool after crash', {
        nodeId: this.nodeId,
        replicaId,
        error: destroyError.message,
      });
    });

    // Emit failure event
    this.emit(WORKER_EVENT.REPLICA_FAILED, {
      replicaId,
      entityType: handle.entityType,
      error: error.message,
      unifiedAddress: handle.unifiedAddress,
    });
  }

  /**
   * Check if the manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get manager statistics.
   * @return {Object} Manager statistics.
   */
  getStats() {
    const partitionCount = this.getWorkersByType(WORKER_ENTITY_TYPE.PARTITION).length;
    const messageGroupCount = this.getWorkersByType(WORKER_ENTITY_TYPE.MESSAGE_GROUP).length;

    let healthyCount = NUM.ZERO;
    let unhealthyCount = NUM.ZERO;

    for (const handle of this.workers.values()) {
      if (handle.healthStatus === WORKER_HEALTH_STATUS.HEALTHY) {
        healthyCount++;
      } else if (handle.healthStatus === WORKER_HEALTH_STATUS.UNHEALTHY) {
        unhealthyCount++;
      }
    }

    return {
      nodeId: this.nodeId,
      initialized: this.initialized,
      totalWorkers: this.workers.size,
      partitionWorkers: partitionCount,
      messageGroupWorkers: messageGroupCount,
      healthyWorkers: healthyCount,
      unhealthyWorkers: unhealthyCount,
      maxWorkers: this.maxWorkers,
    };
  }

  /**
   * Shutdown the worker manager.
   * Stops all workers and cleans up resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (!this.initialized) {
      return;
    }

    this.logger.info(MANAGER_LOG_MSG.SHUTTING_DOWN, {
      nodeId: this.nodeId,
      workerCount: this.workers.size,
    });

    this.shuttingDown = true;

    // Stop health check timer
    this.stopHealthCheckTimer();

    // Stop all workers
    const stopPromises = [];
    for (const replicaId of this.workers.keys()) {
      stopPromises.push(
        this.stopReplica(replicaId).catch((error) => {
          this.logger.warn('Failed to stop replica during shutdown', {
            replicaId,
            error: error.message,
          });
        }),
      );
    }

    await Promise.allSettled(stopPromises);

    // Destroy any remaining dedicated replica pools.
    const poolDestroyPromises = [];
    for (const replicaId of this.replicaPools.keys()) {
      poolDestroyPromises.push(
        this.destroyDedicatedReplicaPool(replicaId).catch((error) => {
          this.logger.warn('Failed to destroy dedicated pool during shutdown', {
            replicaId,
            error: error.message,
          });
        }),
      );
    }
    await Promise.allSettled(poolDestroyPromises);

    // Destroy piscina pool
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
    }

    this.initialized = false;
    this.shuttingDown = false;

    this.logger.info(MANAGER_LOG_MSG.SHUTDOWN_COMPLETE, {
      nodeId: this.nodeId,
    });

    this.emit(WORKER_EVENT.STOPPED, {nodeId: this.nodeId});
  }
}

export {
  ReplicaWorkerManager,
  MANAGER_ERROR_MSG,
  MANAGER_LOG_MSG,
  MANAGER_DEFAULT,
};
