/**
 * Constants for Raft adaptive timing controller.
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
const RAFT_ADAPTIVE_TIMING_PROFILE = Object.freeze(stryMutAct_9fa48("54039") ? {} : (stryCov_9fa48("54039"), {
  ACTIVE: stryMutAct_9fa48("54040") ? "" : (stryCov_9fa48("54040"), 'active'),
  IDLE: stryMutAct_9fa48("54041") ? "" : (stryCov_9fa48("54041"), 'idle')
}));
const RAFT_ADAPTIVE_TIMING_LOG_MSG = Object.freeze(stryMutAct_9fa48("54042") ? {} : (stryCov_9fa48("54042"), {
  STARTED: stryMutAct_9fa48("54043") ? "" : (stryCov_9fa48("54043"), 'Started raft adaptive timing controller'),
  STOPPED: stryMutAct_9fa48("54044") ? "" : (stryCov_9fa48("54044"), 'Stopped raft adaptive timing controller'),
  PROFILE_SWITCHED: stryMutAct_9fa48("54045") ? "" : (stryCov_9fa48("54045"), 'Switched raft adaptive timing profile'),
  PROFILE_SWITCH_FAILED: stryMutAct_9fa48("54046") ? "" : (stryCov_9fa48("54046"), 'Failed to switch raft adaptive timing profile'),
  EVALUATION_FAILED: stryMutAct_9fa48("54047") ? "" : (stryCov_9fa48("54047"), 'Failed raft adaptive timing evaluation')
}));
const RAFT_ADAPTIVE_TIMING_VALUE = Object.freeze(stryMutAct_9fa48("54048") ? {} : (stryCov_9fa48("54048"), {
  UPDATED_BY: stryMutAct_9fa48("54049") ? "" : (stryCov_9fa48("54049"), 'raft-adaptive-timing-controller'),
  DEFAULT_PROFILE: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE
}));
const RAFT_ADAPTIVE_TIMING_REASON = Object.freeze(stryMutAct_9fa48("54050") ? {} : (stryCov_9fa48("54050"), {
  HIGH_LOAD: stryMutAct_9fa48("54051") ? "" : (stryCov_9fa48("54051"), 'high-load'),
  LOW_LOAD: stryMutAct_9fa48("54052") ? "" : (stryCov_9fa48("54052"), 'low-load')
}));
export { RAFT_ADAPTIVE_TIMING_LOG_MSG, RAFT_ADAPTIVE_TIMING_PROFILE, RAFT_ADAPTIVE_TIMING_REASON, RAFT_ADAPTIVE_TIMING_VALUE };