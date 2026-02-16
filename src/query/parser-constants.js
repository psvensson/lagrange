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
  CREATE_TABLE: 'CREATE_TABLE',
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
});

export {AST_TYPE, EXPR_TYPE};
