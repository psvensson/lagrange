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
const REJOIN_HINTS_FILENAME = stryMutAct_9fa48("27677") ? "" : (stryCov_9fa48("27677"), 'cluster-rejoin-hints.json');
const REJOIN_HINTS_TEMP_SUFFIX = stryMutAct_9fa48("27678") ? "" : (stryCov_9fa48("27678"), '.tmp');
const REJOIN_HINTS_WRITE_INTERVAL_MS = 1000;
const STARTUP_JOIN_MODE = Object.freeze(stryMutAct_9fa48("27679") ? {} : (stryCov_9fa48("27679"), {
  FRESH_JOIN: stryMutAct_9fa48("27680") ? "" : (stryCov_9fa48("27680"), 'fresh_join'),
  DURABLE_REJOIN: stryMutAct_9fa48("27681") ? "" : (stryCov_9fa48("27681"), 'durable_rejoin'),
  SEED: stryMutAct_9fa48("27682") ? "" : (stryCov_9fa48("27682"), 'seed')
}));
export { REJOIN_HINTS_FILENAME, REJOIN_HINTS_TEMP_SUFFIX, REJOIN_HINTS_WRITE_INTERVAL_MS, STARTUP_JOIN_MODE };