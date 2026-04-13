/**
 * Constants for latency-aware topology ownership and configuration.
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
import { CONFIG_KEY, DEFAULT_CONFIG, LATENCY_PROPAGATION_MODE } from '../config/config-constants.js';
const LATENCY_TOPOLOGY_SUBSYSTEM = stryMutAct_9fa48("154684") ? "" : (stryCov_9fa48("154684"), 'latency-topology');
const LATENCY_TOPOLOGY_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("154685") ? {} : (stryCov_9fa48("154685"), {
  GROUP_THRESHOLD_MS: CONFIG_KEY.LATENCY_GROUP_THRESHOLD_MS,
  RECALC_INTERVAL_MS: CONFIG_KEY.LATENCY_RECALC_INTERVAL_MS,
  RECALC_JITTER_RATIO: CONFIG_KEY.LATENCY_RECALC_JITTER_RATIO,
  PING_TIMEOUT_MS: CONFIG_KEY.LATENCY_PING_TIMEOUT_MS,
  PING_RETRY_COUNT: CONFIG_KEY.LATENCY_PING_RETRY_COUNT,
  SMOOTHING_ALPHA: CONFIG_KEY.LATENCY_SMOOTHING_ALPHA,
  PROPAGATION_MODE: CONFIG_KEY.LATENCY_PROPAGATION_MODE
}));
const LATENCY_TOPOLOGY_DEFAULT = Object.freeze(stryMutAct_9fa48("154686") ? {} : (stryCov_9fa48("154686"), {
  GROUP_THRESHOLD_MS: DEFAULT_CONFIG.latency.groupThresholdMs,
  RECALC_INTERVAL_MS: DEFAULT_CONFIG.latency.recalcIntervalMs,
  RECALC_JITTER_RATIO: DEFAULT_CONFIG.latency.recalcJitterRatio,
  PING_TIMEOUT_MS: DEFAULT_CONFIG.latency.pingTimeoutMs,
  PING_RETRY_COUNT: DEFAULT_CONFIG.latency.pingRetryCount,
  SMOOTHING_ALPHA: DEFAULT_CONFIG.latency.smoothingAlpha,
  PROPAGATION_MODE: DEFAULT_CONFIG.latency.propagationMode
}));
const LATENCY_ASSIGNMENT_STATE = Object.freeze(stryMutAct_9fa48("154687") ? {} : (stryCov_9fa48("154687"), {
  UNASSIGNED: stryMutAct_9fa48("154688") ? "" : (stryCov_9fa48("154688"), 'unassigned'),
  ASSIGNED: stryMutAct_9fa48("154689") ? "" : (stryCov_9fa48("154689"), 'assigned'),
  REASSIGNING: stryMutAct_9fa48("154690") ? "" : (stryCov_9fa48("154690"), 'reassigning')
}));
const LATENCY_GROUP_STATE = Object.freeze(stryMutAct_9fa48("154691") ? {} : (stryCov_9fa48("154691"), {
  ACTIVE: stryMutAct_9fa48("154692") ? "" : (stryCov_9fa48("154692"), 'active'),
  DRAINING: stryMutAct_9fa48("154693") ? "" : (stryCov_9fa48("154693"), 'draining')
}));
const LATENCY_TOPOLOGY_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("154694") ? {} : (stryCov_9fa48("154694"), {
  CDC_PROPAGATION: stryMutAct_9fa48("154695") ? "" : (stryCov_9fa48("154695"), 'latency.cdc.propagation'),
  CDC_PROPAGATION_BATCH: stryMutAct_9fa48("154696") ? "" : (stryCov_9fa48("154696"), 'latency.cdc.propagation.batch')
}));
export { LATENCY_ASSIGNMENT_STATE, LATENCY_GROUP_STATE, LATENCY_PROPAGATION_MODE, LATENCY_TOPOLOGY_MESSAGE_TYPE, LATENCY_TOPOLOGY_CONFIG_KEY, LATENCY_TOPOLOGY_DEFAULT, LATENCY_TOPOLOGY_SUBSYSTEM };