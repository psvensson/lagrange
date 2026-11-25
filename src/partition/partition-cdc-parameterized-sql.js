/**
 * Parameterized SQL helpers for PartitionCDCGenerator.
 */

import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {
  extractDataFromParameterizedSQL,
  extractUpdateWhereColumns,
} from './partition-sql-parser.js';
import {admitCdcRowFetchLog} from './partition-cdc-log-throttle.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
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
  const data = extractDataFromParameterizedSQL(
    sql,
    params,
    tableName,
    PARTITION_SERVICE_OPERATION.INSERT,
    logger,
  );
  const columns = Object.keys(data);
  if (columns.length === 0) {
    return {};
  }

  const keyColumn = columns[0];
  return fetchInsertRow(tableName, keyColumn, data[keyColumn], data);
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
  const data = extractDataFromParameterizedSQL(
    sql,
    params,
    tableName,
    PARTITION_SERVICE_OPERATION.UPDATE,
    logger,
  );
  if (Object.keys(data).length === 0) {
    return {};
  }

  const whereColumns = extractUpdateWhereColumns(sql);
  const whereClause = {};
  for (const col of whereColumns) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      whereClause[col] = data[col];
    }
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
  return extractDataFromParameterizedSQL(
    sql,
    params,
    tableName,
    PARTITION_SERVICE_OPERATION.DELETE,
    logger,
  );
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
        const suppressed = admitCdcRowFetchLog(
          `${PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW}:${tableName}:${replicaId ?? ''}`,
        );
        if (suppressed !== null) {
          logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
            tableName,
            rowKeys: Object.keys(row),
            // CL-017: which replica's db answered — required to attribute
            // post-churn row divergence between co-located replicas.
            cdcPartitionId: partitionId,
            cdcReplicaId: replicaId,
            suppressedSinceLastEmit: suppressed,
          });
        }
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
    typeof whereClause !== 'object' ||
    Object.keys(whereClause).length === 0) {
    return null;
  }

  const entries = Object.entries(whereClause)
    .filter(([_key, value]) => value !== null && value !== undefined);
  if (entries.length === 0) {
    return null;
  }

  if (tableName !== SYSTEM_TABLE_NAME.LOGS) {
    const [keyColumn, keyValue] = entries[0];
    const suppressed = admitCdcRowFetchLog(
      `${PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW}:${tableName}:${replicaId ?? ''}`,
    );
    if (suppressed !== null) {
      logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, {
        tableName,
        keyColumn,
        keyValue,
        cdcPartitionId: partitionId,
        cdcReplicaId: replicaId,
        suppressedSinceLastEmit: suppressed,
      });
    }
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
        const suppressed = admitCdcRowFetchLog(
          `${PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW}:${tableName}:${replicaId ?? ''}`,
        );
        if (suppressed !== null) {
          logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, {
            tableName,
            rowKeys: Object.keys(row),
            cdcPartitionId: partitionId,
            cdcReplicaId: replicaId,
            suppressedSinceLastEmit: suppressed,
          });
        }
      }
      return row;
    }

    if (tableName !== SYSTEM_TABLE_NAME.LOGS) {
      const [keyColumn, keyValue] = entries[0];
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
