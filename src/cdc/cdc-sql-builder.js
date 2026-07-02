/**
 * CDC SQL Builder - Builds SQL queries for CDC operations.
 *
 * This module provides SQL building logic extracted from CDCIntegrationService.
 * It handles building INSERT, UPDATE, DELETE, and UPSERT SQL statements.
 *
 * Requirements: 1.4, 1.8
 *
 * @module cdc/cdc-sql-builder
 */

import {
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CDC_ERROR_MSG,
  CDC_SQL,
} from './cdc-constants.js';

const LOCAL_STR_SQUOTE = '\'';
const LOCAL_STR_DQUOTE = '"';
const LOCAL_STR_NULL = 'null';

const DEFAULT_VALUE_NORMALIZATION_STATE = Object.freeze({
  NULL: 'null',
  UNDEFINED: 'undefined',
  VALUE: 'value',
});

const TABLE_NAME_EXTRACTION_STATE = Object.freeze({
  FOUND: 'found',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
});

function materializeNormalizedDefaultValue(result) {
  if (result.state === DEFAULT_VALUE_NORMALIZATION_STATE.VALUE) {
    return result.value;
  }
  if (result.state === DEFAULT_VALUE_NORMALIZATION_STATE.NULL) {
    return null;
  }
  return undefined;
}

/**
 * CDCSqlBuilder provides SQL building utilities for CDC operations.
 *
 * This class is responsible for:
 * - Building INSERT column lists and value placeholders
 * - Building UPDATE SET clauses
 * - Building WHERE clauses
 * - Filtering data to valid table columns
 * - Normalizing default values from schema
 *
 * @interface
 *
 * @description
 * CDCSqlBuilder provides SQL building logic that was previously embedded
 * in CDCIntegrationService. It is stateless and can be used as a utility.
 *
 * Requirements: 1.4, 1.8
 *
 * @example
 * const builder = new CDCSqlBuilder();
 * const {columns, placeholders, values} = builder.buildInsertParts(data);
 * const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
 */
class CDCSqlBuilder {
  /**
   * Build column list and value placeholders for INSERT.
   * @param {Object} data - Row data.
   * @return {Object} {columns, placeholders, values}
   */
  buildInsertParts(data) {
    const columns = Object.keys(data);
    const placeholders = columns
      .map(() => CDC_SQL.PARAM_PLACEHOLDER)
      .join(CDC_SQL.COMMA_SPACE);
    const values = columns.map((col) => {
      const val = data[col];
      // Serialize objects/arrays to JSON
      if (val !== null && typeof val === 'object') {
        return JSON.stringify(val);
      }
      return val;
    });
    return {columns: columns.join(CDC_SQL.COMMA_SPACE), placeholders, values};
  }

  /**
   * Build SET clause for UPDATE.
   * @param {Object} data - Data to update.
   * @return {Object} {setClause, values}
   */
  buildUpdateParts(data) {
    const columns = Object.keys(data);
    const setClause = columns
      .map((col) => `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.COMMA_SPACE);
    const values = columns.map((col) => {
      const val = data[col];
      if (val !== null && typeof val === 'object') {
        return JSON.stringify(val);
      }
      return val;
    });
    return {setClause, values};
  }

  /**
   * Build WHERE clause from conditions.
   * @param {Object} whereClause - WHERE conditions.
   * @return {Object} {whereStr, values}
   */
  buildWhereParts(whereClause) {
    const conditions = Object.keys(whereClause);
    const whereStr = conditions
      .map((col) => `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.WHERE_AND);
    const values = conditions.map((col) => whereClause[col]);
    return {whereStr, values};
  }

  /**
   * Filter row data to known columns for the target system table.
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data.
   * @return {Object} Filtered row data.
   */
  filterDataForTable(tableName, data) {
    const schema = getSchemaByTableName(tableName);
    if (!schema || !schema.columns) {
      throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
    }

    const allowed = new Set(schema.columns.map((column) => column.name));
    const filtered = {};

    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Normalize one schema default into an explicit result contract.
   * @param {string|number|null} value - Default value.
   * @return {Object} Explicit normalization result.
   */
  /**
   * Normalize one default value into an explicit result state.
   * @param {string|number|null} value
   * @return {Object}
   */
  normalizeDefaultValueResult(value) {
    if (value === undefined) {
      return Object.freeze({
        state: DEFAULT_VALUE_NORMALIZATION_STATE.UNDEFINED,
      });
    }
    if (value === null) {
      return Object.freeze({
        state: DEFAULT_VALUE_NORMALIZATION_STATE.NULL,
      });
    }
    if (typeof value !== 'string') {
      return Object.freeze({
        state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
        value,
      });
    }
    const trimmed = value.trim();
    if ((trimmed.startsWith(LOCAL_STR_SQUOTE) && trimmed.endsWith(LOCAL_STR_SQUOTE)) ||
        (trimmed.startsWith(LOCAL_STR_DQUOTE) && trimmed.endsWith(LOCAL_STR_DQUOTE))) {
      return Object.freeze({
        state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
        value: trimmed.slice(1, -1),
      });
    }
    if (trimmed.toLowerCase() === LOCAL_STR_NULL) {
      return Object.freeze({
        state: DEFAULT_VALUE_NORMALIZATION_STATE.NULL,
      });
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Object.freeze({
        state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
        value: Number(trimmed),
      });
    }
    return Object.freeze({
      state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
      value: trimmed,
    });
  }

  /**
   * Apply schema-defined defaults to missing fields.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   */
  applySchemaDefaults(schema, rowData) {
    for (const column of schema.columns) {
      if (rowData[column.name] !== undefined) {
        continue;
      }
      if (column.defaultValue === undefined) {
        continue;
      }
      const normalizedDefault =
        this.normalizeDefaultValueResult(column.defaultValue);
      if (normalizedDefault.state ===
          DEFAULT_VALUE_NORMALIZATION_STATE.UNDEFINED) {
        continue;
      }
      rowData[column.name] =
        materializeNormalizedDefaultValue(normalizedDefault);
    }
  }

  /**
   * Extract table name from SQL statement.
   * Supports INSERT INTO, UPDATE, DELETE FROM, and SQLite
   * INSERT OR <modifier> INTO statements.
   *
   * @param {string} sql - SQL query string.
   * @return {Object} Explicit table-name extraction result.
   */
  extractTableNameFromSQL(sql) {
    return this.extractTableNameResult(sql);
  }

  /**
   * Extract table name from SQL statement into an explicit result state.
   * @param {string} sql
   * @return {Object}
   */
  extractTableNameResult(sql) {
    if (!sql || typeof sql !== 'string') {
      return Object.freeze({
        state: TABLE_NAME_EXTRACTION_STATE.INVALID_INPUT,
      });
    }

    // INSERT INTO table_name or INSERT OR <modifier> INTO table_name
    let match = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state: TABLE_NAME_EXTRACTION_STATE.FOUND,
        tableName: match[1],
      });
    }

    // UPDATE table_name SET
    match = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (match) {
      return Object.freeze({
        state: TABLE_NAME_EXTRACTION_STATE.FOUND,
        tableName: match[1],
      });
    }

    // DELETE FROM table_name
    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state: TABLE_NAME_EXTRACTION_STATE.FOUND,
        tableName: match[1],
      });
    }

    // SELECT FROM table_name (for completeness, though not used in bootstrap)
    match = sql.match(/FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state: TABLE_NAME_EXTRACTION_STATE.FOUND,
        tableName: match[1],
      });
    }

    return Object.freeze({
      state: TABLE_NAME_EXTRACTION_STATE.NOT_FOUND,
    });
  }
}

// Export singleton instance for convenience
const cdcSqlBuilder = new CDCSqlBuilder();

export {CDCSqlBuilder, cdcSqlBuilder};
