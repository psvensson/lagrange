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
  if (!dataType) return TABLE_CREATION_SERVICE_LITERAL.DEFAULT_TYPE;
  const rawName = typeof dataType === 'string' ?
    dataType :
    (dataType.name || TABLE_CREATION_SERVICE_LITERAL.DEFAULT_TYPE);
  const typeName = rawName.toUpperCase();

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

function resolveDerivationColumns(columnsOrAst) {
  if (Array.isArray(columnsOrAst)) return columnsOrAst;
  return Array.isArray(columnsOrAst?.columns) ? columnsOrAst.columns : [];
}

function resolveDerivationConstraints(columnsOrAst, tableConstraints) {
  if (Array.isArray(tableConstraints) && tableConstraints.length > 0) {
    return tableConstraints;
  }
  return Array.isArray(columnsOrAst?.tableConstraints) ?
    columnsOrAst.tableConstraints :
    [];
}

function unpackSchemaDerivationArgs(columnsOrAst, tableConstraints, primaryKey) {
  const constraints = resolveDerivationConstraints(
    columnsOrAst,
    Array.isArray(tableConstraints) ?
      tableConstraints :
      tableConstraints?.tableConstraints,
  );
  const pk = primaryKey ||
    (Array.isArray(tableConstraints?.primaryKey) ? tableConstraints.primaryKey : null) ||
    (typeof tableConstraints?.primaryKey === 'string' ? [tableConstraints.primaryKey] : null) ||
    columnsOrAst?.primaryKey ||
    null;
  return {
    columns: resolveDerivationColumns(columnsOrAst),
    constraints,
    pk,
  };
}

function formatDerivedColumn(service, col) {
  return {
    name: col.name,
    type: service.normalizeDataType(
      col.dataType || {name: col.type || TABLE_CREATION_SERVICE_LITERAL.DEFAULT_TYPE},
    ),
    primaryKey: Boolean(col.primaryKey),
    notNull: col.notNull === true || col.nullable === false,
    unique: Boolean(col.unique),
    checkSql: col.checkSql || null,
    defaultValue: deriveDefaultSqlLiteral(col.defaultValue),
  };
}

const SCHEMA_DERIVATION_METHODS = Object.freeze({
  derivePartitionKey,

  /**
   * Build schema definition from column AST.
   * @param {Array<Object>|Object} columnsOrAst - Column definitions or AST.
   * @param {Array<Object>} [tableConstraints=[]] - Table constraints.
   * @param {Array<string>|null} [primaryKey=null] - Table primary key columns.
   * @return {Object} Schema definition.
   * @private
   */
  buildSchemaDefinition(columnsOrAst, tableConstraints = [], primaryKey = null) {
    const {columns, constraints, pk} = unpackSchemaDerivationArgs(
      columnsOrAst,
      tableConstraints,
      primaryKey,
    );
    const derivedPk = Array.isArray(pk) && pk.length > 0 ?
      pk :
      columns.filter((col) => col.primaryKey).map((col) => col.name);
    return {
      columns: columns.map((col) => formatDerivedColumn(this, col)),
      primaryKey: derivedPk.length > 0 ? derivedPk : (pk || null),
      tableConstraints: Array.isArray(constraints) ? constraints : [],
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
