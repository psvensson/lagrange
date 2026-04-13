/**
 * Constants for PG wire port allocation and collision handling.
 *
 * Defines allocation modes, default dynamic port range, and
 * typed error messages for bind conflicts and validation failures.
 *
 * Reuses MIN_PORT / MAX_PORT from runtime constants for range
 * validation. Does NOT duplicate port range constants from
 * wasm-service — PG wire uses its own distinct default range.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 *
 * @module runtime/pgwire-port-constants
 */
// @ts-nocheck


// --- Port allocation mode selector ---
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
const PORT_ALLOCATION_MODE = Object.freeze(stryMutAct_9fa48("147739") ? {} : (stryCov_9fa48("147739"), {
  FIXED: stryMutAct_9fa48("147740") ? "" : (stryCov_9fa48("147740"), 'fixed'),
  DYNAMIC: stryMutAct_9fa48("147741") ? "" : (stryCov_9fa48("147741"), 'dynamic')
}));

// --- Default dynamic port range for PG wire ---

const PGWIRE_DYNAMIC_PORT_RANGE_START = 5432;
const PGWIRE_DYNAMIC_PORT_RANGE_END = 5532;

// --- Typed error messages ---

const PGWIRE_PORT_ERROR = Object.freeze(stryMutAct_9fa48("147742") ? {} : (stryCov_9fa48("147742"), {
  PORT_OUT_OF_RANGE: stryMutAct_9fa48("147743") ? "" : (stryCov_9fa48("147743"), 'port is outside the valid range'),
  PORT_NOT_INTEGER: stryMutAct_9fa48("147744") ? "" : (stryCov_9fa48("147744"), 'port must be a positive integer'),
  RANGE_START_AFTER_END: stryMutAct_9fa48("147745") ? "" : (stryCov_9fa48("147745"), 'dynamic port range start must be <= end'),
  RANGE_OUTSIDE_BOUNDS: stryMutAct_9fa48("147746") ? "" : (stryCov_9fa48("147746"), 'dynamic port range must be within valid port bounds'),
  NO_PORTS_AVAILABLE: stryMutAct_9fa48("147747") ? "" : (stryCov_9fa48("147747"), 'no ports available in dynamic range'),
  BIND_CONFLICT: stryMutAct_9fa48("147748") ? "" : (stryCov_9fa48("147748"), 'port bind conflict (EADDRINUSE)'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("147749") ? "" : (stryCov_9fa48("147749"), 'serviceId is required for port allocation')
}));

// --- Error code for bind conflicts ---

const BIND_CONFLICT_CODE = stryMutAct_9fa48("147750") ? "" : (stryCov_9fa48("147750"), 'EADDRINUSE');
export { PORT_ALLOCATION_MODE, PGWIRE_DYNAMIC_PORT_RANGE_START, PGWIRE_DYNAMIC_PORT_RANGE_END, PGWIRE_PORT_ERROR, BIND_CONFLICT_CODE };