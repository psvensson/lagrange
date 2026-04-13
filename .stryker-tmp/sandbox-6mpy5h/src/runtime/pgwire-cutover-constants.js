/**
 * Constants for PG wire hard-cutover guard.
 *
 * Defines the single-path contract assertions, forbidden patterns,
 * and error messages for the replicated-only PG wire listener path.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 *
 * @module runtime/pgwire-cutover-constants
 */
// @ts-nocheck


// --- Subsystem identifier ---
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
const PGWIRE_CUTOVER_SUBSYSTEM = stryMutAct_9fa48("147327") ? "" : (stryCov_9fa48("147327"), 'pgwire-cutover-guard');

// --- Forbidden entrypoint symbols ---
// Any function or export matching these names in bootstrap/join/
// entrypoint modules would indicate a legacy standalone listener
// path that must not exist.

const FORBIDDEN_ENTRYPOINT_SYMBOLS = Object.freeze(stryMutAct_9fa48("147328") ? [] : (stryCov_9fa48("147328"), [stryMutAct_9fa48("147329") ? "" : (stryCov_9fa48("147329"), 'startPostgresListener'), stryMutAct_9fa48("147330") ? "" : (stryCov_9fa48("147330"), 'createPostgresServer'), stryMutAct_9fa48("147331") ? "" : (stryCov_9fa48("147331"), 'startPgWireListener'), stryMutAct_9fa48("147332") ? "" : (stryCov_9fa48("147332"), 'startStandalonePostgres'), stryMutAct_9fa48("147333") ? "" : (stryCov_9fa48("147333"), 'createStandalonePgWire'), stryMutAct_9fa48("147334") ? "" : (stryCov_9fa48("147334"), 'initPostgresDirectListener')]));

// --- Forbidden config keys ---
// Configuration keys that would indicate dual-mode execution
// (standalone vs replicated) for PG wire startup.

const FORBIDDEN_CONFIG_KEYS = Object.freeze(stryMutAct_9fa48("147335") ? [] : (stryCov_9fa48("147335"), [stryMutAct_9fa48("147336") ? "" : (stryCov_9fa48("147336"), 'pgwire.standalone'), stryMutAct_9fa48("147337") ? "" : (stryCov_9fa48("147337"), 'pgwire.directListener'), stryMutAct_9fa48("147338") ? "" : (stryCov_9fa48("147338"), 'pgwire.legacyMode'), stryMutAct_9fa48("147339") ? "" : (stryCov_9fa48("147339"), 'pgwire.dualMode'), stryMutAct_9fa48("147340") ? "" : (stryCov_9fa48("147340"), 'postgres.standalone'), stryMutAct_9fa48("147341") ? "" : (stryCov_9fa48("147341"), 'postgres.directListener')]));

// --- Guard error messages ---

const PGWIRE_CUTOVER_ERROR = Object.freeze(stryMutAct_9fa48("147342") ? {} : (stryCov_9fa48("147342"), {
  LEGACY_ENTRYPOINT_DETECTED: stryMutAct_9fa48("147343") ? "" : (stryCov_9fa48("147343"), 'legacy standalone PG wire entrypoint detected'),
  DUAL_MODE_CONFIG_DETECTED: stryMutAct_9fa48("147344") ? "" : (stryCov_9fa48("147344"), 'dual-mode PG wire configuration detected'),
  DIRECT_LISTENER_DETECTED: stryMutAct_9fa48("147345") ? "" : (stryCov_9fa48("147345"), 'direct PG wire listener startup outside runtime module')
}));

// --- Guard log messages ---

const PGWIRE_CUTOVER_LOG = Object.freeze(stryMutAct_9fa48("147346") ? {} : (stryCov_9fa48("147346"), {
  CONTRACT_VERIFIED: stryMutAct_9fa48("147347") ? "" : (stryCov_9fa48("147347"), 'PG wire single-path contract verified: replicated-only'),
  VIOLATION_DETECTED: stryMutAct_9fa48("147348") ? "" : (stryCov_9fa48("147348"), 'PG wire single-path contract violation detected')
}));
export { PGWIRE_CUTOVER_SUBSYSTEM, FORBIDDEN_ENTRYPOINT_SYMBOLS, FORBIDDEN_CONFIG_KEYS, PGWIRE_CUTOVER_ERROR, PGWIRE_CUTOVER_LOG };