/**
 * Constants for GroupSelectionService.
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
const GROUP_SELECTION_SUBSYSTEM = stryMutAct_9fa48("153706") ? "" : (stryCov_9fa48("153706"), 'group-selection');
const GROUP_SELECTION_EVENT = Object.freeze(stryMutAct_9fa48("153707") ? {} : (stryCov_9fa48("153707"), {
  LEADERSHIP_CHANGED: stryMutAct_9fa48("153708") ? "" : (stryCov_9fa48("153708"), 'groupLeadershipChanged')
}));
const GROUP_SELECTION_LOG_MSG = Object.freeze(stryMutAct_9fa48("153709") ? {} : (stryCov_9fa48("153709"), {
  LEADERSHIP_UNCHANGED: stryMutAct_9fa48("153710") ? "" : (stryCov_9fa48("153710"), 'Latency group leadership unchanged'),
  LEADERSHIP_CHANGED: stryMutAct_9fa48("153711") ? "" : (stryCov_9fa48("153711"), 'Latency group leadership updated')
}));
const GROUP_SELECTION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("153712") ? {} : (stryCov_9fa48("153712"), {
  MISSING_GROUP_ID: stryMutAct_9fa48("153713") ? "" : (stryCov_9fa48("153713"), 'Group selection requires group_id'),
  MEMBERS_MUST_BE_ARRAY: stryMutAct_9fa48("153714") ? "" : (stryCov_9fa48("153714"), 'Group selection requires memberRows array'),
  MISSING_CDC: stryMutAct_9fa48("153715") ? "" : (stryCov_9fa48("153715"), 'Group selection requires cdcIntegrationService')
}));
const GROUP_SELECTION_DEFAULT = Object.freeze(stryMutAct_9fa48("153716") ? {} : (stryCov_9fa48("153716"), {
  EMPTY_MEMBER_COUNT: 0
}));
export { GROUP_SELECTION_DEFAULT, GROUP_SELECTION_ERROR_MSG, GROUP_SELECTION_EVENT, GROUP_SELECTION_LOG_MSG, GROUP_SELECTION_SUBSYSTEM };