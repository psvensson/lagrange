/**
 * CDC Integration Service - Routes all system table writes through SQL.
 * Ensures cache consistency by making CDC the single source of truth.
 *
 * Bootstrap-Direct Write Phase:
 * - Seed node uses a bootstrap-direct phase during initial setup
 * - The bootstrap-direct phase enables direct writes to local partitions
 * - Required because system cache is empty during seed node bootstrap
 * - After bootstrap, the service switches to sql-routed steady state
 *
 * Sql-Routed Steady State:
 * - All writes route through SQL query engine
 * - SQL engine uses system cache to find partition leaders
 * - Writes go to partition leader via message router
 * - Partition generates CDC event that updates all caches
 * - Single code path - no fallbacks or legacy mechanisms
 *
 * Requirements: 3.5, 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {
  CDC_OPERATION, COLUMN, ENTITY_TYPE, ERRORS, METRICS_LOG_TAG,
  NUM, SERVICE_STATUS, SERVICE_TYPE, SQL, STATE,
  STRING, TIME_MS, TYPEOF, ADDRESS, PROTOCOL,
} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {
  QUERY_ERROR_CODE,
} from '../query/query-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {isTableInternalCachePropagationEnabled} from '../cache/cdc-table-policy.js';
import {CDCEventHandler} from './cdc-event-handler.js';
import {
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_EPOCH_CONFIG_KEY,
  CDC_EVENT,
  CDC_ERROR_MSG,
  CDC_LOG_MSG,
  CDC_OPERATION_LABEL,
  CDC_PRIMARY_KEY,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SQL,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
} from './cdc-constants.js';
import {
  WRITE_ROUTER_MODE,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
} from './write-router/index.js';
import {resolveNodeWebSocketAddress} from
  '../transport/node-address-resolution.js';

/**
 * Valid system table names for CDC operations.
 */
const VALID_SYSTEM_TABLES = Object.values(SYSTEM_TABLE_NAME);

/**
 * CDC operation types.
 */
const CDCOperationType = CDC_OPERATION;

/**
 * Config key for the current epoch in the config table.
 */
const EPOCH_CONFIG_KEY = CDC_EPOCH_CONFIG_KEY;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Determine whether CDC write-route metrics should be emitted for a table.
 * Metrics for logs table writes are skipped to avoid feedback loops where
 * persisted metrics generate more persisted metrics. Heartbeat-driven writes
 * for nodes and node_endpoints are also excluded to avoid periodic idle noise.
 * @param {string|null} tableName
 * @return {boolean}
 */
const TABLE_WRITE_METRIC_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
]);
const TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
]);
const AUTHORITATIVE_FALLBACK_PHASE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  RECOVERY: 'recovery',
  STEADY_STATE: 'steady_state',
});
const AUTHORITATIVE_FALLBACK_OUTCOME = Object.freeze({
  RECOVERED: 'recovered',
  FAILED: 'failed',
});
const AUTHORITATIVE_FALLBACK_WINDOW_MS = TIME_MS.MINUTE;
const AUTHORITATIVE_FALLBACK_RECENT_LIMIT = NUM.TEN;
const LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY = Object.freeze({
  ANY_REPLICA: 'any_replica',
  LOCAL_LEADER: 'local_leader',
});

function normalizeDeliveryPriority(value, fallback = null) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    fallback;
}

function buildSystemTableMutationError(result, fallbackMessage) {
  const error = new Error(result?.error || fallbackMessage);
  if (typeof result?.errorCode === TYPEOF.STRING &&
      result.errorCode.length > NUM.ZERO) {
    error.code = result.errorCode;
  }
  if (typeof result?.pressureAction === TYPEOF.STRING &&
      result.pressureAction.length > NUM.ZERO) {
    error.pressureAction = result.pressureAction;
  }
  if (typeof result?.pressureReason === TYPEOF.STRING &&
      result.pressureReason.length > NUM.ZERO) {
    error.pressureReason = result.pressureReason;
  }
  if (Number.isFinite(result?.retryAfterMs)) {
    error.retryAfterMs = Math.max(NUM.ZERO, Math.floor(result.retryAfterMs));
    if (error.retryAfterMs > NUM.ZERO) {
      error.deferRetry = true;
    }
  }
  if (result?.pressureSummary &&
      typeof result.pressureSummary === TYPEOF.OBJECT) {
    error.pressureSummary = result.pressureSummary;
  }
  return error;
}

function sortMutationKeyObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortMutationKeyObject(entry));
  }
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortMutationKeyObject(value[key]);
      return accumulator;
    }, {});
}

function stableSerializeMutationKey(value) {
  return JSON.stringify(sortMutationKeyObject(value));
}
const AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES = Object.freeze([
  'last_heartbeat',
  'lastHeartbeat',
  'ready_lease_expires_at',
  'readyLeaseExpiresAt',
  'updated_at_hlc',
  'updatedAtHlc',
  'schema_version',
  'schemaVersion',
  'updated_at',
  'updatedAt',
  'completed_at',
  'completedAt',
  'created_at',
  'createdAt',
]);

function normalizeAuthoritativeFallbackPhase(value) {
  if (value === AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP) {
    return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
  }
  if (value === AUTHORITATIVE_FALLBACK_PHASE.RECOVERY) {
    return AUTHORITATIVE_FALLBACK_PHASE.RECOVERY;
  }
  return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
}

function normalizeAuthoritativeFallbackOutcome(value) {
  return value === AUTHORITATIVE_FALLBACK_OUTCOME.FAILED ?
    AUTHORITATIVE_FALLBACK_OUTCOME.FAILED :
    AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED;
}

function shouldEmitTableWriteMetric(tableName) {
  return !TABLE_WRITE_METRIC_SUPPRESSED_TABLES.has(tableName);
}

function shouldLogTableWriteFailure(tableName) {
  return !TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES.has(tableName);
}

function logSystemTableWriteFailure(service, logMessage, details, error) {
  const payload = {
    ...details,
    code: getControlPlaneErrorCode(error) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(error),
  };
  if (isRetryableControlPlaneError(error)) {
    service.logger.warn(logMessage, payload);
    return;
  }
  service.logger.error(logMessage, payload);
}

/**
 * CDCIntegrationService routes all system table writes through SQL queries.
 * This ensures cache updates only happen via CDC events, maintaining consistency.
 * Queries are routed transparently to wherever the partition leader is.
 *
 * Key architectural constraint:
 * - Components MUST NOT write directly to System_Table_Cache
 * - All writes go through SQL → partition (wherever it is) → CDC → cache
 */
class CDCIntegrationService extends EventEmitter {
  /**
   * Create a new CDCIntegrationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for transparent routing.
   * @param {string} options.nodeId - Node ID for logging context.
   */
  constructor(options = {}) {
    super();

    // Primary: SQL query engine for transparent routing
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.systemTableCache = options.systemTableCache || null;
    this.cacheMutationTarget =
      options.cacheMutationTarget ||
      (typeof options.systemTableCache?.applySystemTableChange === TYPEOF.FUNCTION ?
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
      loggingService.forSubsystem(CDC_SUBSYSTEM.INTEGRATION) : console;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.retryMaxAttempts = config.get(CDC_CONFIG_KEY.RETRY_MAX_ATTEMPTS) ||
      CDC_DEFAULTS.RETRY_MAX_ATTEMPTS;
    this.retryDelayMs = config.get(CDC_CONFIG_KEY.RETRY_DELAY_MS) ||
      CDC_DEFAULTS.RETRY_DELAY_MS;
    this.cacheWaitTimeoutMs = config.get(CDC_CONFIG_KEY.CACHE_WAIT_TIMEOUT_MS) ||
      CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS;

    // Epoch manager reference for CDC epoch change handling
    this.epochManager = null;

    // Rebalancer reference for node state change handling
    this.rebalancer = null;

    // Message router reference for mesh connectivity on node join
    this.messageRouter = options.messageRouter || null;

    this.cdcEventHandler = null;

    // Statistics
    this.stats = {...CDC_STATS_DEFAULT};
    this.authoritativeFallbackHistory = [];
    this.authoritativeFallbackTotals = new Map();
    this.authoritativeFallbackWindowMs = AUTHORITATIVE_FALLBACK_WINDOW_MS;
    this.inFlightMutationsByKey = new Map();

    this.initialized = false;
  }

  /**
   * Set the system table cache used for post-write consistency waits.
   * @param {Object} cache - System table cache (read-only wrapper ok).
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    if (!this.cacheMutationTarget &&
      typeof cache?.applySystemTableChange === TYPEOF.FUNCTION) {
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
      typeof provider === TYPEOF.FUNCTION ?
        provider :
        null;
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
        throw new Error(
          CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRES_PARTITION_MAP,
        );
      }
      this.bootstrapMode = true;
      this.localPartitionServices = partitionServices;
      this.setWriteRouter(this.createBootstrapDirectWriteRouter());
      this.logger.info(
        CDC_LOG_MSG.BOOTSTRAP_MODE_ENABLED,
        {nodeId: this.nodeId, partitionCount: partitionServices.size},
      );
    } else {
      if (this.bootstrapMode) {
        this.bootstrapCompleted = true;
      }
      this.bootstrapMode = false;
      this.localPartitionServices = null;
      this.setWriteRouter(this.createSqlWriteRouter());
      this.logger.info(
        CDC_LOG_MSG.BOOTSTRAP_MODE_DISABLED,
        {nodeId: this.nodeId},
      );
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
          (cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || [])
            .filter(partitionPredicate) :
          [];
    const resolvedPartitionIds = [...new Set(partitionRows
      .map((row) => row?.partition_id ?? row?.partitionId ?? row?.id ?? null)
      .filter(Boolean))];
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
      if (!partitionService ||
          partitionService.partitionId !== partitionId ||
          seenServices.has(partitionService)) {
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
    return typeof partitionService.executeQuery === TYPEOF.FUNCTION ||
      typeof partitionService.executeLocalQuery === TYPEOF.FUNCTION ||
      typeof partitionService?.db?.prepare === TYPEOF.FUNCTION;
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
    const role = String(
      partitionService.role ||
      partitionService.raftRole ||
      '',
    ).toLowerCase();
    return role === 'leader';
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

    const consistency = options.consistency ||
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA;
    const matches = [];
    const seenServices = new Set();
    const partitionIds = this.resolveSystemTablePartitionIds(tableName);
    for (const partitionId of partitionIds) {
      const candidates = this.resolveLocalPartitionServicesForPartition(
        partitionServices,
        partitionId,
      );
      for (const partitionService of candidates) {
        if (!this.isLocalPartitionServiceUsable(partitionService) ||
            seenServices.has(partitionService)) {
          continue;
        }
        if (consistency === LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER &&
            !this.isLocalPartitionServiceLeader(partitionService)) {
          continue;
        }
        matches.push(partitionService);
        seenServices.add(partitionService);
      }
    }

    matches.sort((left, right) => {
      return Number(this.isLocalPartitionServiceLeader(right)) -
        Number(this.isLocalPartitionServiceLeader(left));
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
    if (typeof partitionService?.executeQuery === TYPEOF.FUNCTION) {
      return partitionService.executeQuery(sql, params);
    }
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
    return {
      success: false,
      error: 'local_partition_query_unavailable',
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
        return JSON.stringify(candidate).length >
          JSON.stringify(existing).length;
      }
      return candidateVersion > existingVersion;
    }
    if (candidateVersion !== null) {
      return true;
    }
    if (existingVersion !== null) {
      return false;
    }
    return JSON.stringify(candidate).length >
      JSON.stringify(existing).length;
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
        this.logger.warn('Failed to read authoritative system table rows from local partition replica', {
          nodeId: this.nodeId,
          tableName,
          partitionId: partitionService?.partitionId || null,
          replicaId: partitionService?.replicaId || null,
          error: error?.message || String(error),
        });
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
    const preferredConsistency =
      options.localReadConsistency ||
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA;
    let localRead = await this.queryLocalAuthoritativeSystemTableRows(
      tableName,
      statement,
      params,
      {
        consistency: preferredConsistency,
      },
    );
    if (!localRead.available &&
        options.replicaFallbackConsistency &&
        options.replicaFallbackConsistency !== preferredConsistency) {
      localRead = await this.queryLocalAuthoritativeSystemTableRows(
        tableName,
        statement,
        params,
        {
          consistency: options.replicaFallbackConsistency,
        },
      );
    }
    if (localRead.available) {
      return {
        success: true,
        rows: localRead.rows,
        count: localRead.rows.length,
        source: 'local_partition_replica',
      };
    }

    if (options.allowSqlFallback === false) {
      return {
        success: false,
        error: 'authoritative_row_source_unavailable',
        rows: [],
      };
    }

    if (!this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION) {
      return {
        success: false,
        error: 'authoritative_row_source_unavailable',
        rows: [],
      };
    }

    const queryResult = await this.sqlQueryEngine.executeQuery(
      statement,
      params,
      options.queryOptions,
    );
    if (!queryResult?.success) {
      const reseedResult =
        this.maybeReseedBootstrapOverlay(tableName, queryResult);
      if (reseedResult.reseeded) {
        const retryResult = await this.sqlQueryEngine.executeQuery(
          statement,
          params,
          options.queryOptions,
        );
        this.logger.info(
          CDC_LOG_MSG.OVERLAY_RESEED_RETRY_RESULT,
          {
            nodeId: this.nodeId,
            tableName,
            retrySuccess: retryResult?.success ?? false,
          },
        );
        if (retryResult?.success) {
          return {
            ...retryResult,
            rows: Array.isArray(retryResult.rows) ?
              retryResult.rows : [],
            source: 'sql_query_engine',
          };
        }
      }
      return queryResult || {
        success: false,
        error: 'authoritative_query_failed',
        rows: [],
      };
    }
    return {
      ...queryResult,
      rows: Array.isArray(queryResult.rows) ? queryResult.rows : [],
      source: 'sql_query_engine',
    };
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
      if (errorCode !== QUERY_ERROR_CODE.TABLE_NOT_FOUND &&
          errorCode !== QUERY_ERROR_CODE.PARTITION_NOT_FOUND) {
        return {reseeded: false};
      }
      if (!this.sqlQueryEngine ||
          typeof this.sqlQueryEngine
            .installRecoveryRoutingOverlayEntry !==
            TYPEOF.FUNCTION) {
        return {reseeded: false};
      }
      const partitionId =
        INITIAL_PARTITION_IDS[tableName] || null;
      if (!partitionId) {
        return {reseeded: false};
      }
      const connectedNodes = this.messageRouter ?
        this.messageRouter.getConnectedNodes() : [];
      if (connectedNodes.length === NUM.ZERO) {
        return {reseeded: false};
      }
      this.logger.info(
        CDC_LOG_MSG.OVERLAY_RESEED_ON_TABLE_NOT_FOUND,
        {
          nodeId: this.nodeId,
          tableName,
          partitionId,
          connectedNodeCount: connectedNodes.length,
          originalError: queryResult?.error || null,
        },
      );
      const serviceRows = connectedNodes.map((nodeId) => ({
        partition_id: partitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: SERVICE_STATUS.ACTIVE,
        node_id: nodeId,
        address: `${nodeId}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}` +
          `${partitionId}`,
      }));
      const installed =
        this.sqlQueryEngine
          .installRecoveryRoutingOverlayEntry(
            partitionId, tableName, serviceRows,
          );
      return {reseeded: installed};
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
    if (typeof result.affectedRows === TYPEOF.NUMBER ||
        typeof result.changes !== TYPEOF.NUMBER) {
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
  async tryExecuteLocalSystemTableWrite(sql, params = []) {
    if (!sql || typeof sql !== TYPEOF.STRING) {
      return {handled: false};
    }
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return {handled: false};
    }

    const tableName = this.extractTableNameFromSQL(sql);
    if (!tableName || !VALID_SYSTEM_TABLES.includes(tableName)) {
      return {handled: false};
    }

    const localServices = this.resolveLocalSystemTableServices(tableName, {
      consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
    });
    if (localServices.length === NUM.ZERO) {
      return {handled: false};
    }

    for (const partitionService of localServices) {
      if (typeof partitionService?.executeQuery !== TYPEOF.FUNCTION) {
        continue;
      }
      try {
        const localResult = await partitionService.executeQuery(sql, params);
        const result = this.normalizeLocalSystemTableWriteResult(localResult);
        if (!result || result.success === false) {
          const message = result?.error || '';
          if (this.isTransientCdcError(message)) {
            continue;
          }
        }
        return {
          handled: true,
          result,
        };
      } catch (error) {
        if (this.isTransientCdcError(error?.message || '')) {
          continue;
        }
        throw error;
      }
    }

    return {handled: false};
  }

  /**
   * Validate table name is a valid system table.
   * @param {string} tableName - Table name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (!VALID_SYSTEM_TABLES.includes(tableName)) {
      throw new Error(
        `${CDC_ERROR_MSG.INVALID_TABLE_PREFIX}${tableName}. ` +
        `${CDC_ERROR_MSG.VALID_TABLES_PREFIX}` +
        `${VALID_SYSTEM_TABLES.join(CDC_SQL.COMMA_SPACE)}`,
      );
    }
  }

  /**
   * Validate data has required id field.
   * @param {Object} data - Data to validate.
   * @param {string} operation - Operation type for error message.
   * @throws {Error} If data is invalid.
   * @private
   */
  validateData(data, operation) {
    if (!data || typeof data !== TYPEOF.OBJECT) {
      throw new Error(`${operation}${CDC_ERROR_MSG.DATA_REQUIRED_SUFFIX}`);
    }
  }

  /**
   * Execute SQL directly on a local partition service (bootstrap mode only).
   *
   * Bootstrap Mode Direct Write Path:
   * - Bypasses SQL routing and system cache lookup
   * - Writes directly to local partition service
   * - Only used during seed node bootstrap before cache is populated
   * - After bootstrap, this path is never used again
   *
   * Process:
   * 1. Extract table name from SQL
   * 2. Find local partition service for that table
   * 3. Execute SQL directly on partition
   * 4. Return result
   *
   * Requirements: 8.3
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQLDirectToLocalPartition(sql, params = [], _options = {}) {
    if (!this.bootstrapMode || !this.localPartitionServices) {
      throw new Error(
        CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL,
      );
    }

    // Extract table name from SQL
    const tableName = this.extractTableNameFromSQL(sql);
    if (!tableName) {
      throw new Error(`Could not extract table name from SQL: ${sql}`);
    }

    const targetPartitionId = INITIAL_PARTITION_IDS[tableName] || null;
    const candidates = [];
    for (const service of this.localPartitionServices.values()) {
      if (!service) {
        continue;
      }
      if (targetPartitionId) {
        if (service.partitionId === targetPartitionId) {
          candidates.push(service);
        }
        continue;
      }
      if (service.tableName === tableName || service.tableId === tableName) {
        candidates.push(service);
      }
    }

    // In bootstrap mode, services should already be initialized.
    // Skip the wait loop if we have candidates - they're ready to use.
    const initializedCandidates = candidates.length > NUM.ZERO ? candidates : [];
    if (initializedCandidates.length === NUM.ZERO) {
      const partitionIds = candidates
        .map((service) => service?.partitionId)
        .filter(Boolean)
        .join(', ');
      throw new Error(
        `Partition services not initialized for table: ${tableName}. ` +
        `Partitions: ${partitionIds}`,
      );
    }

    const leaderService = initializedCandidates.find((service) => service.isLeader);
    const partitionService = leaderService || initializedCandidates[NUM.ZERO] || null;

    if (!partitionService) {
      const availablePartitions = Array.from(this.localPartitionServices.values())
        .map((service) => service?.partitionId)
        .filter(Boolean);
      throw new Error(
        `No local partition service found for table: ${tableName}. ` +
        `Available partitions: ${availablePartitions.join(', ')}`,
      );
    }

    this.logger.debug('Executing SQL directly on local partition (bootstrap mode)', {
      nodeId: this.nodeId,
      tableName,
      partitionId: partitionService.partitionId,
      sql: sql.substring(NUM.ZERO, Math.min(sql.length, NUM.HUNDRED)),
    });

    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

    // Execute SQL directly on local partition(s) without raft during bootstrap.
    if (isSelect) {
      const result = await partitionService.executeLocalQuery(sql, params);
      if (!result || result.success === false) {
        throw new Error(
          result?.error || `Direct partition query failed for table: ${tableName}`,
        );
      }
      return result;
    }

    const targets = initializedCandidates;
    const results = [];
    for (const service of targets) {
      const result = await service.executeLocalQuery(sql, params);
      results.push(result);
      if (!result || result.success === false) {
        throw new Error(
          result?.error || `Direct partition write failed for table: ${tableName}`,
        );
      }
    }

    return results[NUM.ZERO];
  }

  /**
   * Extract table name from SQL statement.
   * Supports INSERT INTO, UPDATE, DELETE FROM, and INSERT OR REPLACE INTO.
   *
   * @param {string} sql - SQL query string.
   * @return {string|null} Table name or null if not found.
   * @private
   */
  extractTableNameFromSQL(sql) {
    if (!sql || typeof sql !== TYPEOF.STRING) {
      return null;
    }

    // INSERT INTO table_name or INSERT OR REPLACE INTO table_name
    let match = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    if (match) {
      return match[NUM.ONE];
    }

    // UPDATE table_name SET
    match = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (match) {
      return match[NUM.ONE];
    }

    // DELETE FROM table_name
    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      return match[NUM.ONE];
    }

    // SELECT FROM table_name (for completeness, though not used in bootstrap)
    match = sql.match(/FROM\s+(\w+)/i);
    if (match) {
      return match[NUM.ONE];
    }

    return null;
  }

  /**
   * Resolve the canonical SQL session for one routed steady-state system-table
   * write so owner-managed CDC writes never share the default user session.
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  resolveSystemWriteSessionId(options = {}) {
    if (typeof options.sessionId === TYPEOF.STRING &&
        options.sessionId.length > NUM.ZERO) {
      return options.sessionId;
    }
    return `${CDC_SESSION.SYSTEM_WRITE_PREFIX}:${uuidv4()}`;
  }

  /**
   * Execute a SQL query through the query engine or directly to local partition.
   *
   * Routing Logic:
   * - Bootstrap mode enabled: Direct write to local partition (seed node only)
   * - Bootstrap mode disabled: Route through SQL engine to partition leader
   *
   * Normal Mode Flow:
   * 1. SQL engine uses system cache to find partition
   * 2. System cache provides partition leader address
   * 3. Message router delivers query to leader
   * 4. Partition executes query and generates CDC event
   * 5. CDC event updates all node caches
   *
  * Requirements: 8.4, 8.5
  * @param {string} sql - SQL query string.
  * @param {Array} params - Query parameters.
   * @param {Object} [options={}] - Query execution options.
  * @return {Promise<Object>} Query result.
  * @private
  */
  async executeSQLViaQueryEngine(sql, params = [], options = {}) {
    // SQL-routed mode: Route through SQL engine to partition leader
    if (!this.sqlQueryEngine) {
      throw new Error(
        `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_PREFIX}` +
        `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_DETAIL}`,
      );
    }

    const maxAttempts = Math.max(
      CDC_RETRY.MIN_ATTEMPTS,
      Number(this.retryMaxAttempts) || CDC_DEFAULTS.RETRY_MAX_ATTEMPTS,
    );
    const baseDelayMs = Math.max(
      CDC_RETRY.MIN_DELAY_MS,
      Number(this.retryDelayMs) || CDC_DEFAULTS.RETRY_DELAY_MS,
    );
    const tableName = this.extractTableNameFromSQL(sql);
    const pressureDecision = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.CRITICAL,
      resourceKeys: [
        'control-plane:write',
        `control-plane:table:${tableName || 'unknown'}`,
      ],
      allowDegrade: false,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
    const queryTimeoutMs = Number(options?.queryTimeoutMs);
    if (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName,
      });
    }
    const queryOptions = {
      sessionId: this.resolveSystemWriteSessionId(options),
      deliveryPriority: normalizeDeliveryPriority(
        options?.deliveryPriority,
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.ALLOW ||
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE ?
          'critical' :
          'background',
      ),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    };
    if (Number.isFinite(queryTimeoutMs) && queryTimeoutMs > NUM.ZERO) {
      queryOptions.timeoutMs = Math.floor(queryTimeoutMs);
    }
    if (options?.cancellationToken) {
      queryOptions.cancellationToken = options.cancellationToken;
    }

    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt += NUM.ONE) {
      try {
        const attemptStartMs = Date.now();
        if (!this.bootstrapMode) {
          const localWriteResult = await this.tryExecuteLocalSystemTableWrite(
            sql,
            params,
          );
          if (localWriteResult.handled) {
            return localWriteResult.result;
          }
        }
        const result = await this.sqlQueryEngine.executeQuery(
          sql,
          params,
          queryOptions,
        );

        if (result && result.success === false) {
          const message = result.error || ERRORS.QUERY_FAILED;
          if (this.isTransientCdcError(message) && attempt < maxAttempts) {
            this.logger.warn(CDC_LOG_MSG.TRANSIENT_SQL_RETRY, {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              error: message,
            });
            await delay(this.computeRetryDelayMs(baseDelayMs, attempt));
            continue;
          }
          throw buildSystemTableMutationError(result, message);
        }

        if (shouldEmitTableWriteMetric(tableName)) {
          try {
            const durationMs = Date.now() - attemptStartMs;
            this.logger.info(METRICS_LOG_TAG.CDC_SQL_ROUTE, {
              durationMs,
              attempt,
              maxAttempts,
              bootstrapMode:
                this.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT,
              tableName,
            });
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
        }

        return result;
      } catch (error) {
        const message = error?.message || String(error);
        if (!this.isTransientCdcError(message) || attempt >= maxAttempts) {
          throw error;
        }

        this.logger.warn(CDC_LOG_MSG.TRANSIENT_SQL_EXCEPTION_RETRY, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          error: message,
        });
        await delay(this.computeRetryDelayMs(baseDelayMs, attempt));
      }
    }

    // Should be unreachable due to throws/returns above.
    throw new Error(ERRORS.QUERY_FAILED);
  }

  /**
   * Execute SQL using the active write-router strategy.
   * @param {string} sql
   * @param {Array} params
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async executeSQL(sql, params = [], options = {}) {
    if (!this.writeRouter || typeof this.writeRouter.execute !== TYPEOF.FUNCTION) {
      throw new Error('CDC write router is not configured');
    }
    return this.writeRouter.execute(sql, params, options);
  }

  /**
   * Determine if a CDC write failure is transient and should be retried.
   * @param {string} message - Error message.
   * @return {boolean} True if transient.
   * @private
   */
  isTransientCdcError(message) {
    if (!message || typeof message !== TYPEOF.STRING) {
      return false;
    }
    return message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
      message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) ||
      message === ERRORS.QUERY_FAILED ||
      message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) ||
      message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE) ||
      message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) ||
      message.includes('No connection to node') ||
      message.includes('Failed to forward write to leader') ||
      message.includes('Message timeout');
  }

  /**
   * Exponential backoff with a small cap so bootstrap/join doesn't hang forever.
   * @param {number} baseDelayMs - Base delay from config.
   * @param {number} attempt - Current attempt (1-based).
   * @return {number} Delay in ms.
   * @private
   */
  computeRetryDelayMs(baseDelayMs, attempt) {
    const exp = Math.min(
      CDC_RETRY.MAX_EXPONENT,
      Math.max(NUM.ZERO, attempt - NUM.ONE),
    ); // cap at 64x
    return Math.min(
      CDC_RETRY.MAX_DELAY_MS,
      baseDelayMs * (CDC_RETRY.BACKOFF_BASE ** exp),
    );
  }

  /**
   * Determine whether a table write should wait for cache visibility.
   * Only CDC-propagated tables are guaranteed to appear in SystemTableCache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when cache wait semantics apply.
   * @private
   */
  shouldWaitForCacheUpdate(tableName) {
    return isTableInternalCachePropagationEnabled(tableName);
  }

  /**
   * Wait for a system table cache update matching a primary key.
   * Used to make post-write cache visibility deterministic for callers.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @param {boolean} expectPresent - True if record should exist after write.
   * @param {Object} [options] - Cache wait options.
   * @param {Object} [options.expectedFields] - Exact field-value matches.
   * @param {Object} [options.minimumFields] - Minimum field thresholds.
   * @return {Promise<void>}
   * @private
   */
  async waitForCacheUpdate(
    tableName,
    key,
    expectPresent,
    options = {},
  ) {
    // During seed bootstrap registration, writes intentionally happen before
    // cache hydration. Waiting for cache visibility in this mode causes
    // per-write timeout delays and can stall bootstrap readiness.
    if (this.bootstrapMode) {
      return;
    }

    if (!this.shouldWaitForCacheUpdate(tableName)) {
      return;
    }

    const cache = this.systemTableCache;
    if (!cache || typeof cache.onCacheChange !== TYPEOF.FUNCTION) {
      return;
    }

    const expectedFields = options?.expectedFields &&
      typeof options.expectedFields === TYPEOF.OBJECT ?
      options.expectedFields :
      null;
    const minimumFields = options?.minimumFields &&
      typeof options.minimumFields === TYPEOF.OBJECT ?
      options.minimumFields :
      null;
    const normalizedExpectedFields = this.normalizeExpectedFieldsForMinimums(
      expectedFields,
      minimumFields,
    );
    const timeoutMs = Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > 0 ?
      Math.floor(options.timeoutMs) :
      this.cacheWaitTimeoutMs;
    const fallbackPhase = this.resolveAuthoritativeFallbackPhase(
      options?.fallbackPhase,
    );

    const isSatisfied = () => this.isCacheExpectationSatisfied(
      tableName,
      key,
      expectPresent,
      normalizedExpectedFields,
      minimumFields,
    );

    if (isSatisfied()) {
      return;
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeoutBudget = createTimeoutBudget({
        configuredBudgetMs: timeoutMs,
      });
      const cleanup = (error = null) => {
        if (settled) {
          return;
        }
        settled = true;
        if (typeof cache.offCacheChange === TYPEOF.FUNCTION) {
          cache.offCacheChange(listener);
        }
        if (timer) {
          clearTimeout(timer);
        }
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      const listener = (changedTable) => {
        if (changedTable !== tableName) {
          return;
        }
        if (isSatisfied()) {
          cleanup();
        }
      };

      const timer = setTimeout(() => {
        void (async () => {
          if (isSatisfied()) {
            cleanup();
            return;
          }

          try {
            const repaired = await this.repairCacheVisibilityHole(
              tableName,
              key,
              expectPresent,
              normalizedExpectedFields,
              minimumFields,
              {fallbackPhase},
            );
            if (repaired && isSatisfied()) {
              cleanup();
              return;
            }
            this.recordAuthoritativeFallbackSignal({
              tableName,
              key,
              expectPresent,
              phase: fallbackPhase,
              outcome: AUTHORITATIVE_FALLBACK_OUTCOME.FAILED,
            });
          } catch (repairError) {
            this.recordAuthoritativeFallbackSignal({
              tableName,
              key,
              expectPresent,
              phase: fallbackPhase,
              outcome: AUTHORITATIVE_FALLBACK_OUTCOME.FAILED,
            });
            this.logger.warn('Authoritative cache repair failed after cache wait timeout', {
              tableName,
              key,
              expectPresent,
              error: repairError?.message || String(repairError),
              nodeId: this.nodeId,
            });
          }

          const buildCacheWaitTimeoutMessage =
            CDC_ERROR_MSG.CACHE_WAIT_TIMEOUT;
          const timeoutMessage = buildCacheWaitTimeoutMessage(
            tableName,
            key,
            timeoutMs,
          );
          cleanup(createTimeoutBudgetError({
            message: timeoutMessage,
            budget: timeoutBudget,
            classification:
              TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
            nestedOperation: `cache_wait:${tableName}`,
          }));
        })();
      }, timeoutMs);

      cache.onCacheChange(listener);
    });
  }

  /**
   * Check whether the local cache currently satisfies a write expectation.
   * @param {string} tableName
   * @param {string} key
   * @param {boolean} expectPresent
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {boolean}
   * @private
   */
  isCacheExpectationSatisfied(
    tableName,
    key,
    expectPresent,
    expectedFields = null,
    minimumFields = null,
  ) {
    const present = this.hasCacheRecord(tableName, key);
    if (expectPresent && !present) {
      return false;
    }
    if (!expectPresent && !present) {
      return true;
    }
    if (!expectPresent) {
      return false;
    }
    const record = this.getCacheRecord(tableName, key);
    return this.doesCacheRecordMatchExpectedFields(
      record,
      expectedFields,
    ) && this.doesCacheRecordMeetMinimumFields(
      record,
      minimumFields,
    );
  }

  /**
   * Determine whether the local cache has one record.
   * @param {string} tableName
   * @param {string} key
   * @return {boolean}
   * @private
   */
  hasCacheRecord(tableName, key) {
    const cache = this.systemTableCache;
    if (!cache) {
      return false;
    }
    if (typeof cache.has === TYPEOF.FUNCTION) {
      return cache.has(tableName, key);
    }
    if (typeof cache.get === TYPEOF.FUNCTION) {
      return Boolean(cache.get(tableName, key));
    }
    return false;
  }

  /**
   * Get one record from the local cache when available.
   * @param {string} tableName
   * @param {string} key
   * @return {Object|undefined}
   * @private
   */
  getCacheRecord(tableName, key) {
    const cache = this.systemTableCache;
    if (!cache || typeof cache.get !== TYPEOF.FUNCTION) {
      return undefined;
    }
    return cache.get(tableName, key);
  }

  /**
   * Perform one bounded authoritative repair for a cache visibility hole.
   * @param {string} tableName
   * @param {string} key
   * @param {boolean} expectPresent
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Promise<boolean>} True when a repair was applied.
   * @private
   */
  async repairCacheVisibilityHole(
    tableName,
    key,
    expectPresent,
    expectedFields = null,
    minimumFields = null,
    options = {},
  ) {
    const cacheMutationTarget = this.cacheMutationTarget;
    if (!this.shouldWaitForCacheUpdate(tableName) ||
      !cacheMutationTarget ||
      typeof cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION) {
      return false;
    }

    const primaryKeyField = this.getPrimaryKeyField(tableName);
    const queryResult = await this.executeAuthoritativeSystemTableRead(
      tableName,
      `SELECT * FROM ${tableName} WHERE ${primaryKeyField} = ?`,
      [key],
    );
    if (!queryResult?.success) {
      return false;
    }

    const causeId = `cdc-authoritative-cache-repair:${tableName}:${key}:${Date.now()}`;
    const rows = Array.isArray(queryResult.rows) ? queryResult.rows : [];
    if (expectPresent) {
      if (rows.length === NUM.ZERO) {
        return false;
      }
      for (const row of rows) {
        cacheMutationTarget.applySystemTableChange(
          tableName,
          CDC_OPERATION.UPSERT,
          row,
          {causeId},
        );
      }
    } else {
      if (rows.length > NUM.ZERO) {
        return false;
      }
      const cachedRecord = this.getCacheRecord(tableName, key);
      if (cachedRecord) {
        cacheMutationTarget.applySystemTableChange(
          tableName,
          CDC_OPERATION.DELETE,
          cachedRecord,
          {causeId},
        );
      }
    }

    const repaired = this.isCacheExpectationSatisfied(
      tableName,
      key,
      expectPresent,
      expectedFields,
      minimumFields,
    );
    if (repaired) {
      const fallbackSignal = this.recordAuthoritativeFallbackSignal({
        tableName,
        key,
        expectPresent,
        phase: this.resolveAuthoritativeFallbackPhase(options?.fallbackPhase),
        outcome: AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED,
      });
      this.logger.warn('Recovered cache visibility gap from authoritative system table read', {
        tableName,
        key,
        expectPresent,
        nodeId: this.nodeId,
        phase: fallbackSignal.phase,
        windowCount: fallbackSignal.windowCount,
        windowRatePerMinute: fallbackSignal.windowRatePerMinute,
      });
    }
    return repaired;
  }

  /**
   * Resolve authoritative fallback phase from optional runtime context.
   * @param {string|undefined|null} phase
   * @return {string}
   * @private
   */
  resolveAuthoritativeFallbackPhase(phase) {
    if (typeof phase === TYPEOF.STRING && phase.length > NUM.ZERO) {
      return normalizeAuthoritativeFallbackPhase(phase);
    }
    if (this.bootstrapMode) {
      return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
    }
    return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
  }

  /**
   * Remove authoritative fallback samples that are older than the active window.
   * @param {number} nowMs
   * @private
   */
  pruneAuthoritativeFallbackHistory(nowMs) {
    const threshold = nowMs - this.authoritativeFallbackWindowMs;
    this.authoritativeFallbackHistory = this.authoritativeFallbackHistory.filter(
      (entry) => entry.recordedAt >= threshold,
    );
  }

  /**
   * Record one authoritative fallback signal for diagnostics and strict gating.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  recordAuthoritativeFallbackSignal(options = {}) {
    const nowMs = Date.now();
    const tableName = String(options.tableName || '');
    const rowKey = String(options.key || '');
    const phase = this.resolveAuthoritativeFallbackPhase(options.phase);
    const outcome = normalizeAuthoritativeFallbackOutcome(options.outcome);
    const identity = `${tableName}:${rowKey}:${phase}:${outcome}`;
    const totalEntry = this.authoritativeFallbackTotals.get(identity) || {
      tableName,
      rowKey,
      phase,
      outcome,
      totalCount: NUM.ZERO,
      lastRecordedAt: NUM.ZERO,
    };
    totalEntry.totalCount += NUM.ONE;
    totalEntry.lastRecordedAt = nowMs;
    this.authoritativeFallbackTotals.set(identity, totalEntry);

    this.authoritativeFallbackHistory.push({
      tableName,
      rowKey,
      nodeId: this.nodeId,
      expectPresent: options.expectPresent === true,
      phase,
      outcome,
      recordedAt: nowMs,
    });
    this.pruneAuthoritativeFallbackHistory(nowMs);

    let windowCount = NUM.ZERO;
    for (const entry of this.authoritativeFallbackHistory) {
      if (entry.tableName === tableName &&
          entry.rowKey === rowKey &&
          entry.phase === phase &&
          entry.outcome === outcome) {
        windowCount += NUM.ONE;
      }
    }

    return {
      tableName,
      rowKey,
      nodeId: this.nodeId,
      expectPresent: options.expectPresent === true,
      phase,
      outcome,
      windowCount,
      windowRatePerMinute:
        (windowCount / this.authoritativeFallbackWindowMs) * 60 * 1000,
      recordedAt: nowMs,
    };
  }

  /**
   * Summarize authoritative fallback diagnostics for local runtime export.
   * @return {Object}
   */
  getAuthoritativeFallbackDiagnostics() {
    const nowMs = Date.now();
    this.pruneAuthoritativeFallbackHistory(nowMs);

    const phases = {
      [AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP]: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
      [AUTHORITATIVE_FALLBACK_PHASE.RECOVERY]: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
      [AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE]: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
    };
    const outcomes = {
      [AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED]: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
      [AUTHORITATIVE_FALLBACK_OUTCOME.FAILED]: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
    };
    const byTable = {};
    let totalCount = NUM.ZERO;
    for (const totalEntry of this.authoritativeFallbackTotals.values()) {
      totalCount += totalEntry.totalCount;
      phases[totalEntry.phase].totalCount += totalEntry.totalCount;
      outcomes[totalEntry.outcome].totalCount += totalEntry.totalCount;
      const tableEntry = byTable[totalEntry.tableName] || {
        totalCount: NUM.ZERO,
        windowCount: NUM.ZERO,
        lastRecordedAt: NUM.ZERO,
      };
      tableEntry.totalCount += totalEntry.totalCount;
      tableEntry.lastRecordedAt = Math.max(
        tableEntry.lastRecordedAt,
        totalEntry.lastRecordedAt,
      );
      byTable[totalEntry.tableName] = tableEntry;
    }

    for (const entry of this.authoritativeFallbackHistory) {
      phases[entry.phase].windowCount += NUM.ONE;
      outcomes[entry.outcome].windowCount += NUM.ONE;
      const tableEntry = byTable[entry.tableName] || {
        totalCount: NUM.ZERO,
        windowCount: NUM.ZERO,
        lastRecordedAt: NUM.ZERO,
      };
      tableEntry.windowCount += NUM.ONE;
      tableEntry.lastRecordedAt = Math.max(tableEntry.lastRecordedAt, entry.recordedAt);
      byTable[entry.tableName] = tableEntry;
    }

    const recentEvents = this.authoritativeFallbackHistory
      .slice(-AUTHORITATIVE_FALLBACK_RECENT_LIMIT)
      .map((entry) => ({...entry}));

    return {
      schemaVersion: NUM.ONE,
      nodeId: this.nodeId,
      windowMs: this.authoritativeFallbackWindowMs,
      totalCount,
      windowCount: this.authoritativeFallbackHistory.length,
      windowRatePerMinute:
        (this.authoritativeFallbackHistory.length / this.authoritativeFallbackWindowMs) *
        60 *
        1000,
      phases,
      outcomes,
      byTable,
      recentEvents,
    };
  }

  /**
   * Determine whether one cached row matches the expected post-write fields.
   * @param {Object|undefined} record
   * @param {Object|null} expectedFields
   * @return {boolean}
   * @private
   */
  doesCacheRecordMatchExpectedFields(record, expectedFields) {
    if (!expectedFields) {
      return Boolean(record);
    }
    if (!record || typeof record !== TYPEOF.OBJECT) {
      return false;
    }

    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      if (!this.areCacheFieldValuesEqual(record[fieldName], expectedValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Remove exact-match fields that are validated by minimum thresholds.
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Object|null}
   * @private
   */
  normalizeExpectedFieldsForMinimums(expectedFields, minimumFields) {
    if (!expectedFields) {
      return null;
    }
    if (!minimumFields) {
      return expectedFields;
    }

    const normalized = {};
    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      if (Object.prototype.hasOwnProperty.call(minimumFields, fieldName)) {
        continue;
      }
      normalized[fieldName] = expectedValue;
    }

    return Object.keys(normalized).length > NUM.ZERO ? normalized : null;
  }

  /**
   * Determine whether one cached row satisfies all minimum field thresholds.
   * @param {Object|undefined} record
   * @param {Object|null} minimumFields
   * @return {boolean}
   * @private
   */
  doesCacheRecordMeetMinimumFields(record, minimumFields) {
    if (!minimumFields) {
      return true;
    }
    if (!record || typeof record !== TYPEOF.OBJECT) {
      return false;
    }

    for (const [fieldName, minimumValue] of Object.entries(minimumFields)) {
      if (!this.isCacheFieldValueAtLeast(record[fieldName], minimumValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check whether one cached value is equal to or greater than a minimum.
   * @param {*} actualValue
   * @param {*} minimumValue
   * @return {boolean}
   * @private
   */
  isCacheFieldValueAtLeast(actualValue, minimumValue) {
    if (this.areCacheFieldValuesEqual(actualValue, minimumValue)) {
      return true;
    }
    const actualComparable = this.normalizeComparableCacheFieldValue(actualValue);
    const minimumComparable = this.normalizeComparableCacheFieldValue(minimumValue);
    if (actualComparable === null || minimumComparable === null) {
      return false;
    }
    return actualComparable >= minimumComparable;
  }

  /**
   * Normalize one cache field into a comparable numeric value when possible.
   * @param {*} value
   * @return {number|null}
   * @private
   */
  normalizeComparableCacheFieldValue(value) {
    if (typeof value === TYPEOF.NUMBER) {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === TYPEOF.BIGINT) {
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : null;
    }
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    if (typeof value === TYPEOF.STRING) {
      if (value.length === NUM.ZERO) {
        return null;
      }
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        return asNumber;
      }
      const asDate = Date.parse(value);
      return Number.isFinite(asDate) ? asDate : null;
    }

    return null;
  }

  /**
   * Compare one cached field against an expected post-write value.
   * @param {*} actualValue
   * @param {*} expectedValue
   * @return {boolean}
   * @private
   */
  areCacheFieldValuesEqual(actualValue, expectedValue) {
    if (actualValue === expectedValue) {
      return true;
    }

    if ((actualValue === null || typeof actualValue !== TYPEOF.OBJECT) &&
        (expectedValue === null || typeof expectedValue !== TYPEOF.OBJECT)) {
      return false;
    }

    try {
      return JSON.stringify(actualValue) === JSON.stringify(expectedValue);
    } catch (_parseErr) {
      return false;
    }
  }

  /**
   * Build column list and value placeholders for INSERT.
   * @param {Object} data - Row data.
   * @return {Object} {columns, placeholders, values}
   * @private
   */
  buildInsertParts(data) {
    const columns = Object.keys(data);
    const placeholders = columns
      .map(() => CDC_SQL.PARAM_PLACEHOLDER)
      .join(CDC_SQL.COMMA_SPACE);
    const values = columns.map((col) => {
      const val = data[col];
      // Serialize objects/arrays to JSON
      if (val !== null && typeof val === TYPEOF.OBJECT) {
        return JSON.stringify(val);
      }
      return val;
    });
    return {columns: columns.join(CDC_SQL.COMMA_SPACE), placeholders, values};
  }

  /**
   * Filter row data to known columns for the target system table.
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data.
   * @return {Object} Filtered row data.
   * @private
   */
  filterDataForTable(tableName, data) {
    const schema = getSchemaByTableName(tableName);
    if (!schema || !schema.columns) {
      throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
    }

    const allowed = new Set(schema.columns.map((column) => column.name));
    const filtered = {};

    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Normalize INSERT/UPSERT row data using schema defaults and table-specific defaults.
   * @param {string} tableName - System table name.
   * @param {Object} data - Input row data.
   * @return {Object} Normalized row data.
   * @private
   */
  prepareInsertData(tableName, data, options = {}) {
    const schema = getSchemaByTableName(tableName);
    if (!schema || !schema.columns) {
      throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
    }

    const rowData = this.filterDataForTable(tableName, {...data});
    if (Object.keys(rowData).length === NUM.ZERO) {
      throw new Error(`${CDC_ERROR_MSG.INSERT_VALID_COLUMNS_PREFIX}${tableName}`);
    }

    const {generatePrimaryKey = true} = options;
    const idField = this.getPrimaryKeyField(tableName);
    if (!rowData[idField] && generatePrimaryKey) {
      rowData[idField] = uuidv4();
    }

    this.applySchemaDefaults(schema, rowData);
    this.applyTableInsertDefaults(tableName, schema, rowData);
    this.applyTimestampDefaults(schema, rowData);

    return rowData;
  }

  /**
   * Apply schema-defined defaults to missing fields.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applySchemaDefaults(schema, rowData) {
    for (const column of schema.columns) {
      if (rowData[column.name] !== undefined) {
        continue;
      }
      if (column.defaultValue === undefined) {
        continue;
      }
      rowData[column.name] = this.normalizeDefaultValue(column.defaultValue);
    }
  }

  /**
   * Apply generic timestamp defaults for inserts when columns exist.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applyTimestampDefaults(schema, rowData) {
    const now = Date.now();
    const columnNames = new Set(schema.columns.map((col) => col.name));
    if (columnNames.has(COLUMN.CREATED_AT) && rowData[COLUMN.CREATED_AT] == null) {
      rowData[COLUMN.CREATED_AT] = now;
    }
    if (columnNames.has(COLUMN.UPDATED_AT) && rowData[COLUMN.UPDATED_AT] == null) {
      rowData[COLUMN.UPDATED_AT] = now;
    }
  }

  /**
   * Apply table-specific defaults for inserts.
   * @param {string} tableName - System table name.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applyTableInsertDefaults(tableName, _schema, rowData) {
    const now = Date.now();
    if (tableName !== SYSTEM_TABLE_NAME.NODES) {
      return;
    }

    if (!rowData[COLUMN.NODE_ADDRESS]) {
      rowData[COLUMN.NODE_ADDRESS] = 'unknown';
    }
    if (rowData.cpu_cores == null) {
      rowData.cpu_cores = NUM.ZERO;
    }
    if (rowData.memory_mb == null) {
      rowData.memory_mb = NUM.ZERO;
    }
    if (rowData.disk_gb == null) {
      rowData.disk_gb = NUM.ZERO;
    }
    if (rowData.cpu_usage_percent == null) {
      rowData.cpu_usage_percent = NUM.ZERO;
    }
    if (rowData.memory_usage_percent == null) {
      rowData.memory_usage_percent = NUM.ZERO;
    }
    if (rowData.disk_usage_percent == null) {
      rowData.disk_usage_percent = NUM.ZERO;
    }
    if (!rowData.status) {
      rowData.status = SERVICE_STATUS.ACTIVE;
    }
    if (!rowData.connection_state) {
      rowData.connection_state = STATE.DISCONNECTED;
    }
    if (rowData.capabilities == null) {
      rowData.capabilities = '[]';
    }
    if (rowData.last_heartbeat == null) {
      rowData.last_heartbeat = now;
    }
  }

  /**
   * Normalize schema default values (strip quotes, parse numbers).
   * @param {string|number|null} value - Default value.
   * @return {string|number|null} Normalized default.
   * @private
   */
  normalizeDefaultValue(value) {
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof value !== TYPEOF.STRING) {
      return value;
    }
    const trimmed = value.trim();
    if ((trimmed.startsWith('\'') && trimmed.endsWith('\'')) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return trimmed.slice(1, -1);
    }
    if (trimmed.toLowerCase() === 'null') {
      return null;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  /**
   * Emit CDC error event only when listeners are registered.
   * @param {Object} payload - CDC error payload.
   * @private
   */
  emitErrorEvent(payload) {
    if (this.listenerCount(CDC_EVENT.ERROR) > NUM.ZERO) {
      this.emit(CDC_EVENT.ERROR, payload);
    }
  }

  /**
   * Build SET clause for UPDATE.
   * @param {Object} data - Data to update.
   * @return {Object} {setClause, values}
   * @private
   */
  buildUpdateParts(data) {
    const columns = Object.keys(data);
    const setClause = columns
      .map((col) => `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.COMMA_SPACE);
    const values = columns.map((col) => {
      const val = data[col];
      if (val !== null && typeof val === TYPEOF.OBJECT) {
        return JSON.stringify(val);
      }
      return val;
    });
    return {setClause, values};
  }

  /**
   * Build WHERE clause from conditions.
   * @param {Object} whereClause - WHERE conditions.
   * @return {Object} {whereStr, values}
   * @private
   */
  buildWhereParts(whereClause) {
    const conditions = Object.keys(whereClause);
    const whereStr = conditions
      .map((col) => `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.WHERE_AND);
    const values = conditions.map((col) => whereClause[col]);
    return {whereStr, values};
  }

  /**
   * Build one canonical single-flight key for an in-flight system-table
   * mutation so identical callers collapse into one routed write.
   * @param {string} operation
   * @param {string} tableName
   * @param {string|null} identity
   * @param {Object} payload
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildMutationSingleFlightKey(
    operation,
    tableName,
    identity,
    payload,
    options = {},
  ) {
    if (options?.allowCoalescing === false) {
      return null;
    }
    if (typeof options?.coalescingKey === TYPEOF.STRING &&
        options.coalescingKey.length > NUM.ZERO) {
      return `${operation}:${tableName}:${options.coalescingKey}`;
    }
    return stableSerializeMutationKey({
      operation,
      tableName,
      identity: identity || null,
      payload,
    });
  }

  /**
   * Reuse one in-flight mutation promise when callers submit the same
   * canonical write intent concurrently.
   * @param {string|null} singleFlightKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runCoalescedMutation(singleFlightKey, executionFactory) {
    if (!singleFlightKey) {
      return executionFactory();
    }
    const existingMutation = this.inFlightMutationsByKey.get(singleFlightKey);
    if (existingMutation) {
      return existingMutation;
    }
    let inFlightMutation = null;
    inFlightMutation = Promise.resolve()
      .then(() => executionFactory())
      .finally(() => {
        if (this.inFlightMutationsByKey.get(singleFlightKey) ===
            inFlightMutation) {
          this.inFlightMutationsByKey.delete(singleFlightKey);
        }
      });
    this.inFlightMutationsByKey.set(singleFlightKey, inFlightMutation);
    return inFlightMutation;
  }

  /**
   * Insert a row into a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to insert.
   * @param {Object} [options] - Insert options.
   * @return {Promise<Object>} Insert result.
   */
  async insertSystemTableRow(tableName, data, options = {}) {
    this.validateTableName(tableName);
    this.validateData(data, CDC_OPERATION.INSERT);

    const rowData = this.prepareInsertData(tableName, data);
    const idField = this.getPrimaryKeyField(tableName);
    const trackingId = rowData[idField];
    const singleFlightKey = this.buildMutationSingleFlightKey(
      CDC_OPERATION.INSERT,
      tableName,
      trackingId,
      rowData,
      options,
    );

    this.logger.debug(CDC_LOG_MSG.INSERTING_ROW, {
      tableName,
      id: trackingId,
      nodeId: this.nodeId,
    });

    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {columns, placeholders, values} = this.buildInsertParts(rowData);
        const sql = `${SQL.INSERT_INTO} ${tableName} (${columns}) ` +
          `${SQL.VALUES} (${placeholders})`;

        const sqlStartMs = Date.now();
        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority,
        });
        const sqlDurationMs = Date.now() - sqlStartMs;

        if (!result.success) {
          throw buildSystemTableMutationError(
            result,
            CDC_ERROR_MSG.INSERT_FAILED,
          );
        }

        const pkField = this.getPrimaryKeyField(tableName);
        const pkValue = rowData[pkField];
        const cacheWaitStartMs = Date.now();
        if (pkValue && options?.skipCacheWait !== true) {
          await this.waitForCacheUpdate(tableName, pkValue, true);
        }
        const cacheWaitDurationMs = Date.now() - cacheWaitStartMs;

        if (shouldEmitTableWriteMetric(tableName)) {
          try {
            this.logger.info(METRICS_LOG_TAG.CDC_WRITE, {
              tableName,
              operation: CDC_OPERATION.INSERT,
              sqlDurationMs,
              cacheWaitDurationMs,
              totalDurationMs: sqlDurationMs + cacheWaitDurationMs,
            });
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
        }

        this.stats.inserts++;

        this.logger.debug(CDC_LOG_MSG.INSERTED_ROW, {
          tableName,
          id: trackingId,
          success: true,
        });

        this.emit(CDC_EVENT.INSERT, {
          tableName,
          data: rowData,
          result,
        });

        return {
          success: true,
          operation: CDCOperationType.INSERT,
          tableName,
          data: rowData,
          partitionResult: result,
        };
      } catch (error) {
        this.stats.failures++;

        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(this, CDC_LOG_MSG.INSERT_FAILED, {
            tableName,
            id: trackingId,
            error: error.message,
            nodeId: this.nodeId,
          }, error);
        }

        this.emitErrorEvent({
          operation: CDCOperationType.INSERT,
          tableName,
          data: rowData,
          error: error.message,
        });

        throw error;
      }
    });
  }

  /**
   * Update a row in a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    this.validateTableName(tableName);
    this.validateData(whereClause, CDC_OPERATION_LABEL.UPDATE_WHERE);
    this.validateData(data, CDC_OPERATION_LABEL.UPDATE_DATA);

    const idField = this.getPrimaryKeyField(tableName);
    const id = whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK];
    if (!id) {
      throw new Error(
        `${CDC_ERROR_MSG.UPDATE_PRIMARY_KEY_PREFIX}${idField}` +
        `${CDC_ERROR_MSG.UPDATE_PRIMARY_KEY_SUFFIX}`,
      );
    }

    const updateData = this.filterDataForTable(tableName, {...data});
    if (Object.keys(updateData).length === NUM.ZERO) {
      throw new Error(`${CDC_ERROR_MSG.UPDATE_VALID_COLUMNS_PREFIX}${tableName}`);
    }
    const singleFlightKey = this.buildMutationSingleFlightKey(
      CDC_OPERATION.UPDATE,
      tableName,
      id,
      {
        whereClause,
        data: updateData,
      },
      options,
    );

    this.logger.debug(CDC_LOG_MSG.UPDATING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {setClause, values: setValues} = this.buildUpdateParts(updateData);
        const {whereStr, values: whereValues} = this.buildWhereParts(whereClause);
        const sql = `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ` +
          `${SQL.WHERE} ${whereStr}`;

        const sqlStartMs = Date.now();
        const result = await this.executeSQL(sql, [...setValues, ...whereValues], {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority,
        });
        const sqlDurationMs = Date.now() - sqlStartMs;

        if (!result.success) {
          throw buildSystemTableMutationError(
            result,
            CDC_ERROR_MSG.UPDATE_FAILED,
          );
        }

        const cacheWaitStartMs = Date.now();
        if (options?.skipCacheWait !== true &&
          (typeof result.affectedRows !== TYPEOF.NUMBER ||
          result.affectedRows > NUM.ZERO)) {
          const expectedCacheFields = options?.expectedCacheFields &&
            typeof options.expectedCacheFields === TYPEOF.OBJECT ?
            options.expectedCacheFields :
            null;
          const minimumCacheFields = options?.minimumCacheFields &&
            typeof options.minimumCacheFields === TYPEOF.OBJECT ?
            options.minimumCacheFields :
            null;
          await this.waitForCacheUpdate(tableName, id, true, {
            expectedFields: expectedCacheFields,
            minimumFields: minimumCacheFields,
          });
        }
        const cacheWaitDurationMs = Date.now() - cacheWaitStartMs;

        if (shouldEmitTableWriteMetric(tableName)) {
          try {
            this.logger.info(METRICS_LOG_TAG.CDC_WRITE, {
              tableName,
              operation: CDC_OPERATION.UPDATE,
              sqlDurationMs,
              cacheWaitDurationMs,
              totalDurationMs: sqlDurationMs + cacheWaitDurationMs,
            });
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
        }

        this.stats.updates++;

        this.logger.debug(CDC_LOG_MSG.UPDATED_ROW, {
          tableName,
          id,
          success: true,
          changes: result.affectedRows,
        });

        this.emit(CDC_EVENT.UPDATE, {
          tableName,
          whereClause,
          data: updateData,
          result,
        });

        return {
          success: true,
          operation: CDCOperationType.UPDATE,
          tableName,
          whereClause,
          data: updateData,
          partitionResult: result,
        };
      } catch (error) {
        this.stats.failures++;

        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(this, CDC_LOG_MSG.UPDATE_FAILED, {
            tableName,
            id,
            error: error.message,
            nodeId: this.nodeId,
          }, error);
        }

        this.emitErrorEvent({
          operation: CDCOperationType.UPDATE,
          tableName,
          whereClause,
          data: updateData,
          error: error.message,
        });

        throw error;
      }
    });
  }

  /**
   * Delete a row from a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} [options] - Delete options.
   * @return {Promise<Object>} Delete result.
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    this.validateTableName(tableName);
    this.validateData(whereClause, CDC_OPERATION_LABEL.DELETE_WHERE);

    const idField = this.getPrimaryKeyField(tableName);
    const id = whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK];
    if (!id) {
      throw new Error(
        `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_PREFIX}${idField}` +
        `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_SUFFIX}`,
      );
    }
    const singleFlightKey = this.buildMutationSingleFlightKey(
      CDC_OPERATION.DELETE,
      tableName,
      id,
      {whereClause},
      options,
    );

    this.logger.debug(CDC_LOG_MSG.DELETING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {whereStr, values} = this.buildWhereParts(whereClause);
        const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereStr}`;

        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority,
        });

        if (!result.success) {
          throw buildSystemTableMutationError(
            result,
            CDC_ERROR_MSG.DELETE_FAILED,
          );
        }

        if (typeof result.affectedRows !== TYPEOF.NUMBER ||
          result.affectedRows > NUM.ZERO) {
          await this.waitForCacheUpdate(tableName, id, false);
        }

        this.stats.deletes++;

        this.logger.debug(CDC_LOG_MSG.DELETED_ROW, {
          tableName,
          id,
          success: true,
          changes: result.affectedRows,
        });

        this.emit(CDC_EVENT.DELETE, {
          tableName,
          whereClause,
          id,
          result,
        });

        return {
          success: true,
          operation: CDCOperationType.DELETE,
          tableName,
          whereClause,
          id,
          partitionResult: result,
        };
      } catch (error) {
        this.stats.failures++;

        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(this, CDC_LOG_MSG.DELETE_FAILED, {
            tableName,
            id,
            error: error.message,
            nodeId: this.nodeId,
          }, error);
        }

        this.emitErrorEvent({
          operation: CDCOperationType.DELETE,
          tableName,
          whereClause,
          error: error.message,
        });

        throw error;
      }
    });
  }

  /**
   * Upsert a row in a system table (insert or replace on conflict).
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to upsert (must include primary key).
   * @return {Promise<Object>} Upsert result.
   */
  async upsertSystemTableRow(tableName, data, options = {}) {
    this.validateTableName(tableName);
    this.validateData(data, CDC_OPERATION_LABEL.UPSERT);

    const upsertData = this.prepareInsertData(tableName, data, {generatePrimaryKey: false});
    const idField = this.getPrimaryKeyField(tableName);
    const id = upsertData[idField];
    if (!id) {
      throw new Error(
        `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_PREFIX}${idField}` +
        `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_SUFFIX}`,
      );
    }
    const singleFlightKey = this.buildMutationSingleFlightKey(
      CDC_OPERATION.UPSERT,
      tableName,
      id,
      upsertData,
      options,
    );

    this.logger.debug(CDC_LOG_MSG.UPSERTING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {columns, placeholders, values} = this.buildInsertParts(upsertData);
        // SQLite INSERT OR REPLACE
        const sql = `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columns}) ` +
          `${SQL.VALUES} (${placeholders})`;

        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority,
        });

        if (!result.success) {
          throw buildSystemTableMutationError(
            result,
            CDC_ERROR_MSG.UPSERT_FAILED,
          );
        }

        if (options?.skipCacheWait !== true) {
          await this.waitForCacheUpdate(tableName, id, true);
        }

        this.stats.updates++;

        this.logger.debug(CDC_LOG_MSG.UPSERTED_ROW, {
          tableName,
          id,
          success: true,
        });

        this.emit(CDC_EVENT.UPSERT, {
          tableName,
          data: upsertData,
          result,
        });

        return {
          success: true,
          operation: CDCOperationType.UPSERT,
          tableName,
          data: upsertData,
          partitionResult: result,
        };
      } catch (error) {
        this.stats.failures++;

        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(this, CDC_LOG_MSG.UPSERT_FAILED, {
            tableName,
            id,
            error: error.message,
            nodeId: this.nodeId,
          }, error);
        }

        this.emitErrorEvent({
          operation: CDCOperationType.UPSERT,
          tableName,
          data: upsertData,
          error: error.message,
        });

        throw error;
      }
    });
  }

  /**
   * Get the primary key field name for a system table.
   * @param {string} tableName - System table name.
   * @return {string} Primary key field name.
   * @private
   */
  getPrimaryKeyField(tableName) {
    return getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CDC_PRIMARY_KEY.FALLBACK,
    );
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    return {
      ...this.stats,
      total: this.stats.inserts + this.stats.updates + this.stats.deletes,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {...CDC_STATS_DEFAULT};
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Set the epoch manager reference for CDC epoch change handling.
   * @param {AssignmentEpochManager} epochManager - The epoch manager instance.
   */
  setEpochManager(epochManager) {
    if (!epochManager) {
      throw new Error(CDC_ERROR_MSG.EPOCH_MANAGER_REQUIRED);
    }
    this.epochManager = epochManager;

    this.logger.debug(CDC_LOG_MSG.EPOCH_MANAGER_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Handle epoch change CDC event.
   * Listens for epoch changes in the config table and updates the local
   * AssignmentEpochManager.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be config).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.config_key - The config key.
   * @param {string} cdcEvent.data.config_value - The config value (epoch JSON).
   * @return {{applied: boolean, epoch?: number, error?: string}}
   *   Result object indicating if epoch was applied.
   */
  handleEpochChangeCDC(cdcEvent) {
    return this.ensureEventHandler().handleEpochChangeCDC(cdcEvent);
  }

  /**
   * Set the rebalancer reference for node state change handling.
   * @param {Object} rebalancer - The rebalancer instance (must have onNodeStateChange method).
   */
  setRebalancer(rebalancer) {
    if (!rebalancer) {
      throw new Error(CDC_ERROR_MSG.REBALANCER_REQUIRED);
    }
    this.rebalancer = rebalancer;

    this.logger.debug(CDC_LOG_MSG.REBALANCER_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Handle node state change CDC event.
   * Listens for node state changes in the nodes table and triggers
   * the rebalancer when appropriate.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.status - The node status/state.
   * @return {{processed: boolean, nodeId?: string, oldState?: string,
   *   newState?: string, error?: string}}
   *   Result object indicating if the event was processed.
   */
  handleNodeStateCDC(cdcEvent) {
    return this.ensureEventHandler().handleNodeStateCDC(cdcEvent);
  }

  /**
   * Set the message router reference for mesh connectivity.
   * When set, the CDC service will establish connections to new nodes
   * when they are added to the nodes table via CDC events.
   * @param {Object} messageRouter - The message router instance.
   */
  setMessageRouter(messageRouter) {
    if (!messageRouter) {
      throw new Error(CDC_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }
    this.messageRouter = messageRouter;

    this.logger.debug(CDC_LOG_MSG.MESSAGE_ROUTER_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Handle node joined CDC event for mesh connectivity.
   * When a new node is added to the nodes table, this method establishes
   * an outbound WebSocket connection to that node, ensuring full mesh
   * connectivity across the cluster.
   *
   * All nodes are equal peers - no special treatment for any node.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.node_address - The node address.
   * @return {Promise<{processed: boolean, nodeId?: string, connected?: boolean,
   *   error?: string}>} Result object indicating if connection was established.
   */
  async handleNodeJoinedCDC(cdcEvent) {
    // Validate cdcEvent
    if (!cdcEvent || typeof cdcEvent !== TYPEOF.OBJECT) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.INVALID_EVENT,
      };
    }

    // Check if this is a nodes table INSERT event
    const tableName = cdcEvent.tableName;
    if (tableName !== SYSTEM_TABLE_NAME.NODES) {
      return {
        processed: false,
        error: `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`,
      };
    }

    // Only process INSERT operations (new nodes joining)
    const operation = cdcEvent.operation;
    if (operation !== CDC_OPERATION.INSERT) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NOT_INSERT_OPERATION,
      };
    }

    // Extract node data
    const targetNodeId = cdcEvent.data?.[COLUMN.NODE_ID];
    const nodeAddress = cdcEvent.data?.[COLUMN.NODE_ADDRESS];

    if (!targetNodeId) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NODE_ID_MISSING,
      };
    }

    // Skip if this is our own node
    if (targetNodeId === this.nodeId) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_SELF, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return {
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.SELF,
      };
    }

    // Skip if no message router is set
    if (!this.messageRouter) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.MESSAGE_ROUTER_NOT_SET,
      };
    }

    const connectionState =
      typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION ?
        this.messageRouter.getConnectionState(targetNodeId) :
        this.messageRouter.nodeConnections?.get(targetNodeId)?.state || null;
    if (connectionState === STATE.CONNECTED) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return {
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.ALREADY_CONNECTED,
      };
    }

    const wsAddress = resolveNodeWebSocketAddress({
      targetNodeId,
      systemTableCache: this.systemTableCache,
    });
    if (!wsAddress) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        nodeAddress,
        error: 'Missing canonical node_endpoints websocket address',
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: 'Missing canonical node_endpoints websocket address',
      };
    }

    this.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, {
      nodeId: this.nodeId,
      targetNodeId,
      wsAddress,
    });

    // Establish connection to the new node
    try {
      await this.messageRouter.connectToNode(targetNodeId, wsAddress);
      this.logger.info(CDC_LOG_MSG.NEW_NODE_CONNECTED, {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress,
      });

      // Emit nodeJoined event
      this.emit(CDC_EVENT.NODE_JOINED, {
        nodeId: targetNodeId,
        nodeAddress,
        wsAddress,
        timestamp: Date.now(),
        source: CDC_SOURCE.CDC,
      });

      return {
        processed: true,
        nodeId: targetNodeId,
        connected: true,
        wsAddress,
      };
    } catch (connectError) {
      // Log but don't fail - the node might be temporarily unavailable
      // Raft will handle retries and leader election
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress,
        error: connectError.message,
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: connectError.message,
      };
    }
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
      return null;
    }

    // Parse hostname:port format
    const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
      // No colon found or colon at start (empty hostname)
      return null;
    }

    const hostname = nodeAddress.substring(NUM.ZERO, colonIndex);
    if (!hostname || hostname.length === NUM.ZERO) {
      return null;
    }

    const portStr = nodeAddress.substring(colonIndex + NUM.ONE);
    const restPort = parseInt(portStr, NUM.TEN);

    if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
      return null;
    }

    // WebSocket port = REST port + WS_PORT_OFFSET
    const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
    return `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`;
  }
}

export {CDCIntegrationService, CDCOperationType, VALID_SYSTEM_TABLES, EPOCH_CONFIG_KEY};
