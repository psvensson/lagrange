/**
 * SQLiteSystemCache - In-memory SQLite cache for system tables.
 *
 * Each message group replica has its own instance of this cache.
 * The cache is updated via CDC events and replicated via Raft consensus.
 *
 * @module worker/sqlite-system-cache
 * @see Requirements 3.1, 3.2, 3.5 - Independent System Caches
 */

import Database from 'better-sqlite3';
import {CDC_OPERATION} from '../constants/index.js';
import {
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
  generateCreateIndexSQL,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
} from '../cache/system-cache-key-descriptor.js';

const LOCAL_STR_MEMORY = ':memory:';
const LOCAL_STR_JOURNAL_MODE_WAL = 'journal_mode = WAL';
const LOCAL_STR_SELECT = 'SELECT';
const LOCAL_STR_TABLE = 'table';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_OBJECT = 'object';

/**
 * Primary key column names for each system table.
 * Used for get() and applyCDCEvent() operations.
 * @type {Readonly<Object>}
 */
const PRIMARY_KEY_COLUMNS = SYSTEM_CACHE_KEY_DESCRIPTOR;

/**
 * Error messages for SQLiteSystemCache.
 * @type {Readonly<Object>}
 */
const CACHE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'SQLiteSystemCache not initialized',
  ALREADY_INITIALIZED: 'SQLiteSystemCache already initialized',
  INVALID_DATA: 'Invalid data for CDC event',
  INVALID_DYNAMIC_TABLE_COLUMNS:
    'Dynamic table columns must be a non-empty array',
  unknownTable: (tableName) => `Unknown system table: ${tableName}`,
  unknownCdcOperation: (operation) => `Unknown CDC operation: ${operation}`,
  queryFailed: (error) => `Query failed: ${error}`,
});

/**
 * SQLiteSystemCache - In-memory SQLite cache for system tables.
 * Each message group replica has its own instance.
 */
class SQLiteSystemCache {
  /**
   * Create a new SQLite system cache.
   * Initializes in-memory SQLite database with system table schemas.
   */
  constructor() {
    this.db = null;
    this.initialized = false;
    this.preparedStatements = new Map();
  }

  /**
   * Initialize the in-memory SQLite database with system table schemas.
   * @return {void}
   */
  initialize() {
    if (this.initialized) {
      throw new Error(CACHE_ERROR_MSG.ALREADY_INITIALIZED);
    }

    // Create in-memory SQLite database
    this.db = new Database(LOCAL_STR_MEMORY);

    // Enable WAL mode for better performance (even in memory)
    this.db.pragma(LOCAL_STR_JOURNAL_MODE_WAL);

    // Create all system tables
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const createTableSQL = generateCreateTableSQL(schema);
      this.db.exec(createTableSQL);

      // Create indices for the table
      const indexStatements = generateCreateIndexSQL(schema);
      for (const indexSQL of indexStatements) {
        this.db.exec(indexSQL);
      }
    }

    this.initialized = true;
  }

  /**
   * Ensure the cache is initialized.
   * @private
   * @throws {Error} If cache is not initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error(CACHE_ERROR_MSG.NOT_INITIALIZED);
    }
  }

  /**
   * Get the primary key column for a table.
   * @private
   * @param {string} tableName - System table name
   * @return {string} Primary key column name
   * @throws {Error} If table is unknown
   */
  getPrimaryKeyColumn(tableName) {
    const pkColumn = PRIMARY_KEY_COLUMNS[tableName];
    if (!pkColumn) {
      const errorMsg = CACHE_ERROR_MSG.unknownTable(tableName);
      throw new Error(errorMsg);
    }
    return pkColumn;
  }

  /**
   * Get a record from a system table by primary key.
   * @param {string} tableName - System table name
   * @param {string} key - Primary key value
   * @return {Object|undefined} Record or undefined if not found
   */
  get(tableName, key) {
    this.ensureInitialized();

    const pkColumn = this.getPrimaryKeyColumn(tableName);
    const sql = `SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`;

    const stmt = this.db.prepare(sql);
    return stmt.get(key);
  }

  /**
   * Query system table with SQL.
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @return {Array<Object>} Query results
   */
  query(sql, params = []) {
    this.ensureInitialized();

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Execute raw SQL against the cache database.
   * SELECT statements return rows, writes return SQLite run metadata.
   * @param {string} sql - SQL statement.
   * @param {Array} params - SQL parameters.
   * @return {Array<Object>|Object} Query rows or write metadata.
   */
  executeRawSQL(sql, params = []) {
    this.ensureInitialized();

    const stmt = this.db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith(LOCAL_STR_SELECT)) {
      return stmt.all(...params);
    }

    const info = stmt.run(...params);
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid,
    };
  }

  /**
   * Check whether a table exists in the cache database.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   */
  hasTable(tableName) {
    this.ensureInitialized();
    const stmt = this.db.prepare(
      'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?',
    );
    return Boolean(stmt.get(LOCAL_STR_TABLE, tableName));
  }

  /**
   * Create a dynamic table for CDC user-table replication.
   * @param {string} tableName - Table name.
   * @param {Array<string>} columns - Column names.
   */
  createDynamicTable(tableName, columns) {
    this.ensureInitialized();
    if (!Array.isArray(columns) || columns.length === LOCAL_NUM_ZERO) {
      throw new Error(CACHE_ERROR_MSG.INVALID_DYNAMIC_TABLE_COLUMNS);
    }

    const quotedColumns = columns.map((column) => `"${column}" TEXT`);
    const primaryKeyColumn = columns.find((column) =>
      column === 'id' || column.endsWith('_id'),
    );

    if (primaryKeyColumn) {
      quotedColumns.push(`PRIMARY KEY ("${primaryKeyColumn}")`);
    }

    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "${tableName}" (${quotedColumns.join(LOCAL_STR_128KJ)})`,
    );
  }

  /**
   * Filter records from a system table by predicate function.
   * @param {string} tableName - System table name
   * @param {Function} predicate - Filter function (record) => boolean
   * @return {Array<Object>} Filtered records
   */
  filter(tableName, predicate) {
    this.ensureInitialized();

    // Validate table exists
    this.getPrimaryKeyColumn(tableName);

    const sql = `SELECT * FROM ${tableName}`;
    const stmt = this.db.prepare(sql);
    const allRecords = stmt.all();

    return allRecords.filter(predicate);
  }

  /**
   * Get all records from a system table.
   * @param {string} tableName - System table name
   * @return {Array<Object>} All records in the table
   */
  getAll(tableName) {
    this.ensureInitialized();

    // Validate table exists
    this.getPrimaryKeyColumn(tableName);

    const sql = `SELECT * FROM ${tableName}`;
    const stmt = this.db.prepare(sql);
    return stmt.all();
  }

  /**
   * Apply a CDC event to the cache.
   * @param {string} tableName - Table name
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE)
   * @param {Object} data - Record data
   * @return {void}
   */
  applyCDCEvent(tableName, operation, data) {
    this.ensureInitialized();

    if (!data || typeof data !== LOCAL_STR_OBJECT) {
      throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
    }

    const pkColumn = this.getPrimaryKeyColumn(tableName);

    if (operation === CDC_OPERATION.INSERT) {
      this.insertRecord(tableName, data);
    } else if (operation === CDC_OPERATION.UPDATE) {
      this.updateRecord(tableName, pkColumn, data);
    } else if (operation === CDC_OPERATION.DELETE) {
      this.deleteRecord(tableName, pkColumn, data);
    } else if (operation === CDC_OPERATION.UPSERT) {
      this.upsertRecord(tableName, pkColumn, data);
    } else {
      const errorMsg = CACHE_ERROR_MSG.unknownCdcOperation(operation);
      throw new Error(errorMsg);
    }
  }

  /**
   * Insert a record into a table.
   * @private
   * @param {string} tableName - Table name
   * @param {Object} data - Record data
   */
  insertRecord(tableName, data) {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => data[col]);

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Update a record in a table.
   * @private
   * @param {string} tableName - Table name
   * @param {string} pkColumn - Primary key column name
   * @param {Object} data - Record data (must include primary key)
   */
  updateRecord(tableName, pkColumn, data) {
    const pkValue = data[pkColumn];
    if (pkValue === undefined) {
      throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
    }

    const columns = Object.keys(data).filter((col) => col !== pkColumn);
    if (columns.length === LOCAL_NUM_ZERO) {
      return; // Nothing to update
    }

    const setClause = columns.map((col) => `${col} = ?`).join(', ');
    const values = columns.map((col) => data[col]);
    values.push(pkValue);

    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${pkColumn} = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Delete a record from a table.
   * @private
   * @param {string} tableName - Table name
   * @param {string} pkColumn - Primary key column name
   * @param {Object} data - Record data (must include primary key)
   */
  deleteRecord(tableName, pkColumn, data) {
    const pkValue = data[pkColumn];
    if (pkValue === undefined) {
      throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
    }

    const sql = `DELETE FROM ${tableName} WHERE ${pkColumn} = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(pkValue);
  }

  /**
   * Upsert a record into a table (insert or update).
   * @private
   * @param {string} tableName - Table name
   * @param {string} _pkColumn - Primary key column name (unused, kept for API consistency)
   * @param {Object} data - Record data
   */
  upsertRecord(tableName, _pkColumn, data) {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => data[col]);

    // Use INSERT OR REPLACE for upsert behavior
    const sql = `INSERT OR REPLACE INTO ${tableName} ` +
      `(${columns.join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Get all data for Raft replication.
   * Returns a serializable object containing all cache data.
   * @return {Object} Serializable cache state
   */
  getReplicationState() {
    this.ensureInitialized();

    const state = {};

    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const sql = `SELECT * FROM ${tableName}`;
      const stmt = this.db.prepare(sql);
      state[tableName] = stmt.all();
    }

    return state;
  }

  /**
   * Apply replicated state from Raft leader.
   * Clears existing data and applies the replicated state.
   * @param {Object} state - Replicated cache state
   */
  applyReplicationState(state) {
    this.ensureInitialized();

    if (!state || typeof state !== LOCAL_STR_OBJECT) {
      throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
    }

    // Use a transaction for atomicity
    const transaction = this.db.transaction(() => {
      // Clear all tables and insert replicated data
      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        const tableName = schema.tableName;

        // Clear existing data
        this.db.exec(`DELETE FROM ${tableName}`);

        // Insert replicated data if present
        const records = state[tableName];
        if (records && Array.isArray(records)) {
          for (const record of records) {
            this.insertRecord(tableName, record);
          }
        }
      }
    });

    transaction();
  }

  /**
   * Close the database connection and clean up resources.
   * @return {void}
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.preparedStatements.clear();
  }

  /**
   * Check if the cache is initialized.
   * @return {boolean} True if initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get statistics about the cache.
   * @return {Object} Cache statistics
   */
  getStats() {
    if (!this.initialized) {
      return {
        initialized: false,
        tableCount: LOCAL_NUM_ZERO,
        totalRecords: LOCAL_NUM_ZERO,
      };
    }

    let totalRecords = LOCAL_NUM_ZERO;
    const tableCounts = {};

    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const sql = `SELECT COUNT(*) as count FROM ${tableName}`;
      const stmt = this.db.prepare(sql);
      const result = stmt.get();
      const count = result.count;
      tableCounts[tableName] = count;
      totalRecords += count;
    }

    return {
      initialized: true,
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
      totalRecords,
      tableCounts,
    };
  }
}

export {
  SQLiteSystemCache,
  PRIMARY_KEY_COLUMNS,
  CACHE_ERROR_MSG,
};
