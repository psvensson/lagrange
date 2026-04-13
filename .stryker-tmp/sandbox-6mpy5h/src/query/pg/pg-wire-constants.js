/**
 * Constants for the PostgreSQL wire adapter.
 * Session state and error messages used by PostgresWireAdapter.
 * Requirements: 1.1, 3.1, 3.2, 3.3
 */
// @ts-nocheck


/**
 * Session state constants for protocol sessions.
 * @enum {string}
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
const PG_SESSION_STATE = Object.freeze(stryMutAct_9fa48("114212") ? {} : (stryCov_9fa48("114212"), {
  CREATED: stryMutAct_9fa48("114213") ? "" : (stryCov_9fa48("114213"), 'created'),
  AUTHENTICATED: stryMutAct_9fa48("114214") ? "" : (stryCov_9fa48("114214"), 'authenticated'),
  READY: stryMutAct_9fa48("114215") ? "" : (stryCov_9fa48("114215"), 'ready'),
  CLOSED: stryMutAct_9fa48("114216") ? "" : (stryCov_9fa48("114216"), 'closed')
}));

/**
 * Error messages specific to the PostgreSQL wire adapter.
 * @enum {string}
 */
const PG_WIRE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("114217") ? {} : (stryCov_9fa48("114217"), {
  SESSION_NOT_AUTHENTICATED: stryMutAct_9fa48("114218") ? "" : (stryCov_9fa48("114218"), 'Session must be authenticated before executing queries'),
  SESSION_CLOSED: stryMutAct_9fa48("114219") ? "" : (stryCov_9fa48("114219"), 'Session is closed'),
  AUTHENTICATION_FAILED: stryMutAct_9fa48("114220") ? "" : (stryCov_9fa48("114220"), 'Authentication failed')
}));
export { PG_SESSION_STATE, PG_WIRE_ERROR_MSG };