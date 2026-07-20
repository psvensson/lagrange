/**
 * Table Creation Service - Schema and partition-key derivation.
 * Owns PRIMARY KEY -> partition-key derivation, schema-definition construction
 * from the parsed column AST, and SQL-to-SQLite data-type normalization.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {QUERY_ERROR_MSG} from './query-constants.js';
import {TABLE_CREATION_SERVICE_LITERAL} from './table-creation-service-completion.js';


/**
 * Derive partition key from PRIMARY KEY columns.
 * Requirement 20.1: Automatically use PRIMARY KEY as partition key.
 * @param {Array<string>} primaryKey - PRIMARY KEY column names.
 * @return {string} Partition key (comma-separated for composite keys).
 * @private
 */
function derivePartitionKey(primaryKey) {
  if (!primaryKey || primaryKey.length === 0) {
    throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
  }

  // For composite PRIMARY KEY, use all columns as partition key
  return primaryKey.join(TABLE_CREATION_SERVICE_LITERAL.EMPTY);
}

/**
 * Normalize data type to SQLite-compatible type.
 * @param {Object} dataType - Data type AST.
 * @return {string} Normalized type name.
 * @private
 */
function normalizeDataType(dataType) {
  const typeName = dataType.name.toUpperCase();

  // Map common SQL types to SQLite types
  const typeMap = {
    INT: 'INTEGER',
    BIGINT: 'INTEGER',
    SMALLINT: 'INTEGER',
    TINYINT: 'INTEGER',
    VARCHAR: 'TEXT',
    CHAR: 'TEXT',
    NVARCHAR: 'TEXT',
    NCHAR: 'TEXT',
    CLOB: 'TEXT',
    FLOAT: 'REAL',
    DOUBLE: 'REAL',
    DECIMAL: 'REAL',
    NUMERIC: 'REAL',
    BOOLEAN: 'INTEGER',
    BOOL: 'INTEGER',
    DATETIME: 'TEXT',
    TIMESTAMP: 'TEXT',
    DATE: 'TEXT',
    TIME: 'TEXT',
  };
  return typeMap[typeName] || typeName;
}

// Stored defaults are SQL literals, exactly as the system-table schemas keep
// them (e.g. `defaultValue: "'active'"`): every re-emitter interpolates the
// stored value verbatim into CREATE TABLE, so a bare string default like {}
// must round-trip as '{}' or replica creation fails with a SQLite parse
// error (the 2026-07-18 live schema-admission wedge).
function deriveDefaultSqlLiteral(defaultValue) {
  const value = defaultValue?.value;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return `'${String(value).replaceAll('\'', '\'\'')}'`;
}

const SCHEMA_DERIVATION_METHODS = Object.freeze({
  derivePartitionKey,

  /**
   * Build schema definition from column AST.
   * @param {Array<Object>} columns - Column definitions from AST.
   * @return {Object} Schema definition.
   * @private
   */
  buildSchemaDefinition(columns) {
    return {
      columns: columns.map((col) => ({
        name: col.name,
        type: this.normalizeDataType(col.dataType),
        primaryKey: col.primaryKey || false,
        notNull: col.notNull === true || col.nullable === false,
        unique: col.unique || false,
        defaultValue: deriveDefaultSqlLiteral(col.defaultValue),
      })),
    };
  },

  normalizeDataType,
});

function defineTableCreationSchemaDerivation(serviceClass) {
  for (const [methodName, methodImpl] of Object.entries(
    SCHEMA_DERIVATION_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: methodImpl,
      writable: true,
    });
  }
}

export {defineTableCreationSchemaDerivation};
