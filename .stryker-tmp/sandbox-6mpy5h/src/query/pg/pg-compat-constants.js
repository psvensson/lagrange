/**
 * PostgreSQL compatibility layer constants.
 * All string literals, error messages, and configuration values
 * for the PG-to-SQLite translation layer.
 * Requirements: 1.1, 6.3, 8.2, 8.3
 */
// @ts-nocheck


/**
 * Parser dialect modes for SQLParser.
 * Controls which node-sql-parser database mode is used.
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
const PARSER_DIALECT = Object.freeze(stryMutAct_9fa48("113992") ? {} : (stryCov_9fa48("113992"), {
  SQLITE: stryMutAct_9fa48("113993") ? "" : (stryCov_9fa48("113993"), 'sqlite'),
  POSTGRESQL: stryMutAct_9fa48("113994") ? "" : (stryCov_9fa48("113994"), 'postgresql')
}));

/**
 * Error message prefixes for PG translation failures.
 * Each prefix is concatenated with the specific value at throw site.
 */
const PG_TRANSLATE_ERROR = Object.freeze(stryMutAct_9fa48("113995") ? {} : (stryCov_9fa48("113995"), {
  MISSING_PARAM_INDEX: stryMutAct_9fa48("113996") ? "" : (stryCov_9fa48("113996"), 'Positional parameter $N references index '),
  PARAM_GAP: stryMutAct_9fa48("113997") ? "" : (stryCov_9fa48("113997"), 'Non-sequential positional parameters: gap at '),
  UNSUPPORTED_EXTRACT_FIELD: stryMutAct_9fa48("113998") ? "" : (stryCov_9fa48("113998"), 'Unsupported EXTRACT field: '),
  UNSUPPORTED_DATE_TRUNC_FIELD: stryMutAct_9fa48("113999") ? "" : (stryCov_9fa48("113999"), 'Unsupported DATE_TRUNC precision: ')
}));

/**
 * strftime format strings for EXTRACT(field FROM expr) translation.
 * Maps PG EXTRACT field names to SQLite strftime format codes.
 */
const PG_EXTRACT_FORMAT = Object.freeze(stryMutAct_9fa48("114000") ? {} : (stryCov_9fa48("114000"), {
  year: stryMutAct_9fa48("114001") ? "" : (stryCov_9fa48("114001"), '%Y'),
  month: stryMutAct_9fa48("114002") ? "" : (stryCov_9fa48("114002"), '%m'),
  day: stryMutAct_9fa48("114003") ? "" : (stryCov_9fa48("114003"), '%d'),
  hour: stryMutAct_9fa48("114004") ? "" : (stryCov_9fa48("114004"), '%H'),
  minute: stryMutAct_9fa48("114005") ? "" : (stryCov_9fa48("114005"), '%M'),
  second: stryMutAct_9fa48("114006") ? "" : (stryCov_9fa48("114006"), '%S'),
  dow: stryMutAct_9fa48("114007") ? "" : (stryCov_9fa48("114007"), '%w'),
  doy: stryMutAct_9fa48("114008") ? "" : (stryCov_9fa48("114008"), '%j'),
  epoch: stryMutAct_9fa48("114009") ? "" : (stryCov_9fa48("114009"), '%s')
}));

/**
 * strftime format strings for DATE_TRUNC(precision, expr) translation.
 * Maps PG DATE_TRUNC precision names to SQLite strftime format strings
 * that truncate to the specified precision.
 */
const PG_DATE_TRUNC_FORMAT = Object.freeze(stryMutAct_9fa48("114010") ? {} : (stryCov_9fa48("114010"), {
  year: stryMutAct_9fa48("114011") ? "" : (stryCov_9fa48("114011"), '%Y-01-01 00:00:00'),
  month: stryMutAct_9fa48("114012") ? "" : (stryCov_9fa48("114012"), '%Y-%m-01 00:00:00'),
  day: stryMutAct_9fa48("114013") ? "" : (stryCov_9fa48("114013"), '%Y-%m-%d 00:00:00'),
  hour: stryMutAct_9fa48("114014") ? "" : (stryCov_9fa48("114014"), '%Y-%m-%d %H:00:00'),
  minute: stryMutAct_9fa48("114015") ? "" : (stryCov_9fa48("114015"), '%Y-%m-%d %H:%M:00'),
  second: stryMutAct_9fa48("114016") ? "" : (stryCov_9fa48("114016"), '%Y-%m-%d %H:%M:%S')
}));

/**
 * New EXPR_TYPE values for PG compatibility AST nodes.
 * These extend the base EXPR_TYPE in sql-parser.js with node types
 * needed by the PG translation layer.
 */
const PG_EXPR_TYPE = Object.freeze(stryMutAct_9fa48("114017") ? {} : (stryCov_9fa48("114017"), {
  CAST: stryMutAct_9fa48("114018") ? "" : (stryCov_9fa48("114018"), 'cast'),
  CASE: stryMutAct_9fa48("114019") ? "" : (stryCov_9fa48("114019"), 'case'),
  SUBQUERY: stryMutAct_9fa48("114020") ? "" : (stryCov_9fa48("114020"), 'subquery'),
  EXISTS: stryMutAct_9fa48("114021") ? "" : (stryCov_9fa48("114021"), 'exists'),
  FUNCTION_CALL: stryMutAct_9fa48("114022") ? "" : (stryCov_9fa48("114022"), 'function_call')
}));
export { PARSER_DIALECT, PG_TRANSLATE_ERROR, PG_EXTRACT_FORMAT, PG_DATE_TRUNC_FORMAT, PG_EXPR_TYPE };