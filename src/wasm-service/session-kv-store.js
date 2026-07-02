/**
 * SessionKVStore — SQLite-backed key-value store for WASM service
 * session context. Each replica maintains its own SQLite database;
 * writes are applied only after Raft commit.
 *
 * Requirements: 3.2, 3.3
 * @module wasm-service/session-kv-store
 */

import Database from 'better-sqlite3';
import {
  WASM_SERVICE_ERROR_MSG,
} from './wasm-service-constants.js';

const LOCAL_STR_JOURNAL_MODE_WAL = 'journal_mode = WAL';
const LOCAL_STR_SYNCHRONOUS_NORMAL = 'synchronous = NORMAL';

/**
 * Internal table name for the KV store.
 */
const KV_TABLE_NAME = '_kv_store';

/**
 * Column names for the _kv_store table.
 * @enum {string}
 */
const KV_COL = Object.freeze({
  SESSION_ID: 'session_id',
  KEY: 'key',
  VALUE: 'value',
  UPDATED_AT: 'updated_at',
});

/**
 * SQL statements used by SessionKVStore.
 * All SQL is defined here as constants — no inline literals.
 */
const KV_SQL = Object.freeze({
  CREATE_TABLE:
    `CREATE TABLE IF NOT EXISTS ${KV_TABLE_NAME} (` +
    `${KV_COL.SESSION_ID} TEXT NOT NULL, ` +
    `${KV_COL.KEY} TEXT NOT NULL, ` +
    `${KV_COL.VALUE} BLOB NOT NULL, ` +
    `${KV_COL.UPDATED_AT} INTEGER NOT NULL, ` +
    `PRIMARY KEY (${KV_COL.SESSION_ID}, ${KV_COL.KEY})` +
    ')',
  CREATE_INDEX:
    'CREATE INDEX IF NOT EXISTS idx_kv_session ' +
    `ON ${KV_TABLE_NAME}(${KV_COL.SESSION_ID})`,
  GET:
    `SELECT ${KV_COL.VALUE} FROM ${KV_TABLE_NAME} ` +
    `WHERE ${KV_COL.SESSION_ID} = ? AND ${KV_COL.KEY} = ?`,
  GET_ALL:
    `SELECT ${KV_COL.KEY}, ${KV_COL.VALUE} FROM ${KV_TABLE_NAME} ` +
    `WHERE ${KV_COL.SESSION_ID} = ?`,
  UPSERT:
    `INSERT OR REPLACE INTO ${KV_TABLE_NAME} ` +
    `(${KV_COL.SESSION_ID}, ${KV_COL.KEY}, ` +
    `${KV_COL.VALUE}, ${KV_COL.UPDATED_AT}) ` +
    'VALUES (?, ?, ?, ?)',
  DELETE_KEY:
    `DELETE FROM ${KV_TABLE_NAME} ` +
    `WHERE ${KV_COL.SESSION_ID} = ? AND ${KV_COL.KEY} = ?`,
  DELETE_SESSION:
    `DELETE FROM ${KV_TABLE_NAME} ` +
    `WHERE ${KV_COL.SESSION_ID} = ?`,
  SESSION_SIZE:
    `SELECT COALESCE(SUM(LENGTH(${KV_COL.VALUE})), ${0}) ` +
    `AS total_bytes FROM ${KV_TABLE_NAME} ` +
    `WHERE ${KV_COL.SESSION_ID} = ?`,
  TOTAL_SIZE:
    `SELECT COALESCE(SUM(LENGTH(${KV_COL.VALUE})), ${0}) ` +
    `AS total_bytes FROM ${KV_TABLE_NAME}`,
  VALUE_SIZE:
    `SELECT COALESCE(LENGTH(${KV_COL.VALUE}), ${0}) ` +
    `AS value_bytes FROM ${KV_TABLE_NAME} ` +
    `WHERE ${KV_COL.SESSION_ID} = ? AND ${KV_COL.KEY} = ?`,
});

/**
 * SQLite-backed key-value store for session context.
 *
 * Read operations are local and consistency is handled by the caller
 * (via SafetyInterval / read routing). Write operations are called
 * only when a Raft entry is committed.
 */
class SessionKVStore {
  /**
   * @param {string} dbPath - Path to the SQLite database file,
   *   or ':memory:' for in-memory storage.
   */
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma(LOCAL_STR_JOURNAL_MODE_WAL);
    this.db.pragma(LOCAL_STR_SYNCHRONOUS_NORMAL);
    this._sessionSizeLimitBytes = null;
    this._serviceSizeLimitBytes = null;
    this._createSchema();
    this._prepareStatements();
  }

  /**
   * Configure size limits for write enforcement.
   * When set, applySet will reject writes that would exceed
   * either limit. Pass null to disable enforcement.
   * @param {number|null} sessionSizeLimitBytes - Max bytes per
   *   session, or null to disable.
   * @param {number|null} serviceSizeLimitBytes - Max bytes
   *   across all sessions, or null to disable.
   */
  setLimits(sessionSizeLimitBytes, serviceSizeLimitBytes) {
    this._sessionSizeLimitBytes = sessionSizeLimitBytes;
    this._serviceSizeLimitBytes = serviceSizeLimitBytes;
  }

  /**
   * Retrieve a single value by session and key.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key within the session.
   * @return {Buffer|null} The stored value or null if not found.
   */
  get(sessionId, key) {
    const row = this._stmtGet.get(sessionId, key);
    if (!row) {
      return null;
    }
    const val = row[KV_COL.VALUE];
    return Buffer.isBuffer(val) ? val : Buffer.from(val);
  }

  /**
   * Retrieve all key-value pairs for a session.
   * @param {string} sessionId - Session identifier.
   * @return {Map<string, Buffer>} Map of key to value Buffer.
   */
  getAll(sessionId) {
    const rows = this._stmtGetAll.all(sessionId);
    const result = new Map();
    for (const row of rows) {
      const val = row[KV_COL.VALUE];
      const buf = Buffer.isBuffer(val) ? val : Buffer.from(val);
      result.set(row[KV_COL.KEY], buf);
    }
    return result;
  }

  /**
   * Upsert a key-value pair for a session.
   * Called only when the Raft entry is committed.
   * Checks per-session and per-service size limits before
   * writing. Returns a result object indicating acceptance.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key within the session.
   * @param {Buffer|Uint8Array} value - Opaque byte value.
   * @return {{accepted: boolean, error: string|null}} Result.
   */
  applySet(sessionId, key, value) {
    const limitError = this._checkLimits(sessionId, key, value);
    if (limitError) {
      return {accepted: false, error: limitError};
    }
    this._stmtUpsert.run(sessionId, key, value, Date.now());
    return {accepted: true, error: null};
  }

  /**
   * Delete a single key from a session.
   * Called only when the Raft entry is committed.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key to delete.
   */
  applyDelete(sessionId, key) {
    this._stmtDeleteKey.run(sessionId, key);
  }

  /**
   * Delete all keys for a session.
   * Called only when the Raft entry is committed.
   * @param {string} sessionId - Session identifier.
   */
  applyDeleteSession(sessionId) {
    this._stmtDeleteSession.run(sessionId);
  }

  /**
   * Get the total size in bytes of all values for a session.
   * @param {string} sessionId - Session identifier.
   * @return {number} Total bytes stored for the session.
   */
  getSessionSize(sessionId) {
    const row = this._stmtSessionSize.get(sessionId);
    return row.total_bytes;
  }

  /**
   * Get the total size in bytes of all values across all sessions.
   * @return {number} Total bytes stored in the KV store.
   */
  getTotalSize() {
    const row = this._stmtTotalSize.get();
    return row.total_bytes;
  }

  /**
   * Close the database connection.
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check size limits before a write. Returns an error message
   * string if a limit would be breached, or null if the write
   * is within bounds.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key within the session.
   * @param {Buffer|Uint8Array} value - Proposed value.
   * @return {string|null} Error message or null.
   * @private
   */
  _checkLimits(sessionId, key, value) {
    const hasSessionLimit =
      this._sessionSizeLimitBytes !== null;
    const hasServiceLimit =
      this._serviceSizeLimitBytes !== null;
    if (!hasSessionLimit && !hasServiceLimit) {
      return null;
    }
    const oldValueSize = this._getValueSize(sessionId, key);
    const newValueSize = value.length;
    const delta = newValueSize - oldValueSize;
    if (hasSessionLimit) {
      const currentSessionSize = this.getSessionSize(sessionId);
      const projectedSessionSize = currentSessionSize + delta;
      if (projectedSessionSize > this._sessionSizeLimitBytes) {
        return WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED;
      }
    }
    if (hasServiceLimit) {
      const currentTotalSize = this.getTotalSize();
      const projectedTotalSize = currentTotalSize + delta;
      if (projectedTotalSize > this._serviceSizeLimitBytes) {
        return WASM_SERVICE_ERROR_MSG.SERVICE_SIZE_LIMIT_EXCEEDED;
      }
    }
    return null;
  }

  /**
   * Get the byte length of an existing value, or 0 if the key
   * does not exist.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key within the session.
   * @return {number} Byte length of the stored value.
   * @private
   */
  _getValueSize(sessionId, key) {
    const row = this._stmtValueSize.get(sessionId, key);
    if (!row) {
      return 0;
    }
    return row.value_bytes;
  }

  /**
   * Create the _kv_store table and index if they do not exist.
   * @private
   */
  _createSchema() {
    this.db.exec(KV_SQL.CREATE_TABLE);
    this.db.exec(KV_SQL.CREATE_INDEX);
  }

  /**
   * Prepare all SQL statements for reuse.
   * @private
   */
  _prepareStatements() {
    this._stmtGet = this.db.prepare(KV_SQL.GET);
    this._stmtGetAll = this.db.prepare(KV_SQL.GET_ALL);
    this._stmtUpsert = this.db.prepare(KV_SQL.UPSERT);
    this._stmtDeleteKey = this.db.prepare(KV_SQL.DELETE_KEY);
    this._stmtDeleteSession = this.db.prepare(KV_SQL.DELETE_SESSION);
    this._stmtSessionSize = this.db.prepare(KV_SQL.SESSION_SIZE);
    this._stmtTotalSize = this.db.prepare(KV_SQL.TOTAL_SIZE);
    this._stmtValueSize = this.db.prepare(KV_SQL.VALUE_SIZE);
  }
}

export {SessionKVStore, KV_TABLE_NAME, KV_COL, KV_SQL};
