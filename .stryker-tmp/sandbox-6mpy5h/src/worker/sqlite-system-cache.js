/**
 * SQLiteSystemCache - In-memory SQLite cache for system tables.
 *
 * Each message group replica has its own instance of this cache.
 * The cache is updated via CDC events and replicated via Raft consensus.
 *
 * @module worker/sqlite-system-cache
 * @see Requirements 3.1, 3.2, 3.5 - Independent System Caches
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
import { CDC_OPERATION } from '../constants/index.js';
import { SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL, generateCreateIndexSQL } from '../bootstrap/system-table-schemas-constants.js';
import { SYSTEM_CACHE_KEY_DESCRIPTOR } from '../cache/system-cache-key-descriptor.js';

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
const CACHE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("166069") ? {} : (stryCov_9fa48("166069"), {
  NOT_INITIALIZED: stryMutAct_9fa48("166070") ? "" : (stryCov_9fa48("166070"), 'SQLiteSystemCache not initialized'),
  ALREADY_INITIALIZED: stryMutAct_9fa48("166071") ? "" : (stryCov_9fa48("166071"), 'SQLiteSystemCache already initialized'),
  INVALID_DATA: stryMutAct_9fa48("166072") ? "" : (stryCov_9fa48("166072"), 'Invalid data for CDC event'),
  INVALID_DYNAMIC_TABLE_COLUMNS: stryMutAct_9fa48("166073") ? "" : (stryCov_9fa48("166073"), 'Dynamic table columns must be a non-empty array'),
  unknownTable: stryMutAct_9fa48("166074") ? () => undefined : (stryCov_9fa48("166074"), tableName => stryMutAct_9fa48("166075") ? `` : (stryCov_9fa48("166075"), `Unknown system table: ${tableName}`)),
  unknownCdcOperation: stryMutAct_9fa48("166076") ? () => undefined : (stryCov_9fa48("166076"), operation => stryMutAct_9fa48("166077") ? `` : (stryCov_9fa48("166077"), `Unknown CDC operation: ${operation}`)),
  queryFailed: stryMutAct_9fa48("166078") ? () => undefined : (stryCov_9fa48("166078"), error => stryMutAct_9fa48("166079") ? `` : (stryCov_9fa48("166079"), `Query failed: ${error}`))
}));

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
    if (stryMutAct_9fa48("166080")) {
      {}
    } else {
      stryCov_9fa48("166080");
      this.db = null;
      this.initialized = stryMutAct_9fa48("166081") ? true : (stryCov_9fa48("166081"), false);
      this.preparedStatements = new Map();
    }
  }

  /**
   * Initialize the in-memory SQLite database with system table schemas.
   * @return {void}
   */
  initialize() {
    if (stryMutAct_9fa48("166082")) {
      {}
    } else {
      stryCov_9fa48("166082");
      if (stryMutAct_9fa48("166084") ? false : stryMutAct_9fa48("166083") ? true : (stryCov_9fa48("166083", "166084"), this.initialized)) {
        if (stryMutAct_9fa48("166085")) {
          {}
        } else {
          stryCov_9fa48("166085");
          throw new Error(CACHE_ERROR_MSG.ALREADY_INITIALIZED);
        }
      }

      // Create in-memory SQLite database
      this.db = new Database(stryMutAct_9fa48("166086") ? "" : (stryCov_9fa48("166086"), ':memory:'));

      // Enable WAL mode for better performance (even in memory)
      this.db.pragma(stryMutAct_9fa48("166087") ? "" : (stryCov_9fa48("166087"), 'journal_mode = WAL'));

      // Create all system tables
      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        if (stryMutAct_9fa48("166088")) {
          {}
        } else {
          stryCov_9fa48("166088");
          const createTableSQL = generateCreateTableSQL(schema);
          this.db.exec(createTableSQL);

          // Create indices for the table
          const indexStatements = generateCreateIndexSQL(schema);
          for (const indexSQL of indexStatements) {
            if (stryMutAct_9fa48("166089")) {
              {}
            } else {
              stryCov_9fa48("166089");
              this.db.exec(indexSQL);
            }
          }
        }
      }
      this.initialized = stryMutAct_9fa48("166090") ? false : (stryCov_9fa48("166090"), true);
    }
  }

  /**
   * Ensure the cache is initialized.
   * @private
   * @throws {Error} If cache is not initialized
   */
  ensureInitialized() {
    if (stryMutAct_9fa48("166091")) {
      {}
    } else {
      stryCov_9fa48("166091");
      if (stryMutAct_9fa48("166094") ? false : stryMutAct_9fa48("166093") ? true : stryMutAct_9fa48("166092") ? this.initialized : (stryCov_9fa48("166092", "166093", "166094"), !this.initialized)) {
        if (stryMutAct_9fa48("166095")) {
          {}
        } else {
          stryCov_9fa48("166095");
          throw new Error(CACHE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
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
    if (stryMutAct_9fa48("166096")) {
      {}
    } else {
      stryCov_9fa48("166096");
      const pkColumn = PRIMARY_KEY_COLUMNS[tableName];
      if (stryMutAct_9fa48("166099") ? false : stryMutAct_9fa48("166098") ? true : stryMutAct_9fa48("166097") ? pkColumn : (stryCov_9fa48("166097", "166098", "166099"), !pkColumn)) {
        if (stryMutAct_9fa48("166100")) {
          {}
        } else {
          stryCov_9fa48("166100");
          const errorMsg = CACHE_ERROR_MSG.unknownTable(tableName);
          throw new Error(errorMsg);
        }
      }
      return pkColumn;
    }
  }

  /**
   * Get a record from a system table by primary key.
   * @param {string} tableName - System table name
   * @param {string} key - Primary key value
   * @return {Object|undefined} Record or undefined if not found
   */
  get(tableName, key) {
    if (stryMutAct_9fa48("166101")) {
      {}
    } else {
      stryCov_9fa48("166101");
      this.ensureInitialized();
      const pkColumn = this.getPrimaryKeyColumn(tableName);
      const sql = stryMutAct_9fa48("166102") ? `` : (stryCov_9fa48("166102"), `SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`);
      const stmt = this.db.prepare(sql);
      return stmt.get(key);
    }
  }

  /**
   * Query system table with SQL.
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @return {Array<Object>} Query results
   */
  query(sql, params = stryMutAct_9fa48("166103") ? ["Stryker was here"] : (stryCov_9fa48("166103"), [])) {
    if (stryMutAct_9fa48("166104")) {
      {}
    } else {
      stryCov_9fa48("166104");
      this.ensureInitialized();
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    }
  }

  /**
   * Execute raw SQL against the cache database.
   * SELECT statements return rows, writes return SQLite run metadata.
   * @param {string} sql - SQL statement.
   * @param {Array} params - SQL parameters.
   * @return {Array<Object>|Object} Query rows or write metadata.
   */
  executeRawSQL(sql, params = stryMutAct_9fa48("166105") ? ["Stryker was here"] : (stryCov_9fa48("166105"), [])) {
    if (stryMutAct_9fa48("166106")) {
      {}
    } else {
      stryCov_9fa48("166106");
      this.ensureInitialized();
      const stmt = this.db.prepare(sql);
      if (stryMutAct_9fa48("166111") ? sql.toUpperCase().startsWith('SELECT') : stryMutAct_9fa48("166110") ? sql.trim().toLowerCase().startsWith('SELECT') : stryMutAct_9fa48("166109") ? sql.trim().toUpperCase().endsWith('SELECT') : stryMutAct_9fa48("166108") ? false : stryMutAct_9fa48("166107") ? true : (stryCov_9fa48("166107", "166108", "166109", "166110", "166111"), sql.trim().toUpperCase().startsWith(stryMutAct_9fa48("166112") ? "" : (stryCov_9fa48("166112"), 'SELECT')))) {
        if (stryMutAct_9fa48("166113")) {
          {}
        } else {
          stryCov_9fa48("166113");
          return stmt.all(...params);
        }
      }
      const info = stmt.run(...params);
      return stryMutAct_9fa48("166114") ? {} : (stryCov_9fa48("166114"), {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid
      });
    }
  }

  /**
   * Check whether a table exists in the cache database.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   */
  hasTable(tableName) {
    if (stryMutAct_9fa48("166115")) {
      {}
    } else {
      stryCov_9fa48("166115");
      this.ensureInitialized();
      const stmt = this.db.prepare(stryMutAct_9fa48("166116") ? "" : (stryCov_9fa48("166116"), 'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?'));
      return Boolean(stmt.get(stryMutAct_9fa48("166117") ? "" : (stryCov_9fa48("166117"), 'table'), tableName));
    }
  }

  /**
   * Create a dynamic table for CDC user-table replication.
   * @param {string} tableName - Table name.
   * @param {Array<string>} columns - Column names.
   */
  createDynamicTable(tableName, columns) {
    if (stryMutAct_9fa48("166118")) {
      {}
    } else {
      stryCov_9fa48("166118");
      this.ensureInitialized();
      if (stryMutAct_9fa48("166121") ? !Array.isArray(columns) && columns.length === 0 : stryMutAct_9fa48("166120") ? false : stryMutAct_9fa48("166119") ? true : (stryCov_9fa48("166119", "166120", "166121"), (stryMutAct_9fa48("166122") ? Array.isArray(columns) : (stryCov_9fa48("166122"), !Array.isArray(columns))) || (stryMutAct_9fa48("166124") ? columns.length !== 0 : stryMutAct_9fa48("166123") ? false : (stryCov_9fa48("166123", "166124"), columns.length === 0)))) {
        if (stryMutAct_9fa48("166125")) {
          {}
        } else {
          stryCov_9fa48("166125");
          throw new Error(CACHE_ERROR_MSG.INVALID_DYNAMIC_TABLE_COLUMNS);
        }
      }
      const quotedColumns = columns.map(stryMutAct_9fa48("166126") ? () => undefined : (stryCov_9fa48("166126"), column => stryMutAct_9fa48("166127") ? `` : (stryCov_9fa48("166127"), `"${column}" TEXT`)));
      const primaryKeyColumn = columns.find(stryMutAct_9fa48("166128") ? () => undefined : (stryCov_9fa48("166128"), column => stryMutAct_9fa48("166131") ? column === 'id' && column.endsWith('_id') : stryMutAct_9fa48("166130") ? false : stryMutAct_9fa48("166129") ? true : (stryCov_9fa48("166129", "166130", "166131"), (stryMutAct_9fa48("166133") ? column !== 'id' : stryMutAct_9fa48("166132") ? false : (stryCov_9fa48("166132", "166133"), column === (stryMutAct_9fa48("166134") ? "" : (stryCov_9fa48("166134"), 'id')))) || (stryMutAct_9fa48("166135") ? column.startsWith('_id') : (stryCov_9fa48("166135"), column.endsWith(stryMutAct_9fa48("166136") ? "" : (stryCov_9fa48("166136"), '_id')))))));
      if (stryMutAct_9fa48("166138") ? false : stryMutAct_9fa48("166137") ? true : (stryCov_9fa48("166137", "166138"), primaryKeyColumn)) {
        if (stryMutAct_9fa48("166139")) {
          {}
        } else {
          stryCov_9fa48("166139");
          quotedColumns.push(stryMutAct_9fa48("166140") ? `` : (stryCov_9fa48("166140"), `PRIMARY KEY ("${primaryKeyColumn}")`));
        }
      }
      this.db.exec(stryMutAct_9fa48("166141") ? `` : (stryCov_9fa48("166141"), `CREATE TABLE IF NOT EXISTS "${tableName}" (${quotedColumns.join(stryMutAct_9fa48("166142") ? "" : (stryCov_9fa48("166142"), ', '))})`));
    }
  }

  /**
   * Filter records from a system table by predicate function.
   * @param {string} tableName - System table name
   * @param {Function} predicate - Filter function (record) => boolean
   * @return {Array<Object>} Filtered records
   */
  filter(tableName, predicate) {
    if (stryMutAct_9fa48("166143")) {
      {}
    } else {
      stryCov_9fa48("166143");
      this.ensureInitialized();

      // Validate table exists
      this.getPrimaryKeyColumn(tableName);
      const sql = stryMutAct_9fa48("166144") ? `` : (stryCov_9fa48("166144"), `SELECT * FROM ${tableName}`);
      const stmt = this.db.prepare(sql);
      const allRecords = stmt.all();
      return stryMutAct_9fa48("166145") ? allRecords : (stryCov_9fa48("166145"), allRecords.filter(predicate));
    }
  }

  /**
   * Get all records from a system table.
   * @param {string} tableName - System table name
   * @return {Array<Object>} All records in the table
   */
  getAll(tableName) {
    if (stryMutAct_9fa48("166146")) {
      {}
    } else {
      stryCov_9fa48("166146");
      this.ensureInitialized();

      // Validate table exists
      this.getPrimaryKeyColumn(tableName);
      const sql = stryMutAct_9fa48("166147") ? `` : (stryCov_9fa48("166147"), `SELECT * FROM ${tableName}`);
      const stmt = this.db.prepare(sql);
      return stmt.all();
    }
  }

  /**
   * Apply a CDC event to the cache.
   * @param {string} tableName - Table name
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE)
   * @param {Object} data - Record data
   * @return {void}
   */
  applyCDCEvent(tableName, operation, data) {
    if (stryMutAct_9fa48("166148")) {
      {}
    } else {
      stryCov_9fa48("166148");
      this.ensureInitialized();
      if (stryMutAct_9fa48("166151") ? !data && typeof data !== 'object' : stryMutAct_9fa48("166150") ? false : stryMutAct_9fa48("166149") ? true : (stryCov_9fa48("166149", "166150", "166151"), (stryMutAct_9fa48("166152") ? data : (stryCov_9fa48("166152"), !data)) || (stryMutAct_9fa48("166154") ? typeof data === 'object' : stryMutAct_9fa48("166153") ? false : (stryCov_9fa48("166153", "166154"), typeof data !== (stryMutAct_9fa48("166155") ? "" : (stryCov_9fa48("166155"), 'object')))))) {
        if (stryMutAct_9fa48("166156")) {
          {}
        } else {
          stryCov_9fa48("166156");
          throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
        }
      }
      const pkColumn = this.getPrimaryKeyColumn(tableName);
      if (stryMutAct_9fa48("166159") ? operation !== CDC_OPERATION.INSERT : stryMutAct_9fa48("166158") ? false : stryMutAct_9fa48("166157") ? true : (stryCov_9fa48("166157", "166158", "166159"), operation === CDC_OPERATION.INSERT)) {
        if (stryMutAct_9fa48("166160")) {
          {}
        } else {
          stryCov_9fa48("166160");
          this.insertRecord(tableName, data);
        }
      } else if (stryMutAct_9fa48("166163") ? operation !== CDC_OPERATION.UPDATE : stryMutAct_9fa48("166162") ? false : stryMutAct_9fa48("166161") ? true : (stryCov_9fa48("166161", "166162", "166163"), operation === CDC_OPERATION.UPDATE)) {
        if (stryMutAct_9fa48("166164")) {
          {}
        } else {
          stryCov_9fa48("166164");
          this.updateRecord(tableName, pkColumn, data);
        }
      } else if (stryMutAct_9fa48("166167") ? operation !== CDC_OPERATION.DELETE : stryMutAct_9fa48("166166") ? false : stryMutAct_9fa48("166165") ? true : (stryCov_9fa48("166165", "166166", "166167"), operation === CDC_OPERATION.DELETE)) {
        if (stryMutAct_9fa48("166168")) {
          {}
        } else {
          stryCov_9fa48("166168");
          this.deleteRecord(tableName, pkColumn, data);
        }
      } else if (stryMutAct_9fa48("166171") ? operation !== CDC_OPERATION.UPSERT : stryMutAct_9fa48("166170") ? false : stryMutAct_9fa48("166169") ? true : (stryCov_9fa48("166169", "166170", "166171"), operation === CDC_OPERATION.UPSERT)) {
        if (stryMutAct_9fa48("166172")) {
          {}
        } else {
          stryCov_9fa48("166172");
          this.upsertRecord(tableName, pkColumn, data);
        }
      } else {
        if (stryMutAct_9fa48("166173")) {
          {}
        } else {
          stryCov_9fa48("166173");
          const errorMsg = CACHE_ERROR_MSG.unknownCdcOperation(operation);
          throw new Error(errorMsg);
        }
      }
    }
  }

  /**
   * Insert a record into a table.
   * @private
   * @param {string} tableName - Table name
   * @param {Object} data - Record data
   */
  insertRecord(tableName, data) {
    if (stryMutAct_9fa48("166174")) {
      {}
    } else {
      stryCov_9fa48("166174");
      const columns = Object.keys(data);
      const placeholders = columns.map(stryMutAct_9fa48("166175") ? () => undefined : (stryCov_9fa48("166175"), () => stryMutAct_9fa48("166176") ? "" : (stryCov_9fa48("166176"), '?'))).join(stryMutAct_9fa48("166177") ? "" : (stryCov_9fa48("166177"), ', '));
      const values = columns.map(stryMutAct_9fa48("166178") ? () => undefined : (stryCov_9fa48("166178"), col => data[col]));
      const sql = stryMutAct_9fa48("166179") ? `` : (stryCov_9fa48("166179"), `INSERT INTO ${tableName} (${columns.join(stryMutAct_9fa48("166180") ? "" : (stryCov_9fa48("166180"), ', '))}) VALUES (${placeholders})`);
      const stmt = this.db.prepare(sql);
      stmt.run(...values);
    }
  }

  /**
   * Update a record in a table.
   * @private
   * @param {string} tableName - Table name
   * @param {string} pkColumn - Primary key column name
   * @param {Object} data - Record data (must include primary key)
   */
  updateRecord(tableName, pkColumn, data) {
    if (stryMutAct_9fa48("166181")) {
      {}
    } else {
      stryCov_9fa48("166181");
      const pkValue = data[pkColumn];
      if (stryMutAct_9fa48("166184") ? pkValue !== undefined : stryMutAct_9fa48("166183") ? false : stryMutAct_9fa48("166182") ? true : (stryCov_9fa48("166182", "166183", "166184"), pkValue === undefined)) {
        if (stryMutAct_9fa48("166185")) {
          {}
        } else {
          stryCov_9fa48("166185");
          throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
        }
      }
      const columns = stryMutAct_9fa48("166186") ? Object.keys(data) : (stryCov_9fa48("166186"), Object.keys(data).filter(stryMutAct_9fa48("166187") ? () => undefined : (stryCov_9fa48("166187"), col => stryMutAct_9fa48("166190") ? col === pkColumn : stryMutAct_9fa48("166189") ? false : stryMutAct_9fa48("166188") ? true : (stryCov_9fa48("166188", "166189", "166190"), col !== pkColumn))));
      if (stryMutAct_9fa48("166193") ? columns.length !== 0 : stryMutAct_9fa48("166192") ? false : stryMutAct_9fa48("166191") ? true : (stryCov_9fa48("166191", "166192", "166193"), columns.length === 0)) {
        if (stryMutAct_9fa48("166194")) {
          {}
        } else {
          stryCov_9fa48("166194");
          return; // Nothing to update
        }
      }
      const setClause = columns.map(stryMutAct_9fa48("166195") ? () => undefined : (stryCov_9fa48("166195"), col => stryMutAct_9fa48("166196") ? `` : (stryCov_9fa48("166196"), `${col} = ?`))).join(stryMutAct_9fa48("166197") ? "" : (stryCov_9fa48("166197"), ', '));
      const values = columns.map(stryMutAct_9fa48("166198") ? () => undefined : (stryCov_9fa48("166198"), col => data[col]));
      values.push(pkValue);
      const sql = stryMutAct_9fa48("166199") ? `` : (stryCov_9fa48("166199"), `UPDATE ${tableName} SET ${setClause} WHERE ${pkColumn} = ?`);
      const stmt = this.db.prepare(sql);
      stmt.run(...values);
    }
  }

  /**
   * Delete a record from a table.
   * @private
   * @param {string} tableName - Table name
   * @param {string} pkColumn - Primary key column name
   * @param {Object} data - Record data (must include primary key)
   */
  deleteRecord(tableName, pkColumn, data) {
    if (stryMutAct_9fa48("166200")) {
      {}
    } else {
      stryCov_9fa48("166200");
      const pkValue = data[pkColumn];
      if (stryMutAct_9fa48("166203") ? pkValue !== undefined : stryMutAct_9fa48("166202") ? false : stryMutAct_9fa48("166201") ? true : (stryCov_9fa48("166201", "166202", "166203"), pkValue === undefined)) {
        if (stryMutAct_9fa48("166204")) {
          {}
        } else {
          stryCov_9fa48("166204");
          throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
        }
      }
      const sql = stryMutAct_9fa48("166205") ? `` : (stryCov_9fa48("166205"), `DELETE FROM ${tableName} WHERE ${pkColumn} = ?`);
      const stmt = this.db.prepare(sql);
      stmt.run(pkValue);
    }
  }

  /**
   * Upsert a record into a table (insert or update).
   * @private
   * @param {string} tableName - Table name
   * @param {string} _pkColumn - Primary key column name (unused, kept for API consistency)
   * @param {Object} data - Record data
   */
  upsertRecord(tableName, _pkColumn, data) {
    if (stryMutAct_9fa48("166206")) {
      {}
    } else {
      stryCov_9fa48("166206");
      const columns = Object.keys(data);
      const placeholders = columns.map(stryMutAct_9fa48("166207") ? () => undefined : (stryCov_9fa48("166207"), () => stryMutAct_9fa48("166208") ? "" : (stryCov_9fa48("166208"), '?'))).join(stryMutAct_9fa48("166209") ? "" : (stryCov_9fa48("166209"), ', '));
      const values = columns.map(stryMutAct_9fa48("166210") ? () => undefined : (stryCov_9fa48("166210"), col => data[col]));

      // Use INSERT OR REPLACE for upsert behavior
      const sql = (stryMutAct_9fa48("166211") ? `` : (stryCov_9fa48("166211"), `INSERT OR REPLACE INTO ${tableName} `)) + (stryMutAct_9fa48("166212") ? `` : (stryCov_9fa48("166212"), `(${columns.join(stryMutAct_9fa48("166213") ? "" : (stryCov_9fa48("166213"), ', '))}) VALUES (${placeholders})`));
      const stmt = this.db.prepare(sql);
      stmt.run(...values);
    }
  }

  /**
   * Get all data for Raft replication.
   * Returns a serializable object containing all cache data.
   * @return {Object} Serializable cache state
   */
  getReplicationState() {
    if (stryMutAct_9fa48("166214")) {
      {}
    } else {
      stryCov_9fa48("166214");
      this.ensureInitialized();
      const state = {};
      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        if (stryMutAct_9fa48("166215")) {
          {}
        } else {
          stryCov_9fa48("166215");
          const tableName = schema.tableName;
          const sql = stryMutAct_9fa48("166216") ? `` : (stryCov_9fa48("166216"), `SELECT * FROM ${tableName}`);
          const stmt = this.db.prepare(sql);
          state[tableName] = stmt.all();
        }
      }
      return state;
    }
  }

  /**
   * Apply replicated state from Raft leader.
   * Clears existing data and applies the replicated state.
   * @param {Object} state - Replicated cache state
   */
  applyReplicationState(state) {
    if (stryMutAct_9fa48("166217")) {
      {}
    } else {
      stryCov_9fa48("166217");
      this.ensureInitialized();
      if (stryMutAct_9fa48("166220") ? !state && typeof state !== 'object' : stryMutAct_9fa48("166219") ? false : stryMutAct_9fa48("166218") ? true : (stryCov_9fa48("166218", "166219", "166220"), (stryMutAct_9fa48("166221") ? state : (stryCov_9fa48("166221"), !state)) || (stryMutAct_9fa48("166223") ? typeof state === 'object' : stryMutAct_9fa48("166222") ? false : (stryCov_9fa48("166222", "166223"), typeof state !== (stryMutAct_9fa48("166224") ? "" : (stryCov_9fa48("166224"), 'object')))))) {
        if (stryMutAct_9fa48("166225")) {
          {}
        } else {
          stryCov_9fa48("166225");
          throw new Error(CACHE_ERROR_MSG.INVALID_DATA);
        }
      }

      // Use a transaction for atomicity
      const transaction = this.db.transaction(() => {
        if (stryMutAct_9fa48("166226")) {
          {}
        } else {
          stryCov_9fa48("166226");
          // Clear all tables and insert replicated data
          for (const schema of SYSTEM_TABLE_SCHEMAS) {
            if (stryMutAct_9fa48("166227")) {
              {}
            } else {
              stryCov_9fa48("166227");
              const tableName = schema.tableName;

              // Clear existing data
              this.db.exec(stryMutAct_9fa48("166228") ? `` : (stryCov_9fa48("166228"), `DELETE FROM ${tableName}`));

              // Insert replicated data if present
              const records = state[tableName];
              if (stryMutAct_9fa48("166231") ? records || Array.isArray(records) : stryMutAct_9fa48("166230") ? false : stryMutAct_9fa48("166229") ? true : (stryCov_9fa48("166229", "166230", "166231"), records && Array.isArray(records))) {
                if (stryMutAct_9fa48("166232")) {
                  {}
                } else {
                  stryCov_9fa48("166232");
                  for (const record of records) {
                    if (stryMutAct_9fa48("166233")) {
                      {}
                    } else {
                      stryCov_9fa48("166233");
                      this.insertRecord(tableName, record);
                    }
                  }
                }
              }
            }
          }
        }
      });
      transaction();
    }
  }

  /**
   * Close the database connection and clean up resources.
   * @return {void}
   */
  close() {
    if (stryMutAct_9fa48("166234")) {
      {}
    } else {
      stryCov_9fa48("166234");
      if (stryMutAct_9fa48("166236") ? false : stryMutAct_9fa48("166235") ? true : (stryCov_9fa48("166235", "166236"), this.db)) {
        if (stryMutAct_9fa48("166237")) {
          {}
        } else {
          stryCov_9fa48("166237");
          this.db.close();
          this.db = null;
        }
      }
      this.initialized = stryMutAct_9fa48("166238") ? true : (stryCov_9fa48("166238"), false);
      this.preparedStatements.clear();
    }
  }

  /**
   * Check if the cache is initialized.
   * @return {boolean} True if initialized
   */
  isInitialized() {
    if (stryMutAct_9fa48("166239")) {
      {}
    } else {
      stryCov_9fa48("166239");
      return this.initialized;
    }
  }

  /**
   * Get statistics about the cache.
   * @return {Object} Cache statistics
   */
  getStats() {
    if (stryMutAct_9fa48("166240")) {
      {}
    } else {
      stryCov_9fa48("166240");
      if (stryMutAct_9fa48("166243") ? false : stryMutAct_9fa48("166242") ? true : stryMutAct_9fa48("166241") ? this.initialized : (stryCov_9fa48("166241", "166242", "166243"), !this.initialized)) {
        if (stryMutAct_9fa48("166244")) {
          {}
        } else {
          stryCov_9fa48("166244");
          return stryMutAct_9fa48("166245") ? {} : (stryCov_9fa48("166245"), {
            initialized: stryMutAct_9fa48("166246") ? true : (stryCov_9fa48("166246"), false),
            tableCount: 0,
            totalRecords: 0
          });
        }
      }
      let totalRecords = 0;
      const tableCounts = {};
      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        if (stryMutAct_9fa48("166247")) {
          {}
        } else {
          stryCov_9fa48("166247");
          const tableName = schema.tableName;
          const sql = stryMutAct_9fa48("166248") ? `` : (stryCov_9fa48("166248"), `SELECT COUNT(*) as count FROM ${tableName}`);
          const stmt = this.db.prepare(sql);
          const result = stmt.get();
          const count = result.count;
          tableCounts[tableName] = count;
          stryMutAct_9fa48("166249") ? totalRecords -= count : (stryCov_9fa48("166249"), totalRecords += count);
        }
      }
      return stryMutAct_9fa48("166250") ? {} : (stryCov_9fa48("166250"), {
        initialized: stryMutAct_9fa48("166251") ? false : (stryCov_9fa48("166251"), true),
        tableCount: SYSTEM_TABLE_SCHEMAS.length,
        totalRecords,
        tableCounts
      });
    }
  }
}
export { SQLiteSystemCache, PRIMARY_KEY_COLUMNS, CACHE_ERROR_MSG };