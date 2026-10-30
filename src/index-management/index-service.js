/**
 * Index Service - Manages database indices for query optimization.
 * Supports creating indices on table columns and storing metadata in indices system table.
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {STRING, TABLES} from '../constants/index.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  GLOBAL_INDEX_SQL_STATE,
  INDEX_CONFIG_KEY,
  INDEX_DEFAULTS,
  INDEX_ERROR_MSG,
  INDEX_LOG_MSG,
  INDEX_READABLE_STATE,
  INDEX_SUBSYSTEM,
  INDEX_TYPE,
} from './index-constants.js';
import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {indexServiceCdcHandler} from './index-service-cdc-handler.js';
import {indexServicePartitionMethods} from './index-service-partition-methods.js';
import {indexServiceGlobalMethods} from './index-service-global-methods.js';

const LOCAL_STR_CRITICAL = 'critical';

function resolvePartitionServiceInstance(service, partitionId) {
  if (!service) return null;
  if (typeof service.getPartition === 'function') {
    const p = service.getPartition(partitionId);
    if (p) return p;
  }
  if (service.partitionId === partitionId) {
    return service;
  }
  return null;
}

function resolveEnginePartitionInstance(engine, partitionId) {
  if (!engine) return null;
  if (typeof engine.partitionServicesProvider === 'function') {
    const provided = engine.partitionServicesProvider(partitionId);
    const p = (provided instanceof Map || typeof provided?.get === 'function') ?
      provided.get(partitionId) : provided;
    if (p) return p;
  }
  if (typeof engine.getPartitionService === 'function') {
    return engine.getPartitionService(partitionId);
  }
  return null;
}

function wrapPartitionInstance(instance, partitionRow) {
  if (!instance) return partitionRow;
  return Object.assign(Object.create(instance), partitionRow || {}, {
    executeQuery: (s, params) => instance.executeQuery(s, params),
  });
}

function resolveOptionIndexName(options) {
  const raw = options.indexName || options.name || null;
  if (typeof raw === 'object' && raw !== null) {
    return raw.name || String(raw);
  }
  return raw;
}

function resolveOptionTableName(options) {
  if (options.tableName) {
    return options.tableName;
  }
  if (!options.table) {
    return null;
  }
  if (typeof options.table === 'string') {
    return options.table;
  }
  return options.table.table || options.table.name || null;
}

/**
 * Index types supported by the system.
 */
const IndexType = INDEX_TYPE;

/**
 * IndexService manages database indices for query optimization.
 * Indices are stored in the indices system table and maintained
 * automatically when data changes occur.
 */
class IndexService {
  /**
   * Create a new IndexService.
   * @param {Object} options - Configuration options.
   * @param {Object} [options.cdcIntegrationService] - CDC integration service for writes.
   * @param {Object} [options.systemTableCache] - Read-only system table cache.
   * @param {Object} [options.sqlQueryEngine] - SQL query engine.
   * @param {Object} [options.partitionService] - Partition service or provider.
   * @param {Object} [options.controlPlaneSystemTableGateway] - Metadata gateway.
   */
  constructor(options = {}) {
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.partitionService = options.partitionService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.requirePartitionMaterialization =
      Boolean(options.requirePartitionMaterialization);
    this.globalIndexCoordinator = options.globalIndexCoordinator || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultIndexType = config.get(INDEX_CONFIG_KEY.DEFAULT_TYPE) ||
      INDEX_DEFAULTS.DEFAULT_TYPE;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(INDEX_SUBSYSTEM.INDEX_SERVICE) : console;

    // Track indices by table for quick lookup
    this.indexCache = new Map(); // tableId -> Map(indexName -> indexMetadata)
    this.indices = new Map(); // indexName -> indexMetadata

    this.initialized = false;
  }

  /**
   * Initialize the index service.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZING);
    await this.loadIndicesFromCache();
    this.initialized = true;
    this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZED, {
      indexCount: this.getTotalIndexCount(),
    });
  }

  /**
   * Load indices from system table cache.
   * @return {Promise<void>}
   * @private
   */
  async loadIndicesFromCache() {
    try {
      let indices = [];
      if (this.canReadMetadata()) {
        const result = await this.getControlPlaneSystemTableGateway().readRows(
          TABLES.INDICES,
          'SELECT * FROM indices',
          [],
        );
        indices = result.rows || [];
      }

      for (const index of indices) {
        const tableId = index.table_id;
        if (!this.indexCache.has(tableId)) {
          this.indexCache.set(tableId, new Map());
        }

        const indexMetadata = {
          indexId: index.index_id,
          tableId: index.table_id,
          tableName: index.table_name || null,
          indexName: index.index_name,
          columnNames: JSON.parse(
            index.column_names || STRING.EMPTY_JSON_ARRAY,
          ),
          indexType: index.index_type || INDEX_TYPE.BTREE,
          unique: Boolean(index.unique || index.is_unique),
          state: index.state || INDEX_READABLE_STATE.READY,
          createdAt: index.created_at,
        };

        this.indexCache.get(tableId).set(
          index.index_name, indexMetadata,
        );
        this.indices.set(index.index_name, indexMetadata);
      }

      this.logger.debug(INDEX_LOG_MSG.INDICES_LOADED, {
        indexCount: this.getTotalIndexCount(),
      });
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.INDICES_LOAD_FAILED, {
        error: error.message,
      });
      throw error;
    }
  }

  resolveTableIdFromEngine(tableName) {
    const info = this.sqlQueryEngine?.getTableInfo?.(tableName);
    return info?.table_id || info?.tableId || null;
  }

  resolveTableIdFromCache(tableName) {
    const table = this.systemTableCache?.get?.(TABLES.TABLES, tableName);
    return table?.table_id || table?.tableId || null;
  }

  _hasEngineTableInfo(name) {
    if (typeof this.sqlQueryEngine?.getTableInfo === 'function') {
      return Boolean(this.sqlQueryEngine.getTableInfo(name));
    }
    return false;
  }

  _hasCachedTableConfig(name) {
    if (typeof this.systemTableCache?.get === 'function') {
      return Boolean(this.systemTableCache.get(TABLES.TABLES, name));
    }
    return false;
  }

  /**
   * Check whether a table is formally configured in engine or system cache.
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists in engine or system cache.
   */
  isRealTableConfigured(tableId, tableName) {
    const name = tableName || tableId;
    return this._hasEngineTableInfo(name) || this._hasCachedTableConfig(name);
  }

  /**
   * Resolve table ID for a given table name.
   * @param {string} tableName - Table name.
   * @return {Promise<string>} Resolved table ID.
   */
  async getTableIdForTableName(tableName) {
    if (!tableName) return null;
    const engineId = this.resolveTableIdFromEngine(tableName);
    if (engineId) return engineId;
    const cacheId = this.resolveTableIdFromCache(tableName);
    if (cacheId) return cacheId;

    if (this.canReadMetadata()) {
      try {
        const result = await this.getControlPlaneSystemTableGateway().readRows(
          TABLES.TABLES,
          'SELECT * FROM tables WHERE table_name = ?',
          [tableName],
        );
        if (result.rows?.[0]?.table_id) {
          return result.rows[0].table_id;
        }
      } catch (err) {
        this.logger.debug(INDEX_LOG_MSG.RESOLVE_TABLE_ID_FAILED, {
          tableName,
          error: err?.message,
        });
      }
    }
    return tableName;
  }

  /**
   * Validate local unique index safety on multi-partition tables.
   * @param {Object} options - Validation options.
   * @private
   */
  async validateIndexCreation(options) {
    const {tableId, tableName, columnNames, unique} = options;
    if (!unique) return;

    const partitions = await this.getPartitionsForTable(tableId);
    if (partitions.length > 1) {
      let partitionKey = null;
      if (this.sqlQueryEngine && typeof this.sqlQueryEngine.getTableInfo === 'function') {
        const tableInfo = this.sqlQueryEngine.getTableInfo(tableName || tableId);
        partitionKey = tableInfo?.partition_key || tableInfo?.partitionKey;
      }
      if (partitionKey && !columnNames.includes(partitionKey)) {
        const error = new Error(
          `Unique index on partitioned table must include partition key '${partitionKey}'`,
        );
        error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
        error.sqlState = GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED;
        throw error;
      }
    }
  }

  async normalizeCreateIndexOptions(options) {
    let tableId = options.tableId || options.table_id || null;
    let tableName = resolveOptionTableName(options);
    const indexName = resolveOptionIndexName(options);
    const columnNames = options.columnNames || options.columns || null;
    const indexType = options.indexType || this.defaultIndexType;
    const unique = Boolean(options.unique);
    const ifNotExists = Boolean(options.ifNotExists || options.if_not_exists);

    if (!tableId && tableName) {
      tableId = await this.getTableIdForTableName(tableName);
    }
    if (!tableName && tableId) {
      tableName = tableId;
    }
    return {tableId, tableName, indexName, columnNames, indexType, unique, ifNotExists};
  }

  assertCreateIndexParamsValid(tableId, indexName, columnNames) {
    if (!tableId) {
      throw new Error(INDEX_ERROR_MSG.TABLE_ID_REQUIRED);
    }
    if (!indexName) {
      throw new Error(INDEX_ERROR_MSG.INDEX_NAME_REQUIRED);
    }
    if (!columnNames || columnNames.length === 0) {
      throw new Error(INDEX_ERROR_MSG.COLUMN_NAMES_REQUIRED);
    }
  }

  canWriteSystemTable() {
    return Boolean(
      this.controlPlaneSystemTableGateway?.resolveCdcIntegrationService?.() ||
      this.cdcIntegrationService,
    );
  }

  async persistIndexMetadata(metadata) {
    if (!this.canWriteSystemTable()) {
      return;
    }
    const {indexId, tableId, indexName, columnNames, indexType, unique, createdAt} = metadata;
    const gateway = this.getControlPlaneSystemTableGateway();
    if (gateway) {
      await gateway.insertSystemTableRow(
        TABLES.INDICES,
        {
          index_id: indexId,
          table_id: tableId,
          table_name: metadata.tableName || null,
          index_name: indexName,
          column_names: JSON.stringify(columnNames),
          index_type: indexType,
          is_unique: unique ? 1 : 0,
          unique: unique ? 1 : 0,
          state: metadata.state || INDEX_READABLE_STATE.READY,
          created_at: createdAt,
        },
        {
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: LOCAL_STR_CRITICAL,
        },
      );
    }
  }

  /**
   * Record created index into cache maps.
   * @param {Object} indexMetadata - Index metadata.
   * @private
   */
  _recordCreatedIndex(indexMetadata) {
    this._cacheIndexMetadata(indexMetadata);
  }

  /**
   * Create a new index on a table.
   * Requirements: 12.1, 12.2
   * @param {Object|string} sqlOrAst - Index creation options, AST, or DDL.
   * @param {Object} [options={}] - Additional options.
   * @return {Promise<Object>} Created index metadata.
   */
  async createIndex(sqlOrAst, options = {}) {
    if (this._isGlobalIndexCreation(sqlOrAst, options)) {
      return this._createGlobalIndexEntry(sqlOrAst, options);
    }
    const normalized = await this.normalizeCreateIndexOptions(sqlOrAst);
    const {tableId, tableName, indexName, columnNames, indexType, unique, ifNotExists} = normalized;

    this.assertCreateIndexParamsValid(tableId, indexName, columnNames);

    this.logger.info(INDEX_LOG_MSG.CREATING_INDEX, {
      tableId, tableName, indexName, columnNames, indexType, unique,
    });

    if (this.indexExists(tableId, indexName)) {
      if (ifNotExists) {
        return this.getIndex(tableId, indexName);
      }
      throw new Error(
        `${INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_PREFIX}${indexName}` +
        `${INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_MIDDLE}${tableId}` +
        INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_SUFFIX,
      );
    }

    await this.validateIndexCreation({tableId, tableName, columnNames, unique});

    const indexId = `idx-${uuidv4()}`;
    const createdAt = Date.now();
    const indexMetadata = {
      indexId,
      tableId,
      tableName,
      indexName,
      columnNames,
      indexType,
      unique,
      state: INDEX_READABLE_STATE.READY,
      createdAt,
    };

    await this.createSQLiteIndex(tableId, tableName, indexName, columnNames, {unique});
    await this.persistIndexMetadata(indexMetadata);

    this._recordCreatedIndex(indexMetadata);

    this.logger.info(INDEX_LOG_MSG.INDEX_CREATED, {indexId, tableId, indexName});
    return indexMetadata;
  }

  /**
   * Get all partitions for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Array<Object>>} Array of partition services or rows.
   * @private
   */
  async getPartitionsForTable(tableId) {
    if (typeof this.sqlQueryEngine?.getTablePartitions === 'function') {
      const enginePartitions = this.sqlQueryEngine.getTablePartitions(tableId);
      if (Array.isArray(enginePartitions) && enginePartitions.length > 0) {
        return enginePartitions;
      }
    }

    const partitions = [];

    let partitionRecords = [];
    if (this.canReadMetadata()) {
      const result = await this.getControlPlaneSystemTableGateway().readRows(
        TABLES.PARTITIONS,
        'SELECT * FROM partitions WHERE table_id = ? OR table_name = ?',
        [tableId, tableId],
      );
      partitionRecords = result.rows || [];
    }

    for (const record of partitionRecords) {
      const partition = await this.getPartition(
        record.partition_id,
      );
      if (partition) {
        partitions.push(partition);
      }
    }

    return partitions;
  }

  async getPartitionRow(partitionId) {
    if (!this.canReadMetadata()) return null;
    const result = await this.getControlPlaneSystemTableGateway().readRows(
      TABLES.PARTITIONS,
      'SELECT * FROM partitions WHERE partition_id = ?',
      [partitionId],
    );
    return result.rows?.[0] || null;
  }

  /**
   * Get a partition by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object|null>} Partition info or handle.
   * @private
   */
  async getPartition(partitionId) {
    const partitionRow = await this.getPartitionRow(partitionId);
    const serviceInstance = resolvePartitionServiceInstance(this.partitionService, partitionId);
    if (serviceInstance) {
      return wrapPartitionInstance(serviceInstance, partitionRow);
    }
    const engineInstance = resolveEnginePartitionInstance(this.sqlQueryEngine, partitionId);
    if (engineInstance) {
      return wrapPartitionInstance(engineInstance, partitionRow);
    }
    return partitionRow;
  }

  async parseDropIndexObject(opts) {
    const indexName = opts.indexName || opts.name || null;
    let tableId = opts.tableId || opts.table_id || null;
    const ifExists = Boolean(opts.ifExists || opts.if_exists);
    if (!tableId && opts.tableName) {
      tableId = await this.getTableIdForTableName(opts.tableName);
    }
    return {tableId, indexName, ifExists};
  }

  parseDropIndexPositional(arg1, arg2, arg3) {
    if (typeof arg2 === 'string') {
      const ifExists = Boolean(arg3?.ifExists || arg3?.if_exists);
      return {tableId: arg1, indexName: arg2, ifExists};
    }
    return {tableId: null, indexName: arg1, ifExists: false};
  }

  async parseDropIndexArgs(arg1, arg2, arg3) {
    if (typeof arg1 === 'object' && arg1 !== null) {
      return this.parseDropIndexObject(arg1);
    }
    if (typeof arg1 === 'string') {
      return this.parseDropIndexPositional(arg1, arg2, arg3);
    }
    return {tableId: null, indexName: null, ifExists: false};
  }

  async deleteIndexMetadata(indexMetadata, resolvedTableId, indexName) {
    if (!this.canWriteSystemTable()) {
      return;
    }
    const gateway = this.getControlPlaneSystemTableGateway();
    if (gateway) {
      await gateway.deleteSystemTableRow(
        TABLES.INDICES,
        {table_id: resolvedTableId, index_name: indexName},
        {
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: LOCAL_STR_CRITICAL,
        },
      );
    }
  }

  /**
   * Remove local index storage from persistent system table and SQLite.
   * @param {Object} indexMetadata - Cached index metadata.
   * @param {string} resolvedTableId - Resolved table ID.
   * @param {string} indexName - Index name.
   * @private
   */
  async _removeLocalIndexStorage(indexMetadata, resolvedTableId, indexName) {
    await this.deleteIndexMetadata(indexMetadata, resolvedTableId, indexName);
    await this.dropSQLiteIndex(resolvedTableId, indexName);
  }

  /**
   * Drop a local partition-level index from metadata and SQLite.
   * @param {string} indexName - Index name.
   * @param {Object} indexMetadata - Cached index metadata.
   * @param {string|null} tableId - Table ID.
   * @return {Promise<boolean>} True if dropped.
   * @private
   */
  async _dropLocalIndexEntry(indexName, indexMetadata, tableId) {
    const resolvedTableId = indexMetadata.tableId || tableId;
    await this._removeLocalIndexStorage(indexMetadata, resolvedTableId, indexName);
    this._removeIndexFromCache(indexName, resolvedTableId);
    this.logger.info(INDEX_LOG_MSG.INDEX_DROPPED, {
      indexId: indexMetadata.indexId,
      tableId: resolvedTableId,
      indexName,
    });
    return true;
  }

  /**
   * Drop an index from a table.
   * Supports dropIndex(tableId, indexName), dropIndex(ast), dropIndex({indexName, ifExists}).
   * @param {string|Object} arg1 - Table ID or AST / options object.
   * @param {string} [arg2] - Index name.
   * @param {Object} [arg3] - Options.
   * @return {Promise<boolean>} True if dropped successfully.
   */
  async dropIndex(arg1, arg2, arg3) {
    const {tableId, indexName, ifExists} = await this.parseDropIndexArgs(arg1, arg2, arg3);
    if (!indexName) {
      throw new Error(INDEX_ERROR_MSG.INDEX_NAME_REQUIRED);
    }

    this.logger.info(INDEX_LOG_MSG.DROPPING_INDEX, {tableId, indexName});

    const indexMetadata = (tableId ? this.getIndex(tableId, indexName) : null) ||
      (await this.findIndexByName(indexName));

    if (this._isGlobalIndexDrop(indexMetadata, indexName)) {
      return this._dropGlobalIndexEntry(indexName, indexMetadata, tableId, {ifExists});
    }

    if (!indexMetadata) {
      if (ifExists) {
        return true;
      }
      this._throwIndexNotFound(indexName, tableId);
    }

    return this._dropLocalIndexEntry(indexName, indexMetadata, tableId);
  }

  /**
   * Check if an index exists.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {boolean} True if index exists.
   */
  indexExists(tableId, indexName) {
    if (!this.indexCache.has(tableId)) {
      return false;
    }
    return this.indexCache.get(tableId).has(indexName);
  }

  /**
   * Get index metadata by table ID and index name, or by index name alone.
   * @param {string} tableId - Table ID or index name.
   * @param {string} [indexName] - Index name.
   * @return {Object|null} Index metadata or null.
   */
  getIndex(tableId, indexName) {
    if (indexName !== undefined) {
      if (this.indexCache.has(tableId)) {
        const found = this.indexCache.get(tableId).get(indexName);
        if (found) return found;
      }
      return this.indices?.get(indexName) || null;
    }
    const byName = this.indices?.get(tableId) || this.getIndexByName(tableId);
    if (byName) return byName;
    if (this.globalIndexCoordinator?.getCatalogRecord) {
      const cat = this.globalIndexCoordinator.getCatalogRecord(tableId);
      if (cat) return this._catalogToMetadata(cat);
    }
    return null;
  }

  /**
   * Get index metadata by name across all cached tables.
   * @param {string} indexName - Index name.
   * @return {Object|null} Index metadata or null.
   */
  getIndexByName(indexName) {
    if (!indexName) return null;
    for (const tableIndices of this.indexCache.values()) {
      if (tableIndices.has(indexName)) {
        return tableIndices.get(indexName);
      }
    }
    return null;
  }

  /**
   * Get all indices for a table.
   * @param {string} tableId - Table ID or table name.
   * @return {Array<Object>} Array of index metadata.
   */
  getIndicesForTable(tableId) {
    const results = [];
    if (this.indexCache.has(tableId)) {
      results.push(...this.indexCache.get(tableId).values());
    }
    if (this.globalIndexCoordinator?.getIndexesForTable) {
      const globalIndexes = this.globalIndexCoordinator.getIndexesForTable(tableId);
      for (const gi of globalIndexes) {
        const name = gi.index_name || gi.indexName;
        if (!results.some((r) => r.indexName === name)) {
          results.push(this._catalogToMetadata(gi));
        }
      }
    }
    return results;
  }

  /**
   * Get all indices in the system.
   * @return {Array<Object>} Array of all index metadata.
   */
  getAllIndices() {
    const indices = [];
    for (const tableIndices of this.indexCache.values()) {
      indices.push(...tableIndices.values());
    }
    return indices;
  }

  /**
   * Get total index count.
   * @return {number} Total number of indices.
   */
  getTotalIndexCount() {
    let count = 0;
    for (const tableIndices of this.indexCache.values()) {
      count += tableIndices.size;
    }
    return count;
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }

  canReadMetadata() {
    return Boolean(
      this.controlPlaneSystemTableGateway ||
      this.sqlQueryEngine ||
      this.cdcIntegrationService,
    );
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getSqlQueryEngine: () => this.sqlQueryEngine,
      getSystemTableCache: () => this.systemTableCache,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Shutdown the index service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info(INDEX_LOG_MSG.SHUTTING_DOWN);
    this.indexCache.clear();
    this.indices?.clear();
    this.initialized = false;
  }
}

Object.assign(
  IndexService.prototype,
  indexServiceCdcHandler,
  indexServicePartitionMethods,
  indexServiceGlobalMethods,
);

export {IndexService, IndexType};
