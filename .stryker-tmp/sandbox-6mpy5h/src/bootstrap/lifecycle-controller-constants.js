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
import { NUM } from '../constants/index.js';
const LIFECYCLE_PHASE = Object.freeze(stryMutAct_9fa48("15331") ? {} : (stryCov_9fa48("15331"), {
  INIT: stryMutAct_9fa48("15332") ? "" : (stryCov_9fa48("15332"), 'INIT'),
  CONTROL_READY: stryMutAct_9fa48("15333") ? "" : (stryCov_9fa48("15333"), 'CONTROL_READY'),
  JOIN_READY: stryMutAct_9fa48("15334") ? "" : (stryCov_9fa48("15334"), 'JOIN_READY'),
  TRAFFIC_READY: stryMutAct_9fa48("15335") ? "" : (stryCov_9fa48("15335"), 'TRAFFIC_READY'),
  DEGRADED: stryMutAct_9fa48("15336") ? "" : (stryCov_9fa48("15336"), 'DEGRADED')
}));
const LIFECYCLE_LEGACY_STATE = Object.freeze(stryMutAct_9fa48("15337") ? {} : (stryCov_9fa48("15337"), {
  STARTING: stryMutAct_9fa48("15338") ? "" : (stryCov_9fa48("15338"), 'starting'),
  BOOTSTRAPPING: stryMutAct_9fa48("15339") ? "" : (stryCov_9fa48("15339"), 'bootstrapping'),
  WARMING: stryMutAct_9fa48("15340") ? "" : (stryCov_9fa48("15340"), 'warming'),
  JOIN_READY: stryMutAct_9fa48("15341") ? "" : (stryCov_9fa48("15341"), 'join_ready'),
  DEGRADED: stryMutAct_9fa48("15342") ? "" : (stryCov_9fa48("15342"), 'degraded')
}));
const LIFECYCLE_EVENT = Object.freeze(stryMutAct_9fa48("15343") ? {} : (stryCov_9fa48("15343"), {
  TRANSITION: stryMutAct_9fa48("15344") ? "" : (stryCov_9fa48("15344"), 'transition'),
  BLOCKED_DURATION: stryMutAct_9fa48("15345") ? "" : (stryCov_9fa48("15345"), 'blocked_duration')
}));
const LIFECYCLE_PROBE_STATUS_CLASS = Object.freeze(stryMutAct_9fa48("15346") ? {} : (stryCov_9fa48("15346"), {
  SUCCESS_2XX: stryMutAct_9fa48("15347") ? "" : (stryCov_9fa48("15347"), '2xx'),
  CLIENT_4XX: stryMutAct_9fa48("15348") ? "" : (stryCov_9fa48("15348"), '4xx'),
  SERVER_5XX: stryMutAct_9fa48("15349") ? "" : (stryCov_9fa48("15349"), '5xx'),
  UNKNOWN: stryMutAct_9fa48("15350") ? "" : (stryCov_9fa48("15350"), 'unknown')
}));
const LIFECYCLE_REASON = Object.freeze(stryMutAct_9fa48("15351") ? {} : (stryCov_9fa48("15351"), {
  BOOTSTRAP_PHASE_INCOMPLETE: stryMutAct_9fa48("15352") ? "" : (stryCov_9fa48("15352"), 'BOOTSTRAP_PHASE_INCOMPLETE'),
  SQL_ENGINE_UNAVAILABLE: stryMutAct_9fa48("15353") ? "" : (stryCov_9fa48("15353"), 'SQL_ENGINE_UNAVAILABLE'),
  LEADER_METADATA_INCOMPLETE: stryMutAct_9fa48("15354") ? "" : (stryCov_9fa48("15354"), 'LEADER_METADATA_INCOMPLETE'),
  RUNTIME_WIRING_INCOMPLETE: stryMutAct_9fa48("15355") ? "" : (stryCov_9fa48("15355"), 'BOOTSTRAP_NOT_READY'),
  READINESS_STABLE_WINDOW_PENDING: stryMutAct_9fa48("15356") ? "" : (stryCov_9fa48("15356"), 'READINESS_STABLE_WINDOW_PENDING'),
  OBSERVABILITY_BACKLOG: stryMutAct_9fa48("15357") ? "" : (stryCov_9fa48("15357"), 'OBSERVABILITY_BACKLOG'),
  LOCAL_QUERY_TRANSPORT_NOT_READY: stryMutAct_9fa48("15358") ? "" : (stryCov_9fa48("15358"), 'local_query_transport_not_ready'),
  PRIORITY_CONTROL_PLANE_RECOVERY_PENDING: stryMutAct_9fa48("15359") ? "" : (stryCov_9fa48("15359"), 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'),
  NODE_DRAINING: stryMutAct_9fa48("15360") ? "" : (stryCov_9fa48("15360"), 'NODE_DRAINING')
}));
const LIFECYCLE_DEPENDENCY = Object.freeze(stryMutAct_9fa48("15361") ? {} : (stryCov_9fa48("15361"), {
  STARTUP_COMPLETE: stryMutAct_9fa48("15362") ? "" : (stryCov_9fa48("15362"), 'startup_complete')
}));
const LIFECYCLE_DEPENDENCY_CLASS = Object.freeze(stryMutAct_9fa48("15363") ? {} : (stryCov_9fa48("15363"), {
  HARD: stryMutAct_9fa48("15364") ? "" : (stryCov_9fa48("15364"), 'hard'),
  SOFT: stryMutAct_9fa48("15365") ? "" : (stryCov_9fa48("15365"), 'soft')
}));
const LIFECYCLE_DEPENDENCY_DEMOTION_POLICY = Object.freeze(stryMutAct_9fa48("15366") ? {} : (stryCov_9fa48("15366"), {
  THRESHOLD: stryMutAct_9fa48("15367") ? "" : (stryCov_9fa48("15367"), 'threshold'),
  IMMEDIATE: stryMutAct_9fa48("15368") ? "" : (stryCov_9fa48("15368"), 'immediate')
}));
const LIFECYCLE_DEFAULT = Object.freeze(stryMutAct_9fa48("15369") ? {} : (stryCov_9fa48("15369"), {
  STABLE_WINDOW_MS: stryMutAct_9fa48("15370") ? NUM.TEN / NUM.THOUSAND : (stryCov_9fa48("15370"), NUM.TEN * NUM.THOUSAND),
  DEMOTION_FAILURE_THRESHOLD: NUM.TWO,
  RETRY_AFTER_MS: stryMutAct_9fa48("15371") ? NUM.FIVE / NUM.HUNDRED : (stryCov_9fa48("15371"), NUM.FIVE * NUM.HUNDRED)
}));
const LIFECYCLE_ALLOWED_TRANSITIONS = Object.freeze(stryMutAct_9fa48("15372") ? {} : (stryCov_9fa48("15372"), {
  [LIFECYCLE_PHASE.INIT]: Object.freeze(stryMutAct_9fa48("15373") ? [] : (stryCov_9fa48("15373"), [LIFECYCLE_PHASE.CONTROL_READY, LIFECYCLE_PHASE.DEGRADED])),
  [LIFECYCLE_PHASE.CONTROL_READY]: Object.freeze(stryMutAct_9fa48("15374") ? [] : (stryCov_9fa48("15374"), [LIFECYCLE_PHASE.JOIN_READY, LIFECYCLE_PHASE.DEGRADED])),
  [LIFECYCLE_PHASE.JOIN_READY]: Object.freeze(stryMutAct_9fa48("15375") ? [] : (stryCov_9fa48("15375"), [LIFECYCLE_PHASE.TRAFFIC_READY, LIFECYCLE_PHASE.DEGRADED])),
  [LIFECYCLE_PHASE.TRAFFIC_READY]: Object.freeze(stryMutAct_9fa48("15376") ? [] : (stryCov_9fa48("15376"), [LIFECYCLE_PHASE.DEGRADED])),
  [LIFECYCLE_PHASE.DEGRADED]: Object.freeze(stryMutAct_9fa48("15377") ? [] : (stryCov_9fa48("15377"), [LIFECYCLE_PHASE.CONTROL_READY, LIFECYCLE_PHASE.JOIN_READY, LIFECYCLE_PHASE.TRAFFIC_READY]))
}));
export { LIFECYCLE_ALLOWED_TRANSITIONS, LIFECYCLE_DEFAULT, LIFECYCLE_DEPENDENCY, LIFECYCLE_DEPENDENCY_CLASS, LIFECYCLE_DEPENDENCY_DEMOTION_POLICY, LIFECYCLE_EVENT, LIFECYCLE_LEGACY_STATE, LIFECYCLE_PHASE, LIFECYCLE_PROBE_STATUS_CLASS, LIFECYCLE_REASON };