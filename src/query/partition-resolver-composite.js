/**
 * Composite partition resolution helpers for multi-column primary keys.
 */

import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';
import {KEY_CONDITION_TYPE} from './partition-resolver-key-conditions.js';
import {normalizePartitionBoundaryKeyType} from
  '../partition/partition-boundary-representation.js';
import {TABLES} from '../constants/index.js';

/**
 * Parse schema object from table metadata.
 *
 * @param {Object|null} tableInfo - Table metadata row.
 * @return {Object|null} Parsed schema object or null.
 */
function parseTableSchema(tableInfo) {
  if (!tableInfo) return null;
  const rawSchema = tableInfo.schema ||
    tableInfo.schema_definition ||
    tableInfo.schemaDefinition ||
    null;
  if (!rawSchema) return null;
  if (typeof rawSchema === 'object') return rawSchema;
  try {
    return JSON.parse(rawSchema);
  } catch {
    return null;
  }
}

/**
 * Resolve declared column type from table metadata schema.
 *
 * @param {Object|null} tableInfo - Table metadata.
 * @param {string} columnName - Target column name.
 * @return {string|null} Normalized key type or null.
 */
function resolveColumnType(tableInfo, columnName) {
  const schema = parseTableSchema(tableInfo);
  if (!schema?.columns || !columnName) return null;
  const target = String(columnName).toLowerCase();
  const col = schema.columns.find((c) =>
    c?.name && String(c.name).toLowerCase() === target,
  );
  return col?.type ? normalizePartitionBoundaryKeyType(col.type) : null;
}

/**
 * Resolve composite-key equality predicates when all key columns are bound.
 *
 * @param {Object} options - Extraction options.
 * @param {Object} options.whereClause - WHERE clause AST.
 * @param {string[]} options.keyColumns - Composite key columns.
 * @param {Object[]} options.partitions - Candidate partitions.
 * @param {Object} options.resolutionContext - Resolution context.
 * @param {string|null} [options.tableName=null] - Table name.
 * @param {Object|null} [options.tableInfo=null] - Table metadata.
 * @param {Object} options.resolver - PartitionResolver instance.
 * @return {{partitionIds: string[], predicateShape: string}}
 */
function resolveCompositeKeyPartitions(options) {
  const {
    whereClause,
    keyColumns,
    partitions,
    resolutionContext,
    tableName = null,
    tableInfo = null,
    resolver,
  } = options;

  const values = [];
  for (const keyColumn of keyColumns) {
    const colType = resolveColumnType(tableInfo, keyColumn);
    const keyConditions = resolver.extractKeyConditions(
      whereClause,
      keyColumn,
      resolutionContext,
      colType,
    );
    if (!keyConditions ||
      keyConditions.contradiction ||
      keyConditions.type !== KEY_CONDITION_TYPE.EQUALS ||
      keyConditions.values.length !== 1) {
      return {
        partitionIds: resolver.getAllPartitions(partitions),
        predicateShape: PREDICATE_SHAPE.SCATTER,
      };
    }
    values.push(keyConditions.values[0]);
  }

  const partitionId = resolver.resolvePartitionForKey(
    tableName,
    values,
    partitions,
    {tableInfo},
  );
  if (!partitionId) {
    return {
      partitionIds: [],
      predicateShape: PREDICATE_SHAPE.EQ,
    };
  }
  return {
    partitionIds: [partitionId],
    predicateShape: PREDICATE_SHAPE.EQ,
  };
}

/**
 * Find table metadata row in system cache.
 *
 * @param {Object|null} systemCache - System cache instance.
 * @param {string} tableName - Target table name.
 * @return {Object|null} Table metadata row or null.
 */
function findTableInCache(systemCache, tableName) {
  if (!systemCache || !tableName) return null;
  try {
    if (typeof systemCache.get === 'function') {
      const row = systemCache.get(TABLES.TABLES, tableName);
      if (row) return row;
    }
    if (typeof systemCache.find === 'function') {
      const row = systemCache.find(TABLES.TABLES, (t) =>
        t?.table_name === tableName || t?.tableName === tableName,
      );
      if (row) return row;
    }
    if (typeof systemCache.getAll === 'function') {
      const all = systemCache.getAll(TABLES.TABLES) || [];
      return all.find((t) =>
        t?.table_name === tableName ||
        t?.tableName === tableName ||
        t?.table_id === tableName ||
        t?.tableId === tableName,
      ) || null;
    }
  } catch {
    return null;
  }
  return null;
}

export {
  findTableInCache,
  resolveColumnType,
  resolveCompositeKeyPartitions,
};
