import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  CDC_ERROR_CODE,
  CDC_SHUT_DOWN_WRITE_OUTCOME,
} from './cdc-constants.js';
import {ERRORS} from '../constants/errors.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../partition/partition-write-kernel.js';

const {
  CDCEventHandler,
  CDC_LOG_MSG,
  CDC_ERROR_MSG,
  CDC_INTEGRATION_SERVICE_LITERAL,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
  resolveNodeWebSocketAddress,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_INTEGRATION_SERVICE_LIFECYCLE_CONSTRUCTOR = 'constructor';

/**
 * Lifecycle, dependency-injection, and write-router-strategy methods for the
 * CDC integration service. These attach to the public service prototype and
 * own construction-adjacent wiring (references, bootstrap mode, routers, and
 * the CDC event-handler context).
 */
class CDCIntegrationServiceLifecycleMethods {
  /**
   * Set the system table cache used for post-write consistency waits.
   * @param {Object} cache - System table cache (read-only wrapper ok).
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    if (
      !this.cacheMutationTarget &&
      typeof cache?.applySystemTableChange === 'function'
    ) {
      this.cacheMutationTarget = cache;
    }
  }

  /**
   * Set the writable cache target used by authoritative repair paths.
   * @param {Object} cache - Writable SystemTableCache instance.
   */
  setCacheMutationTarget(cache) {
    this.cacheMutationTarget = cache;
  }

  /**
   * Set the local partition-service provider for authoritative system-table
   * reads and direct local write bypasses in steady state.
   * @param {Function|Map|null} provider
   */
  setPartitionServicesProvider(provider) {
    if (provider instanceof Map) {
      this.partitionServicesProvider = () => provider;
      return;
    }
    this.partitionServicesProvider =
      typeof provider === 'function' ? provider : null;
  }

  /**
   * Build context object for CDCEventHandler with live references.
   * @return {Object} Event handler context.
   * @private
   */
  createEventHandlerContext() {
    return {
      get epochManager() {
        return this._service.epochManager;
      },
      get rebalancer() {
        return this._service.rebalancer;
      },
      get messageRouter() {
        return this._service.messageRouter;
      },
      emit: (eventName, data) => {
        this.emit(eventName, data);
      },
      incrementEpochChanges: () => {
        this.stats.epochChanges++;
      },
      incrementNodeStateChanges: () => {
        this.stats.nodeStateChanges++;
      },
      resolveNodeWebSocketAddress: (targetNodeId) => {
        return resolveNodeWebSocketAddress({
          targetNodeId,
          systemTableCache: this.systemTableCache,
        });
      },
      _service: this,
    };
  }

  /**
   * Ensure CDCEventHandler is instantiated for runtime CDC processing.
   * @return {CDCEventHandler} Active CDC event handler.
   * @private
   */
  ensureEventHandler() {
    if (!this.cdcEventHandler) {
      this.cdcEventHandler = new CDCEventHandler({
        nodeId: this.nodeId,
        eventContext: this.createEventHandlerContext(),
        // The handler belongs to this service, on this node.
        timeSource: this.timeSource,
      });
    }
    return this.cdcEventHandler;
  }

  /**
   * Initialize the CDC integration service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for transparent routing.
   */
  initialize(options = {}) {
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    this.initialized = true;
    this.ensureEventHandler();
    this.logger.info(CDC_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      hasSqlQueryEngine: !!this.sqlQueryEngine,
    });
  }

  /**
   * Set the SQL query engine for transparent query routing.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    this.logger.debug(CDC_LOG_MSG.SQL_ENGINE_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Mark the service as shutting down: its terminal lifecycle state. From
   * here every write it routes answers the typed terminal SHUT_DOWN (see
   * resolveShutDownAnswer), a new write is refused before it is routed, and
   * every wait or retry delay it holds for a write is released now instead
   * of at its budget. Idempotent.
   */
  markShuttingDown() {
    this.isShuttingDown = true;
    const releases = [...this.shutdownReleases];
    this.shutdownReleases.clear();
    for (const release of releases) {
      release();
    }
  }

  /**
   * Hold a suspended write-side wait until shutdown: `release` runs once when
   * the service is marked shutting down, at once when it already is.
   * @param {Function} release
   * @return {Function} Stops holding the wait (the wait settled first).
   */
  holdUntilShutdown(release) {
    if (this.isShuttingDown === true) {
      release();
      return () => {};
    }
    this.shutdownReleases.add(release);
    return () => this.shutdownReleases.delete(release);
  }

  /**
   * A write's retry delay on this service's clock, held until shutdown:
   * shutdown ends it at once, so no timer outlives the terminal state.
   * @param {number} delayMs
   * @return {Promise<void>} Settles at the delay or at shutdown.
   */
  delayUntilShutdown(delayMs) {
    return new Promise((resolve) => {
      let timer = null;
      const stopHolding = this.holdUntilShutdown(() => {
        this.timeSource.clearTimeout(timer);
        resolve();
      });
      if (this.isShuttingDown === true) {
        return;
      }
      timer = this.timeSource.setTimeout(() => {
        stopHolding();
        resolve();
      }, delayMs);
    });
  }

  /**
   * The answer a write gets from this service. Before shutdown it is the
   * failure itself. Once the service is shutting down it is the typed
   * terminal SHUT_DOWN, whatever the failure was: no engine will arrive and
   * no retry through the service can succeed. The failure stays its cause,
   * so a released write whose outcome is unknown stays unknown.
   * @param {*} failure - The failed result or error.
   * @return {*} The failure, or the terminal answer carrying it.
   */
  resolveShutDownAnswer(failure) {
    if (
      this.isShuttingDown !== true ||
      failure?.code === CDC_ERROR_CODE.SHUT_DOWN
    ) {
      return failure;
    }
    return this.buildShutDownAnswer(
      CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_CONFIRMED, failure);
  }

  /**
   * The terminal answer of an accepted write whose visibility shutdown cut
   * short: accepted into consensus, its outcome not known to this service.
   * @return {Error}
   */
  buildUnconfirmedWriteShutDownAnswer() {
    const cause = new Error(ERRORS.WRITE_OUTCOME_UNKNOWN);
    cause.failureCode = PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
    return this.buildShutDownAnswer(
      CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_CONFIRMED, cause);
  }

  /**
   * @param {string} writeOutcome - A CDC_SHUT_DOWN_WRITE_OUTCOME.
   * @param {*} [cause] - What the write last answered, when anything.
   * @return {Error} The typed terminal SHUT_DOWN answer.
   */
  buildShutDownAnswer(writeOutcome, cause = null) {
    const error = new Error(
      writeOutcome === CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_ROUTED ?
        CDC_ERROR_MSG.CDC_SHUT_DOWN_NOT_ROUTED :
        CDC_ERROR_MSG.CDC_SHUT_DOWN,
    );
    error.code = CDC_ERROR_CODE.SHUT_DOWN;
    error.writeOutcome = writeOutcome;
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  /**
   * Route one write through the current write-router strategy.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeSQL(sql, params = [], options = {}) {
    if (
      !this.writeRouter ||
      typeof this.writeRouter.execute !== 'function'
    ) {
      throw new Error(
        CDC_INTEGRATION_SERVICE_LITERAL.CDC_WRITE_ROUTER_IS_NOT_CONFIGURED,
      );
    }
    // One exit for every routed write. A write that arrives after shutdown
    // is refused before it reaches an engine (definitely not applied); a
    // write in flight at shutdown answers the terminal answer carrying its
    // last failure, thrown or returned alike.
    if (this.isShuttingDown === true) {
      throw this.buildShutDownAnswer(CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_ROUTED);
    }
    let result = null;
    try {
      result = await this.writeRouter.execute(sql, params, options);
    } catch (error) {
      throw this.resolveShutDownAnswer(error);
    }
    if (result?.success === false && this.isShuttingDown === true) {
      throw this.resolveShutDownAnswer(result);
    }
    return result;
  }

  /**
   * Create SQL-routed write strategy.
   * @return {Object}
   * @private
   */
  createSqlWriteRouter() {
    return createSqlWriteRouter({
      execute: (sql, params, options = {}) =>
        this.executeSQLViaQueryEngine(sql, params, options),
    });
  }

  /**
   * Create bootstrap direct-write strategy.
   * @return {Object}
   * @private
   */
  createBootstrapDirectWriteRouter() {
    return createBootstrapDirectWriteRouter({
      execute: (sql, params, options = {}) =>
        this.executeSQLDirectToLocalPartition(sql, params, options),
    });
  }

  /**
   * Set active write router strategy.
   * @param {Object} writeRouter
   */
  setWriteRouter(writeRouter) {
    this.writeRouter = writeRouter;
  }

  /**
   * Enable or disable bootstrap mode for seed node direct writes.
   *
   * Bootstrap Mode (Seed Node Only):
   * - Enabled during seed node registration phase
   * - Allows direct writes to local partitions
   * - Bypasses SQL routing (which requires system cache)
   * - Solves chicken-and-egg problem: can't write without cache, can't populate
   *   cache without writing
   *
   * After Bootstrap:
   * - Mode is disabled
   * - All writes route through SQL engine
   * - SQL engine uses system cache to find partition leaders
   * - Single code path - no fallbacks
   *
   * Requirements: 8.1, 8.2
   * @param {boolean} enabled - Whether to enable bootstrap mode.
   * @param {Map} partitionServices - Map of local partition services (required if
   *   enabled).
   */
  setBootstrapMode(enabled, partitionServices) {
    if (enabled) {
      if (this.bootstrapCompleted) {
        throw new Error(CDC_ERROR_MSG.BOOTSTRAP_REENTRY_FORBIDDEN);
      }
      if (!partitionServices || !(partitionServices instanceof Map)) {
        throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRES_PARTITION_MAP);
      }
      this.bootstrapMode = true;
      this.localPartitionServices = partitionServices;
      this.setWriteRouter(this.createBootstrapDirectWriteRouter());
      this.logger.info(CDC_LOG_MSG.BOOTSTRAP_MODE_ENABLED, {
        nodeId: this.nodeId,
        partitionCount: partitionServices.size,
      });
    } else {
      if (this.bootstrapMode) {
        this.bootstrapCompleted = true;
      }
      this.bootstrapMode = false;
      this.localPartitionServices = null;
      this.setWriteRouter(this.createSqlWriteRouter());
      this.logger.info(CDC_LOG_MSG.BOOTSTRAP_MODE_DISABLED, {
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Clear bootstrap mode (convenience method for disabling).
   */
  clearBootstrapMode() {
    this.setBootstrapMode(false, null);
  }
}

/**
 * Mix the lifecycle/dependency-wiring methods onto the target class prototype.
 * @param {Function} targetClass
 */
function applyCDCIntegrationServiceLifecycleMethods(targetClass) {
  const sourcePrototype = CDCIntegrationServiceLifecycleMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CDC_INTEGRATION_SERVICE_LIFECYCLE_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyCDCIntegrationServiceLifecycleMethods};
