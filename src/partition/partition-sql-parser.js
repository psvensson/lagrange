/**
 * SQL parsing helpers for CDC event generation.
 * Extracted from PartitionService — pure parsing logic that operates
 * on SQL strings, a logger, and an optional DB handle.
 */

import {NUM, STRING} from '../constants/index.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
]);

/**
 * Extract column names from a simple conjunctive WHERE clause.
 * Supports nested wrapping parentheses around equality predicates.
 * @param {string} whereContent - WHERE clause content without the WHERE keyword.
 * @return {Array<string>} Extracted column names.
 */
export function extractConjunctiveWhereColumns(whereContent) {
  if (!whereContent) {
    return [];
  }

  return whereContent.trim().split(/\s+AND\s+/i)
    .map((part) => {
      const cleanPart = part.trim()
        .replace(/^\(+|\)+$/g, STRING.EMPTY);
      const match = cleanPart.match(/^(\w+)\s*=/);
      return match ? match[NUM.ONE] : null;
    })
    .filter(Boolean);
}

/**
 * Whether to emit info-level logs for CDC row fetches on a given table.
 * @param {string} tableName - Table name.
 * @return {boolean}
 */
function shouldEmitCdcRowFetchInfoLog(tableName) {
  return !CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES.has(tableName);
}

/**
 * Parse a single value token from a SQL VALUES clause.
 * @param {string} val - Value string.
 * @return {*} Parsed value.
 */
export function parseValue(val) {
  if (val.toUpperCase() === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE) {
    return null;
  }
  // Remove quotes
  if ((val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) &&
    val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) ||
      (val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) &&
      val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))) {
    return val.slice(NUM.ONE, -NUM.ONE);
  }
  // Try to parse as number
  const num = Number(val);
  if (!isNaN(num)) {
    return num;
  }
  return val;
}

/**
 * Parse values from a SQL VALUES clause string.
 * Handles quoted strings, escaped quotes, numbers, and NULL.
 * @param {string} valuesStr - Values string like "'val1', 123, NULL".
 * @return {Array} Parsed values.
 */
export function parseValuesFromSQL(valuesStr) {
  const values = [];
  let current = STRING.EMPTY;
  let inQuote = false;
  let quoteChar = null;

  for (let i = NUM.ZERO; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (!inQuote && (char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE ||
      char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      // Check for escaped quote
      if (i + NUM.ONE < valuesStr.length &&
        valuesStr[i + NUM.ONE] === quoteChar) {
        current += char;
        i += NUM.ONE; // Skip next quote
      } else {
        inQuote = false;
        quoteChar = null;
      }
    } else if (!inQuote && char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA) {
      values.push(parseValue(current.trim()));
      current = STRING.EMPTY;
    } else {
      current += char;
    }
  }

  // Don't forget the last value
  if (current.trim()) {
    values.push(parseValue(current.trim()));
  }

  return values;
}

/**
 * Extract column/value data from an INSERT SQL statement.
 * Falls back to querying the DB for the full row when possible.
 * @param {string} sql - INSERT SQL statement.
 * @param {string} tableName - Table name.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractInsertDataFromSQL(sql, tableName, db, logger) {
  // Parse INSERT INTO table (col1, col2) VALUES ('val1', 'val2')
  // or INSERT OR REPLACE/IGNORE INTO table (col1, col2) VALUES ('val1', 'val2')
  const columnsMatch = sql.match(
    /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
  );
  const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);

  if (!columnsMatch || !valuesMatch) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, {
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
  const valuesStr = valuesMatch[NUM.ONE];

  // Parse values - handle quoted strings and numbers
  const values = parseValuesFromSQL(valuesStr);

  if (columns.length !== values.length) {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, {
      columns: columns.length,
      values: values.length,
    });
    return {};
  }

  // Build data object
  const data = {};
  for (let i = NUM.ZERO; i < columns.length; i++) {
    data[columns[i]] = values[i];
  }

  // Try to fetch the full row from DB to get any default values
  // Find the primary key column (usually first column or 'id')
  const pkColumn = columns[NUM.ZERO];
  const pkValue = values[NUM.ZERO];

  if (pkValue !== null && pkValue !== undefined) {
    try {
      const stmt = db.prepare(
        `SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`,
      );
      const row = stmt.get(pkValue);
      if (row) {
        if (shouldEmitCdcRowFetchInfoLog(tableName)) {
          logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
            tableName,
            rowKeys: Object.keys(row),
          });
        }
        return row;
      }
    } catch (err) {
      logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, {
        tableName,
        error: err.message,
      });
      throw err;
    }
  }

  return data;
}

/**
 * Extract data from an UPDATE SQL statement by querying the updated row.
 * @param {string} sql - UPDATE SQL statement.
 * @param {string} tableName - Table name.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractUpdateDataFromSQL(sql, tableName, db, logger) {
  // Match WHERE clause with optional parentheses: WHERE (col = 'val') or WHERE col = 'val'
  const whereMatch = sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
  if (whereMatch) {
    const keyColumn = whereMatch[NUM.ONE];
    const keyValue = whereMatch[NUM.TWO];
    if (shouldEmitCdcRowFetchInfoLog(tableName)) {
      logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, {
        tableName,
        keyColumn,
        keyValue,
      });
    }
    // Query the updated row to get full data for CDC
    try {
      const stmt = db.prepare(
        `SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`,
      );
      const row = stmt.get(keyValue);
      if (row) {
        if (shouldEmitCdcRowFetchInfoLog(tableName)) {
          logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, {
            tableName,
            rowKeys: Object.keys(row),
          });
        }
        return row;
      } else {
        logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {
          tableName,
          keyColumn,
          keyValue,
        });
      }
    } catch (err) {
      logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, {
        tableName,
        error: err.message,
      });
      throw err;
    }
  } else {
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, {
      sql: sql.substring(
        NUM.ZERO,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
  }
  return {};
}

/**
 * Extract data from a DELETE SQL statement.
 * @param {string} sql - DELETE SQL statement.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractDeleteDataFromSQL(sql, logger) {
  // Match WHERE clause: WHERE col = 'val'
  const whereMatch = sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
  if (whereMatch) {
    const keyColumn = whereMatch[NUM.ONE];
    const keyValue = whereMatch[NUM.TWO];
    return {[keyColumn]: keyValue};
  }
  logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, {
    sql: sql.substring(
      NUM.ZERO,
      PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
    ),
  });
  return {};
}

/**
 * Extract data from parameterized SQL (SQL with ? placeholders and params).
 * @param {string} sql - SQL statement with ? placeholders.
 * @param {Array} params - Parameter values.
 * @param {string} tableName - Table name.
 * @param {string} operationType - INSERT, UPDATE, or DELETE.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractDataFromParameterizedSQL(
  sql, params, tableName, operationType, logger,
) {
  if (!params || params.length === NUM.ZERO) {
    return {};
  }

  if (operationType === PARTITION_SERVICE_OPERATION.INSERT ||
    operationType === PARTITION_SERVICE_OPERATION.UPSERT) {
    // Parse INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
    const columnsMatch = sql.match(
      /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
    );
    if (!columnsMatch) {
      logger.warn(
        PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
          sql: sql.substring(
            NUM.ZERO,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        },
      );
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

    // Build data object from columns and params
    const data = {};
    for (let i = NUM.ZERO; i < columns.length; i++) {
      data[columns[i]] = params[i];
    }

    logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
      tableName,
      dataKeys: Object.keys(data),
    });

    return data;
  }

  if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
    // Parse UPDATE table SET col1 = ?, col2 = ? WHERE pk = ?
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    const whereMatch = sql.match(/WHERE\s+(.+)$/i);

    if (!setMatch) {
      logger.warn(
        PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
          sql: sql.substring(
            NUM.ZERO,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        },
      );
      return {};
    }

    // Extract column names from SET clause
    const setColumns = setMatch[NUM.ONE].split(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    ).map((part) => {
      const match = part.trim().match(/^(\w+)\s*=/);
      return match ? match[NUM.ONE] : null;
    }).filter(Boolean);

    // Extract column names from WHERE clause
    // Handle parentheses around the WHERE clause: WHERE (col = ?)
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

    // Build data object
    const data = {};
    for (let i = NUM.ZERO; i < allColumns.length; i++) {
      data[allColumns[i]] = params[i];
    }

    logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, {
      tableName,
      dataKeys: Object.keys(data),
    });

    return data;
  }

  if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
    // Parse DELETE FROM table WHERE pk = ? or WHERE (pk = ?)
    const whereMatch = sql.match(/WHERE\s+\(?(.+?)\)?$/i);
    if (!whereMatch) {
      logger.warn(
        PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, {
          sql: sql.substring(
            NUM.ZERO,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        },
      );
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

  return {};
}
