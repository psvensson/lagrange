/**
 * Deterministic ID mapping for raft-logic, which expects stringified u64 IDs.
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
import { buildDeterministicRaftIdMaps } from '../raft-id-mapper.js';
import { RAFT_LOGIC_SPIKE_DEFAULT, RAFT_LOGIC_SPIKE_ERROR } from './raft-logic-spike-constants.js';

/**
 * Build deterministic external<->internal ID maps for a replica set.
 * @param {Array<string>} replicaIds
 * @return {{
 *   externalToInternal: Map<string, string>,
 *   internalToExternal: Map<string, string>,
 * }}
 */
function buildRaftLogicIdMaps(replicaIds) {
  if (stryMutAct_9fa48("128736")) {
    {}
  } else {
    stryCov_9fa48("128736");
    if (stryMutAct_9fa48("128739") ? !Array.isArray(replicaIds) && replicaIds.length === 0 : stryMutAct_9fa48("128738") ? false : stryMutAct_9fa48("128737") ? true : (stryCov_9fa48("128737", "128738", "128739"), (stryMutAct_9fa48("128740") ? Array.isArray(replicaIds) : (stryCov_9fa48("128740"), !Array.isArray(replicaIds))) || (stryMutAct_9fa48("128742") ? replicaIds.length !== 0 : stryMutAct_9fa48("128741") ? false : (stryCov_9fa48("128741", "128742"), replicaIds.length === 0)))) {
      if (stryMutAct_9fa48("128743")) {
        {}
      } else {
        stryCov_9fa48("128743");
        throw new Error(RAFT_LOGIC_SPIKE_ERROR.INVALID_REPLICA_IDS);
      }
    }
    return buildDeterministicRaftIdMaps(replicaIds, stryMutAct_9fa48("128744") ? {} : (stryCov_9fa48("128744"), {
      minInternalNodeId: RAFT_LOGIC_SPIKE_DEFAULT.MIN_INTERNAL_NODE_ID,
      clusterNodeIdStep: RAFT_LOGIC_SPIKE_DEFAULT.CLUSTER_NODE_ID_STEP
    }));
  }
}
export { buildRaftLogicIdMaps };