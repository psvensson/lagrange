/**
 * Global Secondary Index synchronous TX1 write maintenance.
 * Owns synchronous maintenance of WRITE_ONLY, BACKFILLING, and READ_WRITE
 * global secondary indexes on base table INSERT, UPDATE, and DELETE.
 * Computes delta entries, moves updated entries across index partitions,
 * and enlists affected index partitions into the transaction participant set.
 *
 * Requirements: Stage C4 (RM-0.3-qs-non-unique-gsi).
 */

import {maintainsOnWrite} from './global-index-catalog-contract.js';
import {
  buildIndexDatasetSchema,
  buildIndexEntry,
  getGlobalIndexDatasetName,
  resolveIndexPartitionForEntry,
} from './global-index-dataset-manager.js';
import {INDEX_MAINTENANCE_OPERATION} from './index-constants.js';

export {INDEX_MAINTENANCE_OPERATION};

const LOCAL_STR_ESCAPED_QUOTE = '""';
const LOCAL_STR_ID = 'id';

/**
 * Safely quote an identifier for SQL.
 * @param {string} identifier
 * @return {string} Quoted identifier.
 */
function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, LOCAL_STR_ESCAPED_QUOTE)}"`;
}

/**
 * Generate INSERT SQL statement and params for an index entry.
 * @param {string} datasetName
 * @param {Object} entry
 * @return {{sql: string, params: Array}}
 */
export function buildIndexInsertSql(datasetName, entry) {
  const columns = Object.keys(entry);
  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${quoteIdentifier(datasetName)} (${quotedColumns}) VALUES (${placeholders})`;
  const params = columns.map((col) => entry[col]);
  return {sql, params};
}

/**
 * Generate DELETE SQL statement and params for an index entry using its primary key.
 * @param {string} datasetName
 * @param {string[]} primaryKeyColumns - Columns composing the index's primary key.
 * @param {Object} entryValues - Values for the primary key columns.
 * @return {{sql: string, params: Array}}
 */
export function buildIndexDeleteSql(datasetName, primaryKeyColumns, entryValues) {
  const whereClauses = [];
  const params = [];

  for (const col of primaryKeyColumns) {
    whereClauses.push(`${quoteIdentifier(col)} = ?`);
    params.push(entryValues[col]);
  }

  const sql = `DELETE FROM ${quoteIdentifier(datasetName)} WHERE ${whereClauses.join(' AND ')}`;
  return {sql, params};
}

function parseIndexColumnNames(index) {
  if (Array.isArray(index.column_names)) return index.column_names;
  if (Array.isArray(index.columnNames)) return index.columnNames;
  return JSON.parse(index.column_names);
}

function resolveIndexPartitionId(entry, partitions, partitionColumn) {
  const targetPartition = resolveIndexPartitionForEntry(
    entry,
    partitions,
    partitionColumn,
  );
  return targetPartition ?
    (targetPartition.partition_id || targetPartition.partitionId) :
    null;
}

function createIndexInsertOperation({
  tableName,
  indexName,
  datasetName,
  indexPartitionId,
  entry,
}) {
  const {sql, params} = buildIndexInsertSql(datasetName, entry);
  return {
    operationType: INDEX_MAINTENANCE_OPERATION.INSERT,
    tableName,
    indexName,
    datasetName,
    indexPartitionId,
    entry,
    sql,
    params,
  };
}

function createIndexDeleteOperation({
  tableName,
  indexName,
  datasetName,
  indexPartitionId,
  entry,
  primaryKey,
}) {
  const {sql, params} = buildIndexDeleteSql(datasetName, primaryKey, entry);
  return {
    operationType: INDEX_MAINTENANCE_OPERATION.DELETE,
    tableName,
    indexName,
    datasetName,
    indexPartitionId,
    entry,
    sql,
    params,
  };
}

function planInsertForIndex({
  index,
  tableName,
  basePartitionId,
  insertedRows,
  basePrimaryKeyColumns,
  partitions,
  operations,
  enlistedPartitions,
}) {
  const columnNames = parseIndexColumnNames(index);
  const indexName = index.index_name || index.indexName;
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);

  for (const row of insertedRows) {
    const entry = buildIndexEntry(row, {
      columnNames,
      basePrimaryKeyColumns,
      basePartitionId,
    });

    const indexPartitionId = resolveIndexPartitionId(entry, partitions, columnNames[0]);
    if (!indexPartitionId) {
      throw new Error(`Failed to resolve index partition for index ${indexName}`);
    }

    enlistedPartitions.add(indexPartitionId);
    operations.push(
      createIndexInsertOperation({
        tableName,
        indexName,
        datasetName,
        indexPartitionId,
        entry,
      }),
    );
  }
}

function planUpdateForIndex({
  index,
  tableName,
  basePartitionId,
  oldRow,
  newRow,
  basePrimaryKeyColumns,
  partitions,
  operations,
  enlistedPartitions,
}) {
  const columnNames = parseIndexColumnNames(index);
  const hasIndexedColumnChanged = columnNames.some(
    (col) => oldRow[col] !== newRow[col],
  );
  if (!hasIndexedColumnChanged) {
    return;
  }

  const indexName = index.index_name || index.indexName;
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  const schema = buildIndexDatasetSchema({
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
  });

  const oldEntry = buildIndexEntry(oldRow, {
    columnNames,
    basePrimaryKeyColumns,
    basePartitionId,
  });
  const oldIndexPartitionId = resolveIndexPartitionId(oldEntry, partitions, columnNames[0]);
  if (!oldIndexPartitionId) {
    throw new Error(`Failed to resolve old index partition for index ${indexName}`);
  }
  enlistedPartitions.add(oldIndexPartitionId);
  operations.push(
    createIndexDeleteOperation({
      tableName,
      indexName,
      datasetName,
      indexPartitionId: oldIndexPartitionId,
      entry: oldEntry,
      primaryKey: schema.primaryKey,
    }),
  );

  const newEntry = buildIndexEntry(newRow, {
    columnNames,
    basePrimaryKeyColumns,
    basePartitionId,
  });
  const newIndexPartitionId = resolveIndexPartitionId(newEntry, partitions, columnNames[0]);
  if (!newIndexPartitionId) {
    throw new Error(`Failed to resolve new index partition for index ${indexName}`);
  }
  enlistedPartitions.add(newIndexPartitionId);
  operations.push(
    createIndexInsertOperation({
      tableName,
      indexName,
      datasetName,
      indexPartitionId: newIndexPartitionId,
      entry: newEntry,
    }),
  );
}

/**
 * Synchronous write maintenance manager for global secondary indexes.
 */
export class GlobalIndexWriteMaintenance {
  /**
   * @param {Object} options
   * @param {Function} options.getIndexCatalog - Returns list of indexes for a table.
   * @param {Function} options.getIndexPartitions - Returns partitions for an index name.
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this.getIndexCatalog = options.getIndexCatalog || (() => []);
    this.getIndexPartitions = options.getIndexPartitions || (() => []);
    this.logger = options.logger || console;
  }

  /**
   * Filter active global indexes on a table that require write maintenance.
   * (states: WRITE_ONLY, BACKFILLING, READ_WRITE).
   * @param {string} tableName
   * @return {Object[]}
   */
  getActiveIndexesForTable(tableName) {
    const allIndexes = this.getIndexCatalog(tableName) || [];
    return allIndexes.filter((idx) => {
      const isGlobal = idx.is_global !== undefined ? Boolean(idx.is_global) : idx.isGlobal;
      const state = idx.state;
      return isGlobal && maintainsOnWrite(state);
    });
  }

  /**
   * Plan synchronous maintenance for an INSERT on a base table.
   * @param {Object} context
   * @param {string} context.tableName - Base table name.
   * @param {string} context.basePartitionId - ID of base partition where row was inserted.
   * @param {Object[]} context.insertedRows - Inserted rows.
   * @param {string[]} [context.basePrimaryKeyColumns=['id']] - Base PK columns.
   * @return {{operations: Object[], enlistedIndexPartitions: string[]}}
   */
  planInsertMaintenance(context) {
    const {
      tableName,
      basePartitionId,
      insertedRows,
      basePrimaryKeyColumns = [LOCAL_STR_ID],
    } = context;

    const activeIndexes = this.getActiveIndexesForTable(tableName);
    const operations = [];
    const enlistedPartitions = new Set();

    if (activeIndexes.length === 0 || !Array.isArray(insertedRows) || insertedRows.length === 0) {
      return {operations, enlistedIndexPartitions: []};
    }

    for (const index of activeIndexes) {
      const indexName = index.index_name || index.indexName;
      const partitions = this.getIndexPartitions(indexName);
      planInsertForIndex({
        index,
        tableName,
        basePartitionId,
        insertedRows,
        basePrimaryKeyColumns,
        partitions,
        operations,
        enlistedPartitions,
      });
    }

    return {
      operations,
      enlistedIndexPartitions: Array.from(enlistedPartitions).sort(),
    };
  }

  /**
   * Plan synchronous maintenance for an UPDATE on a base table.
   * If any indexed column changes, deletes old entry and inserts new entry,
   * moving across index partitions if needed.
   * @param {Object} context
   * @param {string} context.tableName - Base table name.
   * @param {string} context.basePartitionId - ID of base partition where update occurred.
   * @param {Object} context.oldRow - Row before update.
   * @param {Object} context.newRow - Row after update.
   * @param {string[]} [context.basePrimaryKeyColumns=['id']] - Base PK columns.
   * @return {{operations: Object[], enlistedIndexPartitions: string[]}}
   */
  planUpdateMaintenance(context) {
    const {
      tableName,
      basePartitionId,
      oldRow,
      newRow,
      basePrimaryKeyColumns = [LOCAL_STR_ID],
    } = context;

    const activeIndexes = this.getActiveIndexesForTable(tableName);
    const operations = [];
    const enlistedPartitions = new Set();

    if (activeIndexes.length === 0 || !oldRow || !newRow) {
      return {operations, enlistedIndexPartitions: []};
    }

    for (const index of activeIndexes) {
      const indexName = index.index_name || index.indexName;
      const partitions = this.getIndexPartitions(indexName);
      planUpdateForIndex({
        index,
        tableName,
        basePartitionId,
        oldRow,
        newRow,
        basePrimaryKeyColumns,
        partitions,
        operations,
        enlistedPartitions,
      });
    }

    return {
      operations,
      enlistedIndexPartitions: Array.from(enlistedPartitions).sort(),
    };
  }

  /**
   * Plan synchronous maintenance for a DELETE on a base table.
   * @param {Object} context
   * @param {string} context.tableName - Base table name.
   * @param {string} context.basePartitionId - ID of base partition where row was deleted.
   * @param {Object} context.deletedRow - Row that was deleted.
   * @param {string[]} [context.basePrimaryKeyColumns=['id']] - Base PK columns.
   * @return {{operations: Object[], enlistedIndexPartitions: string[]}}
   */
  planDeleteMaintenance(context) {
    const {
      tableName,
      basePartitionId,
      deletedRow,
      basePrimaryKeyColumns = [LOCAL_STR_ID],
    } = context;

    const activeIndexes = this.getActiveIndexesForTable(tableName);
    const operations = [];
    const enlistedPartitions = new Set();

    if (activeIndexes.length === 0 || !deletedRow) {
      return {operations, enlistedIndexPartitions: []};
    }

    for (const index of activeIndexes) {
      const columnNames = Array.isArray(index.column_names) ?
        index.column_names :
        (Array.isArray(index.columnNames) ?
          index.columnNames :
          JSON.parse(index.column_names));
      const indexName = index.index_name || index.indexName;
      const datasetName = getGlobalIndexDatasetName(tableName, indexName);
      const partitions = this.getIndexPartitions(indexName);

      const schema = buildIndexDatasetSchema({
        tableName,
        indexName,
        columnNames,
        basePrimaryKeyColumns,
      });

      const oldEntry = buildIndexEntry(deletedRow, {
        columnNames,
        basePrimaryKeyColumns,
        basePartitionId,
      });

      const targetPartition = resolveIndexPartitionForEntry(
        oldEntry,
        partitions,
        columnNames[0],
      );
      const indexPartitionId = targetPartition ?
        (targetPartition.partition_id || targetPartition.partitionId) :
        null;

      if (!indexPartitionId) {
        throw new Error(`Failed to resolve target index partition for index ${indexName}`);
      }

      enlistedPartitions.add(indexPartitionId);
      const deleteSql = buildIndexDeleteSql(
        datasetName,
        schema.primaryKey,
        oldEntry,
      );

      operations.push({
        operationType: INDEX_MAINTENANCE_OPERATION.DELETE,
        tableName,
        indexName,
        datasetName,
        indexPartitionId,
        entry: oldEntry,
        sql: deleteSql.sql,
        params: deleteSql.params,
      });
    }

    return {
      operations,
      enlistedIndexPartitions: Array.from(enlistedPartitions).sort(),
    };
  }

  /**
   * Execute planned maintenance operations on target partition handles.
   * @param {Object[]} operations - Operations from plan.
   * @param {Function} executeStatement - (partitionId, sql, params) => Promise<result>
   * @return {Promise<void>}
   */
  async executeMaintenanceOperations(operations, executeStatement) {
    for (const op of operations) {
      await executeStatement(op.indexPartitionId, op.sql, op.params);
    }
  }
}
