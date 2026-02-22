/**
 * CDC Integration Service - Routes all system table writes through SQL.
 * Ensures cache consistency by making CDC the single source of truth.
 *
 * Bootstrap Mode Architecture:
 * - Seed node uses bootstrap mode during initial setup
 * - Bootstrap mode enables direct writes to local partitions
 * - Required because system cache is empty during seed node bootstrap
 * - After bootstrap, mode is disabled and all writes route through SQL
 *
 * Normal Mode Architecture:
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
  CDC_OPERATION, COLUMN, ERRORS, METRICS_LOG_TAG, NUM, SERVICE_STATUS, SQL, STATE,
  STRING, TYPEOF, ADDRESS, PROTOCOL,
} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {
  SystemTableName,
  INITIAL_PARTITION_IDS,
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {CDC_PROPAGATED_TABLES} from '../cache/cache-constants.js';
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

/**
 * Valid system table names for CDC operations.
 */
const VALID_SYSTEM_TABLES = Object.values(SystemTableName);

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
  SystemTableName.LOGS,
  SystemTableName.NODES,
  SystemTableName.NODE_ENDPOINTS,
]);
const TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES = new Set([
  SystemTableName.LOGS,
]);

function shouldEmitTableWriteMetric(tableName) {
  return !TABLE_WRITE_METRIC_SUPPRESSED_TABLES.has(tableName);
}

function shouldLogTableWriteFailure(tableName) {
  return !TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES.has(tableName);
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

    // Bootstrap mode for seed node direct writes
    this.bootstrapMode = false;
    this.localPartitionServices = null;
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
    this.messageRouter = null;

    this.cdcEventHandler = null;

    // Statistics
    this.stats = {...CDC_STATS_DEFAULT};

    this.initialized = false;
  }

  /**
   * Set the system table cache used for post-write consistency waits.
   * @param {Object} cache - System table cache (read-only wrapper ok).
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
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
      execute: (sql, params) => this.executeSQLViaQueryEngine(sql, params),
    });
  }

  /**
   * Create bootstrap direct-write strategy.
   * @return {Object}
   * @private
   */
  createBootstrapDirectWriteRouter() {
    return createBootstrapDirectWriteRouter({
      execute: (sql, params) => this.executeSQLDirectToLocalPartition(sql, params),
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
      if (!partitionServices || !(partitionServices instanceof Map)) {
        throw new Error('Bootstrap mode requires a Map of local partition services');
      }
      this.bootstrapMode = true;
      this.localPartitionServices = partitionServices;
      this.setWriteRouter(this.createBootstrapDirectWriteRouter());
      this.logger.info('Bootstrap mode enabled - writes will go directly to local partitions', {
        nodeId: this.nodeId,
        partitionCount: partitionServices.size,
      });
    } else {
      this.bootstrapMode = false;
      this.localPartitionServices = null;
      this.setWriteRouter(this.createSqlWriteRouter());
      this.logger.info('Bootstrap mode disabled - writes will route through SQL engine', {
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
  async executeSQLDirectToLocalPartition(sql, params = []) {
    if (!this.bootstrapMode || !this.localPartitionServices) {
      throw new Error(
        'executeSQLDirectToLocalPartition can only be called in bootstrap mode',
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
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQLViaQueryEngine(sql, params = []) {
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

    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt += NUM.ONE) {
      try {
        const attemptStartMs = Date.now();
        const result = await this.sqlQueryEngine.executeQuery(sql, params);

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
          throw new Error(message);
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
   * @return {Promise<Object>}
   * @private
   */
  async executeSQL(sql, params = []) {
    if (!this.writeRouter || typeof this.writeRouter.execute !== TYPEOF.FUNCTION) {
      throw new Error('CDC write router is not configured');
    }
    return this.writeRouter.execute(sql, params);
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
    return CDC_PROPAGATED_TABLES.includes(tableName);
  }

  /**
   * Wait for a system table cache update matching a primary key.
   * Used to make post-write cache visibility deterministic for callers.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @param {boolean} expectPresent - True if record should exist after write.
   * @return {Promise<void>}
   * @private
   */
  async waitForCacheUpdate(tableName, key, expectPresent) {
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

    const hasRecord = () => {
      if (typeof cache.has === TYPEOF.FUNCTION) {
        return cache.has(tableName, key);
      }
      if (typeof cache.get === TYPEOF.FUNCTION) {
        return Boolean(cache.get(tableName, key));
      }
      return false;
    };

    const alreadySatisfied = expectPresent ? hasRecord() : !hasRecord();
    if (alreadySatisfied) {
      return;
    }

    await new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
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
        resolve();
      };

      const listener = (changedTable) => {
        if (changedTable !== tableName) {
          return;
        }
        const present = hasRecord();
        if ((expectPresent && present) || (!expectPresent && !present)) {
          cleanup();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
      }, this.cacheWaitTimeoutMs);

      cache.onCacheChange(listener);
    });
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
    if (tableName !== SystemTableName.NODES) {
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
   * Insert a row into a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to insert.
   * @return {Promise<Object>} Insert result.
   */
  async insertSystemTableRow(tableName, data) {
    this.validateTableName(tableName);
    this.validateData(data, CDC_OPERATION.INSERT);

    const rowData = this.prepareInsertData(tableName, data);
    const idField = this.getPrimaryKeyField(tableName);
    const trackingId = rowData[idField];

    this.logger.debug(CDC_LOG_MSG.INSERTING_ROW, {
      tableName,
      id: trackingId,
      nodeId: this.nodeId,
    });

    try {
      const {columns, placeholders, values} = this.buildInsertParts(rowData);
      const sql = `${SQL.INSERT_INTO} ${tableName} (${columns}) ` +
        `${SQL.VALUES} (${placeholders})`;

      const sqlStartMs = Date.now();
      const result = await this.executeSQL(sql, values);
      const sqlDurationMs = Date.now() - sqlStartMs;

      if (!result.success) {
        throw new Error(result.error || CDC_ERROR_MSG.INSERT_FAILED);
      }

      const pkField = this.getPrimaryKeyField(tableName);
      const pkValue = rowData[pkField];
      const cacheWaitStartMs = Date.now();
      if (pkValue) {
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
        this.logger.error(CDC_LOG_MSG.INSERT_FAILED, {
          tableName,
          id: trackingId,
          error: error.message,
          nodeId: this.nodeId,
        });
      }

      this.emitErrorEvent({
        operation: CDCOperationType.INSERT,
        tableName,
        data: rowData,
        error: error.message,
      });

      throw error;
    }
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
  async updateSystemTableRow(tableName, whereClause, data) {
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

    this.logger.debug(CDC_LOG_MSG.UPDATING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    try {
      const {setClause, values: setValues} = this.buildUpdateParts(updateData);
      const {whereStr, values: whereValues} = this.buildWhereParts(whereClause);
      const sql = `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ` +
        `${SQL.WHERE} ${whereStr}`;

      const sqlStartMs = Date.now();
      const result = await this.executeSQL(sql, [...setValues, ...whereValues]);
      const sqlDurationMs = Date.now() - sqlStartMs;

      if (!result.success) {
        throw new Error(result.error || CDC_ERROR_MSG.UPDATE_FAILED);
      }

      const cacheWaitStartMs = Date.now();
      if (typeof result.affectedRows !== TYPEOF.NUMBER ||
        result.affectedRows > NUM.ZERO) {
        await this.waitForCacheUpdate(tableName, id, true);
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
        this.logger.error(CDC_LOG_MSG.UPDATE_FAILED, {
          tableName,
          id,
          error: error.message,
          nodeId: this.nodeId,
        });
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
  }

  /**
   * Delete a row from a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @return {Promise<Object>} Delete result.
   */
  async deleteSystemTableRow(tableName, whereClause) {
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

    this.logger.debug(CDC_LOG_MSG.DELETING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    try {
      const {whereStr, values} = this.buildWhereParts(whereClause);
      const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereStr}`;

      const result = await this.executeSQL(sql, values);

      if (!result.success) {
        throw new Error(result.error || CDC_ERROR_MSG.DELETE_FAILED);
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
        this.logger.error(CDC_LOG_MSG.DELETE_FAILED, {
          tableName,
          id,
          error: error.message,
          nodeId: this.nodeId,
        });
      }

      this.emitErrorEvent({
        operation: CDCOperationType.DELETE,
        tableName,
        whereClause,
        error: error.message,
      });

      throw error;
    }
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
  async upsertSystemTableRow(tableName, data) {
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

    this.logger.debug(CDC_LOG_MSG.UPSERTING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    try {
      const {columns, placeholders, values} = this.buildInsertParts(upsertData);
      // SQLite INSERT OR REPLACE
      const sql = `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columns}) ` +
        `${SQL.VALUES} (${placeholders})`;

      const result = await this.executeSQL(sql, values);

      if (!result.success) {
        throw new Error(result.error || CDC_ERROR_MSG.UPSERT_FAILED);
      }

      await this.waitForCacheUpdate(tableName, id, true);

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
        this.logger.error(CDC_LOG_MSG.UPSERT_FAILED, {
          tableName,
          id,
          error: error.message,
          nodeId: this.nodeId,
        });
      }

      this.emitErrorEvent({
        operation: CDCOperationType.UPSERT,
        tableName,
        data: upsertData,
        error: error.message,
      });

      throw error;
    }
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
    if (tableName !== SystemTableName.NODES) {
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
        error: 'Not an INSERT operation',
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
        reason: 'self',
      };
    }

    // Skip if no message router is set
    if (!this.messageRouter) {
      return {
        processed: false,
        error: 'Message router not set',
      };
    }

    // Skip if already connected
    if (this.messageRouter.nodeConnections?.has(targetNodeId)) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return {
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: 'already_connected',
      };
    }

    // Check if we have a node address to connect to
    if (!nodeAddress) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_MISSING_ADDRESS, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: 'Missing node_address',
      };
    }

    // Derive WebSocket address from node address
    const wsAddress = this.deriveWsAddressFromNodeAddress(nodeAddress);
    if (!wsAddress) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        nodeAddress,
        error: 'Could not derive WebSocket address',
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: 'Could not derive WebSocket address',
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
