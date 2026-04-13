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
import { getBlockingSystemServiceLeaders, getMissingSystemServiceLeaderCount, getMissingSystemServiceLeaders } from '../cache/leader-readiness-gate.js';
function createSystemLeaderReadinessSnapshot(options = {}) {
  if (stryMutAct_9fa48("31713")) {
    {}
  } else {
    stryCov_9fa48("31713");
    const {
      systemTableCache = null,
      requiredTables = null,
      requireLeaderNodeId = stryMutAct_9fa48("31714") ? true : (stryCov_9fa48("31714"), false),
      isTableWriteSatisfied,
      allowLeaderServiceFallback = stryMutAct_9fa48("31715") ? true : (stryCov_9fa48("31715"), false)
    } = options;
    const useBlockingTables = stryMutAct_9fa48("31718") ? Array.isArray(requiredTables) || requiredTables.length > 0 : stryMutAct_9fa48("31717") ? false : stryMutAct_9fa48("31716") ? true : (stryCov_9fa48("31716", "31717", "31718"), Array.isArray(requiredTables) && (stryMutAct_9fa48("31721") ? requiredTables.length <= 0 : stryMutAct_9fa48("31720") ? requiredTables.length >= 0 : stryMutAct_9fa48("31719") ? true : (stryCov_9fa48("31719", "31720", "31721"), requiredTables.length > 0)));
    const missingLeaders = useBlockingTables ? getBlockingSystemServiceLeaders(systemTableCache, requiredTables, stryMutAct_9fa48("31722") ? {} : (stryCov_9fa48("31722"), {
      requireLeaderNodeId,
      isTableWriteSatisfied,
      allowLeaderServiceFallback
    })) : getMissingSystemServiceLeaders(systemTableCache, stryMutAct_9fa48("31723") ? {} : (stryCov_9fa48("31723"), {
      requireLeaderNodeId,
      allowLeaderServiceFallback
    }));
    const missingCount = getMissingSystemServiceLeaderCount(missingLeaders);
    return stryMutAct_9fa48("31724") ? {} : (stryCov_9fa48("31724"), {
      ready: stryMutAct_9fa48("31727") ? missingCount !== 0 : stryMutAct_9fa48("31726") ? false : stryMutAct_9fa48("31725") ? true : (stryCov_9fa48("31725", "31726", "31727"), missingCount === 0),
      missingLeaders,
      missingCount
    });
  }
}
export { createSystemLeaderReadinessSnapshot };