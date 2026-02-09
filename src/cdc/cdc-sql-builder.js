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

import {NUM, TYPEOF} from '../constants/index.js';
import {
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CDC_ERROR_MSG,
  CDC_SQL,
} from './cdc-constants.js';

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
      if (val !== null && typeof val === TYPEOF.OBJECT) {
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
      if (val !== null && typeof val === TYPEOF.OBJECT) {
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
   * Normalize schema default values (strip quotes, parse numbers).
   * @param {string|number|null} value - Default value.
   * @return {string|number|null} Normalized default.
   */
  normalizeDefaultValue(value) {
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof value !== TYPEOF.STRING) {
      return value;
    }
    const trimmed = value.trim();
    if ((trimmed.startsWith('\'') && trimmed.endsWith('\'')) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return trimmed.slice(NUM.ONE, NUM.NEGATIVE_ONE);
    }
    if (trimmed.toLowerCase() === 'null') {
      return null;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
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
      rowData[column.name] = this.normalizeDefaultValue(column.defaultValue);
    }
  }

  /**
   * Extract table name from SQL statement.
   * Supports INSERT INTO, UPDATE, DELETE FROM, and INSERT OR REPLACE INTO.
   *
   * @param {string} sql - SQL query string.
   * @return {string|null} Table name or null if not found.
   */
  extractTableNameFromSQL(sql) {
    if (!sql || typeof sql !== TYPEOF.STRING) {
      return null;
    }

    // INSERT INTO table_name or INSERT OR REPLACE INTO table_name
    let match = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    if (match) {
      return match[NUM.ONE];
    }

    // UPDATE table_name SET
    match = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (match) {
      return match[NUM.ONE];
    }

    // DELETE FROM table_name
    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      return match[NUM.ONE];
    }

    // SELECT FROM table_name (for completeness, though not used in bootstrap)
    match = sql.match(/FROM\s+(\w+)/i);
    if (match) {
      return match[NUM.ONE];
    }

    return null;
  }
}

// Export singleton instance for convenience
const cdcSqlBuilder = new CDCSqlBuilder();

export {CDCSqlBuilder, cdcSqlBuilder};
