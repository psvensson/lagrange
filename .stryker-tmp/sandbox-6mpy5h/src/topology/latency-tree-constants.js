/**
 * Constants for LatencyTreeService.
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
import { NUM, TABLES } from '../constants/index.js';
const LATENCY_TREE_SUBSYSTEM = stryMutAct_9fa48("154697") ? "" : (stryCov_9fa48("154697"), 'latency-tree');
const LATENCY_TREE_STATE = Object.freeze(stryMutAct_9fa48("154698") ? {} : (stryCov_9fa48("154698"), {
  CREATED: stryMutAct_9fa48("154699") ? "" : (stryCov_9fa48("154699"), 'created'),
  INITIALIZED: stryMutAct_9fa48("154700") ? "" : (stryCov_9fa48("154700"), 'initialized'),
  RUNNING: stryMutAct_9fa48("154701") ? "" : (stryCov_9fa48("154701"), 'running'),
  STOPPED: stryMutAct_9fa48("154702") ? "" : (stryCov_9fa48("154702"), 'stopped')
}));
const LATENCY_TREE_EVENT = Object.freeze(stryMutAct_9fa48("154703") ? {} : (stryCov_9fa48("154703"), {
  RECOMPUTED: stryMutAct_9fa48("154704") ? "" : (stryCov_9fa48("154704"), 'latencyTreeRecomputed')
}));
const LATENCY_TREE_REASON = Object.freeze(stryMutAct_9fa48("154705") ? {} : (stryCov_9fa48("154705"), {
  START: stryMutAct_9fa48("154706") ? "" : (stryCov_9fa48("154706"), 'start'),
  MANUAL: stryMutAct_9fa48("154707") ? "" : (stryCov_9fa48("154707"), 'manual'),
  TOPOLOGY_CHANGE: stryMutAct_9fa48("154708") ? "" : (stryCov_9fa48("154708"), 'topology_change')
}));
const LATENCY_TREE_TABLE = Object.freeze(stryMutAct_9fa48("154709") ? {} : (stryCov_9fa48("154709"), {
  WATCHED: Object.freeze(stryMutAct_9fa48("154710") ? [] : (stryCov_9fa48("154710"), [TABLES.NODES, TABLES.LATENCY_GROUPS, TABLES.INTER_GROUP_LATENCIES]))
}));
const LATENCY_TREE_DEFAULT = Object.freeze(stryMutAct_9fa48("154711") ? {} : (stryCov_9fa48("154711"), {
  EMPTY_COUNT: NUM.ZERO,
  DISTANCE_SELF: NUM.ZERO,
  EDGE_MIN_SAMPLE_COUNT: NUM.ONE,
  DIJKSTRA_UNREACHABLE: Number.POSITIVE_INFINITY
}));
const LATENCY_TREE_LOG_MSG = Object.freeze(stryMutAct_9fa48("154712") ? {} : (stryCov_9fa48("154712"), {
  INITIALIZED: stryMutAct_9fa48("154713") ? "" : (stryCov_9fa48("154713"), 'LatencyTreeService initialized'),
  STARTED: stryMutAct_9fa48("154714") ? "" : (stryCov_9fa48("154714"), 'LatencyTreeService started'),
  STOPPED: stryMutAct_9fa48("154715") ? "" : (stryCov_9fa48("154715"), 'LatencyTreeService stopped'),
  RECOMPUTED: stryMutAct_9fa48("154716") ? "" : (stryCov_9fa48("154716"), 'Latency tree recomputed')
}));
const LATENCY_TREE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("154717") ? {} : (stryCov_9fa48("154717"), {
  MISSING_NODE_ID: stryMutAct_9fa48("154718") ? "" : (stryCov_9fa48("154718"), 'LatencyTreeService requires nodeId'),
  MISSING_CACHE: stryMutAct_9fa48("154719") ? "" : (stryCov_9fa48("154719"), 'LatencyTreeService requires systemTableCache'),
  NOT_INITIALIZED: stryMutAct_9fa48("154720") ? "" : (stryCov_9fa48("154720"), 'LatencyTreeService must be initialized first')
}));
export { LATENCY_TREE_DEFAULT, LATENCY_TREE_ERROR_MSG, LATENCY_TREE_EVENT, LATENCY_TREE_LOG_MSG, LATENCY_TREE_REASON, LATENCY_TREE_STATE, LATENCY_TREE_SUBSYSTEM, LATENCY_TREE_TABLE };