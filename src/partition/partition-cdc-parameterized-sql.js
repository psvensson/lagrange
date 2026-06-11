/**
 * Parameterized SQL helpers for PartitionCDCGenerator.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {extractConjunctiveWhereColumns} from './partition-sql-parser.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';

const CDC_SYNC_SECTION = Object.freeze({
  INSERT_ROW_FETCH: 'cdc_insert_row_fetch',
  UPDATE_ROW_FETCH: 'cdc_update_row_fetch',
});

/**
 * Extract data from parameterized INSERT SQL.
 * @param {Object} options - Extraction dependencies.
 * @param {string} options.sql - SQL statement.
 * @param {Array} options.params - Parameter values.
 * @param {string} options.tableName - Table name.
 * @param {Object} options.logger - Logger instance.
 * @param {Function} options.fetchInsertRow - Row fetch callback.
 * @return {Object} Extracted data.
 */
export function extractParamInsertData({
  sql,
  params,
  tableName,
  logger,
  fetchInsertRow,
}) {
  const columnsMatch = sql.match(
    /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
  );
  if (!columnsMatch) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
      sql: sql.substring(
        NUM.ZERO,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
    return {};
  }

  const columns = columnsMatch[NUM.ONE].split(
    PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
  ).map((c) => c.trim());
  if (columns.length !== params.length) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: columns.length,
      params: params.length,
    });
    return {};
  }

  const data = {};
  for (let i = NUM.ZERO; i < columns.length; i++) {
    data[columns[i]] = params[i];
  }

  logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
    tableName,
    dataKeys: Object.keys(data),
  });

  return fetchInsertRow(
    tableName,
    columns[NUM.ZERO],
    data[columns[NUM.ZERO]],
    data,
  );
}

/**
 * Extract data from parameterized UPDATE SQL.
 * @param {Object} options - Extraction dependencies.
 * @param {string} options.sql - SQL statement.
 * @param {Array} options.params - Parameter values.
 * @param {string} options.tableName - Table name.
 * @param {Object} options.logger - Logger instance.
 * @param {Function} options.fetchUpdatedRow - Row fetch callback.
 * @return {Object} Extracted data.
 */
export function extractParamUpdateData({
  sql,
  params,
  tableName,
  logger,
  fetchUpdatedRow,
}) {
  const setMatch = sql.match(/\bSET\s+([\s\S]+?)\s+\bWHERE\b/i);
  const whereMatch = sql.match(/\bWHERE\s+([\s\S]+)$/i);

  if (!setMatch) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
      sql: sql.substring(
        NUM.ZERO,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
    return {};
  }

  const setColumns = setMatch[NUM.ONE].split(
    PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
  ).map((part) => {
    const match = part.trim().match(/^(\w+)\s*=/);
    return match ? match[NUM.ONE] : null;
  }).filter(Boolean);

  const whereColumns = whereMatch ?
    extractConjunctiveWhereColumns(whereMatch[NUM.ONE]) :
    [];

  const allColumns = [...setColumns, ...whereColumns];
  if (allColumns.length !== params.length) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, {
      columns: allColumns.length,
      params: params.length,
    });
    return {};
  }

  const data = {};
  let paramIndex = NUM.ZERO;
  for (const column of setColumns) {
    data[column] = params[paramIndex];
    paramIndex += NUM.ONE;
  }
  for (const column of whereColumns) {
    const value = params[paramIndex];
    paramIndex += NUM.ONE;
    if (!Object.prototype.hasOwnProperty.call(data, column)) {
      data[column] = value;
    }
  }

  logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, {
    tableName,
    dataKeys: Object.keys(data),
  });

  const whereClause = {};
  for (let i = NUM.ZERO; i < whereColumns.length; i++) {
    whereClause[whereColumns[i]] = params[setColumns.length + i];
  }

  const authoritativeRow = fetchUpdatedRow(tableName, whereClause);
  if (authoritativeRow) {
    return authoritativeRow;
  }

  return data;
}

/**
 * Extract data from parameterized DELETE SQL.
 * @param {Object} options - Extraction dependencies.
 * @param {string} options.sql - SQL statement.
 * @param {Array} options.params - Parameter values.
 * @param {string} options.tableName - Table name.
 * @param {Object} options.logger - Logger instance.
 * @return {Object} Extracted data.
 */
export function extractParamDeleteData({
  sql,
  params,
  tableName,
  logger,
}) {
  const whereMatch = sql.match(/\bWHERE\s+([\s\S]+)$/i);
  if (!whereMatch) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, {
      sql: sql.substring(
        NUM.ZERO,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
    return {};
  }

  const whereContent = whereMatch[NUM.ONE].trim();
  const whereColumns = extractConjunctiveWhereColumns(whereContent);

  if (whereColumns.length !== params.length) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, {
      columns: whereColumns.length,
      params: params.length,
      whereContent,
    });
    return {};
  }

  const data = {};
  for (let i = NUM.ZERO; i < whereColumns.length; i++) {
    data[whereColumns[i]] = params[i];
  }

  logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, {
    tableName,
    dataKeys: Object.keys(data),
  });

  return data;
}

/**
 * Fetch the stored row after an INSERT/UPSERT so CDC emits canonical data.
 * @param {Object} options - Row fetch dependencies.
 * @param {string} options.tableName - Table name.
 * @param {string|undefined} options.keyColumn - Key column.
 * @param {*} options.keyValue - Key value.
 * @param {Object} options.fallbackData - Fallback CDC data.
 * @param {Object} options.db - SQLite database handle.
 * @param {Object} options.logger - Logger instance.
 * @return {Object} Stored row or fallback data.
 */
export function fetchInsertRow({
  tableName,
  keyColumn,
  keyValue,
  fallbackData,
  db,
  logger,
  partitionId = null,
  replicaId = null,
}) {
  if (!keyColumn || keyValue === null || keyValue === undefined || !db) {
    return fallbackData;
  }

  try {
    const row = trackSyncSection(CDC_SYNC_SECTION.INSERT_ROW_FETCH, () => {
      const stmt = db.prepare(
        `SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`,
      );
      return stmt.get(keyValue);
    });
    if (row) {
      if (tableName !== SYSTEM_TABLE_NAME.LOGS) {
        logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
          tableName,
          rowKeys: Object.keys(row),
          // CL-017: which replica's db answered — required to attribute
          // post-churn row divergence between co-located replicas.
          cdcPartitionId: partitionId,
          cdcReplicaId: replicaId,
        });
      }
      return row;
    }
  } catch (err) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, {
      tableName,
      error: err.message,
      cdcPartitionId: partitionId,
      cdcReplicaId: replicaId,
    });
    throw err;
  }

  return fallbackData;
}

/**
 * Fetch the stored row after an UPDATE so CDC emits canonical data.
 * @param {Object} options - Row fetch dependencies.
 * @param {string} options.tableName - Table name.
 * @param {Object} options.whereClause - WHERE clause values.
 * @param {Object} options.db - SQLite database handle.
 * @param {Object} options.logger - Logger instance.
 * @return {Object|null} Stored row or null.
 */
export function fetchUpdatedRow({
  tableName,
  whereClause,
  db,
  logger,
  partitionId = null,
  replicaId = null,
}) {
  if (!db ||
    !whereClause ||
    typeof whereClause !== TYPEOF.OBJECT ||
    Object.keys(whereClause).length === NUM.ZERO) {
    return null;
  }

  const entries = Object.entries(whereClause)
    .filter(([_key, value]) => value !== null && value !== undefined);
  if (entries.length === NUM.ZERO) {
    return null;
  }

  if (tableName !== SYSTEM_TABLE_NAME.LOGS) {
    const [keyColumn, keyValue] = entries[NUM.ZERO];
    logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, {
      tableName,
      keyColumn,
      keyValue,
      cdcPartitionId: partitionId,
      cdcReplicaId: replicaId,
    });
  }

  const whereSql = entries
    .map(([key]) => `${key} = ?`)
    .join(' AND ');
  const whereValues = entries.map(([_key, value]) => value);

  try {
    const row = trackSyncSection(CDC_SYNC_SECTION.UPDATE_ROW_FETCH, () => {
      const stmt = db.prepare(
        `SELECT * FROM ${tableName} WHERE ${whereSql}`,
      );
      return stmt.get(...whereValues);
    });
    if (row) {
      if (tableName !== SYSTEM_TABLE_NAME.LOGS) {
        logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, {
          tableName,
          rowKeys: Object.keys(row),
          cdcPartitionId: partitionId,
          cdcReplicaId: replicaId,
        });
      }
      return row;
    }

    if (tableName !== SYSTEM_TABLE_NAME.LOGS) {
      const [keyColumn, keyValue] = entries[NUM.ZERO];
      logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {
        tableName,
        keyColumn,
        keyValue,
        // CL-017: the divergence witness — which replica's db lacks the row.
        cdcPartitionId: partitionId,
        cdcReplicaId: replicaId,
      });
    }
  } catch (err) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, {
      cdcPartitionId: partitionId,
      cdcReplicaId: replicaId,
      tableName,
      error: err.message,
    });
    throw err;
  }

  return null;
}
