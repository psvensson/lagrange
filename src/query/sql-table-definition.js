/**
 * The one table-definition authority (design coordinator-sqlite-merge §2.7):
 * the CREATE TABLE text a catalog schema (`tables.schema`) renders to, and
 * SQLite's affinity rule for a declared type.
 *
 * Two projections of one schema:
 * - full (renderTableDefinitionSql): every column with its declared type,
 *   collation and constraints, plus the table constraints. A partition creates
 *   its table from it, and recognizes its own table by these exact bytes.
 * - column-only (renderTableColumnsSql): name, declared type and collation,
 *   nothing else. A coordinator table holding fragment rows uses it: an
 *   INTEGER PRIMARY KEY would alias the rowid the merge assigns, and
 *   constraints were enforced where the rows were written. Affinity and
 *   collation, which decide how SQLite stores and compares the values, are
 *   the same as the partition's.
 *
 * A column's `collation` is rendered unless it is BINARY, SQLite's default:
 * `x TEXT` and `x TEXT COLLATE BINARY` compare identically.
 *
 * @module query/sql-table-definition
 */

import {SQL_DEFAULT_COLLATION} from './parser-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';
import {renderSqliteIdentifier} from './sqlite-identifier.js';

const DDL = Object.freeze({
  CREATE_TABLE: 'CREATE TABLE ',
  PRIMARY_KEY: ' PRIMARY KEY',
  NOT_NULL: ' NOT NULL',
  UNIQUE: ' UNIQUE',
  COLLATE: ' COLLATE ',
  CHECK_OPEN: ' CHECK (',
  DEFAULT: ' DEFAULT ',
  COMMA_SPACE: ', ',
  SPACE: ' ',
  OPEN: ' (',
  CLOSE: ')',
  DOUBLE_QUOTE: '"',
  CHECK: 'CHECK (',
  UNIQUE_TABLE: 'UNIQUE (',
  PRIMARY_KEY_TABLE: 'PRIMARY KEY (',
});

const TABLE_CONSTRAINT_TYPE = Object.freeze({
  CHECK: 'CHECK',
  UNIQUE: 'UNIQUE',
  PRIMARY_KEY: 'PRIMARY_KEY',
});

const SQLITE_AFFINITY = Object.freeze({
  INTEGER: 'INTEGER',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
  REAL: 'REAL',
  NUMERIC: 'NUMERIC',
});

// sqlite.org/datatype3.html §3.1, applied in rule order.
const AFFINITY_RULES = Object.freeze([
  [/INT/u, SQLITE_AFFINITY.INTEGER],
  [/CHAR|CLOB|TEXT/u, SQLITE_AFFINITY.TEXT],
  [/BLOB|^$/u, SQLITE_AFFINITY.BLOB],
  [/REAL|FLOA|DOUB/u, SQLITE_AFFINITY.REAL],
]);

const SINGLE_QUOTED_SQL_LITERAL_PATTERN = /^'(?:[^']|'')*'$/u;
const NUMERIC_SQL_LITERAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;
const NULL_SQL_LITERAL_PATTERN = /^NULL$/iu;
const UNSUPPORTED_DEFAULT_MSG =
  'Non-literal or nondeterministic column DEFAULT is not supported in partition schema';

/**
 * SQLite's affinity of a declared column (or CAST) type.
 * @param {string|null} declaredType - The type as declared.
 * @return {string} INTEGER, TEXT, BLOB, REAL or NUMERIC.
 */
function sqliteDeclaredTypeAffinity(declaredType) {
  const upper = String(declaredType ?? '').trim().toUpperCase();
  const rule = AFFINITY_RULES.find(([pattern]) => pattern.test(upper));
  return rule ? rule[1] : SQLITE_AFFINITY.NUMERIC;
}

function quoteTableName(tableName) {
  return DDL.DOUBLE_QUOTE + String(tableName).replaceAll(DDL.DOUBLE_QUOTE,
    DDL.DOUBLE_QUOTE.repeat(2)) + DDL.DOUBLE_QUOTE;
}

function isLiteralDefault(defaultValue) {
  if (typeof defaultValue === 'number') {
    return Number.isFinite(defaultValue);
  }
  if (typeof defaultValue === 'boolean' || typeof defaultValue === 'bigint') {
    return true;
  }
  return typeof defaultValue === 'string' && (
    SINGLE_QUOTED_SQL_LITERAL_PATTERN.test(defaultValue) ||
    NUMERIC_SQL_LITERAL_PATTERN.test(defaultValue) ||
    NULL_SQL_LITERAL_PATTERN.test(defaultValue)
  );
}

function requireLiteralDefault(defaultValue) {
  if (isLiteralDefault(defaultValue)) {
    return defaultValue;
  }
  const error = new Error(UNSUPPORTED_DEFAULT_MSG);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  throw error;
}

function columnTypeAndCollationSql(col) {
  const collation = typeof col.collation === 'string' &&
    col.collation !== SQL_DEFAULT_COLLATION ? DDL.COLLATE + col.collation : '';
  return renderSqliteIdentifier(col.name) + DDL.SPACE + col.type + collation;
}

/**
 * How a schema's column definitions are rendered: composite primary keys and
 * table constraints move clauses off the columns.
 * @param {Object} schema - Catalog schema.
 * @return {{hasSqlConstraints: boolean, isCompositePk: boolean}}
 */
function tableColumnSqlShape(schema) {
  const hasSqlConstraints = Array.isArray(schema.tableConstraints);
  return {
    hasSqlConstraints,
    isCompositePk: hasSqlConstraints &&
      Array.isArray(schema.primaryKey) &&
      schema.primaryKey.length > 1,
  };
}

/**
 * One column's full definition (ALTER TABLE ADD COLUMN takes it as well).
 * @param {Object} col - Catalog column.
 * @param {Object} shape - tableColumnSqlShape(schema).
 * @return {string}
 */
function renderColumnDefinitionSql(col, {isCompositePk, hasSqlConstraints}) {
  let def = columnTypeAndCollationSql(col);
  if (col.primaryKey && !isCompositePk) {
    def += DDL.PRIMARY_KEY;
  }
  if (col.notNull) {
    def += DDL.NOT_NULL;
  }
  if (hasSqlConstraints && col.unique === true) {
    def += DDL.UNIQUE;
  }
  if (col.checkSql) {
    def += DDL.CHECK_OPEN + col.checkSql + DDL.CLOSE;
  }
  if (col.defaultValue !== void 0 && col.defaultValue !== null) {
    def += DDL.DEFAULT + requireLiteralDefault(col.defaultValue);
  }
  return def;
}

function renderTableConstraintSql(constraint, isCompositePk) {
  if (!constraint || typeof constraint.type !== 'string') return null;
  const cType = constraint.type.toUpperCase();
  if (cType === TABLE_CONSTRAINT_TYPE.CHECK) {
    return constraint.checkSql ? DDL.CHECK + constraint.checkSql + DDL.CLOSE : null;
  }
  const cols = constraint.columns;
  if (!Array.isArray(cols) || cols.length === 0) return null;
  const joined = cols.join(DDL.COMMA_SPACE);
  if (cType === TABLE_CONSTRAINT_TYPE.UNIQUE) return DDL.UNIQUE_TABLE + joined + DDL.CLOSE;
  if (cType === TABLE_CONSTRAINT_TYPE.PRIMARY_KEY && cols.length > 1 && !isCompositePk) {
    return DDL.PRIMARY_KEY_TABLE + joined + DDL.CLOSE;
  }
  return null;
}

/**
 * The full projection: the CREATE TABLE a partition runs for a schema.
 * @param {string} tableName
 * @param {Object} schema - Catalog schema ({columns, primaryKey, tableConstraints}).
 * @return {string}
 */
function renderTableDefinitionSql(tableName, schema) {
  const shape = tableColumnSqlShape(schema);
  const items = schema.columns.map((col) => renderColumnDefinitionSql(col, shape));
  if (shape.isCompositePk) {
    items.push(DDL.PRIMARY_KEY_TABLE + schema.primaryKey.join(DDL.COMMA_SPACE) + DDL.CLOSE);
  }
  for (const constraint of schema.tableConstraints || []) {
    const clause = renderTableConstraintSql(constraint, shape.isCompositePk);
    if (clause) {
      items.push(clause);
    }
  }
  return DDL.CREATE_TABLE + quoteTableName(tableName) + DDL.OPEN +
    items.join(DDL.COMMA_SPACE) + DDL.CLOSE;
}

/**
 * The column-only projection: each column's name, declared type and
 * collation, without keys, constraints or defaults.
 * @param {string} tableName
 * @param {Object} schema - Catalog schema.
 * @return {string}
 */
function renderTableColumnsSql(tableName, schema) {
  return DDL.CREATE_TABLE + quoteTableName(tableName) + DDL.OPEN +
    schema.columns.map(columnTypeAndCollationSql).join(DDL.COMMA_SPACE) + DDL.CLOSE;
}

export {
  renderColumnDefinitionSql,
  renderTableColumnsSql,
  renderTableDefinitionSql,
  sqliteDeclaredTypeAffinity,
  tableColumnSqlShape,
};
