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
const ERRORS = Object.freeze(stryMutAct_9fa48("54613") ? {} : (stryCov_9fa48("54613"), {
  // Query execution / routing
  QUERY_FAILED: stryMutAct_9fa48("54614") ? "" : (stryCov_9fa48("54614"), 'Query failed'),
  SYSTEM_CACHE_NOT_AVAILABLE: stryMutAct_9fa48("54615") ? "" : (stryCov_9fa48("54615"), 'System cache not available'),
  SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE: stryMutAct_9fa48("54616") ? "" : (stryCov_9fa48("54616"), 'System cache not available for partition lookup'),
  NO_LEADER_AVAILABLE_FOR_WRITE: stryMutAct_9fa48("54617") ? "" : (stryCov_9fa48("54617"), 'No leader available for write operation'),
  PARTITION_SERVICE_NOT_FOUND: stryMutAct_9fa48("54618") ? "" : (stryCov_9fa48("54618"), 'Partition service not found'),
  NO_HANDLER_FOR_ADDRESS: stryMutAct_9fa48("54619") ? "" : (stryCov_9fa48("54619"), 'No handler registered for address')
}));
const ERRNO = Object.freeze(stryMutAct_9fa48("54620") ? {} : (stryCov_9fa48("54620"), {
  EPERM: stryMutAct_9fa48("54621") ? "" : (stryCov_9fa48("54621"), 'EPERM'),
  EACCES: stryMutAct_9fa48("54622") ? "" : (stryCov_9fa48("54622"), 'EACCES'),
  ENOENT: stryMutAct_9fa48("54623") ? "" : (stryCov_9fa48("54623"), 'ENOENT'),
  NOT_RUNNING: stryMutAct_9fa48("54624") ? "" : (stryCov_9fa48("54624"), 'ERR_SERVER_NOT_RUNNING')
}));
export { ERRORS, ERRNO };