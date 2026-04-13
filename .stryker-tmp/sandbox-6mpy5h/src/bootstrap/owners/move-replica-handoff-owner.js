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
import { v4 as uuidv4 } from 'uuid';
import { ADDRESS, COLUMN, ENTITY_TYPE, HTTP_STATUS, SERVICE_STATUS, SERVICE_TYPE, STRING, TABLES, TYPEOF, WORKFLOW_STEP } from '../../constants/index.js';
import { MessageGroupAssignment } from '../message-group-assignment.js';
import { BOOTSTRAP_API_ASSIGNMENT, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_HANDOFF_OPERATION, BOOTSTRAP_API_HANDOFF_PHASE, BOOTSTRAP_API_HANDOFF_STATUS, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE } from '../bootstrap-api-constants.js';
import { BOOTSTRAP_PIPELINE_ERROR_CODE } from '../bootstrap-constants.js';
class MoveReplicaHandoffOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("22827")) {
      {}
    } else {
      stryCov_9fa48("22827");
      this.delegates = stryMutAct_9fa48("22830") ? options.delegates && {} : stryMutAct_9fa48("22829") ? false : stryMutAct_9fa48("22828") ? true : (stryCov_9fa48("22828", "22829", "22830"), options.delegates || {});
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("22831")) {
      {}
    } else {
      stryCov_9fa48("22831");
      return stryMutAct_9fa48("22834") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("22833") ? false : stryMutAct_9fa48("22832") ? true : (stryCov_9fa48("22832", "22833", "22834"), (stryMutAct_9fa48("22835") ? this.delegates.getLogger() : (stryCov_9fa48("22835"), this.delegates.getLogger?.())) || console);
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("22836")) {
      {}
    } else {
      stryCov_9fa48("22836");
      return stryMutAct_9fa48("22839") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("22838") ? false : stryMutAct_9fa48("22837") ? true : (stryCov_9fa48("22837", "22838", "22839"), (stryMutAct_9fa48("22840") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("22840"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getSeedNodeAddress() {
    if (stryMutAct_9fa48("22841")) {
      {}
    } else {
      stryCov_9fa48("22841");
      return stryMutAct_9fa48("22844") ? this.delegates.getSeedNodeAddress?.() && null : stryMutAct_9fa48("22843") ? false : stryMutAct_9fa48("22842") ? true : (stryCov_9fa48("22842", "22843", "22844"), (stryMutAct_9fa48("22845") ? this.delegates.getSeedNodeAddress() : (stryCov_9fa48("22845"), this.delegates.getSeedNodeAddress?.())) || null);
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("22846")) {
      {}
    } else {
      stryCov_9fa48("22846");
      return stryMutAct_9fa48("22849") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("22848") ? false : stryMutAct_9fa48("22847") ? true : (stryCov_9fa48("22847", "22848", "22849"), (stryMutAct_9fa48("22850") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("22850"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getMessageGroupServices() {
    if (stryMutAct_9fa48("22851")) {
      {}
    } else {
      stryCov_9fa48("22851");
      return stryMutAct_9fa48("22854") ? this.delegates.getMessageGroupServices?.() && null : stryMutAct_9fa48("22853") ? false : stryMutAct_9fa48("22852") ? true : (stryCov_9fa48("22852", "22853", "22854"), (stryMutAct_9fa48("22855") ? this.delegates.getMessageGroupServices() : (stryCov_9fa48("22855"), this.delegates.getMessageGroupServices?.())) || null);
    }
  }
  getMessageRouter() {
    if (stryMutAct_9fa48("22856")) {
      {}
    } else {
      stryCov_9fa48("22856");
      return stryMutAct_9fa48("22859") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("22858") ? false : stryMutAct_9fa48("22857") ? true : (stryCov_9fa48("22857", "22858", "22859"), (stryMutAct_9fa48("22860") ? this.delegates.getMessageRouter() : (stryCov_9fa48("22860"), this.delegates.getMessageRouter?.())) || null);
    }
  }
  getMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("22861")) {
      {}
    } else {
      stryCov_9fa48("22861");
      return stryMutAct_9fa48("22864") ? this.delegates.getMoveReplicaAssignmentReservations?.() && null : stryMutAct_9fa48("22863") ? false : stryMutAct_9fa48("22862") ? true : (stryCov_9fa48("22862", "22863", "22864"), (stryMutAct_9fa48("22865") ? this.delegates.getMoveReplicaAssignmentReservations() : (stryCov_9fa48("22865"), this.delegates.getMoveReplicaAssignmentReservations?.())) || null);
    }
  }
  buildRegisterServiceValidationError(statusCode, message, code, options) {
    if (stryMutAct_9fa48("22866")) {
      {}
    } else {
      stryCov_9fa48("22866");
      return stryMutAct_9fa48("22869") ? this.delegates.buildRegisterServiceValidationError?.(statusCode, message, code, options) && new Error(message) : stryMutAct_9fa48("22868") ? false : stryMutAct_9fa48("22867") ? true : (stryCov_9fa48("22867", "22868", "22869"), (stryMutAct_9fa48("22870") ? this.delegates.buildRegisterServiceValidationError(statusCode, message, code, options) : (stryCov_9fa48("22870"), this.delegates.buildRegisterServiceValidationError?.(statusCode, message, code, options))) || new Error(message));
    }
  }
  buildRegisteredServiceMutationRow(serviceData) {
    if (stryMutAct_9fa48("22871")) {
      {}
    } else {
      stryCov_9fa48("22871");
      return stryMutAct_9fa48("22874") ? this.delegates.buildRegisteredServiceMutationRow?.(serviceData) && serviceData : stryMutAct_9fa48("22873") ? false : stryMutAct_9fa48("22872") ? true : (stryCov_9fa48("22872", "22873", "22874"), (stryMutAct_9fa48("22875") ? this.delegates.buildRegisteredServiceMutationRow(serviceData) : (stryCov_9fa48("22875"), this.delegates.buildRegisteredServiceMutationRow?.(serviceData))) || serviceData);
    }
  }
  async executeBootstrapControlPlaneMutation(operation, options) {
    if (stryMutAct_9fa48("22876")) {
      {}
    } else {
      stryCov_9fa48("22876");
      return stryMutAct_9fa48("22877") ? this.delegates.executeBootstrapControlPlaneMutation(operation, options) : (stryCov_9fa48("22877"), this.delegates.executeBootstrapControlPlaneMutation?.(operation, options));
    }
  }
  buildBootstrapControlPlaneQueryError(result, fallbackMessage) {
    if (stryMutAct_9fa48("22878")) {
      {}
    } else {
      stryCov_9fa48("22878");
      return stryMutAct_9fa48("22881") ? this.delegates.buildBootstrapControlPlaneQueryError?.(result, fallbackMessage) && new Error(fallbackMessage) : stryMutAct_9fa48("22880") ? false : stryMutAct_9fa48("22879") ? true : (stryCov_9fa48("22879", "22880", "22881"), (stryMutAct_9fa48("22882") ? this.delegates.buildBootstrapControlPlaneQueryError(result, fallbackMessage) : (stryCov_9fa48("22882"), this.delegates.buildBootstrapControlPlaneQueryError?.(result, fallbackMessage))) || new Error(fallbackMessage));
    }
  }
  async waitForRegisteredServiceCacheVisibility(expectedService) {
    if (stryMutAct_9fa48("22883")) {
      {}
    } else {
      stryCov_9fa48("22883");
      return stryMutAct_9fa48("22884") ? this.delegates.waitForRegisteredServiceCacheVisibility(expectedService) : (stryCov_9fa48("22884"), this.delegates.waitForRegisteredServiceCacheVisibility?.(expectedService));
    }
  }
  async insertMoveReplicaHandoffOperation(handoffContext) {
    if (stryMutAct_9fa48("22885")) {
      {}
    } else {
      stryCov_9fa48("22885");
      return stryMutAct_9fa48("22886") ? this.delegates.insertMoveReplicaHandoffOperation(handoffContext) : (stryCov_9fa48("22886"), this.delegates.insertMoveReplicaHandoffOperation?.(handoffContext));
    }
  }
  async updateMoveReplicaHandoffOperation(handoffContext) {
    if (stryMutAct_9fa48("22887")) {
      {}
    } else {
      stryCov_9fa48("22887");
      return stryMutAct_9fa48("22888") ? this.delegates.updateMoveReplicaHandoffOperation(handoffContext) : (stryCov_9fa48("22888"), this.delegates.updateMoveReplicaHandoffOperation?.(handoffContext));
    }
  }
  isRetryableMoveReplicaHandoffError(error) {
    if (stryMutAct_9fa48("22889")) {
      {}
    } else {
      stryCov_9fa48("22889");
      if (stryMutAct_9fa48("22892") ? false : stryMutAct_9fa48("22891") ? true : stryMutAct_9fa48("22890") ? error : (stryCov_9fa48("22890", "22891", "22892"), !error)) {
        if (stryMutAct_9fa48("22893")) {
          {}
        } else {
          stryCov_9fa48("22893");
          return stryMutAct_9fa48("22894") ? true : (stryCov_9fa48("22894"), false);
        }
      }
      if (stryMutAct_9fa48("22897") ? error?.errorCode !== BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT : stryMutAct_9fa48("22896") ? false : stryMutAct_9fa48("22895") ? true : (stryCov_9fa48("22895", "22896", "22897"), (stryMutAct_9fa48("22898") ? error.errorCode : (stryCov_9fa48("22898"), error?.errorCode)) === BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT)) {
        if (stryMutAct_9fa48("22899")) {
          {}
        } else {
          stryCov_9fa48("22899");
          return stryMutAct_9fa48("22900") ? false : (stryCov_9fa48("22900"), true);
        }
      }
      if (stryMutAct_9fa48("22903") ? Number.isFinite(error?.statusCode) || Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("22902") ? false : stryMutAct_9fa48("22901") ? true : (stryCov_9fa48("22901", "22902", "22903"), Number.isFinite(stryMutAct_9fa48("22904") ? error.statusCode : (stryCov_9fa48("22904"), error?.statusCode)) && (stryMutAct_9fa48("22906") ? Math.floor(error.statusCode) !== HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("22905") ? true : (stryCov_9fa48("22905", "22906"), Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE)))) {
        if (stryMutAct_9fa48("22907")) {
          {}
        } else {
          stryCov_9fa48("22907");
          return stryMutAct_9fa48("22908") ? false : (stryCov_9fa48("22908"), true);
        }
      }
      return Number.isFinite(stryMutAct_9fa48("22909") ? error.retryAfterMs : (stryCov_9fa48("22909"), error?.retryAfterMs));
    }
  }
  shouldPreserveMoveReplicaHandoffReservation(handoffContext, error, sourceRemovalCompleted) {
    if (stryMutAct_9fa48("22910")) {
      {}
    } else {
      stryCov_9fa48("22910");
      if (stryMutAct_9fa48("22913") ? !handoffContext && sourceRemovalCompleted === true : stryMutAct_9fa48("22912") ? false : stryMutAct_9fa48("22911") ? true : (stryCov_9fa48("22911", "22912", "22913"), (stryMutAct_9fa48("22914") ? handoffContext : (stryCov_9fa48("22914"), !handoffContext)) || (stryMutAct_9fa48("22916") ? sourceRemovalCompleted !== true : stryMutAct_9fa48("22915") ? false : (stryCov_9fa48("22915", "22916"), sourceRemovalCompleted === (stryMutAct_9fa48("22917") ? false : (stryCov_9fa48("22917"), true)))))) {
        if (stryMutAct_9fa48("22918")) {
          {}
        } else {
          stryCov_9fa48("22918");
          return stryMutAct_9fa48("22919") ? true : (stryCov_9fa48("22919"), false);
        }
      }
      return this.isRetryableMoveReplicaHandoffError(error);
    }
  }
  assertSingleOwnerReplicaRegistration(serviceData, assignmentContext) {
    if (stryMutAct_9fa48("22920")) {
      {}
    } else {
      stryCov_9fa48("22920");
      if (stryMutAct_9fa48("22923") ? serviceData?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("22922") ? false : stryMutAct_9fa48("22921") ? true : (stryCov_9fa48("22921", "22922", "22923"), (stryMutAct_9fa48("22924") ? serviceData[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("22924"), serviceData?.[COLUMN.SERVICE_TYPE])) !== SERVICE_TYPE.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("22925")) {
          {}
        } else {
          stryCov_9fa48("22925");
          return;
        }
      }
      const serviceId = stryMutAct_9fa48("22926") ? serviceData[COLUMN.SERVICE_ID] : (stryCov_9fa48("22926"), serviceData?.[COLUMN.SERVICE_ID]);
      const targetNodeId = stryMutAct_9fa48("22927") ? serviceData[COLUMN.NODE_ID] : (stryCov_9fa48("22927"), serviceData?.[COLUMN.NODE_ID]);
      const existingRow = stryMutAct_9fa48("22928") ? this.getSystemTableCache().get(TABLES.SERVICES, serviceId) : (stryCov_9fa48("22928"), this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId));
      if (stryMutAct_9fa48("22931") ? false : stryMutAct_9fa48("22930") ? true : stryMutAct_9fa48("22929") ? existingRow : (stryCov_9fa48("22929", "22930", "22931"), !existingRow)) {
        if (stryMutAct_9fa48("22932")) {
          {}
        } else {
          stryCov_9fa48("22932");
          return;
        }
      }
      const existingNodeId = stryMutAct_9fa48("22935") ? existingRow[COLUMN.NODE_ID] && null : stryMutAct_9fa48("22934") ? false : stryMutAct_9fa48("22933") ? true : (stryCov_9fa48("22933", "22934", "22935"), existingRow[COLUMN.NODE_ID] || null);
      const existingStatus = stryMutAct_9fa48("22936") ? String(existingRow[COLUMN.STATUS] || STRING.UNKNOWN).toUpperCase() : (stryCov_9fa48("22936"), String(stryMutAct_9fa48("22939") ? existingRow[COLUMN.STATUS] && STRING.UNKNOWN : stryMutAct_9fa48("22938") ? false : stryMutAct_9fa48("22937") ? true : (stryCov_9fa48("22937", "22938", "22939"), existingRow[COLUMN.STATUS] || STRING.UNKNOWN)).toLowerCase());
      if (stryMutAct_9fa48("22942") ? (!existingNodeId || existingNodeId === targetNodeId) && existingStatus !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22941") ? false : stryMutAct_9fa48("22940") ? true : (stryCov_9fa48("22940", "22941", "22942"), (stryMutAct_9fa48("22944") ? !existingNodeId && existingNodeId === targetNodeId : stryMutAct_9fa48("22943") ? false : (stryCov_9fa48("22943", "22944"), (stryMutAct_9fa48("22945") ? existingNodeId : (stryCov_9fa48("22945"), !existingNodeId)) || (stryMutAct_9fa48("22947") ? existingNodeId !== targetNodeId : stryMutAct_9fa48("22946") ? false : (stryCov_9fa48("22946", "22947"), existingNodeId === targetNodeId)))) || (stryMutAct_9fa48("22949") ? existingStatus === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22948") ? false : (stryCov_9fa48("22948", "22949"), existingStatus !== SERVICE_STATUS.ACTIVE)))) {
        if (stryMutAct_9fa48("22950")) {
          {}
        } else {
          stryCov_9fa48("22950");
          return;
        }
      }
      const assignmentMatchesConflict = stryMutAct_9fa48("22953") ? assignmentContext && assignmentContext.replicaId === serviceId && assignmentContext.targetNodeId === targetNodeId || assignmentContext.sourceNodeId === existingNodeId : stryMutAct_9fa48("22952") ? false : stryMutAct_9fa48("22951") ? true : (stryCov_9fa48("22951", "22952", "22953"), (stryMutAct_9fa48("22955") ? assignmentContext && assignmentContext.replicaId === serviceId || assignmentContext.targetNodeId === targetNodeId : stryMutAct_9fa48("22954") ? true : (stryCov_9fa48("22954", "22955"), (stryMutAct_9fa48("22957") ? assignmentContext || assignmentContext.replicaId === serviceId : stryMutAct_9fa48("22956") ? true : (stryCov_9fa48("22956", "22957"), assignmentContext && (stryMutAct_9fa48("22959") ? assignmentContext.replicaId !== serviceId : stryMutAct_9fa48("22958") ? true : (stryCov_9fa48("22958", "22959"), assignmentContext.replicaId === serviceId)))) && (stryMutAct_9fa48("22961") ? assignmentContext.targetNodeId !== targetNodeId : stryMutAct_9fa48("22960") ? true : (stryCov_9fa48("22960", "22961"), assignmentContext.targetNodeId === targetNodeId)))) && (stryMutAct_9fa48("22963") ? assignmentContext.sourceNodeId !== existingNodeId : stryMutAct_9fa48("22962") ? true : (stryCov_9fa48("22962", "22963"), assignmentContext.sourceNodeId === existingNodeId)));
      if (stryMutAct_9fa48("22965") ? false : stryMutAct_9fa48("22964") ? true : (stryCov_9fa48("22964", "22965"), assignmentMatchesConflict)) {
        if (stryMutAct_9fa48("22966")) {
          {}
        } else {
          stryCov_9fa48("22966");
          return;
        }
      }
      if (stryMutAct_9fa48("22968") ? false : stryMutAct_9fa48("22967") ? true : (stryCov_9fa48("22967", "22968"), this.isCanonicalGroupHomeNode(stryMutAct_9fa48("22969") ? serviceData[COLUMN.GROUP_ID] : (stryCov_9fa48("22969"), serviceData?.[COLUMN.GROUP_ID]), targetNodeId))) {
        if (stryMutAct_9fa48("22970")) {
          {}
        } else {
          stryCov_9fa48("22970");
          return;
        }
      }
      throw this.buildRegisterServiceValidationError(HTTP_STATUS.CONFLICT, BOOTSTRAP_API_ERROR.REPLICA_OWNER_CONFLICT, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.REPLICA_OWNER_CONFLICT);
    }
  }
  isCanonicalGroupHomeNode(groupId, nodeId) {
    if (stryMutAct_9fa48("22971")) {
      {}
    } else {
      stryCov_9fa48("22971");
      if (stryMutAct_9fa48("22974") ? !groupId && !nodeId : stryMutAct_9fa48("22973") ? false : stryMutAct_9fa48("22972") ? true : (stryCov_9fa48("22972", "22973", "22974"), (stryMutAct_9fa48("22975") ? groupId : (stryCov_9fa48("22975"), !groupId)) || (stryMutAct_9fa48("22976") ? nodeId : (stryCov_9fa48("22976"), !nodeId)))) {
        if (stryMutAct_9fa48("22977")) {
          {}
        } else {
          stryCov_9fa48("22977");
          return stryMutAct_9fa48("22978") ? true : (stryCov_9fa48("22978"), false);
        }
      }
      const mgAssignment = new MessageGroupAssignment(stryMutAct_9fa48("22979") ? {} : (stryCov_9fa48("22979"), {
        seedNodeAddress: this.getSeedNodeAddress()
      }));
      const canonicalGroupId = mgAssignment.generateGroupId(nodeId);
      return stryMutAct_9fa48("22982") ? groupId !== canonicalGroupId : stryMutAct_9fa48("22981") ? false : stryMutAct_9fa48("22980") ? true : (stryCov_9fa48("22980", "22981", "22982"), groupId === canonicalGroupId);
    }
  }
  buildMoveReplicaHandoffContext(serviceData) {
    if (stryMutAct_9fa48("22983")) {
      {}
    } else {
      stryCov_9fa48("22983");
      const serviceId = serviceData[COLUMN.SERVICE_ID];
      const existing = stryMutAct_9fa48("22986") ? this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId) && {} : stryMutAct_9fa48("22985") ? false : stryMutAct_9fa48("22984") ? true : (stryCov_9fa48("22984", "22985", "22986"), (stryMutAct_9fa48("22987") ? this.getSystemTableCache().get(TABLES.SERVICES, serviceId) : (stryCov_9fa48("22987"), this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId))) || {});
      const now = Date.now();
      const groupId = stryMutAct_9fa48("22990") ? (serviceData[COLUMN.GROUP_ID] || existing[COLUMN.GROUP_ID]) && serviceId : stryMutAct_9fa48("22989") ? false : stryMutAct_9fa48("22988") ? true : (stryCov_9fa48("22988", "22989", "22990"), (stryMutAct_9fa48("22992") ? serviceData[COLUMN.GROUP_ID] && existing[COLUMN.GROUP_ID] : stryMutAct_9fa48("22991") ? false : (stryCov_9fa48("22991", "22992"), serviceData[COLUMN.GROUP_ID] || existing[COLUMN.GROUP_ID])) || serviceId);
      const sourceNodeId = stryMutAct_9fa48("22995") ? existing[COLUMN.NODE_ID] && this.getSeedNodeId() : stryMutAct_9fa48("22994") ? false : stryMutAct_9fa48("22993") ? true : (stryCov_9fa48("22993", "22994", "22995"), existing[COLUMN.NODE_ID] || this.getSeedNodeId());
      const targetNodeId = serviceData[COLUMN.NODE_ID];
      return stryMutAct_9fa48("22996") ? {} : (stryCov_9fa48("22996"), {
        operationId: uuidv4(),
        type: BOOTSTRAP_API_HANDOFF_OPERATION.TYPE,
        partitionId: groupId,
        entityType: SERVICE_TYPE.MESSAGE_GROUP,
        entityId: groupId,
        replicaId: serviceId,
        sourceNodeId,
        targetNodeId,
        status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
        workflowStep: WORKFLOW_STEP.CREATING,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        leaseExpiresAt: null,
        errorMessage: null,
        stepsHistory: stryMutAct_9fa48("22997") ? ["Stryker was here"] : (stryCov_9fa48("22997"), [])
      });
    }
  }
  buildMoveReplicaHandoffContextFromAssignment(serviceData, assignmentContext) {
    if (stryMutAct_9fa48("22998")) {
      {}
    } else {
      stryCov_9fa48("22998");
      const now = Date.now();
      const groupId = stryMutAct_9fa48("23001") ? (serviceData[COLUMN.GROUP_ID] || assignmentContext.groupId) && null : stryMutAct_9fa48("23000") ? false : stryMutAct_9fa48("22999") ? true : (stryCov_9fa48("22999", "23000", "23001"), (stryMutAct_9fa48("23003") ? serviceData[COLUMN.GROUP_ID] && assignmentContext.groupId : stryMutAct_9fa48("23002") ? false : (stryCov_9fa48("23002", "23003"), serviceData[COLUMN.GROUP_ID] || assignmentContext.groupId)) || null);
      const existingStepsHistory = Array.isArray(stryMutAct_9fa48("23004") ? assignmentContext.stepsHistory : (stryCov_9fa48("23004"), assignmentContext?.stepsHistory)) ? assignmentContext.stepsHistory.map(stryMutAct_9fa48("23005") ? () => undefined : (stryCov_9fa48("23005"), step => stryMutAct_9fa48("23006") ? {} : (stryCov_9fa48("23006"), {
        ...step
      }))) : stryMutAct_9fa48("23007") ? ["Stryker was here"] : (stryCov_9fa48("23007"), []);
      return stryMutAct_9fa48("23008") ? {} : (stryCov_9fa48("23008"), {
        operationId: assignmentContext.assignmentId,
        type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
        partitionId: groupId,
        entityType: SERVICE_TYPE.MESSAGE_GROUP,
        entityId: groupId,
        replicaId: assignmentContext.replicaId,
        sourceNodeId: stryMutAct_9fa48("23011") ? assignmentContext.sourceNodeId && this.getSeedNodeId() : stryMutAct_9fa48("23010") ? false : stryMutAct_9fa48("23009") ? true : (stryCov_9fa48("23009", "23010", "23011"), assignmentContext.sourceNodeId || this.getSeedNodeId()),
        targetNodeId: assignmentContext.targetNodeId,
        status: stryMutAct_9fa48("23014") ? assignmentContext.status && BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED : stryMutAct_9fa48("23013") ? false : stryMutAct_9fa48("23012") ? true : (stryCov_9fa48("23012", "23013", "23014"), assignmentContext.status || BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED),
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        leaseExpiresAt: Number.isFinite(assignmentContext.leaseExpiresAt) ? Math.floor(assignmentContext.leaseExpiresAt) : null,
        errorMessage: null,
        stepsHistory: existingStepsHistory
      });
    }
  }
  recordMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status) {
    if (stryMutAct_9fa48("23015")) {
      {}
    } else {
      stryCov_9fa48("23015");
      const now = Date.now();
      handoffContext.workflowStep = workflowStep;
      handoffContext.status = status;
      handoffContext.updatedAt = now;
      handoffContext.stepsHistory.push(stryMutAct_9fa48("23016") ? {} : (stryCov_9fa48("23016"), {
        phase,
        step: workflowStep,
        status,
        timestamp: now
      }));
      const reservations = this.getMoveReplicaAssignmentReservations();
      const existingReservation = stryMutAct_9fa48("23017") ? reservations.get(handoffContext.operationId) : (stryCov_9fa48("23017"), reservations?.get(handoffContext.operationId));
      if (stryMutAct_9fa48("23019") ? false : stryMutAct_9fa48("23018") ? true : (stryCov_9fa48("23018", "23019"), existingReservation)) {
        if (stryMutAct_9fa48("23020")) {
          {}
        } else {
          stryCov_9fa48("23020");
          reservations.set(handoffContext.operationId, stryMutAct_9fa48("23021") ? {} : (stryCov_9fa48("23021"), {
            ...existingReservation,
            status,
            updatedAt: now,
            stepsHistory: handoffContext.stepsHistory
          }));
        }
      }
    }
  }
  async startMoveReplicaHandoff(serviceData, assignmentContext = null) {
    if (stryMutAct_9fa48("23022")) {
      {}
    } else {
      stryCov_9fa48("23022");
      const handoffContext = assignmentContext ? this.buildMoveReplicaHandoffContextFromAssignment(serviceData, assignmentContext) : this.buildMoveReplicaHandoffContext(serviceData);
      this.recordMoveReplicaHandoffPhase(handoffContext, BOOTSTRAP_API_HANDOFF_PHASE.PREPARE_TARGET, WORKFLOW_STEP.CREATING, BOOTSTRAP_API_HANDOFF_STATUS.PREPARING);
      const reservations = this.getMoveReplicaAssignmentReservations();
      if (stryMutAct_9fa48("23024") ? false : stryMutAct_9fa48("23023") ? true : (stryCov_9fa48("23023", "23024"), assignmentContext)) {
        if (stryMutAct_9fa48("23025")) {
          {}
        } else {
          stryCov_9fa48("23025");
          try {
            if (stryMutAct_9fa48("23026")) {
              {}
            } else {
              stryCov_9fa48("23026");
              await this.updateMoveReplicaHandoffOperation(handoffContext);
            }
          } catch (handoffWriteError) {
            if (stryMutAct_9fa48("23027")) {
              {}
            } else {
              stryCov_9fa48("23027");
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED, stryMutAct_9fa48("23028") ? {} : (stryCov_9fa48("23028"), {
                operationId: handoffContext.operationId,
                assignmentId: assignmentContext.assignmentId,
                error: handoffWriteError.message
              }));
            }
          }
          stryMutAct_9fa48("23029") ? reservations.set(assignmentContext.assignmentId, {
            ...assignmentContext,
            status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
            updatedAt: handoffContext.updatedAt,
            leaseExpiresAt: handoffContext.leaseExpiresAt,
            stepsHistory: handoffContext.stepsHistory
          }) : (stryCov_9fa48("23029"), reservations?.set(assignmentContext.assignmentId, stryMutAct_9fa48("23030") ? {} : (stryCov_9fa48("23030"), {
            ...assignmentContext,
            status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
            updatedAt: handoffContext.updatedAt,
            leaseExpiresAt: handoffContext.leaseExpiresAt,
            stepsHistory: handoffContext.stepsHistory
          })));
        }
      } else {
        if (stryMutAct_9fa48("23031")) {
          {}
        } else {
          stryCov_9fa48("23031");
          await this.insertMoveReplicaHandoffOperation(handoffContext);
        }
      }
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_STARTED, stryMutAct_9fa48("23032") ? {} : (stryCov_9fa48("23032"), {
        operationId: handoffContext.operationId,
        serviceId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId
      }));
      return handoffContext;
    }
  }
  async executeMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status, executor) {
    if (stryMutAct_9fa48("23033")) {
      {}
    } else {
      stryCov_9fa48("23033");
      this.recordMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status);
      try {
        if (stryMutAct_9fa48("23034")) {
          {}
        } else {
          stryCov_9fa48("23034");
          await this.updateMoveReplicaHandoffOperation(handoffContext);
        }
      } catch (phaseWriteError) {
        if (stryMutAct_9fa48("23035")) {
          {}
        } else {
          stryCov_9fa48("23035");
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED, stryMutAct_9fa48("23036") ? {} : (stryCov_9fa48("23036"), {
            operationId: handoffContext.operationId,
            phase,
            error: phaseWriteError.message
          }));
        }
      }
      await executor();
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_PHASE_APPLIED, stryMutAct_9fa48("23037") ? {} : (stryCov_9fa48("23037"), {
        operationId: handoffContext.operationId,
        phase,
        workflowStep,
        status,
        serviceId: handoffContext.replicaId
      }));
    }
  }
  verifyMoveReplicaHandoffTarget(handoffContext, serviceData) {
    if (stryMutAct_9fa48("23038")) {
      {}
    } else {
      stryCov_9fa48("23038");
      if (stryMutAct_9fa48("23041") ? handoffContext.sourceNodeId !== handoffContext.targetNodeId : stryMutAct_9fa48("23040") ? false : stryMutAct_9fa48("23039") ? true : (stryCov_9fa48("23039", "23040", "23041"), handoffContext.sourceNodeId === handoffContext.targetNodeId)) {
        if (stryMutAct_9fa48("23042")) {
          {}
        } else {
          stryCov_9fa48("23042");
          throw new Error(stryMutAct_9fa48("23043") ? "" : (stryCov_9fa48("23043"), 'MOVE_REPLICA target node must differ from source node'));
        }
      }
      const expectedAddress = (stryMutAct_9fa48("23044") ? `` : (stryCov_9fa48("23044"), `${handoffContext.targetNodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("23045") ? `` : (stryCov_9fa48("23045"), `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${handoffContext.replicaId}`));
      const suppliedAddress = serviceData[COLUMN.ADDRESS];
      if (stryMutAct_9fa48("23048") ? suppliedAddress || suppliedAddress !== expectedAddress : stryMutAct_9fa48("23047") ? false : stryMutAct_9fa48("23046") ? true : (stryCov_9fa48("23046", "23047", "23048"), suppliedAddress && (stryMutAct_9fa48("23050") ? suppliedAddress === expectedAddress : stryMutAct_9fa48("23049") ? true : (stryCov_9fa48("23049", "23050"), suppliedAddress !== expectedAddress)))) {
        if (stryMutAct_9fa48("23051")) {
          {}
        } else {
          stryCov_9fa48("23051");
          throw new Error(stryMutAct_9fa48("23052") ? "" : (stryCov_9fa48("23052"), 'MOVE_REPLICA target address mismatch'));
        }
      }
    }
  }
  async completeMoveReplicaHandoff(handoffContext) {
    if (stryMutAct_9fa48("23053")) {
      {}
    } else {
      stryCov_9fa48("23053");
      this.recordMoveReplicaHandoffPhase(handoffContext, BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA, WORKFLOW_STEP.ACTIVE, BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED);
      handoffContext.completedAt = handoffContext.updatedAt;
      handoffContext.leaseExpiresAt = handoffContext.updatedAt;
      handoffContext.errorMessage = null;
      try {
        if (stryMutAct_9fa48("23054")) {
          {}
        } else {
          stryCov_9fa48("23054");
          await this.updateMoveReplicaHandoffOperation(handoffContext);
        }
      } catch (completionWriteError) {
        if (stryMutAct_9fa48("23055")) {
          {}
        } else {
          stryCov_9fa48("23055");
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED, stryMutAct_9fa48("23056") ? {} : (stryCov_9fa48("23056"), {
            operationId: handoffContext.operationId,
            phase: BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA,
            error: completionWriteError.message
          }));
        }
      }
      stryMutAct_9fa48("23057") ? this.getMoveReplicaAssignmentReservations().set(handoffContext.operationId, {
        ...(this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId) || {}),
        assignmentId: handoffContext.operationId,
        replicaId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId,
        groupId: handoffContext.partitionId,
        status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
        leaseExpiresAt: handoffContext.leaseExpiresAt,
        updatedAt: handoffContext.updatedAt,
        stepsHistory: handoffContext.stepsHistory
      }) : (stryCov_9fa48("23057"), this.getMoveReplicaAssignmentReservations()?.set(handoffContext.operationId, stryMutAct_9fa48("23058") ? {} : (stryCov_9fa48("23058"), {
        ...(stryMutAct_9fa48("23061") ? this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId) && {} : stryMutAct_9fa48("23060") ? false : stryMutAct_9fa48("23059") ? true : (stryCov_9fa48("23059", "23060", "23061"), (stryMutAct_9fa48("23062") ? this.getMoveReplicaAssignmentReservations().get(handoffContext.operationId) : (stryCov_9fa48("23062"), this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId))) || {})),
        assignmentId: handoffContext.operationId,
        replicaId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId,
        groupId: handoffContext.partitionId,
        status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
        leaseExpiresAt: handoffContext.leaseExpiresAt,
        updatedAt: handoffContext.updatedAt,
        stepsHistory: handoffContext.stepsHistory
      })));
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_COMPLETED, stryMutAct_9fa48("23063") ? {} : (stryCov_9fa48("23063"), {
        operationId: handoffContext.operationId,
        serviceId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId
      }));
    }
  }
  async failMoveReplicaHandoff(handoffContext, error) {
    if (stryMutAct_9fa48("23064")) {
      {}
    } else {
      stryCov_9fa48("23064");
      try {
        if (stryMutAct_9fa48("23065")) {
          {}
        } else {
          stryCov_9fa48("23065");
          this.recordMoveReplicaHandoffPhase(handoffContext, BOOTSTRAP_API_HANDOFF_PHASE.FAILED, WORKFLOW_STEP.FAILED, BOOTSTRAP_API_HANDOFF_STATUS.FAILED);
          handoffContext.completedAt = handoffContext.updatedAt;
          handoffContext.leaseExpiresAt = handoffContext.updatedAt;
          handoffContext.errorMessage = stryMutAct_9fa48("23068") ? error?.message && 'unknown MOVE_REPLICA handoff failure' : stryMutAct_9fa48("23067") ? false : stryMutAct_9fa48("23066") ? true : (stryCov_9fa48("23066", "23067", "23068"), (stryMutAct_9fa48("23069") ? error.message : (stryCov_9fa48("23069"), error?.message)) || (stryMutAct_9fa48("23070") ? "" : (stryCov_9fa48("23070"), 'unknown MOVE_REPLICA handoff failure')));
          await this.updateMoveReplicaHandoffOperation(handoffContext);
          stryMutAct_9fa48("23071") ? this.getMoveReplicaAssignmentReservations().set(handoffContext.operationId, {
            ...(this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId) || {}),
            assignmentId: handoffContext.operationId,
            replicaId: handoffContext.replicaId,
            sourceNodeId: handoffContext.sourceNodeId,
            targetNodeId: handoffContext.targetNodeId,
            groupId: handoffContext.partitionId,
            status: BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
            leaseExpiresAt: handoffContext.leaseExpiresAt,
            updatedAt: handoffContext.updatedAt,
            stepsHistory: handoffContext.stepsHistory
          }) : (stryCov_9fa48("23071"), this.getMoveReplicaAssignmentReservations()?.set(handoffContext.operationId, stryMutAct_9fa48("23072") ? {} : (stryCov_9fa48("23072"), {
            ...(stryMutAct_9fa48("23075") ? this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId) && {} : stryMutAct_9fa48("23074") ? false : stryMutAct_9fa48("23073") ? true : (stryCov_9fa48("23073", "23074", "23075"), (stryMutAct_9fa48("23076") ? this.getMoveReplicaAssignmentReservations().get(handoffContext.operationId) : (stryCov_9fa48("23076"), this.getMoveReplicaAssignmentReservations()?.get(handoffContext.operationId))) || {})),
            assignmentId: handoffContext.operationId,
            replicaId: handoffContext.replicaId,
            sourceNodeId: handoffContext.sourceNodeId,
            targetNodeId: handoffContext.targetNodeId,
            groupId: handoffContext.partitionId,
            status: BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
            leaseExpiresAt: handoffContext.leaseExpiresAt,
            updatedAt: handoffContext.updatedAt,
            stepsHistory: handoffContext.stepsHistory
          })));
        }
      } catch (persistError) {
        if (stryMutAct_9fa48("23077")) {
          {}
        } else {
          stryCov_9fa48("23077");
          this.getLogger().error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_FAILED, stryMutAct_9fa48("23078") ? {} : (stryCov_9fa48("23078"), {
            operationId: handoffContext.operationId,
            serviceId: handoffContext.replicaId,
            error: persistError.message
          }));
          return;
        }
      }
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_FAILED, stryMutAct_9fa48("23079") ? {} : (stryCov_9fa48("23079"), {
        operationId: handoffContext.operationId,
        serviceId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId,
        error: stryMutAct_9fa48("23082") ? error?.message && null : stryMutAct_9fa48("23081") ? false : stryMutAct_9fa48("23080") ? true : (stryCov_9fa48("23080", "23081", "23082"), (stryMutAct_9fa48("23083") ? error.message : (stryCov_9fa48("23083"), error?.message)) || null)
      }));
    }
  }
  async removeLocalSourceReplicaForMoveReplica(serviceData) {
    if (stryMutAct_9fa48("23084")) {
      {}
    } else {
      stryCov_9fa48("23084");
      const serviceId = stryMutAct_9fa48("23085") ? serviceData[COLUMN.SERVICE_ID] : (stryCov_9fa48("23085"), serviceData?.[COLUMN.SERVICE_ID]);
      const serviceType = stryMutAct_9fa48("23086") ? serviceData[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("23086"), serviceData?.[COLUMN.SERVICE_TYPE]);
      const targetNodeId = stryMutAct_9fa48("23087") ? serviceData[COLUMN.NODE_ID] : (stryCov_9fa48("23087"), serviceData?.[COLUMN.NODE_ID]);
      if (stryMutAct_9fa48("23090") ? !serviceId && !targetNodeId : stryMutAct_9fa48("23089") ? false : stryMutAct_9fa48("23088") ? true : (stryCov_9fa48("23088", "23089", "23090"), (stryMutAct_9fa48("23091") ? serviceId : (stryCov_9fa48("23091"), !serviceId)) || (stryMutAct_9fa48("23092") ? targetNodeId : (stryCov_9fa48("23092"), !targetNodeId)))) {
        if (stryMutAct_9fa48("23093")) {
          {}
        } else {
          stryCov_9fa48("23093");
          return;
        }
      }
      if (stryMutAct_9fa48("23096") ? serviceType === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("23095") ? false : stryMutAct_9fa48("23094") ? true : (stryCov_9fa48("23094", "23095", "23096"), serviceType !== SERVICE_TYPE.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("23097")) {
          {}
        } else {
          stryCov_9fa48("23097");
          return;
        }
      }
      if (stryMutAct_9fa48("23100") ? targetNodeId !== this.getSeedNodeId() : stryMutAct_9fa48("23099") ? false : stryMutAct_9fa48("23098") ? true : (stryCov_9fa48("23098", "23099", "23100"), targetNodeId === this.getSeedNodeId())) {
        if (stryMutAct_9fa48("23101")) {
          {}
        } else {
          stryCov_9fa48("23101");
          return;
        }
      }
      const messageGroupServices = this.getMessageGroupServices();
      const localService = stryMutAct_9fa48("23102") ? messageGroupServices.get(serviceId) : (stryCov_9fa48("23102"), messageGroupServices?.get(serviceId));
      if (stryMutAct_9fa48("23105") ? false : stryMutAct_9fa48("23104") ? true : stryMutAct_9fa48("23103") ? localService : (stryCov_9fa48("23103", "23104", "23105"), !localService)) {
        if (stryMutAct_9fa48("23106")) {
          {}
        } else {
          stryCov_9fa48("23106");
          return;
        }
      }
      const existingService = stryMutAct_9fa48("23107") ? this.getSystemTableCache().get(TABLES.SERVICES, serviceId) : (stryCov_9fa48("23107"), this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId));
      const localAddress = stryMutAct_9fa48("23110") ? (localService.unifiedAddress || existingService?.[COLUMN.ADDRESS]) && `${this.getSeedNodeId()}${ADDRESS.SEPARATOR}` + `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${serviceId}` : stryMutAct_9fa48("23109") ? false : stryMutAct_9fa48("23108") ? true : (stryCov_9fa48("23108", "23109", "23110"), (stryMutAct_9fa48("23112") ? localService.unifiedAddress && existingService?.[COLUMN.ADDRESS] : stryMutAct_9fa48("23111") ? false : (stryCov_9fa48("23111", "23112"), localService.unifiedAddress || (stryMutAct_9fa48("23113") ? existingService[COLUMN.ADDRESS] : (stryCov_9fa48("23113"), existingService?.[COLUMN.ADDRESS])))) || (stryMutAct_9fa48("23114") ? `` : (stryCov_9fa48("23114"), `${this.getSeedNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("23115") ? `` : (stryCov_9fa48("23115"), `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${serviceId}`)));
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVAL_START, stryMutAct_9fa48("23116") ? {} : (stryCov_9fa48("23116"), {
        serviceId,
        sourceNodeId: this.getSeedNodeId(),
        targetNodeId,
        localAddress
      }));
      try {
        if (stryMutAct_9fa48("23117")) {
          {}
        } else {
          stryCov_9fa48("23117");
          if (stryMutAct_9fa48("23120") ? typeof localService.shutdown !== TYPEOF.FUNCTION : stryMutAct_9fa48("23119") ? false : stryMutAct_9fa48("23118") ? true : (stryCov_9fa48("23118", "23119", "23120"), typeof localService.shutdown === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("23121")) {
              {}
            } else {
              stryCov_9fa48("23121");
              await localService.shutdown();
            }
          }
          messageGroupServices.delete(serviceId);
          const messageRouter = this.getMessageRouter();
          if (stryMutAct_9fa48("23124") ? messageRouter || typeof messageRouter.unregister === TYPEOF.FUNCTION : stryMutAct_9fa48("23123") ? false : stryMutAct_9fa48("23122") ? true : (stryCov_9fa48("23122", "23123", "23124"), messageRouter && (stryMutAct_9fa48("23126") ? typeof messageRouter.unregister !== TYPEOF.FUNCTION : stryMutAct_9fa48("23125") ? true : (stryCov_9fa48("23125", "23126"), typeof messageRouter.unregister === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("23127")) {
              {}
            } else {
              stryCov_9fa48("23127");
              messageRouter.unregister(localAddress);
            }
          }
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVED, stryMutAct_9fa48("23128") ? {} : (stryCov_9fa48("23128"), {
            serviceId,
            sourceNodeId: this.getSeedNodeId(),
            targetNodeId,
            localAddress
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("23129")) {
          {}
        } else {
          stryCov_9fa48("23129");
          this.getLogger().error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVAL_FAILED, stryMutAct_9fa48("23130") ? {} : (stryCov_9fa48("23130"), {
            serviceId,
            sourceNodeId: this.getSeedNodeId(),
            targetNodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }
  async restoreRegisteredServiceRowAfterFailedHandoff(previousServiceRow, requestedServiceData, error) {
    if (stryMutAct_9fa48("23131")) {
      {}
    } else {
      stryCov_9fa48("23131");
      if (stryMutAct_9fa48("23134") ? !previousServiceRow && typeof previousServiceRow !== TYPEOF.OBJECT : stryMutAct_9fa48("23133") ? false : stryMutAct_9fa48("23132") ? true : (stryCov_9fa48("23132", "23133", "23134"), (stryMutAct_9fa48("23135") ? previousServiceRow : (stryCov_9fa48("23135"), !previousServiceRow)) || (stryMutAct_9fa48("23137") ? typeof previousServiceRow === TYPEOF.OBJECT : stryMutAct_9fa48("23136") ? false : (stryCov_9fa48("23136", "23137"), typeof previousServiceRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("23138")) {
          {}
        } else {
          stryCov_9fa48("23138");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("23139")) {
          {}
        } else {
          stryCov_9fa48("23139");
          const rollbackResult = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("23140") ? {} : (stryCov_9fa48("23140"), {
            operation: stryMutAct_9fa48("23141") ? "" : (stryCov_9fa48("23141"), 'upsert'),
            tableName: TABLES.SERVICES,
            row: this.buildRegisteredServiceMutationRow(previousServiceRow)
          }), stryMutAct_9fa48("23142") ? {} : (stryCov_9fa48("23142"), {
            skipCacheWait: stryMutAct_9fa48("23143") ? false : (stryCov_9fa48("23143"), true)
          }));
          if (stryMutAct_9fa48("23146") ? rollbackResult?.success !== false : stryMutAct_9fa48("23145") ? false : stryMutAct_9fa48("23144") ? true : (stryCov_9fa48("23144", "23145", "23146"), (stryMutAct_9fa48("23147") ? rollbackResult.success : (stryCov_9fa48("23147"), rollbackResult?.success)) === (stryMutAct_9fa48("23148") ? true : (stryCov_9fa48("23148"), false)))) {
            if (stryMutAct_9fa48("23149")) {
              {}
            } else {
              stryCov_9fa48("23149");
              throw this.buildBootstrapControlPlaneQueryError(rollbackResult, BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED);
            }
          }
          await this.waitForRegisteredServiceCacheVisibility(previousServiceRow);
          this.getLogger().warn(stryMutAct_9fa48("23150") ? "" : (stryCov_9fa48("23150"), 'Restored previous service owner after failed MOVE_REPLICA target registration'), stryMutAct_9fa48("23151") ? {} : (stryCov_9fa48("23151"), {
            serviceId: stryMutAct_9fa48("23154") ? requestedServiceData?.[COLUMN.SERVICE_ID] && null : stryMutAct_9fa48("23153") ? false : stryMutAct_9fa48("23152") ? true : (stryCov_9fa48("23152", "23153", "23154"), (stryMutAct_9fa48("23155") ? requestedServiceData[COLUMN.SERVICE_ID] : (stryCov_9fa48("23155"), requestedServiceData?.[COLUMN.SERVICE_ID])) || null),
            targetNodeId: stryMutAct_9fa48("23158") ? requestedServiceData?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("23157") ? false : stryMutAct_9fa48("23156") ? true : (stryCov_9fa48("23156", "23157", "23158"), (stryMutAct_9fa48("23159") ? requestedServiceData[COLUMN.NODE_ID] : (stryCov_9fa48("23159"), requestedServiceData?.[COLUMN.NODE_ID])) || null),
            restoredNodeId: stryMutAct_9fa48("23162") ? previousServiceRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("23161") ? false : stryMutAct_9fa48("23160") ? true : (stryCov_9fa48("23160", "23161", "23162"), (stryMutAct_9fa48("23163") ? previousServiceRow[COLUMN.NODE_ID] : (stryCov_9fa48("23163"), previousServiceRow?.[COLUMN.NODE_ID])) || null),
            error: stryMutAct_9fa48("23166") ? error?.message && String(error) : stryMutAct_9fa48("23165") ? false : stryMutAct_9fa48("23164") ? true : (stryCov_9fa48("23164", "23165", "23166"), (stryMutAct_9fa48("23167") ? error.message : (stryCov_9fa48("23167"), error?.message)) || String(error))
          }));
        }
      } catch (rollbackError) {
        if (stryMutAct_9fa48("23168")) {
          {}
        } else {
          stryCov_9fa48("23168");
          this.getLogger().error(stryMutAct_9fa48("23169") ? "" : (stryCov_9fa48("23169"), 'Failed to restore previous service owner after MOVE_REPLICA target registration failure'), stryMutAct_9fa48("23170") ? {} : (stryCov_9fa48("23170"), {
            serviceId: stryMutAct_9fa48("23173") ? requestedServiceData?.[COLUMN.SERVICE_ID] && null : stryMutAct_9fa48("23172") ? false : stryMutAct_9fa48("23171") ? true : (stryCov_9fa48("23171", "23172", "23173"), (stryMutAct_9fa48("23174") ? requestedServiceData[COLUMN.SERVICE_ID] : (stryCov_9fa48("23174"), requestedServiceData?.[COLUMN.SERVICE_ID])) || null),
            targetNodeId: stryMutAct_9fa48("23177") ? requestedServiceData?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("23176") ? false : stryMutAct_9fa48("23175") ? true : (stryCov_9fa48("23175", "23176", "23177"), (stryMutAct_9fa48("23178") ? requestedServiceData[COLUMN.NODE_ID] : (stryCov_9fa48("23178"), requestedServiceData?.[COLUMN.NODE_ID])) || null),
            restoredNodeId: stryMutAct_9fa48("23181") ? previousServiceRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("23180") ? false : stryMutAct_9fa48("23179") ? true : (stryCov_9fa48("23179", "23180", "23181"), (stryMutAct_9fa48("23182") ? previousServiceRow[COLUMN.NODE_ID] : (stryCov_9fa48("23182"), previousServiceRow?.[COLUMN.NODE_ID])) || null),
            error: stryMutAct_9fa48("23185") ? rollbackError?.message && String(rollbackError) : stryMutAct_9fa48("23184") ? false : stryMutAct_9fa48("23183") ? true : (stryCov_9fa48("23183", "23184", "23185"), (stryMutAct_9fa48("23186") ? rollbackError.message : (stryCov_9fa48("23186"), rollbackError?.message)) || String(rollbackError)),
            originalError: stryMutAct_9fa48("23189") ? error?.message && String(error) : stryMutAct_9fa48("23188") ? false : stryMutAct_9fa48("23187") ? true : (stryCov_9fa48("23187", "23188", "23189"), (stryMutAct_9fa48("23190") ? error.message : (stryCov_9fa48("23190"), error?.message)) || String(error))
          }));
        }
      }
    }
  }
}
export { MoveReplicaHandoffOwner };