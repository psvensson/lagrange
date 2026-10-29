/**
 * Global Secondary Index dataset lifecycle and physical representation manager.
 * Owns index dataset schema generation (__idx_<tableName>_<indexName>),
 * composite primary-key layout, duplicate non-unique entry coexistence,
 * and entry-to-partition routing via compareRoutingKeys.
 *
 * Requirements: Stage C2 (RM-0.3-qs-non-unique-gsi).
 */

import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {
  BASE_PARTITION_ID_COLUMN,
  BASE_PK_COLUMN_PREFIX,
  GLOBAL_INDEX_DATASET_PREFIX,
} from './index-constants.js';

export {
  BASE_PARTITION_ID_COLUMN,
  BASE_PK_COLUMN_PREFIX,
};

const LOCAL_STR_ESCAPED_QUOTE = '""';
const LOCAL_STR_TEXT = 'TEXT';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_NOT_NULL = ' NOT NULL';

/**
 * Format the system-managed dataset table name for a global secondary index.
 * @param {string} tableName - Base table name.
 * @param {string} indexName - Index name.
 * @return {string} Dataset name.
 */
export function getGlobalIndexDatasetName(tableName, indexName) {
  return `${GLOBAL_INDEX_DATASET_PREFIX}${tableName}_${indexName}`;
}

/**
 * Format the prefixed column name for a base primary key column in the index dataset.
 * @param {string} pkColumn - Base table primary key column name.
 * @return {string} Prefixed column name.
 */
function getBasePrimaryKeyColumnName(pkColumn) {
  return `${BASE_PK_COLUMN_PREFIX}${pkColumn}`;
}

/**
 * Extract the base primary key column name from its prefixed index dataset column name.
 * @param {string} columnName - Prefixed column name in index dataset.
 * @return {string|null} Original base primary key column name or null.
 */
export function extractBasePrimaryKeyColumnName(columnName) {
  if (typeof columnName === 'string' &&
      columnName.startsWith(BASE_PK_COLUMN_PREFIX)) {
    return columnName.slice(BASE_PK_COLUMN_PREFIX.length);
  }
  return null;
}

/**
 * Safely quote an identifier for SQLite.
 * @param {string} identifier
 * @return {string} Quoted identifier.
 */
function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, LOCAL_STR_ESCAPED_QUOTE)}"`;
}

/**
 * Build the schema descriptor for a global secondary index dataset.
 * The primary key is the composite tuple (c_1, ..., c_k, __base_pk_1, ..., __base_pk_m).
 * @param {Object} options
 * @param {string} options.tableName - Base table name.
 * @param {string} options.indexName - Index name.
 * @param {string[]} options.columnNames - Indexed column names.
 * @param {string[]} options.basePrimaryKeyColumns - Base table primary key columns.
 * @param {Object} [options.columnTypes={}] - Column type map.
 * @return {Object} Schema descriptor.
 */
export function buildIndexDatasetSchema(options) {
  const {
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
    columnTypes = {},
  } = options;

  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  const basePkColumns = Array.isArray(basePrimaryKeyColumns) &&
    basePrimaryKeyColumns.length > 0 ?
    basePrimaryKeyColumns :
    [LOCAL_STR_ID];

  const columns = [];
  for (const col of columnNames) {
    columns.push({
      name: col,
      type: columnTypes[col] || LOCAL_STR_TEXT,
      notNull: false,
    });
  }
  for (const pkCol of basePkColumns) {
    columns.push({
      name: getBasePrimaryKeyColumnName(pkCol),
      type: columnTypes[pkCol] || LOCAL_STR_TEXT,
      notNull: true,
    });
  }
  columns.push({
    name: BASE_PARTITION_ID_COLUMN,
    type: LOCAL_STR_TEXT,
    notNull: true,
  });

  const primaryKey = [
    ...columnNames,
    ...basePkColumns.map((pk) => getBasePrimaryKeyColumnName(pk)),
  ];

  return {
    tableName: datasetName,
    baseTableName: tableName,
    indexName,
    columnNames: [...columnNames],
    basePrimaryKeyColumns: [...basePkColumns],
    partitionKey: columnNames[0],
    primaryKey,
    columns,
  };
}

/**
 * Generate CREATE TABLE DDL SQL for the global secondary index dataset.
 * @param {Object} schema - Schema descriptor from buildIndexDatasetSchema.
 * @return {string} SQL DDL string.
 */
export function generateCreateIndexDatasetSql(schema) {
  const columnDefs = schema.columns.map((col) => {
    const nullClause = col.notNull ? LOCAL_STR_NOT_NULL : '';
    return `${quoteIdentifier(col.name)} ${col.type}${nullClause}`;
  });

  const pkClause = `PRIMARY KEY (${schema.primaryKey.map(quoteIdentifier).join(LOCAL_STR_COMMA_SPACE)})`;
  columnDefs.push(pkClause);

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema.tableName)} (${columnDefs.join(LOCAL_STR_COMMA_SPACE)})`;
}

/**
 * Generate DROP TABLE DDL SQL for the global secondary index dataset.
 * @param {string} tableName - Base table name.
 * @param {string} indexName - Index name.
 * @return {string} SQL DDL string.
 */
export function generateDropIndexDatasetSql(tableName, indexName) {
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  return `DROP TABLE IF EXISTS ${quoteIdentifier(datasetName)}`;
}

/**
 * Build a physical index entry row object from a base table row image.
 * @param {Object} baseRow - Row from base table.
 * @param {Object} context
 * @param {string[]} context.columnNames - Indexed column names.
 * @param {string[]} context.basePrimaryKeyColumns - Base table PK column names.
 * @param {string} context.basePartitionId - ID of base partition containing row.
 * @return {Object} Index entry row.
 */
export function buildIndexEntry(baseRow, context) {
  const {columnNames, basePrimaryKeyColumns, basePartitionId} = context;
  const entry = {};

  for (const col of columnNames) {
    entry[col] = baseRow[col] !== undefined ? baseRow[col] : null;
  }
  for (const pkCol of basePrimaryKeyColumns) {
    entry[getBasePrimaryKeyColumnName(pkCol)] = baseRow[pkCol];
  }
  entry[BASE_PARTITION_ID_COLUMN] = basePartitionId;

  return entry;
}

/**
 * Check whether a routing key falls inside a partition's [start, end) range.
 * @param {*} key - Key to check.
 * @param {Object} partition - Partition descriptor with key start/end.
 * @return {boolean} True if key falls in partition.
 */
function isKeyInIndexPartition(key, partition) {
  const start = partition.partition_key_start !== undefined ?
    partition.partition_key_start :
    partition.partitionKeyStart;
  const end = partition.partition_key_end !== undefined ?
    partition.partition_key_end :
    partition.partitionKeyEnd;

  if (start !== null && start !== undefined) {
    if (compareRoutingKeys(key, start) < 0) {
      return false;
    }
  }
  if (end !== null && end !== undefined) {
    if (compareRoutingKeys(key, end) >= 0) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve the target index partition for an index entry using compareRoutingKeys.
 * Routes by the leading indexed column.
 * @param {Object} entry - Index entry.
 * @param {Object[]} indexPartitions - Partitions of the index dataset.
 * @param {string} leadingColumnName - Leading indexed column name.
 * @return {Object|null} Matching partition or null.
 */
export function resolveIndexPartitionForEntry(
  entry,
  indexPartitions,
  leadingColumnName,
) {
  if (!Array.isArray(indexPartitions) || indexPartitions.length === 0) {
    return null;
  }
  if (indexPartitions.length === 1) {
    return indexPartitions[0];
  }

  const keyValue = entry[leadingColumnName];
  for (const partition of indexPartitions) {
    if (isKeyInIndexPartition(keyValue, partition)) {
      return partition;
    }
  }

  return null;
}

/**
 * Manager class for global index dataset lifecycle and operations.
 */
export class GlobalIndexDatasetManager {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.getIndexPartitions]
   */
  constructor(options = {}) {
    this.partitionsByIndex = new Map();
    if (typeof options.getIndexPartitions === 'function') {
      this.getIndexPartitions = options.getIndexPartitions;
    }
  }

  /**
   * Register partitions for an index name.
   * @param {string} indexName
   * @param {Object[]} partitions
   */
  registerIndexPartitions(indexName, partitions) {
    this.partitionsByIndex.set(indexName, Array.isArray(partitions) ? [...partitions] : []);
  }

  /**
   * Get partitions for an index name.
   * @param {string} indexName
   * @return {Object[]}
   */
  getIndexPartitions(indexName) {
    return this.partitionsByIndex.get(indexName) || [];
  }

  /**
   * Create index dataset table on a database handle.
   * @param {Object} db - SQLite database handle.
   * @param {Object} options - Options for buildIndexDatasetSchema.
   * @return {Object} Schema descriptor.
   */
  createIndexDataset(db, options) {
    const schema = buildIndexDatasetSchema(options);
    const ddl = generateCreateIndexDatasetSql(schema);
    db.exec(ddl);
    return schema;
  }

  /**
   * Drop index dataset table from a database handle.
   * @param {Object} db - SQLite database handle.
   * @param {string} tableName - Base table name.
   * @param {string} indexName - Index name.
   */
  dropIndexDataset(db, tableName, indexName) {
    const ddl = generateDropIndexDatasetSql(tableName, indexName);
    db.exec(ddl);
  }

  /**
   * Resolve target index partition for an index entry.
   * @param {Object} entry - Index entry.
   * @param {string} indexName - Index name.
   * @param {string} leadingColumnName - Leading column.
   * @return {Object|null} Matching partition or null.
   */
  resolveIndexPartition(entry, indexName, leadingColumnName) {
    const partitions = this.getIndexPartitions(indexName);
    return resolveIndexPartitionForEntry(entry, partitions, leadingColumnName);
  }
}
