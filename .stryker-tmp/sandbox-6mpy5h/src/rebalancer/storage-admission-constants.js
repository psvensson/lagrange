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
import { CONTROL_PLANE_READINESS_REASON } from '../control-plane/control-plane-readiness-constants.js';
import { ADMISSION_REASON } from './storage-capacity-constants.js';
const STORAGE_ADMISSION_DECISION_TYPE = Object.freeze(stryMutAct_9fa48("140884") ? {} : (stryCov_9fa48("140884"), {
  ADMITTED: stryMutAct_9fa48("140885") ? "" : (stryCov_9fa48("140885"), 'admitted'),
  BLOCKED: stryMutAct_9fa48("140886") ? "" : (stryCov_9fa48("140886"), 'blocked'),
  DEFERRED: stryMutAct_9fa48("140887") ? "" : (stryCov_9fa48("140887"), 'deferred')
}));
const STORAGE_ADMISSION_OPERATION_TYPE = Object.freeze(stryMutAct_9fa48("140888") ? {} : (stryCov_9fa48("140888"), {
  REBALANCE_ADD: stryMutAct_9fa48("140889") ? "" : (stryCov_9fa48("140889"), 'rebalance_add'),
  REPLACE_REPLICA: stryMutAct_9fa48("140890") ? "" : (stryCov_9fa48("140890"), 'replace_replica'),
  PARTITION_SPLIT: stryMutAct_9fa48("140891") ? "" : (stryCov_9fa48("140891"), 'partition_split')
}));
const STORAGE_ADMISSION_REASON = Object.freeze(stryMutAct_9fa48("140892") ? {} : (stryCov_9fa48("140892"), {
  CAPACITY_AVAILABLE: ADMISSION_REASON.CAPACITY_AVAILABLE,
  EMERGENCY_HEADROOM_AVAILABLE: ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
  NO_BUDGET_REGISTERED: ADMISSION_REASON.NO_BUDGET_REGISTERED,
  BUDGET_EXCEEDED: ADMISSION_REASON.BUDGET_EXCEEDED,
  HARD_PRESSURE_EXCEEDED: ADMISSION_REASON.HARD_PRESSURE_EXCEEDED,
  EXHAUSTED: ADMISSION_REASON.EXHAUSTED,
  INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES: stryMutAct_9fa48("140893") ? "" : (stryCov_9fa48("140893"), 'insufficient_placement_eligible_nodes'),
  STORAGE_BUDGET_EXHAUSTED: stryMutAct_9fa48("140894") ? "" : (stryCov_9fa48("140894"), 'storage_budget_exhausted'),
  METADATA_PUBLICATION_DEGRADED: stryMutAct_9fa48("140895") ? "" : (stryCov_9fa48("140895"), 'metadata_publication_degraded'),
  CONTROL_PLANE_WRITE_UNHEALTHY: stryMutAct_9fa48("140896") ? "" : (stryCov_9fa48("140896"), 'control_plane_write_unhealthy'),
  OWNER_ROW_VISIBILITY_UNHEALTHY: stryMutAct_9fa48("140897") ? "" : (stryCov_9fa48("140897"), 'owner_row_visibility_unhealthy'),
  SOURCE_QUORUM_NOT_ROUTABLE: stryMutAct_9fa48("140898") ? "" : (stryCov_9fa48("140898"), 'source_quorum_not_routable'),
  POLICY_CONSTRAINT_UNSATISFIED: stryMutAct_9fa48("140899") ? "" : (stryCov_9fa48("140899"), 'policy_constraint_unsatisfied'),
  ROUTING_NOT_READY: CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
  LOAD_NOT_READY: CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
  STORAGE_BUDGET_UNAVAILABLE: CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE,
  STORAGE_PRESSURE_HARD: CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD,
  STORAGE_PRESSURE_EXHAUSTED: CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED,
  METADATA_PUBLICATION_REPAIR_ONLY: CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY
}));
const STORAGE_ADMISSION_DEFAULT = Object.freeze(stryMutAct_9fa48("140900") ? {} : (stryCov_9fa48("140900"), {
  REQUIRED_REPLICA_COUNT: 1,
  SOURCE_QUORUM_COUNT: 0
}));
export { STORAGE_ADMISSION_DECISION_TYPE, STORAGE_ADMISSION_DEFAULT, STORAGE_ADMISSION_OPERATION_TYPE, STORAGE_ADMISSION_REASON };