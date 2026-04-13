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
import { TIMEOUT_BUDGET_CLASSIFICATION } from '../control-plane/timeout-budget.js';
import { STORAGE_ADMISSION_DECISION_TYPE, STORAGE_ADMISSION_REASON } from '../rebalancer/storage-admission-constants.js';
import { QUERY_ERROR_MSG } from '../query/query-constants.js';
import { PARTITION_TRANSITION_METADATA_FIELD, PARTITION_TRANSITION_STATE, RETRYABLE_PARTITION_TRANSITION_STATES } from './partition-constants.js';
const RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET = new Set(stryMutAct_9fa48("97680") ? [] : (stryCov_9fa48("97680"), [TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT, TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT]));
function normalizeManagedSplitExecutionFailureMessage(errorOrFailure) {
  if (stryMutAct_9fa48("97681")) {
    {}
  } else {
    stryCov_9fa48("97681");
    return stryMutAct_9fa48("97682") ? String(errorOrFailure?.message || '').toUpperCase() : (stryCov_9fa48("97682"), String(stryMutAct_9fa48("97685") ? errorOrFailure?.message && '' : stryMutAct_9fa48("97684") ? false : stryMutAct_9fa48("97683") ? true : (stryCov_9fa48("97683", "97684", "97685"), (stryMutAct_9fa48("97686") ? errorOrFailure.message : (stryCov_9fa48("97686"), errorOrFailure?.message)) || (stryMutAct_9fa48("97687") ? "Stryker was here!" : (stryCov_9fa48("97687"), '')))).toLowerCase());
  }
}
function resolveManagedSplitRetryableTimeoutClassification(timeoutClassification) {
  if (stryMutAct_9fa48("97688")) {
    {}
  } else {
    stryCov_9fa48("97688");
    if (stryMutAct_9fa48("97691") ? !timeoutClassification && typeof timeoutClassification !== 'object' : stryMutAct_9fa48("97690") ? false : stryMutAct_9fa48("97689") ? true : (stryCov_9fa48("97689", "97690", "97691"), (stryMutAct_9fa48("97692") ? timeoutClassification : (stryCov_9fa48("97692"), !timeoutClassification)) || (stryMutAct_9fa48("97694") ? typeof timeoutClassification === 'object' : stryMutAct_9fa48("97693") ? false : (stryCov_9fa48("97693", "97694"), typeof timeoutClassification !== (stryMutAct_9fa48("97695") ? "" : (stryCov_9fa48("97695"), 'object')))))) {
      if (stryMutAct_9fa48("97696")) {
        {}
      } else {
        stryCov_9fa48("97696");
        return null;
      }
    }
    const classification = String(stryMutAct_9fa48("97699") ? timeoutClassification.classification && '' : stryMutAct_9fa48("97698") ? false : stryMutAct_9fa48("97697") ? true : (stryCov_9fa48("97697", "97698", "97699"), timeoutClassification.classification || (stryMutAct_9fa48("97700") ? "Stryker was here!" : (stryCov_9fa48("97700"), ''))));
    const originalClassification = String(stryMutAct_9fa48("97703") ? timeoutClassification.originalClassification && '' : stryMutAct_9fa48("97702") ? false : stryMutAct_9fa48("97701") ? true : (stryCov_9fa48("97701", "97702", "97703"), timeoutClassification.originalClassification || (stryMutAct_9fa48("97704") ? "Stryker was here!" : (stryCov_9fa48("97704"), ''))));
    if (stryMutAct_9fa48("97706") ? false : stryMutAct_9fa48("97705") ? true : (stryCov_9fa48("97705", "97706"), RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET.has(classification))) {
      if (stryMutAct_9fa48("97707")) {
        {}
      } else {
        stryCov_9fa48("97707");
        return classification;
      }
    }
    if (stryMutAct_9fa48("97710") ? classification === TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT || RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET.has(originalClassification) : stryMutAct_9fa48("97709") ? false : stryMutAct_9fa48("97708") ? true : (stryCov_9fa48("97708", "97709", "97710"), (stryMutAct_9fa48("97712") ? classification !== TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT : stryMutAct_9fa48("97711") ? true : (stryCov_9fa48("97711", "97712"), classification === TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT)) && RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET.has(originalClassification))) {
      if (stryMutAct_9fa48("97713")) {
        {}
      } else {
        stryCov_9fa48("97713");
        return originalClassification;
      }
    }
    return null;
  }
}
function isRetryableManagedSplitExecutionFailure(errorOrFailure) {
  if (stryMutAct_9fa48("97714")) {
    {}
  } else {
    stryCov_9fa48("97714");
    if (stryMutAct_9fa48("97717") ? !errorOrFailure && typeof errorOrFailure !== 'object' : stryMutAct_9fa48("97716") ? false : stryMutAct_9fa48("97715") ? true : (stryCov_9fa48("97715", "97716", "97717"), (stryMutAct_9fa48("97718") ? errorOrFailure : (stryCov_9fa48("97718"), !errorOrFailure)) || (stryMutAct_9fa48("97720") ? typeof errorOrFailure === 'object' : stryMutAct_9fa48("97719") ? false : (stryCov_9fa48("97719", "97720"), typeof errorOrFailure !== (stryMutAct_9fa48("97721") ? "" : (stryCov_9fa48("97721"), 'object')))))) {
      if (stryMutAct_9fa48("97722")) {
        {}
      } else {
        stryCov_9fa48("97722");
        return stryMutAct_9fa48("97723") ? true : (stryCov_9fa48("97723"), false);
      }
    }
    if (stryMutAct_9fa48("97726") ? errorOrFailure.retryable !== true : stryMutAct_9fa48("97725") ? false : stryMutAct_9fa48("97724") ? true : (stryCov_9fa48("97724", "97725", "97726"), errorOrFailure.retryable === (stryMutAct_9fa48("97727") ? false : (stryCov_9fa48("97727"), true)))) {
      if (stryMutAct_9fa48("97728")) {
        {}
      } else {
        stryCov_9fa48("97728");
        return stryMutAct_9fa48("97729") ? false : (stryCov_9fa48("97729"), true);
      }
    }
    if (stryMutAct_9fa48("97731") ? false : stryMutAct_9fa48("97730") ? true : (stryCov_9fa48("97730", "97731"), resolveManagedSplitRetryableTimeoutClassification(errorOrFailure.timeoutClassification))) {
      if (stryMutAct_9fa48("97732")) {
        {}
      } else {
        stryCov_9fa48("97732");
        return stryMutAct_9fa48("97733") ? false : (stryCov_9fa48("97733"), true);
      }
    }
    const message = normalizeManagedSplitExecutionFailureMessage(errorOrFailure);
    if (stryMutAct_9fa48("97736") ? false : stryMutAct_9fa48("97735") ? true : stryMutAct_9fa48("97734") ? message : (stryCov_9fa48("97734", "97735", "97736"), !message)) {
      if (stryMutAct_9fa48("97737")) {
        {}
      } else {
        stryCov_9fa48("97737");
        return stryMutAct_9fa48("97738") ? true : (stryCov_9fa48("97738"), false);
      }
    }
    return stryMutAct_9fa48("97741") ? (message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase()) || message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED)) && message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY) : stryMutAct_9fa48("97740") ? false : stryMutAct_9fa48("97739") ? true : (stryCov_9fa48("97739", "97740", "97741"), (stryMutAct_9fa48("97743") ? (message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase()) || message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY)) && message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED) : stryMutAct_9fa48("97742") ? false : (stryCov_9fa48("97742", "97743"), (stryMutAct_9fa48("97745") ? (message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase()) || message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY)) && message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) : stryMutAct_9fa48("97744") ? false : (stryCov_9fa48("97744", "97745"), (stryMutAct_9fa48("97747") ? (message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase())) && message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) : stryMutAct_9fa48("97746") ? false : (stryCov_9fa48("97746", "97747"), (stryMutAct_9fa48("97749") ? (message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase())) && message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase()) : stryMutAct_9fa48("97748") ? false : (stryCov_9fa48("97748", "97749"), (stryMutAct_9fa48("97751") ? (message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase())) && message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase()) : stryMutAct_9fa48("97750") ? false : (stryCov_9fa48("97750", "97751"), (stryMutAct_9fa48("97753") ? message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase()) && message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) : stryMutAct_9fa48("97752") ? false : (stryCov_9fa48("97752", "97753"), message.includes(stryMutAct_9fa48("97754") ? QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toUpperCase() : (stryCov_9fa48("97754"), QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX.toLowerCase())) || message.includes(stryMutAct_9fa48("97755") ? QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toUpperCase() : (stryCov_9fa48("97755"), QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase())))) || message.includes(stryMutAct_9fa48("97756") ? QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toUpperCase() : (stryCov_9fa48("97756"), QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase())))) || message.includes(stryMutAct_9fa48("97757") ? QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toUpperCase() : (stryCov_9fa48("97757"), QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase())))) || message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY))) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY))) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED))) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY));
  }
}
function resolveRetryableManagedSplitExecutionDecisionType(errorOrFailure) {
  if (stryMutAct_9fa48("97758")) {
    {}
  } else {
    stryCov_9fa48("97758");
    const message = normalizeManagedSplitExecutionFailureMessage(errorOrFailure);
    if (stryMutAct_9fa48("97760") ? false : stryMutAct_9fa48("97759") ? true : (stryCov_9fa48("97759", "97760"), resolveManagedSplitRetryableTimeoutClassification(stryMutAct_9fa48("97761") ? errorOrFailure.timeoutClassification : (stryCov_9fa48("97761"), errorOrFailure?.timeoutClassification)))) {
      if (stryMutAct_9fa48("97762")) {
        {}
      } else {
        stryCov_9fa48("97762");
        return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
      }
    }
    if (stryMutAct_9fa48("97765") ? (message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase())) && message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase()) : stryMutAct_9fa48("97764") ? false : stryMutAct_9fa48("97763") ? true : (stryCov_9fa48("97763", "97764", "97765"), (stryMutAct_9fa48("97767") ? (message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY) || message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase())) && message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase()) : stryMutAct_9fa48("97766") ? false : (stryCov_9fa48("97766", "97767"), (stryMutAct_9fa48("97769") ? (message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY)) && message.includes(QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase()) : stryMutAct_9fa48("97768") ? false : (stryCov_9fa48("97768", "97769"), (stryMutAct_9fa48("97771") ? (message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED)) && message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY) : stryMutAct_9fa48("97770") ? false : (stryCov_9fa48("97770", "97771"), (stryMutAct_9fa48("97773") ? (message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY)) && message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED) : stryMutAct_9fa48("97772") ? false : (stryCov_9fa48("97772", "97773"), (stryMutAct_9fa48("97775") ? message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) && message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) : stryMutAct_9fa48("97774") ? false : (stryCov_9fa48("97774", "97775"), message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) || message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY))) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED))) || message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY))) || message.includes(stryMutAct_9fa48("97776") ? QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toUpperCase() : (stryCov_9fa48("97776"), QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase())))) || message.includes(stryMutAct_9fa48("97777") ? QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toUpperCase() : (stryCov_9fa48("97777"), QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase())))) || message.includes(stryMutAct_9fa48("97778") ? QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toUpperCase() : (stryCov_9fa48("97778"), QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase())))) {
      if (stryMutAct_9fa48("97779")) {
        {}
      } else {
        stryCov_9fa48("97779");
        return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
      }
    }
    if (stryMutAct_9fa48("97781") ? false : stryMutAct_9fa48("97780") ? true : (stryCov_9fa48("97780", "97781"), message.includes(STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES))) {
      if (stryMutAct_9fa48("97782")) {
        {}
      } else {
        stryCov_9fa48("97782");
        return STORAGE_ADMISSION_DECISION_TYPE.BLOCKED;
      }
    }
    return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
  }
}
function isRetryableManagedSplitTransition(transition) {
  if (stryMutAct_9fa48("97783")) {
    {}
  } else {
    stryCov_9fa48("97783");
    if (stryMutAct_9fa48("97786") ? !transition && typeof transition !== 'object' : stryMutAct_9fa48("97785") ? false : stryMutAct_9fa48("97784") ? true : (stryCov_9fa48("97784", "97785", "97786"), (stryMutAct_9fa48("97787") ? transition : (stryCov_9fa48("97787"), !transition)) || (stryMutAct_9fa48("97789") ? typeof transition === 'object' : stryMutAct_9fa48("97788") ? false : (stryCov_9fa48("97788", "97789"), typeof transition !== (stryMutAct_9fa48("97790") ? "" : (stryCov_9fa48("97790"), 'object')))))) {
      if (stryMutAct_9fa48("97791")) {
        {}
      } else {
        stryCov_9fa48("97791");
        return stryMutAct_9fa48("97792") ? true : (stryCov_9fa48("97792"), false);
      }
    }
    const state = String(stryMutAct_9fa48("97795") ? (transition.state || transition.transitionState) && '' : stryMutAct_9fa48("97794") ? false : stryMutAct_9fa48("97793") ? true : (stryCov_9fa48("97793", "97794", "97795"), (stryMutAct_9fa48("97797") ? transition.state && transition.transitionState : stryMutAct_9fa48("97796") ? false : (stryCov_9fa48("97796", "97797"), transition.state || transition.transitionState)) || (stryMutAct_9fa48("97798") ? "Stryker was here!" : (stryCov_9fa48("97798"), ''))));
    if (stryMutAct_9fa48("97800") ? false : stryMutAct_9fa48("97799") ? true : (stryCov_9fa48("97799", "97800"), RETRYABLE_PARTITION_TRANSITION_STATES.has(state))) {
      if (stryMutAct_9fa48("97801")) {
        {}
      } else {
        stryCov_9fa48("97801");
        return stryMutAct_9fa48("97802") ? false : (stryCov_9fa48("97802"), true);
      }
    }
    if (stryMutAct_9fa48("97805") ? state === PARTITION_TRANSITION_STATE.FAILED : stryMutAct_9fa48("97804") ? false : stryMutAct_9fa48("97803") ? true : (stryCov_9fa48("97803", "97804", "97805"), state !== PARTITION_TRANSITION_STATE.FAILED)) {
      if (stryMutAct_9fa48("97806")) {
        {}
      } else {
        stryCov_9fa48("97806");
        return stryMutAct_9fa48("97807") ? true : (stryCov_9fa48("97807"), false);
      }
    }
    const metadata = (stryMutAct_9fa48("97810") ? transition.metadata || typeof transition.metadata === 'object' : stryMutAct_9fa48("97809") ? false : stryMutAct_9fa48("97808") ? true : (stryCov_9fa48("97808", "97809", "97810"), transition.metadata && (stryMutAct_9fa48("97812") ? typeof transition.metadata !== 'object' : stryMutAct_9fa48("97811") ? true : (stryCov_9fa48("97811", "97812"), typeof transition.metadata === (stryMutAct_9fa48("97813") ? "" : (stryCov_9fa48("97813"), 'object')))))) ? transition.metadata : {};
    return isRetryableManagedSplitExecutionFailure(metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE]);
  }
}
export { isRetryableManagedSplitExecutionFailure, isRetryableManagedSplitTransition, resolveRetryableManagedSplitExecutionDecisionType };