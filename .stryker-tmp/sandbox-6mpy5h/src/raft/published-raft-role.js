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
import { RAFT_ROLE } from './constants.js';
const DEFAULT_OPTIONS = Object.freeze(stryMutAct_9fa48("127603") ? {} : (stryCov_9fa48("127603"), {
  collapseLeaderToFollower: stryMutAct_9fa48("127604") ? true : (stryCov_9fa48("127604"), false)
}));
function normalizePublishedRaftRole(role, options = {}) {
  if (stryMutAct_9fa48("127605")) {
    {}
  } else {
    stryCov_9fa48("127605");
    const config = stryMutAct_9fa48("127606") ? {} : (stryCov_9fa48("127606"), {
      ...DEFAULT_OPTIONS,
      ...(stryMutAct_9fa48("127609") ? options && {} : stryMutAct_9fa48("127608") ? false : stryMutAct_9fa48("127607") ? true : (stryCov_9fa48("127607", "127608", "127609"), options || {}))
    });
    if (stryMutAct_9fa48("127612") ? role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("127611") ? false : stryMutAct_9fa48("127610") ? true : (stryCov_9fa48("127610", "127611", "127612"), role === RAFT_ROLE.LEADER)) {
      if (stryMutAct_9fa48("127613")) {
        {}
      } else {
        stryCov_9fa48("127613");
        return config.collapseLeaderToFollower ? RAFT_ROLE.FOLLOWER : RAFT_ROLE.LEADER;
      }
    }
    if (stryMutAct_9fa48("127616") ? role !== RAFT_ROLE.LEARNER : stryMutAct_9fa48("127615") ? false : stryMutAct_9fa48("127614") ? true : (stryCov_9fa48("127614", "127615", "127616"), role === RAFT_ROLE.LEARNER)) {
      if (stryMutAct_9fa48("127617")) {
        {}
      } else {
        stryCov_9fa48("127617");
        return RAFT_ROLE.LEARNER;
      }
    }
    if (stryMutAct_9fa48("127620") ? role !== RAFT_ROLE.CANDIDATE : stryMutAct_9fa48("127619") ? false : stryMutAct_9fa48("127618") ? true : (stryCov_9fa48("127618", "127619", "127620"), role === RAFT_ROLE.CANDIDATE)) {
      if (stryMutAct_9fa48("127621")) {
        {}
      } else {
        stryCov_9fa48("127621");
        return RAFT_ROLE.FOLLOWER;
      }
    }
    return RAFT_ROLE.FOLLOWER;
  }
}
export { normalizePublishedRaftRole };