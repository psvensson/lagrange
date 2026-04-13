/**
 * Constants for LatencyGroupManager.
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
const LATENCY_GROUP_MANAGER_SUBSYSTEM = stryMutAct_9fa48("153882") ? "" : (stryCov_9fa48("153882"), 'latency-group-manager');
const LATENCY_GROUP_MANAGER_STATE = Object.freeze(stryMutAct_9fa48("153883") ? {} : (stryCov_9fa48("153883"), {
  CREATED: stryMutAct_9fa48("153884") ? "" : (stryCov_9fa48("153884"), 'created'),
  INITIALIZED: stryMutAct_9fa48("153885") ? "" : (stryCov_9fa48("153885"), 'initialized'),
  RUNNING: stryMutAct_9fa48("153886") ? "" : (stryCov_9fa48("153886"), 'running'),
  STOPPED: stryMutAct_9fa48("153887") ? "" : (stryCov_9fa48("153887"), 'stopped')
}));
const LATENCY_GROUP_MANAGER_TRIGGER = Object.freeze(stryMutAct_9fa48("153888") ? {} : (stryCov_9fa48("153888"), {
  INITIAL: stryMutAct_9fa48("153889") ? "" : (stryCov_9fa48("153889"), 'initial'),
  PERIODIC: stryMutAct_9fa48("153890") ? "" : (stryCov_9fa48("153890"), 'periodic'),
  MANUAL: stryMutAct_9fa48("153891") ? "" : (stryCov_9fa48("153891"), 'manual')
}));
const LATENCY_GROUP_MANAGER_EVENT = Object.freeze(stryMutAct_9fa48("153892") ? {} : (stryCov_9fa48("153892"), {
  ASSIGNMENT_CHANGED: stryMutAct_9fa48("153893") ? "" : (stryCov_9fa48("153893"), 'latencyAssignmentChanged'),
  ASSIGNMENT_UNCHANGED: stryMutAct_9fa48("153894") ? "" : (stryCov_9fa48("153894"), 'latencyAssignmentUnchanged'),
  GROUP_CREATED: stryMutAct_9fa48("153895") ? "" : (stryCov_9fa48("153895"), 'latencyGroupCreated'),
  CYCLE_FAILED: stryMutAct_9fa48("153896") ? "" : (stryCov_9fa48("153896"), 'latencyAssignmentCycleFailed')
}));
const LATENCY_GROUP_MANAGER_REASON = Object.freeze(stryMutAct_9fa48("153897") ? {} : (stryCov_9fa48("153897"), {
  MISSING_LOCAL_NODE: stryMutAct_9fa48("153898") ? "" : (stryCov_9fa48("153898"), 'missing_local_node'),
  KEEP_CURRENT_GROUP: stryMutAct_9fa48("153899") ? "" : (stryCov_9fa48("153899"), 'keep_current_group'),
  JOIN_NEAREST_GROUP: stryMutAct_9fa48("153900") ? "" : (stryCov_9fa48("153900"), 'join_nearest_group'),
  REASSIGN_TO_BETTER_GROUP: stryMutAct_9fa48("153901") ? "" : (stryCov_9fa48("153901"), 'reassign_to_better_group'),
  CREATE_NEW_GROUP: stryMutAct_9fa48("153902") ? "" : (stryCov_9fa48("153902"), 'create_new_group'),
  CYCLE_IN_FLIGHT: stryMutAct_9fa48("153903") ? "" : (stryCov_9fa48("153903"), 'cycle_in_flight')
}));
const LATENCY_GROUP_MANAGER_LOG_MSG = Object.freeze(stryMutAct_9fa48("153904") ? {} : (stryCov_9fa48("153904"), {
  INITIALIZED: stryMutAct_9fa48("153905") ? "" : (stryCov_9fa48("153905"), 'LatencyGroupManager initialized'),
  STARTED: stryMutAct_9fa48("153906") ? "" : (stryCov_9fa48("153906"), 'LatencyGroupManager started'),
  STOPPED: stryMutAct_9fa48("153907") ? "" : (stryCov_9fa48("153907"), 'LatencyGroupManager stopped'),
  GROUP_CREATED: stryMutAct_9fa48("153908") ? "" : (stryCov_9fa48("153908"), 'Latency group created'),
  ASSIGNMENT_CHANGED: stryMutAct_9fa48("153909") ? "" : (stryCov_9fa48("153909"), 'Latency assignment changed'),
  ASSIGNMENT_UNCHANGED: stryMutAct_9fa48("153910") ? "" : (stryCov_9fa48("153910"), 'Latency assignment unchanged'),
  CYCLE_FAILED: stryMutAct_9fa48("153911") ? "" : (stryCov_9fa48("153911"), 'Latency assignment cycle failed')
}));
const LATENCY_GROUP_MANAGER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("153912") ? {} : (stryCov_9fa48("153912"), {
  MISSING_NODE_ID: stryMutAct_9fa48("153913") ? "" : (stryCov_9fa48("153913"), 'LatencyGroupManager requires nodeId'),
  MISSING_CACHE: stryMutAct_9fa48("153914") ? "" : (stryCov_9fa48("153914"), 'LatencyGroupManager requires systemTableCache'),
  MISSING_CDC: stryMutAct_9fa48("153915") ? "" : (stryCov_9fa48("153915"), 'LatencyGroupManager requires cdcIntegrationService'),
  MISSING_MEASUREMENT_SERVICE: stryMutAct_9fa48("153916") ? "" : (stryCov_9fa48("153916"), 'LatencyGroupManager requires latencyMeasurementService'),
  MISSING_SELECTION_SERVICE: stryMutAct_9fa48("153917") ? "" : (stryCov_9fa48("153917"), 'LatencyGroupManager requires groupSelectionService'),
  NOT_INITIALIZED: stryMutAct_9fa48("153918") ? "" : (stryCov_9fa48("153918"), 'LatencyGroupManager must be initialized first')
}));
const LATENCY_GROUP_MANAGER_DEFAULT = Object.freeze(stryMutAct_9fa48("153919") ? {} : (stryCov_9fa48("153919"), {
  MIN_GROUP_THRESHOLD_MS: 1,
  MIN_RECALC_INTERVAL_MS: 1000,
  MIN_RECALC_JITTER_RATIO: 0,
  MAX_RECALC_JITTER_RATIO: 1,
  RANDOM_CENTER: 0.5,
  MIN_DELAY_MS: 1,
  GROUP_ID_PREFIX: stryMutAct_9fa48("153920") ? "" : (stryCov_9fa48("153920"), 'lg-'),
  GROUP_ID_SEPARATOR: stryMutAct_9fa48("153921") ? "" : (stryCov_9fa48("153921"), '-'),
  GROUP_ID_RETRY_MARKER: stryMutAct_9fa48("153922") ? "" : (stryCov_9fa48("153922"), 'retry')
}));
export { LATENCY_GROUP_MANAGER_DEFAULT, LATENCY_GROUP_MANAGER_ERROR_MSG, LATENCY_GROUP_MANAGER_EVENT, LATENCY_GROUP_MANAGER_LOG_MSG, LATENCY_GROUP_MANAGER_REASON, LATENCY_GROUP_MANAGER_STATE, LATENCY_GROUP_MANAGER_SUBSYSTEM, LATENCY_GROUP_MANAGER_TRIGGER };