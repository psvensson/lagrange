/**
 * Partition index DDL execution methods for IndexService via the mandatory
 * canonical partitionExecutor contract.
 */

import {GLOBAL_INDEX_ERROR_CODE, INDEX_LOG_MSG} from './index-constants.js';
import {createUnavailableError} from './global-index-partition-discovery.js';

const PARTITION_EXECUTOR_REQUIRED_MESSAGE =
  'Canonical partitionExecutor implementing executeOnPartition is required for ' +
  'local index partition DDL';
const INVALID_PARTITION_ID_MESSAGE =
  'Valid partitionId is required for partition index DDL';
const PARTITION_SQL_EXECUTION_FAILED_MESSAGE =
  'Partition SQL execution failed';

function isUniqueRequested(options) {
  if (!options || typeof options !== 'object') return false;
  return Boolean(options.unique || options.is_unique);
}

function buildIndexDdl(options, indexName, tableName, columnNames) {
  const uniquePrefix = isUniqueRequested(options) ? 'UNIQUE ' : '';
  const columns = (columnNames || []).join(', ');
  return `CREATE ${uniquePrefix}INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`;
}

function normalizeSQLiteIndexArgs(
  tableId,
  tableName,
  indexName,
  columnNames,
  options = {},
) {
  return {
    tableId,
    tableName: tableName || tableId,
    indexName,
    columnNames,
    options: options || {},
  };
}

function normalizePartitionIndexArgs(partitionId, indexMetadata = {}) {
  const metadata =
    indexMetadata && typeof indexMetadata === 'object' ? indexMetadata : {};
  return {
    partitionId,
    indexName: metadata.indexName,
    tableId: metadata.tableId || metadata.tableName,
    columnNames: metadata.columnNames,
    options: metadata,
  };
}

function extractPartitionId(partition) {
  if (!partition || typeof partition !== 'object') {
    return partition;
  }
  return partition.partition_id || partition.partitionId || partition;
}

function requireCanonicalPartitionExecutor(service) {
  const executor = service?.partitionExecutor;
  const executeOnPartition = executor?.executeOnPartition;
  if (!executor || typeof executeOnPartition !== 'function') {
    throw createUnavailableError(
      GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      PARTITION_EXECUTOR_REQUIRED_MESSAGE,
    );
  }
  return {executor, executeOnPartition};
}

function assertPartitionExecutionSuccess(result) {
  if (!result || typeof result !== 'object' || result.success === false) {
    const message = result?.error || result?.errorMessage || result?.message ||
      PARTITION_SQL_EXECUTION_FAILED_MESSAGE;
    const error = new Error(message);
    if (result?.errorCode || result?.code) {
      error.code = result.errorCode || result.code;
    }
    throw error;
  }
}

function resolveRebuildTarget(service, tableId, indexName) {
  if (tableId && indexName) {
    const meta = service.getIndex(tableId, indexName);
    if (meta) return {tableId, indexName, metadata: meta};
  }
  const byName = service.getIndexByName(tableId);
  if (byName) {
    return {tableId: byName.tableId, indexName: byName.indexName, metadata: byName};
  }
  const byId = service.getAllIndices().find((idx) => idx.indexId === tableId);
  if (byId) {
    return {tableId: byId.tableId, indexName: byId.indexName, metadata: byId};
  }
  return null;
}

const indexServicePartitionMethods = {
  hasPartitionExecutor() {
    return Boolean(this.partitionExecutor?.executeOnPartition);
  },

  /**
   * Execute index DDL on a partition through the mandatory canonical
   * partitionExecutor contract (`executeOnPartition`).
   * @param {Object|string} partition - Partition record or partition ID.
   * @param {string} sql - SQL statement.
   * @param {Array} [params] - Bound parameters.
   * @return {Promise<Object>} Execution outcome.
   */
  async executePartitionSql(partition, sql, params = []) {
    const {executor, executeOnPartition} = requireCanonicalPartitionExecutor(this);
    const partitionId = extractPartitionId(partition);
    if (!partitionId || typeof partitionId !== 'string') {
      throw new Error(INVALID_PARTITION_ID_MESSAGE);
    }
    const normalizedParams = Array.isArray(params) ? params : [];
    const rawResult = await executeOnPartition.call(
      executor,
      partitionId,
      sql,
      normalizedParams,
      false,
      true,
      false,
      {requireLeader: true},
    );
    assertPartitionExecutionSuccess(rawResult);
    return rawResult;
  },

  assertPartitionsExist(partitions, tableId, tableName, indexName) {
    if (partitions.length > 0) return true;
    if (this.requirePartitionMaterialization ||
        this.isRealTableConfigured(tableId, tableName)) {
      throw new Error(
        `No partitions found for table '${tableName || tableId}' to materialize index '${indexName}'`,
      );
    }
    this.logger.warn(INDEX_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableId, tableName});
    return false;
  },

  /**
   * Create SQLite index on all partitions for a table.
   * Requirements: 12.5
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {string} indexName - Index name.
   * @param {Array<string>} columnNames - Column names.
   * @param {Object} [options] - Index creation options.
   * @return {Promise<void>}
   */
  async createSQLiteIndex(
    tableId,
    tableName,
    indexName,
    columnNames,
    options = {},
  ) {
    const parsed = normalizeSQLiteIndexArgs(
      tableId,
      tableName,
      indexName,
      columnNames,
      options,
    );
    const resolvedTableId = parsed.tableId;
    const resolvedTableName = parsed.tableName;
    const resolvedIndexName = parsed.indexName;
    const resolvedColumns = parsed.columnNames;
    const resolvedOptions = parsed.options;
    const partitions = await this.getPartitionsForTable(resolvedTableId);

    if (
      !this.assertPartitionsExist(
        partitions,
        resolvedTableId,
        resolvedTableName,
        resolvedIndexName,
      )
    ) {
      return;
    }

    const sql = buildIndexDdl(
      resolvedOptions,
      resolvedIndexName,
      resolvedTableName,
      resolvedColumns,
    );
    try {
      for (const partition of partitions) {
        await this.executePartitionSql(partition, sql, []);
      }
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
        indexName: resolvedIndexName,
        error: error.message,
      });
      await this.dropSQLiteIndex(resolvedTableId, resolvedIndexName).catch(
        () => {},
      );
      throw error;
    }

    this.logger.debug(INDEX_LOG_MSG.SQLITE_INDEX_COMPLETED, {
      indexName: resolvedIndexName,
      successCount: partitions.length,
      totalPartitions: partitions.length,
    });
  },

  /**
   * Drop SQLite index from all partitions for a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<void>}
   */
  async dropSQLiteIndex(tableId, indexName) {
    const partitions = await this.getPartitionsForTable(tableId);
    const sql = `DROP INDEX IF EXISTS ${indexName}`;

    for (const partition of partitions) {
      try {
        await this.executePartitionSql(partition, sql, []);
      } catch (error) {
        this.logger.error(INDEX_LOG_MSG.INDEX_DROP_FAILED, {
          partitionId: partition.partition_id || partition.partitionId,
          indexName,
          error: error.message,
        });
        throw error;
      }
    }
  },

  /**
   * Create an index on a specific partition.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {Object} indexMetadata - Index metadata.
   * @return {Promise<boolean>} True if successful.
   */
  async createIndexOnPartition(partitionId, indexMetadata) {
    const parsed = normalizePartitionIndexArgs(partitionId, indexMetadata);
    const {indexName, tableId, columnNames, options} = parsed;
    const partition = await this.getPartition(partitionId);

    if (!partition) {
      this.logger.warn(INDEX_LOG_MSG.PARTITION_NOT_FOUND, {partitionId, indexName});
      return false;
    }

    const tableName = partition.table_name || partition.tableName ||
      options?.tableName || tableId;
    const sql = buildIndexDdl(options, indexName, tableName, columnNames);

    try {
      await this.executePartitionSql(partition, sql, []);
      this.logger.debug(INDEX_LOG_MSG.INDEX_CREATED_ON_PARTITION, {
        partitionId,
        indexName,
        unique: isUniqueRequested(options),
      });
      return true;
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
        partitionId,
        indexName,
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Ensure all indices exist on a partition.
   * Called when a partition is registered or becomes available.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {string} tableId - Table ID.
   * @return {Promise<number>} Number of indices created.
   */
  async ensureIndicesOnPartition(partitionId, tableId) {
    const indices = this.getIndicesForTable(tableId);

    if (indices.length === 0) {
      return 0;
    }

    this.logger.debug(INDEX_LOG_MSG.ENSURING_INDICES, {
      partitionId,
      tableId,
      indexCount: indices.length,
    });

    let createdCount = 0;
    for (const index of indices) {
      const success = await this.createIndexOnPartition(partitionId, index);
      if (success) {
        createdCount++;
      }
    }

    return createdCount;
  },

  async rebuildPartitionIndex(partition, target, sql) {
    const dropSql = `DROP INDEX IF EXISTS ${target.indexName}`;
    await this.executePartitionSql(partition, dropSql, []);
    await this.executePartitionSql(partition, sql, []);
  },

  /**
   * Rebuild an index on all partitions for a table.
   * Useful for maintenance or after schema changes.
   * @param {string} tableId - Table ID.
   * @param {string} [indexName] - Index name.
   * @return {Promise<Object>} Rebuild result.
   */
  async rebuildIndex(tableId, indexName) {
    const target = resolveRebuildTarget(this, tableId, indexName);
    if (!target) {
      throw new Error(`Index '${indexName || tableId}' not found on table '${tableId}'`);
    }

    this.logger.info(INDEX_LOG_MSG.REBUILDING_INDEX, target);
    const partitions = await this.getPartitionsForTable(target.tableId);
    const prefix = isUniqueRequested(target.metadata) ? 'UNIQUE ' : '';
    const cols = (target.metadata.columnNames || []).join(', ');

    for (const partition of partitions) {
      const tableName = partition.table_name || partition.tableName ||
        target.metadata.tableName || target.tableId;
      const createSql = `CREATE ${prefix}INDEX ${target.indexName} ON ${tableName}(${cols})`;
      try {
        await this.rebuildPartitionIndex(partition, target, createSql);
      } catch (error) {
        this.logger.error(INDEX_LOG_MSG.INDEX_REBUILD_FAILED, {
          indexName: target.indexName,
          error: error.message,
        });
        throw error;
      }
    }

    return {
      indexName: target.indexName,
      tableId: target.tableId,
      totalPartitions: partitions.length,
      successCount: partitions.length,
      failCount: 0,
    };
  },
};

export {indexServicePartitionMethods};
