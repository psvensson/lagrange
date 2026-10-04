/**
 * SQL parsing helpers for CDC event generation.
 * Extracted from PartitionService — pure parsing logic that operates
 * on SQL strings, a logger, and an optional DB handle.
 */

import {STRING} from '../constants/index.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {admitCdcRowFetchLog} from './partition-cdc-log-throttle.js';

const CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
]);
const arrayPush = Function.call.bind(Array.prototype.push);
const numberFrom = Number;
const numberIsNaN = Number.isNaN;
const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const objectKeys = Object.keys;
const regExpExec = Function.call.bind(RegExp.prototype.exec);
const setHas = Function.call.bind(Set.prototype.has);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringSubstring = Function.call.bind(String.prototype.substring);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringTrim = Function.call.bind(String.prototype.trim);
const CONJUNCTIVE_AND_PATTERN = /\s+AND\s+/gi;
const EQUALITY_COLUMN_PATTERN = /^(\w+)\s*=/u;

function splitConjunctiveParts(value) {
  const parts = [];
  let start = 0;
  CONJUNCTIVE_AND_PATTERN.lastIndex = 0;
  let match = regExpExec(CONJUNCTIVE_AND_PATTERN, value);
  while (match) {
    arrayPush(parts, stringSlice(value, start, match.index));
    start = match.index + match[0].length;
    match = regExpExec(CONJUNCTIVE_AND_PATTERN, value);
  }
  arrayPush(parts, stringSlice(value, start));
  CONJUNCTIVE_AND_PATTERN.lastIndex = 0;
  return parts;
}

function stripOuterParens(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '(') start += 1;
  while (end > start && value[end - 1] === ')') end -= 1;
  return stringSlice(value, start, end);
}

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

  const parts = splitConjunctiveParts(stringTrim(whereContent));
  const columns = [];
  for (let index = 0; index < parts.length; index += 1) {
    const cleanPart = stripOuterParens(stringTrim(parts[index]));
    const match = regExpExec(EQUALITY_COLUMN_PATTERN, cleanPart);
    if (match) arrayPush(columns, match[1]);
  }
  return columns;
}

/**
 * Whether to emit info-level logs for CDC row fetches on a given table.
 * @param {string} tableName - Table name.
 * @return {boolean}
 */
function shouldEmitCdcRowFetchInfoLog(tableName) {
  return !setHas(CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES, tableName);
}

// Route the CDC row-fetch info diagnostics through the shared throttle so a
// high-volume mutation stream cannot flood stdout (live run-2026-08-04-full:
// 3300+ such lines on one node backed up its stdout pipe).
function admitCdcFetch(message, tableName) {
  return shouldEmitCdcRowFetchInfoLog(tableName) ?
    admitCdcRowFetchLog(`${message}:${tableName}`) :
    null;
}

/**
 * Parse a single value token from a SQL VALUES clause.
 * @param {string} val - Value string.
 * @return {*} Parsed value.
 */
export function parseValue(val) {
  if (stringToUpperCase(val) === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE) {
    return null;
  }
  // Remove quotes
  if ((stringStartsWith(val, PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) &&
    stringEndsWith(val, PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) ||
      (stringStartsWith(val, PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) &&
      stringEndsWith(val, PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))) {
    return stringSlice(val, 1, -1);
  }
  // Try to parse as number
  const num = numberFrom(val);
  if (!numberIsNaN(num)) {
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

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (!inQuote && (char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE ||
      char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      // Check for escaped quote
      if (i + 1 < valuesStr.length &&
        valuesStr[i + 1] === quoteChar) {
        current += char;
        i += 1; // Skip next quote
      } else {
        inQuote = false;
        quoteChar = null;
      }
    } else if (!inQuote && char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA) {
      arrayPush(values, parseValue(stringTrim(current)));
      current = STRING.EMPTY;
    } else {
      current += char;
    }
  }

  // Don't forget the last value
  if (stringTrim(current)) {
    arrayPush(values, parseValue(stringTrim(current)));
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
  const columnsMatch = regExpExec(
    /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
    sql,
  );
  const valuesMatch = regExpExec(/VALUES\s*\(([^)]+)\)/i, sql);

  if (!columnsMatch || !valuesMatch) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, {
      sql: stringSubstring(sql, 
        0,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
    return {};
  }

  const rawColumns = stringSplit(
    columnsMatch[1],
    PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
  );
  const columns = [];
  for (let columnIndex = 0; columnIndex < rawColumns.length; columnIndex += 1) {
    arrayPush(columns, stringTrim(rawColumns[columnIndex]));
  }
  const valuesStr = valuesMatch[1];

  // Parse values - handle quoted strings and numbers
  const values = parseValuesFromSQL(valuesStr);

  if (columns.length !== values.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, {
      columns: columns.length,
      values: values.length,
    });
    return {};
  }

  // Build data object
  const data = {};
  for (let i = 0; i < columns.length; i++) {
    data[columns[i]] = values[i];
  }

  // Try to fetch the full row from DB to get any default values
  // Find the primary key column (usually first column or 'id')
  const pkColumn = columns[0];
  const pkValue = values[0];

  if (db && pkValue !== null && pkValue !== undefined) {
    try {
      const stmt = db.prepare(
        `SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`,
      );
      const row = stmt.get(pkValue);
      if (row) {
        const suppressed =
          admitCdcFetch(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, tableName);
        if (suppressed !== null) {
          logger?.info?.(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
            tableName,
            rowKeys: objectKeys(row),
            suppressedSinceLastEmit: suppressed,
          });
        }
        return row;
      }
    } catch (err) {
      logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, {
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
  const whereMatch = regExpExec(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i, sql);
  if (whereMatch) {
    const keyColumn = whereMatch[1];
    const keyValue = whereMatch[2];
    {
      const suppressed =
        admitCdcFetch(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, tableName);
      if (suppressed !== null) {
        logger?.info?.(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, {
          tableName,
          keyColumn,
          keyValue,
          suppressedSinceLastEmit: suppressed,
        });
      }
    }
    if (!db) {
      return {[keyColumn]: keyValue};
    }

    // Query the updated row to get full data for CDC
    try {
      const stmt = db.prepare(
        `SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`,
      );
      const row = stmt.get(keyValue);
      if (row) {
        const suppressed =
          admitCdcFetch(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, tableName);
        if (suppressed !== null) {
          logger?.info?.(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, {
            tableName,
            rowKeys: objectKeys(row),
            suppressedSinceLastEmit: suppressed,
          });
        }
        return row;
      } else {
        logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {
          tableName,
          keyColumn,
          keyValue,
        });
      }
    } catch (err) {
      logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, {
        tableName,
        error: err.message,
      });
      throw err;
    }
  } else {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, {
      sql: stringSubstring(sql, 
        0,
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
  const whereMatch = regExpExec(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i, sql);
  if (whereMatch) {
    const keyColumn = whereMatch[1];
    const keyValue = whereMatch[2];
    return {[keyColumn]: keyValue};
  }
  logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, {
    sql: stringSubstring(sql, 
      0,
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
  if (!params || params.length === 0) {
    return {};
  }

  if (operationType === PARTITION_SERVICE_OPERATION.INSERT ||
    operationType === PARTITION_SERVICE_OPERATION.UPSERT) {
    // Parse INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
    const columnsMatch = regExpExec(
      /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
      sql,
    );
    if (!columnsMatch) {
      logger?.warn?.(
        PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
          sql: stringSubstring(sql, 
            0,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        },
      );
      return {};
    }

    const rawColumns = stringSplit(
      columnsMatch[1],
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    );
    const columns = [];
    for (let columnIndex = 0; columnIndex < rawColumns.length; columnIndex += 1) {
      arrayPush(columns, stringTrim(rawColumns[columnIndex]));
    }
    if (columns.length !== params.length) {
      logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
        columns: columns.length,
        params: params.length,
      });
      return {};
    }

    // Build data object from columns and params
    const data = {};
    for (let i = 0; i < columns.length; i++) {
      data[columns[i]] = params[i];
    }

    logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
      tableName,
      dataKeys: objectKeys(data),
    });

    return data;
  }

  if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
    // Parse UPDATE table SET col1 = ?, col2 = ? WHERE pk = ?
    // Use [\s\S] so multiline SQL emitted by query builders stays parseable.
    const setMatch = regExpExec(/\bSET\s+([\s\S]+?)\s+\bWHERE\b/i, sql);
    const whereMatch = regExpExec(/\bWHERE\s+([\s\S]+)$/i, sql);

    if (!setMatch) {
      logger?.warn?.(
        PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
          sql: stringSubstring(sql, 
            0,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        },
      );
      return {};
    }

    // Extract column names from SET clause
    const rawSetColumns = stringSplit(
      setMatch[1],
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    );
    const setColumns = [];
    for (let columnIndex = 0;
      columnIndex < rawSetColumns.length;
      columnIndex += 1) {
      const match = regExpExec(
        EQUALITY_COLUMN_PATTERN,
        stringTrim(rawSetColumns[columnIndex]),
      );
      if (match) arrayPush(setColumns, match[1]);
    }

    // Extract column names from WHERE clause
    // Handle parentheses around the WHERE clause: WHERE (col = ?)
    const whereColumns = whereMatch ?
      extractConjunctiveWhereColumns(whereMatch[1]) :
      [];

    const allColumns = [];
    for (let columnIndex = 0; columnIndex < setColumns.length; columnIndex += 1) {
      arrayPush(allColumns, setColumns[columnIndex]);
    }
    for (let columnIndex = 0; columnIndex < whereColumns.length; columnIndex += 1) {
      arrayPush(allColumns, whereColumns[columnIndex]);
    }
    if (allColumns.length !== params.length) {
      logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, {
        columns: allColumns.length,
        params: params.length,
      });
      return {};
    }

    // Build data object while preserving UPDATE semantics:
    // SET-column values are authoritative; WHERE-only columns backfill keys.
    const data = {};
    let paramIndex = 0;
    for (let columnIndex = 0; columnIndex < setColumns.length; columnIndex += 1) {
      const column = setColumns[columnIndex];
      data[column] = params[paramIndex];
      paramIndex += 1;
    }
    for (let columnIndex = 0;
      columnIndex < whereColumns.length;
      columnIndex += 1) {
      const column = whereColumns[columnIndex];
      const value = params[paramIndex];
      paramIndex += 1;
      if (!objectHasOwn(data, column)) {
        data[column] = value;
      }
    }

    logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, {
      tableName,
      dataKeys: objectKeys(data),
    });

    return data;
  }

  if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
    // Parse DELETE FROM table WHERE pk = ? or WHERE (pk = ?)
    // Use [\s\S] for multiline predicates.
    const whereMatch = regExpExec(/\bWHERE\s+([\s\S]+)$/i, sql);
    if (!whereMatch) {
      logger?.warn?.(
        PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, {
          sql: stringSubstring(sql, 
            0,
            PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
          ),
        },
      );
      return {};
    }

    const whereContent = stringTrim(whereMatch[1]);
    const whereColumns = extractConjunctiveWhereColumns(whereContent);

    if (whereColumns.length !== params.length) {
      logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, {
        columns: whereColumns.length,
        params: params.length,
        whereContent,
      });
      return {};
    }

    const data = {};
    for (let i = 0; i < whereColumns.length; i++) {
      data[whereColumns[i]] = params[i];
    }

    logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, {
      tableName,
      dataKeys: objectKeys(data),
    });

    return data;
  }

  return {};
}
