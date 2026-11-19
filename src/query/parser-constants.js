/**
 * SQL parser AST type constants.
 * Extracted from sql-parser.js to break circular dependencies
 * with pg-translate.js and pg-function-registry.js.
 * Requirements: 7.1, 7.3
 */

const AST_TYPE = Object.freeze({
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  TRUNCATE: 'TRUNCATE',
  CREATE_TABLE: 'CREATE_TABLE',
  ALTER_TABLE: 'ALTER_TABLE',
  CREATE_INDEX: 'CREATE_INDEX',
  DROP_TABLE: 'DROP_TABLE',
  DROP_INDEX: 'DROP_INDEX',
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

const EXPR_TYPE = Object.freeze({
  BINARY: 'binary',
  UNARY: 'unary',
  LITERAL: 'literal',
  COLUMN_REF: 'column_ref',
  PARAMETER: 'parameter',
  AGGREGATE: 'aggregate',
  STAR: 'star',
  IN: 'in',
  BETWEEN: 'between',
  LIKE: 'like',
  COLUMN: 'column',
  TABLE: 'table',
  JOIN: 'join',
  COLLATE: 'collate',
});

/**
 * The storage class a literal node carries (`sqlType`): the class SQLite
 * gives the literal as written. The node's JS-visible `value` is unchanged
 * by it (a decimal literal keeps its lexeme text); the one renderer
 * (sql-statement-renderer.js) emits the literal in exactly this class.
 */
const SQL_STORAGE_CLASS = Object.freeze({
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
  NULL: 'NULL',
});

/** SQLite's three built-in collating sequences (sqlite.org/datatype3.html §7). */
const SQL_COLLATION = Object.freeze({
  BINARY: 'BINARY',
  NOCASE: 'NOCASE',
  RTRIM: 'RTRIM',
});

const SQL_BUILTIN_COLLATIONS = new Set([
  SQL_COLLATION.BINARY,
  SQL_COLLATION.NOCASE,
  SQL_COLLATION.RTRIM,
]);

/** SQLite's default collating sequence; never rendered explicitly. */
const SQL_DEFAULT_COLLATION = SQL_COLLATION.BINARY;

const TYPEOF_STRING = 'string';

function isBuiltinCollation(value) {
  return typeof value === TYPEOF_STRING && SQL_BUILTIN_COLLATIONS.has(value);
}

export {
  AST_TYPE,
  EXPR_TYPE,
  SQL_DEFAULT_COLLATION,
  SQL_STORAGE_CLASS,
  isBuiltinCollation,
};
