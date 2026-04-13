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
import { READ_CONSISTENCY_MODE } from './wasm-service-constants.js';

/**
 * Routing decision constants for read requests.
 * Each decision is a frozen object indicating whether to serve
 * locally or forward to the Raft leader.
 */
const ROUTING_DECISION = Object.freeze(stryMutAct_9fa48("162606") ? {} : (stryCov_9fa48("162606"), {
  SERVE_LOCALLY: Object.freeze(stryMutAct_9fa48("162607") ? {} : (stryCov_9fa48("162607"), {
    serveLocally: stryMutAct_9fa48("162608") ? false : (stryCov_9fa48("162608"), true),
    forwardToLeader: stryMutAct_9fa48("162609") ? true : (stryCov_9fa48("162609"), false)
  })),
  FORWARD_TO_LEADER: Object.freeze(stryMutAct_9fa48("162610") ? {} : (stryCov_9fa48("162610"), {
    serveLocally: stryMutAct_9fa48("162611") ? true : (stryCov_9fa48("162611"), false),
    forwardToLeader: stryMutAct_9fa48("162612") ? false : (stryCov_9fa48("162612"), true)
  }))
}));

/**
 * Determines the routing decision for a read request based on
 * consistency mode, replica role, and safety interval state.
 *
 * Routing logic:
 *   1. Leader always serves locally (has latest state).
 *   2. leader_only mode on a follower → forward to leader.
 *   3. eventual mode on a follower → serve locally.
 *   4. strong mode on a follower → serve locally when the
 *      SafetyInterval confirms freshness, otherwise forward.
 *
 * @param {string} consistencyMode — one of READ_CONSISTENCY_MODE
 * @param {boolean} isLeader — true when this replica is the leader
 * @param {object} safetyInterval — SafetyInterval instance with
 *   canServeRead() method
 * @returns {{ serveLocally: boolean, forwardToLeader: boolean }}
 */
function routeRead(consistencyMode, isLeader, safetyInterval) {
  if (stryMutAct_9fa48("162613")) {
    {}
  } else {
    stryCov_9fa48("162613");
    if (stryMutAct_9fa48("162615") ? false : stryMutAct_9fa48("162614") ? true : (stryCov_9fa48("162614", "162615"), isLeader)) {
      if (stryMutAct_9fa48("162616")) {
        {}
      } else {
        stryCov_9fa48("162616");
        return ROUTING_DECISION.SERVE_LOCALLY;
      }
    }
    if (stryMutAct_9fa48("162619") ? consistencyMode !== READ_CONSISTENCY_MODE.LEADER_ONLY : stryMutAct_9fa48("162618") ? false : stryMutAct_9fa48("162617") ? true : (stryCov_9fa48("162617", "162618", "162619"), consistencyMode === READ_CONSISTENCY_MODE.LEADER_ONLY)) {
      if (stryMutAct_9fa48("162620")) {
        {}
      } else {
        stryCov_9fa48("162620");
        return ROUTING_DECISION.FORWARD_TO_LEADER;
      }
    }
    if (stryMutAct_9fa48("162623") ? consistencyMode !== READ_CONSISTENCY_MODE.EVENTUAL : stryMutAct_9fa48("162622") ? false : stryMutAct_9fa48("162621") ? true : (stryCov_9fa48("162621", "162622", "162623"), consistencyMode === READ_CONSISTENCY_MODE.EVENTUAL)) {
      if (stryMutAct_9fa48("162624")) {
        {}
      } else {
        stryCov_9fa48("162624");
        return ROUTING_DECISION.SERVE_LOCALLY;
      }
    }

    // strong mode: delegate to safety interval freshness check
    if (stryMutAct_9fa48("162626") ? false : stryMutAct_9fa48("162625") ? true : (stryCov_9fa48("162625", "162626"), safetyInterval.canServeRead())) {
      if (stryMutAct_9fa48("162627")) {
        {}
      } else {
        stryCov_9fa48("162627");
        return ROUTING_DECISION.SERVE_LOCALLY;
      }
    }
    return ROUTING_DECISION.FORWARD_TO_LEADER;
  }
}
export { routeRead, ROUTING_DECISION };