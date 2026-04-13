/**
 * Constants for SQLiteStore - composable SQLite database lifecycle management.
 * Encapsulates database opening, schema creation, query execution, and closing.
 *
 * @module storage/sqlite-store-constants
 */
// @ts-nocheck


/**
 * Database pragma settings applied during initialization.
 * WAL mode enables concurrent reads during writes.
 * NORMAL synchronous balances durability and performance.
 */function stryNS_9fa48() {
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
const SQLITE_STORE_PRAGMA = Object.freeze(stryMutAct_9fa48("151779") ? {} : (stryCov_9fa48("151779"), {
  JOURNAL_MODE_WAL: stryMutAct_9fa48("151780") ? "" : (stryCov_9fa48("151780"), 'journal_mode = WAL'),
  SYNCHRONOUS_NORMAL: stryMutAct_9fa48("151781") ? "" : (stryCov_9fa48("151781"), 'synchronous = NORMAL')
}));

/**
 * Default values for SQLiteStore configuration.
 */
const SQLITE_STORE_DEFAULT = Object.freeze(stryMutAct_9fa48("151782") ? {} : (stryCov_9fa48("151782"), {
  DB_PATH: stryMutAct_9fa48("151783") ? "" : (stryCov_9fa48("151783"), ':memory:')
}));

/**
 * SQL operation type identifiers used for classifying queries.
 */
const SQLITE_STORE_OPERATION = Object.freeze(stryMutAct_9fa48("151784") ? {} : (stryCov_9fa48("151784"), {
  SELECT: stryMutAct_9fa48("151785") ? "" : (stryCov_9fa48("151785"), 'SELECT'),
  INSERT: stryMutAct_9fa48("151786") ? "" : (stryCov_9fa48("151786"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("151787") ? "" : (stryCov_9fa48("151787"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("151788") ? "" : (stryCov_9fa48("151788"), 'DELETE'),
  CREATE: stryMutAct_9fa48("151789") ? "" : (stryCov_9fa48("151789"), 'CREATE'),
  DROP: stryMutAct_9fa48("151790") ? "" : (stryCov_9fa48("151790"), 'DROP'),
  ALTER: stryMutAct_9fa48("151791") ? "" : (stryCov_9fa48("151791"), 'ALTER')
}));

/**
 * Regex patterns for detecting SQL operation types from query strings.
 * Each pattern matches the operation keyword at the start of a
 * trimmed, uppercased SQL string.
 */
const SQLITE_STORE_OPERATION_PATTERN = Object.freeze(stryMutAct_9fa48("151792") ? {} : (stryCov_9fa48("151792"), {
  SELECT: stryMutAct_9fa48("151793") ? /SELECT\b/ : (stryCov_9fa48("151793"), /^SELECT\b/),
  INSERT: stryMutAct_9fa48("151794") ? /INSERT\b/ : (stryCov_9fa48("151794"), /^INSERT\b/),
  UPDATE: stryMutAct_9fa48("151795") ? /UPDATE\b/ : (stryCov_9fa48("151795"), /^UPDATE\b/),
  DELETE: stryMutAct_9fa48("151796") ? /DELETE\b/ : (stryCov_9fa48("151796"), /^DELETE\b/),
  CREATE: stryMutAct_9fa48("151797") ? /CREATE\b/ : (stryCov_9fa48("151797"), /^CREATE\b/),
  DROP: stryMutAct_9fa48("151798") ? /DROP\b/ : (stryCov_9fa48("151798"), /^DROP\b/),
  ALTER: stryMutAct_9fa48("151799") ? /ALTER\b/ : (stryCov_9fa48("151799"), /^ALTER\b/)
}));

/**
 * Error messages for SQLiteStore validation and runtime errors.
 * Static messages are strings; dynamic messages are functions.
 */
const SQLITE_STORE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("151800") ? {} : (stryCov_9fa48("151800"), {
  NOT_INITIALIZED: stryMutAct_9fa48("151801") ? "" : (stryCov_9fa48("151801"), 'SQLiteStore not initialized'),
  ALREADY_CLOSED: stryMutAct_9fa48("151802") ? "" : (stryCov_9fa48("151802"), 'SQLiteStore database already closed'),
  QUERY_EXECUTION_FAILED: stryMutAct_9fa48("151803") ? "" : (stryCov_9fa48("151803"), 'Query execution failed'),
  MISSING_SQL: stryMutAct_9fa48("151804") ? "" : (stryCov_9fa48("151804"), 'SQL statement is required')
}));

/**
 * Log messages emitted by SQLiteStore during lifecycle operations.
 */
const SQLITE_STORE_LOG_MSG = Object.freeze(stryMutAct_9fa48("151805") ? {} : (stryCov_9fa48("151805"), {
  INITIALIZING: stryMutAct_9fa48("151806") ? "" : (stryCov_9fa48("151806"), 'Initializing SQLiteStore'),
  INITIALIZED: stryMutAct_9fa48("151807") ? "" : (stryCov_9fa48("151807"), 'SQLiteStore initialized'),
  CLOSING: stryMutAct_9fa48("151808") ? "" : (stryCov_9fa48("151808"), 'Closing SQLiteStore'),
  CLOSED: stryMutAct_9fa48("151809") ? "" : (stryCov_9fa48("151809"), 'SQLiteStore closed'),
  EXECUTING_QUERY: stryMutAct_9fa48("151810") ? "" : (stryCov_9fa48("151810"), 'Executing query'),
  CREATED_TABLE: stryMutAct_9fa48("151811") ? "" : (stryCov_9fa48("151811"), 'Created table from schema')
}));
export { SQLITE_STORE_DEFAULT, SQLITE_STORE_ERROR_MSG, SQLITE_STORE_LOG_MSG, SQLITE_STORE_OPERATION, SQLITE_STORE_OPERATION_PATTERN, SQLITE_STORE_PRAGMA };