// The SQLite connection owns its prepared statements and their native lifetime.
import Database from 'better-sqlite3';

const OWNER_MISSING = 'sqlite_statement_owner_missing';
const OWNER_REQUIRED = 'Cached statements require an owned SQLiteConnection';
const CONNECTION_CLOSED = 'The database connection is not open';
const INTEGER_MODE = Object.freeze({DEFAULT: 'defaultInteger', EXACT: 'exactInteger'});

/** Native SQLite connection with one cache per integer mode. */
class SQLiteConnection extends Database {
  #statements;

  /**
   * Allocate cache custody before acquiring the native handle.
   * @param {string|Buffer} filename Native filename or serialized image.
   * @param {Object} [options] Native better-sqlite3 options.
   */
  constructor(filename, options) {
    const statements = {defaultInteger: new Map(), exactInteger: new Map()};
    super(filename, options);
    this.#statements = statements;
  }

  /**
   * Validate ownership without reading any supplied property or open state.
   * @param {*} database Supplied connection.
   */
  static assertOwner(database) {
    if (database === null ||
        (typeof database !== 'object' && typeof database !== 'function') ||
        !(#statements in database)) {
      const error = new Error(OWNER_REQUIRED);
      error.code = OWNER_MISSING;
      throw error;
    }
  }

  static #statementOf(database, sql, integerMode) {
    SQLiteConnection.assertOwner(database);
    if (!database.open) throw new Error(CONNECTION_CLOSED);
    const statements = database.#statements[integerMode];
    let statement = statements.get(sql);
    if (statement === undefined) {
      statement = database.prepare(sql);
      if (integerMode === INTEGER_MODE.EXACT) statement.safeIntegers(true);
      statements.set(sql, statement);
    }
    return statement;
  }

  /**
   * Canonical bridge to the connection's default-integer cache.
   * @param {SQLiteConnection} database Owned open connection.
   * @param {string} sql Fixed owner SQL text.
   * @return {Object} Native statement, using the native default integer mode.
   */
  static preparedStatementOf(database, sql) {
    return SQLiteConnection.#statementOf(database, sql, INTEGER_MODE.DEFAULT);
  }

  /**
   * Canonical bridge to the connection's exact-integer cache.
   * @param {SQLiteConnection} database Owned open connection.
   * @param {string} sql Fixed owner SQL text.
   * @return {Object} Native statement, configured for exact integers before retention.
   */
  static preparedExactStatementOf(database, sql) {
    return SQLiteConnection.#statementOf(database, sql, INTEGER_MODE.EXACT);
  }

  /**
   * A native busy refusal retains both the handle and its statement identities.
   * @return {SQLiteConnection} This connection, after successful native close.
   */
  close() {
    super.close();
    this.#statements.defaultInteger.clear();
    this.#statements.exactInteger.clear();
    return this;
  }
}

/**
 * Brand-only assertion for boundaries before SQL, mutation or absence shortcuts.
 * Closed owned connections still carry ownership; their domain decides open state.
 * @param {*} database Supplied connection.
 */
function assertSQLiteConnection(database) {
  SQLiteConnection.assertOwner(database);
}

/**
 * This connection's statement for fixed SQL, prepared once on first use.
 * Only fixed owner SQL belongs here: each text is retained until successful close.
 * Callers complete get/all/run and never change shared statement modes or hold iterators.
 * SQLite itself re-prepares held statements after schema changes.
 * @param {SQLiteConnection} database Owned open connection.
 * @param {string} sql Fixed owner SQL text.
 * @return {Object} Native prepared statement.
 */
function preparedStatementOf(database, sql) {
  return SQLiteConnection.preparedStatementOf(database, sql);
}

/**
 * This connection's separate statement returning every integer as an exact BigInt.
 * @param {SQLiteConnection} database Owned open connection.
 * @param {string} sql Fixed owner SQL text.
 * @return {Object} Native prepared statement in safe-integer mode.
 */
function preparedExactStatementOf(database, sql) {
  return SQLiteConnection.preparedExactStatementOf(database, sql);
}

export {
  SQLiteConnection, assertSQLiteConnection, preparedExactStatementOf, preparedStatementOf,
};
