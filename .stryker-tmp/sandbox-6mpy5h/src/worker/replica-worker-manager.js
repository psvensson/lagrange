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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import Piscina from 'piscina';
import { EventEmitter } from 'events';
import { resolveModuleDirectory, resolvePackagedRuntimeFile } from '../sea/runtime-file-resolution.js';
import { WORKER_OPERATION, WORKER_STATUS, WORKER_EVENT, WORKER_HEALTH_STATUS, WORKER_ENTITY_TYPE, WORKER_ERROR_MSG, FACADE_MESSAGE_TYPE, LEADERSHIP_MESSAGE_TYPE } from './worker-constants.js';
import { NUM } from '../constants/index.js';
import { ReplicaCreationProgressReporter } from '../utils/replica-creation-progress-reporter.js';

/**
 * Error messages for ReplicaWorkerManager.
 * @type {Readonly<Object>}
 */
const MANAGER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("165484") ? {} : (stryCov_9fa48("165484"), {
  NOT_INITIALIZED: stryMutAct_9fa48("165485") ? "" : (stryCov_9fa48("165485"), 'ReplicaWorkerManager not initialized'),
  ALREADY_INITIALIZED: stryMutAct_9fa48("165486") ? "" : (stryCov_9fa48("165486"), 'ReplicaWorkerManager already initialized'),
  REPLICA_NOT_FOUND: stryMutAct_9fa48("165487") ? "" : (stryCov_9fa48("165487"), 'Replica not found'),
  REPLICA_ALREADY_EXISTS: stryMutAct_9fa48("165488") ? "" : (stryCov_9fa48("165488"), 'Replica already exists'),
  MISSING_PARTITION_ID: stryMutAct_9fa48("165489") ? "" : (stryCov_9fa48("165489"), 'partitionId is required'),
  MISSING_REPLICA_ID: stryMutAct_9fa48("165490") ? "" : (stryCov_9fa48("165490"), 'replicaId is required'),
  MISSING_GROUP_ID: stryMutAct_9fa48("165491") ? "" : (stryCov_9fa48("165491"), 'groupId is required'),
  MISSING_NODE_ID: stryMutAct_9fa48("165492") ? "" : (stryCov_9fa48("165492"), 'nodeId is required'),
  WORKER_SPAWN_FAILED: stryMutAct_9fa48("165493") ? "" : (stryCov_9fa48("165493"), 'Failed to spawn worker process'),
  WORKER_STOP_FAILED: stryMutAct_9fa48("165494") ? "" : (stryCov_9fa48("165494"), 'Failed to stop worker process'),
  MISSING_MESSAGE_ROUTER: stryMutAct_9fa48("165495") ? "" : (stryCov_9fa48("165495"), 'messageRouter is required'),
  // Timeout error message generators - Requirements 7.1, 7.2
  createReplicaTimeout: stryMutAct_9fa48("165496") ? () => undefined : (stryCov_9fa48("165496"), timeoutMs => stryMutAct_9fa48("165497") ? `` : (stryCov_9fa48("165497"), `CREATE_REPLICA timeout after ${timeoutMs}ms`))
}));

/**
 * Log messages for ReplicaWorkerManager.
 * @type {Readonly<Object>}
 */
const MANAGER_LOG_MSG = Object.freeze(stryMutAct_9fa48("165498") ? {} : (stryCov_9fa48("165498"), {
  INITIALIZING: stryMutAct_9fa48("165499") ? "" : (stryCov_9fa48("165499"), 'Initializing ReplicaWorkerManager'),
  INITIALIZED: stryMutAct_9fa48("165500") ? "" : (stryCov_9fa48("165500"), 'ReplicaWorkerManager initialized'),
  CREATING_PARTITION_REPLICA: stryMutAct_9fa48("165501") ? "" : (stryCov_9fa48("165501"), 'Creating partition replica in worker process'),
  PARTITION_REPLICA_CREATED: stryMutAct_9fa48("165502") ? "" : (stryCov_9fa48("165502"), 'Partition replica created in worker process'),
  CREATING_MESSAGE_GROUP_REPLICA: stryMutAct_9fa48("165503") ? "" : (stryCov_9fa48("165503"), 'Creating message group replica in worker process'),
  MESSAGE_GROUP_REPLICA_CREATED: stryMutAct_9fa48("165504") ? "" : (stryCov_9fa48("165504"), 'Message group replica created in worker process'),
  STOPPING_REPLICA: stryMutAct_9fa48("165505") ? "" : (stryCov_9fa48("165505"), 'Stopping replica worker process'),
  REPLICA_STOPPED: stryMutAct_9fa48("165506") ? "" : (stryCov_9fa48("165506"), 'Replica worker process stopped'),
  WORKER_CRASHED: stryMutAct_9fa48("165507") ? "" : (stryCov_9fa48("165507"), 'Worker process crashed'),
  HEALTH_CHECK_STARTED: stryMutAct_9fa48("165508") ? "" : (stryCov_9fa48("165508"), 'Health check started'),
  HEALTH_CHECK_COMPLETED: stryMutAct_9fa48("165509") ? "" : (stryCov_9fa48("165509"), 'Health check completed'),
  SHUTTING_DOWN: stryMutAct_9fa48("165510") ? "" : (stryCov_9fa48("165510"), 'Shutting down ReplicaWorkerManager'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("165511") ? "" : (stryCov_9fa48("165511"), 'ReplicaWorkerManager shutdown complete'),
  HANDLER_REGISTERED: stryMutAct_9fa48("165512") ? "" : (stryCov_9fa48("165512"), 'Registered MessageRouter handler for worker'),
  HANDLER_UNREGISTERED: stryMutAct_9fa48("165513") ? "" : (stryCov_9fa48("165513"), 'Unregistered MessageRouter handler for worker'),
  // Timeout cleanup messages - Requirement 7.3
  TIMEOUT_CLEANUP_STARTED: stryMutAct_9fa48("165514") ? "" : (stryCov_9fa48("165514"), 'Cleaning up partial replica after timeout'),
  TIMEOUT_CLEANUP_COMPLETED: stryMutAct_9fa48("165515") ? "" : (stryCov_9fa48("165515"), 'Partial replica cleanup completed'),
  TIMEOUT_CLEANUP_FAILED: stryMutAct_9fa48("165516") ? "" : (stryCov_9fa48("165516"), 'Partial replica cleanup failed')
}));

/**
 * Default configuration for ReplicaWorkerManager.
 * @type {Readonly<Object>}
 */
const MANAGER_DEFAULT = Object.freeze(stryMutAct_9fa48("165517") ? {} : (stryCov_9fa48("165517"), {
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
  CREATE_REPLICA_TIMEOUT_MS: 30000
}));

/**
 * Replica creation progress constants.
 * @type {Readonly<Object>}
 */
const REPLICA_CREATE_PROGRESS = Object.freeze(stryMutAct_9fa48("165518") ? {} : (stryCov_9fa48("165518"), {
  PREFIX: stryMutAct_9fa48("165519") ? "" : (stryCov_9fa48("165519"), '[replica-create]'),
  SPINNER_IDLE: stryMutAct_9fa48("165520") ? "" : (stryCov_9fa48("165520"), '|'),
  STATE_STARTING: stryMutAct_9fa48("165521") ? "" : (stryCov_9fa48("165521"), 'starting'),
  STATE_SPAWNING: stryMutAct_9fa48("165522") ? "" : (stryCov_9fa48("165522"), 'spawning_worker'),
  STATE_WORKER_READY: stryMutAct_9fa48("165523") ? "" : (stryCov_9fa48("165523"), 'worker_ready'),
  STATE_REGISTERING: stryMutAct_9fa48("165524") ? "" : (stryCov_9fa48("165524"), 'registering_router'),
  STATE_RUNNING: stryMutAct_9fa48("165525") ? "" : (stryCov_9fa48("165525"), 'running'),
  STATE_TIMEOUT: stryMutAct_9fa48("165526") ? "" : (stryCov_9fa48("165526"), 'timeout'),
  STATE_FAILED: stryMutAct_9fa48("165527") ? "" : (stryCov_9fa48("165527"), 'failed')
}));
const REPLICA_WORKER_MODULE_DIR = resolveModuleDirectory(resolveModuleDirectory);
function resolveReplicaWorkerPath() {
  if (stryMutAct_9fa48("165528")) {
    {}
  } else {
    stryCov_9fa48("165528");
    return resolvePackagedRuntimeFile(stryMutAct_9fa48("165529") ? {} : (stryCov_9fa48("165529"), {
      moduleDir: REPLICA_WORKER_MODULE_DIR,
      sourceFileName: stryMutAct_9fa48("165530") ? "" : (stryCov_9fa48("165530"), 'replica-worker.js'),
      bundledFileName: stryMutAct_9fa48("165531") ? "" : (stryCov_9fa48("165531"), 'replica-worker.bundle.cjs')
    }));
  }
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
    if (stryMutAct_9fa48("165532")) {
      {}
    } else {
      stryCov_9fa48("165532");
      super();
      if (stryMutAct_9fa48("165535") ? false : stryMutAct_9fa48("165534") ? true : stryMutAct_9fa48("165533") ? options.nodeId : (stryCov_9fa48("165533", "165534", "165535"), !options.nodeId)) {
        if (stryMutAct_9fa48("165536")) {
          {}
        } else {
          stryCov_9fa48("165536");
          throw new Error(MANAGER_ERROR_MSG.MISSING_NODE_ID);
        }
      }
      if (stryMutAct_9fa48("165539") ? false : stryMutAct_9fa48("165538") ? true : stryMutAct_9fa48("165537") ? options.messageRouter : (stryCov_9fa48("165537", "165538", "165539"), !options.messageRouter)) {
        if (stryMutAct_9fa48("165540")) {
          {}
        } else {
          stryCov_9fa48("165540");
          throw new Error(MANAGER_ERROR_MSG.MISSING_MESSAGE_ROUTER);
        }
      }

      /** @type {string} Node ID */
      this.nodeId = options.nodeId;

      /** @type {Object} MessageRouter instance for handler registration */
      this.messageRouter = options.messageRouter;

      /** @type {string} Path to worker entry point */
      this.workerPath = stryMutAct_9fa48("165543") ? options.workerPath && resolveReplicaWorkerPath() : stryMutAct_9fa48("165542") ? false : stryMutAct_9fa48("165541") ? true : (stryCov_9fa48("165541", "165542", "165543"), options.workerPath || resolveReplicaWorkerPath());

      /** @type {Object} Logger instance */
      this.logger = stryMutAct_9fa48("165546") ? options.logger && console : stryMutAct_9fa48("165545") ? false : stryMutAct_9fa48("165544") ? true : (stryCov_9fa48("165544", "165545", "165546"), options.logger || console);

      /** @type {number} Maximum concurrent workers */
      this.maxWorkers = stryMutAct_9fa48("165549") ? options.maxWorkers && MANAGER_DEFAULT.MAX_WORKERS : stryMutAct_9fa48("165548") ? false : stryMutAct_9fa48("165547") ? true : (stryCov_9fa48("165547", "165548", "165549"), options.maxWorkers || MANAGER_DEFAULT.MAX_WORKERS);

      /** @type {number} Health check interval in milliseconds */
      this.healthCheckIntervalMs = stryMutAct_9fa48("165552") ? options.healthCheckIntervalMs && MANAGER_DEFAULT.HEALTH_CHECK_INTERVAL_MS : stryMutAct_9fa48("165551") ? false : stryMutAct_9fa48("165550") ? true : (stryCov_9fa48("165550", "165551", "165552"), options.healthCheckIntervalMs || MANAGER_DEFAULT.HEALTH_CHECK_INTERVAL_MS);

      /** @type {Piscina|null} Piscina worker pool */
      this.pool = null;

      /** @type {Map<string, WorkerReplicaHandle>} Worker handles by replica ID */
      this.workers = new Map();

      /** @type {Map<string, Piscina>} Dedicated worker pool per replica */
      this.replicaPools = new Map();

      /** @type {boolean} Whether the manager is initialized */
      this.initialized = stryMutAct_9fa48("165553") ? true : (stryCov_9fa48("165553"), false);

      /** @type {NodeJS.Timeout|null} Health check interval timer */
      this.healthCheckTimer = null;

      /** @type {boolean} Whether the manager is shutting down */
      this.shuttingDown = stryMutAct_9fa48("165554") ? true : (stryCov_9fa48("165554"), false);

      /** @type {ReplicaCreationProgressReporter} Replica creation progress reporter */
      this.creationProgressReporter = new ReplicaCreationProgressReporter(stryMutAct_9fa48("165555") ? {} : (stryCov_9fa48("165555"), {
        logger: this.logger,
        formatLine: stryMutAct_9fa48("165556") ? () => undefined : (stryCov_9fa48("165556"), (progress, status, error) => this.formatReplicaCreationProgressLine(progress, status, error)),
        buildContext: stryMutAct_9fa48("165557") ? () => undefined : (stryCov_9fa48("165557"), (progress, status, error) => this.buildReplicaCreationProgressContext(progress, status, error))
      }));
    }
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
    if (stryMutAct_9fa48("165558")) {
      {}
    } else {
      stryCov_9fa48("165558");
      return this.creationProgressReporter.start(stryMutAct_9fa48("165559") ? {} : (stryCov_9fa48("165559"), {
        ...details,
        state: REPLICA_CREATE_PROGRESS.STATE_STARTING
      }));
    }
  }

  /**
   * Update the state of an existing replica creation progress line.
   * @param {Object|null} progress - Progress context.
   * @param {string} nextState - Next state label.
   * @private
   */
  updateReplicaCreationProgress(progress, nextState) {
    if (stryMutAct_9fa48("165560")) {
      {}
    } else {
      stryCov_9fa48("165560");
      this.creationProgressReporter.update(progress, stryMutAct_9fa48("165561") ? {} : (stryCov_9fa48("165561"), {
        state: nextState
      }));
    }
  }

  /**
   * Complete a replica creation progress line.
   * @param {Object|null} progress - Progress context.
   * @param {string} finalState - Final state label.
   * @private
   */
  finishReplicaCreationProgress(progress, finalState) {
    if (stryMutAct_9fa48("165562")) {
      {}
    } else {
      stryCov_9fa48("165562");
      this.creationProgressReporter.finish(progress, stryMutAct_9fa48("165563") ? {} : (stryCov_9fa48("165563"), {
        state: finalState
      }));
    }
  }

  /**
   * Mark a replica creation progress line as failed.
   * @param {Object|null} progress - Progress context.
   * @param {string} finalState - Final state label.
   * @param {Error|string|null} error - Failure reason.
   * @private
   */
  failReplicaCreationProgress(progress, finalState, error) {
    if (stryMutAct_9fa48("165564")) {
      {}
    } else {
      stryCov_9fa48("165564");
      this.creationProgressReporter.fail(progress, error, stryMutAct_9fa48("165565") ? {} : (stryCov_9fa48("165565"), {
        state: finalState
      }));
    }
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
    if (stryMutAct_9fa48("165566")) {
      {}
    } else {
      stryCov_9fa48("165566");
      const spinner = stryMutAct_9fa48("165569") ? progress.spinnerFrame && REPLICA_CREATE_PROGRESS.SPINNER_IDLE : stryMutAct_9fa48("165568") ? false : stryMutAct_9fa48("165567") ? true : (stryCov_9fa48("165567", "165568", "165569"), progress.spinnerFrame || REPLICA_CREATE_PROGRESS.SPINNER_IDLE);
      const totalLocal = this.getWorkerCount();
      const localByType = this.getWorkersByType(progress.entityType).length;
      const statusText = status ? stryMutAct_9fa48("165570") ? `` : (stryCov_9fa48("165570"), ` status=${status}`) : stryMutAct_9fa48("165571") ? "Stryker was here!" : (stryCov_9fa48("165571"), '');
      const errorText = error ? stryMutAct_9fa48("165572") ? `` : (stryCov_9fa48("165572"), ` error=${this.formatReplicaCreationError(error)}`) : stryMutAct_9fa48("165573") ? "Stryker was here!" : (stryCov_9fa48("165573"), '');
      return (stryMutAct_9fa48("165574") ? `` : (stryCov_9fa48("165574"), `${REPLICA_CREATE_PROGRESS.PREFIX} ${spinner} `)) + (stryMutAct_9fa48("165575") ? `` : (stryCov_9fa48("165575"), `service=${progress.serviceId} replica=${progress.replicaId} `)) + (stryMutAct_9fa48("165576") ? `` : (stryCov_9fa48("165576"), `type=${progress.entityType} state=${progress.state} `)) + (stryMutAct_9fa48("165577") ? `` : (stryCov_9fa48("165577"), `local_replicas=${totalLocal} type_replicas=${localByType}`)) + (stryMutAct_9fa48("165578") ? `` : (stryCov_9fa48("165578"), `${statusText}${errorText}`));
    }
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
    if (stryMutAct_9fa48("165579")) {
      {}
    } else {
      stryCov_9fa48("165579");
      const context = stryMutAct_9fa48("165580") ? {} : (stryCov_9fa48("165580"), {
        nodeId: this.nodeId,
        serviceId: progress.serviceId,
        replicaId: progress.replicaId,
        entityType: progress.entityType,
        state: progress.state,
        localReplicas: this.getWorkerCount(),
        typeReplicas: this.getWorkersByType(progress.entityType).length
      });
      if (stryMutAct_9fa48("165582") ? false : stryMutAct_9fa48("165581") ? true : (stryCov_9fa48("165581", "165582"), status)) {
        if (stryMutAct_9fa48("165583")) {
          {}
        } else {
          stryCov_9fa48("165583");
          context.status = status;
        }
      }
      if (stryMutAct_9fa48("165585") ? false : stryMutAct_9fa48("165584") ? true : (stryCov_9fa48("165584", "165585"), error)) {
        if (stryMutAct_9fa48("165586")) {
          {}
        } else {
          stryCov_9fa48("165586");
          context.error = this.formatReplicaCreationError(error);
        }
      }
      return context;
    }
  }

  /**
   * Normalize replica creation errors for display.
   * @param {Error|string|null} error - Error value.
   * @return {string} Error message.
   * @private
   */
  formatReplicaCreationError(error) {
    if (stryMutAct_9fa48("165587")) {
      {}
    } else {
      stryCov_9fa48("165587");
      if (stryMutAct_9fa48("165590") ? false : stryMutAct_9fa48("165589") ? true : stryMutAct_9fa48("165588") ? error : (stryCov_9fa48("165588", "165589", "165590"), !error)) {
        if (stryMutAct_9fa48("165591")) {
          {}
        } else {
          stryCov_9fa48("165591");
          return stryMutAct_9fa48("165592") ? "Stryker was here!" : (stryCov_9fa48("165592"), '');
        }
      }
      return (stryMutAct_9fa48("165595") ? typeof error !== 'string' : stryMutAct_9fa48("165594") ? false : stryMutAct_9fa48("165593") ? true : (stryCov_9fa48("165593", "165594", "165595"), typeof error === (stryMutAct_9fa48("165596") ? "" : (stryCov_9fa48("165596"), 'string')))) ? error : error.message;
    }
  }

  /**
   * Initialize the worker manager.
   * Creates the piscina worker pool.
   * @return {Promise<void>}
   */
  async initialize() {
    if (stryMutAct_9fa48("165597")) {
      {}
    } else {
      stryCov_9fa48("165597");
      if (stryMutAct_9fa48("165599") ? false : stryMutAct_9fa48("165598") ? true : (stryCov_9fa48("165598", "165599"), this.initialized)) {
        if (stryMutAct_9fa48("165600")) {
          {}
        } else {
          stryCov_9fa48("165600");
          throw new Error(MANAGER_ERROR_MSG.ALREADY_INITIALIZED);
        }
      }
      this.logger.info(MANAGER_LOG_MSG.INITIALIZING, stryMutAct_9fa48("165601") ? {} : (stryCov_9fa48("165601"), {
        nodeId: this.nodeId,
        maxWorkers: this.maxWorkers
      }));

      // Create piscina worker pool
      this.pool = new Piscina(stryMutAct_9fa48("165602") ? {} : (stryCov_9fa48("165602"), {
        filename: this.workerPath,
        maxThreads: this.maxWorkers,
        minThreads: MANAGER_DEFAULT.MIN_WORKERS,
        idleTimeout: MANAGER_DEFAULT.IDLE_TIMEOUT_MS
      }));

      // Set up pool event handlers
      this.setupPoolEventHandlers();

      // Start health check timer
      this.startHealthCheckTimer();
      this.initialized = stryMutAct_9fa48("165603") ? false : (stryCov_9fa48("165603"), true);
      this.logger.info(MANAGER_LOG_MSG.INITIALIZED, stryMutAct_9fa48("165604") ? {} : (stryCov_9fa48("165604"), {
        nodeId: this.nodeId
      }));
      this.emit(WORKER_EVENT.INITIALIZED, stryMutAct_9fa48("165605") ? {} : (stryCov_9fa48("165605"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Set up piscina pool event handlers.
   * @private
   */
  setupPoolEventHandlers() {
    if (stryMutAct_9fa48("165606")) {
      {}
    } else {
      stryCov_9fa48("165606");
      this.setupPoolEventHandlersFor(this.pool);
    }
  }

  /**
   * Set up piscina pool event handlers for a specific pool.
   * @param {Piscina} pool - Piscina pool to wire.
   * @private
   */
  setupPoolEventHandlersFor(pool) {
    if (stryMutAct_9fa48("165607")) {
      {}
    } else {
      stryCov_9fa48("165607");
      if (stryMutAct_9fa48("165610") ? false : stryMutAct_9fa48("165609") ? true : stryMutAct_9fa48("165608") ? pool : (stryCov_9fa48("165608", "165609", "165610"), !pool)) {
        if (stryMutAct_9fa48("165611")) {
          {}
        } else {
          stryCov_9fa48("165611");
          return;
        }
      }

      // Handle worker errors
      pool.on(stryMutAct_9fa48("165612") ? "" : (stryCov_9fa48("165612"), 'error'), error => {
        if (stryMutAct_9fa48("165613")) {
          {}
        } else {
          stryCov_9fa48("165613");
          this.logger.error(MANAGER_LOG_MSG.WORKER_CRASHED, stryMutAct_9fa48("165614") ? {} : (stryCov_9fa48("165614"), {
            nodeId: this.nodeId,
            error: error.message
          }));
        }
      });

      // Handle messages from workers (IPC messages for Raft packet routing)
      // Workers send WORKER_SEND messages via parentPort.postMessage()
      // Piscina emits these as 'message' events on the pool
      pool.on(stryMutAct_9fa48("165615") ? "" : (stryCov_9fa48("165615"), 'message'), message => {
        if (stryMutAct_9fa48("165616")) {
          {}
        } else {
          stryCov_9fa48("165616");
          this.handleWorkerMessage(message).catch(error => {
            if (stryMutAct_9fa48("165617")) {
              {}
            } else {
              stryCov_9fa48("165617");
              this.logger.error(stryMutAct_9fa48("165618") ? "" : (stryCov_9fa48("165618"), 'Failed to handle worker message'), stryMutAct_9fa48("165619") ? {} : (stryCov_9fa48("165619"), {
                nodeId: this.nodeId,
                error: error.message,
                messageType: stryMutAct_9fa48("165620") ? message.type : (stryCov_9fa48("165620"), message?.type)
              }));
            }
          });
        }
      });
    }
  }

  /**
   * Check if manager should use dedicated per-replica pools.
   * Real Piscina instances use dedicated pools; mocked pools in unit tests do not.
   * @return {boolean} True if dedicated pools should be used.
   * @private
   */
  usesDedicatedReplicaPools() {
    if (stryMutAct_9fa48("165621")) {
      {}
    } else {
      stryCov_9fa48("165621");
      return this.pool instanceof Piscina;
    }
  }

  /**
   * Create a dedicated single-thread pool for one replica.
   * @param {string} replicaId - Replica ID for logging.
   * @return {Piscina} Dedicated pool.
   * @private
   */
  createDedicatedReplicaPool(replicaId) {
    if (stryMutAct_9fa48("165622")) {
      {}
    } else {
      stryCov_9fa48("165622");
      const pool = new Piscina(stryMutAct_9fa48("165623") ? {} : (stryCov_9fa48("165623"), {
        filename: this.workerPath,
        maxThreads: NUM.ONE,
        minThreads: NUM.ONE,
        idleTimeout: MANAGER_DEFAULT.IDLE_TIMEOUT_MS
      }));
      this.setupPoolEventHandlersFor(pool);
      this.logger.debug(stryMutAct_9fa48("165624") ? "" : (stryCov_9fa48("165624"), 'Created dedicated replica pool'), stryMutAct_9fa48("165625") ? {} : (stryCov_9fa48("165625"), {
        nodeId: this.nodeId,
        replicaId
      }));
      return pool;
    }
  }

  /**
   * Resolve execution pool for a replica operation.
   * @param {string} replicaId - Replica ID.
   * @return {Piscina|Object|null} Pool-like object with run().
   * @private
   */
  getReplicaExecutionPool(replicaId) {
    if (stryMutAct_9fa48("165626")) {
      {}
    } else {
      stryCov_9fa48("165626");
      return stryMutAct_9fa48("165629") ? this.replicaPools.get(replicaId) && this.pool : stryMutAct_9fa48("165628") ? false : stryMutAct_9fa48("165627") ? true : (stryCov_9fa48("165627", "165628", "165629"), this.replicaPools.get(replicaId) || this.pool);
    }
  }

  /**
   * Destroy dedicated pool for a replica if present.
   * @param {string} replicaId - Replica ID.
   * @return {Promise<void>}
   * @private
   */
  async destroyDedicatedReplicaPool(replicaId) {
    if (stryMutAct_9fa48("165630")) {
      {}
    } else {
      stryCov_9fa48("165630");
      const pool = this.replicaPools.get(replicaId);
      if (stryMutAct_9fa48("165633") ? false : stryMutAct_9fa48("165632") ? true : stryMutAct_9fa48("165631") ? pool : (stryCov_9fa48("165631", "165632", "165633"), !pool)) {
        if (stryMutAct_9fa48("165634")) {
          {}
        } else {
          stryCov_9fa48("165634");
          return;
        }
      }
      this.replicaPools.delete(replicaId);
      await pool.destroy();
    }
  }

  /**
   * Handle IPC message from a worker process.
   * Routes messages between workers via the MessageRouter.
   * @param {Object} message - IPC message from worker.
   * @return {Promise<void>}
   * @private
   */
  async handleWorkerMessage(message) {
    if (stryMutAct_9fa48("165635")) {
      {}
    } else {
      stryCov_9fa48("165635");
      if (stryMutAct_9fa48("165638") ? !message && !message.type : stryMutAct_9fa48("165637") ? false : stryMutAct_9fa48("165636") ? true : (stryCov_9fa48("165636", "165637", "165638"), (stryMutAct_9fa48("165639") ? message : (stryCov_9fa48("165639"), !message)) || (stryMutAct_9fa48("165640") ? message.type : (stryCov_9fa48("165640"), !message.type)))) {
        if (stryMutAct_9fa48("165641")) {
          {}
        } else {
          stryCov_9fa48("165641");
          return;
        }
      }

      // Handle WORKER_SEND messages - route to target worker
      if (stryMutAct_9fa48("165644") ? message.type !== 'WORKER_SEND' : stryMutAct_9fa48("165643") ? false : stryMutAct_9fa48("165642") ? true : (stryCov_9fa48("165642", "165643", "165644"), message.type === (stryMutAct_9fa48("165645") ? "" : (stryCov_9fa48("165645"), 'WORKER_SEND')))) {
        if (stryMutAct_9fa48("165646")) {
          {}
        } else {
          stryCov_9fa48("165646");
          await this.routeWorkerMessage(message);
          return;
        }
      }
    }
  }

  /**
   * Route a message from one worker to another.
   * @param {Object} envelope - Message envelope with source, target, and payload.
   * @return {Promise<void>}
   * @private
   */
  async routeWorkerMessage(envelope) {
    if (stryMutAct_9fa48("165647")) {
      {}
    } else {
      stryCov_9fa48("165647");
      const {
        targetAddress,
        sourceAddress,
        payload,
        messageId,
        correlationId
      } = envelope;
      this.logger.debug(stryMutAct_9fa48("165648") ? "" : (stryCov_9fa48("165648"), 'Routing worker message'), stryMutAct_9fa48("165649") ? {} : (stryCov_9fa48("165649"), {
        nodeId: this.nodeId,
        sourceAddress,
        targetAddress,
        messageId
      }));

      // Extract replica ID from target address (format: nodeId/entityType/replicaId)
      const targetParts = targetAddress.split(stryMutAct_9fa48("165650") ? "" : (stryCov_9fa48("165650"), '/'));
      if (stryMutAct_9fa48("165654") ? targetParts.length >= 3 : stryMutAct_9fa48("165653") ? targetParts.length <= 3 : stryMutAct_9fa48("165652") ? false : stryMutAct_9fa48("165651") ? true : (stryCov_9fa48("165651", "165652", "165653", "165654"), targetParts.length < 3)) {
        if (stryMutAct_9fa48("165655")) {
          {}
        } else {
          stryCov_9fa48("165655");
          this.logger.warn(stryMutAct_9fa48("165656") ? "" : (stryCov_9fa48("165656"), 'Invalid target address format'), stryMutAct_9fa48("165657") ? {} : (stryCov_9fa48("165657"), {
            targetAddress,
            messageId
          }));
          return;
        }
      }
      const targetReplicaId = targetParts[2];

      // Check if target replica exists in this manager
      const targetHandle = this.workers.get(targetReplicaId);
      if (stryMutAct_9fa48("165660") ? false : stryMutAct_9fa48("165659") ? true : stryMutAct_9fa48("165658") ? targetHandle : (stryCov_9fa48("165658", "165659", "165660"), !targetHandle)) {
        if (stryMutAct_9fa48("165661")) {
          {}
        } else {
          stryCov_9fa48("165661");
          this.logger.debug(stryMutAct_9fa48("165662") ? "" : (stryCov_9fa48("165662"), 'Target replica not found locally'), stryMutAct_9fa48("165663") ? {} : (stryCov_9fa48("165663"), {
            targetReplicaId,
            messageId
          }));
          // If we have a messageRouter, try to route externally
          if (stryMutAct_9fa48("165665") ? false : stryMutAct_9fa48("165664") ? true : (stryCov_9fa48("165664", "165665"), this.messageRouter)) {
            if (stryMutAct_9fa48("165666")) {
              {}
            } else {
              stryCov_9fa48("165666");
              await this.messageRouter.deliver(targetAddress, payload);
            }
          }
          return;
        }
      }
      const response = await this.deliverMessage(targetReplicaId, payload);
      this.logger.debug(stryMutAct_9fa48("165667") ? "" : (stryCov_9fa48("165667"), 'Worker message delivered'), stryMutAct_9fa48("165668") ? {} : (stryCov_9fa48("165668"), {
        nodeId: this.nodeId,
        targetReplicaId,
        messageId,
        acknowledged: stryMutAct_9fa48("165669") ? response.acknowledged : (stryCov_9fa48("165669"), response?.acknowledged)
      }));
    }
  }

  /**
   * Start the health check timer.
   * @private
   */
  startHealthCheckTimer() {
    if (stryMutAct_9fa48("165670")) {
      {}
    } else {
      stryCov_9fa48("165670");
      if (stryMutAct_9fa48("165672") ? false : stryMutAct_9fa48("165671") ? true : (stryCov_9fa48("165671", "165672"), this.healthCheckTimer)) {
        if (stryMutAct_9fa48("165673")) {
          {}
        } else {
          stryCov_9fa48("165673");
          clearInterval(this.healthCheckTimer);
        }
      }
      this.healthCheckTimer = setInterval(() => {
        if (stryMutAct_9fa48("165674")) {
          {}
        } else {
          stryCov_9fa48("165674");
          this.performHealthChecks().catch(error => {
            if (stryMutAct_9fa48("165675")) {
              {}
            } else {
              stryCov_9fa48("165675");
              this.logger.error(stryMutAct_9fa48("165676") ? "" : (stryCov_9fa48("165676"), 'Health check failed'), stryMutAct_9fa48("165677") ? {} : (stryCov_9fa48("165677"), {
                nodeId: this.nodeId,
                error: error.message
              }));
            }
          });
        }
      }, this.healthCheckIntervalMs);
    }
  }

  /**
   * Stop the health check timer.
   * @private
   */
  stopHealthCheckTimer() {
    if (stryMutAct_9fa48("165678")) {
      {}
    } else {
      stryCov_9fa48("165678");
      if (stryMutAct_9fa48("165680") ? false : stryMutAct_9fa48("165679") ? true : (stryCov_9fa48("165679", "165680"), this.healthCheckTimer)) {
        if (stryMutAct_9fa48("165681")) {
          {}
        } else {
          stryCov_9fa48("165681");
          clearInterval(this.healthCheckTimer);
          this.healthCheckTimer = null;
        }
      }
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
    if (stryMutAct_9fa48("165682")) {
      {}
    } else {
      stryCov_9fa48("165682");
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        if (stryMutAct_9fa48("165683")) {
          {}
        } else {
          stryCov_9fa48("165683");
          timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("165684")) {
              {}
            } else {
              stryCov_9fa48("165684");
              reject(new Error(stryMutAct_9fa48("165685") ? `` : (stryCov_9fa48("165685"), `timeout after ${timeoutMs}ms`)));
            }
          }, timeoutMs);
        }
      });
      return Promise.race(stryMutAct_9fa48("165686") ? [] : (stryCov_9fa48("165686"), [promise, timeoutPromise])).finally(() => {
        if (stryMutAct_9fa48("165687")) {
          {}
        } else {
          stryCov_9fa48("165687");
          clearTimeout(timeoutId);
        }
      });
    }
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
    if (stryMutAct_9fa48("165688")) {
      {}
    } else {
      stryCov_9fa48("165688");
      this.logger.info(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_STARTED, stryMutAct_9fa48("165689") ? {} : (stryCov_9fa48("165689"), {
        nodeId: this.nodeId,
        replicaId
      }));
      const handle = this.workers.get(replicaId);
      if (stryMutAct_9fa48("165691") ? false : stryMutAct_9fa48("165690") ? true : (stryCov_9fa48("165690", "165691"), handle)) {
        if (stryMutAct_9fa48("165692")) {
          {}
        } else {
          stryCov_9fa48("165692");
          // Unregister handler from MessageRouter if it was registered
          if (stryMutAct_9fa48("165694") ? false : stryMutAct_9fa48("165693") ? true : (stryCov_9fa48("165693", "165694"), handle.unifiedAddress)) {
            if (stryMutAct_9fa48("165695")) {
              {}
            } else {
              stryCov_9fa48("165695");
              try {
                if (stryMutAct_9fa48("165696")) {
                  {}
                } else {
                  stryCov_9fa48("165696");
                  this.unregisterWorkerFromRouter(handle.unifiedAddress);
                }
              } catch (error) {
                if (stryMutAct_9fa48("165697")) {
                  {}
                } else {
                  stryCov_9fa48("165697");
                  this.logger.warn(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_FAILED, stryMutAct_9fa48("165698") ? {} : (stryCov_9fa48("165698"), {
                    nodeId: this.nodeId,
                    replicaId,
                    error: error.message
                  }));
                }
              }
            }
          }

          // Remove from workers map
          this.workers.delete(replicaId);
        }
      }
      await this.destroyDedicatedReplicaPool(replicaId).catch(error => {
        if (stryMutAct_9fa48("165699")) {
          {}
        } else {
          stryCov_9fa48("165699");
          this.logger.warn(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_FAILED, stryMutAct_9fa48("165700") ? {} : (stryCov_9fa48("165700"), {
            nodeId: this.nodeId,
            replicaId,
            error: error.message
          }));
        }
      });
      this.logger.info(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_COMPLETED, stryMutAct_9fa48("165701") ? {} : (stryCov_9fa48("165701"), {
        nodeId: this.nodeId,
        replicaId
      }));
    }
  }

  /**
   * Perform health checks on all workers.
   * @return {Promise<void>}
   * @private
   */
  async performHealthChecks() {
    if (stryMutAct_9fa48("165702")) {
      {}
    } else {
      stryCov_9fa48("165702");
      if (stryMutAct_9fa48("165705") ? this.shuttingDown && !this.initialized : stryMutAct_9fa48("165704") ? false : stryMutAct_9fa48("165703") ? true : (stryCov_9fa48("165703", "165704", "165705"), this.shuttingDown || (stryMutAct_9fa48("165706") ? this.initialized : (stryCov_9fa48("165706"), !this.initialized)))) {
        if (stryMutAct_9fa48("165707")) {
          {}
        } else {
          stryCov_9fa48("165707");
          return;
        }
      }
      this.logger.debug(MANAGER_LOG_MSG.HEALTH_CHECK_STARTED, stryMutAct_9fa48("165708") ? {} : (stryCov_9fa48("165708"), {
        nodeId: this.nodeId,
        workerCount: this.workers.size
      }));
      const now = Date.now();
      const healthCheckPromises = stryMutAct_9fa48("165709") ? ["Stryker was here"] : (stryCov_9fa48("165709"), []);
      for (const [replicaId, handle] of this.workers) {
        if (stryMutAct_9fa48("165710")) {
          {}
        } else {
          stryCov_9fa48("165710");
          if (stryMutAct_9fa48("165713") ? handle.status !== WORKER_STATUS.RUNNING : stryMutAct_9fa48("165712") ? false : stryMutAct_9fa48("165711") ? true : (stryCov_9fa48("165711", "165712", "165713"), handle.status === WORKER_STATUS.RUNNING)) {
            if (stryMutAct_9fa48("165714")) {
              {}
            } else {
              stryCov_9fa48("165714");
              healthCheckPromises.push(this.checkWorkerHealth(replicaId, handle, now));
            }
          }
        }
      }
      await Promise.allSettled(healthCheckPromises);
      this.logger.debug(MANAGER_LOG_MSG.HEALTH_CHECK_COMPLETED, stryMutAct_9fa48("165715") ? {} : (stryCov_9fa48("165715"), {
        nodeId: this.nodeId
      }));
    }
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
    if (stryMutAct_9fa48("165716")) {
      {}
    } else {
      stryCov_9fa48("165716");
      try {
        if (stryMutAct_9fa48("165717")) {
          {}
        } else {
          stryCov_9fa48("165717");
          const executionPool = this.getReplicaExecutionPool(replicaId);
          const result = await executionPool.run(stryMutAct_9fa48("165718") ? {} : (stryCov_9fa48("165718"), {
            operation: WORKER_OPERATION.HEALTH_CHECK,
            replicaId
          }));
          handle.lastHealthCheck = now;
          handle.healthStatus = result.healthy ? WORKER_HEALTH_STATUS.HEALTHY : WORKER_HEALTH_STATUS.UNHEALTHY;
        }
      } catch (error) {
        if (stryMutAct_9fa48("165719")) {
          {}
        } else {
          stryCov_9fa48("165719");
          handle.healthStatus = WORKER_HEALTH_STATUS.UNHEALTHY;
          this.logger.warn(stryMutAct_9fa48("165720") ? "" : (stryCov_9fa48("165720"), 'Worker health check failed'), stryMutAct_9fa48("165721") ? {} : (stryCov_9fa48("165721"), {
            replicaId,
            error: error.message
          }));
        }
      }
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
    if (stryMutAct_9fa48("165722")) {
      {}
    } else {
      stryCov_9fa48("165722");
      const expectedReplicaIds = Array.isArray(replicaIds) ? stryMutAct_9fa48("165723") ? [] : (stryCov_9fa48("165723"), [...new Set(stryMutAct_9fa48("165724") ? replicaIds : (stryCov_9fa48("165724"), replicaIds.filter(stryMutAct_9fa48("165725") ? () => undefined : (stryCov_9fa48("165725"), replicaId => stryMutAct_9fa48("165728") ? typeof replicaId === 'string' || replicaId.length > 0 : stryMutAct_9fa48("165727") ? false : stryMutAct_9fa48("165726") ? true : (stryCov_9fa48("165726", "165727", "165728"), (stryMutAct_9fa48("165730") ? typeof replicaId !== 'string' : stryMutAct_9fa48("165729") ? true : (stryCov_9fa48("165729", "165730"), typeof replicaId === (stryMutAct_9fa48("165731") ? "" : (stryCov_9fa48("165731"), 'string')))) && (stryMutAct_9fa48("165734") ? replicaId.length <= 0 : stryMutAct_9fa48("165733") ? replicaId.length >= 0 : stryMutAct_9fa48("165732") ? true : (stryCov_9fa48("165732", "165733", "165734"), replicaId.length > 0)))))))]) : stryMutAct_9fa48("165735") ? ["Stryker was here"] : (stryCov_9fa48("165735"), []);
      if (stryMutAct_9fa48("165739") ? expectedReplicaIds.length > NUM.ONE : stryMutAct_9fa48("165738") ? expectedReplicaIds.length < NUM.ONE : stryMutAct_9fa48("165737") ? false : stryMutAct_9fa48("165736") ? true : (stryCov_9fa48("165736", "165737", "165738", "165739"), expectedReplicaIds.length <= NUM.ONE)) {
        if (stryMutAct_9fa48("165740")) {
          {}
        } else {
          stryCov_9fa48("165740");
          return;
        }
      }
      const allReplicasReady = stryMutAct_9fa48("165741") ? expectedReplicaIds.some(replicaId => {
        const handle = this.workers.get(replicaId);
        return handle?.status === WORKER_STATUS.RUNNING;
      }) : (stryCov_9fa48("165741"), expectedReplicaIds.every(replicaId => {
        if (stryMutAct_9fa48("165742")) {
          {}
        } else {
          stryCov_9fa48("165742");
          const handle = this.workers.get(replicaId);
          return stryMutAct_9fa48("165745") ? handle?.status !== WORKER_STATUS.RUNNING : stryMutAct_9fa48("165744") ? false : stryMutAct_9fa48("165743") ? true : (stryCov_9fa48("165743", "165744", "165745"), (stryMutAct_9fa48("165746") ? handle.status : (stryCov_9fa48("165746"), handle?.status)) === WORKER_STATUS.RUNNING);
        }
      }));
      if (stryMutAct_9fa48("165749") ? false : stryMutAct_9fa48("165748") ? true : stryMutAct_9fa48("165747") ? allReplicasReady : (stryCov_9fa48("165747", "165748", "165749"), !allReplicasReady)) {
        if (stryMutAct_9fa48("165750")) {
          {}
        } else {
          stryCov_9fa48("165750");
          return;
        }
      }
      await Promise.all(expectedReplicaIds.map(replicaId => {
        if (stryMutAct_9fa48("165751")) {
          {}
        } else {
          stryCov_9fa48("165751");
          return this.deliverMessage(replicaId, stryMutAct_9fa48("165752") ? {} : (stryCov_9fa48("165752"), {
            type: FACADE_MESSAGE_TYPE.START_ELECTION
          }));
        }
      }));
    }
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
    if (stryMutAct_9fa48("165753")) {
      {}
    } else {
      stryCov_9fa48("165753");
      if (stryMutAct_9fa48("165756") ? false : stryMutAct_9fa48("165755") ? true : stryMutAct_9fa48("165754") ? this.initialized : (stryCov_9fa48("165754", "165755", "165756"), !this.initialized)) {
        if (stryMutAct_9fa48("165757")) {
          {}
        } else {
          stryCov_9fa48("165757");
          throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("165760") ? false : stryMutAct_9fa48("165759") ? true : stryMutAct_9fa48("165758") ? options.partitionId : (stryCov_9fa48("165758", "165759", "165760"), !options.partitionId)) {
        if (stryMutAct_9fa48("165761")) {
          {}
        } else {
          stryCov_9fa48("165761");
          throw new Error(MANAGER_ERROR_MSG.MISSING_PARTITION_ID);
        }
      }
      if (stryMutAct_9fa48("165764") ? false : stryMutAct_9fa48("165763") ? true : stryMutAct_9fa48("165762") ? options.replicaId : (stryCov_9fa48("165762", "165763", "165764"), !options.replicaId)) {
        if (stryMutAct_9fa48("165765")) {
          {}
        } else {
          stryCov_9fa48("165765");
          throw new Error(MANAGER_ERROR_MSG.MISSING_REPLICA_ID);
        }
      }
      if (stryMutAct_9fa48("165767") ? false : stryMutAct_9fa48("165766") ? true : (stryCov_9fa48("165766", "165767"), this.workers.has(options.replicaId))) {
        if (stryMutAct_9fa48("165768")) {
          {}
        } else {
          stryCov_9fa48("165768");
          throw new Error(MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
        }
      }
      const now = Date.now();
      const unifiedAddress = stryMutAct_9fa48("165769") ? `` : (stryCov_9fa48("165769"), `${this.nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${options.replicaId}`);
      const timeoutMs = stryMutAct_9fa48("165772") ? options.timeoutMs && MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS : stryMutAct_9fa48("165771") ? false : stryMutAct_9fa48("165770") ? true : (stryCov_9fa48("165770", "165771", "165772"), options.timeoutMs || MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS);
      const shouldDeferElection = stryMutAct_9fa48("165775") ? Array.isArray(options.replicaIds) || options.replicaIds.length > NUM.ONE : stryMutAct_9fa48("165774") ? false : stryMutAct_9fa48("165773") ? true : (stryCov_9fa48("165773", "165774", "165775"), Array.isArray(options.replicaIds) && (stryMutAct_9fa48("165778") ? options.replicaIds.length <= NUM.ONE : stryMutAct_9fa48("165777") ? options.replicaIds.length >= NUM.ONE : stryMutAct_9fa48("165776") ? true : (stryCov_9fa48("165776", "165777", "165778"), options.replicaIds.length > NUM.ONE)));

      // Create worker handle
      const handle = stryMutAct_9fa48("165779") ? {} : (stryCov_9fa48("165779"), {
        replicaId: options.replicaId,
        workerId: NUM.ZERO,
        // Will be set by piscina
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        unifiedAddress,
        status: WORKER_STATUS.STARTING,
        createdAt: now,
        lastHealthCheck: now,
        healthStatus: WORKER_HEALTH_STATUS.UNKNOWN,
        partitionId: options.partitionId,
        tableId: options.tableId,
        tableName: options.tableName
      });

      // Store handle before spawning
      this.workers.set(options.replicaId, handle);
      const creationProgress = this.startReplicaCreationProgress(stryMutAct_9fa48("165780") ? {} : (stryCov_9fa48("165780"), {
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        replicaId: options.replicaId,
        serviceId: options.partitionId
      }));
      this.updateReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_SPAWNING);
      let dedicatedPool = null;
      try {
        if (stryMutAct_9fa48("165781")) {
          {}
        } else {
          stryCov_9fa48("165781");
          dedicatedPool = this.usesDedicatedReplicaPools() ? this.createDedicatedReplicaPool(options.replicaId) : null;
          const executionPool = stryMutAct_9fa48("165784") ? dedicatedPool && this.pool : stryMutAct_9fa48("165783") ? false : stryMutAct_9fa48("165782") ? true : (stryCov_9fa48("165782", "165783", "165784"), dedicatedPool || this.pool);

          // Spawn worker and create replica with timeout
          const result = await this.withTimeout(executionPool.run(stryMutAct_9fa48("165785") ? {} : (stryCov_9fa48("165785"), {
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
            deferElection: shouldDeferElection
          })), timeoutMs);
          handle.workerId = stryMutAct_9fa48("165788") ? result.workerId && NUM.ZERO : stryMutAct_9fa48("165787") ? false : stryMutAct_9fa48("165786") ? true : (stryCov_9fa48("165786", "165787", "165788"), result.workerId || NUM.ZERO);
          handle.status = WORKER_STATUS.RUNNING;
          handle.healthStatus = WORKER_HEALTH_STATUS.HEALTHY;
          this.updateReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_WORKER_READY);
          if (stryMutAct_9fa48("165790") ? false : stryMutAct_9fa48("165789") ? true : (stryCov_9fa48("165789", "165790"), dedicatedPool)) {
            if (stryMutAct_9fa48("165791")) {
              {}
            } else {
              stryCov_9fa48("165791");
              this.replicaPools.set(options.replicaId, dedicatedPool);
            }
          }
          this.updateReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_REGISTERING);
          // Register handler with MessageRouter to forward messages to this worker
          // Requirements 11.1, 11.2 - Manager-based registration
          this.registerWorkerWithRouter(options.replicaId, unifiedAddress);
          await this.maybeStartReplicaGroupElection(options.replicaIds);
          this.emit(WORKER_EVENT.REPLICA_CREATED, stryMutAct_9fa48("165792") ? {} : (stryCov_9fa48("165792"), {
            replicaId: options.replicaId,
            entityType: WORKER_ENTITY_TYPE.PARTITION,
            unifiedAddress
          }));
          this.finishReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_RUNNING);
          return handle;
        }
      } catch (error) {
        if (stryMutAct_9fa48("165793")) {
          {}
        } else {
          stryCov_9fa48("165793");
          // Check if this is a timeout error - Requirements 7.1, 7.2, 7.3
          if (stryMutAct_9fa48("165795") ? false : stryMutAct_9fa48("165794") ? true : (stryCov_9fa48("165794", "165795"), error.message.includes(stryMutAct_9fa48("165796") ? "" : (stryCov_9fa48("165796"), 'timeout')))) {
            if (stryMutAct_9fa48("165797")) {
              {}
            } else {
              stryCov_9fa48("165797");
              // Clean up any partially created resources
              await this.cleanupPartialReplica(options.replicaId);
              this.failReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_TIMEOUT, error);
              return stryMutAct_9fa48("165798") ? {} : (stryCov_9fa48("165798"), {
                success: stryMutAct_9fa48("165799") ? true : (stryCov_9fa48("165799"), false),
                error: MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs),
                replicaId: options.replicaId
              });
            }
          }

          // Clean up on other failures
          this.workers.delete(options.replicaId);
          if (stryMutAct_9fa48("165801") ? false : stryMutAct_9fa48("165800") ? true : (stryCov_9fa48("165800", "165801"), dedicatedPool)) {
            if (stryMutAct_9fa48("165802")) {
              {}
            } else {
              stryCov_9fa48("165802");
              await dedicatedPool.destroy().catch(() => {});
            }
          }
          this.failReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_FAILED, error);
          this.logger.error(MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED, stryMutAct_9fa48("165803") ? {} : (stryCov_9fa48("165803"), {
            nodeId: this.nodeId,
            replicaId: options.replicaId,
            error: error.message
          }));
          throw new Error(stryMutAct_9fa48("165804") ? `` : (stryCov_9fa48("165804"), `${MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED}: ${error.message}`));
        }
      }
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
    if (stryMutAct_9fa48("165805")) {
      {}
    } else {
      stryCov_9fa48("165805");
      if (stryMutAct_9fa48("165808") ? false : stryMutAct_9fa48("165807") ? true : stryMutAct_9fa48("165806") ? this.initialized : (stryCov_9fa48("165806", "165807", "165808"), !this.initialized)) {
        if (stryMutAct_9fa48("165809")) {
          {}
        } else {
          stryCov_9fa48("165809");
          throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("165812") ? false : stryMutAct_9fa48("165811") ? true : stryMutAct_9fa48("165810") ? options.groupId : (stryCov_9fa48("165810", "165811", "165812"), !options.groupId)) {
        if (stryMutAct_9fa48("165813")) {
          {}
        } else {
          stryCov_9fa48("165813");
          throw new Error(MANAGER_ERROR_MSG.MISSING_GROUP_ID);
        }
      }
      if (stryMutAct_9fa48("165816") ? false : stryMutAct_9fa48("165815") ? true : stryMutAct_9fa48("165814") ? options.replicaId : (stryCov_9fa48("165814", "165815", "165816"), !options.replicaId)) {
        if (stryMutAct_9fa48("165817")) {
          {}
        } else {
          stryCov_9fa48("165817");
          throw new Error(MANAGER_ERROR_MSG.MISSING_REPLICA_ID);
        }
      }
      if (stryMutAct_9fa48("165819") ? false : stryMutAct_9fa48("165818") ? true : (stryCov_9fa48("165818", "165819"), this.workers.has(options.replicaId))) {
        if (stryMutAct_9fa48("165820")) {
          {}
        } else {
          stryCov_9fa48("165820");
          throw new Error(MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
        }
      }
      const now = Date.now();
      const unifiedAddress = stryMutAct_9fa48("165821") ? `` : (stryCov_9fa48("165821"), `${this.nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${options.replicaId}`);
      const timeoutMs = stryMutAct_9fa48("165824") ? options.timeoutMs && MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS : stryMutAct_9fa48("165823") ? false : stryMutAct_9fa48("165822") ? true : (stryCov_9fa48("165822", "165823", "165824"), options.timeoutMs || MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS);
      const shouldDeferElection = stryMutAct_9fa48("165827") ? Array.isArray(options.replicaIds) || options.replicaIds.length > NUM.ONE : stryMutAct_9fa48("165826") ? false : stryMutAct_9fa48("165825") ? true : (stryCov_9fa48("165825", "165826", "165827"), Array.isArray(options.replicaIds) && (stryMutAct_9fa48("165830") ? options.replicaIds.length <= NUM.ONE : stryMutAct_9fa48("165829") ? options.replicaIds.length >= NUM.ONE : stryMutAct_9fa48("165828") ? true : (stryCov_9fa48("165828", "165829", "165830"), options.replicaIds.length > NUM.ONE)));

      // Create worker handle
      const handle = stryMutAct_9fa48("165831") ? {} : (stryCov_9fa48("165831"), {
        replicaId: options.replicaId,
        workerId: NUM.ZERO,
        // Will be set by piscina
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        unifiedAddress,
        status: WORKER_STATUS.STARTING,
        createdAt: now,
        lastHealthCheck: now,
        healthStatus: WORKER_HEALTH_STATUS.UNKNOWN,
        groupId: options.groupId
      });

      // Store handle before spawning
      this.workers.set(options.replicaId, handle);
      const creationProgress = this.startReplicaCreationProgress(stryMutAct_9fa48("165832") ? {} : (stryCov_9fa48("165832"), {
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        replicaId: options.replicaId,
        serviceId: options.groupId
      }));
      this.updateReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_SPAWNING);
      let dedicatedPool = null;
      try {
        if (stryMutAct_9fa48("165833")) {
          {}
        } else {
          stryCov_9fa48("165833");
          dedicatedPool = this.usesDedicatedReplicaPools() ? this.createDedicatedReplicaPool(options.replicaId) : null;
          const executionPool = stryMutAct_9fa48("165836") ? dedicatedPool && this.pool : stryMutAct_9fa48("165835") ? false : stryMutAct_9fa48("165834") ? true : (stryCov_9fa48("165834", "165835", "165836"), dedicatedPool || this.pool);

          // Spawn worker and create replica with timeout
          const result = await this.withTimeout(executionPool.run(stryMutAct_9fa48("165837") ? {} : (stryCov_9fa48("165837"), {
            operation: WORKER_OPERATION.CREATE_MESSAGE_GROUP_REPLICA,
            nodeId: this.nodeId,
            groupId: options.groupId,
            replicaId: options.replicaId,
            replicaIds: options.replicaIds,
            peerAddresses: options.peerAddresses,
            deferElection: shouldDeferElection
          })), timeoutMs);
          handle.workerId = stryMutAct_9fa48("165840") ? result.workerId && NUM.ZERO : stryMutAct_9fa48("165839") ? false : stryMutAct_9fa48("165838") ? true : (stryCov_9fa48("165838", "165839", "165840"), result.workerId || NUM.ZERO);
          handle.status = WORKER_STATUS.RUNNING;
          handle.healthStatus = WORKER_HEALTH_STATUS.HEALTHY;
          this.updateReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_WORKER_READY);
          if (stryMutAct_9fa48("165842") ? false : stryMutAct_9fa48("165841") ? true : (stryCov_9fa48("165841", "165842"), dedicatedPool)) {
            if (stryMutAct_9fa48("165843")) {
              {}
            } else {
              stryCov_9fa48("165843");
              this.replicaPools.set(options.replicaId, dedicatedPool);
            }
          }
          this.updateReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_REGISTERING);
          // Register handler with MessageRouter to forward messages to this worker
          // Requirements 11.1, 11.2 - Manager-based registration
          this.registerWorkerWithRouter(options.replicaId, unifiedAddress);
          await this.maybeStartReplicaGroupElection(options.replicaIds);
          this.emit(WORKER_EVENT.REPLICA_CREATED, stryMutAct_9fa48("165844") ? {} : (stryCov_9fa48("165844"), {
            replicaId: options.replicaId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            unifiedAddress
          }));
          this.finishReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_RUNNING);
          return handle;
        }
      } catch (error) {
        if (stryMutAct_9fa48("165845")) {
          {}
        } else {
          stryCov_9fa48("165845");
          // Check if this is a timeout error - Requirements 7.1, 7.2, 7.3
          if (stryMutAct_9fa48("165847") ? false : stryMutAct_9fa48("165846") ? true : (stryCov_9fa48("165846", "165847"), error.message.includes(stryMutAct_9fa48("165848") ? "" : (stryCov_9fa48("165848"), 'timeout')))) {
            if (stryMutAct_9fa48("165849")) {
              {}
            } else {
              stryCov_9fa48("165849");
              // Clean up any partially created resources
              await this.cleanupPartialReplica(options.replicaId);
              this.failReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_TIMEOUT, error);
              return stryMutAct_9fa48("165850") ? {} : (stryCov_9fa48("165850"), {
                success: stryMutAct_9fa48("165851") ? true : (stryCov_9fa48("165851"), false),
                error: MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs),
                replicaId: options.replicaId
              });
            }
          }

          // Clean up on other failures
          this.workers.delete(options.replicaId);
          if (stryMutAct_9fa48("165853") ? false : stryMutAct_9fa48("165852") ? true : (stryCov_9fa48("165852", "165853"), dedicatedPool)) {
            if (stryMutAct_9fa48("165854")) {
              {}
            } else {
              stryCov_9fa48("165854");
              await dedicatedPool.destroy().catch(() => {});
            }
          }
          this.failReplicaCreationProgress(creationProgress, REPLICA_CREATE_PROGRESS.STATE_FAILED, error);
          this.logger.error(MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED, stryMutAct_9fa48("165855") ? {} : (stryCov_9fa48("165855"), {
            nodeId: this.nodeId,
            replicaId: options.replicaId,
            error: error.message
          }));
          throw new Error(stryMutAct_9fa48("165856") ? `` : (stryCov_9fa48("165856"), `${MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED}: ${error.message}`));
        }
      }
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
    if (stryMutAct_9fa48("165857")) {
      {}
    } else {
      stryCov_9fa48("165857");
      if (stryMutAct_9fa48("165860") ? false : stryMutAct_9fa48("165859") ? true : stryMutAct_9fa48("165858") ? this.initialized : (stryCov_9fa48("165858", "165859", "165860"), !this.initialized)) {
        if (stryMutAct_9fa48("165861")) {
          {}
        } else {
          stryCov_9fa48("165861");
          throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const handle = this.workers.get(replicaId);
      if (stryMutAct_9fa48("165864") ? false : stryMutAct_9fa48("165863") ? true : stryMutAct_9fa48("165862") ? handle : (stryCov_9fa48("165862", "165863", "165864"), !handle)) {
        if (stryMutAct_9fa48("165865")) {
          {}
        } else {
          stryCov_9fa48("165865");
          throw new Error(MANAGER_ERROR_MSG.REPLICA_NOT_FOUND);
        }
      }
      this.logger.info(MANAGER_LOG_MSG.STOPPING_REPLICA, stryMutAct_9fa48("165866") ? {} : (stryCov_9fa48("165866"), {
        nodeId: this.nodeId,
        replicaId,
        entityType: handle.entityType
      }));
      handle.status = WORKER_STATUS.STOPPING;
      const executionPool = this.getReplicaExecutionPool(replicaId);
      try {
        if (stryMutAct_9fa48("165867")) {
          {}
        } else {
          stryCov_9fa48("165867");
          // Send stop command to worker
          await executionPool.run(stryMutAct_9fa48("165868") ? {} : (stryCov_9fa48("165868"), {
            operation: WORKER_OPERATION.STOP_REPLICA,
            replicaId
          }));
          handle.status = WORKER_STATUS.STOPPED;
          this.logger.info(MANAGER_LOG_MSG.REPLICA_STOPPED, stryMutAct_9fa48("165869") ? {} : (stryCov_9fa48("165869"), {
            nodeId: this.nodeId,
            replicaId
          }));
          this.emit(WORKER_EVENT.REPLICA_STOPPED, stryMutAct_9fa48("165870") ? {} : (stryCov_9fa48("165870"), {
            replicaId,
            entityType: handle.entityType
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("165871")) {
          {}
        } else {
          stryCov_9fa48("165871");
          this.logger.error(MANAGER_ERROR_MSG.WORKER_STOP_FAILED, stryMutAct_9fa48("165872") ? {} : (stryCov_9fa48("165872"), {
            nodeId: this.nodeId,
            replicaId,
            error: error.message
          }));

          // Still mark as stopped and remove
          handle.status = WORKER_STATUS.STOPPED;
        }
      } finally {
        if (stryMutAct_9fa48("165873")) {
          {}
        } else {
          stryCov_9fa48("165873");
          // Unregister handler from MessageRouter
          // Requirements 11.4 - Unregister handler on stop
          this.unregisterWorkerFromRouter(handle.unifiedAddress);

          // Remove from workers map
          this.workers.delete(replicaId);
          await this.destroyDedicatedReplicaPool(replicaId).catch(error => {
            if (stryMutAct_9fa48("165874")) {
              {}
            } else {
              stryCov_9fa48("165874");
              this.logger.warn(stryMutAct_9fa48("165875") ? "" : (stryCov_9fa48("165875"), 'Failed to destroy dedicated replica pool'), stryMutAct_9fa48("165876") ? {} : (stryCov_9fa48("165876"), {
                nodeId: this.nodeId,
                replicaId,
                error: error.message
              }));
            }
          });
        }
      }
    }
  }

  /**
   * Deliver a message to a worker replica.
   * @param {string} replicaId - Target replica ID.
   * @param {Object} message - Message to deliver.
   * @return {Promise<Object>} Response from worker.
   */
  async deliverMessage(replicaId, message) {
    if (stryMutAct_9fa48("165877")) {
      {}
    } else {
      stryCov_9fa48("165877");
      if (stryMutAct_9fa48("165880") ? false : stryMutAct_9fa48("165879") ? true : stryMutAct_9fa48("165878") ? this.initialized : (stryCov_9fa48("165878", "165879", "165880"), !this.initialized)) {
        if (stryMutAct_9fa48("165881")) {
          {}
        } else {
          stryCov_9fa48("165881");
          throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const handle = this.workers.get(replicaId);
      if (stryMutAct_9fa48("165884") ? false : stryMutAct_9fa48("165883") ? true : stryMutAct_9fa48("165882") ? handle : (stryCov_9fa48("165882", "165883", "165884"), !handle)) {
        if (stryMutAct_9fa48("165885")) {
          {}
        } else {
          stryCov_9fa48("165885");
          throw new Error(MANAGER_ERROR_MSG.REPLICA_NOT_FOUND);
        }
      }
      if (stryMutAct_9fa48("165888") ? handle.status === WORKER_STATUS.RUNNING : stryMutAct_9fa48("165887") ? false : stryMutAct_9fa48("165886") ? true : (stryCov_9fa48("165886", "165887", "165888"), handle.status !== WORKER_STATUS.RUNNING)) {
        if (stryMutAct_9fa48("165889")) {
          {}
        } else {
          stryCov_9fa48("165889");
          throw new Error(WORKER_ERROR_MSG.WORKER_NOT_RUNNING);
        }
      }
      const executionPool = this.getReplicaExecutionPool(replicaId);
      return executionPool.run(stryMutAct_9fa48("165890") ? {} : (stryCov_9fa48("165890"), {
        operation: WORKER_OPERATION.DELIVER_MESSAGE,
        replicaId,
        message
      }));
    }
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
    if (stryMutAct_9fa48("165891")) {
      {}
    } else {
      stryCov_9fa48("165891");
      if (stryMutAct_9fa48("165894") ? false : stryMutAct_9fa48("165893") ? true : stryMutAct_9fa48("165892") ? this.initialized : (stryCov_9fa48("165892", "165893", "165894"), !this.initialized)) {
        if (stryMutAct_9fa48("165895")) {
          {}
        } else {
          stryCov_9fa48("165895");
          throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const handle = this.workers.get(replicaId);
      if (stryMutAct_9fa48("165898") ? false : stryMutAct_9fa48("165897") ? true : stryMutAct_9fa48("165896") ? handle : (stryCov_9fa48("165896", "165897", "165898"), !handle)) {
        if (stryMutAct_9fa48("165899")) {
          {}
        } else {
          stryCov_9fa48("165899");
          throw new Error(MANAGER_ERROR_MSG.REPLICA_NOT_FOUND);
        }
      }
      if (stryMutAct_9fa48("165902") ? handle.status === WORKER_STATUS.RUNNING : stryMutAct_9fa48("165901") ? false : stryMutAct_9fa48("165900") ? true : (stryCov_9fa48("165900", "165901", "165902"), handle.status !== WORKER_STATUS.RUNNING)) {
        if (stryMutAct_9fa48("165903")) {
          {}
        } else {
          stryCov_9fa48("165903");
          throw new Error(WORKER_ERROR_MSG.WORKER_NOT_RUNNING);
        }
      }
      const executionPool = this.getReplicaExecutionPool(replicaId);
      const response = await executionPool.run(stryMutAct_9fa48("165904") ? {} : (stryCov_9fa48("165904"), {
        operation: WORKER_OPERATION.DELIVER_MESSAGE,
        replicaId,
        message: stryMutAct_9fa48("165905") ? {} : (stryCov_9fa48("165905"), {
          type: LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS
        })
      }));
      return stryMutAct_9fa48("165906") ? {} : (stryCov_9fa48("165906"), {
        isLeader: stryMutAct_9fa48("165909") ? response.isLeader && false : stryMutAct_9fa48("165908") ? false : stryMutAct_9fa48("165907") ? true : (stryCov_9fa48("165907", "165908", "165909"), response.isLeader || (stryMutAct_9fa48("165910") ? true : (stryCov_9fa48("165910"), false))),
        leaderActivated: stryMutAct_9fa48("165913") ? response.leaderActivated !== true : stryMutAct_9fa48("165912") ? false : stryMutAct_9fa48("165911") ? true : (stryCov_9fa48("165911", "165912", "165913"), response.leaderActivated === (stryMutAct_9fa48("165914") ? false : (stryCov_9fa48("165914"), true))),
        term: stryMutAct_9fa48("165917") ? response.term && NUM.ZERO : stryMutAct_9fa48("165916") ? false : stryMutAct_9fa48("165915") ? true : (stryCov_9fa48("165915", "165916", "165917"), response.term || NUM.ZERO),
        leaderId: stryMutAct_9fa48("165920") ? response.leaderId && null : stryMutAct_9fa48("165919") ? false : stryMutAct_9fa48("165918") ? true : (stryCov_9fa48("165918", "165919", "165920"), response.leaderId || null),
        replicaId: stryMutAct_9fa48("165923") ? response.replicaId && replicaId : stryMutAct_9fa48("165922") ? false : stryMutAct_9fa48("165921") ? true : (stryCov_9fa48("165921", "165922", "165923"), response.replicaId || replicaId)
      });
    }
  }

  /**
   * Get health status of all worker processes.
   * @return {Map<string, Object>} Health status by replica ID.
   */
  getHealthStatus() {
    if (stryMutAct_9fa48("165924")) {
      {}
    } else {
      stryCov_9fa48("165924");
      const status = new Map();
      for (const [replicaId, handle] of this.workers) {
        if (stryMutAct_9fa48("165925")) {
          {}
        } else {
          stryCov_9fa48("165925");
          status.set(replicaId, stryMutAct_9fa48("165926") ? {} : (stryCov_9fa48("165926"), {
            replicaId,
            entityType: handle.entityType,
            status: handle.status,
            healthStatus: handle.healthStatus,
            lastHealthCheck: handle.lastHealthCheck,
            createdAt: handle.createdAt,
            unifiedAddress: handle.unifiedAddress
          }));
        }
      }
      return status;
    }
  }

  /**
   * Get a worker handle by replica ID.
   * @param {string} replicaId - Replica ID.
   * @return {WorkerReplicaHandle|undefined} Worker handle or undefined.
   */
  getWorker(replicaId) {
    if (stryMutAct_9fa48("165927")) {
      {}
    } else {
      stryCov_9fa48("165927");
      return this.workers.get(replicaId);
    }
  }

  /**
   * Get all worker handles.
   * @return {Map<string, WorkerReplicaHandle>} All worker handles.
   */
  getAllWorkers() {
    if (stryMutAct_9fa48("165928")) {
      {}
    } else {
      stryCov_9fa48("165928");
      return new Map(this.workers);
    }
  }

  /**
   * Get the number of active workers.
   * @return {number} Number of active workers.
   */
  getWorkerCount() {
    if (stryMutAct_9fa48("165929")) {
      {}
    } else {
      stryCov_9fa48("165929");
      return this.workers.size;
    }
  }

  /**
   * Get workers by entity type.
   * @param {string} entityType - Entity type to filter by.
   * @return {Array<WorkerReplicaHandle>} Matching worker handles.
   */
  getWorkersByType(entityType) {
    if (stryMutAct_9fa48("165930")) {
      {}
    } else {
      stryCov_9fa48("165930");
      const result = stryMutAct_9fa48("165931") ? ["Stryker was here"] : (stryCov_9fa48("165931"), []);
      for (const handle of this.workers.values()) {
        if (stryMutAct_9fa48("165932")) {
          {}
        } else {
          stryCov_9fa48("165932");
          if (stryMutAct_9fa48("165935") ? handle.entityType !== entityType : stryMutAct_9fa48("165934") ? false : stryMutAct_9fa48("165933") ? true : (stryCov_9fa48("165933", "165934", "165935"), handle.entityType === entityType)) {
            if (stryMutAct_9fa48("165936")) {
              {}
            } else {
              stryCov_9fa48("165936");
              result.push(handle);
            }
          }
        }
      }
      return result;
    }
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
    if (stryMutAct_9fa48("165937")) {
      {}
    } else {
      stryCov_9fa48("165937");
      // Create handler that forwards messages to this worker via deliverMessage
      const deliverToWorker = async envelope => {
        if (stryMutAct_9fa48("165938")) {
          {}
        } else {
          stryCov_9fa48("165938");
          return this.deliverMessage(replicaId, stryMutAct_9fa48("165941") ? envelope?.payload && envelope : stryMutAct_9fa48("165940") ? false : stryMutAct_9fa48("165939") ? true : (stryCov_9fa48("165939", "165940", "165941"), (stryMutAct_9fa48("165942") ? envelope.payload : (stryCov_9fa48("165942"), envelope?.payload)) || envelope));
        }
      };
      this.messageRouter.registerWorkerHandler(unifiedAddress, deliverToWorker);
      this.logger.debug(MANAGER_LOG_MSG.HANDLER_REGISTERED, stryMutAct_9fa48("165943") ? {} : (stryCov_9fa48("165943"), {
        nodeId: this.nodeId,
        replicaId,
        unifiedAddress
      }));
    }
  }

  /**
   * Unregister a worker from MessageRouter.
   * Removes the handler that forwards messages to the worker.
   * Requirements 11.4, 11.5 - Unregister handler on stop/crash.
   * @param {string} unifiedAddress - Worker unified address.
   * @private
   */
  unregisterWorkerFromRouter(unifiedAddress) {
    if (stryMutAct_9fa48("165944")) {
      {}
    } else {
      stryCov_9fa48("165944");
      this.messageRouter.unregisterWorkerHandler(unifiedAddress);
      this.logger.debug(MANAGER_LOG_MSG.HANDLER_UNREGISTERED, stryMutAct_9fa48("165945") ? {} : (stryCov_9fa48("165945"), {
        nodeId: this.nodeId,
        unifiedAddress
      }));
    }
  }

  /**
   * Handle worker process crash.
   * Unregisters from MessageRouter and emits failure event.
   * @param {string} replicaId - Crashed replica ID.
   * @param {Error} error - Crash error.
   * @see Requirements 11.5 - Unregister handler on crash
   */
  handleWorkerCrash(replicaId, error) {
    if (stryMutAct_9fa48("165946")) {
      {}
    } else {
      stryCov_9fa48("165946");
      const handle = this.workers.get(replicaId);
      if (stryMutAct_9fa48("165949") ? false : stryMutAct_9fa48("165948") ? true : stryMutAct_9fa48("165947") ? handle : (stryCov_9fa48("165947", "165948", "165949"), !handle)) {
        if (stryMutAct_9fa48("165950")) {
          {}
        } else {
          stryCov_9fa48("165950");
          return;
        }
      }
      this.logger.error(MANAGER_LOG_MSG.WORKER_CRASHED, stryMutAct_9fa48("165951") ? {} : (stryCov_9fa48("165951"), {
        nodeId: this.nodeId,
        replicaId,
        entityType: handle.entityType,
        error: error.message
      }));
      handle.status = WORKER_STATUS.STOPPED;
      handle.healthStatus = WORKER_HEALTH_STATUS.UNHEALTHY;

      // Unregister handler from MessageRouter
      // Requirements 11.5 - Unregister handler on crash
      this.unregisterWorkerFromRouter(handle.unifiedAddress);

      // Remove from workers map
      this.workers.delete(replicaId);
      this.destroyDedicatedReplicaPool(replicaId).catch(destroyError => {
        if (stryMutAct_9fa48("165952")) {
          {}
        } else {
          stryCov_9fa48("165952");
          this.logger.warn(stryMutAct_9fa48("165953") ? "" : (stryCov_9fa48("165953"), 'Failed to destroy dedicated replica pool after crash'), stryMutAct_9fa48("165954") ? {} : (stryCov_9fa48("165954"), {
            nodeId: this.nodeId,
            replicaId,
            error: destroyError.message
          }));
        }
      });

      // Emit failure event
      this.emit(WORKER_EVENT.REPLICA_FAILED, stryMutAct_9fa48("165955") ? {} : (stryCov_9fa48("165955"), {
        replicaId,
        entityType: handle.entityType,
        error: error.message,
        unifiedAddress: handle.unifiedAddress
      }));
    }
  }

  /**
   * Check if the manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("165956")) {
      {}
    } else {
      stryCov_9fa48("165956");
      return this.initialized;
    }
  }

  /**
   * Get manager statistics.
   * @return {Object} Manager statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("165957")) {
      {}
    } else {
      stryCov_9fa48("165957");
      const partitionCount = this.getWorkersByType(WORKER_ENTITY_TYPE.PARTITION).length;
      const messageGroupCount = this.getWorkersByType(WORKER_ENTITY_TYPE.MESSAGE_GROUP).length;
      let healthyCount = NUM.ZERO;
      let unhealthyCount = NUM.ZERO;
      for (const handle of this.workers.values()) {
        if (stryMutAct_9fa48("165958")) {
          {}
        } else {
          stryCov_9fa48("165958");
          if (stryMutAct_9fa48("165961") ? handle.healthStatus !== WORKER_HEALTH_STATUS.HEALTHY : stryMutAct_9fa48("165960") ? false : stryMutAct_9fa48("165959") ? true : (stryCov_9fa48("165959", "165960", "165961"), handle.healthStatus === WORKER_HEALTH_STATUS.HEALTHY)) {
            if (stryMutAct_9fa48("165962")) {
              {}
            } else {
              stryCov_9fa48("165962");
              stryMutAct_9fa48("165963") ? healthyCount-- : (stryCov_9fa48("165963"), healthyCount++);
            }
          } else if (stryMutAct_9fa48("165966") ? handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY : stryMutAct_9fa48("165965") ? false : stryMutAct_9fa48("165964") ? true : (stryCov_9fa48("165964", "165965", "165966"), handle.healthStatus === WORKER_HEALTH_STATUS.UNHEALTHY)) {
            if (stryMutAct_9fa48("165967")) {
              {}
            } else {
              stryCov_9fa48("165967");
              stryMutAct_9fa48("165968") ? unhealthyCount-- : (stryCov_9fa48("165968"), unhealthyCount++);
            }
          }
        }
      }
      return stryMutAct_9fa48("165969") ? {} : (stryCov_9fa48("165969"), {
        nodeId: this.nodeId,
        initialized: this.initialized,
        totalWorkers: this.workers.size,
        partitionWorkers: partitionCount,
        messageGroupWorkers: messageGroupCount,
        healthyWorkers: healthyCount,
        unhealthyWorkers: unhealthyCount,
        maxWorkers: this.maxWorkers
      });
    }
  }

  /**
   * Shutdown the worker manager.
   * Stops all workers and cleans up resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("165970")) {
      {}
    } else {
      stryCov_9fa48("165970");
      if (stryMutAct_9fa48("165973") ? false : stryMutAct_9fa48("165972") ? true : stryMutAct_9fa48("165971") ? this.initialized : (stryCov_9fa48("165971", "165972", "165973"), !this.initialized)) {
        if (stryMutAct_9fa48("165974")) {
          {}
        } else {
          stryCov_9fa48("165974");
          return;
        }
      }
      this.logger.info(MANAGER_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("165975") ? {} : (stryCov_9fa48("165975"), {
        nodeId: this.nodeId,
        workerCount: this.workers.size
      }));
      this.shuttingDown = stryMutAct_9fa48("165976") ? false : (stryCov_9fa48("165976"), true);

      // Stop health check timer
      this.stopHealthCheckTimer();

      // Stop all workers
      const stopPromises = stryMutAct_9fa48("165977") ? ["Stryker was here"] : (stryCov_9fa48("165977"), []);
      for (const replicaId of this.workers.keys()) {
        if (stryMutAct_9fa48("165978")) {
          {}
        } else {
          stryCov_9fa48("165978");
          stopPromises.push(this.stopReplica(replicaId).catch(error => {
            if (stryMutAct_9fa48("165979")) {
              {}
            } else {
              stryCov_9fa48("165979");
              this.logger.warn(stryMutAct_9fa48("165980") ? "" : (stryCov_9fa48("165980"), 'Failed to stop replica during shutdown'), stryMutAct_9fa48("165981") ? {} : (stryCov_9fa48("165981"), {
                replicaId,
                error: error.message
              }));
            }
          }));
        }
      }
      await Promise.allSettled(stopPromises);

      // Destroy any remaining dedicated replica pools.
      const poolDestroyPromises = stryMutAct_9fa48("165982") ? ["Stryker was here"] : (stryCov_9fa48("165982"), []);
      for (const replicaId of this.replicaPools.keys()) {
        if (stryMutAct_9fa48("165983")) {
          {}
        } else {
          stryCov_9fa48("165983");
          poolDestroyPromises.push(this.destroyDedicatedReplicaPool(replicaId).catch(error => {
            if (stryMutAct_9fa48("165984")) {
              {}
            } else {
              stryCov_9fa48("165984");
              this.logger.warn(stryMutAct_9fa48("165985") ? "" : (stryCov_9fa48("165985"), 'Failed to destroy dedicated pool during shutdown'), stryMutAct_9fa48("165986") ? {} : (stryCov_9fa48("165986"), {
                replicaId,
                error: error.message
              }));
            }
          }));
        }
      }
      await Promise.allSettled(poolDestroyPromises);

      // Destroy piscina pool
      if (stryMutAct_9fa48("165988") ? false : stryMutAct_9fa48("165987") ? true : (stryCov_9fa48("165987", "165988"), this.pool)) {
        if (stryMutAct_9fa48("165989")) {
          {}
        } else {
          stryCov_9fa48("165989");
          await this.pool.destroy();
          this.pool = null;
        }
      }
      this.initialized = stryMutAct_9fa48("165990") ? true : (stryCov_9fa48("165990"), false);
      this.shuttingDown = stryMutAct_9fa48("165991") ? true : (stryCov_9fa48("165991"), false);
      this.logger.info(MANAGER_LOG_MSG.SHUTDOWN_COMPLETE, stryMutAct_9fa48("165992") ? {} : (stryCov_9fa48("165992"), {
        nodeId: this.nodeId
      }));
      this.emit(WORKER_EVENT.STOPPED, stryMutAct_9fa48("165993") ? {} : (stryCov_9fa48("165993"), {
        nodeId: this.nodeId
      }));
    }
  }
}
export { ReplicaWorkerManager, MANAGER_ERROR_MSG, MANAGER_LOG_MSG, MANAGER_DEFAULT };