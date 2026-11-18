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

/** SQLite's default collating sequence; never rendered explicitly. */
const SQL_DEFAULT_COLLATION = 'BINARY';

export {AST_TYPE, EXPR_TYPE, SQL_DEFAULT_COLLATION, SQL_STORAGE_CLASS};
