/**
 * Table Creation Service - Handles CREATE TABLE with automatic partition key.
 * Implements automatic partition key from PRIMARY KEY and partition transparency.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, STATE, TABLES} from '../constants/index.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
} from './query-constants.js';
import {defineTableCreationCreateTableMethod} from './table-creation-service-create-table.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  TABLE_CREATION_SQL,
  normalizeProvisioningSummary,
} from './table-creation-service-completion.js';


/**
 * TableCreationService handles table creation with automatic partition key
 * derivation from PRIMARY KEY and ensures partition transparency.
 */
class TableCreationServicePart1 {
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
      typeof options.calculateQuorumReplicaCount ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION ?
        options.calculateQuorumReplicaCount :
        null;
    this.partitionProvisioner =
      typeof options.partitionProvisioner ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION ?
        options.partitionProvisioner :
        null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || NUM.THREE;
    this.logger = this.initLogger();
    this.setSystemCache(options.systemCache || null);
    this.setPartitionSplitMergeManager(
      options.partitionSplitMergeManager || null,
    );
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
        return loggingService.forSubsystem(
          QUERY_SUBSYSTEM.TABLE_CREATION_SERVICE,
        );
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
    this.controlPlaneSystemTableGateway =
      controlPlaneSystemTableGateway || null;
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
    if (
      !cache ||
      typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION ||
      typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION ||
      !manager ||
      (typeof manager.evaluateAllPartitions !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION &&
        typeof manager.requestEvaluation !==
          TABLE_CREATION_SERVICE_LITERAL.FUNCTION)
    ) {
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
    if (
      cache &&
      typeof cache.offCacheChange === TABLE_CREATION_SERVICE_LITERAL.FUNCTION &&
      this.cachePolicyChangeListener
    ) {
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
    return typeof tableId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
      tableId.length > NUM.ZERO ?
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
    if (typeof value === TABLE_CREATION_SERVICE_LITERAL.STRING) {
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
    return typeof partitionId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
      partitionId.length > NUM.ZERO ?
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
    return Number.isFinite(sizeBytes) && sizeBytes >= NUM.ZERO ?
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
    if (
      operation !== TABLE_CREATION_SERVICE_LITERAL.UPDATE &&
      operation !== TABLE_CREATION_SERVICE_LITERAL.INSERT
    ) {
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
      reasonCode: TABLE_CREATION_SERVICE_LITERAL.TABLE_POLICY_CHANGED,
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
      reasonCode: TABLE_CREATION_SERVICE_LITERAL.PARTITION_SIZE_CHANGED,
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
    if (
      typeof manager.requestEvaluation ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
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
    this.partitionProvisioner =
      typeof provisioner === TABLE_CREATION_SERVICE_LITERAL.FUNCTION ?
        provisioner :
        null;
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
   * @return {Promise<Object|null>}
   * @private
   */
  async provisionInitialPartition(context) {
    const minimumRoutableReplicaCountWasDefaulted =
      !(
        Number.isInteger(context?.minimumRoutableReplicaCount) &&
        context.minimumRoutableReplicaCount > 0
      );
    const minimumRoutableReplicaCount =
      minimumRoutableReplicaCountWasDefaulted === false ?
        context.minimumRoutableReplicaCount :
        this.resolveDefaultMinimumRoutableReplicaCount(context?.replicaCount);
    if (
      typeof this.partitionProvisioner !==
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return normalizeProvisioningSummary(null, {
        ...context,
        minimumRoutableReplicaCount,
      });
    }
    const {tableId, tableName, partitionId, replicaCount} = context;
    this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
      tableId,
      tableName,
      partitionId,
      replicaCount,
    });
    try {
      const provisioningResult = await this.partitionProvisioner({
        ...context,
        minimumRoutableReplicaCount,
        minimumRoutableReplicaCountWasDefaulted,
      });
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_SUCCESS, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
      });
      return normalizeProvisioningSummary(provisioningResult, {
        ...context,
        minimumRoutableReplicaCount,
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
    const normalizedReplicaCount =
      Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : null;
    if (!normalizedReplicaCount) {
      return null;
    }
    const minimumRoutableReplicaCount =
      typeof this.calculateQuorumReplicaCount === 'function' ?
        this.calculateQuorumReplicaCount(normalizedReplicaCount) :
        Math.floor(normalizedReplicaCount / 2) + 1;
    return Number.isInteger(minimumRoutableReplicaCount) &&
      minimumRoutableReplicaCount > NUM.ZERO ?
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
    if (
      !manager ||
      typeof manager.evaluateAllPartitions !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
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
    if (
      !manager ||
      typeof manager.startPeriodicEvaluation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
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
    if (
      !manager ||
      typeof manager.stopPeriodicEvaluation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
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
  buildInitialPartitionMetadataFromTableRecord(
    tableId,
    tableName,
    existingTableRecord = null,
  ) {
    const partitionVersion = Number(
      existingTableRecord?.active_partition_version ??
        existingTableRecord?.activePartitionVersion ??
        1,
    );
    return {
      partition_id: `${tableId}-p1`,
      table_id: tableId,
      table_name:
        existingTableRecord?.table_name ||
        existingTableRecord?.tableName ||
        tableName,
      partition_key_start: null,
      partition_key_end: null,
      partition_version:
        Number.isInteger(partitionVersion) && partitionVersion > NUM.ZERO ?
          partitionVersion :
          NUM.ONE,
      replica_count: this.defaultReplicaCount,
      size_bytes: NUM.ZERO,
      leader_node_id: null,
      state: STATE.NORMAL,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }

  /**
   * Derive partition key from PRIMARY KEY columns.
   * Requirement 20.1: Automatically use PRIMARY KEY as partition key.
   * @param {Array<string>} primaryKey - PRIMARY KEY column names.
   * @return {string} Partition key (comma-separated for composite keys).
   * @private
   */
  derivePartitionKey(primaryKey) {
    if (!primaryKey || primaryKey.length === NUM.ZERO) {
      throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
    }

    // For composite PRIMARY KEY, use all columns as partition key
    return primaryKey.join(TABLE_CREATION_SERVICE_LITERAL.EMPTY);
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
      INT: 'INTEGER',
      BIGINT: 'INTEGER',
      SMALLINT: 'INTEGER',
      TINYINT: 'INTEGER',
      VARCHAR: 'TEXT',
      CHAR: 'TEXT',
      NVARCHAR: 'TEXT',
      NCHAR: 'TEXT',
      CLOB: 'TEXT',
      FLOAT: 'REAL',
      DOUBLE: 'REAL',
      DECIMAL: 'REAL',
      NUMERIC: 'REAL',
      BOOLEAN: 'INTEGER',
      BOOL: 'INTEGER',
      DATETIME: 'TEXT',
      TIMESTAMP: 'TEXT',
      DATE: 'TEXT',
      TIME: 'TEXT',
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
    if (
      !controlPlaneGateway ||
      typeof controlPlaneGateway.readRows !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return null;
    }
    try {
      const result = await controlPlaneGateway.readRows(
        TABLES.TABLES,
        TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME,
        [tableName],
        {
          readProfile: 'table_lifecycle',
        },
      );
      return Array.isArray(result?.rows) && result.rows.length > NUM.ZERO ?
        result.rows[NUM.ZERO] :
        null;
    } catch {
      return null;
    }
  }
}
defineTableCreationCreateTableMethod(TableCreationServicePart1);

export {TableCreationServicePart1};
