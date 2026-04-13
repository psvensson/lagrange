/**
 * Constants for PG wire authentication and policy context mapping.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 *
 * @module runtime/pgwire-auth-constants
 */
// @ts-nocheck


// --- Auth decision outcomes ---
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
const PGWIRE_AUTH_DECISION = Object.freeze(stryMutAct_9fa48("147227") ? {} : (stryCov_9fa48("147227"), {
  AUTHENTICATED: stryMutAct_9fa48("147228") ? "" : (stryCov_9fa48("147228"), 'authenticated'),
  DENIED: stryMutAct_9fa48("147229") ? "" : (stryCov_9fa48("147229"), 'denied'),
  AUTHORIZED: stryMutAct_9fa48("147230") ? "" : (stryCov_9fa48("147230"), 'authorized'),
  REJECTED: stryMutAct_9fa48("147231") ? "" : (stryCov_9fa48("147231"), 'rejected')
}));

// --- Auth actions for policy checks ---

const PGWIRE_AUTH_ACTION = Object.freeze(stryMutAct_9fa48("147232") ? {} : (stryCov_9fa48("147232"), {
  CONNECT: stryMutAct_9fa48("147233") ? "" : (stryCov_9fa48("147233"), 'pgwire.connect'),
  EXECUTE_QUERY: stryMutAct_9fa48("147234") ? "" : (stryCov_9fa48("147234"), 'pgwire.execute_query')
}));

// --- Structured audit log messages ---

const PGWIRE_AUTH_AUDIT_MSG = Object.freeze(stryMutAct_9fa48("147235") ? {} : (stryCov_9fa48("147235"), {
  AUTH_SUCCESS: stryMutAct_9fa48("147236") ? "" : (stryCov_9fa48("147236"), 'PG wire authentication succeeded'),
  AUTH_FAILED: stryMutAct_9fa48("147237") ? "" : (stryCov_9fa48("147237"), 'PG wire authentication failed'),
  AUTHZ_GRANTED: stryMutAct_9fa48("147238") ? "" : (stryCov_9fa48("147238"), 'PG wire authorization granted'),
  AUTHZ_DENIED: stryMutAct_9fa48("147239") ? "" : (stryCov_9fa48("147239"), 'PG wire authorization denied')
}));

// --- Error messages ---

const PGWIRE_AUTH_ERROR_MSG = Object.freeze(stryMutAct_9fa48("147240") ? {} : (stryCov_9fa48("147240"), {
  CREDENTIALS_REQUIRED: stryMutAct_9fa48("147241") ? "" : (stryCov_9fa48("147241"), 'Credentials are required'),
  USER_REQUIRED: stryMutAct_9fa48("147242") ? "" : (stryCov_9fa48("147242"), 'User is required for authentication'),
  DATABASE_REQUIRED: stryMutAct_9fa48("147243") ? "" : (stryCov_9fa48("147243"), 'Database is required for authentication'),
  AUTHENTICATOR_FAILED: stryMutAct_9fa48("147244") ? "" : (stryCov_9fa48("147244"), 'Authentication failed'),
  AUTHORIZATION_DENIED: stryMutAct_9fa48("147245") ? "" : (stryCov_9fa48("147245"), 'Authorization denied for action'),
  SESSION_NOT_AUTHENTICATED: stryMutAct_9fa48("147246") ? "" : (stryCov_9fa48("147246"), 'Session must be authenticated before authorization')
}));

// --- Log tag for auth audit entries ---

const PGWIRE_AUTH_LOG_TAG = stryMutAct_9fa48("147247") ? "" : (stryCov_9fa48("147247"), 'pgwire.auth');
export { PGWIRE_AUTH_DECISION, PGWIRE_AUTH_ACTION, PGWIRE_AUTH_AUDIT_MSG, PGWIRE_AUTH_ERROR_MSG, PGWIRE_AUTH_LOG_TAG };