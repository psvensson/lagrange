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
  FACADE_MESSAGE_TYPE,
  LEADERSHIP_MESSAGE_TYPE,
} from './worker-constants.js';
import {NUM} from '../constants/index.js';
import {
  ReplicaCreationProgressReporter,
} from '../utils/replica-creation-progress-reporter.js';
import {
  createReplicaWorkerManagerProgressMethods,
} from './replica-worker-manager-progress.js';
import {
  createReplicaWorkerManagerPoolRoutingMethods,
} from './replica-worker-manager-pool-routing.js';
import {
  createReplicaWorkerManagerReplicaCreationMethods,
} from './replica-worker-manager-replica-creation.js';

const LOCAL_STR_REPLICA_WORKER_JS = 'replica-worker.js';
const LOCAL_STR_1P56U = 'replica-worker.bundle.cjs';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_MESSAGE = 'message';
const LOCAL_STR_12101 = 'Failed to handle worker message';
const LOCAL_STR_O3DH7 = 'Created dedicated replica pool';
const LOCAL_STR_WORKER_SEND = 'WORKER_SEND';
const LOCAL_STR_1HK0P = 'Routing worker message';
const LOCAL_STR_SVWDT = 'Invalid target address format';
const LOCAL_STR_9XUGG = 'Target replica not found locally';
const LOCAL_STR_7II3O = 'Failed to route external worker message';
const LOCAL_STR_J1K7I = 'Worker message delivered';
const LOCAL_STR_1J4DX = 'Failed to route local worker message';
const LOCAL_STR_1P3J1 = 'Health check failed';
const LOCAL_STR_1VOGR = 'Worker health check failed';
const LOCAL_STR_TIMEOUT = 'timeout';
const LOCAL_STR_1E23B = 'Failed to destroy dedicated replica pool';
const LOCAL_STR_ORCT1 = 'Failed to destroy dedicated replica pool after crash';
const LOCAL_STR_140D3 = 'Failed to stop replica during shutdown';
const LOCAL_STR_1YHWS = 'Failed to destroy dedicated pool during shutdown';

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

const REPLICA_WORKER_MANAGER_PROGRESS_METHODS =
  createReplicaWorkerManagerProgressMethods({
    REPLICA_CREATE_PROGRESS,
    LOCAL_STR_EMPTY,
    LOCAL_STR_STRING,
  });

const REPLICA_WORKER_MANAGER_POOL_ROUTING_METHODS =
  createReplicaWorkerManagerPoolRoutingMethods({
    Piscina,
    MANAGER_DEFAULT,
    MANAGER_LOG_MSG,
    NUM,
    WORKER_MANAGER_ADDRESS_SEGMENT,
    LOCAL_STR_ERROR,
    LOCAL_STR_MESSAGE,
    LOCAL_STR_12101,
    LOCAL_STR_O3DH7,
    LOCAL_STR_WORKER_SEND,
    LOCAL_STR_1HK0P,
    LOCAL_STR_SVWDT,
    LOCAL_STR_9XUGG,
    LOCAL_STR_7II3O,
    LOCAL_STR_J1K7I,
    LOCAL_STR_1J4DX,
  });

const REPLICA_WORKER_MANAGER_REPLICA_CREATION_METHODS =
  createReplicaWorkerManagerReplicaCreationMethods({
    FACADE_MESSAGE_TYPE,
    MANAGER_DEFAULT,
    MANAGER_ERROR_MSG,
    MANAGER_LOG_MSG,
    NUM,
    REPLICA_CREATE_PROGRESS,
    WORKER_ENTITY_TYPE,
    WORKER_EVENT,
    WORKER_HEALTH_STATUS,
    WORKER_OPERATION,
    WORKER_STATUS,
    LOCAL_STR_STRING,
    LOCAL_STR_TIMEOUT,
  });

const REPLICA_WORKER_MODULE_DIR = resolveModuleDirectory(resolveModuleDirectory);

function resolveReplicaWorkerPath() {
  return resolvePackagedRuntimeFile({
    moduleDir: REPLICA_WORKER_MODULE_DIR,
    sourceFileName: LOCAL_STR_REPLICA_WORKER_JS,
    bundledFileName: LOCAL_STR_1P56U,
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
   * Start the health check timer.
   * @private
   */
  startHealthCheckTimer() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks().catch((error) => {
        this.logger.error(LOCAL_STR_1P3J1, {
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
      this.logger.warn(LOCAL_STR_1VOGR, {
        replicaId,
        error: error.message,
      });
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
        this.logger.warn(LOCAL_STR_1E23B, {
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
      this.logger.warn(LOCAL_STR_ORCT1, {
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
          this.logger.warn(LOCAL_STR_140D3, {
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
          this.logger.warn(LOCAL_STR_1YHWS, {
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

Object.assign(
  ReplicaWorkerManager.prototype,
  REPLICA_WORKER_MANAGER_PROGRESS_METHODS,
  REPLICA_WORKER_MANAGER_POOL_ROUTING_METHODS,
  REPLICA_WORKER_MANAGER_REPLICA_CREATION_METHODS,
);

export {
  ReplicaWorkerManager,
  MANAGER_ERROR_MSG,
  MANAGER_LOG_MSG,
  MANAGER_DEFAULT,
};
