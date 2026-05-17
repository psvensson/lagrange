import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {resolveControlPlaneSystemTableDeliverySource} from '../control-plane/control-plane-system-table-gateway-shared.js';

const {
  ADDRESS,
  AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS,
  AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS,
  AUTHORITATIVE_FALLBACK_WINDOW_MS,
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDCEventHandler,
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_ERROR_MSG,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  ENTITY_TYPE,
  EventEmitter,
  HLCClockService,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  NUM,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  VALID_SYSTEM_TABLES,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
  normalizeLocalQueryTransportReadiness,
  resolveNodeWebSocketAddress,
} = CDC_INTEGRATION_SERVICE_SHARED;

const AUTHORITATIVE_SQL_FALLBACK_SOURCE = 'sql_query_engine';
const AUTHORITATIVE_SQL_FALLBACK_SESSION_SUFFIX = ':owner-rpc-recovery';
const AUTHORITATIVE_SQL_FALLBACK_RETRYABLE_ERROR_CODES = Object.freeze([
  QUERY_ERROR_CODE.ROUTER_CONNECTION_CLOSED,
  QUERY_ERROR_CODE.ROUTER_MESSAGE_TIMEOUT,
]);
const AUTHORITATIVE_SQL_FALLBACK_QUERY_TIMEOUT_ERROR_MESSAGES = Object.freeze([
  QUERY_ERROR_MSG.QUERY_TIMEOUT,
]);

function isAuthoritativeSqlFallbackQueryTimeoutMessage(errorMessage) {
  if (typeof errorMessage !== TYPEOF.STRING) {
    return false;
  }
  const normalizedMessage = errorMessage.trim();
  if (
    AUTHORITATIVE_SQL_FALLBACK_QUERY_TIMEOUT_ERROR_MESSAGES.includes(
      normalizedMessage,
    )
  ) {
    return true;
  }
  if (
    !normalizedMessage.startsWith(QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX) ||
    !normalizedMessage.endsWith(QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX)
  ) {
    return false;
  }
  const timeoutValue = Number(
    normalizedMessage.slice(
      QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX.length,
      normalizedMessage.length -
        QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX.length,
    ),
  );
  return Number.isInteger(timeoutValue) && timeoutValue > NUM.ZERO;
}

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
    if (this.bootstrapMode && this.localPartitionServices instanceof Map) {
      return this.localPartitionServices;
    }
    if (typeof this.partitionServicesProvider === TYPEOF.FUNCTION) {
      const provided = this.partitionServicesProvider();
      return provided instanceof Map ? provided : null;
    }
    return null;
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
    const cache = this.systemTableCache;
    if (!cache) {
      return INITIAL_PARTITION_IDS[tableName] ?
        [INITIAL_PARTITION_IDS[tableName]] :
        [];
    }
    const partitionPredicate = (row) => {
      const rowTableName = row?.table_name ?? row?.tableName ?? null;
      const rowTableId = row?.table_id ?? row?.tableId ?? null;
      return rowTableName === tableName || rowTableId === tableName;
    };
    const partitionRows =
      typeof cache.filter === TYPEOF.FUNCTION ?
        cache.filter(SYSTEM_TABLE_NAME.PARTITIONS, partitionPredicate) :
        typeof cache.getAll === TYPEOF.FUNCTION ?
          (cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || []).filter(
            partitionPredicate,
          ) :
          [];
    const resolvedPartitionIds = [
      ...new Set(
        partitionRows
          .map(
            (row) => row?.partition_id ?? row?.partitionId ?? row?.id ?? null,
          )
          .filter(Boolean),
      ),
    ];
    if (resolvedPartitionIds.length > NUM.ZERO) {
      return resolvedPartitionIds;
    }
    return INITIAL_PARTITION_IDS[tableName] ?
      [INITIAL_PARTITION_IDS[tableName]] :
      [];
  }

  /**
   * Resolve every local partition service that hosts one partition.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  resolveLocalPartitionServicesForPartition(partitionServices, partitionId) {
    if (!(partitionServices instanceof Map) || !partitionId) {
      return [];
    }
    const matches = [];
    const seenServices = new Set();
    const directMatch = partitionServices.get(partitionId) || null;
    if (directMatch && !seenServices.has(directMatch)) {
      matches.push(directMatch);
      seenServices.add(directMatch);
    }
    for (const partitionService of partitionServices.values()) {
      if (
        !partitionService ||
        partitionService.partitionId !== partitionId ||
        seenServices.has(partitionService)
      ) {
        continue;
      }
      matches.push(partitionService);
      seenServices.add(partitionService);
    }
    return matches;
  }

  /**
   * Check whether one local partition service can be used directly.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceUsable(partitionService) {
    if (!partitionService) {
      return false;
    }
    if (partitionService.initialized === false) {
      return false;
    }
    return (
      typeof partitionService.executeQuery === TYPEOF.FUNCTION ||
      typeof partitionService.executeLocalQuery === TYPEOF.FUNCTION ||
      typeof partitionService?.db?.prepare === TYPEOF.FUNCTION
    );
  }

  /**
   * Check whether one local partition service currently appears to be leader.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceLeader(partitionService) {
    if (!this.isLocalPartitionServiceUsable(partitionService)) {
      return false;
    }
    if (partitionService.isLeader === true) {
      return true;
    }
    if (
      typeof partitionService.isLeaderReplica === TYPEOF.FUNCTION &&
      partitionService.isLeaderReplica() === true
    ) {
      return true;
    }
    const role = String(
      (typeof partitionService.getRole === TYPEOF.FUNCTION ?
        partitionService.getRole() :
        null) ||
        partitionService.role ||
        partitionService.raftRole ||
        '',
    ).toLowerCase();
    if (role === CDC_INTEGRATION_SERVICE_LITERAL.LEADER) {
      return true;
    }
    const leaderId =
      typeof partitionService.getLeaderId === TYPEOF.FUNCTION ?
        partitionService.getLeaderId() :
        partitionService.leaderId;
    const replicaId = partitionService.replicaId || partitionService.replica_id;
    return (
      typeof leaderId === TYPEOF.STRING &&
      typeof replicaId === TYPEOF.STRING &&
      leaderId.length > NUM.ZERO &&
      leaderId === replicaId
    );
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
    const partitionServices = this.resolvePartitionServices();
    if (!(partitionServices instanceof Map)) {
      return [];
    }
    const consistency =
      options.consistency || LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA;
    const matches = [];
    const seenServices = new Set();
    const partitionIds = this.resolveSystemTablePartitionIds(tableName);
    for (const partitionId of partitionIds) {
      const candidates = this.resolveLocalPartitionServicesForPartition(
        partitionServices,
        partitionId,
      );
      for (const partitionService of candidates) {
        if (
          !this.isLocalPartitionServiceUsable(partitionService) ||
          seenServices.has(partitionService)
        ) {
          continue;
        }
        if (
          consistency === LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER &&
          !this.isLocalPartitionServiceLeader(partitionService)
        ) {
          continue;
        }
        matches.push(partitionService);
        seenServices.add(partitionService);
      }
    }
    matches.sort((left, right) => {
      return (
        Number(this.isLocalPartitionServiceLeader(right)) -
        Number(this.isLocalPartitionServiceLeader(left))
      );
    });
    return matches;
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
    if (!tableName || !VALID_SYSTEM_TABLES.includes(tableName)) {
      return false;
    }
    const localLeaders = this.resolveLocalSystemTableServices(tableName, {
      consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
    });
    return localLeaders.length > NUM.ZERO;
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
    if (typeof partitionService?.executeLocalQuery === TYPEOF.FUNCTION) {
      return partitionService.executeLocalQuery(sql, params);
    }
    if (typeof partitionService?.db?.prepare === TYPEOF.FUNCTION) {
      const stmt = partitionService.db.prepare(sql);
      return {
        success: true,
        rows: stmt.all(...params),
      };
    }
    if (typeof partitionService?.executeQuery === TYPEOF.FUNCTION) {
      return partitionService.executeQuery(sql, params);
    }
    return {
      success: false,
      error: CDC_INTEGRATION_SERVICE_LITERAL.LOCAL_PARTITION_QUERY_UNAVAILABLE,
      rows: [],
    };
  }

  /**
   * Normalize one authoritative row version into a comparable value.
   * @param {Object|null} row
   * @return {number|string|null}
   * @private
   */
  extractAuthoritativeRowVersion(row) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return null;
    }
    for (const fieldName of AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES) {
      const value = row[fieldName];
      if (value === undefined || value === null) {
        continue;
      }
      const comparable = this.normalizeComparableCacheFieldValue(value);
      if (comparable !== null) {
        return comparable;
      }
      if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
        return value;
      }
    }
    return null;
  }

  /**
   * Prefer the fresher authoritative repair row.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeRepairRowNewer(candidate, existing) {
    const candidateVersion = this.extractAuthoritativeRowVersion(candidate);
    const existingVersion = this.extractAuthoritativeRowVersion(existing);
    if (candidateVersion !== null && existingVersion !== null) {
      if (candidateVersion === existingVersion) {
        return (
          JSON.stringify(candidate).length > JSON.stringify(existing).length
        );
      }
      return candidateVersion > existingVersion;
    }
    if (candidateVersion !== null) {
      return true;
    }
    if (existingVersion !== null) {
      return false;
    }
    return JSON.stringify(candidate).length > JSON.stringify(existing).length;
  }

  /**
   * Merge replicated authoritative row sets by primary key.
   * @param {string} tableName
   * @param {Array<Array<Object>>} rowSets
   * @return {Array<Object>}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    const keyField = this.getPrimaryKeyField(tableName);
    const mergedRows = new Map();
    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const key = row?.[keyField] ?? row?.id ?? null;
        if (key === null || key === undefined) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isAuthoritativeRepairRowNewer(row, existing)) {
          mergedRows.set(key, row);
        }
      }
    }
    return [...mergedRows.values()];
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
    const localServices = this.resolveLocalSystemTableServices(tableName, {
      consistency: options.consistency,
    });
    if (localServices.length === NUM.ZERO) {
      return {
        available: false,
        rows: [],
      };
    }
    const rowSets = [];
    let available = false;
    for (const partitionService of localServices) {
      try {
        const result = await this.executeLocalSystemTableRead(
          partitionService,
          sql,
          params,
        );
        if (!result || result.success === false) {
          continue;
        }
        rowSets.push(Array.isArray(result.rows) ? result.rows : []);
        available = true;
      } catch (error) {
        this.logger.warn(
          CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL +
            CDC_INTEGRATION_SERVICE_LITERAL.PARTITION_REPLICA,
          {
            nodeId: this.nodeId,
            tableName,
            partitionId: partitionService?.partitionId || null,
            replicaId: partitionService?.replicaId || null,
            error: error?.message || String(error),
          },
        );
      }
    }
    return {
      available,
      rows: available ?
        this.mergeAuthoritativeSystemTableRowSets(tableName, rowSets) :
        [],
    };
  }

  /**
   * Build bounded routing diagnostics for one system-table operation.
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildSystemTableOperationDiagnostics(tableName, options = {}) {
    const queryOptions =
      options?.queryOptions && typeof options.queryOptions === TYPEOF.OBJECT ?
        options.queryOptions :
        {};
    const routingReadinessDimension =
      queryOptions.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    const partitionIds = this.resolveSystemTablePartitionIds(tableName);
    const partitionId = partitionIds[NUM.ZERO] || null;
    let routingSnapshot = null;
    if (
      partitionId &&
      this.sqlQueryEngine?.queryExecutor &&
      typeof this.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot ===
        TYPEOF.FUNCTION
    ) {
      try {
        routingSnapshot =
          this.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(
            partitionId,
            routingReadinessDimension,
          );
      } catch (_error) {
        routingSnapshot = null;
      }
    }
    let partitionRow = null;
    let serviceRows = [];
    if (
      this.systemTableCache &&
      typeof this.systemTableCache.filter === TYPEOF.FUNCTION
    ) {
      const partitionRows =
        this.systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, (row) => {
          const rowPartitionId =
            row?.partition_id || row?.partitionId || row?.id || null;
          if (partitionId && rowPartitionId === partitionId) {
            return true;
          }
          return row?.table_name === tableName || row?.tableName === tableName;
        }) || [];
      partitionRow = partitionRows[NUM.ZERO] || null;
      if (partitionId) {
        serviceRows =
          this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
            return (
              row?.partition_id === partitionId &&
              row?.service_type === SERVICE_TYPE.PARTITION
            );
          }) || [];
      }
    }
    const leaderNodeId =
      routingSnapshot?.canonicalLeaderNodeId ||
      partitionRow?.leader_node_id ||
      partitionRow?.leaderNodeId ||
      null;
    const serviceRowCount = Number.isFinite(routingSnapshot?.serviceRowCount) ?
      routingSnapshot.serviceRowCount :
      serviceRows.length;
    const routableServiceCount = Number.isFinite(
      routingSnapshot?.routableServiceCount,
    ) ?
      routingSnapshot.routableServiceCount :
      serviceRows.filter((row) => {
        return (
          row?.status === SERVICE_STATUS.ACTIVE &&
            typeof row?.address === TYPEOF.STRING &&
            row.address.length > NUM.ZERO
        );
      }).length;
    return Object.freeze({
      partitionId,
      leaderNodeId:
        typeof leaderNodeId === TYPEOF.STRING && leaderNodeId.length > NUM.ZERO ?
          leaderNodeId :
          null,
      serviceRowCount,
      routableServiceCount,
      queryTimeoutMs:
        Number.isFinite(queryOptions.timeoutMs) &&
        queryOptions.timeoutMs > NUM.ZERO ?
          Math.floor(queryOptions.timeoutMs) :
          null,
      routingReadinessDimension,
      deniedByReadiness:
        routingSnapshot &&
        typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT ?
          Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO :
          false,
    });
  }

  normalizeAuthoritativeReadLocalQueryTransport(
    localQueryTransportReadiness = null,
  ) {
    return localQueryTransportReadiness &&
      typeof localQueryTransportReadiness === TYPEOF.OBJECT ?
      {
        state: localQueryTransportReadiness.state || null,
        ready: localQueryTransportReadiness.ready === true,
        reason: localQueryTransportReadiness.reason || null,
        retryAfterMs: localQueryTransportReadiness.retryAfterMs || NUM.ZERO,
      } :
      null;
  }

  shouldRetryOwnerRpcReadViaSqlFallback(
    ownerRpcResult,
    options = {},
    localQueryTransportReadiness = null,
  ) {
    if (ownerRpcResult?.success === true || options?.allowSqlFallback !== true) {
      return false;
    }
    if (options?.requireOwnerRpcRead === true) {
      return false;
    }
    if (localQueryTransportReadiness?.ready === false) {
      return false;
    }
    const errorCode = String(
      ownerRpcResult?.errorCode || ownerRpcResult?.code || '',
    ).toUpperCase();
    const errorMessage =
      typeof ownerRpcResult?.error === TYPEOF.STRING ?
        ownerRpcResult.error :
        ownerRpcResult?.error?.message || ownerRpcResult?.message;
    return (
      AUTHORITATIVE_SQL_FALLBACK_RETRYABLE_ERROR_CODES.includes(errorCode) ||
      isAuthoritativeSqlFallbackQueryTimeoutMessage(errorMessage) ||
      ownerRpcResult?.deferRetry === true ||
      (
        Number.isFinite(ownerRpcResult?.retryAfterMs) &&
        ownerRpcResult.retryAfterMs > NUM.ZERO
      )
    );
  }

  buildOwnerRpcSqlFallbackQueryOptions(queryOptions = {}, baseDiagnostics = {}) {
    const resolvedQueryOptions =
      queryOptions && typeof queryOptions === TYPEOF.OBJECT ? queryOptions : {};
    const sessionId =
      typeof resolvedQueryOptions.sessionId === TYPEOF.STRING &&
        resolvedQueryOptions.sessionId.length > NUM.ZERO ?
        `${resolvedQueryOptions.sessionId}${
          AUTHORITATIVE_SQL_FALLBACK_SESSION_SUFFIX
        }` :
        null;
    return {
      ...resolvedQueryOptions,
      routingReadinessDimension:
        resolvedQueryOptions.routingReadinessDimension ||
        baseDiagnostics.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ...(sessionId ? {sessionId} : {}),
    };
  }

  async executeAuthoritativeSqlFallbackRead(
    tableName,
    statement,
    params,
    options,
    baseDiagnostics,
    localQueryTransportReadiness = null,
  ) {
    if (typeof this.sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION) {
      return null;
    }
    const queryResult = await this.sqlQueryEngine.executeQuery(
      statement,
      params,
      this.buildOwnerRpcSqlFallbackQueryOptions(
        options?.queryOptions,
        baseDiagnostics,
      ),
    );
    return {
      ...(queryResult || {
        success: false,
        error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
        rows: [],
      }),
      rows: Array.isArray(queryResult?.rows) ? queryResult.rows : [],
      rowCount: Array.isArray(queryResult?.rows) ?
        queryResult.rows.length :
        NUM.ZERO,
      source: AUTHORITATIVE_SQL_FALLBACK_SOURCE,
      usedSqlFallback: true,
      localReadHit: false,
      localReplicaFallbackHit: false,
      queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
      localQueryTransport:
        this.normalizeAuthoritativeReadLocalQueryTransport(
          localQueryTransportReadiness,
        ),
      systemTableDiagnostics: {
        ...baseDiagnostics,
        localReadHit: false,
        localReplicaFallbackHit: false,
        routedToNode: baseDiagnostics.leaderNodeId || null,
        deniedByReadiness: baseDiagnostics.deniedByReadiness === true,
      },
    };
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
    const statement = sql || `SELECT * FROM ${tableName}`;
    const requireOwnerRpcRead = options.requireOwnerRpcRead === true;
    const preferredConsistency =
      options.localReadConsistency ||
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA;
    const preferOwnerRpcRead =
      options.preferOwnerRpcRead === true || requireOwnerRpcRead;
    const allowOwnerRpcFallback = options.allowOwnerRpcFallback !== false;
    const baseDiagnostics = this.buildSystemTableOperationDiagnostics(
      tableName,
      options,
    );
    let localRead = {
      available: false,
      rows: [],
    };
    let localReplicaFallbackHit = false;
    const readLocalAuthoritativeRows = async () => {
      localRead = await this.queryLocalAuthoritativeSystemTableRows(
        tableName,
        statement,
        params,
        {
          consistency: preferredConsistency,
        },
      );
      if (
        !localRead.available &&
        options.replicaFallbackConsistency &&
        options.replicaFallbackConsistency !== preferredConsistency
      ) {
        localRead = await this.queryLocalAuthoritativeSystemTableRows(
          tableName,
          statement,
          params,
          {
            consistency: options.replicaFallbackConsistency,
          },
        );
        localReplicaFallbackHit = localRead.available;
      }
    };
    const buildLocalReadResult = () => {
      return {
        success: true,
        rows: localRead.rows,
        count: localRead.rows.length,
        rowCount: localRead.rows.length,
        source: AUTHORITATIVE_READ_SOURCE.LOCAL_PARTITION_REPLICA,
        localReadHit: true,
        localReplicaFallbackHit,
        queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
        systemTableDiagnostics: {
          ...baseDiagnostics,
          localReadHit: true,
          localReplicaFallbackHit,
          routedToNode: null,
          deniedByReadiness: false,
        },
      };
    };
    await readLocalAuthoritativeRows();
    const shouldConfirmEmptyLocalReadWithOwnerRpc =
      options.confirmEmptyLocalReadWithOwnerRpc === true &&
      allowOwnerRpcFallback &&
      localRead.available &&
      localRead.rows.length === NUM.ZERO &&
      !preferOwnerRpcRead &&
      !requireOwnerRpcRead;
    if (
      localRead.available &&
      !preferOwnerRpcRead &&
      !requireOwnerRpcRead &&
      !shouldConfirmEmptyLocalReadWithOwnerRpc
    ) {
      return buildLocalReadResult();
    }
    const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
    if (
      localQueryTransportReadiness?.ready === false &&
      !allowOwnerRpcFallback
    ) {
      return {
        success: false,
        error:
          localQueryTransportReadiness.reason ||
          CDC_INTEGRATION_SERVICE_LITERAL.QUERY_DATA_PLANE_TRANSPORT_NOT_READY,
        errorCode: QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
        deferRetry: true,
        retryAfterMs: localQueryTransportReadiness.retryAfterMs,
        localQueryTransport: {
          state:
            localQueryTransportReadiness.state ||
            CDC_INTEGRATION_SERVICE_LITERAL.DEFERRED,
          ready: false,
          reason: localQueryTransportReadiness.reason || null,
          retryAfterMs: localQueryTransportReadiness.retryAfterMs,
        },
        rows: [],
        source: AUTHORITATIVE_READ_SOURCE.QUERY_TRANSPORT_PREFLIGHT,
        localReadHit: false,
        localReplicaFallbackHit: false,
        queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
        systemTableDiagnostics: {
          ...baseDiagnostics,
          localReadHit: false,
          localReplicaFallbackHit: false,
          routedToNode: null,
          deniedByReadiness: true,
        },
      };
    }
    if (
      localQueryTransportReadiness?.ready === false &&
      preferOwnerRpcRead &&
      localRead.available &&
      !requireOwnerRpcRead
    ) {
      return buildLocalReadResult();
    }
    if (!allowOwnerRpcFallback) {
      if (preferOwnerRpcRead && localRead.available && !requireOwnerRpcRead) {
        return buildLocalReadResult();
      }
      return {
        success: false,
        error:
          CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        rows: [],
        localReadHit: false,
        localReplicaFallbackHit: false,
        queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
        systemTableDiagnostics: {
          ...baseDiagnostics,
          localReadHit: false,
          localReplicaFallbackHit: false,
          routedToNode: null,
        },
      };
    }
    const ownerRpcResult = await this.executeAuthoritativeOwnerRpcRead(
      tableName,
      statement,
      params,
      options,
      baseDiagnostics,
      localQueryTransportReadiness,
    );
    if (ownerRpcResult !== null) {
      if (
        ownerRpcResult.success !== true &&
        preferOwnerRpcRead &&
        localRead.available &&
        !requireOwnerRpcRead
      ) {
        return buildLocalReadResult();
      }
      if (
        this.shouldRetryOwnerRpcReadViaSqlFallback(
          ownerRpcResult,
          options,
          localQueryTransportReadiness,
        )
      ) {
        const sqlFallbackResult =
          await this.executeAuthoritativeSqlFallbackRead(
            tableName,
            statement,
            params,
            options,
            baseDiagnostics,
            localQueryTransportReadiness,
          );
        if (sqlFallbackResult !== null) {
          return sqlFallbackResult;
        }
      }
      return ownerRpcResult;
    }
    if (preferOwnerRpcRead && localRead.available && !requireOwnerRpcRead) {
      return buildLocalReadResult();
    }
    return {
      success: false,
      error:
        CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
      rows: [],
      localReadHit: false,
      localReplicaFallbackHit: false,
      queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
      systemTableDiagnostics: {
        ...baseDiagnostics,
        localReadHit: false,
        localReplicaFallbackHit: false,
        routedToNode: null,
      },
    };
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
    const queryExecutor = this.sqlQueryEngine?.queryExecutor || null;
    if (
      !queryExecutor ||
      typeof queryExecutor.executeOnPartition !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    if (!partitionId) {
      return null;
    }
    const routingReadinessDimension =
      options?.queryOptions?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    const deliverySource = resolveControlPlaneSystemTableDeliverySource({
      deliverySource: options?.queryOptions?.deliverySource || null,
      tableName,
      sql: statement,
    });
    const executionOptions = {
      ...(options.queryOptions && typeof options.queryOptions === TYPEOF.OBJECT ?
        options.queryOptions :
        {}),
      routingReadinessDimension,
      workClass:
        options?.queryOptions?.workClass || options?.workClass || undefined,
      deliveryPriority:
        options?.queryOptions?.deliveryPriority ||
        options?.deliveryPriority ||
        undefined,
      deliverySource,
      allowReadinessAuthoritativeRefresh:
        options?.queryOptions?.allowReadinessAuthoritativeRefresh !== false,
    };
    const queryResult = await queryExecutor.executeOnPartition(
      partitionId,
      statement,
      params,
      true,
      true,
      false,
      executionOptions,
    );
    if (!queryResult?.success) {
      const reseedResult = this.maybeReseedBootstrapOverlay(
        tableName,
        queryResult,
      );
      if (reseedResult.reseeded) {
        const retryResult = await queryExecutor.executeOnPartition(
          partitionId,
          statement,
          params,
          true,
          true,
          false,
          executionOptions,
        );
        this.logger.info(CDC_LOG_MSG.OVERLAY_RESEED_RETRY_RESULT, {
          nodeId: this.nodeId,
          tableName,
          retrySuccess: retryResult?.success ?? false,
        });
        if (retryResult?.success) {
          return {
            ...retryResult,
            rows: Array.isArray(retryResult.rows) ? retryResult.rows : [],
            rowCount: Array.isArray(retryResult.rows) ?
              retryResult.rows.length :
              NUM.ZERO,
            source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
            localReadHit: false,
            localReplicaFallbackHit: false,
            queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
            localQueryTransport:
              this.normalizeAuthoritativeReadLocalQueryTransport(
                localQueryTransportReadiness,
              ),
            systemTableDiagnostics: {
              ...baseDiagnostics,
              localReadHit: false,
              localReplicaFallbackHit: false,
              routedToNode:
                retryResult?.participantNodeId ||
                baseDiagnostics.leaderNodeId ||
                null,
              deniedByReadiness: baseDiagnostics.deniedByReadiness === true,
            },
          };
        }
        return {
          ...(retryResult ||
            queryResult || {
            success: false,
            error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
            rows: [],
          }),
          rows: Array.isArray(retryResult?.rows) ? retryResult.rows : [],
          source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
          localReadHit: false,
          localReplicaFallbackHit: false,
          queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
          localQueryTransport:
            this.normalizeAuthoritativeReadLocalQueryTransport(
              localQueryTransportReadiness,
            ),
          systemTableDiagnostics: {
            ...baseDiagnostics,
            localReadHit: false,
            localReplicaFallbackHit: false,
            routedToNode:
              retryResult?.participantNodeId ||
              baseDiagnostics.leaderNodeId ||
              null,
            deniedByReadiness:
              baseDiagnostics.deniedByReadiness === true ||
              retryResult?.errorCode === QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
          },
        };
      }
    }
    if (!queryResult?.success) {
      return {
        ...(queryResult || {
          success: false,
          error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
          rows: [],
        }),
        rows: Array.isArray(queryResult?.rows) ? queryResult.rows : [],
        source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
        localReadHit: false,
        localReplicaFallbackHit: false,
        queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
        localQueryTransport:
          this.normalizeAuthoritativeReadLocalQueryTransport(
            localQueryTransportReadiness,
          ),
        systemTableDiagnostics: {
          ...baseDiagnostics,
          localReadHit: false,
          localReplicaFallbackHit: false,
          routedToNode:
            queryResult?.participantNodeId ||
            baseDiagnostics.leaderNodeId ||
            null,
          deniedByReadiness:
            baseDiagnostics.deniedByReadiness === true ||
            queryResult?.errorCode === QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
        },
      };
    }
    return {
      ...queryResult,
      rows: Array.isArray(queryResult.rows) ? queryResult.rows : [],
      rowCount: Array.isArray(queryResult.rows) ?
        queryResult.rows.length :
        NUM.ZERO,
      source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
      localReadHit: false,
      localReplicaFallbackHit: false,
      queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
      localQueryTransport:
        this.normalizeAuthoritativeReadLocalQueryTransport(
          localQueryTransportReadiness,
        ),
      systemTableDiagnostics: {
        ...baseDiagnostics,
        localReadHit: false,
        localReplicaFallbackHit: false,
        routedToNode:
          queryResult?.participantNodeId ||
          baseDiagnostics.leaderNodeId ||
          null,
        deniedByReadiness: baseDiagnostics.deniedByReadiness === true,
      },
    };
  }

  /**
   * Resolve the canonical local query/data-plane transport readiness snapshot.
   * This reuses the message-router transport owner instead of duplicating
   * query-ingress selection logic in the authoritative read path.
   * @return {{ready:boolean,reason:string|null,retryAfterMs:number}|null}
   * @private
   */
  getLocalQueryTransportReadiness() {
    if (
      !this.messageRouter ||
      typeof this.messageRouter.getQueryDataPlaneTransportReadiness !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    return normalizeLocalQueryTransportReadiness(
      this.messageRouter.getQueryDataPlaneTransportReadiness(),
    );
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
    const errorCode = queryResult?.errorCode || null;
    if (
      errorCode !== QUERY_ERROR_CODE.TABLE_NOT_FOUND &&
      errorCode !== QUERY_ERROR_CODE.PARTITION_NOT_FOUND
    ) {
      return {
        reseeded: false,
      };
    }
    if (
      !this.sqlQueryEngine ||
      typeof this.sqlQueryEngine.installRecoveryRoutingOverlayEntry !==
        TYPEOF.FUNCTION
    ) {
      return {
        reseeded: false,
      };
    }
    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    if (!partitionId) {
      return {
        reseeded: false,
      };
    }
    const connectedNodes = this.messageRouter ?
      this.messageRouter.getConnectedNodes() :
      [];
    if (connectedNodes.length === NUM.ZERO) {
      return {
        reseeded: false,
      };
    }
    this.logger.info(CDC_LOG_MSG.OVERLAY_RESEED_ON_TABLE_NOT_FOUND, {
      nodeId: this.nodeId,
      tableName,
      partitionId,
      connectedNodeCount: connectedNodes.length,
      originalError: queryResult?.error || null,
    });
    const serviceRows = connectedNodes.map((nodeId) => ({
      partition_id: partitionId,
      service_type: SERVICE_TYPE.PARTITION,
      status: SERVICE_STATUS.ACTIVE,
      node_id: nodeId,
      address:
        `${nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}` +
        `${partitionId}`,
    }));
    const installed = this.sqlQueryEngine.installRecoveryRoutingOverlayEntry(
      partitionId,
      tableName,
      serviceRows,
    );
    return {
      reseeded: installed,
    };
  }

  /**
   * Normalize one direct local system-table write result into the SQL-engine
   * result shape expected by CDC callers.
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeLocalSystemTableWriteResult(result) {
    if (!result || typeof result !== TYPEOF.OBJECT) {
      return result;
    }
    if (
      typeof result.affectedRows === TYPEOF.NUMBER ||
      typeof result.changes !== TYPEOF.NUMBER
    ) {
      return result;
    }
    return {
      ...result,
      affectedRows: result.changes,
    };
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
