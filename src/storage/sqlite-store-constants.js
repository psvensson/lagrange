/**
 * Constants for SQLiteStore - composable SQLite database lifecycle management.
 * Encapsulates database opening, schema creation, query execution, and closing.
 *
 * @module storage/sqlite-store-constants
 */

/**
 * Database pragma settings applied during initialization.
 * WAL mode enables concurrent reads during writes.
 * NORMAL synchronous balances durability and performance.
 */
const SQLITE_STORE_PRAGMA = Object.freeze({
  JOURNAL_MODE_WAL: 'journal_mode = WAL',
  SYNCHRONOUS_NORMAL: 'synchronous = NORMAL',
});

/**
 * Default values for SQLiteStore configuration.
 */
const SQLITE_STORE_DEFAULT = Object.freeze({
  DB_PATH: ':memory:',
});

/**
 * SQL operation type identifiers used for classifying queries.
 */
const SQLITE_STORE_OPERATION = Object.freeze({
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  CREATE: 'CREATE',
  DROP: 'DROP',
  ALTER: 'ALTER',
});

/**
 * Regex patterns for detecting SQL operation types from query strings.
 * Each pattern matches the operation keyword at the start of a
 * trimmed, uppercased SQL string.
 */
const SQLITE_STORE_OPERATION_PATTERN = Object.freeze({
  SELECT: /^SELECT\b/,
  INSERT: /^INSERT\b/,
  UPDATE: /^UPDATE\b/,
  DELETE: /^DELETE\b/,
  CREATE: /^CREATE\b/,
  DROP: /^DROP\b/,
  ALTER: /^ALTER\b/,
});

/**
 * Error messages for SQLiteStore validation and runtime errors.
 * Static messages are strings; dynamic messages are functions.
 */
const SQLITE_STORE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'SQLiteStore not initialized',
  ALREADY_CLOSED: 'SQLiteStore database already closed',
  QUERY_EXECUTION_FAILED: 'Query execution failed',
  MISSING_SQL: 'SQL statement is required',
});

/**
 * Log messages emitted by SQLiteStore during lifecycle operations.
 */
const SQLITE_STORE_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing SQLiteStore',
  INITIALIZED: 'SQLiteStore initialized',
  CLOSING: 'Closing SQLiteStore',
  CLOSED: 'SQLiteStore closed',
  EXECUTING_QUERY: 'Executing query',
  CREATED_TABLE: 'Created table from schema',
});

export {
  SQLITE_STORE_DEFAULT,
  SQLITE_STORE_ERROR_MSG,
  SQLITE_STORE_LOG_MSG,
  SQLITE_STORE_OPERATION,
  SQLITE_STORE_OPERATION_PATTERN,
  SQLITE_STORE_PRAGMA,
};
