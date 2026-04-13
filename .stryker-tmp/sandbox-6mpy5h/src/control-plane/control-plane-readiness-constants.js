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
import { NODE_STATE, NUM } from '../constants/index.js';
import { PRESSURE_STATE } from '../rebalancer/storage-capacity-constants.js';
const CONTROL_PLANE_READINESS_SUBSYSTEM = stryMutAct_9fa48("58464") ? "" : (stryCov_9fa48("58464"), 'control-plane-readiness');
const CONTROL_PLANE_READINESS_DIMENSION = Object.freeze(stryMutAct_9fa48("58465") ? {} : (stryCov_9fa48("58465"), {
  PROCESS_ALIVE: stryMutAct_9fa48("58466") ? "" : (stryCov_9fa48("58466"), 'processAlive'),
  CLUSTER_MEMBER_HEALTHY: stryMutAct_9fa48("58467") ? "" : (stryCov_9fa48("58467"), 'clusterMemberHealthy'),
  ROUTING_READY: stryMutAct_9fa48("58468") ? "" : (stryCov_9fa48("58468"), 'routingReady'),
  LOAD_READY: stryMutAct_9fa48("58469") ? "" : (stryCov_9fa48("58469"), 'loadReady'),
  PLACEMENT_ELIGIBLE: stryMutAct_9fa48("58470") ? "" : (stryCov_9fa48("58470"), 'placementEligible'),
  CONTROL_PLANE_WRITABLE: stryMutAct_9fa48("58471") ? "" : (stryCov_9fa48("58471"), 'controlPlaneWritable'),
  CONTROL_PLANE_PUBLISHED: stryMutAct_9fa48("58472") ? "" : (stryCov_9fa48("58472"), 'controlPlanePublished'),
  CONTROL_PLANE_RECOVERY_ELIGIBLE: stryMutAct_9fa48("58473") ? "" : (stryCov_9fa48("58473"), 'controlPlaneRecoveryEligible'),
  METADATA_PUBLICATION_HEALTHY: stryMutAct_9fa48("58474") ? "" : (stryCov_9fa48("58474"), 'metadataPublicationHealthy'),
  REPAIR_ELIGIBLE: stryMutAct_9fa48("58475") ? "" : (stryCov_9fa48("58475"), 'repairEligible'),
  SERVE_ELIGIBLE: stryMutAct_9fa48("58476") ? "" : (stryCov_9fa48("58476"), 'serveEligible')
}));
const CONTROL_PLANE_READINESS_OWNER = Object.freeze(stryMutAct_9fa48("58477") ? {} : (stryCov_9fa48("58477"), {
  NODE_LIFECYCLE: stryMutAct_9fa48("58478") ? "" : (stryCov_9fa48("58478"), 'NodeLifecycleStateMachine'),
  SYSTEM_TABLE_CACHE: stryMutAct_9fa48("58479") ? "" : (stryCov_9fa48("58479"), 'SystemTableCache'),
  STORAGE_ACCOUNTING: stryMutAct_9fa48("58480") ? "" : (stryCov_9fa48("58480"), 'StorageCapacityAccountingService'),
  CDC_GROUP_PROPAGATION: stryMutAct_9fa48("58481") ? "" : (stryCov_9fa48("58481"), 'CDCGroupPropagationService'),
  MESSAGE_ROUTER: stryMutAct_9fa48("58482") ? "" : (stryCov_9fa48("58482"), 'MessageRouter'),
  MEMBERSHIP_PUBLICATION: stryMutAct_9fa48("58483") ? "" : (stryCov_9fa48("58483"), 'MembershipPublicationCoordinator')
}));
const CONTROL_PLANE_PARTICIPATION_KIND = Object.freeze(stryMutAct_9fa48("58484") ? {} : (stryCov_9fa48("58484"), {
  ROUTED_READ: stryMutAct_9fa48("58485") ? "" : (stryCov_9fa48("58485"), 'routed_read'),
  REPLICA_OPERATION_OWNER_READ: stryMutAct_9fa48("58486") ? "" : (stryCov_9fa48("58486"), 'replica_operation_owner_read'),
  CONTROL_PLANE_RECOVERY: stryMutAct_9fa48("58487") ? "" : (stryCov_9fa48("58487"), 'control_plane_recovery')
}));
const CONTROL_PLANE_PARTICIPATION_DECISION = Object.freeze(stryMutAct_9fa48("58488") ? {} : (stryCov_9fa48("58488"), {
  READY: stryMutAct_9fa48("58489") ? "" : (stryCov_9fa48("58489"), 'ready'),
  DEFER: stryMutAct_9fa48("58490") ? "" : (stryCov_9fa48("58490"), 'defer'),
  BLOCKED: stryMutAct_9fa48("58491") ? "" : (stryCov_9fa48("58491"), 'blocked')
}));
const CONTROL_PLANE_READINESS_REASON = Object.freeze(stryMutAct_9fa48("58492") ? {} : (stryCov_9fa48("58492"), {
  NODE_ROW_MISSING: stryMutAct_9fa48("58493") ? "" : (stryCov_9fa48("58493"), 'node_row_missing'),
  PROCESS_NOT_ALIVE: stryMutAct_9fa48("58494") ? "" : (stryCov_9fa48("58494"), 'process_not_alive'),
  CLUSTER_MEMBER_UNHEALTHY: stryMutAct_9fa48("58495") ? "" : (stryCov_9fa48("58495"), 'cluster_member_unhealthy'),
  ROUTING_NOT_READY: stryMutAct_9fa48("58496") ? "" : (stryCov_9fa48("58496"), 'routing_not_ready'),
  LOCAL_QUERY_TRANSPORT_NOT_READY: stryMutAct_9fa48("58497") ? "" : (stryCov_9fa48("58497"), 'local_query_transport_not_ready'),
  LOAD_NOT_READY: stryMutAct_9fa48("58498") ? "" : (stryCov_9fa48("58498"), 'load_not_ready'),
  STORAGE_BUDGET_UNAVAILABLE: stryMutAct_9fa48("58499") ? "" : (stryCov_9fa48("58499"), 'storage_budget_unavailable'),
  STORAGE_PRESSURE_HARD: stryMutAct_9fa48("58500") ? "" : (stryCov_9fa48("58500"), 'storage_pressure_hard'),
  STORAGE_PRESSURE_EXHAUSTED: stryMutAct_9fa48("58501") ? "" : (stryCov_9fa48("58501"), 'storage_pressure_exhausted'),
  CONTROL_PLANE_WRITE_UNHEALTHY: stryMutAct_9fa48("58502") ? "" : (stryCov_9fa48("58502"), 'control_plane_write_unhealthy'),
  CONTROL_PLANE_PUBLICATION_PENDING: stryMutAct_9fa48("58503") ? "" : (stryCov_9fa48("58503"), 'control_plane_publication_pending'),
  METADATA_PUBLICATION_DEGRADED: stryMutAct_9fa48("58504") ? "" : (stryCov_9fa48("58504"), 'metadata_publication_degraded'),
  METADATA_PUBLICATION_REPAIR_ONLY: stryMutAct_9fa48("58505") ? "" : (stryCov_9fa48("58505"), 'metadata_publication_repair_only')
}));
const CONTROL_PLANE_PRIORITY_RECOVERY_REASON = Object.freeze(stryMutAct_9fa48("58506") ? {} : (stryCov_9fa48("58506"), {
  PUBLICATION_EPOCH_PENDING: stryMutAct_9fa48("58507") ? "" : (stryCov_9fa48("58507"), 'publication_epoch_pending'),
  PRIORITY_PARTITIONS_NOT_SPREAD: stryMutAct_9fa48("58508") ? "" : (stryCov_9fa48("58508"), 'priority_partitions_not_spread'),
  CONTROL_PLANE_NOT_WRITABLE: stryMutAct_9fa48("58509") ? "" : (stryCov_9fa48("58509"), 'control_plane_not_writable'),
  RECOVERY_ELIGIBILITY_PENDING: stryMutAct_9fa48("58510") ? "" : (stryCov_9fa48("58510"), 'recovery_eligibility_pending')
}));
const CONTROL_PLANE_PUBLICATION_MODE = Object.freeze(stryMutAct_9fa48("58511") ? {} : (stryCov_9fa48("58511"), {
  GROUPED: stryMutAct_9fa48("58512") ? "" : (stryCov_9fa48("58512"), 'grouped'),
  CONSERVATIVE_FANOUT: stryMutAct_9fa48("58513") ? "" : (stryCov_9fa48("58513"), 'conservative_fanout'),
  REPAIR_ONLY: stryMutAct_9fa48("58514") ? "" : (stryCov_9fa48("58514"), 'repair_only')
}));
const CONTROL_PLANE_READINESS_DEFAULT = Object.freeze(stryMutAct_9fa48("58515") ? {} : (stryCov_9fa48("58515"), {
  LOAD_READY_MAX_PERCENT: NUM.HUNDRED,
  CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS: NUM.THIRTY_THOUSAND,
  MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS: NUM.THOUSAND,
  NON_RUNNING_PROCESS_STATES: Object.freeze(stryMutAct_9fa48("58516") ? [] : (stryCov_9fa48("58516"), [NODE_STATE.FAILED, NODE_STATE.SHUTTING_DOWN, NODE_STATE.STOPPED])),
  PLACEMENT_BLOCKING_PRESSURE_STATES: Object.freeze(stryMutAct_9fa48("58517") ? [] : (stryCov_9fa48("58517"), [PRESSURE_STATE.HARD, PRESSURE_STATE.EXHAUSTED]))
}));

/**
 * Keys used when persisting a compact readiness snapshot summary
 * alongside admission, dispatch, and progression decisions.
 * @enum {string}
 */
const READINESS_SNAPSHOT_KEY = Object.freeze(stryMutAct_9fa48("58518") ? {} : (stryCov_9fa48("58518"), {
  NODE_ID: stryMutAct_9fa48("58519") ? "" : (stryCov_9fa48("58519"), 'nodeId'),
  DIMENSIONS: stryMutAct_9fa48("58520") ? "" : (stryCov_9fa48("58520"), 'dimensions'),
  REASON_CODES: stryMutAct_9fa48("58521") ? "" : (stryCov_9fa48("58521"), 'reasonCodes'),
  LIFECYCLE_STATE: stryMutAct_9fa48("58522") ? "" : (stryCov_9fa48("58522"), 'lifecycleState'),
  OBSERVED_AT: stryMutAct_9fa48("58523") ? "" : (stryCov_9fa48("58523"), 'observedAt'),
  DECISION_DIMENSION: stryMutAct_9fa48("58524") ? "" : (stryCov_9fa48("58524"), 'decisionDimension')
}));
export { CONTROL_PLANE_PARTICIPATION_DECISION, CONTROL_PLANE_PARTICIPATION_KIND, CONTROL_PLANE_PRIORITY_RECOVERY_REASON, CONTROL_PLANE_PUBLICATION_MODE, CONTROL_PLANE_READINESS_DEFAULT, CONTROL_PLANE_READINESS_DIMENSION, CONTROL_PLANE_READINESS_OWNER, CONTROL_PLANE_READINESS_REASON, CONTROL_PLANE_READINESS_SUBSYSTEM, READINESS_SNAPSHOT_KEY };