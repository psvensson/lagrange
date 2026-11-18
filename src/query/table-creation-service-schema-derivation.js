/**
 * Table Creation Service - Schema and partition-key derivation.
 * Owns PRIMARY KEY -> partition-key derivation, schema-definition construction
 * from the parsed column AST, and SQL-to-SQLite data-type normalization.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {SQL_DEFAULT_COLLATION, isBuiltinCollation} from './parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';
import {renderLiteral} from './sql-statement-renderer.js';
import {TABLE_CREATION_SERVICE_LITERAL} from './table-creation-service-completion.js';

const objectHasOwn = Object.hasOwn;

// A column declared without a type has BLOB affinity; it is recorded as BLOB,
// the declared type with the same affinity (sqlite.org/datatype3.html §3.1).
const UNTYPED_COLUMN_TYPE = 'BLOB';
const NON_BINARY_KEY_COLLATION_MSG =
  'A partition-key (PRIMARY KEY) column must use the BINARY collation';
const UNSUPPORTED_COLLATION_PREFIX = 'Unsupported collation sequence: ';
const TYPEOF_STRING = 'string';

const SQL_TYPE_MAP = Object.freeze(Object.assign(Object.create(null), {
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
}));


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
  const rawName = typeof dataType === TYPEOF_STRING ? dataType : dataType?.name;
  if (!rawName) return UNTYPED_COLUMN_TYPE;
  const typeName = rawName.toUpperCase();
  return objectHasOwn(SQL_TYPE_MAP, typeName) ? SQL_TYPE_MAP[typeName] : typeName;
}

// Stored defaults are SQL literals, exactly as the system-table schemas keep
// them (e.g. `defaultValue: "'active'"`): every re-emitter interpolates the
// stored value verbatim into CREATE TABLE, so a bare string default like {}
// must round-trip as '{}' or replica creation fails with a SQLite parse
// error (the 2026-07-18 live schema-admission wedge).
// The literal is rendered in the storage class it carries (the one
// renderer): DEFAULT 2.0 stays a REAL, never the text '2.0'.
function deriveDefaultSqlLiteral(defaultValue) {
  const value = defaultValue?.value;
  if (value === undefined || value === null) {
    return undefined;
  }
  return renderLiteral(defaultValue);
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

function normalizeColumnCollation(collation) {
  if (collation === undefined || collation === null) {
    return SQL_DEFAULT_COLLATION;
  }
  const upper = String(collation).toUpperCase();
  if (!isBuiltinCollation(upper)) {
    const error = new Error(UNSUPPORTED_COLLATION_PREFIX + String(collation));
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    throw error;
  }
  return upper;
}

function formatDerivedColumn(service, col) {
  return {
    name: col.name,
    type: service.normalizeDataType(col.dataType ?? col.type ?? null),
    collation: normalizeColumnCollation(col.collation),
    primaryKey: Boolean(col.primaryKey),
    notNull: col.notNull === true || col.nullable === false,
    unique: Boolean(col.unique),
    checkSql: col.checkSql || null,
    defaultValue: deriveDefaultSqlLiteral(col.defaultValue),
  };
}

/**
 * Refuse a partition-key column whose collation is not BINARY: partition
 * routing orders keys by BINARY comparison, so another collation would route
 * equal keys to different partitions (design §2.7).
 * @param {Object[]} columns - Derived columns.
 * @param {string[]} primaryKey - Partition-key column names.
 */
function requireBinaryKeyColumns(columns, primaryKey) {
  const keyNames = new Set(primaryKey.map((name) => String(name).toLowerCase()));
  if (columns.some((col) => keyNames.has(String(col.name).toLowerCase()) &&
      col.collation !== SQL_DEFAULT_COLLATION)) {
    const error = new Error(NON_BINARY_KEY_COLLATION_MSG);
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    throw error;
  }
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
    const derivedColumns = columns.map((col) => formatDerivedColumn(this, col));
    requireBinaryKeyColumns(derivedColumns, derivedPk);
    return {
      columns: derivedColumns,
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
