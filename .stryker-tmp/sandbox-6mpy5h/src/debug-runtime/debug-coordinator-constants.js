/**
 * Constants for distributed debug endpoint coordination.
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
const DEBUG_COORDINATOR_DEFAULT = Object.freeze(stryMutAct_9fa48("76288") ? {} : (stryCov_9fa48("76288"), {
  MIN_STAGE_ID: 0
}));
const DEBUG_COORDINATOR_EVENT = Object.freeze(stryMutAct_9fa48("76289") ? {} : (stryCov_9fa48("76289"), {
  HANDOFF: stryMutAct_9fa48("76290") ? "" : (stryCov_9fa48("76290"), 'handoff')
}));
const DEBUG_COORDINATOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("76291") ? {} : (stryCov_9fa48("76291"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("76292") ? "" : (stryCov_9fa48("76292"), 'Debug coordinator request is required'),
  LINEAGE_ID_REQUIRED: stryMutAct_9fa48("76293") ? "" : (stryCov_9fa48("76293"), 'Debug coordinator requires non-empty lineageId'),
  STAGE_ID_REQUIRED: stryMutAct_9fa48("76294") ? "" : (stryCov_9fa48("76294"), 'Debug coordinator requires non-negative integer stageId'),
  ENDPOINT_REQUIRED: stryMutAct_9fa48("76295") ? "" : (stryCov_9fa48("76295"), 'Debug coordinator requires non-empty endpoint'),
  LISTENER_REQUIRED: stryMutAct_9fa48("76296") ? "" : (stryCov_9fa48("76296"), 'Debug coordinator listener must be a function')
}));
export { DEBUG_COORDINATOR_DEFAULT, DEBUG_COORDINATOR_EVENT, DEBUG_COORDINATOR_ERROR_MSG };