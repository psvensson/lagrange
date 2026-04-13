/**
 * SQLiteStore - Composable SQLite database lifecycle management.
 * Encapsulates database opening, schema creation, query execution, and closing.
 * Used by PartitionWorkerService and PartitionCoordinator.
 *
 * Requirements: 5.1, 5.2, 5.3
 * @module storage/sqlite-store
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
import { NUM } from '../constants/numbers.js';
import { SQLITE_STORE_DEFAULT, SQLITE_STORE_ERROR_MSG, SQLITE_STORE_LOG_MSG, SQLITE_STORE_OPERATION_PATTERN, SQLITE_STORE_PRAGMA } from './sqlite-store-constants.js';

/**
 * SQL fragments used for schema-to-SQL conversion.
 * Kept local to this module since they are only used here.
 */
const SCHEMA_SQL = Object.freeze(stryMutAct_9fa48("151812") ? {} : (stryCov_9fa48("151812"), {
  CREATE_TABLE_PREFIX: stryMutAct_9fa48("151813") ? "" : (stryCov_9fa48("151813"), 'CREATE TABLE IF NOT EXISTS'),
  PRIMARY_KEY: stryMutAct_9fa48("151814") ? "" : (stryCov_9fa48("151814"), ' PRIMARY KEY'),
  NOT_NULL: stryMutAct_9fa48("151815") ? "" : (stryCov_9fa48("151815"), ' NOT NULL'),
  DEFAULT: stryMutAct_9fa48("151816") ? "" : (stryCov_9fa48("151816"), ' DEFAULT '),
  COLUMN_SEPARATOR: stryMutAct_9fa48("151817") ? "" : (stryCov_9fa48("151817"), ', '),
  OPEN_PAREN: stryMutAct_9fa48("151818") ? "" : (stryCov_9fa48("151818"), ' ('),
  CLOSE_PAREN: stryMutAct_9fa48("151819") ? "" : (stryCov_9fa48("151819"), ')')
}));

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
    if (stryMutAct_9fa48("151820")) {
      {}
    } else {
      stryCov_9fa48("151820");
      this.dbPath = stryMutAct_9fa48("151823") ? options.dbPath && SQLITE_STORE_DEFAULT.DB_PATH : stryMutAct_9fa48("151822") ? false : stryMutAct_9fa48("151821") ? true : (stryCov_9fa48("151821", "151822", "151823"), options.dbPath || SQLITE_STORE_DEFAULT.DB_PATH);
      this.schema = stryMutAct_9fa48("151826") ? options.schema && null : stryMutAct_9fa48("151825") ? false : stryMutAct_9fa48("151824") ? true : (stryCov_9fa48("151824", "151825", "151826"), options.schema || null);
      this.tableName = stryMutAct_9fa48("151829") ? options.tableName && null : stryMutAct_9fa48("151828") ? false : stryMutAct_9fa48("151827") ? true : (stryCov_9fa48("151827", "151828", "151829"), options.tableName || null);
      this.logger = stryMutAct_9fa48("151832") ? options.logger && console : stryMutAct_9fa48("151831") ? false : stryMutAct_9fa48("151830") ? true : (stryCov_9fa48("151830", "151831", "151832"), options.logger || console);
      this.db = null;
      this.initialized = stryMutAct_9fa48("151833") ? true : (stryCov_9fa48("151833"), false);
      this.closed = stryMutAct_9fa48("151834") ? true : (stryCov_9fa48("151834"), false);
    }
  }

  /**
   * Open database, set WAL/NORMAL pragmas, create table if schema provided.
   */
  initialize() {
    if (stryMutAct_9fa48("151835")) {
      {}
    } else {
      stryCov_9fa48("151835");
      this.logger.info(SQLITE_STORE_LOG_MSG.INITIALIZING, stryMutAct_9fa48("151836") ? {} : (stryCov_9fa48("151836"), {
        dbPath: this.dbPath
      }));
      this.db = new Database(this.dbPath);
      this.db.pragma(SQLITE_STORE_PRAGMA.JOURNAL_MODE_WAL);
      this.db.pragma(SQLITE_STORE_PRAGMA.SYNCHRONOUS_NORMAL);
      if (stryMutAct_9fa48("151839") ? this.schema || this.tableName : stryMutAct_9fa48("151838") ? false : stryMutAct_9fa48("151837") ? true : (stryCov_9fa48("151837", "151838", "151839"), this.schema && this.tableName)) {
        if (stryMutAct_9fa48("151840")) {
          {}
        } else {
          stryCov_9fa48("151840");
          this.createTableFromSchema();
        }
      }
      this.initialized = stryMutAct_9fa48("151841") ? false : (stryCov_9fa48("151841"), true);
      this.logger.info(SQLITE_STORE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("151842") ? {} : (stryCov_9fa48("151842"), {
        dbPath: this.dbPath
      }));
    }
  }

  /**
   * Execute a SQL query.
   * SELECT statements return rows; write statements return change info.
   *
   * @param {string} sql - SQL statement.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Object} Result with rows/rowCount or changes/lastInsertRowid.
   */
  executeQuery(sql, params = stryMutAct_9fa48("151843") ? ["Stryker was here"] : (stryCov_9fa48("151843"), [])) {
    if (stryMutAct_9fa48("151844")) {
      {}
    } else {
      stryCov_9fa48("151844");
      if (stryMutAct_9fa48("151847") ? false : stryMutAct_9fa48("151846") ? true : stryMutAct_9fa48("151845") ? this.initialized : (stryCov_9fa48("151845", "151846", "151847"), !this.initialized)) {
        if (stryMutAct_9fa48("151848")) {
          {}
        } else {
          stryCov_9fa48("151848");
          throw new Error(SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("151850") ? false : stryMutAct_9fa48("151849") ? true : (stryCov_9fa48("151849", "151850"), this.closed)) {
        if (stryMutAct_9fa48("151851")) {
          {}
        } else {
          stryCov_9fa48("151851");
          throw new Error(SQLITE_STORE_ERROR_MSG.ALREADY_CLOSED);
        }
      }
      if (stryMutAct_9fa48("151854") ? false : stryMutAct_9fa48("151853") ? true : stryMutAct_9fa48("151852") ? sql : (stryCov_9fa48("151852", "151853", "151854"), !sql)) {
        if (stryMutAct_9fa48("151855")) {
          {}
        } else {
          stryCov_9fa48("151855");
          throw new Error(SQLITE_STORE_ERROR_MSG.MISSING_SQL);
        }
      }
      this.logger.debug(SQLITE_STORE_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("151856") ? {} : (stryCov_9fa48("151856"), {
        sql: stryMutAct_9fa48("151857") ? sql : (stryCov_9fa48("151857"), sql.substring(NUM.ZERO, SQL_LOG_TRUNCATE_LENGTH))
      }));
      const trimmedUpper = stryMutAct_9fa48("151859") ? sql.toUpperCase() : stryMutAct_9fa48("151858") ? sql.trim().toLowerCase() : (stryCov_9fa48("151858", "151859"), sql.trim().toUpperCase());
      if (stryMutAct_9fa48("151861") ? false : stryMutAct_9fa48("151860") ? true : (stryCov_9fa48("151860", "151861"), SQLITE_STORE_OPERATION_PATTERN.SELECT.test(trimmedUpper))) {
        if (stryMutAct_9fa48("151862")) {
          {}
        } else {
          stryCov_9fa48("151862");
          return this.executeRead(sql, params);
        }
      }
      return this.executeWrite(sql, params);
    }
  }

  /**
   * Close the database connection.
   * Errors during close are logged but not thrown.
   */
  close() {
    if (stryMutAct_9fa48("151863")) {
      {}
    } else {
      stryCov_9fa48("151863");
      if (stryMutAct_9fa48("151866") ? this.closed && !this.db : stryMutAct_9fa48("151865") ? false : stryMutAct_9fa48("151864") ? true : (stryCov_9fa48("151864", "151865", "151866"), this.closed || (stryMutAct_9fa48("151867") ? this.db : (stryCov_9fa48("151867"), !this.db)))) {
        if (stryMutAct_9fa48("151868")) {
          {}
        } else {
          stryCov_9fa48("151868");
          return;
        }
      }
      this.logger.info(SQLITE_STORE_LOG_MSG.CLOSING, stryMutAct_9fa48("151869") ? {} : (stryCov_9fa48("151869"), {
        dbPath: this.dbPath
      }));
      try {
        if (stryMutAct_9fa48("151870")) {
          {}
        } else {
          stryCov_9fa48("151870");
          this.db.close();
        }
      } catch (error) {
        if (stryMutAct_9fa48("151871")) {
          {}
        } else {
          stryCov_9fa48("151871");
          this.logger.error(SQLITE_STORE_ERROR_MSG.QUERY_EXECUTION_FAILED, stryMutAct_9fa48("151872") ? {} : (stryCov_9fa48("151872"), {
            dbPath: this.dbPath,
            error: error.message
          }));
        }
      }
      this.db = null;
      this.closed = stryMutAct_9fa48("151873") ? false : (stryCov_9fa48("151873"), true);
      this.initialized = stryMutAct_9fa48("151874") ? true : (stryCov_9fa48("151874"), false);
      this.logger.info(SQLITE_STORE_LOG_MSG.CLOSED, stryMutAct_9fa48("151875") ? {} : (stryCov_9fa48("151875"), {
        dbPath: this.dbPath
      }));
    }
  }

  /**
   * Get the raw better-sqlite3 database instance.
   * Used for log adapter creation.
   *
   * @return {Database} The raw database instance.
   */
  getDatabase() {
    if (stryMutAct_9fa48("151876")) {
      {}
    } else {
      stryCov_9fa48("151876");
      if (stryMutAct_9fa48("151879") ? false : stryMutAct_9fa48("151878") ? true : stryMutAct_9fa48("151877") ? this.initialized : (stryCov_9fa48("151877", "151878", "151879"), !this.initialized)) {
        if (stryMutAct_9fa48("151880")) {
          {}
        } else {
          stryCov_9fa48("151880");
          throw new Error(SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("151882") ? false : stryMutAct_9fa48("151881") ? true : (stryCov_9fa48("151881", "151882"), this.closed)) {
        if (stryMutAct_9fa48("151883")) {
          {}
        } else {
          stryCov_9fa48("151883");
          throw new Error(SQLITE_STORE_ERROR_MSG.ALREADY_CLOSED);
        }
      }
      return this.db;
    }
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
    if (stryMutAct_9fa48("151884")) {
      {}
    } else {
      stryCov_9fa48("151884");
      try {
        if (stryMutAct_9fa48("151885")) {
          {}
        } else {
          stryCov_9fa48("151885");
          const stmt = this.db.prepare(sql);
          const rows = stmt.all(...params);
          return stryMutAct_9fa48("151886") ? {} : (stryCov_9fa48("151886"), {
            rows,
            rowCount: rows.length
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("151887")) {
          {}
        } else {
          stryCov_9fa48("151887");
          this.logger.error(SQLITE_STORE_ERROR_MSG.QUERY_EXECUTION_FAILED, stryMutAct_9fa48("151888") ? {} : (stryCov_9fa48("151888"), {
            sql: stryMutAct_9fa48("151889") ? sql : (stryCov_9fa48("151889"), sql.substring(NUM.ZERO, SQL_LOG_TRUNCATE_LENGTH)),
            error: error.message
          }));
          throw error;
        }
      }
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
    if (stryMutAct_9fa48("151890")) {
      {}
    } else {
      stryCov_9fa48("151890");
      try {
        if (stryMutAct_9fa48("151891")) {
          {}
        } else {
          stryCov_9fa48("151891");
          const stmt = this.db.prepare(sql);
          const info = stmt.run(...params);
          return stryMutAct_9fa48("151892") ? {} : (stryCov_9fa48("151892"), {
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("151893")) {
          {}
        } else {
          stryCov_9fa48("151893");
          this.logger.error(SQLITE_STORE_ERROR_MSG.QUERY_EXECUTION_FAILED, stryMutAct_9fa48("151894") ? {} : (stryCov_9fa48("151894"), {
            sql: stryMutAct_9fa48("151895") ? sql : (stryCov_9fa48("151895"), sql.substring(NUM.ZERO, SQL_LOG_TRUNCATE_LENGTH)),
            error: error.message
          }));
          throw error;
        }
      }
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
    if (stryMutAct_9fa48("151896")) {
      {}
    } else {
      stryCov_9fa48("151896");
      const columns = this.schema.columns.map(col => {
        if (stryMutAct_9fa48("151897")) {
          {}
        } else {
          stryCov_9fa48("151897");
          let def = stryMutAct_9fa48("151898") ? `` : (stryCov_9fa48("151898"), `${col.name} ${col.type}`);
          if (stryMutAct_9fa48("151900") ? false : stryMutAct_9fa48("151899") ? true : (stryCov_9fa48("151899", "151900"), col.primaryKey)) {
            if (stryMutAct_9fa48("151901")) {
              {}
            } else {
              stryCov_9fa48("151901");
              stryMutAct_9fa48("151902") ? def -= SCHEMA_SQL.PRIMARY_KEY : (stryCov_9fa48("151902"), def += SCHEMA_SQL.PRIMARY_KEY);
            }
          }
          if (stryMutAct_9fa48("151904") ? false : stryMutAct_9fa48("151903") ? true : (stryCov_9fa48("151903", "151904"), col.notNull)) {
            if (stryMutAct_9fa48("151905")) {
              {}
            } else {
              stryCov_9fa48("151905");
              stryMutAct_9fa48("151906") ? def -= SCHEMA_SQL.NOT_NULL : (stryCov_9fa48("151906"), def += SCHEMA_SQL.NOT_NULL);
            }
          }
          if (stryMutAct_9fa48("151909") ? col.defaultValue === undefined : stryMutAct_9fa48("151908") ? false : stryMutAct_9fa48("151907") ? true : (stryCov_9fa48("151907", "151908", "151909"), col.defaultValue !== undefined)) {
            if (stryMutAct_9fa48("151910")) {
              {}
            } else {
              stryCov_9fa48("151910");
              stryMutAct_9fa48("151911") ? def -= SCHEMA_SQL.DEFAULT + String(col.defaultValue) : (stryCov_9fa48("151911"), def += stryMutAct_9fa48("151912") ? SCHEMA_SQL.DEFAULT - String(col.defaultValue) : (stryCov_9fa48("151912"), SCHEMA_SQL.DEFAULT + String(col.defaultValue)));
            }
          }
          return def;
        }
      }).join(SCHEMA_SQL.COLUMN_SEPARATOR);
      const sql = stryMutAct_9fa48("151913") ? SCHEMA_SQL.CREATE_TABLE_PREFIX + ` ${this.tableName}` + SCHEMA_SQL.OPEN_PAREN + columns - SCHEMA_SQL.CLOSE_PAREN : (stryCov_9fa48("151913"), (stryMutAct_9fa48("151914") ? SCHEMA_SQL.CREATE_TABLE_PREFIX + ` ${this.tableName}` + SCHEMA_SQL.OPEN_PAREN - columns : (stryCov_9fa48("151914"), SCHEMA_SQL.CREATE_TABLE_PREFIX + (stryMutAct_9fa48("151915") ? `` : (stryCov_9fa48("151915"), ` ${this.tableName}`)) + SCHEMA_SQL.OPEN_PAREN + columns)) + SCHEMA_SQL.CLOSE_PAREN);
      this.db.exec(sql);
      this.logger.info(SQLITE_STORE_LOG_MSG.CREATED_TABLE, stryMutAct_9fa48("151916") ? {} : (stryCov_9fa48("151916"), {
        tableName: this.tableName
      }));
    }
  }
}
export { SQLiteStore };