/**
 * SQL parser AST type constants.
 * Extracted from sql-parser.js to break circular dependencies
 * with pg-translate.js and pg-function-registry.js.
 * Requirements: 7.1, 7.3
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
const AST_TYPE = Object.freeze(stryMutAct_9fa48("113410") ? {} : (stryCov_9fa48("113410"), {
  SELECT: stryMutAct_9fa48("113411") ? "" : (stryCov_9fa48("113411"), 'SELECT'),
  INSERT: stryMutAct_9fa48("113412") ? "" : (stryCov_9fa48("113412"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("113413") ? "" : (stryCov_9fa48("113413"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("113414") ? "" : (stryCov_9fa48("113414"), 'DELETE'),
  CREATE_TABLE: stryMutAct_9fa48("113415") ? "" : (stryCov_9fa48("113415"), 'CREATE_TABLE'),
  ALTER_TABLE: stryMutAct_9fa48("113416") ? "" : (stryCov_9fa48("113416"), 'ALTER_TABLE'),
  CREATE_INDEX: stryMutAct_9fa48("113417") ? "" : (stryCov_9fa48("113417"), 'CREATE_INDEX'),
  DROP_TABLE: stryMutAct_9fa48("113418") ? "" : (stryCov_9fa48("113418"), 'DROP_TABLE'),
  DROP_INDEX: stryMutAct_9fa48("113419") ? "" : (stryCov_9fa48("113419"), 'DROP_INDEX'),
  BEGIN_TRANSACTION: stryMutAct_9fa48("113420") ? "" : (stryCov_9fa48("113420"), 'BEGIN_TRANSACTION'),
  COMMIT: stryMutAct_9fa48("113421") ? "" : (stryCov_9fa48("113421"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("113422") ? "" : (stryCov_9fa48("113422"), 'ROLLBACK')
}));
const EXPR_TYPE = Object.freeze(stryMutAct_9fa48("113423") ? {} : (stryCov_9fa48("113423"), {
  BINARY: stryMutAct_9fa48("113424") ? "" : (stryCov_9fa48("113424"), 'binary'),
  UNARY: stryMutAct_9fa48("113425") ? "" : (stryCov_9fa48("113425"), 'unary'),
  LITERAL: stryMutAct_9fa48("113426") ? "" : (stryCov_9fa48("113426"), 'literal'),
  COLUMN_REF: stryMutAct_9fa48("113427") ? "" : (stryCov_9fa48("113427"), 'column_ref'),
  PARAMETER: stryMutAct_9fa48("113428") ? "" : (stryCov_9fa48("113428"), 'parameter'),
  AGGREGATE: stryMutAct_9fa48("113429") ? "" : (stryCov_9fa48("113429"), 'aggregate'),
  STAR: stryMutAct_9fa48("113430") ? "" : (stryCov_9fa48("113430"), 'star'),
  IN: stryMutAct_9fa48("113431") ? "" : (stryCov_9fa48("113431"), 'in'),
  BETWEEN: stryMutAct_9fa48("113432") ? "" : (stryCov_9fa48("113432"), 'between'),
  LIKE: stryMutAct_9fa48("113433") ? "" : (stryCov_9fa48("113433"), 'like'),
  COLUMN: stryMutAct_9fa48("113434") ? "" : (stryCov_9fa48("113434"), 'column'),
  TABLE: stryMutAct_9fa48("113435") ? "" : (stryCov_9fa48("113435"), 'table'),
  JOIN: stryMutAct_9fa48("113436") ? "" : (stryCov_9fa48("113436"), 'join')
}));
export { AST_TYPE, EXPR_TYPE };