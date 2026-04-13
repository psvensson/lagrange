/**
 * SessionKVStore — SQLite-backed key-value store for WASM service
 * session context. Each replica maintains its own SQLite database;
 * writes are applied only after Raft commit.
 *
 * Requirements: 3.2, 3.3
 * @module wasm-service/session-kv-store
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import Database from 'better-sqlite3';
import { NUM } from '../constants/index.js';
import { WASM_SERVICE_ERROR_MSG } from './wasm-service-constants.js';

/**
 * Internal table name for the KV store.
 */
const KV_TABLE_NAME = stryMutAct_9fa48("163109") ? "" : (stryCov_9fa48("163109"), '_kv_store');

/**
 * Column names for the _kv_store table.
 * @enum {string}
 */
const KV_COL = Object.freeze(stryMutAct_9fa48("163110") ? {} : (stryCov_9fa48("163110"), {
  SESSION_ID: stryMutAct_9fa48("163111") ? "" : (stryCov_9fa48("163111"), 'session_id'),
  KEY: stryMutAct_9fa48("163112") ? "" : (stryCov_9fa48("163112"), 'key'),
  VALUE: stryMutAct_9fa48("163113") ? "" : (stryCov_9fa48("163113"), 'value'),
  UPDATED_AT: stryMutAct_9fa48("163114") ? "" : (stryCov_9fa48("163114"), 'updated_at')
}));

/**
 * SQL statements used by SessionKVStore.
 * All SQL is defined here as constants — no inline literals.
 */
const KV_SQL = Object.freeze(stryMutAct_9fa48("163115") ? {} : (stryCov_9fa48("163115"), {
  CREATE_TABLE: (stryMutAct_9fa48("163116") ? `` : (stryCov_9fa48("163116"), `CREATE TABLE IF NOT EXISTS ${KV_TABLE_NAME} (`)) + (stryMutAct_9fa48("163117") ? `` : (stryCov_9fa48("163117"), `${KV_COL.SESSION_ID} TEXT NOT NULL, `)) + (stryMutAct_9fa48("163118") ? `` : (stryCov_9fa48("163118"), `${KV_COL.KEY} TEXT NOT NULL, `)) + (stryMutAct_9fa48("163119") ? `` : (stryCov_9fa48("163119"), `${KV_COL.VALUE} BLOB NOT NULL, `)) + (stryMutAct_9fa48("163120") ? `` : (stryCov_9fa48("163120"), `${KV_COL.UPDATED_AT} INTEGER NOT NULL, `)) + (stryMutAct_9fa48("163121") ? `` : (stryCov_9fa48("163121"), `PRIMARY KEY (${KV_COL.SESSION_ID}, ${KV_COL.KEY})`)) + (stryMutAct_9fa48("163122") ? `` : (stryCov_9fa48("163122"), `)`)),
  CREATE_INDEX: (stryMutAct_9fa48("163123") ? `` : (stryCov_9fa48("163123"), `CREATE INDEX IF NOT EXISTS idx_kv_session `)) + (stryMutAct_9fa48("163124") ? `` : (stryCov_9fa48("163124"), `ON ${KV_TABLE_NAME}(${KV_COL.SESSION_ID})`)),
  GET: (stryMutAct_9fa48("163125") ? `` : (stryCov_9fa48("163125"), `SELECT ${KV_COL.VALUE} FROM ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163126") ? `` : (stryCov_9fa48("163126"), `WHERE ${KV_COL.SESSION_ID} = ? AND ${KV_COL.KEY} = ?`)),
  GET_ALL: (stryMutAct_9fa48("163127") ? `` : (stryCov_9fa48("163127"), `SELECT ${KV_COL.KEY}, ${KV_COL.VALUE} FROM ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163128") ? `` : (stryCov_9fa48("163128"), `WHERE ${KV_COL.SESSION_ID} = ?`)),
  UPSERT: (stryMutAct_9fa48("163129") ? `` : (stryCov_9fa48("163129"), `INSERT OR REPLACE INTO ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163130") ? `` : (stryCov_9fa48("163130"), `(${KV_COL.SESSION_ID}, ${KV_COL.KEY}, `)) + (stryMutAct_9fa48("163131") ? `` : (stryCov_9fa48("163131"), `${KV_COL.VALUE}, ${KV_COL.UPDATED_AT}) `)) + (stryMutAct_9fa48("163132") ? `` : (stryCov_9fa48("163132"), `VALUES (?, ?, ?, ?)`)),
  DELETE_KEY: (stryMutAct_9fa48("163133") ? `` : (stryCov_9fa48("163133"), `DELETE FROM ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163134") ? `` : (stryCov_9fa48("163134"), `WHERE ${KV_COL.SESSION_ID} = ? AND ${KV_COL.KEY} = ?`)),
  DELETE_SESSION: (stryMutAct_9fa48("163135") ? `` : (stryCov_9fa48("163135"), `DELETE FROM ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163136") ? `` : (stryCov_9fa48("163136"), `WHERE ${KV_COL.SESSION_ID} = ?`)),
  SESSION_SIZE: (stryMutAct_9fa48("163137") ? `` : (stryCov_9fa48("163137"), `SELECT COALESCE(SUM(LENGTH(${KV_COL.VALUE})), ${NUM.ZERO}) `)) + (stryMutAct_9fa48("163138") ? `` : (stryCov_9fa48("163138"), `AS total_bytes FROM ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163139") ? `` : (stryCov_9fa48("163139"), `WHERE ${KV_COL.SESSION_ID} = ?`)),
  TOTAL_SIZE: (stryMutAct_9fa48("163140") ? `` : (stryCov_9fa48("163140"), `SELECT COALESCE(SUM(LENGTH(${KV_COL.VALUE})), ${NUM.ZERO}) `)) + (stryMutAct_9fa48("163141") ? `` : (stryCov_9fa48("163141"), `AS total_bytes FROM ${KV_TABLE_NAME}`)),
  VALUE_SIZE: (stryMutAct_9fa48("163142") ? `` : (stryCov_9fa48("163142"), `SELECT COALESCE(LENGTH(${KV_COL.VALUE}), ${NUM.ZERO}) `)) + (stryMutAct_9fa48("163143") ? `` : (stryCov_9fa48("163143"), `AS value_bytes FROM ${KV_TABLE_NAME} `)) + (stryMutAct_9fa48("163144") ? `` : (stryCov_9fa48("163144"), `WHERE ${KV_COL.SESSION_ID} = ? AND ${KV_COL.KEY} = ?`))
}));

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
    if (stryMutAct_9fa48("163145")) {
      {}
    } else {
      stryCov_9fa48("163145");
      this.db = new Database(dbPath);
      this.db.pragma(stryMutAct_9fa48("163146") ? "" : (stryCov_9fa48("163146"), 'journal_mode = WAL'));
      this.db.pragma(stryMutAct_9fa48("163147") ? "" : (stryCov_9fa48("163147"), 'synchronous = NORMAL'));
      this._sessionSizeLimitBytes = null;
      this._serviceSizeLimitBytes = null;
      this._createSchema();
      this._prepareStatements();
    }
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
    if (stryMutAct_9fa48("163148")) {
      {}
    } else {
      stryCov_9fa48("163148");
      this._sessionSizeLimitBytes = sessionSizeLimitBytes;
      this._serviceSizeLimitBytes = serviceSizeLimitBytes;
    }
  }

  /**
   * Retrieve a single value by session and key.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key within the session.
   * @return {Buffer|null} The stored value or null if not found.
   */
  get(sessionId, key) {
    if (stryMutAct_9fa48("163149")) {
      {}
    } else {
      stryCov_9fa48("163149");
      const row = this._stmtGet.get(sessionId, key);
      if (stryMutAct_9fa48("163152") ? false : stryMutAct_9fa48("163151") ? true : stryMutAct_9fa48("163150") ? row : (stryCov_9fa48("163150", "163151", "163152"), !row)) {
        if (stryMutAct_9fa48("163153")) {
          {}
        } else {
          stryCov_9fa48("163153");
          return null;
        }
      }
      const val = row[KV_COL.VALUE];
      return Buffer.isBuffer(val) ? val : Buffer.from(val);
    }
  }

  /**
   * Retrieve all key-value pairs for a session.
   * @param {string} sessionId - Session identifier.
   * @return {Map<string, Buffer>} Map of key to value Buffer.
   */
  getAll(sessionId) {
    if (stryMutAct_9fa48("163154")) {
      {}
    } else {
      stryCov_9fa48("163154");
      const rows = this._stmtGetAll.all(sessionId);
      const result = new Map();
      for (const row of rows) {
        if (stryMutAct_9fa48("163155")) {
          {}
        } else {
          stryCov_9fa48("163155");
          const val = row[KV_COL.VALUE];
          const buf = Buffer.isBuffer(val) ? val : Buffer.from(val);
          result.set(row[KV_COL.KEY], buf);
        }
      }
      return result;
    }
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
    if (stryMutAct_9fa48("163156")) {
      {}
    } else {
      stryCov_9fa48("163156");
      const limitError = this._checkLimits(sessionId, key, value);
      if (stryMutAct_9fa48("163158") ? false : stryMutAct_9fa48("163157") ? true : (stryCov_9fa48("163157", "163158"), limitError)) {
        if (stryMutAct_9fa48("163159")) {
          {}
        } else {
          stryCov_9fa48("163159");
          return stryMutAct_9fa48("163160") ? {} : (stryCov_9fa48("163160"), {
            accepted: stryMutAct_9fa48("163161") ? true : (stryCov_9fa48("163161"), false),
            error: limitError
          });
        }
      }
      this._stmtUpsert.run(sessionId, key, value, Date.now());
      return stryMutAct_9fa48("163162") ? {} : (stryCov_9fa48("163162"), {
        accepted: stryMutAct_9fa48("163163") ? false : (stryCov_9fa48("163163"), true),
        error: null
      });
    }
  }

  /**
   * Delete a single key from a session.
   * Called only when the Raft entry is committed.
   * @param {string} sessionId - Session identifier.
   * @param {string} key - Key to delete.
   */
  applyDelete(sessionId, key) {
    if (stryMutAct_9fa48("163164")) {
      {}
    } else {
      stryCov_9fa48("163164");
      this._stmtDeleteKey.run(sessionId, key);
    }
  }

  /**
   * Delete all keys for a session.
   * Called only when the Raft entry is committed.
   * @param {string} sessionId - Session identifier.
   */
  applyDeleteSession(sessionId) {
    if (stryMutAct_9fa48("163165")) {
      {}
    } else {
      stryCov_9fa48("163165");
      this._stmtDeleteSession.run(sessionId);
    }
  }

  /**
   * Get the total size in bytes of all values for a session.
   * @param {string} sessionId - Session identifier.
   * @return {number} Total bytes stored for the session.
   */
  getSessionSize(sessionId) {
    if (stryMutAct_9fa48("163166")) {
      {}
    } else {
      stryCov_9fa48("163166");
      const row = this._stmtSessionSize.get(sessionId);
      return row.total_bytes;
    }
  }

  /**
   * Get the total size in bytes of all values across all sessions.
   * @return {number} Total bytes stored in the KV store.
   */
  getTotalSize() {
    if (stryMutAct_9fa48("163167")) {
      {}
    } else {
      stryCov_9fa48("163167");
      const row = this._stmtTotalSize.get();
      return row.total_bytes;
    }
  }

  /**
   * Close the database connection.
   */
  close() {
    if (stryMutAct_9fa48("163168")) {
      {}
    } else {
      stryCov_9fa48("163168");
      if (stryMutAct_9fa48("163170") ? false : stryMutAct_9fa48("163169") ? true : (stryCov_9fa48("163169", "163170"), this.db)) {
        if (stryMutAct_9fa48("163171")) {
          {}
        } else {
          stryCov_9fa48("163171");
          this.db.close();
          this.db = null;
        }
      }
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
    if (stryMutAct_9fa48("163172")) {
      {}
    } else {
      stryCov_9fa48("163172");
      const hasSessionLimit = stryMutAct_9fa48("163175") ? this._sessionSizeLimitBytes === null : stryMutAct_9fa48("163174") ? false : stryMutAct_9fa48("163173") ? true : (stryCov_9fa48("163173", "163174", "163175"), this._sessionSizeLimitBytes !== null);
      const hasServiceLimit = stryMutAct_9fa48("163178") ? this._serviceSizeLimitBytes === null : stryMutAct_9fa48("163177") ? false : stryMutAct_9fa48("163176") ? true : (stryCov_9fa48("163176", "163177", "163178"), this._serviceSizeLimitBytes !== null);
      if (stryMutAct_9fa48("163181") ? !hasSessionLimit || !hasServiceLimit : stryMutAct_9fa48("163180") ? false : stryMutAct_9fa48("163179") ? true : (stryCov_9fa48("163179", "163180", "163181"), (stryMutAct_9fa48("163182") ? hasSessionLimit : (stryCov_9fa48("163182"), !hasSessionLimit)) && (stryMutAct_9fa48("163183") ? hasServiceLimit : (stryCov_9fa48("163183"), !hasServiceLimit)))) {
        if (stryMutAct_9fa48("163184")) {
          {}
        } else {
          stryCov_9fa48("163184");
          return null;
        }
      }
      const oldValueSize = this._getValueSize(sessionId, key);
      const newValueSize = value.length;
      const delta = stryMutAct_9fa48("163185") ? newValueSize + oldValueSize : (stryCov_9fa48("163185"), newValueSize - oldValueSize);
      if (stryMutAct_9fa48("163187") ? false : stryMutAct_9fa48("163186") ? true : (stryCov_9fa48("163186", "163187"), hasSessionLimit)) {
        if (stryMutAct_9fa48("163188")) {
          {}
        } else {
          stryCov_9fa48("163188");
          const currentSessionSize = this.getSessionSize(sessionId);
          const projectedSessionSize = stryMutAct_9fa48("163189") ? currentSessionSize - delta : (stryCov_9fa48("163189"), currentSessionSize + delta);
          if (stryMutAct_9fa48("163193") ? projectedSessionSize <= this._sessionSizeLimitBytes : stryMutAct_9fa48("163192") ? projectedSessionSize >= this._sessionSizeLimitBytes : stryMutAct_9fa48("163191") ? false : stryMutAct_9fa48("163190") ? true : (stryCov_9fa48("163190", "163191", "163192", "163193"), projectedSessionSize > this._sessionSizeLimitBytes)) {
            if (stryMutAct_9fa48("163194")) {
              {}
            } else {
              stryCov_9fa48("163194");
              return WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED;
            }
          }
        }
      }
      if (stryMutAct_9fa48("163196") ? false : stryMutAct_9fa48("163195") ? true : (stryCov_9fa48("163195", "163196"), hasServiceLimit)) {
        if (stryMutAct_9fa48("163197")) {
          {}
        } else {
          stryCov_9fa48("163197");
          const currentTotalSize = this.getTotalSize();
          const projectedTotalSize = stryMutAct_9fa48("163198") ? currentTotalSize - delta : (stryCov_9fa48("163198"), currentTotalSize + delta);
          if (stryMutAct_9fa48("163202") ? projectedTotalSize <= this._serviceSizeLimitBytes : stryMutAct_9fa48("163201") ? projectedTotalSize >= this._serviceSizeLimitBytes : stryMutAct_9fa48("163200") ? false : stryMutAct_9fa48("163199") ? true : (stryCov_9fa48("163199", "163200", "163201", "163202"), projectedTotalSize > this._serviceSizeLimitBytes)) {
            if (stryMutAct_9fa48("163203")) {
              {}
            } else {
              stryCov_9fa48("163203");
              return WASM_SERVICE_ERROR_MSG.SERVICE_SIZE_LIMIT_EXCEEDED;
            }
          }
        }
      }
      return null;
    }
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
    if (stryMutAct_9fa48("163204")) {
      {}
    } else {
      stryCov_9fa48("163204");
      const row = this._stmtValueSize.get(sessionId, key);
      if (stryMutAct_9fa48("163207") ? false : stryMutAct_9fa48("163206") ? true : stryMutAct_9fa48("163205") ? row : (stryCov_9fa48("163205", "163206", "163207"), !row)) {
        if (stryMutAct_9fa48("163208")) {
          {}
        } else {
          stryCov_9fa48("163208");
          return NUM.ZERO;
        }
      }
      return row.value_bytes;
    }
  }

  /**
   * Create the _kv_store table and index if they do not exist.
   * @private
   */
  _createSchema() {
    if (stryMutAct_9fa48("163209")) {
      {}
    } else {
      stryCov_9fa48("163209");
      this.db.exec(KV_SQL.CREATE_TABLE);
      this.db.exec(KV_SQL.CREATE_INDEX);
    }
  }

  /**
   * Prepare all SQL statements for reuse.
   * @private
   */
  _prepareStatements() {
    if (stryMutAct_9fa48("163210")) {
      {}
    } else {
      stryCov_9fa48("163210");
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
}
export { SessionKVStore, KV_TABLE_NAME, KV_COL, KV_SQL };