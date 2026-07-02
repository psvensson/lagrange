/**
 * SQLiteStore - Composable SQLite database lifecycle management.
 * Encapsulates database opening, schema creation, query execution, and closing.
 * Used by PartitionWorkerService and PartitionCoordinator.
 *
 * Requirements: 5.1, 5.2, 5.3
 * @module storage/sqlite-store
 */

import Database from 'better-sqlite3';
import {NUM} from '../constants/numbers.js';
import {
  SQLITE_STORE_DEFAULT,
  SQLITE_STORE_ERROR_MSG,
  SQLITE_STORE_LOG_MSG,
  SQLITE_STORE_OPERATION_PATTERN,
  SQLITE_STORE_PRAGMA,
} from './sqlite-store-constants.js';

/**
 * SQL fragments used for schema-to-SQL conversion.
 * Kept local to this module since they are only used here.
 */
const SCHEMA_SQL = Object.freeze({
  CREATE_TABLE_PREFIX: 'CREATE TABLE IF NOT EXISTS',
  PRIMARY_KEY: ' PRIMARY KEY',
  NOT_NULL: ' NOT NULL',
  DEFAULT: ' DEFAULT ',
  COLUMN_SEPARATOR: ', ',
  OPEN_PAREN: ' (',
  CLOSE_PAREN: ')',
});

/**
 * Maximum number of characters to include in logged SQL statements.
 */
const SQL_LOG_TRUNCATE_LENGTH = NUM.HUNDRED;

/**
 * Composable SQLite database lifecycle manager.
 * Opens a database, sets pragmas, creates tables from schema,
 * executes queries, and closes the database.
 *
 * @class
 */
class SQLiteStore {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} [options.dbPath=':memory:'] - Path to SQLite database.
   * @param {Object} [options.schema] - Table schema with columns array.
   * @param {string} [options.tableName] - Table name for schema creation.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || SQLITE_STORE_DEFAULT.DB_PATH;
    this.schema = options.schema || null;
    this.tableName = options.tableName || null;
    this.logger = options.logger || console;
    this.db = null;
    this.initialized = false;
    this.closed = false;
  }

  /**
   * Open database, set WAL/NORMAL pragmas, create table if schema provided.
   */
  initialize() {
    this.logger.info(SQLITE_STORE_LOG_MSG.INITIALIZING, {
      dbPath: this.dbPath,
    });

    this.db = new Database(this.dbPath);
    this.db.pragma(SQLITE_STORE_PRAGMA.JOURNAL_MODE_WAL);
    this.db.pragma(SQLITE_STORE_PRAGMA.SYNCHRONOUS_NORMAL);

    if (this.schema && this.tableName) {
      this.createTableFromSchema();
    }

    this.initialized = true;
    this.logger.info(SQLITE_STORE_LOG_MSG.INITIALIZED, {
      dbPath: this.dbPath,
    });
  }

  /**
   * Execute a SQL query.
   * SELECT statements return rows; write statements return change info.
   *
   * @param {string} sql - SQL statement.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Object} Result with rows/rowCount or changes/lastInsertRowid.
   */
  executeQuery(sql, params = []) {
    if (!this.initialized) {
      throw new Error(SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED);
    }
    if (this.closed) {
      throw new Error(SQLITE_STORE_ERROR_MSG.ALREADY_CLOSED);
    }
    if (!sql) {
      throw new Error(SQLITE_STORE_ERROR_MSG.MISSING_SQL);
    }

    this.logger.debug(SQLITE_STORE_LOG_MSG.EXECUTING_QUERY, {
      sql: sql.substring(0, SQL_LOG_TRUNCATE_LENGTH),
    });

    const trimmedUpper = sql.trim().toUpperCase();

    if (SQLITE_STORE_OPERATION_PATTERN.SELECT.test(trimmedUpper)) {
      return this.executeRead(sql, params);
    }
    return this.executeWrite(sql, params);
  }

  /**
   * Close the database connection.
   * Errors during close are logged but not thrown.
   */
  close() {
    if (this.closed || !this.db) {
      return;
    }

    this.logger.info(SQLITE_STORE_LOG_MSG.CLOSING, {
      dbPath: this.dbPath,
    });

    try {
      this.db.close();
    } catch (error) {
      this.logger.error(SQLITE_STORE_ERROR_MSG.QUERY_EXECUTION_FAILED, {
        dbPath: this.dbPath,
        error: error.message,
      });
    }

    this.db = null;
    this.closed = true;
    this.initialized = false;

    this.logger.info(SQLITE_STORE_LOG_MSG.CLOSED, {
      dbPath: this.dbPath,
    });
  }

  /**
   * Get the raw better-sqlite3 database instance.
   * Used for log adapter creation.
   *
   * @return {Database} The raw database instance.
   */
  getDatabase() {
    if (!this.initialized) {
      throw new Error(SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED);
    }
    if (this.closed) {
      throw new Error(SQLITE_STORE_ERROR_MSG.ALREADY_CLOSED);
    }
    return this.db;
  }

  /**
   * Execute a SELECT query and return rows.
   *
   * @param {string} sql - SQL SELECT statement.
   * @param {Array} params - Query parameters.
   * @return {Object} Result with rows and rowCount.
   * @private
   */
  executeRead(sql, params) {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return {
        rows,
        rowCount: rows.length,
      };
    } catch (error) {
      this.logger.error(SQLITE_STORE_ERROR_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, SQL_LOG_TRUNCATE_LENGTH),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a write query (INSERT/UPDATE/DELETE/CREATE/DROP/ALTER).
   *
   * @param {string} sql - SQL write statement.
   * @param {Array} params - Query parameters.
   * @return {Object} Result with changes and lastInsertRowid.
   * @private
   */
  executeWrite(sql, params) {
    try {
      const stmt = this.db.prepare(sql);
      const info = stmt.run(...params);
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      };
    } catch (error) {
      this.logger.error(SQLITE_STORE_ERROR_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, SQL_LOG_TRUNCATE_LENGTH),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a table from the provided schema definition.
   * Schema must have a columns array with name, type, and optional
   * primaryKey, notNull, defaultValue properties.
   *
   * @private
   */
  createTableFromSchema() {
    const columns = this.schema.columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) {
        def += SCHEMA_SQL.PRIMARY_KEY;
      }
      if (col.notNull) {
        def += SCHEMA_SQL.NOT_NULL;
      }
      if (col.defaultValue !== undefined) {
        def += SCHEMA_SQL.DEFAULT + String(col.defaultValue);
      }
      return def;
    }).join(SCHEMA_SQL.COLUMN_SEPARATOR);

    const sql =
      SCHEMA_SQL.CREATE_TABLE_PREFIX +
      ` ${this.tableName}` +
      SCHEMA_SQL.OPEN_PAREN +
      columns +
      SCHEMA_SQL.CLOSE_PAREN;

    this.db.exec(sql);

    this.logger.info(SQLITE_STORE_LOG_MSG.CREATED_TABLE, {
      tableName: this.tableName,
    });
  }
}

export {SQLiteStore};
