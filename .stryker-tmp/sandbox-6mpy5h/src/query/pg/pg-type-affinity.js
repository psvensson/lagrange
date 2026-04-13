/**
 * PostgreSQL type to SQLite affinity mapping.
 * Maps PG type names to SQLite type affinities (TEXT, INTEGER, REAL, BLOB).
 * Unknown types pass through uppercased.
 * Requirements: 6.2, 6.3
 */
// @ts-nocheck


/**
 * SQLite type affinity constants.
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
const AFFINITY_TEXT = stryMutAct_9fa48("114195") ? "" : (stryCov_9fa48("114195"), 'TEXT');
const AFFINITY_INTEGER = stryMutAct_9fa48("114196") ? "" : (stryCov_9fa48("114196"), 'INTEGER');
const AFFINITY_REAL = stryMutAct_9fa48("114197") ? "" : (stryCov_9fa48("114197"), 'REAL');
const AFFINITY_BLOB = stryMutAct_9fa48("114198") ? "" : (stryCov_9fa48("114198"), 'BLOB');
const PG_TYPE_ERROR_MSG = stryMutAct_9fa48("114199") ? "" : (stryCov_9fa48("114199"), 'pgType must be a string');

/**
 * Frozen map of PostgreSQL type names (lowercased) to SQLite affinities.
 * Covers all types listed in Requirement 6.3.
 */
const PG_TYPE_AFFINITY_MAP = Object.freeze(stryMutAct_9fa48("114200") ? {} : (stryCov_9fa48("114200"), {
  'varchar': AFFINITY_TEXT,
  'text': AFFINITY_TEXT,
  'char': AFFINITY_TEXT,
  'character varying': AFFINITY_TEXT,
  'integer': AFFINITY_INTEGER,
  'int': AFFINITY_INTEGER,
  'smallint': AFFINITY_INTEGER,
  'bigint': AFFINITY_INTEGER,
  'serial': AFFINITY_INTEGER,
  'bigserial': AFFINITY_INTEGER,
  'boolean': AFFINITY_INTEGER,
  'real': AFFINITY_REAL,
  'double precision': AFFINITY_REAL,
  'float': AFFINITY_REAL,
  'numeric': AFFINITY_REAL,
  'decimal': AFFINITY_REAL,
  'bytea': AFFINITY_BLOB
}));

/**
 * Resolves a PostgreSQL type name to its SQLite affinity.
 * @param {string} pgType - PostgreSQL type name (case-insensitive).
 * @returns {string} SQLite affinity or the input type uppercased if unmapped.
 */
function resolveAffinity(pgType) {
  if (stryMutAct_9fa48("114201")) {
    {}
  } else {
    stryCov_9fa48("114201");
    if (stryMutAct_9fa48("114204") ? typeof pgType === 'string' : stryMutAct_9fa48("114203") ? false : stryMutAct_9fa48("114202") ? true : (stryCov_9fa48("114202", "114203", "114204"), typeof pgType !== (stryMutAct_9fa48("114205") ? "" : (stryCov_9fa48("114205"), 'string')))) {
      if (stryMutAct_9fa48("114206")) {
        {}
      } else {
        stryCov_9fa48("114206");
        throw new TypeError(PG_TYPE_ERROR_MSG);
      }
    }
    const normalized = stryMutAct_9fa48("114207") ? pgType.toUpperCase() : (stryCov_9fa48("114207"), pgType.toLowerCase());
    return stryMutAct_9fa48("114210") ? PG_TYPE_AFFINITY_MAP[normalized] && pgType.toUpperCase() : stryMutAct_9fa48("114209") ? false : stryMutAct_9fa48("114208") ? true : (stryCov_9fa48("114208", "114209", "114210"), PG_TYPE_AFFINITY_MAP[normalized] || (stryMutAct_9fa48("114211") ? pgType.toLowerCase() : (stryCov_9fa48("114211"), pgType.toUpperCase())));
  }
}
export { PG_TYPE_AFFINITY_MAP, resolveAffinity };