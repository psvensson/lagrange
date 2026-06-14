/**
 * Table Creation Service - Schema and partition-key derivation.
 * Owns PRIMARY KEY -> partition-key derivation, schema-definition construction
 * from the parsed column AST, and SQL-to-SQLite data-type normalization.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {NUM} from '../constants/index.js';
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
  if (!primaryKey || primaryKey.length === NUM.ZERO) {
    throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
  }

  // For composite PRIMARY KEY, use all columns as partition key
  return primaryKey.join(TABLE_CREATION_SERVICE_LITERAL.EMPTY);
}

/**
 * Build schema definition from column AST.
 * @param {Array<Object>} columns - Column definitions from AST.
 * @return {Object} Schema definition.
 * @private
 */
function buildSchemaDefinition(columns) {
  return {
    columns: columns.map((col) => ({
      name: col.name,
      type: this.normalizeDataType(col.dataType),
      primaryKey: col.primaryKey || false,
      notNull: col.notNull || false,
      unique: col.unique || false,
      defaultValue: col.defaultValue?.value,
    })),
  };
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

const SCHEMA_DERIVATION_METHODS = Object.freeze({
  derivePartitionKey,
  buildSchemaDefinition,
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
