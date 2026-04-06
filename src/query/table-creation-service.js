/**
 * Table Creation Service - Handles CREATE TABLE with automatic partition key.
 * Implements automatic partition key from PRIMARY KEY and partition transparency.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, STATE, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  createControlPlaneRuntimeBundle,
} from '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

const TABLE_CREATION_SQL = Object.freeze({
  SELECT_TABLE_BY_NAME:
    `SELECT * FROM ${TABLES.TABLES} WHERE table_name = ? LIMIT 1`,
  SELECT_PARTITION_BY_ID:
    `SELECT * FROM ${TABLES.PARTITIONS} WHERE partition_id = ? LIMIT 1`,
});

/**
 * TableCreationService handles table creation with automatic partition key
 * derivation from PRIMARY KEY and ensures partition transparency.
 */
class TableCreationService {
  /**
   * Create a new TableCreationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Function} options.partitionProvisioner - Initial partition
   *   provisioning callback.
   */
  constructor(options = {}) {
    this.systemCache = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemCache,
      }).controlPlaneSystemTableGateway;
    this.partitionSplitMergeManager = null;
    this.tablePolicyByTableId = new Map();
    this.partitionSizeByPartitionId = new Map();
    this.cachePolicyChangeListener = null;
    this.calculateQuorumReplicaCount =
      typeof options.calculateQuorumReplicaCount === 'function' ?
        options.calculateQuorumReplicaCount :
        null;
    this.partitionProvisioner =
      typeof options.partitionProvisioner === 'function' ?
        options.partitionProvisioner :
        null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || NUM.THREE;

    this.logger = this.initLogger();
    this.setSystemCache(options.systemCache || null);
    this.setPartitionSplitMergeManager(options.partitionSplitMergeManager || null);
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.TABLE_CREATION_SERVICE);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (this.systemCache === cache) {
      return;
    }
    this.detachCachePolicyListener();
    this.systemCache = cache || null;
    this.attachCachePolicyListener();
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }

  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    this.controlPlaneSystemTableGateway = controlPlaneSystemTableGateway || null;
  }

  /**
   * Set partition split/merge manager integration hook.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    if (this.partitionSplitMergeManager === manager) {
      return;
    }
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
    this.partitionSplitMergeManager = manager || null;
    this.startPeriodicSplitMergeEvaluation();
    this.attachCachePolicyListener();
  }

  /**
   * Attach cache listener that triggers split/merge evaluation when table
   * policy values change.
   * @private
   */
  attachCachePolicyListener() {
    const cache = this.systemCache;
    const manager = this.partitionSplitMergeManager;
    if (!cache ||
        typeof cache.onCacheChange !== 'function' ||
        typeof cache.getAll !== 'function' ||
        !manager ||
        typeof manager.evaluateAllPartitions !== 'function' &&
        typeof manager.requestEvaluation !== 'function') {
      this.tablePolicyByTableId.clear();
      this.partitionSizeByPartitionId.clear();
      return;
    }

    this.seedTablePolicyCache(cache);
    this.seedPartitionMetricsCache(cache);
    this.cachePolicyChangeListener = (tableName, operation, record) => {
      this.onSystemTableCacheChange(tableName, operation, record);
    };
    cache.onCacheChange(this.cachePolicyChangeListener);
  }

  /**
   * Detach previously registered cache policy listener.
   * @private
   */
  detachCachePolicyListener() {
    const cache = this.systemCache;
    if (cache &&
        typeof cache.offCacheChange === 'function' &&
        this.cachePolicyChangeListener) {
      cache.offCacheChange(this.cachePolicyChangeListener);
    }
    this.cachePolicyChangeListener = null;
    this.tablePolicyByTableId.clear();
    this.partitionSizeByPartitionId.clear();
  }

  /**
   * Seed known table policy values from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedTablePolicyCache(cache) {
    this.tablePolicyByTableId.clear();
    const tableRows = cache.getAll(TABLES.TABLES);
    if (!Array.isArray(tableRows)) {
      return;
    }
    for (const row of tableRows) {
      const tableId = this.resolveTableId(row);
      const policyValue = this.resolveTablePolicyValue(row);
      if (!tableId || policyValue === null) {
        continue;
      }
      this.tablePolicyByTableId.set(tableId, policyValue);
    }
  }

  /**
   * Seed known partition sizes from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedPartitionMetricsCache(cache) {
    this.partitionSizeByPartitionId.clear();
    const partitionRows = cache.getAll(TABLES.PARTITIONS);
    if (!Array.isArray(partitionRows)) {
      return;
    }
    for (const row of partitionRows) {
      const partitionId = this.resolvePartitionId(row);
      const partitionSize = this.resolvePartitionSizeValue(row);
      if (!partitionId || partitionSize === null) {
        continue;
      }
      this.partitionSizeByPartitionId.set(partitionId, partitionSize);
    }
  }

  /**
   * Resolve canonical table ID from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolveTableId(row) {
    const tableId = row?.table_id ?? row?.tableId ?? null;
    return typeof tableId === 'string' && tableId.length > 0 ?
      tableId :
      null;
  }

  /**
   * Resolve normalized table policy value from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolveTablePolicyValue(row) {
    const value = row?.table_policies ?? row?.tablePolicies ?? null;
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  /**
   * Resolve canonical partition ID from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolvePartitionId(row) {
    const partitionId = row?.partition_id ?? row?.partitionId ?? null;
    return typeof partitionId === 'string' && partitionId.length > 0 ?
      partitionId :
      null;
  }

  /**
   * Resolve normalized partition size from a row.
   * @param {Object} row
   * @return {number|null}
   * @private
   */
  resolvePartitionSizeValue(row) {
    const sizeBytes = Number(row?.size_bytes ?? row?.sizeBytes);
    return Number.isFinite(sizeBytes) && sizeBytes >= 0 ?
      sizeBytes :
      null;
  }

  /**
   * Handle system cache change notifications.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  onSystemTableCacheChange(tableName, operation, record) {
    if (operation !== 'UPDATE' && operation !== 'INSERT') {
      return;
    }

    if (tableName === TABLES.TABLES) {
      this.handleTablePolicyCacheChange(operation, record);
      return;
    }

    if (tableName === TABLES.PARTITIONS) {
      this.handlePartitionMetricsCacheChange(operation, record);
    }
  }

  /**
   * Handle split/merge trigger decisions for table policy cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handleTablePolicyCacheChange(operation, record) {
    const tableId = this.resolveTableId(record);
    const policyValue = this.resolveTablePolicyValue(record);
    if (!tableId || policyValue === null) {
      return;
    }

    const previousPolicyValue = this.tablePolicyByTableId.get(tableId);
    this.tablePolicyByTableId.set(tableId, policyValue);
    if (previousPolicyValue === policyValue) {
      return;
    }

    this.logger.debug(QUERY_LOG_MSG.TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL, {
      tableId,
      operation,
    });
    this.requestSplitMergeEvaluation({
      reasonCode: 'table_policy_changed',
    });
  }

  /**
   * Handle split/merge trigger decisions for partition size cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handlePartitionMetricsCacheChange(operation, record) {
    const partitionId = this.resolvePartitionId(record);
    const partitionSize = this.resolvePartitionSizeValue(record);
    if (!partitionId || partitionSize === null) {
      return;
    }

    const previousPartitionSize =
      this.partitionSizeByPartitionId.get(partitionId);
    this.partitionSizeByPartitionId.set(partitionId, partitionSize);
    if (previousPartitionSize === partitionSize) {
      return;
    }

    this.logger.debug(
      QUERY_LOG_MSG.TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL,
      {
        partitionId,
        operation,
        previousPartitionSize,
        partitionSize,
      },
    );
    this.requestSplitMergeEvaluation({
      reasonCode: 'partition_size_changed',
      partitionId,
    });
  }

  /**
   * Request split/merge evaluation through the manager's canonical trigger path.
   * Falls back to direct evaluation when the manager does not expose the
   * coalesced request API yet.
   * @param {Object} [context]
   * @private
   */
  requestSplitMergeEvaluation(context = {}) {
    const manager = this.partitionSplitMergeManager;
    if (!manager) {
      return;
    }
    if (typeof manager.requestEvaluation === 'function') {
      manager.requestEvaluation(context);
      return;
    }
    void this.evaluateSplitMergeLifecycle();
  }

  /**
   * Set initial table partition provisioning callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setPartitionProvisioner(provisioner) {
    this.partitionProvisioner = typeof provisioner === 'function' ?
      provisioner :
      null;
  }

  /**
   * Create a table from a parsed CREATE TABLE AST.
   * Automatically uses PRIMARY KEY as partition key.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Promise<Object>} Creation result.
   */
  async createTable(ast) {
    const {tableName, columns, primaryKey, ifNotExists} = ast;

    this.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, {
      tableName,
      columnCount: columns.length,
      primaryKey,
      ifNotExists,
    });

    // Validate PRIMARY KEY requirement (Requirement 20.2)
    if (!primaryKey || primaryKey.length === 0) {
      const error = new Error(
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX}. ` +
        QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL,
      );
      error.code = QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED;
      throw error;
    }

    // Check if table already exists
    const existingTable = await this.findExistingTableRecord(tableName);
    if (existingTable) {
      if (ifNotExists) {
        await this.reconcileExistingInitialPartition(tableName, existingTable);
        this.logger.debug(QUERY_LOG_MSG.TABLE_EXISTS_SKIP, {tableName});
        return {
          success: true,
          operation: QUERY_OPERATION.CREATE_TABLE,
          tableName,
          skipped: true,
          message: `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
            QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
        };
      }
      const error = new Error(
        `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
        QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
      );
      error.code = QUERY_ERROR_CODE.TABLE_EXISTS;
      throw error;
    }

    // Derive partition key from PRIMARY KEY (Requirement 20.1)
    const partitionKey = this.derivePartitionKey(primaryKey);

    // Generate table ID
    const tableId = `tbl-${uuidv4()}`;

    // Build schema definition
    const schemaDefinition = this.buildSchemaDefinition(columns);

    // Create table metadata
    const tableMetadata = {
      table_id: tableId,
      table_name: tableName,
      schema_definition: JSON.stringify(schemaDefinition),
      partition_key: partitionKey,
      table_policies: JSON.stringify({}),
      partition_count: 1,
      active_partition_version: 1,
      pending_partition_version: null,
      partition_transition_state: null,
      partition_transition_metadata: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Create initial partition with full key range [NULL, NULL) (Requirement 20.3)
    const partitionId = `${tableId}-p1`;
    const partitionMetadata = {
      partition_id: partitionId,
      table_id: tableId,
      table_name: tableName,
      partition_key_start: null, // NULL means unbounded lower
      partition_key_end: null, // NULL means unbounded upper
      partition_version: 1,
      replica_count: this.defaultReplicaCount,
      size_bytes: 0,
      leader_node_id: null,
      state: STATE.NORMAL,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Write to system tables via CDC
    if (this.cdcIntegrationService) {
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.TABLES,
        row: tableMetadata,
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: 'critical',
      });
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.PARTITIONS,
        row: partitionMetadata,
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: 'critical',
      });
    }

    await this.provisionInitialPartition({
      tableId,
      tableName,
      tableMetadata,
      partitionId,
      partitionMetadata,
      replicaCount: partitionMetadata.replica_count,
    });

    await this.evaluateSplitMergeLifecycle();

    this.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, {
      tableId,
      tableName,
      partitionKey,
      partitionId,
    });

    return {
      success: true,
      operation: QUERY_OPERATION.CREATE_TABLE,
      tableId,
      tableName,
      partitionKey,
      partitionId,
      columns: columns.length,
    };
  }

  /**
   * Provision initial partition replica(s) for a newly-created table.
   * @param {Object} context - Provisioning context.
   * @param {string} context.tableId - Table ID.
   * @param {string} context.tableName - Table name.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Initial partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} context.replicaCount - Desired replica count.
   * @return {Promise<void>}
   * @private
   */
  async provisionInitialPartition(context) {
    if (typeof this.partitionProvisioner !== 'function') {
      return;
    }

    const {tableId, tableName, partitionId, replicaCount} = context;
    const minimumRoutableReplicaCount =
      Number.isInteger(context?.minimumRoutableReplicaCount) &&
        context.minimumRoutableReplicaCount > 0 ?
        context.minimumRoutableReplicaCount :
        this.resolveDefaultMinimumRoutableReplicaCount(replicaCount);
    this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
      tableId,
      tableName,
      partitionId,
      replicaCount,
    });

    try {
      await this.partitionProvisioner({
        ...context,
        minimumRoutableReplicaCount,
      });
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_SUCCESS, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
      });
    } catch (error) {
      this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_FAILED, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
        error: error.message,
      });
      if (!error.code) {
        error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
      }
      throw error;
    }
  }

  /**
   * Resolve the default minimum routable cohort for CREATE TABLE partition
   * provisioning. CREATE TABLE only needs a writable quorum before the
   * statement can return; remaining replicas may continue converging.
   * @param {number} replicaCount
   * @return {number|null}
   * @private
   */
  resolveDefaultMinimumRoutableReplicaCount(replicaCount) {
    if (typeof this.calculateQuorumReplicaCount !== 'function') {
      return null;
    }
    const minimumRoutableReplicaCount =
      this.calculateQuorumReplicaCount(replicaCount);
    return Number.isInteger(minimumRoutableReplicaCount) &&
      minimumRoutableReplicaCount > 0 ?
      minimumRoutableReplicaCount :
      null;
  }

  /**
   * Trigger policy-driven split/merge evaluation after table lifecycle changes.
   * @return {Promise<void>}
   * @private
   */
  async evaluateSplitMergeLifecycle() {
    const manager = this.partitionSplitMergeManager;
    if (!manager || typeof manager.evaluateAllPartitions !== 'function') {
      return;
    }

    try {
      await manager.evaluateAllPartitions();
    } catch (error) {
      this.logger.warn(QUERY_LOG_MSG.TABLE_SPLIT_MERGE_EVAL_FAILED, {
        splitMergeEvaluationError: error.message,
      });
    }
  }

  /**
   * Start periodic split/merge evaluation when supported by the manager.
   * @private
   */
  startPeriodicSplitMergeEvaluation() {
    const manager = this.partitionSplitMergeManager;
    if (!manager || typeof manager.startPeriodicEvaluation !== 'function') {
      return;
    }
    manager.startPeriodicEvaluation();
  }

  /**
   * Stop periodic split/merge evaluation when supported by the manager.
   * @private
   */
  stopPeriodicSplitMergeEvaluation() {
    const manager = this.partitionSplitMergeManager;
    if (!manager || typeof manager.stopPeriodicEvaluation !== 'function') {
      return;
    }
    manager.stopPeriodicEvaluation();
  }

  /**
   * Shutdown lifecycle-owned resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Derive partition key from PRIMARY KEY columns.
   * Requirement 20.1: Automatically use PRIMARY KEY as partition key.
   * @param {Array<string>} primaryKey - PRIMARY KEY column names.
   * @return {string} Partition key (comma-separated for composite keys).
   * @private
   */
  derivePartitionKey(primaryKey) {
    if (!primaryKey || primaryKey.length === 0) {
      throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
    }

    // For composite PRIMARY KEY, use all columns as partition key
    return primaryKey.join(',');
  }

  /**
   * Build schema definition from column AST.
   * @param {Array<Object>} columns - Column definitions from AST.
   * @return {Object} Schema definition.
   * @private
   */
  buildSchemaDefinition(columns) {
    return {
      columns: columns.map((col) => ({
        name: col.name,
        type: this.normalizeDataType(col.dataType),
        primaryKey: col.primaryKey || false,
        notNull: col.notNull || false,
        unique: col.unique || false,
        defaultValue: col.defaultValue?.value,
      })),
    };
  }

  /**
   * Normalize data type to SQLite-compatible type.
   * @param {Object} dataType - Data type AST.
   * @return {string} Normalized type name.
   * @private
   */
  normalizeDataType(dataType) {
    const typeName = dataType.name.toUpperCase();

    // Map common SQL types to SQLite types
    const typeMap = {
      'INT': 'INTEGER',
      'BIGINT': 'INTEGER',
      'SMALLINT': 'INTEGER',
      'TINYINT': 'INTEGER',
      'VARCHAR': 'TEXT',
      'CHAR': 'TEXT',
      'NVARCHAR': 'TEXT',
      'NCHAR': 'TEXT',
      'CLOB': 'TEXT',
      'FLOAT': 'REAL',
      'DOUBLE': 'REAL',
      'DECIMAL': 'REAL',
      'NUMERIC': 'REAL',
      'BOOLEAN': 'INTEGER',
      'BOOL': 'INTEGER',
      'DATETIME': 'TEXT',
      'TIMESTAMP': 'TEXT',
      'DATE': 'TEXT',
      'TIME': 'TEXT',
    };

    return typeMap[typeName] || typeName;
  }

  /**
   * Check if a table exists.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   * @private
   */
  tableExists(tableName) {
    return this.getTableRecord(tableName) !== null;
  }

  /**
   * Resolve one table metadata row, preferring cache and falling back to an
   * authoritative control-plane read when cache visibility lags.
   * @param {string} tableName
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingTableRecord(tableName) {
    const cachedTable = this.getTableRecord(tableName);
    if (cachedTable) {
      return cachedTable;
    }

    const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
    if (!controlPlaneGateway || typeof controlPlaneGateway.readRows !== 'function') {
      return null;
    }

    try {
      const result = await controlPlaneGateway.readRows(
        TABLES.TABLES,
        TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME,
        [tableName],
        {
          requireAuthoritative: true,
          allowSqlFallback: true,
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: 'critical',
        },
      );
      return Array.isArray(result?.rows) && result.rows.length > 0 ?
        result.rows[0] :
        null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve one partition metadata row, preferring cache and falling back to
   * an authoritative control-plane read when cache visibility lags.
   * @param {string} partitionId
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingPartitionRecord(partitionId) {
    const cachedPartition = this.getPartitionRecord(partitionId);
    if (cachedPartition) {
      return cachedPartition;
    }

    const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
    if (!controlPlaneGateway || typeof controlPlaneGateway.readRows !== 'function') {
      return null;
    }

    try {
      const result = await controlPlaneGateway.readRows(
        TABLES.PARTITIONS,
        TABLE_CREATION_SQL.SELECT_PARTITION_BY_ID,
        [partitionId],
        {
          requireAuthoritative: true,
          allowSqlFallback: true,
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: 'critical',
        },
      );
      return Array.isArray(result?.rows) && result.rows.length > 0 ?
        result.rows[0] :
        null;
    } catch {
      return null;
    }
  }

  /**
   * Re-run initial partition provisioning for existing CREATE TABLE IF NOT EXISTS
   * retries when metadata was created before provisioning finished.
   * @param {string} tableName
   * @return {Promise<void>}
   * @private
   */
  async reconcileExistingInitialPartition(tableName, existingTable = null) {
    const existingTableRecord = existingTable ||
      await this.findExistingTableRecord(tableName);
    if (!existingTableRecord) {
      return;
    }

    const tableId = existingTableRecord.table_id ||
      existingTableRecord.tableId ||
      null;
    if (!tableId) {
      return;
    }
    const partitionId = `${tableId}-p1`;
    const existingPartition = await this.findExistingPartitionRecord(partitionId);
    if (!existingPartition) {
      return;
    }

    const replicaCount = Number(
      existingPartition.replica_count ?? existingPartition.replicaCount,
    );
    await this.provisionInitialPartition({
      tableId,
      tableName,
      tableMetadata: existingTableRecord,
      partitionId,
      partitionMetadata: existingPartition,
      replicaCount: Number.isInteger(replicaCount) && replicaCount > 0 ?
        replicaCount :
        this.defaultReplicaCount,
    });
  }

  /**
   * Resolve one table metadata row from cache.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  getTableRecord(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.find === 'function') {
        return this.systemCache.find(TABLES.TABLES, (table) =>
          table?.table_name === tableName || table?.tableName === tableName,
        ) || null;
      }
      if (typeof this.systemCache.getAll === 'function') {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return tables.find((table) =>
          table?.table_name === tableName || table?.tableName === tableName,
        ) || null;
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Resolve one partition metadata row from cache.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    if (!this.systemCache || !partitionId) {
      return null;
    }

    try {
      if (typeof this.systemCache.find === 'function') {
        return this.systemCache.find(TABLES.PARTITIONS, (partition) =>
          partition?.partition_id === partitionId ||
          partition?.partitionId === partitionId,
        ) || null;
      }
      if (typeof this.systemCache.getAll === 'function') {
        const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
        return partitions.find((partition) =>
          partition?.partition_id === partitionId ||
          partition?.partitionId === partitionId,
        ) || null;
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Validate that a table has a PRIMARY KEY.
   * Requirement 20.2: Require PRIMARY KEY for user tables.
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Object} Validation result.
   */
  validatePrimaryKey(ast) {
    const {tableName, columns, primaryKey} = ast;

    // Check for table-level PRIMARY KEY constraint
    if (primaryKey && primaryKey.length > 0) {
      return {
        valid: true,
        primaryKey,
        source: 'table_constraint',
      };
    }

    // Check for column-level PRIMARY KEY
    const pkColumns = columns.filter((col) => col.primaryKey);
    if (pkColumns.length > 0) {
      return {
        valid: true,
        primaryKey: pkColumns.map((col) => col.name),
        source: 'column_constraint',
      };
    }

    return {
      valid: false,
      error: `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
        QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX,
      code: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED,
    };
  }

  /**
   * Get partition key for a table.
   * @param {string} tableName - Table name.
   * @return {string|null} Partition key or null.
   */
  getPartitionKey(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.find === 'function') {
        const table = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        return table?.partition_key || table?.partitionKey || null;
      }
    } catch {
      // Cache not available
    }

    return null;
  }

  /**
   * Get table schema.
   * @param {string} tableName - Table name.
   * @return {Object|null} Schema definition or null.
   */
  getTableSchema(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.find === 'function') {
        const table = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        if (table?.schema_definition) {
          return JSON.parse(table.schema_definition);
        }
        if (table?.schemaDefinition) {
          return JSON.parse(table.schemaDefinition);
        }
      }
    } catch {
      // Cache not available or parse error
    }

    return null;
  }

  /**
   * Strip partition details from query results.
   * Requirement 20.10: Never expose partition details in query results.
   * Note: We keep high-level partition metadata (like which partitions were queried)
   * but strip internal partition details from individual rows.
   * @param {Object} result - Query result.
   * @return {Object} Result with internal partition details stripped.
   */
  stripPartitionDetails(result) {
    if (!result) {
      return result;
    }

    // Create a copy to avoid mutating the original
    const stripped = {...result};

    // Remove internal partition-related fields from top-level result
    // Keep 'partitions' array as it's useful metadata about which partitions were queried
    delete stripped.sourcePartition;
    delete stripped.partition_key_start;
    delete stripped.partition_key_end;

    // Strip internal partition details from rows if present
    if (Array.isArray(stripped.rows)) {
      stripped.rows = stripped.rows.map((row) => {
        const cleanRow = {...row};
        // Remove internal partition tracking fields
        delete cleanRow._partition_id;
        delete cleanRow._partitionId;
        delete cleanRow._sourcePartition;
        return cleanRow;
      });
    }

    return stripped;
  }

  /**
   * Check if a field name is a partition-related field.
   * @param {string} fieldName - Field name to check.
   * @return {boolean} True if partition-related.
   */
  isPartitionField(fieldName) {
    const partitionFields = new Set([
      'partition_id',
      'partitionId',
      '_partition_id',
      '_partitionId',
      'partition_key_start',
      'partition_key_end',
      'partitionKeyStart',
      'partitionKeyEnd',
      'sourcePartition',
    ]);

    return partitionFields.has(fieldName);
  }
}

export {TableCreationService};
