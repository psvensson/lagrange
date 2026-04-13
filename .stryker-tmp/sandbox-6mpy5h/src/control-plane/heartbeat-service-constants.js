/**
 * Constants for HeartbeatService.
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
import { TIME_MS } from '../constants/index.js';
import { CONFIG_KEY } from '../config/config-constants.js';
const HEARTBEAT_SUBSYSTEM = stryMutAct_9fa48("64811") ? "" : (stryCov_9fa48("64811"), 'heartbeat-service');
const HEARTBEAT_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("64812") ? {} : (stryCov_9fa48("64812"), {
  INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
  READY_LEASE_MS: CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS
}));
const HEARTBEAT_DEFAULT = Object.freeze(stryMutAct_9fa48("64813") ? {} : (stryCov_9fa48("64813"), {
  INTERVAL_MS: TIME_MS.CONTROL_PLANE_HEARTBEAT_INTERVAL,
  READY_LEASE_MS: TIME_MS.CONTROL_PLANE_READY_LEASE,
  ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS: TIME_MS.SECOND,
  ENDPOINT_REFRESH_INTERVAL_MS: 300000,
  NODE_METADATA_MIN_UPDATE_INTERVAL_MS: 10000,
  NODE_METADATA_MAX_STALENESS_MS: 10000,
  NODE_METADATA_USAGE_PERCENT_BUCKET_SIZE: 5,
  REPORTER_VISIBILITY_RETRY_INTERVAL_MS: 30000
}));
const HEARTBEAT_MEMORY_TREND = Object.freeze(stryMutAct_9fa48("64814") ? {} : (stryCov_9fa48("64814"), {
  WINDOW_MS: 300000,
  MIN_SAMPLES: 5,
  SLOPE_PERCENT_PER_MIN: 0.5,
  WARNING_PERCENT: 85,
  WARNING_COOLDOWN_MS: 300000
}));
const HEARTBEAT_FAILURE_WARN_THRESHOLD = 3;
const HEARTBEAT_STATE = Object.freeze(stryMutAct_9fa48("64815") ? {} : (stryCov_9fa48("64815"), {
  CREATED: stryMutAct_9fa48("64816") ? "" : (stryCov_9fa48("64816"), 'created'),
  INITIALIZED: stryMutAct_9fa48("64817") ? "" : (stryCov_9fa48("64817"), 'initialized'),
  RUNNING: stryMutAct_9fa48("64818") ? "" : (stryCov_9fa48("64818"), 'running'),
  STOPPED: stryMutAct_9fa48("64819") ? "" : (stryCov_9fa48("64819"), 'stopped')
}));
const HEARTBEAT_LOG_MSG = Object.freeze(stryMutAct_9fa48("64820") ? {} : (stryCov_9fa48("64820"), {
  INITIALIZED: stryMutAct_9fa48("64821") ? "" : (stryCov_9fa48("64821"), 'HeartbeatService initialized'),
  STARTED: stryMutAct_9fa48("64822") ? "" : (stryCov_9fa48("64822"), 'HeartbeatService started'),
  STOPPED: stryMutAct_9fa48("64823") ? "" : (stryCov_9fa48("64823"), 'HeartbeatService stopped'),
  SHUTDOWN_STATUS_PUBLISHED: stryMutAct_9fa48("64824") ? "" : (stryCov_9fa48("64824"), 'HeartbeatService published shutdown status'),
  SHUTDOWN_STATUS_SKIPPED: stryMutAct_9fa48("64825") ? "" : (stryCov_9fa48("64825"), 'HeartbeatService skipped shutdown status publication'),
  HEARTBEAT_FAILED: stryMutAct_9fa48("64826") ? "" : (stryCov_9fa48("64826"), 'Heartbeat failed'),
  HEARTBEAT_CONSECUTIVE_FAILURES: stryMutAct_9fa48("64827") ? "" : (stryCov_9fa48("64827"), 'Heartbeat failing repeatedly'),
  HEARTBEAT_RECOVERED: stryMutAct_9fa48("64828") ? "" : (stryCov_9fa48("64828"), 'Heartbeat recovered after failures'),
  LEASE_EXPIRY_DISCONNECT_FAILED: stryMutAct_9fa48("64829") ? "" : (stryCov_9fa48("64829"), 'Failed to disconnect node after lease expiry'),
  MEMORY_TREND_WARNING: stryMutAct_9fa48("64830") ? "" : (stryCov_9fa48("64830"), 'Heartbeat memory trend warning')
}));
const HEARTBEAT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("64831") ? {} : (stryCov_9fa48("64831"), {
  MISSING_NODE_ID: stryMutAct_9fa48("64832") ? "" : (stryCov_9fa48("64832"), 'HeartbeatService requires nodeId'),
  MISSING_NODE_ADDRESS: stryMutAct_9fa48("64833") ? "" : (stryCov_9fa48("64833"), 'HeartbeatService requires nodeAddress'),
  MISSING_CDC: stryMutAct_9fa48("64834") ? "" : (stryCov_9fa48("64834"), 'HeartbeatService requires cdcIntegrationService'),
  MISSING_CACHE: stryMutAct_9fa48("64835") ? "" : (stryCov_9fa48("64835"), 'HeartbeatService requires systemTableCache'),
  NODE_ROW_MISSING: stryMutAct_9fa48("64836") ? "" : (stryCov_9fa48("64836"), 'HeartbeatService cannot publish a heartbeat because the node row is missing'),
  NOT_INITIALIZED: stryMutAct_9fa48("64837") ? "" : (stryCov_9fa48("64837"), 'HeartbeatService must be initialized before start'),
  ALREADY_RUNNING: stryMutAct_9fa48("64838") ? "" : (stryCov_9fa48("64838"), 'HeartbeatService is already running')
}));
const HEARTBEAT_EVENT = Object.freeze(stryMutAct_9fa48("64839") ? {} : (stryCov_9fa48("64839"), {
  HEARTBEAT_SENT: stryMutAct_9fa48("64840") ? "" : (stryCov_9fa48("64840"), 'heartbeatSent'),
  HEARTBEAT_FAILED: stryMutAct_9fa48("64841") ? "" : (stryCov_9fa48("64841"), 'heartbeatFailed'),
  MEMORY_TREND_WARNING: stryMutAct_9fa48("64842") ? "" : (stryCov_9fa48("64842"), 'heartbeatMemoryTrendWarning')
}));
const HEARTBEAT_QUIET_MODE_BYPASS_REASON = Object.freeze(stryMutAct_9fa48("64843") ? {} : (stryCov_9fa48("64843"), {
  NODE_HEARTBEAT_INITIAL_WRITE: stryMutAct_9fa48("64844") ? "" : (stryCov_9fa48("64844"), 'node_heartbeat_initial_write'),
  NODE_HEARTBEAT_MAX_STALENESS: stryMutAct_9fa48("64845") ? "" : (stryCov_9fa48("64845"), 'node_heartbeat_max_staleness'),
  NODE_HEARTBEAT_STRUCTURAL_CHANGE: stryMutAct_9fa48("64846") ? "" : (stryCov_9fa48("64846"), 'node_heartbeat_structural_change')
}));
export { HEARTBEAT_SUBSYSTEM, HEARTBEAT_CONFIG_KEY, HEARTBEAT_DEFAULT, HEARTBEAT_MEMORY_TREND, HEARTBEAT_FAILURE_WARN_THRESHOLD, HEARTBEAT_STATE, HEARTBEAT_LOG_MSG, HEARTBEAT_ERROR_MSG, HEARTBEAT_EVENT, HEARTBEAT_QUIET_MODE_BYPASS_REASON };