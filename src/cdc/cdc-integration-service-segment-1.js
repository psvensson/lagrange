import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  canWriteSystemTableLocally,
  isLocalPartitionServiceLeader,
  isLocalPartitionServiceUsable,
  resolveLocalPartitionServicesForPartition,
  resolveLocalSystemTableServices,
  resolvePartitionServices,
  resolveSystemTablePartitionIds,
  executeLocalSystemTableRead as executeLocalSystemTableReadFromHelpers,
} from './cdc-integration-service-local-system-table-routing.js';
import {
  buildOwnerRpcSqlFallbackQueryOptions,
  buildSystemTableOperationDiagnostics,
  executeAuthoritativeOwnerRpcRead as executeAuthoritativeOwnerRpcReadFromHelpers,
  executeAuthoritativeSqlFallbackRead as executeAuthoritativeSqlFallbackReadFromHelpers,
  executeAuthoritativeSystemTableRead as executeAuthoritativeSystemTableReadFromHelpers,
  getLocalQueryTransportReadiness,
  isAuthoritativeRepairRowNewer as isAuthoritativeRepairRowNewerFromHelpers,
  maybeReseedBootstrapOverlay,
  mergeAuthoritativeSystemTableRowSets,
  normalizeAuthoritativeReadLocalQueryTransport,
  normalizeLocalSystemTableWriteResult,
  queryLocalAuthoritativeSystemTableRows,
  extractAuthoritativeRowVersion,
  shouldRetryOwnerRpcReadViaSqlFallback,
} from './cdc-integration-service-authoritative-read-flow.js';

const {
  AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS,
  AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS,
  AUTHORITATIVE_FALLBACK_WINDOW_MS,
  CDCEventHandler,
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_ERROR_MSG,
  CDC_LOG_MSG,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
  ConfigurationManager,
  EventEmitter,
  HLCClockService,
  LoggingService,
  NUM,
  STRING,
  TYPEOF,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
  resolveNodeWebSocketAddress,
} = CDC_INTEGRATION_SERVICE_SHARED;

class CDCIntegrationServiceSegment1 extends EventEmitter {
  constructor(options = {}) {
    super();

    // Primary: SQL query engine for transparent routing
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.systemTableCache = options.systemTableCache || null;
    this.cacheMutationTarget =
      options.cacheMutationTarget ||
      (typeof options.systemTableCache?.applySystemTableChange ===
      TYPEOF.FUNCTION ?
        options.systemTableCache :
        null);

    // Bootstrap mode for seed node direct writes
    this.bootstrapMode = false;
    this.bootstrapCompleted = false;
    this.localPartitionServices = null;
    this.partitionServicesProvider =
      options.partitionServicesProvider instanceof Map ?
        () => options.partitionServicesProvider :
        typeof options.partitionServicesProvider === TYPEOF.FUNCTION ?
          options.partitionServicesProvider :
          null;
    this.writeRouter = this.createSqlWriteRouter();

    // HLC clock for timestamps
    this.hlcClock = new HLCClockService(this.nodeId);

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_SUBSYSTEM.INTEGRATION) :
      console;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.retryMaxAttempts =
      config.get(CDC_CONFIG_KEY.RETRY_MAX_ATTEMPTS) ||
      CDC_DEFAULTS.RETRY_MAX_ATTEMPTS;
    this.retryDelayMs =
      config.get(CDC_CONFIG_KEY.RETRY_DELAY_MS) || CDC_DEFAULTS.RETRY_DELAY_MS;
    this.cacheWaitTimeoutMs =
      config.get(CDC_CONFIG_KEY.CACHE_WAIT_TIMEOUT_MS) ||
      CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS;

    // Epoch manager reference for CDC epoch change handling
    this.epochManager = null;

    // Rebalancer reference for node state change handling
    this.rebalancer = null;

    // Message router reference for mesh connectivity on node join
    this.messageRouter = options.messageRouter || null;
    this.cdcEventHandler = null;

    // Statistics
    this.stats = {
      ...CDC_STATS_DEFAULT,
    };
    this.authoritativeFallbackHistory = [];
    this.authoritativeFallbackTotals = new Map();
    this.authoritativeFallbackWindowMs = AUTHORITATIVE_FALLBACK_WINDOW_MS;
    this.authoritativeFallbackRepairBudgetMs =
      Number.isFinite(options.authoritativeFallbackRepairBudgetMs) &&
      options.authoritativeFallbackRepairBudgetMs > NUM.ZERO ?
        Math.floor(options.authoritativeFallbackRepairBudgetMs) :
        AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS;
    this.authoritativeFallbackRetryDelayMs =
      Number.isFinite(options.authoritativeFallbackRetryDelayMs) &&
      options.authoritativeFallbackRetryDelayMs >= NUM.ZERO ?
        Math.floor(options.authoritativeFallbackRetryDelayMs) :
        AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS;
    this.inFlightMutationsByKey = new Map();
    this.initialized = false;
  }

  /**
   * Set the system table cache used for post-write consistency waits.
   * @param {Object} cache - System table cache (read-only wrapper ok).
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    if (
      !this.cacheMutationTarget &&
      typeof cache?.applySystemTableChange === TYPEOF.FUNCTION
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
      typeof provider === TYPEOF.FUNCTION ? provider : null;
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

  /**
   * Resolve the currently available local partition-service registry.
   * @return {Map<string, Object>|null}
   * @private
   */
  resolvePartitionServices() {
    return resolvePartitionServices(this);
  }

  /**
   * Resolve cached system-table partition IDs for one table.
   * Falls back to the canonical initial partition ID when cache metadata is
   * not yet available locally.
   * @param {string} tableName
   * @return {Array<string>}
   * @private
   */
  resolveSystemTablePartitionIds(tableName) {
    return resolveSystemTablePartitionIds(this, tableName);
  }

  /**
   * Resolve every local partition service that hosts one partition.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  resolveLocalPartitionServicesForPartition(partitionServices, partitionId) {
    return resolveLocalPartitionServicesForPartition(
      partitionServices,
      partitionId,
    );
  }

  /**
   * Check whether one local partition service can be used directly.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceUsable(partitionService) {
    return isLocalPartitionServiceUsable(partitionService);
  }

  /**
   * Check whether one local partition service currently appears to be leader.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceLeader(partitionService) {
    return isLocalPartitionServiceLeader(partitionService);
  }

  /**
   * Resolve local partition services for a system table.
   * @param {string} tableName
   * @param {Object} [options]
   * @param {string} [options.consistency]
   * @return {Array<Object>}
   * @private
   */
  resolveLocalSystemTableServices(tableName, options = {}) {
    return resolveLocalSystemTableServices(this, tableName, options);
  }

  /**
   * Determine whether this node can satisfy one system-table write locally.
   * This is stronger than cache-based leader metadata during leadership churn:
   * if a local replica already owns leader state, direct local execution can
   * still succeed even before the services table reflects that leader row.
   * @param {string} tableName
   * @return {boolean}
   */
  canWriteSystemTableLocally(tableName) {
    return canWriteSystemTableLocally(this, tableName);
  }

  /**
   * Execute one read query against one local partition service.
   * @param {Object} partitionService
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalSystemTableRead(partitionService, sql, params = []) {
    return executeLocalSystemTableReadFromHelpers(this, partitionService, sql, params);
  }

  /**
   * Normalize one authoritative row version into a comparable value.
   * @param {Object|null} row
   * @return {number|string|null}
   * @private
   */
  extractAuthoritativeRowVersion(row) {
    return extractAuthoritativeRowVersion(this, row);
  }

  /**
   * Prefer the fresher authoritative repair row.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeRepairRowNewer(candidate, existing) {
    return isAuthoritativeRepairRowNewerFromHelpers(
      this,
      candidate,
      existing,
    );
  }

  /**
   * Merge replicated authoritative row sets by primary key.
   * @param {string} tableName
   * @param {Array<Array<Object>>} rowSets
   * @return {Array<Object>}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    return mergeAuthoritativeSystemTableRowSets(this, tableName, rowSets);
  }

  /**
   * Read authoritative rows from node-local system partition replicas when
   * available.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @param {string} [options.consistency]
   * @return {Promise<{available: boolean, rows: Array<Object>}>}
   * @private
   */
  async queryLocalAuthoritativeSystemTableRows(
    tableName,
    sql,
    params = [],
    options = {},
  ) {
    return queryLocalAuthoritativeSystemTableRows(
      this,
      tableName,
      sql,
      params,
      options,
    );
  }

  /**
   * Build bounded routing diagnostics for one system-table operation.
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildSystemTableOperationDiagnostics(tableName, options = {}) {
    return buildSystemTableOperationDiagnostics(this, tableName, options);
  }

  normalizeAuthoritativeReadLocalQueryTransport(
    localQueryTransportReadiness = null,
  ) {
    return normalizeAuthoritativeReadLocalQueryTransport(
      localQueryTransportReadiness,
    );
  }

  shouldRetryOwnerRpcReadViaSqlFallback(
    ownerRpcResult,
    options = {},
    localQueryTransportReadiness = null,
  ) {
    return shouldRetryOwnerRpcReadViaSqlFallback(
      ownerRpcResult,
      options,
      localQueryTransportReadiness,
    );
  }

  buildOwnerRpcSqlFallbackQueryOptions(queryOptions = {}, baseDiagnostics = {}) {
    return buildOwnerRpcSqlFallbackQueryOptions(queryOptions, baseDiagnostics);
  }

  async executeAuthoritativeSqlFallbackRead(
    tableName,
    statement,
    params,
    options,
    baseDiagnostics,
    localQueryTransportReadiness = null,
  ) {
    return executeAuthoritativeSqlFallbackReadFromHelpers(
      this,
      tableName,
      statement,
      params,
      options,
      baseDiagnostics,
      localQueryTransportReadiness,
    );
  }

  /**
   * Execute an authoritative system-table read. Prefers local partition
   * replicas and falls back to the routed SQL engine when necessary.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async executeAuthoritativeSystemTableRead(
    tableName,
    sql,
    params = [],
    options = {},
  ) {
    return executeAuthoritativeSystemTableReadFromHelpers(
      this,
      tableName,
      sql,
      params,
      options,
    );
  }

  /**
   * Execute the recovery read over the owner-partition RPC lane instead of
   * the generic SQL query engine route.
   * @param {string} tableName
   * @param {string} statement
   * @param {Array<*>} params
   * @param {Object} options
   * @param {Object} baseDiagnostics
   * @param {Object|null} localQueryTransportReadiness
   * @return {Promise<Object|null>}
   * @private
   */
  async executeAuthoritativeOwnerRpcRead(
    tableName,
    statement,
    params,
    options,
    baseDiagnostics,
    localQueryTransportReadiness = null,
  ) {
    return executeAuthoritativeOwnerRpcReadFromHelpers(
      this,
      tableName,
      statement,
      params,
      options,
      baseDiagnostics,
      localQueryTransportReadiness,
    );
  }

  /**
   * Resolve the canonical local query/data-plane transport readiness snapshot.
   * This reuses the message-router transport owner instead of duplicating
   * query-ingress selection logic in the authoritative read path.
   * @return {{ready:boolean,reason:string|null,retryAfterMs:number}|null}
   * @private
   */
  getLocalQueryTransportReadiness() {
    return getLocalQueryTransportReadiness(this);
  }

  /**
   * Re-seed the SQL query engine bootstrap routing overlay when a
   * query fails with TABLE_NOT_FOUND or PARTITION_NOT_FOUND. This
   * breaks the circular dependency after seed restart where empty
   * cache + deleted overlay prevents authoritative discovery repair.
   * Reuses the existing seedBootstrapRoutingOverlayFromSnapshots
   * mechanism on the SQL query engine.
   * @param {string} tableName
   * @param {Object|null} queryResult
   * @return {{reseeded: boolean}}
   * @private
   */
  maybeReseedBootstrapOverlay(tableName, queryResult) {
    return maybeReseedBootstrapOverlay(this, tableName, queryResult);
  }

  /**
   * Normalize one direct local system-table write result into the SQL-engine
   * result shape expected by CDC callers.
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeLocalSystemTableWriteResult(result) {
    return normalizeLocalSystemTableWriteResult(result);
  }

  /**
   * Try to execute a steady-state system-table write through a local partition
   * service before falling back to the routed SQL path.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<{handled: boolean, result?: Object}>}
   * @private
   */
}

export {CDCIntegrationServiceSegment1};
