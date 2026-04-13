/**
 * Unified reconciliation owner for desired-vs-actual service state.
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
import { EventEmitter } from 'node:events';
import { LoggingService } from '../logging/logging-service.js';
import { SERVICE_DESCRIPTOR_FIELD, SERVICE_LIFECYCLE_STATE, SUBSYSTEM, TYPEOF } from '../constants/index.js';
import { ServiceLifecycleManager } from './service-lifecycle-manager.js';
import { ServicePolicyViolationError } from './service-lifecycle-errors.js';
const SERVICE_RECONCILER_DEFAULT = Object.freeze(stryMutAct_9fa48("151081") ? {} : (stryCov_9fa48("151081"), {
  CHECK_INTERVAL_MS: 5000,
  MAX_CONCURRENT_SERVICE_ACTIONS: 1
}));
const RECONCILER_EVENT = Object.freeze(stryMutAct_9fa48("151082") ? {} : (stryCov_9fa48("151082"), {
  CYCLE_START: stryMutAct_9fa48("151083") ? "" : (stryCov_9fa48("151083"), 'reconciler:cycle:start'),
  CYCLE_COMPLETE: stryMutAct_9fa48("151084") ? "" : (stryCov_9fa48("151084"), 'reconciler:cycle:complete'),
  CYCLE_ERROR: stryMutAct_9fa48("151085") ? "" : (stryCov_9fa48("151085"), 'reconciler:cycle:error'),
  PLAN_READY: stryMutAct_9fa48("151086") ? "" : (stryCov_9fa48("151086"), 'reconciler:plan:ready'),
  DECISION: stryMutAct_9fa48("151087") ? "" : (stryCov_9fa48("151087"), 'reconciler:decision')
}));
const RECONCILER_ACTION_TYPE = Object.freeze(stryMutAct_9fa48("151088") ? {} : (stryCov_9fa48("151088"), {
  CREATE_START_REPLICA: stryMutAct_9fa48("151089") ? "" : (stryCov_9fa48("151089"), 'create_start_replica'),
  START_REPLICA: stryMutAct_9fa48("151090") ? "" : (stryCov_9fa48("151090"), 'start_replica'),
  STOP_REPLICA: stryMutAct_9fa48("151091") ? "" : (stryCov_9fa48("151091"), 'stop_replica')
}));
const RECONCILER_DRIFT_REASON = Object.freeze(stryMutAct_9fa48("151092") ? {} : (stryCov_9fa48("151092"), {
  BELOW_TARGET: stryMutAct_9fa48("151093") ? "" : (stryCov_9fa48("151093"), 'below_target_replica_count'),
  ABOVE_TARGET: stryMutAct_9fa48("151094") ? "" : (stryCov_9fa48("151094"), 'above_target_replica_count'),
  NON_RUNNING_REPLICA: stryMutAct_9fa48("151095") ? "" : (stryCov_9fa48("151095"), 'non_running_replica'),
  SERVICE_REMOVED: stryMutAct_9fa48("151096") ? "" : (stryCov_9fa48("151096"), 'service_removed_from_desired_state')
}));
const RECONCILER_ACTION_PRIORITY = Object.freeze(stryMutAct_9fa48("151097") ? {} : (stryCov_9fa48("151097"), {
  [RECONCILER_ACTION_TYPE.STOP_REPLICA]: 1,
  [RECONCILER_ACTION_TYPE.START_REPLICA]: 2,
  [RECONCILER_ACTION_TYPE.CREATE_START_REPLICA]: 3
}));
const RECONCILER_ERROR = Object.freeze(stryMutAct_9fa48("151098") ? {} : (stryCov_9fa48("151098"), {
  LIFECYCLE_MANAGER_REQUIRED: stryMutAct_9fa48("151099") ? "" : (stryCov_9fa48("151099"), 'lifecycleManager must be an instance of ServiceLifecycleManager'),
  DESIRED_STATE_READER_REQUIRED: stryMutAct_9fa48("151100") ? "" : (stryCov_9fa48("151100"), 'desiredStateReader must be a function'),
  ACTUAL_STATE_READER_REQUIRED: stryMutAct_9fa48("151101") ? "" : (stryCov_9fa48("151101"), 'actualStateReader must be a function'),
  TELEMETRY_SINK_REQUIRED: stryMutAct_9fa48("151102") ? "" : (stryCov_9fa48("151102"), 'telemetrySink must be a function'),
  EVENT_SOURCE_REQUIRED: stryMutAct_9fa48("151103") ? "" : (stryCov_9fa48("151103"), 'eventSource must provide on() and off() methods'),
  EVENT_NAME_REQUIRED: stryMutAct_9fa48("151104") ? "" : (stryCov_9fa48("151104"), 'eventNames entries must be non-empty strings'),
  PLACEMENT_POLICY_CHECK_REQUIRED: stryMutAct_9fa48("151105") ? "" : (stryCov_9fa48("151105"), 'placementPolicyCheck must be a function'),
  INTERVAL_REQUIRED: stryMutAct_9fa48("151106") ? "" : (stryCov_9fa48("151106"), 'checkIntervalMs must be a positive finite number'),
  MAX_CONCURRENT_ACTIONS_REQUIRED: stryMutAct_9fa48("151107") ? "" : (stryCov_9fa48("151107"), 'maxConcurrentServiceActions must be a positive finite number')
}));
const RECONCILER_POLICY_TYPE = Object.freeze(stryMutAct_9fa48("151108") ? {} : (stryCov_9fa48("151108"), {
  PLACEMENT: stryMutAct_9fa48("151109") ? "" : (stryCov_9fa48("151109"), 'placement')
}));
const RECONCILER_LOG = Object.freeze(stryMutAct_9fa48("151110") ? {} : (stryCov_9fa48("151110"), {
  CYCLE_START: stryMutAct_9fa48("151111") ? "" : (stryCov_9fa48("151111"), 'Service reconciliation cycle started'),
  CYCLE_COMPLETE: stryMutAct_9fa48("151112") ? "" : (stryCov_9fa48("151112"), 'Service reconciliation cycle completed'),
  CYCLE_ERROR: stryMutAct_9fa48("151113") ? "" : (stryCov_9fa48("151113"), 'Service reconciliation cycle failed'),
  DECISION: stryMutAct_9fa48("151114") ? "" : (stryCov_9fa48("151114"), 'Service reconciliation decision recorded')
}));
const DEFAULT_DECISION_HISTORY_LIMIT = 100;
const MAX_DECISION_HISTORY_LIMIT = 500;
const RECONCILER_PLACEMENT_POLICY_ERROR = Object.freeze(stryMutAct_9fa48("151115") ? {} : (stryCov_9fa48("151115"), {
  ACTION_REQUIRED: stryMutAct_9fa48("151116") ? "" : (stryCov_9fa48("151116"), 'reconcile action must be an object'),
  ACTION_SERVICE_ID_REQUIRED: stryMutAct_9fa48("151117") ? "" : (stryCov_9fa48("151117"), 'reconcile action must resolve serviceId'),
  ACTION_SERVICE_TYPE_REQUIRED: stryMutAct_9fa48("151118") ? "" : (stryCov_9fa48("151118"), 'reconcile action must resolve serviceType'),
  ACTION_REPLICA_ID_REQUIRED: stryMutAct_9fa48("151119") ? "" : (stryCov_9fa48("151119"), 'reconcile action must include replicaId for replica mutations')
}));
function resolveServiceId(entity) {
  if (stryMutAct_9fa48("151120")) {
    {}
  } else {
    stryCov_9fa48("151120");
    return stryMutAct_9fa48("151123") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && null : stryMutAct_9fa48("151122") ? false : stryMutAct_9fa48("151121") ? true : (stryCov_9fa48("151121", "151122", "151123"), (stryMutAct_9fa48("151125") ? entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] && entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("151124") ? false : (stryCov_9fa48("151124", "151125"), (stryMutAct_9fa48("151126") ? entity[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : (stryCov_9fa48("151126"), entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || (stryMutAct_9fa48("151128") ? entity.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("151127") ? entity?.definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : (stryCov_9fa48("151127", "151128"), entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])))) || null);
  }
}
function resolveServiceType(entity) {
  if (stryMutAct_9fa48("151129")) {
    {}
  } else {
    stryCov_9fa48("151129");
    return stryMutAct_9fa48("151132") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] || entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]) && null : stryMutAct_9fa48("151131") ? false : stryMutAct_9fa48("151130") ? true : (stryCov_9fa48("151130", "151131", "151132"), (stryMutAct_9fa48("151134") ? entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] && entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] : stryMutAct_9fa48("151133") ? false : (stryCov_9fa48("151133", "151134"), (stryMutAct_9fa48("151135") ? entity[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] : (stryCov_9fa48("151135"), entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE])) || (stryMutAct_9fa48("151137") ? entity.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] : stryMutAct_9fa48("151136") ? entity?.definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] : (stryCov_9fa48("151136", "151137"), entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE])))) || null);
  }
}
function resolveReplicaId(entity) {
  if (stryMutAct_9fa48("151138")) {
    {}
  } else {
    stryCov_9fa48("151138");
    return stryMutAct_9fa48("151141") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] || entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]) && null : stryMutAct_9fa48("151140") ? false : stryMutAct_9fa48("151139") ? true : (stryCov_9fa48("151139", "151140", "151141"), (stryMutAct_9fa48("151143") ? entity?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] && entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("151142") ? false : (stryCov_9fa48("151142", "151143"), (stryMutAct_9fa48("151144") ? entity[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : (stryCov_9fa48("151144"), entity?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID])) || (stryMutAct_9fa48("151146") ? entity.definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("151145") ? entity?.definition[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : (stryCov_9fa48("151145", "151146"), entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID])))) || null);
  }
}
function resolveTenantId(entity) {
  if (stryMutAct_9fa48("151147")) {
    {}
  } else {
    stryCov_9fa48("151147");
    return stryMutAct_9fa48("151150") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] || entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID]) && resolveServiceId(entity) : stryMutAct_9fa48("151149") ? false : stryMutAct_9fa48("151148") ? true : (stryCov_9fa48("151148", "151149", "151150"), (stryMutAct_9fa48("151152") ? entity?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] && entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] : stryMutAct_9fa48("151151") ? false : (stryCov_9fa48("151151", "151152"), (stryMutAct_9fa48("151153") ? entity[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] : (stryCov_9fa48("151153"), entity?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID])) || (stryMutAct_9fa48("151155") ? entity.definition?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] : stryMutAct_9fa48("151154") ? entity?.definition[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] : (stryCov_9fa48("151154", "151155"), entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID])))) || resolveServiceId(entity));
  }
}
function resolveRuntimeKind(entity) {
  if (stryMutAct_9fa48("151156")) {
    {}
  } else {
    stryCov_9fa48("151156");
    return stryMutAct_9fa48("151159") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || entity?.runtime_kind || entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || entity?.definition?.runtime_kind) && null : stryMutAct_9fa48("151158") ? false : stryMutAct_9fa48("151157") ? true : (stryCov_9fa48("151157", "151158", "151159"), (stryMutAct_9fa48("151161") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || entity?.runtime_kind || entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]) && entity?.definition?.runtime_kind : stryMutAct_9fa48("151160") ? false : (stryCov_9fa48("151160", "151161"), (stryMutAct_9fa48("151163") ? (entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || entity?.runtime_kind) && entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] : stryMutAct_9fa48("151162") ? false : (stryCov_9fa48("151162", "151163"), (stryMutAct_9fa48("151165") ? entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] && entity?.runtime_kind : stryMutAct_9fa48("151164") ? false : (stryCov_9fa48("151164", "151165"), (stryMutAct_9fa48("151166") ? entity[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] : (stryCov_9fa48("151166"), entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND])) || (stryMutAct_9fa48("151167") ? entity.runtime_kind : (stryCov_9fa48("151167"), entity?.runtime_kind)))) || (stryMutAct_9fa48("151169") ? entity.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] : stryMutAct_9fa48("151168") ? entity?.definition[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] : (stryCov_9fa48("151168", "151169"), entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND])))) || (stryMutAct_9fa48("151171") ? entity.definition?.runtime_kind : stryMutAct_9fa48("151170") ? entity?.definition.runtime_kind : (stryCov_9fa48("151170", "151171"), entity?.definition?.runtime_kind)))) || null);
  }
}
function resolveReplicaCount(definition) {
  if (stryMutAct_9fa48("151172")) {
    {}
  } else {
    stryCov_9fa48("151172");
    const count = stryMutAct_9fa48("151173") ? definition[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT] : (stryCov_9fa48("151173"), definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]);
    if (stryMutAct_9fa48("151176") ? false : stryMutAct_9fa48("151175") ? true : stryMutAct_9fa48("151174") ? Number.isFinite(count) : (stryCov_9fa48("151174", "151175", "151176"), !Number.isFinite(count))) {
      if (stryMutAct_9fa48("151177")) {
        {}
      } else {
        stryCov_9fa48("151177");
        return 0;
      }
    }
    return stryMutAct_9fa48("151178") ? Math.min(0, Math.floor(count)) : (stryCov_9fa48("151178"), Math.max(0, Math.floor(count)));
  }
}
function resolveLifecycleState(replica) {
  if (stryMutAct_9fa48("151179")) {
    {}
  } else {
    stryCov_9fa48("151179");
    return stryMutAct_9fa48("151182") ? replica?.[SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE] && SERVICE_LIFECYCLE_STATE.CREATED : stryMutAct_9fa48("151181") ? false : stryMutAct_9fa48("151180") ? true : (stryCov_9fa48("151180", "151181", "151182"), (stryMutAct_9fa48("151183") ? replica[SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE] : (stryCov_9fa48("151183"), replica?.[SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE])) || SERVICE_LIFECYCLE_STATE.CREATED);
  }
}
function cloneReplicaHandle(replica) {
  if (stryMutAct_9fa48("151184")) {
    {}
  } else {
    stryCov_9fa48("151184");
    return stryMutAct_9fa48("151185") ? {} : (stryCov_9fa48("151185"), {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: resolveServiceId(replica),
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(replica),
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(replica),
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: resolveReplicaId(replica),
      [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: resolveLifecycleState(replica)
    });
  }
}
function compareReplicasByReplicaId(leftReplica, rightReplica) {
  if (stryMutAct_9fa48("151186")) {
    {}
  } else {
    stryCov_9fa48("151186");
    const leftId = stryMutAct_9fa48("151189") ? resolveReplicaId(leftReplica) && '' : stryMutAct_9fa48("151188") ? false : stryMutAct_9fa48("151187") ? true : (stryCov_9fa48("151187", "151188", "151189"), resolveReplicaId(leftReplica) || (stryMutAct_9fa48("151190") ? "Stryker was here!" : (stryCov_9fa48("151190"), '')));
    const rightId = stryMutAct_9fa48("151193") ? resolveReplicaId(rightReplica) && '' : stryMutAct_9fa48("151192") ? false : stryMutAct_9fa48("151191") ? true : (stryCov_9fa48("151191", "151192", "151193"), resolveReplicaId(rightReplica) || (stryMutAct_9fa48("151194") ? "Stryker was here!" : (stryCov_9fa48("151194"), '')));
    return leftId.localeCompare(rightId);
  }
}
function compareActionsDeterministically(leftAction, rightAction) {
  if (stryMutAct_9fa48("151195")) {
    {}
  } else {
    stryCov_9fa48("151195");
    const typeCompare = (stryMutAct_9fa48("151198") ? resolveServiceType(leftAction) && '' : stryMutAct_9fa48("151197") ? false : stryMutAct_9fa48("151196") ? true : (stryCov_9fa48("151196", "151197", "151198"), resolveServiceType(leftAction) || (stryMutAct_9fa48("151199") ? "Stryker was here!" : (stryCov_9fa48("151199"), '')))).localeCompare(stryMutAct_9fa48("151202") ? resolveServiceType(rightAction) && '' : stryMutAct_9fa48("151201") ? false : stryMutAct_9fa48("151200") ? true : (stryCov_9fa48("151200", "151201", "151202"), resolveServiceType(rightAction) || (stryMutAct_9fa48("151203") ? "Stryker was here!" : (stryCov_9fa48("151203"), ''))));
    if (stryMutAct_9fa48("151206") ? typeCompare === 0 : stryMutAct_9fa48("151205") ? false : stryMutAct_9fa48("151204") ? true : (stryCov_9fa48("151204", "151205", "151206"), typeCompare !== 0)) {
      if (stryMutAct_9fa48("151207")) {
        {}
      } else {
        stryCov_9fa48("151207");
        return typeCompare;
      }
    }
    const serviceCompare = (stryMutAct_9fa48("151210") ? resolveServiceId(leftAction) && '' : stryMutAct_9fa48("151209") ? false : stryMutAct_9fa48("151208") ? true : (stryCov_9fa48("151208", "151209", "151210"), resolveServiceId(leftAction) || (stryMutAct_9fa48("151211") ? "Stryker was here!" : (stryCov_9fa48("151211"), '')))).localeCompare(stryMutAct_9fa48("151214") ? resolveServiceId(rightAction) && '' : stryMutAct_9fa48("151213") ? false : stryMutAct_9fa48("151212") ? true : (stryCov_9fa48("151212", "151213", "151214"), resolveServiceId(rightAction) || (stryMutAct_9fa48("151215") ? "Stryker was here!" : (stryCov_9fa48("151215"), ''))));
    if (stryMutAct_9fa48("151218") ? serviceCompare === 0 : stryMutAct_9fa48("151217") ? false : stryMutAct_9fa48("151216") ? true : (stryCov_9fa48("151216", "151217", "151218"), serviceCompare !== 0)) {
      if (stryMutAct_9fa48("151219")) {
        {}
      } else {
        stryCov_9fa48("151219");
        return serviceCompare;
      }
    }
    const leftPriority = stryMutAct_9fa48("151222") ? RECONCILER_ACTION_PRIORITY[leftAction.type] && 999 : stryMutAct_9fa48("151221") ? false : stryMutAct_9fa48("151220") ? true : (stryCov_9fa48("151220", "151221", "151222"), RECONCILER_ACTION_PRIORITY[leftAction.type] || 999);
    const rightPriority = stryMutAct_9fa48("151225") ? RECONCILER_ACTION_PRIORITY[rightAction.type] && 999 : stryMutAct_9fa48("151224") ? false : stryMutAct_9fa48("151223") ? true : (stryCov_9fa48("151223", "151224", "151225"), RECONCILER_ACTION_PRIORITY[rightAction.type] || 999);
    if (stryMutAct_9fa48("151228") ? leftPriority === rightPriority : stryMutAct_9fa48("151227") ? false : stryMutAct_9fa48("151226") ? true : (stryCov_9fa48("151226", "151227", "151228"), leftPriority !== rightPriority)) {
      if (stryMutAct_9fa48("151229")) {
        {}
      } else {
        stryCov_9fa48("151229");
        return stryMutAct_9fa48("151230") ? leftPriority + rightPriority : (stryCov_9fa48("151230"), leftPriority - rightPriority);
      }
    }
    return (stryMutAct_9fa48("151233") ? resolveReplicaId(leftAction.replica) && '' : stryMutAct_9fa48("151232") ? false : stryMutAct_9fa48("151231") ? true : (stryCov_9fa48("151231", "151232", "151233"), resolveReplicaId(leftAction.replica) || (stryMutAct_9fa48("151234") ? "Stryker was here!" : (stryCov_9fa48("151234"), '')))).localeCompare(stryMutAct_9fa48("151237") ? resolveReplicaId(rightAction.replica) && '' : stryMutAct_9fa48("151236") ? false : stryMutAct_9fa48("151235") ? true : (stryCov_9fa48("151235", "151236", "151237"), resolveReplicaId(rightAction.replica) || (stryMutAct_9fa48("151238") ? "Stryker was here!" : (stryCov_9fa48("151238"), ''))));
  }
}
async function defaultPlacementPolicyCheck(policyContext) {
  if (stryMutAct_9fa48("151239")) {
    {}
  } else {
    stryCov_9fa48("151239");
    const action = stryMutAct_9fa48("151240") ? policyContext.action : (stryCov_9fa48("151240"), policyContext?.action);
    if (stryMutAct_9fa48("151243") ? !action && typeof action !== TYPEOF.OBJECT : stryMutAct_9fa48("151242") ? false : stryMutAct_9fa48("151241") ? true : (stryCov_9fa48("151241", "151242", "151243"), (stryMutAct_9fa48("151244") ? action : (stryCov_9fa48("151244"), !action)) || (stryMutAct_9fa48("151246") ? typeof action === TYPEOF.OBJECT : stryMutAct_9fa48("151245") ? false : (stryCov_9fa48("151245", "151246"), typeof action !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("151247")) {
        {}
      } else {
        stryCov_9fa48("151247");
        throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_REQUIRED);
      }
    }
    const serviceId = resolveServiceId(stryMutAct_9fa48("151250") ? action.definition && action.replica : stryMutAct_9fa48("151249") ? false : stryMutAct_9fa48("151248") ? true : (stryCov_9fa48("151248", "151249", "151250"), action.definition || action.replica));
    if (stryMutAct_9fa48("151253") ? false : stryMutAct_9fa48("151252") ? true : stryMutAct_9fa48("151251") ? serviceId : (stryCov_9fa48("151251", "151252", "151253"), !serviceId)) {
      if (stryMutAct_9fa48("151254")) {
        {}
      } else {
        stryCov_9fa48("151254");
        throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_SERVICE_ID_REQUIRED);
      }
    }
    const serviceType = resolveServiceType(stryMutAct_9fa48("151257") ? action.definition && action.replica : stryMutAct_9fa48("151256") ? false : stryMutAct_9fa48("151255") ? true : (stryCov_9fa48("151255", "151256", "151257"), action.definition || action.replica));
    if (stryMutAct_9fa48("151260") ? false : stryMutAct_9fa48("151259") ? true : stryMutAct_9fa48("151258") ? serviceType : (stryCov_9fa48("151258", "151259", "151260"), !serviceType)) {
      if (stryMutAct_9fa48("151261")) {
        {}
      } else {
        stryCov_9fa48("151261");
        throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_SERVICE_TYPE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("151264") ? (action.type === RECONCILER_ACTION_TYPE.START_REPLICA || action.type === RECONCILER_ACTION_TYPE.STOP_REPLICA) && action.type === RECONCILER_ACTION_TYPE.CREATE_START_REPLICA : stryMutAct_9fa48("151263") ? false : stryMutAct_9fa48("151262") ? true : (stryCov_9fa48("151262", "151263", "151264"), (stryMutAct_9fa48("151266") ? action.type === RECONCILER_ACTION_TYPE.START_REPLICA && action.type === RECONCILER_ACTION_TYPE.STOP_REPLICA : stryMutAct_9fa48("151265") ? false : (stryCov_9fa48("151265", "151266"), (stryMutAct_9fa48("151268") ? action.type !== RECONCILER_ACTION_TYPE.START_REPLICA : stryMutAct_9fa48("151267") ? false : (stryCov_9fa48("151267", "151268"), action.type === RECONCILER_ACTION_TYPE.START_REPLICA)) || (stryMutAct_9fa48("151270") ? action.type !== RECONCILER_ACTION_TYPE.STOP_REPLICA : stryMutAct_9fa48("151269") ? false : (stryCov_9fa48("151269", "151270"), action.type === RECONCILER_ACTION_TYPE.STOP_REPLICA)))) || (stryMutAct_9fa48("151272") ? action.type !== RECONCILER_ACTION_TYPE.CREATE_START_REPLICA : stryMutAct_9fa48("151271") ? false : (stryCov_9fa48("151271", "151272"), action.type === RECONCILER_ACTION_TYPE.CREATE_START_REPLICA)))) {
      if (stryMutAct_9fa48("151273")) {
        {}
      } else {
        stryCov_9fa48("151273");
        const replicaId = resolveReplicaId(action.replica);
        if (stryMutAct_9fa48("151276") ? false : stryMutAct_9fa48("151275") ? true : stryMutAct_9fa48("151274") ? replicaId : (stryCov_9fa48("151274", "151275", "151276"), !replicaId)) {
          if (stryMutAct_9fa48("151277")) {
            {}
          } else {
            stryCov_9fa48("151277");
            throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_REPLICA_ID_REQUIRED);
          }
        }
      }
    }
  }
}

/**
 * ServiceReconciler computes drift and converges state using one lifecycle owner.
 */
class ServiceReconciler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {ServiceLifecycleManager} options.lifecycleManager
   * @param {Function} options.desiredStateReader
   * @param {Function} options.actualStateReader
   * @param {number} [options.checkIntervalMs]
   * @param {number} [options.maxConcurrentServiceActions]
   * @param {EventEmitter} [options.eventSource]
   * @param {string[]} [options.eventNames]
   * @param {Function|null} [options.telemetrySink]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("151278")) {
      {}
    } else {
      stryCov_9fa48("151278");
      super();
      if (stryMutAct_9fa48("151281") ? false : stryMutAct_9fa48("151280") ? true : stryMutAct_9fa48("151279") ? options.lifecycleManager instanceof ServiceLifecycleManager : (stryCov_9fa48("151279", "151280", "151281"), !(options.lifecycleManager instanceof ServiceLifecycleManager))) {
        if (stryMutAct_9fa48("151282")) {
          {}
        } else {
          stryCov_9fa48("151282");
          throw new TypeError(RECONCILER_ERROR.LIFECYCLE_MANAGER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("151285") ? typeof options.desiredStateReader === TYPEOF.FUNCTION : stryMutAct_9fa48("151284") ? false : stryMutAct_9fa48("151283") ? true : (stryCov_9fa48("151283", "151284", "151285"), typeof options.desiredStateReader !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("151286")) {
          {}
        } else {
          stryCov_9fa48("151286");
          throw new TypeError(RECONCILER_ERROR.DESIRED_STATE_READER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("151289") ? typeof options.actualStateReader === TYPEOF.FUNCTION : stryMutAct_9fa48("151288") ? false : stryMutAct_9fa48("151287") ? true : (stryCov_9fa48("151287", "151288", "151289"), typeof options.actualStateReader !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("151290")) {
          {}
        } else {
          stryCov_9fa48("151290");
          throw new TypeError(RECONCILER_ERROR.ACTUAL_STATE_READER_REQUIRED);
        }
      }
      const checkIntervalMs = stryMutAct_9fa48("151293") ? options.checkIntervalMs && SERVICE_RECONCILER_DEFAULT.CHECK_INTERVAL_MS : stryMutAct_9fa48("151292") ? false : stryMutAct_9fa48("151291") ? true : (stryCov_9fa48("151291", "151292", "151293"), options.checkIntervalMs || SERVICE_RECONCILER_DEFAULT.CHECK_INTERVAL_MS);
      if (stryMutAct_9fa48("151296") ? !Number.isFinite(checkIntervalMs) && checkIntervalMs <= 0 : stryMutAct_9fa48("151295") ? false : stryMutAct_9fa48("151294") ? true : (stryCov_9fa48("151294", "151295", "151296"), (stryMutAct_9fa48("151297") ? Number.isFinite(checkIntervalMs) : (stryCov_9fa48("151297"), !Number.isFinite(checkIntervalMs))) || (stryMutAct_9fa48("151300") ? checkIntervalMs > 0 : stryMutAct_9fa48("151299") ? checkIntervalMs < 0 : stryMutAct_9fa48("151298") ? false : (stryCov_9fa48("151298", "151299", "151300"), checkIntervalMs <= 0)))) {
        if (stryMutAct_9fa48("151301")) {
          {}
        } else {
          stryCov_9fa48("151301");
          throw new TypeError(RECONCILER_ERROR.INTERVAL_REQUIRED);
        }
      }
      const maxConcurrentServiceActions = stryMutAct_9fa48("151302") ? options.maxConcurrentServiceActions && SERVICE_RECONCILER_DEFAULT.MAX_CONCURRENT_SERVICE_ACTIONS : (stryCov_9fa48("151302"), options.maxConcurrentServiceActions ?? SERVICE_RECONCILER_DEFAULT.MAX_CONCURRENT_SERVICE_ACTIONS);
      if (stryMutAct_9fa48("151305") ? !Number.isFinite(maxConcurrentServiceActions) && maxConcurrentServiceActions <= 0 : stryMutAct_9fa48("151304") ? false : stryMutAct_9fa48("151303") ? true : (stryCov_9fa48("151303", "151304", "151305"), (stryMutAct_9fa48("151306") ? Number.isFinite(maxConcurrentServiceActions) : (stryCov_9fa48("151306"), !Number.isFinite(maxConcurrentServiceActions))) || (stryMutAct_9fa48("151309") ? maxConcurrentServiceActions > 0 : stryMutAct_9fa48("151308") ? maxConcurrentServiceActions < 0 : stryMutAct_9fa48("151307") ? false : (stryCov_9fa48("151307", "151308", "151309"), maxConcurrentServiceActions <= 0)))) {
        if (stryMutAct_9fa48("151310")) {
          {}
        } else {
          stryCov_9fa48("151310");
          throw new TypeError(RECONCILER_ERROR.MAX_CONCURRENT_ACTIONS_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("151313") ? options.telemetrySink !== undefined && options.telemetrySink !== null || typeof options.telemetrySink !== TYPEOF.FUNCTION : stryMutAct_9fa48("151312") ? false : stryMutAct_9fa48("151311") ? true : (stryCov_9fa48("151311", "151312", "151313"), (stryMutAct_9fa48("151315") ? options.telemetrySink !== undefined || options.telemetrySink !== null : stryMutAct_9fa48("151314") ? true : (stryCov_9fa48("151314", "151315"), (stryMutAct_9fa48("151317") ? options.telemetrySink === undefined : stryMutAct_9fa48("151316") ? true : (stryCov_9fa48("151316", "151317"), options.telemetrySink !== undefined)) && (stryMutAct_9fa48("151319") ? options.telemetrySink === null : stryMutAct_9fa48("151318") ? true : (stryCov_9fa48("151318", "151319"), options.telemetrySink !== null)))) && (stryMutAct_9fa48("151321") ? typeof options.telemetrySink === TYPEOF.FUNCTION : stryMutAct_9fa48("151320") ? true : (stryCov_9fa48("151320", "151321"), typeof options.telemetrySink !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("151322")) {
          {}
        } else {
          stryCov_9fa48("151322");
          throw new TypeError(RECONCILER_ERROR.TELEMETRY_SINK_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("151324") ? false : stryMutAct_9fa48("151323") ? true : (stryCov_9fa48("151323", "151324"), options.eventSource)) {
        if (stryMutAct_9fa48("151325")) {
          {}
        } else {
          stryCov_9fa48("151325");
          if (stryMutAct_9fa48("151328") ? typeof options.eventSource.on !== TYPEOF.FUNCTION && typeof options.eventSource.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("151327") ? false : stryMutAct_9fa48("151326") ? true : (stryCov_9fa48("151326", "151327", "151328"), (stryMutAct_9fa48("151330") ? typeof options.eventSource.on === TYPEOF.FUNCTION : stryMutAct_9fa48("151329") ? false : (stryCov_9fa48("151329", "151330"), typeof options.eventSource.on !== TYPEOF.FUNCTION)) || (stryMutAct_9fa48("151332") ? typeof options.eventSource.off === TYPEOF.FUNCTION : stryMutAct_9fa48("151331") ? false : (stryCov_9fa48("151331", "151332"), typeof options.eventSource.off !== TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("151333")) {
              {}
            } else {
              stryCov_9fa48("151333");
              throw new TypeError(RECONCILER_ERROR.EVENT_SOURCE_REQUIRED);
            }
          }
        }
      }
      if (stryMutAct_9fa48("151336") ? options.placementPolicyCheck !== undefined || typeof options.placementPolicyCheck !== TYPEOF.FUNCTION : stryMutAct_9fa48("151335") ? false : stryMutAct_9fa48("151334") ? true : (stryCov_9fa48("151334", "151335", "151336"), (stryMutAct_9fa48("151338") ? options.placementPolicyCheck === undefined : stryMutAct_9fa48("151337") ? true : (stryCov_9fa48("151337", "151338"), options.placementPolicyCheck !== undefined)) && (stryMutAct_9fa48("151340") ? typeof options.placementPolicyCheck === TYPEOF.FUNCTION : stryMutAct_9fa48("151339") ? true : (stryCov_9fa48("151339", "151340"), typeof options.placementPolicyCheck !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("151341")) {
          {}
        } else {
          stryCov_9fa48("151341");
          throw new TypeError(RECONCILER_ERROR.PLACEMENT_POLICY_CHECK_REQUIRED);
        }
      }

      /** @type {ServiceLifecycleManager} */
      this._lifecycleManager = options.lifecycleManager;

      /** @type {Function} */
      this._desiredStateReader = options.desiredStateReader;

      /** @type {Function} */
      this._actualStateReader = options.actualStateReader;

      /** @type {number} */
      this._checkIntervalMs = checkIntervalMs;

      /** @type {number} */
      this._maxConcurrentServiceActions = Math.floor(maxConcurrentServiceActions);

      /** @type {EventEmitter|null} */
      this._eventSource = stryMutAct_9fa48("151344") ? options.eventSource && null : stryMutAct_9fa48("151343") ? false : stryMutAct_9fa48("151342") ? true : (stryCov_9fa48("151342", "151343", "151344"), options.eventSource || null);

      /** @type {string[]} */
      this._eventNames = stryMutAct_9fa48("151347") ? options.eventNames && [] : stryMutAct_9fa48("151346") ? false : stryMutAct_9fa48("151345") ? true : (stryCov_9fa48("151345", "151346", "151347"), options.eventNames || (stryMutAct_9fa48("151348") ? ["Stryker was here"] : (stryCov_9fa48("151348"), [])));
      for (const eventName of this._eventNames) {
        if (stryMutAct_9fa48("151349")) {
          {}
        } else {
          stryCov_9fa48("151349");
          if (stryMutAct_9fa48("151352") ? typeof eventName !== TYPEOF.STRING && eventName.length === 0 : stryMutAct_9fa48("151351") ? false : stryMutAct_9fa48("151350") ? true : (stryCov_9fa48("151350", "151351", "151352"), (stryMutAct_9fa48("151354") ? typeof eventName === TYPEOF.STRING : stryMutAct_9fa48("151353") ? false : (stryCov_9fa48("151353", "151354"), typeof eventName !== TYPEOF.STRING)) || (stryMutAct_9fa48("151356") ? eventName.length !== 0 : stryMutAct_9fa48("151355") ? false : (stryCov_9fa48("151355", "151356"), eventName.length === 0)))) {
            if (stryMutAct_9fa48("151357")) {
              {}
            } else {
              stryCov_9fa48("151357");
              throw new TypeError(RECONCILER_ERROR.EVENT_NAME_REQUIRED);
            }
          }
        }
      }

      /** @type {Function|null} */
      this._telemetrySink = stryMutAct_9fa48("151360") ? options.telemetrySink && null : stryMutAct_9fa48("151359") ? false : stryMutAct_9fa48("151358") ? true : (stryCov_9fa48("151358", "151359", "151360"), options.telemetrySink || null);

      /** @type {Function} */
      this._placementPolicyCheck = stryMutAct_9fa48("151363") ? options.placementPolicyCheck && defaultPlacementPolicyCheck : stryMutAct_9fa48("151362") ? false : stryMutAct_9fa48("151361") ? true : (stryCov_9fa48("151361", "151362", "151363"), options.placementPolicyCheck || defaultPlacementPolicyCheck);

      /** @type {Object} */
      this._logger = stryMutAct_9fa48("151366") ? options.logger && this._initLogger() : stryMutAct_9fa48("151365") ? false : stryMutAct_9fa48("151364") ? true : (stryCov_9fa48("151364", "151365", "151366"), options.logger || this._initLogger());

      /** @type {Map<string, Function>} */
      this._eventHandlers = new Map();

      /** @type {NodeJS.Timeout|null} */
      this._interval = null;

      /** @type {boolean} */
      this._running = stryMutAct_9fa48("151367") ? true : (stryCov_9fa48("151367"), false);

      /** @type {boolean} */
      this._rerunRequested = stryMutAct_9fa48("151368") ? true : (stryCov_9fa48("151368"), false);

      /** @type {{reason: string, metadata: Object}|null} */
      this._pendingTrigger = null;
      this._stats = stryMutAct_9fa48("151369") ? {} : (stryCov_9fa48("151369"), {
        cycleCount: 0,
        cycleSuccessCount: 0,
        cycleFailureCount: 0,
        actionCount: 0,
        actionSuccessCount: 0,
        actionFailureCount: 0,
        lastCycleDurationMs: 0,
        cycleLatencyMsTotal: 0,
        cycleLatencyMsMax: 0,
        lastActionDurationMs: 0,
        actionLatencyMsTotal: 0,
        actionLatencyMsMax: 0,
        lastCycleAt: null,
        lastCycleReason: null,
        lastError: null
      });

      /** @type {Object[]} */
      this._decisionHistory = stryMutAct_9fa48("151370") ? ["Stryker was here"] : (stryCov_9fa48("151370"), []);
    }
  }

  /**
   * @return {Object}
   * @private
   */
  _initLogger() {
    if (stryMutAct_9fa48("151371")) {
      {}
    } else {
      stryCov_9fa48("151371");
      try {
        if (stryMutAct_9fa48("151372")) {
          {}
        } else {
          stryCov_9fa48("151372");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("151374") ? false : stryMutAct_9fa48("151373") ? true : (stryCov_9fa48("151373", "151374"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("151375")) {
              {}
            } else {
              stryCov_9fa48("151375");
              return loggingService.forSubsystem(SUBSYSTEM.SERVICE_LIFECYCLE);
            }
          }
        }
      } catch {
        // Logging service may not be initialized in unit tests.
      }
      return console;
    }
  }

  /**
   * Start periodic and event-driven reconciliation.
   *
   * @return {Promise<void>}
   */
  async start() {
    if (stryMutAct_9fa48("151376")) {
      {}
    } else {
      stryCov_9fa48("151376");
      if (stryMutAct_9fa48("151378") ? false : stryMutAct_9fa48("151377") ? true : (stryCov_9fa48("151377", "151378"), this._interval)) {
        if (stryMutAct_9fa48("151379")) {
          {}
        } else {
          stryCov_9fa48("151379");
          return;
        }
      }
      this._interval = setInterval(() => {
        if (stryMutAct_9fa48("151380")) {
          {}
        } else {
          stryCov_9fa48("151380");
          this.trigger(stryMutAct_9fa48("151381") ? "" : (stryCov_9fa48("151381"), 'interval'));
        }
      }, this._checkIntervalMs);
      this._bindEventTriggers();
      await this.trigger(stryMutAct_9fa48("151382") ? "" : (stryCov_9fa48("151382"), 'startup'));
    }
  }

  /**
   * Stop periodic and event-driven reconciliation.
   */
  stop() {
    if (stryMutAct_9fa48("151383")) {
      {}
    } else {
      stryCov_9fa48("151383");
      if (stryMutAct_9fa48("151385") ? false : stryMutAct_9fa48("151384") ? true : (stryCov_9fa48("151384", "151385"), this._interval)) {
        if (stryMutAct_9fa48("151386")) {
          {}
        } else {
          stryCov_9fa48("151386");
          clearInterval(this._interval);
          this._interval = null;
        }
      }
      this._unbindEventTriggers();
    }
  }

  /**
   * Trigger a reconciliation cycle.
   *
   * @param {string} reason
   * @param {Object} [metadata]
   * @return {Promise<void>}
   */
  async trigger(reason, metadata = {}) {
    if (stryMutAct_9fa48("151387")) {
      {}
    } else {
      stryCov_9fa48("151387");
      if (stryMutAct_9fa48("151389") ? false : stryMutAct_9fa48("151388") ? true : (stryCov_9fa48("151388", "151389"), this._running)) {
        if (stryMutAct_9fa48("151390")) {
          {}
        } else {
          stryCov_9fa48("151390");
          this._rerunRequested = stryMutAct_9fa48("151391") ? false : (stryCov_9fa48("151391"), true);
          this._pendingTrigger = stryMutAct_9fa48("151392") ? {} : (stryCov_9fa48("151392"), {
            reason,
            metadata
          });
          return;
        }
      }
      await this._runCycle(reason, metadata);
    }
  }

  /**
   * Get immutable reconciliation stats.
   *
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("151393")) {
      {}
    } else {
      stryCov_9fa48("151393");
      return stryMutAct_9fa48("151394") ? {} : (stryCov_9fa48("151394"), {
        ...this._stats
      });
    }
  }

  /**
   * @param {number} [limit]
   * @return {Object[]}
   */
  getDecisionHistory(limit = DEFAULT_DECISION_HISTORY_LIMIT) {
    if (stryMutAct_9fa48("151395")) {
      {}
    } else {
      stryCov_9fa48("151395");
      const boundedLimit = Number.isFinite(limit) ? stryMutAct_9fa48("151396") ? Math.min(1, Math.min(MAX_DECISION_HISTORY_LIMIT, Math.floor(limit))) : (stryCov_9fa48("151396"), Math.max(1, stryMutAct_9fa48("151397") ? Math.max(MAX_DECISION_HISTORY_LIMIT, Math.floor(limit)) : (stryCov_9fa48("151397"), Math.min(MAX_DECISION_HISTORY_LIMIT, Math.floor(limit))))) : DEFAULT_DECISION_HISTORY_LIMIT;
      return stryMutAct_9fa48("151398") ? this._decisionHistory.map(decision => ({
        timestamp: decision.timestamp,
        reason: decision.reason,
        metadata: decision.metadata,
        action: decision.action,
        success: decision.success,
        durationMs: decision.durationMs || 0,
        operationId: decision.operationId || null,
        error: decision.error || null
      })) : (stryCov_9fa48("151398"), this._decisionHistory.slice(stryMutAct_9fa48("151399") ? +boundedLimit : (stryCov_9fa48("151399"), -boundedLimit)).map(stryMutAct_9fa48("151400") ? () => undefined : (stryCov_9fa48("151400"), decision => stryMutAct_9fa48("151401") ? {} : (stryCov_9fa48("151401"), {
        timestamp: decision.timestamp,
        reason: decision.reason,
        metadata: decision.metadata,
        action: decision.action,
        success: decision.success,
        durationMs: stryMutAct_9fa48("151404") ? decision.durationMs && 0 : stryMutAct_9fa48("151403") ? false : stryMutAct_9fa48("151402") ? true : (stryCov_9fa48("151402", "151403", "151404"), decision.durationMs || 0),
        operationId: stryMutAct_9fa48("151407") ? decision.operationId && null : stryMutAct_9fa48("151406") ? false : stryMutAct_9fa48("151405") ? true : (stryCov_9fa48("151405", "151406", "151407"), decision.operationId || null),
        error: stryMutAct_9fa48("151410") ? decision.error && null : stryMutAct_9fa48("151409") ? false : stryMutAct_9fa48("151408") ? true : (stryCov_9fa48("151408", "151409", "151410"), decision.error || null)
      }))));
    }
  }

  /**
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @return {Object}
   */
  getDiagnosticsReport(options = {}) {
    if (stryMutAct_9fa48("151411")) {
      {}
    } else {
      stryCov_9fa48("151411");
      return stryMutAct_9fa48("151412") ? {} : (stryCov_9fa48("151412"), {
        stats: this.getStats(),
        recentDecisions: this.getDecisionHistory(options.limit),
        lifecycleAdapterSelections: this._lifecycleManager.getAdapterSelectionReport ? this._lifecycleManager.getAdapterSelectionReport() : stryMutAct_9fa48("151413") ? {} : (stryCov_9fa48("151413"), {
          adapters: stryMutAct_9fa48("151414") ? ["Stryker was here"] : (stryCov_9fa48("151414"), [])
        })
      });
    }
  }

  /**
   * @param {Object} decision
   * @return {void}
   * @private
   */
  _recordDecisionHistory(decision) {
    if (stryMutAct_9fa48("151415")) {
      {}
    } else {
      stryCov_9fa48("151415");
      this._decisionHistory.push(stryMutAct_9fa48("151416") ? {} : (stryCov_9fa48("151416"), {
        timestamp: decision.timestamp,
        reason: decision.reason,
        metadata: decision.metadata,
        action: decision.action,
        success: decision.success,
        durationMs: stryMutAct_9fa48("151419") ? decision.durationMs && 0 : stryMutAct_9fa48("151418") ? false : stryMutAct_9fa48("151417") ? true : (stryCov_9fa48("151417", "151418", "151419"), decision.durationMs || 0),
        operationId: stryMutAct_9fa48("151422") ? decision.result?.operationId && null : stryMutAct_9fa48("151421") ? false : stryMutAct_9fa48("151420") ? true : (stryCov_9fa48("151420", "151421", "151422"), (stryMutAct_9fa48("151423") ? decision.result.operationId : (stryCov_9fa48("151423"), decision.result?.operationId)) || null),
        error: decision.error ? decision.error.message : null
      }));
      if (stryMutAct_9fa48("151427") ? this._decisionHistory.length <= MAX_DECISION_HISTORY_LIMIT : stryMutAct_9fa48("151426") ? this._decisionHistory.length >= MAX_DECISION_HISTORY_LIMIT : stryMutAct_9fa48("151425") ? false : stryMutAct_9fa48("151424") ? true : (stryCov_9fa48("151424", "151425", "151426", "151427"), this._decisionHistory.length > MAX_DECISION_HISTORY_LIMIT)) {
        if (stryMutAct_9fa48("151428")) {
          {}
        } else {
          stryCov_9fa48("151428");
          this._decisionHistory.shift();
        }
      }
    }
  }

  /**
   * Run one desired-vs-actual reconciliation cycle.
   *
   * @param {string} reason
   * @param {Object} metadata
   * @return {Promise<void>}
   * @private
   */
  async _runCycle(reason, metadata) {
    if (stryMutAct_9fa48("151429")) {
      {}
    } else {
      stryCov_9fa48("151429");
      this._running = stryMutAct_9fa48("151430") ? false : (stryCov_9fa48("151430"), true);
      try {
        if (stryMutAct_9fa48("151431")) {
          {}
        } else {
          stryCov_9fa48("151431");
          let nextReason = reason;
          let nextMetadata = metadata;
          do {
            if (stryMutAct_9fa48("151432")) {
              {}
            } else {
              stryCov_9fa48("151432");
              this._rerunRequested = stryMutAct_9fa48("151433") ? true : (stryCov_9fa48("151433"), false);
              this._pendingTrigger = null;
              const cycleStartedAt = Date.now();
              this._logger.debug(RECONCILER_LOG.CYCLE_START, stryMutAct_9fa48("151434") ? {} : (stryCov_9fa48("151434"), {
                reason: nextReason,
                metadata: nextMetadata,
                nodeId: stryMutAct_9fa48("151437") ? nextMetadata?.nodeId && null : stryMutAct_9fa48("151436") ? false : stryMutAct_9fa48("151435") ? true : (stryCov_9fa48("151435", "151436", "151437"), (stryMutAct_9fa48("151438") ? nextMetadata.nodeId : (stryCov_9fa48("151438"), nextMetadata?.nodeId)) || null)
              }));
              this.emit(RECONCILER_EVENT.CYCLE_START, stryMutAct_9fa48("151439") ? {} : (stryCov_9fa48("151439"), {
                reason: nextReason,
                metadata: nextMetadata
              }));
              const desiredRows = await this._desiredStateReader();
              const actualRows = await this._actualStateReader();
              const actions = this.planActions(desiredRows, actualRows);
              this.emit(RECONCILER_EVENT.PLAN_READY, stryMutAct_9fa48("151440") ? {} : (stryCov_9fa48("151440"), {
                reason: nextReason,
                metadata: nextMetadata,
                actionCount: actions.length,
                actions
              }));
              const execution = await this.executePlan(actions, stryMutAct_9fa48("151441") ? {} : (stryCov_9fa48("151441"), {
                reason: nextReason,
                metadata: nextMetadata
              }));
              const durationMs = stryMutAct_9fa48("151442") ? Date.now() + cycleStartedAt : (stryCov_9fa48("151442"), Date.now() - cycleStartedAt);
              stryMutAct_9fa48("151443") ? this._stats.cycleCount -= 1 : (stryCov_9fa48("151443"), this._stats.cycleCount += 1);
              stryMutAct_9fa48("151444") ? this._stats.cycleSuccessCount -= 1 : (stryCov_9fa48("151444"), this._stats.cycleSuccessCount += 1);
              this._stats.lastCycleDurationMs = durationMs;
              stryMutAct_9fa48("151445") ? this._stats.cycleLatencyMsTotal -= durationMs : (stryCov_9fa48("151445"), this._stats.cycleLatencyMsTotal += durationMs);
              this._stats.cycleLatencyMsMax = stryMutAct_9fa48("151446") ? Math.min(this._stats.cycleLatencyMsMax, durationMs) : (stryCov_9fa48("151446"), Math.max(this._stats.cycleLatencyMsMax, durationMs));
              this._stats.lastCycleAt = Date.now();
              this._stats.lastCycleReason = nextReason;
              this._stats.lastError = null;
              this.emit(RECONCILER_EVENT.CYCLE_COMPLETE, stryMutAct_9fa48("151447") ? {} : (stryCov_9fa48("151447"), {
                reason: nextReason,
                metadata: nextMetadata,
                durationMs,
                actionCount: actions.length,
                execution
              }));
              const cycleLogPayload = stryMutAct_9fa48("151448") ? {} : (stryCov_9fa48("151448"), {
                reason: nextReason,
                metadata: nextMetadata,
                durationMs,
                actionCount: actions.length,
                nodeId: stryMutAct_9fa48("151451") ? nextMetadata?.nodeId && null : stryMutAct_9fa48("151450") ? false : stryMutAct_9fa48("151449") ? true : (stryCov_9fa48("151449", "151450", "151451"), (stryMutAct_9fa48("151452") ? nextMetadata.nodeId : (stryCov_9fa48("151452"), nextMetadata?.nodeId)) || null)
              });
              if (stryMutAct_9fa48("151455") ? actions.length > 0 && nextReason !== 'interval' : stryMutAct_9fa48("151454") ? false : stryMutAct_9fa48("151453") ? true : (stryCov_9fa48("151453", "151454", "151455"), (stryMutAct_9fa48("151458") ? actions.length <= 0 : stryMutAct_9fa48("151457") ? actions.length >= 0 : stryMutAct_9fa48("151456") ? false : (stryCov_9fa48("151456", "151457", "151458"), actions.length > 0)) || (stryMutAct_9fa48("151460") ? nextReason === 'interval' : stryMutAct_9fa48("151459") ? false : (stryCov_9fa48("151459", "151460"), nextReason !== (stryMutAct_9fa48("151461") ? "" : (stryCov_9fa48("151461"), 'interval')))))) {
                if (stryMutAct_9fa48("151462")) {
                  {}
                } else {
                  stryCov_9fa48("151462");
                  this._logger.info(RECONCILER_LOG.CYCLE_COMPLETE, cycleLogPayload);
                }
              } else {
                if (stryMutAct_9fa48("151463")) {
                  {}
                } else {
                  stryCov_9fa48("151463");
                  this._logger.debug(RECONCILER_LOG.CYCLE_COMPLETE, cycleLogPayload);
                }
              }
              if (stryMutAct_9fa48("151466") ? this._rerunRequested || this._pendingTrigger : stryMutAct_9fa48("151465") ? false : stryMutAct_9fa48("151464") ? true : (stryCov_9fa48("151464", "151465", "151466"), this._rerunRequested && this._pendingTrigger)) {
                if (stryMutAct_9fa48("151467")) {
                  {}
                } else {
                  stryCov_9fa48("151467");
                  nextReason = this._pendingTrigger.reason;
                  nextMetadata = this._pendingTrigger.metadata;
                }
              }
            }
          } while (stryMutAct_9fa48("151469") ? this._rerunRequested || this._pendingTrigger : stryMutAct_9fa48("151468") ? false : (stryCov_9fa48("151468", "151469"), this._rerunRequested && this._pendingTrigger));
        }
      } catch (error) {
        if (stryMutAct_9fa48("151470")) {
          {}
        } else {
          stryCov_9fa48("151470");
          stryMutAct_9fa48("151471") ? this._stats.cycleFailureCount -= 1 : (stryCov_9fa48("151471"), this._stats.cycleFailureCount += 1);
          this._stats.lastError = error;
          this.emit(RECONCILER_EVENT.CYCLE_ERROR, stryMutAct_9fa48("151472") ? {} : (stryCov_9fa48("151472"), {
            reason,
            metadata,
            error
          }));
          this._logger.error(RECONCILER_LOG.CYCLE_ERROR, stryMutAct_9fa48("151473") ? {} : (stryCov_9fa48("151473"), {
            reason,
            metadata,
            nodeId: stryMutAct_9fa48("151476") ? metadata?.nodeId && null : stryMutAct_9fa48("151475") ? false : stryMutAct_9fa48("151474") ? true : (stryCov_9fa48("151474", "151475", "151476"), (stryMutAct_9fa48("151477") ? metadata.nodeId : (stryCov_9fa48("151477"), metadata?.nodeId)) || null),
            error: error.message
          }));
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("151478")) {
          {}
        } else {
          stryCov_9fa48("151478");
          this._running = stryMutAct_9fa48("151479") ? true : (stryCov_9fa48("151479"), false);
          this._pendingTrigger = null;
          this._rerunRequested = stryMutAct_9fa48("151480") ? true : (stryCov_9fa48("151480"), false);
        }
      }
    }
  }

  /**
   * Build deterministic reconciliation actions from desired/actual rows.
   *
   * @param {Object[]} desiredRows
   * @param {Object[]} actualRows
   * @return {Object[]}
   */
  planActions(desiredRows = stryMutAct_9fa48("151481") ? ["Stryker was here"] : (stryCov_9fa48("151481"), []), actualRows = stryMutAct_9fa48("151482") ? ["Stryker was here"] : (stryCov_9fa48("151482"), [])) {
    if (stryMutAct_9fa48("151483")) {
      {}
    } else {
      stryCov_9fa48("151483");
      const desiredByServiceId = new Map();
      for (const definition of desiredRows) {
        if (stryMutAct_9fa48("151484")) {
          {}
        } else {
          stryCov_9fa48("151484");
          const serviceId = resolveServiceId(definition);
          const serviceType = resolveServiceType(definition);
          if (stryMutAct_9fa48("151487") ? !serviceId && !serviceType : stryMutAct_9fa48("151486") ? false : stryMutAct_9fa48("151485") ? true : (stryCov_9fa48("151485", "151486", "151487"), (stryMutAct_9fa48("151488") ? serviceId : (stryCov_9fa48("151488"), !serviceId)) || (stryMutAct_9fa48("151489") ? serviceType : (stryCov_9fa48("151489"), !serviceType)))) {
            if (stryMutAct_9fa48("151490")) {
              {}
            } else {
              stryCov_9fa48("151490");
              continue;
            }
          }
          desiredByServiceId.set(serviceId, stryMutAct_9fa48("151491") ? {} : (stryCov_9fa48("151491"), {
            ...definition,
            [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
            [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType
          }));
        }
      }
      const actualByServiceId = new Map();
      for (const replica of actualRows) {
        if (stryMutAct_9fa48("151492")) {
          {}
        } else {
          stryCov_9fa48("151492");
          const serviceId = resolveServiceId(replica);
          const serviceType = resolveServiceType(replica);
          const replicaId = resolveReplicaId(replica);
          if (stryMutAct_9fa48("151495") ? (!serviceId || !serviceType) && !replicaId : stryMutAct_9fa48("151494") ? false : stryMutAct_9fa48("151493") ? true : (stryCov_9fa48("151493", "151494", "151495"), (stryMutAct_9fa48("151497") ? !serviceId && !serviceType : stryMutAct_9fa48("151496") ? false : (stryCov_9fa48("151496", "151497"), (stryMutAct_9fa48("151498") ? serviceId : (stryCov_9fa48("151498"), !serviceId)) || (stryMutAct_9fa48("151499") ? serviceType : (stryCov_9fa48("151499"), !serviceType)))) || (stryMutAct_9fa48("151500") ? replicaId : (stryCov_9fa48("151500"), !replicaId)))) {
            if (stryMutAct_9fa48("151501")) {
              {}
            } else {
              stryCov_9fa48("151501");
              continue;
            }
          }
          const normalizedReplica = cloneReplicaHandle(replica);
          if (stryMutAct_9fa48("151504") ? false : stryMutAct_9fa48("151503") ? true : stryMutAct_9fa48("151502") ? actualByServiceId.has(serviceId) : (stryCov_9fa48("151502", "151503", "151504"), !actualByServiceId.has(serviceId))) {
            if (stryMutAct_9fa48("151505")) {
              {}
            } else {
              stryCov_9fa48("151505");
              actualByServiceId.set(serviceId, stryMutAct_9fa48("151506") ? ["Stryker was here"] : (stryCov_9fa48("151506"), []));
            }
          }
          actualByServiceId.get(serviceId).push(normalizedReplica);
        }
      }
      const actions = stryMutAct_9fa48("151507") ? ["Stryker was here"] : (stryCov_9fa48("151507"), []);
      for (const [serviceId, definition] of desiredByServiceId.entries()) {
        if (stryMutAct_9fa48("151508")) {
          {}
        } else {
          stryCov_9fa48("151508");
          const replicas = stryMutAct_9fa48("151510") ? (actualByServiceId.get(serviceId) || []).sort(compareReplicasByReplicaId) : stryMutAct_9fa48("151509") ? (actualByServiceId.get(serviceId) || []).slice() : (stryCov_9fa48("151509", "151510"), (stryMutAct_9fa48("151513") ? actualByServiceId.get(serviceId) && [] : stryMutAct_9fa48("151512") ? false : stryMutAct_9fa48("151511") ? true : (stryCov_9fa48("151511", "151512", "151513"), actualByServiceId.get(serviceId) || (stryMutAct_9fa48("151514") ? ["Stryker was here"] : (stryCov_9fa48("151514"), [])))).slice().sort(compareReplicasByReplicaId));
          const runningReplicas = stryMutAct_9fa48("151515") ? replicas : (stryCov_9fa48("151515"), replicas.filter(stryMutAct_9fa48("151516") ? () => undefined : (stryCov_9fa48("151516"), replica => stryMutAct_9fa48("151519") ? resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING : stryMutAct_9fa48("151518") ? false : stryMutAct_9fa48("151517") ? true : (stryCov_9fa48("151517", "151518", "151519"), resolveLifecycleState(replica) === SERVICE_LIFECYCLE_STATE.RUNNING))));
          const nonRunningReplicas = stryMutAct_9fa48("151520") ? replicas : (stryCov_9fa48("151520"), replicas.filter(stryMutAct_9fa48("151521") ? () => undefined : (stryCov_9fa48("151521"), replica => stryMutAct_9fa48("151524") ? resolveLifecycleState(replica) === SERVICE_LIFECYCLE_STATE.RUNNING : stryMutAct_9fa48("151523") ? false : stryMutAct_9fa48("151522") ? true : (stryCov_9fa48("151522", "151523", "151524"), resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING))));
          const desiredReplicaCount = resolveReplicaCount(definition);
          if (stryMutAct_9fa48("151528") ? runningReplicas.length <= desiredReplicaCount : stryMutAct_9fa48("151527") ? runningReplicas.length >= desiredReplicaCount : stryMutAct_9fa48("151526") ? false : stryMutAct_9fa48("151525") ? true : (stryCov_9fa48("151525", "151526", "151527", "151528"), runningReplicas.length > desiredReplicaCount)) {
            if (stryMutAct_9fa48("151529")) {
              {}
            } else {
              stryCov_9fa48("151529");
              const stopCandidates = stryMutAct_9fa48("151533") ? runningReplicas.sort(compareReplicasByReplicaId).reverse().slice(0, runningReplicas.length - desiredReplicaCount) : stryMutAct_9fa48("151532") ? runningReplicas.slice().reverse().slice(0, runningReplicas.length - desiredReplicaCount) : stryMutAct_9fa48("151531") ? runningReplicas.slice().sort(compareReplicasByReplicaId).slice(0, runningReplicas.length - desiredReplicaCount) : stryMutAct_9fa48("151530") ? runningReplicas.slice().sort(compareReplicasByReplicaId).reverse() : (stryCov_9fa48("151530", "151531", "151532", "151533"), runningReplicas.slice().sort(compareReplicasByReplicaId).reverse().slice(0, stryMutAct_9fa48("151534") ? runningReplicas.length + desiredReplicaCount : (stryCov_9fa48("151534"), runningReplicas.length - desiredReplicaCount)));
              for (const replica of stopCandidates) {
                if (stryMutAct_9fa48("151535")) {
                  {}
                } else {
                  stryCov_9fa48("151535");
                  actions.push(stryMutAct_9fa48("151536") ? {} : (stryCov_9fa48("151536"), {
                    type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
                    driftReason: RECONCILER_DRIFT_REASON.ABOVE_TARGET,
                    definition,
                    replica
                  }));
                }
              }
            }
          }
          if (stryMutAct_9fa48("151540") ? runningReplicas.length >= desiredReplicaCount : stryMutAct_9fa48("151539") ? runningReplicas.length <= desiredReplicaCount : stryMutAct_9fa48("151538") ? false : stryMutAct_9fa48("151537") ? true : (stryCov_9fa48("151537", "151538", "151539", "151540"), runningReplicas.length < desiredReplicaCount)) {
            if (stryMutAct_9fa48("151541")) {
              {}
            } else {
              stryCov_9fa48("151541");
              let missingCount = stryMutAct_9fa48("151542") ? desiredReplicaCount + runningReplicas.length : (stryCov_9fa48("151542"), desiredReplicaCount - runningReplicas.length);
              for (const replica of nonRunningReplicas) {
                if (stryMutAct_9fa48("151543")) {
                  {}
                } else {
                  stryCov_9fa48("151543");
                  if (stryMutAct_9fa48("151547") ? missingCount > 0 : stryMutAct_9fa48("151546") ? missingCount < 0 : stryMutAct_9fa48("151545") ? false : stryMutAct_9fa48("151544") ? true : (stryCov_9fa48("151544", "151545", "151546", "151547"), missingCount <= 0)) {
                    if (stryMutAct_9fa48("151548")) {
                      {}
                    } else {
                      stryCov_9fa48("151548");
                      break;
                    }
                  }
                  actions.push(stryMutAct_9fa48("151549") ? {} : (stryCov_9fa48("151549"), {
                    type: RECONCILER_ACTION_TYPE.START_REPLICA,
                    driftReason: RECONCILER_DRIFT_REASON.NON_RUNNING_REPLICA,
                    definition,
                    replica
                  }));
                  stryMutAct_9fa48("151550") ? missingCount += 1 : (stryCov_9fa48("151550"), missingCount -= 1);
                }
              }
              if (stryMutAct_9fa48("151554") ? missingCount <= 0 : stryMutAct_9fa48("151553") ? missingCount >= 0 : stryMutAct_9fa48("151552") ? false : stryMutAct_9fa48("151551") ? true : (stryCov_9fa48("151551", "151552", "151553", "151554"), missingCount > 0)) {
                if (stryMutAct_9fa48("151555")) {
                  {}
                } else {
                  stryCov_9fa48("151555");
                  const knownReplicaIds = new Set(replicas.map(stryMutAct_9fa48("151556") ? () => undefined : (stryCov_9fa48("151556"), replica => resolveReplicaId(replica))));
                  for (let index = 1; stryMutAct_9fa48("151559") ? index > missingCount : stryMutAct_9fa48("151558") ? index < missingCount : stryMutAct_9fa48("151557") ? false : (stryCov_9fa48("151557", "151558", "151559"), index <= missingCount); stryMutAct_9fa48("151560") ? index-- : (stryCov_9fa48("151560"), index++)) {
                    if (stryMutAct_9fa48("151561")) {
                      {}
                    } else {
                      stryCov_9fa48("151561");
                      let suffix = index;
                      let candidateReplicaId = stryMutAct_9fa48("151562") ? `` : (stryCov_9fa48("151562"), `${serviceId}-replica-${suffix}`);
                      while (stryMutAct_9fa48("151563") ? false : (stryCov_9fa48("151563"), knownReplicaIds.has(candidateReplicaId))) {
                        if (stryMutAct_9fa48("151564")) {
                          {}
                        } else {
                          stryCov_9fa48("151564");
                          stryMutAct_9fa48("151565") ? suffix -= 1 : (stryCov_9fa48("151565"), suffix += 1);
                          candidateReplicaId = stryMutAct_9fa48("151566") ? `` : (stryCov_9fa48("151566"), `${serviceId}-replica-${suffix}`);
                        }
                      }
                      knownReplicaIds.add(candidateReplicaId);
                      const newReplica = stryMutAct_9fa48("151567") ? {} : (stryCov_9fa48("151567"), {
                        [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
                        [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(definition),
                        [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(definition),
                        [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: candidateReplicaId,
                        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: SERVICE_LIFECYCLE_STATE.CREATED
                      });
                      actions.push(stryMutAct_9fa48("151568") ? {} : (stryCov_9fa48("151568"), {
                        type: RECONCILER_ACTION_TYPE.CREATE_START_REPLICA,
                        driftReason: RECONCILER_DRIFT_REASON.BELOW_TARGET,
                        definition,
                        replica: newReplica
                      }));
                    }
                  }
                }
              }
            }
          }
        }
      }
      for (const [serviceId, replicas] of actualByServiceId.entries()) {
        if (stryMutAct_9fa48("151569")) {
          {}
        } else {
          stryCov_9fa48("151569");
          if (stryMutAct_9fa48("151571") ? false : stryMutAct_9fa48("151570") ? true : (stryCov_9fa48("151570", "151571"), desiredByServiceId.has(serviceId))) {
            if (stryMutAct_9fa48("151572")) {
              {}
            } else {
              stryCov_9fa48("151572");
              continue;
            }
          }
          for (const replica of stryMutAct_9fa48("151574") ? replicas.sort(compareReplicasByReplicaId) : stryMutAct_9fa48("151573") ? replicas.slice() : (stryCov_9fa48("151573", "151574"), replicas.slice().sort(compareReplicasByReplicaId))) {
            if (stryMutAct_9fa48("151575")) {
              {}
            } else {
              stryCov_9fa48("151575");
              if (stryMutAct_9fa48("151578") ? resolveLifecycleState(replica) === SERVICE_LIFECYCLE_STATE.RUNNING : stryMutAct_9fa48("151577") ? false : stryMutAct_9fa48("151576") ? true : (stryCov_9fa48("151576", "151577", "151578"), resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING)) {
                if (stryMutAct_9fa48("151579")) {
                  {}
                } else {
                  stryCov_9fa48("151579");
                  continue;
                }
              }
              actions.push(stryMutAct_9fa48("151580") ? {} : (stryCov_9fa48("151580"), {
                type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
                driftReason: RECONCILER_DRIFT_REASON.SERVICE_REMOVED,
                definition: stryMutAct_9fa48("151581") ? {} : (stryCov_9fa48("151581"), {
                  [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: resolveServiceId(replica),
                  [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(replica),
                  [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(replica),
                  [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: 0
                }),
                replica
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("151582") ? actions : (stryCov_9fa48("151582"), actions.sort(compareActionsDeterministically));
    }
  }

  /**
   * Execute one reconciliation action plan using lifecycle manager only.
   *
   * @param {Object[]} actions
   * @param {Object} context
   * @return {Promise<Object[]>}
   */
  async executePlan(actions, context) {
    if (stryMutAct_9fa48("151583")) {
      {}
    } else {
      stryCov_9fa48("151583");
      const execution = stryMutAct_9fa48("151584") ? new Array() : (stryCov_9fa48("151584"), new Array(actions.length));
      const actionsByServiceId = new Map();
      for (let index = 0; stryMutAct_9fa48("151587") ? index >= actions.length : stryMutAct_9fa48("151586") ? index <= actions.length : stryMutAct_9fa48("151585") ? false : (stryCov_9fa48("151585", "151586", "151587"), index < actions.length); stryMutAct_9fa48("151588") ? index-- : (stryCov_9fa48("151588"), index++)) {
        if (stryMutAct_9fa48("151589")) {
          {}
        } else {
          stryCov_9fa48("151589");
          const action = actions[index];
          const actionServiceId = stryMutAct_9fa48("151592") ? resolveServiceId(action.definition || action.replica) && `action-${index}` : stryMutAct_9fa48("151591") ? false : stryMutAct_9fa48("151590") ? true : (stryCov_9fa48("151590", "151591", "151592"), resolveServiceId(stryMutAct_9fa48("151595") ? action.definition && action.replica : stryMutAct_9fa48("151594") ? false : stryMutAct_9fa48("151593") ? true : (stryCov_9fa48("151593", "151594", "151595"), action.definition || action.replica)) || (stryMutAct_9fa48("151596") ? `` : (stryCov_9fa48("151596"), `action-${index}`)));
          if (stryMutAct_9fa48("151599") ? false : stryMutAct_9fa48("151598") ? true : stryMutAct_9fa48("151597") ? actionsByServiceId.has(actionServiceId) : (stryCov_9fa48("151597", "151598", "151599"), !actionsByServiceId.has(actionServiceId))) {
            if (stryMutAct_9fa48("151600")) {
              {}
            } else {
              stryCov_9fa48("151600");
              actionsByServiceId.set(actionServiceId, stryMutAct_9fa48("151601") ? ["Stryker was here"] : (stryCov_9fa48("151601"), []));
            }
          }
          actionsByServiceId.get(actionServiceId).push(stryMutAct_9fa48("151602") ? {} : (stryCov_9fa48("151602"), {
            action,
            index
          }));
        }
      }
      const serviceActionQueues = stryMutAct_9fa48("151603") ? [] : (stryCov_9fa48("151603"), [...actionsByServiceId.values()]);
      let nextQueueIndex = 0;
      const workerCount = stryMutAct_9fa48("151604") ? Math.max(this._maxConcurrentServiceActions, serviceActionQueues.length) : (stryCov_9fa48("151604"), Math.min(this._maxConcurrentServiceActions, serviceActionQueues.length));
      const workers = stryMutAct_9fa48("151605") ? ["Stryker was here"] : (stryCov_9fa48("151605"), []);
      for (let workerIndex = 0; stryMutAct_9fa48("151608") ? workerIndex >= workerCount : stryMutAct_9fa48("151607") ? workerIndex <= workerCount : stryMutAct_9fa48("151606") ? false : (stryCov_9fa48("151606", "151607", "151608"), workerIndex < workerCount); stryMutAct_9fa48("151609") ? workerIndex-- : (stryCov_9fa48("151609"), workerIndex++)) {
        if (stryMutAct_9fa48("151610")) {
          {}
        } else {
          stryCov_9fa48("151610");
          workers.push((async () => {
            if (stryMutAct_9fa48("151611")) {
              {}
            } else {
              stryCov_9fa48("151611");
              while (stryMutAct_9fa48("151614") ? nextQueueIndex >= serviceActionQueues.length : stryMutAct_9fa48("151613") ? nextQueueIndex <= serviceActionQueues.length : stryMutAct_9fa48("151612") ? false : (stryCov_9fa48("151612", "151613", "151614"), nextQueueIndex < serviceActionQueues.length)) {
                if (stryMutAct_9fa48("151615")) {
                  {}
                } else {
                  stryCov_9fa48("151615");
                  const queueIndex = nextQueueIndex;
                  stryMutAct_9fa48("151616") ? nextQueueIndex -= 1 : (stryCov_9fa48("151616"), nextQueueIndex += 1);
                  const actionQueue = serviceActionQueues[queueIndex];
                  for (const actionEntry of actionQueue) {
                    if (stryMutAct_9fa48("151617")) {
                      {}
                    } else {
                      stryCov_9fa48("151617");
                      execution[actionEntry.index] = await this._executeAction(actionEntry.action, context);
                    }
                  }
                }
              }
            }
          })());
        }
      }
      await Promise.all(workers);
      return execution;
    }
  }

  /**
   * Execute one reconciliation action and emit decision telemetry.
   *
   * @param {Object} action
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async _executeAction(action, context) {
    if (stryMutAct_9fa48("151618")) {
      {}
    } else {
      stryCov_9fa48("151618");
      const actionStartedAt = Date.now();
      const serviceContext = stryMutAct_9fa48("151621") ? (action.definition || action.replica) && {} : stryMutAct_9fa48("151620") ? false : stryMutAct_9fa48("151619") ? true : (stryCov_9fa48("151619", "151620", "151621"), (stryMutAct_9fa48("151623") ? action.definition && action.replica : stryMutAct_9fa48("151622") ? false : (stryCov_9fa48("151622", "151623"), action.definition || action.replica)) || {});
      stryMutAct_9fa48("151624") ? this._stats.actionCount -= 1 : (stryCov_9fa48("151624"), this._stats.actionCount += 1);
      const decision = stryMutAct_9fa48("151625") ? {} : (stryCov_9fa48("151625"), {
        timestamp: Date.now(),
        reason: context.reason,
        metadata: context.metadata,
        action,
        success: stryMutAct_9fa48("151626") ? true : (stryCov_9fa48("151626"), false),
        result: null,
        error: null
      });
      try {
        if (stryMutAct_9fa48("151627")) {
          {}
        } else {
          stryCov_9fa48("151627");
          await this._enforcePlacementPolicy(action, context);
          decision.result = await this._executeLifecycleAction(action, context);
          decision.success = stryMutAct_9fa48("151628") ? false : (stryCov_9fa48("151628"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("151629")) {
          {}
        } else {
          stryCov_9fa48("151629");
          decision.error = error;
        }
      }
      const durationMs = stryMutAct_9fa48("151630") ? Date.now() + actionStartedAt : (stryCov_9fa48("151630"), Date.now() - actionStartedAt);
      decision.durationMs = durationMs;
      this._stats.lastActionDurationMs = durationMs;
      stryMutAct_9fa48("151631") ? this._stats.actionLatencyMsTotal -= durationMs : (stryCov_9fa48("151631"), this._stats.actionLatencyMsTotal += durationMs);
      this._stats.actionLatencyMsMax = stryMutAct_9fa48("151632") ? Math.min(this._stats.actionLatencyMsMax, durationMs) : (stryCov_9fa48("151632"), Math.max(this._stats.actionLatencyMsMax, durationMs));
      if (stryMutAct_9fa48("151634") ? false : stryMutAct_9fa48("151633") ? true : (stryCov_9fa48("151633", "151634"), decision.success)) {
        if (stryMutAct_9fa48("151635")) {
          {}
        } else {
          stryCov_9fa48("151635");
          stryMutAct_9fa48("151636") ? this._stats.actionSuccessCount -= 1 : (stryCov_9fa48("151636"), this._stats.actionSuccessCount += 1);
        }
      } else {
        if (stryMutAct_9fa48("151637")) {
          {}
        } else {
          stryCov_9fa48("151637");
          stryMutAct_9fa48("151638") ? this._stats.actionFailureCount -= 1 : (stryCov_9fa48("151638"), this._stats.actionFailureCount += 1);
        }
      }
      this._recordDecisionHistory(decision);
      const decisionLog = stryMutAct_9fa48("151639") ? {} : (stryCov_9fa48("151639"), {
        reason: context.reason,
        driftReason: stryMutAct_9fa48("151642") ? action.driftReason && null : stryMutAct_9fa48("151641") ? false : stryMutAct_9fa48("151640") ? true : (stryCov_9fa48("151640", "151641", "151642"), action.driftReason || null),
        actionType: action.type,
        success: decision.success,
        durationMs,
        serviceId: resolveServiceId(serviceContext),
        serviceType: resolveServiceType(serviceContext),
        runtimeKind: resolveRuntimeKind(serviceContext),
        operationId: stryMutAct_9fa48("151645") ? decision.result?.operationId && null : stryMutAct_9fa48("151644") ? false : stryMutAct_9fa48("151643") ? true : (stryCov_9fa48("151643", "151644", "151645"), (stryMutAct_9fa48("151646") ? decision.result.operationId : (stryCov_9fa48("151646"), decision.result?.operationId)) || null),
        nodeId: stryMutAct_9fa48("151649") ? context.metadata?.nodeId && null : stryMutAct_9fa48("151648") ? false : stryMutAct_9fa48("151647") ? true : (stryCov_9fa48("151647", "151648", "151649"), (stryMutAct_9fa48("151650") ? context.metadata.nodeId : (stryCov_9fa48("151650"), context.metadata?.nodeId)) || null)
      });
      if (stryMutAct_9fa48("151652") ? false : stryMutAct_9fa48("151651") ? true : (stryCov_9fa48("151651", "151652"), decision.error)) {
        if (stryMutAct_9fa48("151653")) {
          {}
        } else {
          stryCov_9fa48("151653");
          decisionLog.error = decision.error.message;
        }
      }
      this._logger.info(RECONCILER_LOG.DECISION, decisionLog);
      this.emit(RECONCILER_EVENT.DECISION, decision);
      if (stryMutAct_9fa48("151655") ? false : stryMutAct_9fa48("151654") ? true : (stryCov_9fa48("151654", "151655"), this._telemetrySink)) {
        if (stryMutAct_9fa48("151656")) {
          {}
        } else {
          stryCov_9fa48("151656");
          this._telemetrySink(decision);
        }
      }
      return decision;
    }
  }

  /**
   * Execute one lifecycle action through the canonical action dispatcher.
   *
   * @param {Object} action
   * @param {Object} context
   * @return {Promise<Object|null>}
   * @private
   */
  async _executeLifecycleAction(action, context) {
    if (stryMutAct_9fa48("151657")) {
      {}
    } else {
      stryCov_9fa48("151657");
      switch (action.type) {
        case RECONCILER_ACTION_TYPE.STOP_REPLICA:
          if (stryMutAct_9fa48("151658")) {} else {
            stryCov_9fa48("151658");
            return await this._lifecycleManager.stopReplica(action.replica, stryMutAct_9fa48("151659") ? {} : (stryCov_9fa48("151659"), {
              reason: context.reason,
              driftReason: action.driftReason
            }));
          }
        case RECONCILER_ACTION_TYPE.START_REPLICA:
          if (stryMutAct_9fa48("151660")) {} else {
            stryCov_9fa48("151660");
            return await this._lifecycleManager.startReplica(action.replica, stryMutAct_9fa48("151661") ? {} : (stryCov_9fa48("151661"), {
              reason: context.reason,
              driftReason: action.driftReason
            }));
          }
        case RECONCILER_ACTION_TYPE.CREATE_START_REPLICA:
          if (stryMutAct_9fa48("151662")) {} else {
            stryCov_9fa48("151662");
            await this._lifecycleManager.createReplica(stryMutAct_9fa48("151663") ? {} : (stryCov_9fa48("151663"), {
              ...action.definition,
              [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: resolveReplicaId(action.replica)
            }), stryMutAct_9fa48("151664") ? {} : (stryCov_9fa48("151664"), {
              reason: context.reason,
              driftReason: action.driftReason
            }));
            return await this._lifecycleManager.startReplica(action.replica, stryMutAct_9fa48("151665") ? {} : (stryCov_9fa48("151665"), {
              reason: context.reason,
              driftReason: action.driftReason
            }));
          }
        default:
          if (stryMutAct_9fa48("151666")) {} else {
            stryCov_9fa48("151666");
            return null;
          }
      }
    }
  }

  /**
   * Enforce placement policy checks for one reconcile action.
   *
   * @param {Object} action
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async _enforcePlacementPolicy(action, context) {
    if (stryMutAct_9fa48("151667")) {
      {}
    } else {
      stryCov_9fa48("151667");
      const serviceId = stryMutAct_9fa48("151670") ? resolveServiceId(action?.definition || action?.replica) && 'unknown' : stryMutAct_9fa48("151669") ? false : stryMutAct_9fa48("151668") ? true : (stryCov_9fa48("151668", "151669", "151670"), resolveServiceId(stryMutAct_9fa48("151673") ? action?.definition && action?.replica : stryMutAct_9fa48("151672") ? false : stryMutAct_9fa48("151671") ? true : (stryCov_9fa48("151671", "151672", "151673"), (stryMutAct_9fa48("151674") ? action.definition : (stryCov_9fa48("151674"), action?.definition)) || (stryMutAct_9fa48("151675") ? action.replica : (stryCov_9fa48("151675"), action?.replica)))) || (stryMutAct_9fa48("151676") ? "" : (stryCov_9fa48("151676"), 'unknown')));
      try {
        if (stryMutAct_9fa48("151677")) {
          {}
        } else {
          stryCov_9fa48("151677");
          await this._placementPolicyCheck(stryMutAct_9fa48("151678") ? {} : (stryCov_9fa48("151678"), {
            action,
            reason: context.reason,
            metadata: context.metadata
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("151679")) {
          {}
        } else {
          stryCov_9fa48("151679");
          throw new ServicePolicyViolationError(RECONCILER_POLICY_TYPE.PLACEMENT, stryMutAct_9fa48("151682") ? context.reason && 'reconcile' : stryMutAct_9fa48("151681") ? false : stryMutAct_9fa48("151680") ? true : (stryCov_9fa48("151680", "151681", "151682"), context.reason || (stryMutAct_9fa48("151683") ? "" : (stryCov_9fa48("151683"), 'reconcile'))), serviceId, error.message, stryMutAct_9fa48("151684") ? {} : (stryCov_9fa48("151684"), {
            cause: error
          }));
        }
      }
    }
  }

  /**
   * Attach event-triggered reconcile handlers.
   *
   * @return {void}
   * @private
   */
  _bindEventTriggers() {
    if (stryMutAct_9fa48("151685")) {
      {}
    } else {
      stryCov_9fa48("151685");
      if (stryMutAct_9fa48("151688") ? false : stryMutAct_9fa48("151687") ? true : stryMutAct_9fa48("151686") ? this._eventSource : (stryCov_9fa48("151686", "151687", "151688"), !this._eventSource)) {
        if (stryMutAct_9fa48("151689")) {
          {}
        } else {
          stryCov_9fa48("151689");
          return;
        }
      }
      for (const eventName of this._eventNames) {
        if (stryMutAct_9fa48("151690")) {
          {}
        } else {
          stryCov_9fa48("151690");
          const handler = () => {
            if (stryMutAct_9fa48("151691")) {
              {}
            } else {
              stryCov_9fa48("151691");
              this.trigger(stryMutAct_9fa48("151692") ? "" : (stryCov_9fa48("151692"), 'event'), stryMutAct_9fa48("151693") ? {} : (stryCov_9fa48("151693"), {
                eventName
              }));
            }
          };
          this._eventHandlers.set(eventName, handler);
          this._eventSource.on(eventName, handler);
        }
      }
    }
  }

  /**
   * Detach event-triggered reconcile handlers.
   *
   * @return {void}
   * @private
   */
  _unbindEventTriggers() {
    if (stryMutAct_9fa48("151694")) {
      {}
    } else {
      stryCov_9fa48("151694");
      if (stryMutAct_9fa48("151697") ? false : stryMutAct_9fa48("151696") ? true : stryMutAct_9fa48("151695") ? this._eventSource : (stryCov_9fa48("151695", "151696", "151697"), !this._eventSource)) {
        if (stryMutAct_9fa48("151698")) {
          {}
        } else {
          stryCov_9fa48("151698");
          return;
        }
      }
      for (const [eventName, handler] of this._eventHandlers.entries()) {
        if (stryMutAct_9fa48("151699")) {
          {}
        } else {
          stryCov_9fa48("151699");
          this._eventSource.off(eventName, handler);
        }
      }
      this._eventHandlers.clear();
    }
  }
}
export { RECONCILER_ACTION_TYPE, RECONCILER_DRIFT_REASON, RECONCILER_EVENT, ServiceReconciler };