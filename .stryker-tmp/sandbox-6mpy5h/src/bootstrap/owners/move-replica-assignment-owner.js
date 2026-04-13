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
import { COLUMN, HTTP_STATUS, NUM, SERVICE_STATUS, SERVICE_TYPE, STRING, TABLES, TYPEOF, WORKFLOW_STEP } from '../../constants/index.js';
import { isNodeRecordReady } from '../../node/node-readiness-policy.js';
import { BOOTSTRAP_API_ASSIGNMENT, BOOTSTRAP_API_DEFAULT, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_HANDOFF_STATUS, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE, BOOTSTRAP_API_SQL } from '../bootstrap-api-constants.js';
import { isRetryableControlPlaneError, getControlPlaneRetryAfterMs } from '../../control-plane/control-plane-error-classification.js';
const MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS = 250;
const MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_CEILING_MS = 5000;
class MoveReplicaAssignmentOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("21665")) {
      {}
    } else {
      stryCov_9fa48("21665");
      this.delegates = stryMutAct_9fa48("21668") ? options.delegates && {} : stryMutAct_9fa48("21667") ? false : stryMutAct_9fa48("21666") ? true : (stryCov_9fa48("21666", "21667", "21668"), options.delegates || {});
      this.nextReservationSqlRetryAtMs = 0;
      this.nextRenewalWriteRetryAtByAssignmentId = new Map();
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("21669")) {
      {}
    } else {
      stryCov_9fa48("21669");
      return stryMutAct_9fa48("21672") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("21671") ? false : stryMutAct_9fa48("21670") ? true : (stryCov_9fa48("21670", "21671", "21672"), (stryMutAct_9fa48("21673") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("21673"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("21674")) {
      {}
    } else {
      stryCov_9fa48("21674");
      return stryMutAct_9fa48("21677") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("21676") ? false : stryMutAct_9fa48("21675") ? true : (stryCov_9fa48("21675", "21676", "21677"), (stryMutAct_9fa48("21678") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("21678"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getMessageGroupServices() {
    if (stryMutAct_9fa48("21679")) {
      {}
    } else {
      stryCov_9fa48("21679");
      return stryMutAct_9fa48("21682") ? this.delegates.getMessageGroupServices?.() && null : stryMutAct_9fa48("21681") ? false : stryMutAct_9fa48("21680") ? true : (stryCov_9fa48("21680", "21681", "21682"), (stryMutAct_9fa48("21683") ? this.delegates.getMessageGroupServices() : (stryCov_9fa48("21683"), this.delegates.getMessageGroupServices?.())) || null);
    }
  }
  getSqlQueryEngine() {
    if (stryMutAct_9fa48("21684")) {
      {}
    } else {
      stryCov_9fa48("21684");
      return stryMutAct_9fa48("21687") ? this.delegates.getSqlQueryEngine?.() && null : stryMutAct_9fa48("21686") ? false : stryMutAct_9fa48("21685") ? true : (stryCov_9fa48("21685", "21686", "21687"), (stryMutAct_9fa48("21688") ? this.delegates.getSqlQueryEngine() : (stryCov_9fa48("21688"), this.delegates.getSqlQueryEngine?.())) || null);
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("21689")) {
      {}
    } else {
      stryCov_9fa48("21689");
      return stryMutAct_9fa48("21692") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("21691") ? false : stryMutAct_9fa48("21690") ? true : (stryCov_9fa48("21690", "21691", "21692"), (stryMutAct_9fa48("21693") ? this.delegates.getLogger() : (stryCov_9fa48("21693"), this.delegates.getLogger?.())) || console);
    }
  }
  getMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("21694")) {
      {}
    } else {
      stryCov_9fa48("21694");
      return stryMutAct_9fa48("21697") ? this.delegates.getMoveReplicaAssignmentReservations?.() && null : stryMutAct_9fa48("21696") ? false : stryMutAct_9fa48("21695") ? true : (stryCov_9fa48("21695", "21696", "21697"), (stryMutAct_9fa48("21698") ? this.delegates.getMoveReplicaAssignmentReservations() : (stryCov_9fa48("21698"), this.delegates.getMoveReplicaAssignmentReservations?.())) || null);
    }
  }
  getMoveReplicaAssignmentLeaseMs() {
    if (stryMutAct_9fa48("21699")) {
      {}
    } else {
      stryCov_9fa48("21699");
      return stryMutAct_9fa48("21702") ? this.delegates.getMoveReplicaAssignmentLeaseMs?.() && 0 : stryMutAct_9fa48("21701") ? false : stryMutAct_9fa48("21700") ? true : (stryCov_9fa48("21700", "21701", "21702"), (stryMutAct_9fa48("21703") ? this.delegates.getMoveReplicaAssignmentLeaseMs() : (stryCov_9fa48("21703"), this.delegates.getMoveReplicaAssignmentLeaseMs?.())) || 0);
    }
  }
  getMoveReplicaAssignmentSweepIntervalMs() {
    if (stryMutAct_9fa48("21704")) {
      {}
    } else {
      stryCov_9fa48("21704");
      return stryMutAct_9fa48("21707") ? this.delegates.getMoveReplicaAssignmentSweepIntervalMs?.() && 0 : stryMutAct_9fa48("21706") ? false : stryMutAct_9fa48("21705") ? true : (stryCov_9fa48("21705", "21706", "21707"), (stryMutAct_9fa48("21708") ? this.delegates.getMoveReplicaAssignmentSweepIntervalMs() : (stryCov_9fa48("21708"), this.delegates.getMoveReplicaAssignmentSweepIntervalMs?.())) || 0);
    }
  }
  getBootstrapAdmissionRetryAfterMs() {
    if (stryMutAct_9fa48("21709")) {
      {}
    } else {
      stryCov_9fa48("21709");
      return stryMutAct_9fa48("21712") ? this.delegates.getBootstrapAdmissionRetryAfterMs?.() && 0 : stryMutAct_9fa48("21711") ? false : stryMutAct_9fa48("21710") ? true : (stryCov_9fa48("21710", "21711", "21712"), (stryMutAct_9fa48("21713") ? this.delegates.getBootstrapAdmissionRetryAfterMs() : (stryCov_9fa48("21713"), this.delegates.getBootstrapAdmissionRetryAfterMs?.())) || 0);
    }
  }
  async executeBootstrapControlPlaneQuery(sql, params) {
    if (stryMutAct_9fa48("21714")) {
      {}
    } else {
      stryCov_9fa48("21714");
      return stryMutAct_9fa48("21715") ? this.delegates.executeBootstrapControlPlaneQuery(sql, params) : (stryCov_9fa48("21715"), this.delegates.executeBootstrapControlPlaneQuery?.(sql, params));
    }
  }
  async executeBootstrapControlPlaneMutation(mutation, options) {
    if (stryMutAct_9fa48("21716")) {
      {}
    } else {
      stryCov_9fa48("21716");
      return stryMutAct_9fa48("21717") ? this.delegates.executeBootstrapControlPlaneMutation(mutation, options) : (stryCov_9fa48("21717"), this.delegates.executeBootstrapControlPlaneMutation?.(mutation, options));
    }
  }
  buildBootstrapControlPlaneQueryError(result, message) {
    if (stryMutAct_9fa48("21718")) {
      {}
    } else {
      stryCov_9fa48("21718");
      return stryMutAct_9fa48("21721") ? this.delegates.buildBootstrapControlPlaneQueryError?.(result, message) && new Error(message) : stryMutAct_9fa48("21720") ? false : stryMutAct_9fa48("21719") ? true : (stryCov_9fa48("21719", "21720", "21721"), (stryMutAct_9fa48("21722") ? this.delegates.buildBootstrapControlPlaneQueryError(result, message) : (stryCov_9fa48("21722"), this.delegates.buildBootstrapControlPlaneQueryError?.(result, message))) || new Error(message));
    }
  }
  buildRegisterServiceValidationError(statusCode, message, code, options) {
    if (stryMutAct_9fa48("21723")) {
      {}
    } else {
      stryCov_9fa48("21723");
      return stryMutAct_9fa48("21726") ? this.delegates.buildRegisterServiceValidationError?.(statusCode, message, code, options) && new Error(message) : stryMutAct_9fa48("21725") ? false : stryMutAct_9fa48("21724") ? true : (stryCov_9fa48("21724", "21725", "21726"), (stryMutAct_9fa48("21727") ? this.delegates.buildRegisterServiceValidationError(statusCode, message, code, options) : (stryCov_9fa48("21727"), this.delegates.buildRegisterServiceValidationError?.(statusCode, message, code, options))) || new Error(message));
    }
  }
  isRetryableMoveReplicaAssignmentPersistenceFailure(value) {
    if (stryMutAct_9fa48("21728")) {
      {}
    } else {
      stryCov_9fa48("21728");
      return isRetryableControlPlaneError(value);
    }
  }
  getRetryableMoveReplicaAssignmentBackoffMs(value) {
    if (stryMutAct_9fa48("21729")) {
      {}
    } else {
      stryCov_9fa48("21729");
      const retryAfterMs = getControlPlaneRetryAfterMs(value);
      if (stryMutAct_9fa48("21732") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("21731") ? false : stryMutAct_9fa48("21730") ? true : (stryCov_9fa48("21730", "21731", "21732"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("21735") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("21734") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("21733") ? true : (stryCov_9fa48("21733", "21734", "21735"), retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("21736")) {
          {}
        } else {
          stryCov_9fa48("21736");
          return stryMutAct_9fa48("21737") ? Math.max(MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_CEILING_MS, Math.max(MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS, Math.floor(retryAfterMs))) : (stryCov_9fa48("21737"), Math.min(MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_CEILING_MS, stryMutAct_9fa48("21738") ? Math.min(MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS, Math.floor(retryAfterMs)) : (stryCov_9fa48("21738"), Math.max(MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS, Math.floor(retryAfterMs)))));
        }
      }
      return MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS;
    }
  }
  armReservationSqlRetryBackoff(value, now = Date.now()) {
    if (stryMutAct_9fa48("21739")) {
      {}
    } else {
      stryCov_9fa48("21739");
      this.nextReservationSqlRetryAtMs = stryMutAct_9fa48("21740") ? now - this.getRetryableMoveReplicaAssignmentBackoffMs(value) : (stryCov_9fa48("21740"), now + this.getRetryableMoveReplicaAssignmentBackoffMs(value));
    }
  }
  clearReservationSqlRetryBackoff() {
    if (stryMutAct_9fa48("21741")) {
      {}
    } else {
      stryCov_9fa48("21741");
      this.nextReservationSqlRetryAtMs = NUM.ZERO;
    }
  }
  shouldAttemptReservationSqlRefresh(now = Date.now()) {
    if (stryMutAct_9fa48("21742")) {
      {}
    } else {
      stryCov_9fa48("21742");
      return stryMutAct_9fa48("21746") ? this.nextReservationSqlRetryAtMs > now : stryMutAct_9fa48("21745") ? this.nextReservationSqlRetryAtMs < now : stryMutAct_9fa48("21744") ? false : stryMutAct_9fa48("21743") ? true : (stryCov_9fa48("21743", "21744", "21745", "21746"), this.nextReservationSqlRetryAtMs <= now);
    }
  }
  armRenewalWriteRetryBackoff(assignmentId, value, now = Date.now()) {
    if (stryMutAct_9fa48("21747")) {
      {}
    } else {
      stryCov_9fa48("21747");
      if (stryMutAct_9fa48("21750") ? false : stryMutAct_9fa48("21749") ? true : stryMutAct_9fa48("21748") ? assignmentId : (stryCov_9fa48("21748", "21749", "21750"), !assignmentId)) {
        if (stryMutAct_9fa48("21751")) {
          {}
        } else {
          stryCov_9fa48("21751");
          return;
        }
      }
      this.nextRenewalWriteRetryAtByAssignmentId.set(assignmentId, stryMutAct_9fa48("21752") ? now - this.getRetryableMoveReplicaAssignmentBackoffMs(value) : (stryCov_9fa48("21752"), now + this.getRetryableMoveReplicaAssignmentBackoffMs(value)));
    }
  }
  clearRenewalWriteRetryBackoff(assignmentId) {
    if (stryMutAct_9fa48("21753")) {
      {}
    } else {
      stryCov_9fa48("21753");
      if (stryMutAct_9fa48("21756") ? false : stryMutAct_9fa48("21755") ? true : stryMutAct_9fa48("21754") ? assignmentId : (stryCov_9fa48("21754", "21755", "21756"), !assignmentId)) {
        if (stryMutAct_9fa48("21757")) {
          {}
        } else {
          stryCov_9fa48("21757");
          return;
        }
      }
      this.nextRenewalWriteRetryAtByAssignmentId.delete(assignmentId);
    }
  }
  shouldAttemptRenewalWrite(assignmentId, now = Date.now()) {
    if (stryMutAct_9fa48("21758")) {
      {}
    } else {
      stryCov_9fa48("21758");
      if (stryMutAct_9fa48("21761") ? false : stryMutAct_9fa48("21760") ? true : stryMutAct_9fa48("21759") ? assignmentId : (stryCov_9fa48("21759", "21760", "21761"), !assignmentId)) {
        if (stryMutAct_9fa48("21762")) {
          {}
        } else {
          stryCov_9fa48("21762");
          return stryMutAct_9fa48("21763") ? false : (stryCov_9fa48("21763"), true);
        }
      }
      const retryAt = stryMutAct_9fa48("21766") ? this.nextRenewalWriteRetryAtByAssignmentId.get(assignmentId) && NUM.ZERO : stryMutAct_9fa48("21765") ? false : stryMutAct_9fa48("21764") ? true : (stryCov_9fa48("21764", "21765", "21766"), this.nextRenewalWriteRetryAtByAssignmentId.get(assignmentId) || NUM.ZERO);
      return stryMutAct_9fa48("21770") ? retryAt > now : stryMutAct_9fa48("21769") ? retryAt < now : stryMutAct_9fa48("21768") ? false : stryMutAct_9fa48("21767") ? true : (stryCov_9fa48("21767", "21768", "21769", "21770"), retryAt <= now);
    }
  }
  buildMoveReplicaAssignmentReplicaOperationRow(reservation, workflowStep, options = {}) {
    if (stryMutAct_9fa48("21771")) {
      {}
    } else {
      stryCov_9fa48("21771");
      return stryMutAct_9fa48("21772") ? {} : (stryCov_9fa48("21772"), {
        operation_id: reservation.assignmentId,
        type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
        partition_id: stryMutAct_9fa48("21775") ? reservation.groupId && null : stryMutAct_9fa48("21774") ? false : stryMutAct_9fa48("21773") ? true : (stryCov_9fa48("21773", "21774", "21775"), reservation.groupId || null),
        replica_id: reservation.replicaId,
        source_node_id: stryMutAct_9fa48("21778") ? reservation.sourceNodeId && null : stryMutAct_9fa48("21777") ? false : stryMutAct_9fa48("21776") ? true : (stryCov_9fa48("21776", "21777", "21778"), reservation.sourceNodeId || null),
        target_node_id: reservation.targetNodeId,
        status: reservation.status,
        workflow_step: workflowStep,
        created_at: Number.isFinite(options.createdAt) ? Math.floor(options.createdAt) : reservation.updatedAt,
        updated_at: reservation.updatedAt,
        completed_at: Number.isFinite(options.completedAt) ? Math.floor(options.completedAt) : null,
        lease_expires_at: Number.isFinite(reservation.leaseExpiresAt) ? Math.floor(reservation.leaseExpiresAt) : null,
        error_message: stryMutAct_9fa48("21781") ? options.errorMessage && null : stryMutAct_9fa48("21780") ? false : stryMutAct_9fa48("21779") ? true : (stryCov_9fa48("21779", "21780", "21781"), options.errorMessage || null),
        steps_history: JSON.stringify(stryMutAct_9fa48("21784") ? reservation.stepsHistory && [] : stryMutAct_9fa48("21783") ? false : stryMutAct_9fa48("21782") ? true : (stryCov_9fa48("21782", "21783", "21784"), reservation.stepsHistory || (stryMutAct_9fa48("21785") ? ["Stryker was here"] : (stryCov_9fa48("21785"), [])))),
        entity_type: SERVICE_TYPE.MESSAGE_GROUP,
        entity_id: stryMutAct_9fa48("21788") ? reservation.groupId && null : stryMutAct_9fa48("21787") ? false : stryMutAct_9fa48("21786") ? true : (stryCov_9fa48("21786", "21787", "21788"), reservation.groupId || null)
      });
    }
  }
  buildMoveReplicaAssignmentReplicaOperationUpdateData(reservation, workflowStep, options = {}) {
    if (stryMutAct_9fa48("21789")) {
      {}
    } else {
      stryCov_9fa48("21789");
      return stryMutAct_9fa48("21790") ? {} : (stryCov_9fa48("21790"), {
        status: reservation.status,
        workflow_step: workflowStep,
        updated_at: reservation.updatedAt,
        completed_at: Number.isFinite(options.completedAt) ? Math.floor(options.completedAt) : null,
        lease_expires_at: Number.isFinite(reservation.leaseExpiresAt) ? Math.floor(reservation.leaseExpiresAt) : null,
        error_message: stryMutAct_9fa48("21793") ? options.errorMessage && null : stryMutAct_9fa48("21792") ? false : stryMutAct_9fa48("21791") ? true : (stryCov_9fa48("21791", "21792", "21793"), options.errorMessage || null),
        steps_history: JSON.stringify(stryMutAct_9fa48("21796") ? reservation.stepsHistory && [] : stryMutAct_9fa48("21795") ? false : stryMutAct_9fa48("21794") ? true : (stryCov_9fa48("21794", "21795", "21796"), reservation.stepsHistory || (stryMutAct_9fa48("21797") ? ["Stryker was here"] : (stryCov_9fa48("21797"), []))))
      });
    }
  }
  getMoveReplicaAssignmentRowsFromCache() {
    if (stryMutAct_9fa48("21798")) {
      {}
    } else {
      stryCov_9fa48("21798");
      const systemTableCache = this.getSystemTableCache();
      const isMoveReplicaAssignmentRow = row => {
        if (stryMutAct_9fa48("21799")) {
          {}
        } else {
          stryCov_9fa48("21799");
          const type = stryMutAct_9fa48("21802") ? (row?.type || row?.operation_type) && null : stryMutAct_9fa48("21801") ? false : stryMutAct_9fa48("21800") ? true : (stryCov_9fa48("21800", "21801", "21802"), (stryMutAct_9fa48("21804") ? row?.type && row?.operation_type : stryMutAct_9fa48("21803") ? false : (stryCov_9fa48("21803", "21804"), (stryMutAct_9fa48("21805") ? row.type : (stryCov_9fa48("21805"), row?.type)) || (stryMutAct_9fa48("21806") ? row.operation_type : (stryCov_9fa48("21806"), row?.operation_type)))) || null);
          return stryMutAct_9fa48("21809") ? type !== BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE : stryMutAct_9fa48("21808") ? false : stryMutAct_9fa48("21807") ? true : (stryCov_9fa48("21807", "21808", "21809"), type === BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE);
        }
      };
      if (stryMutAct_9fa48("21812") ? typeof systemTableCache?.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("21811") ? false : stryMutAct_9fa48("21810") ? true : (stryCov_9fa48("21810", "21811", "21812"), typeof (stryMutAct_9fa48("21813") ? systemTableCache.filter : (stryCov_9fa48("21813"), systemTableCache?.filter)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("21814")) {
          {}
        } else {
          stryCov_9fa48("21814");
          return stryMutAct_9fa48("21817") ? systemTableCache.filter(TABLES.REPLICA_OPERATIONS, isMoveReplicaAssignmentRow) && [] : stryMutAct_9fa48("21816") ? false : stryMutAct_9fa48("21815") ? true : (stryCov_9fa48("21815", "21816", "21817"), (stryMutAct_9fa48("21818") ? systemTableCache : (stryCov_9fa48("21818"), systemTableCache.filter(TABLES.REPLICA_OPERATIONS, isMoveReplicaAssignmentRow))) || (stryMutAct_9fa48("21819") ? ["Stryker was here"] : (stryCov_9fa48("21819"), [])));
        }
      }
      if (stryMutAct_9fa48("21822") ? typeof systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("21821") ? false : stryMutAct_9fa48("21820") ? true : (stryCov_9fa48("21820", "21821", "21822"), typeof (stryMutAct_9fa48("21823") ? systemTableCache.getAll : (stryCov_9fa48("21823"), systemTableCache?.getAll)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("21824")) {
          {}
        } else {
          stryCov_9fa48("21824");
          return stryMutAct_9fa48("21825") ? systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [] : (stryCov_9fa48("21825"), (stryMutAct_9fa48("21828") ? systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) && [] : stryMutAct_9fa48("21827") ? false : stryMutAct_9fa48("21826") ? true : (stryCov_9fa48("21826", "21827", "21828"), systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || (stryMutAct_9fa48("21829") ? ["Stryker was here"] : (stryCov_9fa48("21829"), [])))).filter(isMoveReplicaAssignmentRow));
        }
      }
      return null;
    }
  }
  collectMoveReplicaAssignmentReservationsFromRows(rows, byAssignmentId) {
    if (stryMutAct_9fa48("21830")) {
      {}
    } else {
      stryCov_9fa48("21830");
      const reservations = this.getMoveReplicaAssignmentReservations();
      for (const row of Array.isArray(rows) ? rows : stryMutAct_9fa48("21831") ? ["Stryker was here"] : (stryCov_9fa48("21831"), [])) {
        if (stryMutAct_9fa48("21832")) {
          {}
        } else {
          stryCov_9fa48("21832");
          const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
          if (stryMutAct_9fa48("21835") ? false : stryMutAct_9fa48("21834") ? true : stryMutAct_9fa48("21833") ? normalized : (stryCov_9fa48("21833", "21834", "21835"), !normalized)) {
            if (stryMutAct_9fa48("21836")) {
              {}
            } else {
              stryCov_9fa48("21836");
              continue;
            }
          }
          byAssignmentId.set(normalized.assignmentId, normalized);
          stryMutAct_9fa48("21837") ? reservations.set(normalized.assignmentId, normalized) : (stryCov_9fa48("21837"), reservations?.set(normalized.assignmentId, normalized));
        }
      }
    }
  }
  async collectMoveReplicaAssignmentReservations(options = {}) {
    if (stryMutAct_9fa48("21838")) {
      {}
    } else {
      stryCov_9fa48("21838");
      const now = Number.isFinite(options.now) ? Math.floor(options.now) : Date.now();
      const byAssignmentId = new Map();
      const reservations = this.getMoveReplicaAssignmentReservations();
      for (const reservation of stryMutAct_9fa48("21841") ? reservations?.values?.() && [] : stryMutAct_9fa48("21840") ? false : stryMutAct_9fa48("21839") ? true : (stryCov_9fa48("21839", "21840", "21841"), (stryMutAct_9fa48("21843") ? reservations.values?.() : stryMutAct_9fa48("21842") ? reservations?.values() : (stryCov_9fa48("21842", "21843"), reservations?.values?.())) || (stryMutAct_9fa48("21844") ? ["Stryker was here"] : (stryCov_9fa48("21844"), [])))) {
        if (stryMutAct_9fa48("21845")) {
          {}
        } else {
          stryCov_9fa48("21845");
          const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
          if (stryMutAct_9fa48("21848") ? false : stryMutAct_9fa48("21847") ? true : stryMutAct_9fa48("21846") ? normalized : (stryCov_9fa48("21846", "21847", "21848"), !normalized)) {
            if (stryMutAct_9fa48("21849")) {
              {}
            } else {
              stryCov_9fa48("21849");
              continue;
            }
          }
          byAssignmentId.set(normalized.assignmentId, normalized);
        }
      }
      const cacheRows = this.getMoveReplicaAssignmentRowsFromCache();
      if (stryMutAct_9fa48("21852") ? Array.isArray(cacheRows) || cacheRows.length > NUM.ZERO : stryMutAct_9fa48("21851") ? false : stryMutAct_9fa48("21850") ? true : (stryCov_9fa48("21850", "21851", "21852"), Array.isArray(cacheRows) && (stryMutAct_9fa48("21855") ? cacheRows.length <= NUM.ZERO : stryMutAct_9fa48("21854") ? cacheRows.length >= NUM.ZERO : stryMutAct_9fa48("21853") ? true : (stryCov_9fa48("21853", "21854", "21855"), cacheRows.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("21856")) {
          {}
        } else {
          stryCov_9fa48("21856");
          this.collectMoveReplicaAssignmentReservationsFromRows(cacheRows, byAssignmentId);
          return stryMutAct_9fa48("21857") ? [] : (stryCov_9fa48("21857"), [...byAssignmentId.values()]);
        }
      }
      if (stryMutAct_9fa48("21861") ? byAssignmentId.size <= NUM.ZERO : stryMutAct_9fa48("21860") ? byAssignmentId.size >= NUM.ZERO : stryMutAct_9fa48("21859") ? false : stryMutAct_9fa48("21858") ? true : (stryCov_9fa48("21858", "21859", "21860", "21861"), byAssignmentId.size > NUM.ZERO)) {
        if (stryMutAct_9fa48("21862")) {
          {}
        } else {
          stryCov_9fa48("21862");
          return stryMutAct_9fa48("21863") ? [] : (stryCov_9fa48("21863"), [...byAssignmentId.values()]);
        }
      }
      if (stryMutAct_9fa48("21866") ? !this.getSqlQueryEngine() && !this.shouldAttemptReservationSqlRefresh(now) : stryMutAct_9fa48("21865") ? false : stryMutAct_9fa48("21864") ? true : (stryCov_9fa48("21864", "21865", "21866"), (stryMutAct_9fa48("21867") ? this.getSqlQueryEngine() : (stryCov_9fa48("21867"), !this.getSqlQueryEngine())) || (stryMutAct_9fa48("21868") ? this.shouldAttemptReservationSqlRefresh(now) : (stryCov_9fa48("21868"), !this.shouldAttemptReservationSqlRefresh(now))))) {
        if (stryMutAct_9fa48("21869")) {
          {}
        } else {
          stryCov_9fa48("21869");
          return stryMutAct_9fa48("21870") ? [] : (stryCov_9fa48("21870"), [...byAssignmentId.values()]);
        }
      }
      let queryResult = null;
      try {
        if (stryMutAct_9fa48("21871")) {
          {}
        } else {
          stryCov_9fa48("21871");
          queryResult = await this.executeBootstrapControlPlaneQuery(BOOTSTRAP_API_SQL.SELECT_MOVE_ASSIGNMENT_RESERVATIONS, stryMutAct_9fa48("21872") ? [] : (stryCov_9fa48("21872"), [BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE]));
        }
      } catch (error) {
        if (stryMutAct_9fa48("21873")) {
          {}
        } else {
          stryCov_9fa48("21873");
          if (stryMutAct_9fa48("21875") ? false : stryMutAct_9fa48("21874") ? true : (stryCov_9fa48("21874", "21875"), this.isRetryableMoveReplicaAssignmentPersistenceFailure(error))) {
            if (stryMutAct_9fa48("21876")) {
              {}
            } else {
              stryCov_9fa48("21876");
              this.armReservationSqlRetryBackoff(error, now);
            }
          }
          return stryMutAct_9fa48("21877") ? [] : (stryCov_9fa48("21877"), [...byAssignmentId.values()]);
        }
      }
      if (stryMutAct_9fa48("21880") ? queryResult?.success !== false : stryMutAct_9fa48("21879") ? false : stryMutAct_9fa48("21878") ? true : (stryCov_9fa48("21878", "21879", "21880"), (stryMutAct_9fa48("21881") ? queryResult.success : (stryCov_9fa48("21881"), queryResult?.success)) === (stryMutAct_9fa48("21882") ? true : (stryCov_9fa48("21882"), false)))) {
        if (stryMutAct_9fa48("21883")) {
          {}
        } else {
          stryCov_9fa48("21883");
          if (stryMutAct_9fa48("21885") ? false : stryMutAct_9fa48("21884") ? true : (stryCov_9fa48("21884", "21885"), this.isRetryableMoveReplicaAssignmentPersistenceFailure(queryResult))) {
            if (stryMutAct_9fa48("21886")) {
              {}
            } else {
              stryCov_9fa48("21886");
              this.armReservationSqlRetryBackoff(queryResult, now);
            }
          }
          return stryMutAct_9fa48("21887") ? [] : (stryCov_9fa48("21887"), [...byAssignmentId.values()]);
        }
      }
      this.clearReservationSqlRetryBackoff();
      this.collectMoveReplicaAssignmentReservationsFromRows(stryMutAct_9fa48("21888") ? queryResult.rows : (stryCov_9fa48("21888"), queryResult?.rows), byAssignmentId);
      return stryMutAct_9fa48("21889") ? [] : (stryCov_9fa48("21889"), [...byAssignmentId.values()]);
    }
  }
  isMoveReplicaHandoffRequest(serviceData) {
    if (stryMutAct_9fa48("21890")) {
      {}
    } else {
      stryCov_9fa48("21890");
      const serviceId = stryMutAct_9fa48("21891") ? serviceData[COLUMN.SERVICE_ID] : (stryCov_9fa48("21891"), serviceData?.[COLUMN.SERVICE_ID]);
      const serviceType = stryMutAct_9fa48("21892") ? serviceData[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("21892"), serviceData?.[COLUMN.SERVICE_TYPE]);
      const targetNodeId = stryMutAct_9fa48("21893") ? serviceData[COLUMN.NODE_ID] : (stryCov_9fa48("21893"), serviceData?.[COLUMN.NODE_ID]);
      const assignmentId = stryMutAct_9fa48("21894") ? serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID] : (stryCov_9fa48("21894"), serviceData?.[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID]);
      if (stryMutAct_9fa48("21897") ? !serviceId && !targetNodeId : stryMutAct_9fa48("21896") ? false : stryMutAct_9fa48("21895") ? true : (stryCov_9fa48("21895", "21896", "21897"), (stryMutAct_9fa48("21898") ? serviceId : (stryCov_9fa48("21898"), !serviceId)) || (stryMutAct_9fa48("21899") ? targetNodeId : (stryCov_9fa48("21899"), !targetNodeId)))) {
        if (stryMutAct_9fa48("21900")) {
          {}
        } else {
          stryCov_9fa48("21900");
          return stryMutAct_9fa48("21901") ? true : (stryCov_9fa48("21901"), false);
        }
      }
      if (stryMutAct_9fa48("21904") ? serviceType === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("21903") ? false : stryMutAct_9fa48("21902") ? true : (stryCov_9fa48("21902", "21903", "21904"), serviceType !== SERVICE_TYPE.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("21905")) {
          {}
        } else {
          stryCov_9fa48("21905");
          return stryMutAct_9fa48("21906") ? true : (stryCov_9fa48("21906"), false);
        }
      }
      if (stryMutAct_9fa48("21909") ? targetNodeId !== this.getSeedNodeId() : stryMutAct_9fa48("21908") ? false : stryMutAct_9fa48("21907") ? true : (stryCov_9fa48("21907", "21908", "21909"), targetNodeId === this.getSeedNodeId())) {
        if (stryMutAct_9fa48("21910")) {
          {}
        } else {
          stryCov_9fa48("21910");
          return stryMutAct_9fa48("21911") ? true : (stryCov_9fa48("21911"), false);
        }
      }
      if (stryMutAct_9fa48("21914") ? typeof assignmentId === TYPEOF.STRING || assignmentId.length > NUM.ZERO : stryMutAct_9fa48("21913") ? false : stryMutAct_9fa48("21912") ? true : (stryCov_9fa48("21912", "21913", "21914"), (stryMutAct_9fa48("21916") ? typeof assignmentId !== TYPEOF.STRING : stryMutAct_9fa48("21915") ? true : (stryCov_9fa48("21915", "21916"), typeof assignmentId === TYPEOF.STRING)) && (stryMutAct_9fa48("21919") ? assignmentId.length <= NUM.ZERO : stryMutAct_9fa48("21918") ? assignmentId.length >= NUM.ZERO : stryMutAct_9fa48("21917") ? true : (stryCov_9fa48("21917", "21918", "21919"), assignmentId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("21920")) {
          {}
        } else {
          stryCov_9fa48("21920");
          return stryMutAct_9fa48("21921") ? false : (stryCov_9fa48("21921"), true);
        }
      }
      return stryMutAct_9fa48("21924") ? this.getMessageGroupServices()?.has?.(serviceId) !== true : stryMutAct_9fa48("21923") ? false : stryMutAct_9fa48("21922") ? true : (stryCov_9fa48("21922", "21923", "21924"), (stryMutAct_9fa48("21926") ? this.getMessageGroupServices().has?.(serviceId) : stryMutAct_9fa48("21925") ? this.getMessageGroupServices()?.has(serviceId) : (stryCov_9fa48("21925", "21926"), this.getMessageGroupServices()?.has?.(serviceId))) === (stryMutAct_9fa48("21927") ? false : (stryCov_9fa48("21927"), true)));
    }
  }
  async getMoveReplicaAssignmentReservationById(assignmentId) {
    if (stryMutAct_9fa48("21928")) {
      {}
    } else {
      stryCov_9fa48("21928");
      const reservations = this.getMoveReplicaAssignmentReservations();
      const cached = this.normalizeMoveReplicaAssignmentReservationRow(stryMutAct_9fa48("21929") ? reservations.get(assignmentId) : (stryCov_9fa48("21929"), reservations?.get(assignmentId)));
      if (stryMutAct_9fa48("21931") ? false : stryMutAct_9fa48("21930") ? true : (stryCov_9fa48("21930", "21931"), cached)) {
        if (stryMutAct_9fa48("21932")) {
          {}
        } else {
          stryCov_9fa48("21932");
          return stryMutAct_9fa48("21933") ? {} : (stryCov_9fa48("21933"), {
            reservation: cached,
            lookupUnavailable: stryMutAct_9fa48("21934") ? true : (stryCov_9fa48("21934"), false),
            error: null
          });
        }
      }
      const cachedRow = this.normalizeMoveReplicaAssignmentReservationRow(stryMutAct_9fa48("21935") ? this.getSystemTableCache().get(TABLES.REPLICA_OPERATIONS, assignmentId) : (stryCov_9fa48("21935"), this.getSystemTableCache()?.get(TABLES.REPLICA_OPERATIONS, assignmentId)));
      if (stryMutAct_9fa48("21937") ? false : stryMutAct_9fa48("21936") ? true : (stryCov_9fa48("21936", "21937"), cachedRow)) {
        if (stryMutAct_9fa48("21938")) {
          {}
        } else {
          stryCov_9fa48("21938");
          stryMutAct_9fa48("21939") ? reservations.set(assignmentId, cachedRow) : (stryCov_9fa48("21939"), reservations?.set(assignmentId, cachedRow));
          return stryMutAct_9fa48("21940") ? {} : (stryCov_9fa48("21940"), {
            reservation: cachedRow,
            lookupUnavailable: stryMutAct_9fa48("21941") ? true : (stryCov_9fa48("21941"), false),
            error: null
          });
        }
      }
      if (stryMutAct_9fa48("21944") ? false : stryMutAct_9fa48("21943") ? true : stryMutAct_9fa48("21942") ? this.getSqlQueryEngine() : (stryCov_9fa48("21942", "21943", "21944"), !this.getSqlQueryEngine())) {
        if (stryMutAct_9fa48("21945")) {
          {}
        } else {
          stryCov_9fa48("21945");
          return stryMutAct_9fa48("21946") ? {} : (stryCov_9fa48("21946"), {
            reservation: null,
            lookupUnavailable: stryMutAct_9fa48("21947") ? true : (stryCov_9fa48("21947"), false),
            error: null
          });
        }
      }
      let queryResult = null;
      try {
        if (stryMutAct_9fa48("21948")) {
          {}
        } else {
          stryCov_9fa48("21948");
          queryResult = await this.executeBootstrapControlPlaneQuery(BOOTSTRAP_API_SQL.SELECT_REPLICA_OPERATION_BY_ID, stryMutAct_9fa48("21949") ? [] : (stryCov_9fa48("21949"), [assignmentId]));
        }
      } catch (error) {
        if (stryMutAct_9fa48("21950")) {
          {}
        } else {
          stryCov_9fa48("21950");
          return stryMutAct_9fa48("21951") ? {} : (stryCov_9fa48("21951"), {
            reservation: null,
            lookupUnavailable: stryMutAct_9fa48("21952") ? false : (stryCov_9fa48("21952"), true),
            error: stryMutAct_9fa48("21955") ? error?.message && String(error) : stryMutAct_9fa48("21954") ? false : stryMutAct_9fa48("21953") ? true : (stryCov_9fa48("21953", "21954", "21955"), (stryMutAct_9fa48("21956") ? error.message : (stryCov_9fa48("21956"), error?.message)) || String(error))
          });
        }
      }
      if (stryMutAct_9fa48("21959") ? queryResult?.success !== false : stryMutAct_9fa48("21958") ? false : stryMutAct_9fa48("21957") ? true : (stryCov_9fa48("21957", "21958", "21959"), (stryMutAct_9fa48("21960") ? queryResult.success : (stryCov_9fa48("21960"), queryResult?.success)) === (stryMutAct_9fa48("21961") ? true : (stryCov_9fa48("21961"), false)))) {
        if (stryMutAct_9fa48("21962")) {
          {}
        } else {
          stryCov_9fa48("21962");
          return stryMutAct_9fa48("21963") ? {} : (stryCov_9fa48("21963"), {
            reservation: null,
            lookupUnavailable: stryMutAct_9fa48("21964") ? false : (stryCov_9fa48("21964"), true),
            error: stryMutAct_9fa48("21967") ? queryResult.error && BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE : stryMutAct_9fa48("21966") ? false : stryMutAct_9fa48("21965") ? true : (stryCov_9fa48("21965", "21966", "21967"), queryResult.error || BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE)
          });
        }
      }
      const row = Array.isArray(stryMutAct_9fa48("21968") ? queryResult.rows : (stryCov_9fa48("21968"), queryResult?.rows)) ? queryResult.rows[NUM.ZERO] : null;
      if (stryMutAct_9fa48("21971") ? false : stryMutAct_9fa48("21970") ? true : stryMutAct_9fa48("21969") ? row : (stryCov_9fa48("21969", "21970", "21971"), !row)) {
        if (stryMutAct_9fa48("21972")) {
          {}
        } else {
          stryCov_9fa48("21972");
          return stryMutAct_9fa48("21973") ? {} : (stryCov_9fa48("21973"), {
            reservation: null,
            lookupUnavailable: stryMutAct_9fa48("21974") ? true : (stryCov_9fa48("21974"), false),
            error: null
          });
        }
      }
      const type = stryMutAct_9fa48("21977") ? (row.type || row.operation_type) && null : stryMutAct_9fa48("21976") ? false : stryMutAct_9fa48("21975") ? true : (stryCov_9fa48("21975", "21976", "21977"), (stryMutAct_9fa48("21979") ? row.type && row.operation_type : stryMutAct_9fa48("21978") ? false : (stryCov_9fa48("21978", "21979"), row.type || row.operation_type)) || null);
      if (stryMutAct_9fa48("21982") ? type === BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE : stryMutAct_9fa48("21981") ? false : stryMutAct_9fa48("21980") ? true : (stryCov_9fa48("21980", "21981", "21982"), type !== BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE)) {
        if (stryMutAct_9fa48("21983")) {
          {}
        } else {
          stryCov_9fa48("21983");
          return stryMutAct_9fa48("21984") ? {} : (stryCov_9fa48("21984"), {
            reservation: null,
            lookupUnavailable: stryMutAct_9fa48("21985") ? true : (stryCov_9fa48("21985"), false),
            error: null
          });
        }
      }
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
      if (stryMutAct_9fa48("21988") ? false : stryMutAct_9fa48("21987") ? true : stryMutAct_9fa48("21986") ? normalized : (stryCov_9fa48("21986", "21987", "21988"), !normalized)) {
        if (stryMutAct_9fa48("21989")) {
          {}
        } else {
          stryCov_9fa48("21989");
          return stryMutAct_9fa48("21990") ? {} : (stryCov_9fa48("21990"), {
            reservation: null,
            lookupUnavailable: stryMutAct_9fa48("21991") ? true : (stryCov_9fa48("21991"), false),
            error: null
          });
        }
      }
      stryMutAct_9fa48("21992") ? reservations.set(assignmentId, normalized) : (stryCov_9fa48("21992"), reservations?.set(assignmentId, normalized));
      return stryMutAct_9fa48("21993") ? {} : (stryCov_9fa48("21993"), {
        reservation: normalized,
        lookupUnavailable: stryMutAct_9fa48("21994") ? true : (stryCov_9fa48("21994"), false),
        error: null
      });
    }
  }
  async validateMoveReplicaAssignmentToken(serviceData) {
    if (stryMutAct_9fa48("21995")) {
      {}
    } else {
      stryCov_9fa48("21995");
      if (stryMutAct_9fa48("21998") ? false : stryMutAct_9fa48("21997") ? true : stryMutAct_9fa48("21996") ? this.isMoveReplicaHandoffRequest(serviceData) : (stryCov_9fa48("21996", "21997", "21998"), !this.isMoveReplicaHandoffRequest(serviceData))) {
        if (stryMutAct_9fa48("21999")) {
          {}
        } else {
          stryCov_9fa48("21999");
          return null;
        }
      }
      const assignmentId = serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID];
      if (stryMutAct_9fa48("22002") ? typeof assignmentId !== TYPEOF.STRING && assignmentId.length === NUM.ZERO : stryMutAct_9fa48("22001") ? false : stryMutAct_9fa48("22000") ? true : (stryCov_9fa48("22000", "22001", "22002"), (stryMutAct_9fa48("22004") ? typeof assignmentId === TYPEOF.STRING : stryMutAct_9fa48("22003") ? false : (stryCov_9fa48("22003", "22004"), typeof assignmentId !== TYPEOF.STRING)) || (stryMutAct_9fa48("22006") ? assignmentId.length !== NUM.ZERO : stryMutAct_9fa48("22005") ? false : (stryCov_9fa48("22005", "22006"), assignmentId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("22007")) {
          {}
        } else {
          stryCov_9fa48("22007");
          throw this.buildRegisterServiceValidationError(HTTP_STATUS.BAD_REQUEST, BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_REQUIRED, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_REQUIRED);
        }
      }
      const reservationLookup = await this.getMoveReplicaAssignmentReservationById(assignmentId);
      if (stryMutAct_9fa48("22009") ? false : stryMutAct_9fa48("22008") ? true : (stryCov_9fa48("22008", "22009"), reservationLookup.lookupUnavailable)) {
        if (stryMutAct_9fa48("22010")) {
          {}
        } else {
          stryCov_9fa48("22010");
          throw this.buildRegisterServiceValidationError(HTTP_STATUS.SERVICE_UNAVAILABLE, BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE, stryMutAct_9fa48("22011") ? {} : (stryCov_9fa48("22011"), {
            retryAfterMs: this.getMoveReplicaAssignmentSweepIntervalMs(),
            details: stryMutAct_9fa48("22012") ? {} : (stryCov_9fa48("22012"), {
              assignmentId,
              cause: stryMutAct_9fa48("22015") ? reservationLookup.error && BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE : stryMutAct_9fa48("22014") ? false : stryMutAct_9fa48("22013") ? true : (stryCov_9fa48("22013", "22014", "22015"), reservationLookup.error || BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE)
            })
          }));
        }
      }
      const reservation = reservationLookup.reservation;
      if (stryMutAct_9fa48("22018") ? !reservation && BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status) : stryMutAct_9fa48("22017") ? false : stryMutAct_9fa48("22016") ? true : (stryCov_9fa48("22016", "22017", "22018"), (stryMutAct_9fa48("22019") ? reservation : (stryCov_9fa48("22019"), !reservation)) || BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22020")) {
          {}
        } else {
          stryCov_9fa48("22020");
          throw this.buildRegisterServiceValidationError(HTTP_STATUS.CONFLICT, BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_UNKNOWN, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_UNKNOWN);
        }
      }
      const requestedReplicaId = stryMutAct_9fa48("22023") ? serviceData[COLUMN.REPLICA_ID] && serviceData[COLUMN.SERVICE_ID] : stryMutAct_9fa48("22022") ? false : stryMutAct_9fa48("22021") ? true : (stryCov_9fa48("22021", "22022", "22023"), serviceData[COLUMN.REPLICA_ID] || serviceData[COLUMN.SERVICE_ID]);
      const requestedNodeId = serviceData[COLUMN.NODE_ID];
      if (stryMutAct_9fa48("22026") ? (reservation.replicaId !== requestedReplicaId || reservation.targetNodeId !== requestedNodeId) && reservation.groupId && serviceData[COLUMN.GROUP_ID] && reservation.groupId !== serviceData[COLUMN.GROUP_ID] : stryMutAct_9fa48("22025") ? false : stryMutAct_9fa48("22024") ? true : (stryCov_9fa48("22024", "22025", "22026"), (stryMutAct_9fa48("22028") ? reservation.replicaId !== requestedReplicaId && reservation.targetNodeId !== requestedNodeId : stryMutAct_9fa48("22027") ? false : (stryCov_9fa48("22027", "22028"), (stryMutAct_9fa48("22030") ? reservation.replicaId === requestedReplicaId : stryMutAct_9fa48("22029") ? false : (stryCov_9fa48("22029", "22030"), reservation.replicaId !== requestedReplicaId)) || (stryMutAct_9fa48("22032") ? reservation.targetNodeId === requestedNodeId : stryMutAct_9fa48("22031") ? false : (stryCov_9fa48("22031", "22032"), reservation.targetNodeId !== requestedNodeId)))) || (stryMutAct_9fa48("22034") ? reservation.groupId && serviceData[COLUMN.GROUP_ID] || reservation.groupId !== serviceData[COLUMN.GROUP_ID] : stryMutAct_9fa48("22033") ? false : (stryCov_9fa48("22033", "22034"), (stryMutAct_9fa48("22036") ? reservation.groupId || serviceData[COLUMN.GROUP_ID] : stryMutAct_9fa48("22035") ? true : (stryCov_9fa48("22035", "22036"), reservation.groupId && serviceData[COLUMN.GROUP_ID])) && (stryMutAct_9fa48("22038") ? reservation.groupId === serviceData[COLUMN.GROUP_ID] : stryMutAct_9fa48("22037") ? true : (stryCov_9fa48("22037", "22038"), reservation.groupId !== serviceData[COLUMN.GROUP_ID])))))) {
        if (stryMutAct_9fa48("22039")) {
          {}
        } else {
          stryCov_9fa48("22039");
          throw this.buildRegisterServiceValidationError(HTTP_STATUS.CONFLICT, BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_MISMATCH, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_MISMATCH);
        }
      }
      const now = Date.now();
      if (stryMutAct_9fa48("22042") ? !Number.isFinite(reservation.leaseExpiresAt) && reservation.leaseExpiresAt <= now : stryMutAct_9fa48("22041") ? false : stryMutAct_9fa48("22040") ? true : (stryCov_9fa48("22040", "22041", "22042"), (stryMutAct_9fa48("22043") ? Number.isFinite(reservation.leaseExpiresAt) : (stryCov_9fa48("22043"), !Number.isFinite(reservation.leaseExpiresAt))) || (stryMutAct_9fa48("22046") ? reservation.leaseExpiresAt > now : stryMutAct_9fa48("22045") ? reservation.leaseExpiresAt < now : stryMutAct_9fa48("22044") ? false : (stryCov_9fa48("22044", "22045", "22046"), reservation.leaseExpiresAt <= now)))) {
        if (stryMutAct_9fa48("22047")) {
          {}
        } else {
          stryCov_9fa48("22047");
          const renewedReservation = await this.renewMoveReplicaAssignmentReservation(reservation, stryMutAct_9fa48("22048") ? {} : (stryCov_9fa48("22048"), {
            now,
            force: stryMutAct_9fa48("22049") ? false : (stryCov_9fa48("22049"), true),
            phase: stryMutAct_9fa48("22050") ? "" : (stryCov_9fa48("22050"), 'lease_renewed')
          }));
          if (stryMutAct_9fa48("22052") ? false : stryMutAct_9fa48("22051") ? true : (stryCov_9fa48("22051", "22052"), renewedReservation)) {
            if (stryMutAct_9fa48("22053")) {
              {}
            } else {
              stryCov_9fa48("22053");
              return renewedReservation;
            }
          }
          await this.markMoveReplicaAssignmentReservationTerminal(assignmentId, BOOTSTRAP_API_HANDOFF_STATUS.FAILED, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("22054") ? "" : (stryCov_9fa48("22054"), 'assignment token expired'));
          throw this.buildRegisterServiceValidationError(HTTP_STATUS.CONFLICT, BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_EXPIRED, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_EXPIRED);
        }
      }
      return this.renewMoveReplicaAssignmentReservation(reservation, stryMutAct_9fa48("22055") ? {} : (stryCov_9fa48("22055"), {
        now,
        force: stryMutAct_9fa48("22056") ? true : (stryCov_9fa48("22056"), false),
        phase: stryMutAct_9fa48("22057") ? "" : (stryCov_9fa48("22057"), 'validated')
      }));
    }
  }
  shouldRenewMoveReplicaAssignmentReservation(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22058")) {
      {}
    } else {
      stryCov_9fa48("22058");
      if (stryMutAct_9fa48("22061") ? false : stryMutAct_9fa48("22060") ? true : stryMutAct_9fa48("22059") ? Number.isFinite(reservation?.leaseExpiresAt) : (stryCov_9fa48("22059", "22060", "22061"), !Number.isFinite(stryMutAct_9fa48("22062") ? reservation.leaseExpiresAt : (stryCov_9fa48("22062"), reservation?.leaseExpiresAt)))) {
        if (stryMutAct_9fa48("22063")) {
          {}
        } else {
          stryCov_9fa48("22063");
          return stryMutAct_9fa48("22064") ? true : (stryCov_9fa48("22064"), false);
        }
      }
      const renewalWindowMs = stryMutAct_9fa48("22065") ? Math.min(NUM.ONE, Math.floor(this.getMoveReplicaAssignmentLeaseMs() / NUM.TWO)) : (stryCov_9fa48("22065"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("22066") ? this.getMoveReplicaAssignmentLeaseMs() * NUM.TWO : (stryCov_9fa48("22066"), this.getMoveReplicaAssignmentLeaseMs() / NUM.TWO))));
      return stryMutAct_9fa48("22070") ? reservation.leaseExpiresAt - now > renewalWindowMs : stryMutAct_9fa48("22069") ? reservation.leaseExpiresAt - now < renewalWindowMs : stryMutAct_9fa48("22068") ? false : stryMutAct_9fa48("22067") ? true : (stryCov_9fa48("22067", "22068", "22069", "22070"), (stryMutAct_9fa48("22071") ? reservation.leaseExpiresAt + now : (stryCov_9fa48("22071"), reservation.leaseExpiresAt - now)) <= renewalWindowMs);
    }
  }
  async renewMoveReplicaAssignmentReservation(reservation, options = {}) {
    if (stryMutAct_9fa48("22072")) {
      {}
    } else {
      stryCov_9fa48("22072");
      if (stryMutAct_9fa48("22075") ? false : stryMutAct_9fa48("22074") ? true : stryMutAct_9fa48("22073") ? reservation?.assignmentId : (stryCov_9fa48("22073", "22074", "22075"), !(stryMutAct_9fa48("22076") ? reservation.assignmentId : (stryCov_9fa48("22076"), reservation?.assignmentId)))) {
        if (stryMutAct_9fa48("22077")) {
          {}
        } else {
          stryCov_9fa48("22077");
          return null;
        }
      }
      const now = Number.isFinite(options.now) ? Math.floor(options.now) : Date.now();
      const force = stryMutAct_9fa48("22080") ? options.force !== true : stryMutAct_9fa48("22079") ? false : stryMutAct_9fa48("22078") ? true : (stryCov_9fa48("22078", "22079", "22080"), options.force === (stryMutAct_9fa48("22081") ? false : (stryCov_9fa48("22081"), true)));
      const phase = (stryMutAct_9fa48("22084") ? typeof options.phase === TYPEOF.STRING || options.phase.length > NUM.ZERO : stryMutAct_9fa48("22083") ? false : stryMutAct_9fa48("22082") ? true : (stryCov_9fa48("22082", "22083", "22084"), (stryMutAct_9fa48("22086") ? typeof options.phase !== TYPEOF.STRING : stryMutAct_9fa48("22085") ? true : (stryCov_9fa48("22085", "22086"), typeof options.phase === TYPEOF.STRING)) && (stryMutAct_9fa48("22089") ? options.phase.length <= NUM.ZERO : stryMutAct_9fa48("22088") ? options.phase.length >= NUM.ZERO : stryMutAct_9fa48("22087") ? true : (stryCov_9fa48("22087", "22088", "22089"), options.phase.length > NUM.ZERO)))) ? options.phase : stryMutAct_9fa48("22090") ? "" : (stryCov_9fa48("22090"), 'lease_renewed');
      if (stryMutAct_9fa48("22092") ? false : stryMutAct_9fa48("22091") ? true : (stryCov_9fa48("22091", "22092"), force)) {
        if (stryMutAct_9fa48("22093")) {
          {}
        } else {
          stryCov_9fa48("22093");
          if (stryMutAct_9fa48("22096") ? false : stryMutAct_9fa48("22095") ? true : stryMutAct_9fa48("22094") ? this.canReviveExpiredMoveReplicaAssignmentReservation(reservation) : (stryCov_9fa48("22094", "22095", "22096"), !this.canReviveExpiredMoveReplicaAssignmentReservation(reservation))) {
            if (stryMutAct_9fa48("22097")) {
              {}
            } else {
              stryCov_9fa48("22097");
              return null;
            }
          }
        }
      } else if (stryMutAct_9fa48("22100") ? false : stryMutAct_9fa48("22099") ? true : stryMutAct_9fa48("22098") ? this.shouldRenewMoveReplicaAssignmentReservation(reservation, now) : (stryCov_9fa48("22098", "22099", "22100"), !this.shouldRenewMoveReplicaAssignmentReservation(reservation, now))) {
        if (stryMutAct_9fa48("22101")) {
          {}
        } else {
          stryCov_9fa48("22101");
          return reservation;
        }
      }
      const status = stryMutAct_9fa48("22104") ? reservation.status && BOOTSTRAP_API_HANDOFF_STATUS.PREPARING : stryMutAct_9fa48("22103") ? false : stryMutAct_9fa48("22102") ? true : (stryCov_9fa48("22102", "22103", "22104"), reservation.status || BOOTSTRAP_API_HANDOFF_STATUS.PREPARING);
      const step = WORKFLOW_STEP.PENDING;
      const leaseExpiresAt = stryMutAct_9fa48("22105") ? now - this.getMoveReplicaAssignmentLeaseMs() : (stryCov_9fa48("22105"), now + this.getMoveReplicaAssignmentLeaseMs());
      const existingStepsHistory = Array.isArray(reservation.stepsHistory) ? reservation.stepsHistory : stryMutAct_9fa48("22106") ? ["Stryker was here"] : (stryCov_9fa48("22106"), []);
      const stepsHistory = stryMutAct_9fa48("22107") ? [] : (stryCov_9fa48("22107"), [...existingStepsHistory, stryMutAct_9fa48("22108") ? {} : (stryCov_9fa48("22108"), {
        phase,
        step,
        status,
        timestamp: now,
        leaseExpiresAt
      })]);
      const renewedReservation = stryMutAct_9fa48("22109") ? {} : (stryCov_9fa48("22109"), {
        ...reservation,
        status,
        updatedAt: now,
        leaseExpiresAt,
        stepsHistory
      });
      const reservations = this.getMoveReplicaAssignmentReservations();
      stryMutAct_9fa48("22110") ? reservations.set(renewedReservation.assignmentId, renewedReservation) : (stryCov_9fa48("22110"), reservations?.set(renewedReservation.assignmentId, renewedReservation));
      if (stryMutAct_9fa48("22113") ? this.getSqlQueryEngine() || this.shouldAttemptRenewalWrite(renewedReservation.assignmentId, now) : stryMutAct_9fa48("22112") ? false : stryMutAct_9fa48("22111") ? true : (stryCov_9fa48("22111", "22112", "22113"), this.getSqlQueryEngine() && this.shouldAttemptRenewalWrite(renewedReservation.assignmentId, now))) {
        if (stryMutAct_9fa48("22114")) {
          {}
        } else {
          stryCov_9fa48("22114");
          try {
            if (stryMutAct_9fa48("22115")) {
              {}
            } else {
              stryCov_9fa48("22115");
              const updateResult = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("22116") ? {} : (stryCov_9fa48("22116"), {
                operation: stryMutAct_9fa48("22117") ? "" : (stryCov_9fa48("22117"), 'update'),
                tableName: TABLES.REPLICA_OPERATIONS,
                whereClause: stryMutAct_9fa48("22118") ? {} : (stryCov_9fa48("22118"), {
                  operation_id: renewedReservation.assignmentId
                }),
                data: this.buildMoveReplicaAssignmentReplicaOperationUpdateData(renewedReservation, step, stryMutAct_9fa48("22119") ? {} : (stryCov_9fa48("22119"), {
                  completedAt: null
                }))
              }));
              if (stryMutAct_9fa48("22122") ? updateResult?.success !== false : stryMutAct_9fa48("22121") ? false : stryMutAct_9fa48("22120") ? true : (stryCov_9fa48("22120", "22121", "22122"), (stryMutAct_9fa48("22123") ? updateResult.success : (stryCov_9fa48("22123"), updateResult?.success)) === (stryMutAct_9fa48("22124") ? true : (stryCov_9fa48("22124"), false)))) {
                if (stryMutAct_9fa48("22125")) {
                  {}
                } else {
                  stryCov_9fa48("22125");
                  if (stryMutAct_9fa48("22127") ? false : stryMutAct_9fa48("22126") ? true : (stryCov_9fa48("22126", "22127"), this.isRetryableMoveReplicaAssignmentPersistenceFailure(updateResult))) {
                    if (stryMutAct_9fa48("22128")) {
                      {}
                    } else {
                      stryCov_9fa48("22128");
                      this.armRenewalWriteRetryBackoff(renewedReservation.assignmentId, updateResult, now);
                      return force ? null : reservation;
                    }
                  }
                  this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED, stryMutAct_9fa48("22129") ? {} : (stryCov_9fa48("22129"), {
                    assignmentId: renewedReservation.assignmentId,
                    status,
                    error: stryMutAct_9fa48("22132") ? updateResult.error && 'failed to persist MOVE_REPLICA assignment lease renewal' : stryMutAct_9fa48("22131") ? false : stryMutAct_9fa48("22130") ? true : (stryCov_9fa48("22130", "22131", "22132"), updateResult.error || (stryMutAct_9fa48("22133") ? "" : (stryCov_9fa48("22133"), 'failed to persist MOVE_REPLICA assignment lease renewal')))
                  }));
                  return force ? null : reservation;
                }
              }
              this.clearRenewalWriteRetryBackoff(renewedReservation.assignmentId);
            }
          } catch (error) {
            if (stryMutAct_9fa48("22134")) {
              {}
            } else {
              stryCov_9fa48("22134");
              if (stryMutAct_9fa48("22136") ? false : stryMutAct_9fa48("22135") ? true : (stryCov_9fa48("22135", "22136"), this.isRetryableMoveReplicaAssignmentPersistenceFailure(error))) {
                if (stryMutAct_9fa48("22137")) {
                  {}
                } else {
                  stryCov_9fa48("22137");
                  this.armRenewalWriteRetryBackoff(renewedReservation.assignmentId, error, now);
                  return force ? null : reservation;
                }
              }
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RENEWAL_WRITE_FAILED, stryMutAct_9fa48("22138") ? {} : (stryCov_9fa48("22138"), {
                assignmentId: renewedReservation.assignmentId,
                status,
                error: stryMutAct_9fa48("22141") ? error?.message && String(error) : stryMutAct_9fa48("22140") ? false : stryMutAct_9fa48("22139") ? true : (stryCov_9fa48("22139", "22140", "22141"), (stryMutAct_9fa48("22142") ? error.message : (stryCov_9fa48("22142"), error?.message)) || String(error))
              }));
            }
          }
        }
      }
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RENEWED, stryMutAct_9fa48("22143") ? {} : (stryCov_9fa48("22143"), {
        assignmentId: renewedReservation.assignmentId,
        replicaId: renewedReservation.replicaId,
        targetNodeId: renewedReservation.targetNodeId,
        sourceNodeId: renewedReservation.sourceNodeId,
        phase,
        leaseExpiresAt
      }));
      return renewedReservation;
    }
  }
  isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation) {
    if (stryMutAct_9fa48("22144")) {
      {}
    } else {
      stryCov_9fa48("22144");
      if (stryMutAct_9fa48("22147") ? false : stryMutAct_9fa48("22146") ? true : stryMutAct_9fa48("22145") ? reservation?.replicaId : (stryCov_9fa48("22145", "22146", "22147"), !(stryMutAct_9fa48("22148") ? reservation.replicaId : (stryCov_9fa48("22148"), reservation?.replicaId)))) {
        if (stryMutAct_9fa48("22149")) {
          {}
        } else {
          stryCov_9fa48("22149");
          return stryMutAct_9fa48("22150") ? true : (stryCov_9fa48("22150"), false);
        }
      }
      if (stryMutAct_9fa48("22153") ? reservation.sourceNodeId || reservation.sourceNodeId !== this.getSeedNodeId() : stryMutAct_9fa48("22152") ? false : stryMutAct_9fa48("22151") ? true : (stryCov_9fa48("22151", "22152", "22153"), reservation.sourceNodeId && (stryMutAct_9fa48("22155") ? reservation.sourceNodeId === this.getSeedNodeId() : stryMutAct_9fa48("22154") ? true : (stryCov_9fa48("22154", "22155"), reservation.sourceNodeId !== this.getSeedNodeId())))) {
        if (stryMutAct_9fa48("22156")) {
          {}
        } else {
          stryCov_9fa48("22156");
          return stryMutAct_9fa48("22157") ? true : (stryCov_9fa48("22157"), false);
        }
      }
      return stryMutAct_9fa48("22160") ? this.getMessageGroupServices()?.has?.(reservation.replicaId) !== true : stryMutAct_9fa48("22159") ? false : stryMutAct_9fa48("22158") ? true : (stryCov_9fa48("22158", "22159", "22160"), (stryMutAct_9fa48("22162") ? this.getMessageGroupServices().has?.(reservation.replicaId) : stryMutAct_9fa48("22161") ? this.getMessageGroupServices()?.has(reservation.replicaId) : (stryCov_9fa48("22161", "22162"), this.getMessageGroupServices()?.has?.(reservation.replicaId))) === (stryMutAct_9fa48("22163") ? false : (stryCov_9fa48("22163"), true)));
    }
  }
  evaluateMoveReplicaAssignmentReservationOwnership(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22164")) {
      {}
    } else {
      stryCov_9fa48("22164");
      const systemTableCache = this.getSystemTableCache();
      const existingServiceRow = stryMutAct_9fa48("22167") ? systemTableCache?.get(TABLES.SERVICES, reservation?.replicaId) && null : stryMutAct_9fa48("22166") ? false : stryMutAct_9fa48("22165") ? true : (stryCov_9fa48("22165", "22166", "22167"), (stryMutAct_9fa48("22168") ? systemTableCache.get(TABLES.SERVICES, reservation?.replicaId) : (stryCov_9fa48("22168"), systemTableCache?.get(TABLES.SERVICES, stryMutAct_9fa48("22169") ? reservation.replicaId : (stryCov_9fa48("22169"), reservation?.replicaId)))) || null);
      const existingStatus = stryMutAct_9fa48("22170") ? String(existingServiceRow?.[COLUMN.STATUS] || STRING.UNKNOWN).toUpperCase() : (stryCov_9fa48("22170"), String(stryMutAct_9fa48("22173") ? existingServiceRow?.[COLUMN.STATUS] && STRING.UNKNOWN : stryMutAct_9fa48("22172") ? false : stryMutAct_9fa48("22171") ? true : (stryCov_9fa48("22171", "22172", "22173"), (stryMutAct_9fa48("22174") ? existingServiceRow[COLUMN.STATUS] : (stryCov_9fa48("22174"), existingServiceRow?.[COLUMN.STATUS])) || STRING.UNKNOWN)).toLowerCase());
      const existingNodeId = stryMutAct_9fa48("22177") ? existingServiceRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("22176") ? false : stryMutAct_9fa48("22175") ? true : (stryCov_9fa48("22175", "22176", "22177"), (stryMutAct_9fa48("22178") ? existingServiceRow[COLUMN.NODE_ID] : (stryCov_9fa48("22178"), existingServiceRow?.[COLUMN.NODE_ID])) || null);
      const sourceOwnsActiveReplica = stryMutAct_9fa48("22181") ? existingStatus === SERVICE_STATUS.ACTIVE || existingNodeId === (reservation?.sourceNodeId || null) : stryMutAct_9fa48("22180") ? false : stryMutAct_9fa48("22179") ? true : (stryCov_9fa48("22179", "22180", "22181"), (stryMutAct_9fa48("22183") ? existingStatus !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22182") ? true : (stryCov_9fa48("22182", "22183"), existingStatus === SERVICE_STATUS.ACTIVE)) && (stryMutAct_9fa48("22185") ? existingNodeId !== (reservation?.sourceNodeId || null) : stryMutAct_9fa48("22184") ? true : (stryCov_9fa48("22184", "22185"), existingNodeId === (stryMutAct_9fa48("22188") ? reservation?.sourceNodeId && null : stryMutAct_9fa48("22187") ? false : stryMutAct_9fa48("22186") ? true : (stryCov_9fa48("22186", "22187", "22188"), (stryMutAct_9fa48("22189") ? reservation.sourceNodeId : (stryCov_9fa48("22189"), reservation?.sourceNodeId)) || null)))));
      const targetOwnsActiveReplica = stryMutAct_9fa48("22192") ? existingStatus === SERVICE_STATUS.ACTIVE || existingNodeId === (reservation?.targetNodeId || null) : stryMutAct_9fa48("22191") ? false : stryMutAct_9fa48("22190") ? true : (stryCov_9fa48("22190", "22191", "22192"), (stryMutAct_9fa48("22194") ? existingStatus !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22193") ? true : (stryCov_9fa48("22193", "22194"), existingStatus === SERVICE_STATUS.ACTIVE)) && (stryMutAct_9fa48("22196") ? existingNodeId !== (reservation?.targetNodeId || null) : stryMutAct_9fa48("22195") ? true : (stryCov_9fa48("22195", "22196"), existingNodeId === (stryMutAct_9fa48("22199") ? reservation?.targetNodeId && null : stryMutAct_9fa48("22198") ? false : stryMutAct_9fa48("22197") ? true : (stryCov_9fa48("22197", "22198", "22199"), (stryMutAct_9fa48("22200") ? reservation.targetNodeId : (stryCov_9fa48("22200"), reservation?.targetNodeId)) || null)))));
      const sourceNodeRow = (stryMutAct_9fa48("22201") ? reservation.sourceNodeId : (stryCov_9fa48("22201"), reservation?.sourceNodeId)) ? stryMutAct_9fa48("22204") ? systemTableCache?.get(TABLES.NODES, reservation.sourceNodeId) && null : stryMutAct_9fa48("22203") ? false : stryMutAct_9fa48("22202") ? true : (stryCov_9fa48("22202", "22203", "22204"), (stryMutAct_9fa48("22205") ? systemTableCache.get(TABLES.NODES, reservation.sourceNodeId) : (stryCov_9fa48("22205"), systemTableCache?.get(TABLES.NODES, reservation.sourceNodeId))) || null) : null;
      const targetNodeRow = (stryMutAct_9fa48("22206") ? reservation.targetNodeId : (stryCov_9fa48("22206"), reservation?.targetNodeId)) ? stryMutAct_9fa48("22209") ? systemTableCache?.get(TABLES.NODES, reservation.targetNodeId) && null : stryMutAct_9fa48("22208") ? false : stryMutAct_9fa48("22207") ? true : (stryCov_9fa48("22207", "22208", "22209"), (stryMutAct_9fa48("22210") ? systemTableCache.get(TABLES.NODES, reservation.targetNodeId) : (stryCov_9fa48("22210"), systemTableCache?.get(TABLES.NODES, reservation.targetNodeId))) || null) : null;
      const sourceNodeReady = stryMutAct_9fa48("22213") ? !sourceNodeRow && isNodeRecordReady(sourceNodeRow, {
        now
      }) : stryMutAct_9fa48("22212") ? false : stryMutAct_9fa48("22211") ? true : (stryCov_9fa48("22211", "22212", "22213"), (stryMutAct_9fa48("22214") ? sourceNodeRow : (stryCov_9fa48("22214"), !sourceNodeRow)) || isNodeRecordReady(sourceNodeRow, stryMutAct_9fa48("22215") ? {} : (stryCov_9fa48("22215"), {
        now
      })));
      const targetNodeReady = stryMutAct_9fa48("22218") ? !!targetNodeRow || isNodeRecordReady(targetNodeRow, {
        now
      }) : stryMutAct_9fa48("22217") ? false : stryMutAct_9fa48("22216") ? true : (stryCov_9fa48("22216", "22217", "22218"), (stryMutAct_9fa48("22219") ? !targetNodeRow : (stryCov_9fa48("22219"), !(stryMutAct_9fa48("22220") ? targetNodeRow : (stryCov_9fa48("22220"), !targetNodeRow)))) && isNodeRecordReady(targetNodeRow, stryMutAct_9fa48("22221") ? {} : (stryCov_9fa48("22221"), {
        now
      })));
      const sourceReplicaPresentLocally = this.isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);
      return stryMutAct_9fa48("22222") ? {} : (stryCov_9fa48("22222"), {
        existingRow: existingServiceRow,
        existingNodeId,
        existingStatus,
        sourceOwnsActiveReplica,
        targetOwnsActiveReplica,
        sourceNodeReady,
        targetNodeReady,
        sourceReplicaPresentLocally,
        hasActiveServiceOwner: stryMutAct_9fa48("22225") ? existingStatus === SERVICE_STATUS.ACTIVE || typeof existingNodeId === TYPEOF.STRING : stryMutAct_9fa48("22224") ? false : stryMutAct_9fa48("22223") ? true : (stryCov_9fa48("22223", "22224", "22225"), (stryMutAct_9fa48("22227") ? existingStatus !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22226") ? true : (stryCov_9fa48("22226", "22227"), existingStatus === SERVICE_STATUS.ACTIVE)) && (stryMutAct_9fa48("22229") ? typeof existingNodeId !== TYPEOF.STRING : stryMutAct_9fa48("22228") ? true : (stryCov_9fa48("22228", "22229"), typeof existingNodeId === TYPEOF.STRING))),
        continuingTargetAdoption: stryMutAct_9fa48("22232") ? targetOwnsActiveReplica || sourceReplicaPresentLocally : stryMutAct_9fa48("22231") ? false : stryMutAct_9fa48("22230") ? true : (stryCov_9fa48("22230", "22231", "22232"), targetOwnsActiveReplica && sourceReplicaPresentLocally),
        observedCommitted: stryMutAct_9fa48("22235") ? targetOwnsActiveReplica || !sourceReplicaPresentLocally : stryMutAct_9fa48("22234") ? false : stryMutAct_9fa48("22233") ? true : (stryCov_9fa48("22233", "22234", "22235"), targetOwnsActiveReplica && (stryMutAct_9fa48("22236") ? sourceReplicaPresentLocally : (stryCov_9fa48("22236"), !sourceReplicaPresentLocally)))
      });
    }
  }
  canReviveExpiredMoveReplicaAssignmentReservation(reservation) {
    if (stryMutAct_9fa48("22237")) {
      {}
    } else {
      stryCov_9fa48("22237");
      if (stryMutAct_9fa48("22240") ? !reservation?.replicaId && !reservation?.targetNodeId : stryMutAct_9fa48("22239") ? false : stryMutAct_9fa48("22238") ? true : (stryCov_9fa48("22238", "22239", "22240"), (stryMutAct_9fa48("22241") ? reservation?.replicaId : (stryCov_9fa48("22241"), !(stryMutAct_9fa48("22242") ? reservation.replicaId : (stryCov_9fa48("22242"), reservation?.replicaId)))) || (stryMutAct_9fa48("22243") ? reservation?.targetNodeId : (stryCov_9fa48("22243"), !(stryMutAct_9fa48("22244") ? reservation.targetNodeId : (stryCov_9fa48("22244"), reservation?.targetNodeId)))))) {
        if (stryMutAct_9fa48("22245")) {
          {}
        } else {
          stryCov_9fa48("22245");
          return stryMutAct_9fa48("22246") ? true : (stryCov_9fa48("22246"), false);
        }
      }
      if (stryMutAct_9fa48("22248") ? false : stryMutAct_9fa48("22247") ? true : (stryCov_9fa48("22247", "22248"), BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22249")) {
          {}
        } else {
          stryCov_9fa48("22249");
          return stryMutAct_9fa48("22250") ? true : (stryCov_9fa48("22250"), false);
        }
      }
      const ownership = this.evaluateMoveReplicaAssignmentReservationOwnership(reservation);
      if (stryMutAct_9fa48("22253") ? !ownership.hasActiveServiceOwner && ownership.observedCommitted : stryMutAct_9fa48("22252") ? false : stryMutAct_9fa48("22251") ? true : (stryCov_9fa48("22251", "22252", "22253"), (stryMutAct_9fa48("22254") ? ownership.hasActiveServiceOwner : (stryCov_9fa48("22254"), !ownership.hasActiveServiceOwner)) || ownership.observedCommitted)) {
        if (stryMutAct_9fa48("22255")) {
          {}
        } else {
          stryCov_9fa48("22255");
          return stryMutAct_9fa48("22256") ? true : (stryCov_9fa48("22256"), false);
        }
      }
      return stryMutAct_9fa48("22259") ? ownership.sourceOwnsActiveReplica && ownership.continuingTargetAdoption : stryMutAct_9fa48("22258") ? false : stryMutAct_9fa48("22257") ? true : (stryCov_9fa48("22257", "22258", "22259"), ownership.sourceOwnsActiveReplica || ownership.continuingTargetAdoption);
    }
  }
  hasViableMoveReplicaAssignmentSource(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22260")) {
      {}
    } else {
      stryCov_9fa48("22260");
      if (stryMutAct_9fa48("22263") ? false : stryMutAct_9fa48("22262") ? true : stryMutAct_9fa48("22261") ? reservation?.replicaId : (stryCov_9fa48("22261", "22262", "22263"), !(stryMutAct_9fa48("22264") ? reservation.replicaId : (stryCov_9fa48("22264"), reservation?.replicaId)))) {
        if (stryMutAct_9fa48("22265")) {
          {}
        } else {
          stryCov_9fa48("22265");
          return stryMutAct_9fa48("22266") ? true : (stryCov_9fa48("22266"), false);
        }
      }
      const ownership = this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
      if (stryMutAct_9fa48("22268") ? false : stryMutAct_9fa48("22267") ? true : (stryCov_9fa48("22267", "22268"), ownership.observedCommitted)) {
        if (stryMutAct_9fa48("22269")) {
          {}
        } else {
          stryCov_9fa48("22269");
          return stryMutAct_9fa48("22270") ? true : (stryCov_9fa48("22270"), false);
        }
      }
      if (stryMutAct_9fa48("22273") ? ownership.sourceReplicaPresentLocally || ownership.sourceNodeReady : stryMutAct_9fa48("22272") ? false : stryMutAct_9fa48("22271") ? true : (stryCov_9fa48("22271", "22272", "22273"), ownership.sourceReplicaPresentLocally && ownership.sourceNodeReady)) {
        if (stryMutAct_9fa48("22274")) {
          {}
        } else {
          stryCov_9fa48("22274");
          return stryMutAct_9fa48("22275") ? false : (stryCov_9fa48("22275"), true);
        }
      }
      if (stryMutAct_9fa48("22278") ? false : stryMutAct_9fa48("22277") ? true : stryMutAct_9fa48("22276") ? ownership.hasActiveServiceOwner : (stryCov_9fa48("22276", "22277", "22278"), !ownership.hasActiveServiceOwner)) {
        if (stryMutAct_9fa48("22279")) {
          {}
        } else {
          stryCov_9fa48("22279");
          return stryMutAct_9fa48("22280") ? true : (stryCov_9fa48("22280"), false);
        }
      }
      if (stryMutAct_9fa48("22283") ? false : stryMutAct_9fa48("22282") ? true : stryMutAct_9fa48("22281") ? reservation.sourceNodeId : (stryCov_9fa48("22281", "22282", "22283"), !reservation.sourceNodeId)) {
        if (stryMutAct_9fa48("22284")) {
          {}
        } else {
          stryCov_9fa48("22284");
          return stryMutAct_9fa48("22287") ? ownership.continuingTargetAdoption && ownership.targetOwnsActiveReplica : stryMutAct_9fa48("22286") ? false : stryMutAct_9fa48("22285") ? true : (stryCov_9fa48("22285", "22286", "22287"), ownership.continuingTargetAdoption || ownership.targetOwnsActiveReplica);
        }
      }
      if (stryMutAct_9fa48("22289") ? false : stryMutAct_9fa48("22288") ? true : (stryCov_9fa48("22288", "22289"), ownership.continuingTargetAdoption)) {
        if (stryMutAct_9fa48("22290")) {
          {}
        } else {
          stryCov_9fa48("22290");
          return stryMutAct_9fa48("22291") ? false : (stryCov_9fa48("22291"), true);
        }
      }
      if (stryMutAct_9fa48("22294") ? false : stryMutAct_9fa48("22293") ? true : stryMutAct_9fa48("22292") ? ownership.sourceOwnsActiveReplica : (stryCov_9fa48("22292", "22293", "22294"), !ownership.sourceOwnsActiveReplica)) {
        if (stryMutAct_9fa48("22295")) {
          {}
        } else {
          stryCov_9fa48("22295");
          return stryMutAct_9fa48("22296") ? true : (stryCov_9fa48("22296"), false);
        }
      }
      return ownership.sourceNodeReady;
    }
  }
  getMoveReplicaAssignmentReservationInvalidationReason(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22297")) {
      {}
    } else {
      stryCov_9fa48("22297");
      if (stryMutAct_9fa48("22300") ? (!reservation || typeof reservation.assignmentId !== TYPEOF.STRING) && reservation.assignmentId.length === NUM.ZERO : stryMutAct_9fa48("22299") ? false : stryMutAct_9fa48("22298") ? true : (stryCov_9fa48("22298", "22299", "22300"), (stryMutAct_9fa48("22302") ? !reservation && typeof reservation.assignmentId !== TYPEOF.STRING : stryMutAct_9fa48("22301") ? false : (stryCov_9fa48("22301", "22302"), (stryMutAct_9fa48("22303") ? reservation : (stryCov_9fa48("22303"), !reservation)) || (stryMutAct_9fa48("22305") ? typeof reservation.assignmentId === TYPEOF.STRING : stryMutAct_9fa48("22304") ? false : (stryCov_9fa48("22304", "22305"), typeof reservation.assignmentId !== TYPEOF.STRING)))) || (stryMutAct_9fa48("22307") ? reservation.assignmentId.length !== NUM.ZERO : stryMutAct_9fa48("22306") ? false : (stryCov_9fa48("22306", "22307"), reservation.assignmentId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("22308")) {
          {}
        } else {
          stryCov_9fa48("22308");
          return stryMutAct_9fa48("22309") ? "" : (stryCov_9fa48("22309"), 'invalid_reservation');
        }
      }
      if (stryMutAct_9fa48("22312") ? !reservation.replicaId && !reservation.targetNodeId : stryMutAct_9fa48("22311") ? false : stryMutAct_9fa48("22310") ? true : (stryCov_9fa48("22310", "22311", "22312"), (stryMutAct_9fa48("22313") ? reservation.replicaId : (stryCov_9fa48("22313"), !reservation.replicaId)) || (stryMutAct_9fa48("22314") ? reservation.targetNodeId : (stryCov_9fa48("22314"), !reservation.targetNodeId)))) {
        if (stryMutAct_9fa48("22315")) {
          {}
        } else {
          stryCov_9fa48("22315");
          return stryMutAct_9fa48("22316") ? "" : (stryCov_9fa48("22316"), 'missing_assignment_fields');
        }
      }
      if (stryMutAct_9fa48("22318") ? false : stryMutAct_9fa48("22317") ? true : (stryCov_9fa48("22317", "22318"), BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22319")) {
          {}
        } else {
          stryCov_9fa48("22319");
          return stryMutAct_9fa48("22320") ? "" : (stryCov_9fa48("22320"), 'terminal');
        }
      }
      if (stryMutAct_9fa48("22323") ? false : stryMutAct_9fa48("22322") ? true : stryMutAct_9fa48("22321") ? BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(reservation.status) : (stryCov_9fa48("22321", "22322", "22323"), !BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22324")) {
          {}
        } else {
          stryCov_9fa48("22324");
          return stryMutAct_9fa48("22325") ? "" : (stryCov_9fa48("22325"), 'inactive_status');
        }
      }
      const ownership = this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
      if (stryMutAct_9fa48("22327") ? false : stryMutAct_9fa48("22326") ? true : (stryCov_9fa48("22326", "22327"), ownership.observedCommitted)) {
        if (stryMutAct_9fa48("22328")) {
          {}
        } else {
          stryCov_9fa48("22328");
          return null;
        }
      }
      if (stryMutAct_9fa48("22331") ? false : stryMutAct_9fa48("22330") ? true : stryMutAct_9fa48("22329") ? Number.isFinite(reservation.leaseExpiresAt) : (stryCov_9fa48("22329", "22330", "22331"), !Number.isFinite(reservation.leaseExpiresAt))) {
        if (stryMutAct_9fa48("22332")) {
          {}
        } else {
          stryCov_9fa48("22332");
          return stryMutAct_9fa48("22333") ? "" : (stryCov_9fa48("22333"), 'missing_lease');
        }
      }
      if (stryMutAct_9fa48("22337") ? reservation.leaseExpiresAt > now : stryMutAct_9fa48("22336") ? reservation.leaseExpiresAt < now : stryMutAct_9fa48("22335") ? false : stryMutAct_9fa48("22334") ? true : (stryCov_9fa48("22334", "22335", "22336", "22337"), reservation.leaseExpiresAt <= now)) {
        if (stryMutAct_9fa48("22338")) {
          {}
        } else {
          stryCov_9fa48("22338");
          return stryMutAct_9fa48("22339") ? "" : (stryCov_9fa48("22339"), 'lease_expired');
        }
      }
      if (stryMutAct_9fa48("22342") ? false : stryMutAct_9fa48("22341") ? true : stryMutAct_9fa48("22340") ? this.hasViableMoveReplicaAssignmentSource(reservation, now) : (stryCov_9fa48("22340", "22341", "22342"), !this.hasViableMoveReplicaAssignmentSource(reservation, now))) {
        if (stryMutAct_9fa48("22343")) {
          {}
        } else {
          stryCov_9fa48("22343");
          return stryMutAct_9fa48("22344") ? "" : (stryCov_9fa48("22344"), 'source_owner_unavailable');
        }
      }
      return null;
    }
  }
  shouldReconcileMoveReplicaAssignmentReservationToCommitted(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22345")) {
      {}
    } else {
      stryCov_9fa48("22345");
      if (stryMutAct_9fa48("22348") ? !reservation && BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status) : stryMutAct_9fa48("22347") ? false : stryMutAct_9fa48("22346") ? true : (stryCov_9fa48("22346", "22347", "22348"), (stryMutAct_9fa48("22349") ? reservation : (stryCov_9fa48("22349"), !reservation)) || BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22350")) {
          {}
        } else {
          stryCov_9fa48("22350");
          return stryMutAct_9fa48("22351") ? true : (stryCov_9fa48("22351"), false);
        }
      }
      return this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now).observedCommitted;
    }
  }
  normalizeMoveReplicaAssignmentReservationRow(row) {
    if (stryMutAct_9fa48("22352")) {
      {}
    } else {
      stryCov_9fa48("22352");
      if (stryMutAct_9fa48("22355") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("22354") ? false : stryMutAct_9fa48("22353") ? true : (stryCov_9fa48("22353", "22354", "22355"), (stryMutAct_9fa48("22356") ? row : (stryCov_9fa48("22356"), !row)) || (stryMutAct_9fa48("22358") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("22357") ? false : (stryCov_9fa48("22357", "22358"), typeof row !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("22359")) {
          {}
        } else {
          stryCov_9fa48("22359");
          return null;
        }
      }
      const assignmentId = stryMutAct_9fa48("22362") ? (row[COLUMN.OPERATION_ID] || row.operation_id) && row.operationId : stryMutAct_9fa48("22361") ? false : stryMutAct_9fa48("22360") ? true : (stryCov_9fa48("22360", "22361", "22362"), (stryMutAct_9fa48("22364") ? row[COLUMN.OPERATION_ID] && row.operation_id : stryMutAct_9fa48("22363") ? false : (stryCov_9fa48("22363", "22364"), row[COLUMN.OPERATION_ID] || row.operation_id)) || row.operationId);
      const normalizedAssignmentId = stryMutAct_9fa48("22367") ? (assignmentId || row.assignmentId) && null : stryMutAct_9fa48("22366") ? false : stryMutAct_9fa48("22365") ? true : (stryCov_9fa48("22365", "22366", "22367"), (stryMutAct_9fa48("22369") ? assignmentId && row.assignmentId : stryMutAct_9fa48("22368") ? false : (stryCov_9fa48("22368", "22369"), assignmentId || row.assignmentId)) || null);
      const replicaId = stryMutAct_9fa48("22372") ? (row[COLUMN.REPLICA_ID] || row.replica_id || row.replicaId) && null : stryMutAct_9fa48("22371") ? false : stryMutAct_9fa48("22370") ? true : (stryCov_9fa48("22370", "22371", "22372"), (stryMutAct_9fa48("22374") ? (row[COLUMN.REPLICA_ID] || row.replica_id) && row.replicaId : stryMutAct_9fa48("22373") ? false : (stryCov_9fa48("22373", "22374"), (stryMutAct_9fa48("22376") ? row[COLUMN.REPLICA_ID] && row.replica_id : stryMutAct_9fa48("22375") ? false : (stryCov_9fa48("22375", "22376"), row[COLUMN.REPLICA_ID] || row.replica_id)) || row.replicaId)) || null);
      const targetNodeId = stryMutAct_9fa48("22379") ? (row[COLUMN.TARGET_NODE_ID] || row.target_node_id || row.targetNodeId) && null : stryMutAct_9fa48("22378") ? false : stryMutAct_9fa48("22377") ? true : (stryCov_9fa48("22377", "22378", "22379"), (stryMutAct_9fa48("22381") ? (row[COLUMN.TARGET_NODE_ID] || row.target_node_id) && row.targetNodeId : stryMutAct_9fa48("22380") ? false : (stryCov_9fa48("22380", "22381"), (stryMutAct_9fa48("22383") ? row[COLUMN.TARGET_NODE_ID] && row.target_node_id : stryMutAct_9fa48("22382") ? false : (stryCov_9fa48("22382", "22383"), row[COLUMN.TARGET_NODE_ID] || row.target_node_id)) || row.targetNodeId)) || null);
      const sourceNodeId = stryMutAct_9fa48("22386") ? (row.source_node_id || row.sourceNodeId || row.sourceNode || row.sourceNodeId) && null : stryMutAct_9fa48("22385") ? false : stryMutAct_9fa48("22384") ? true : (stryCov_9fa48("22384", "22385", "22386"), (stryMutAct_9fa48("22388") ? (row.source_node_id || row.sourceNodeId || row.sourceNode) && row.sourceNodeId : stryMutAct_9fa48("22387") ? false : (stryCov_9fa48("22387", "22388"), (stryMutAct_9fa48("22390") ? (row.source_node_id || row.sourceNodeId) && row.sourceNode : stryMutAct_9fa48("22389") ? false : (stryCov_9fa48("22389", "22390"), (stryMutAct_9fa48("22392") ? row.source_node_id && row.sourceNodeId : stryMutAct_9fa48("22391") ? false : (stryCov_9fa48("22391", "22392"), row.source_node_id || row.sourceNodeId)) || row.sourceNode)) || row.sourceNodeId)) || null);
      const groupId = stryMutAct_9fa48("22395") ? (row[COLUMN.PARTITION_ID] || row.partition_id || row.partitionId) && null : stryMutAct_9fa48("22394") ? false : stryMutAct_9fa48("22393") ? true : (stryCov_9fa48("22393", "22394", "22395"), (stryMutAct_9fa48("22397") ? (row[COLUMN.PARTITION_ID] || row.partition_id) && row.partitionId : stryMutAct_9fa48("22396") ? false : (stryCov_9fa48("22396", "22397"), (stryMutAct_9fa48("22399") ? row[COLUMN.PARTITION_ID] && row.partition_id : stryMutAct_9fa48("22398") ? false : (stryCov_9fa48("22398", "22399"), row[COLUMN.PARTITION_ID] || row.partition_id)) || row.partitionId)) || null);
      const status = stryMutAct_9fa48("22400") ? String(row[COLUMN.STATUS] || row.status || STRING.UNKNOWN).toUpperCase() : (stryCov_9fa48("22400"), String(stryMutAct_9fa48("22403") ? (row[COLUMN.STATUS] || row.status) && STRING.UNKNOWN : stryMutAct_9fa48("22402") ? false : stryMutAct_9fa48("22401") ? true : (stryCov_9fa48("22401", "22402", "22403"), (stryMutAct_9fa48("22405") ? row[COLUMN.STATUS] && row.status : stryMutAct_9fa48("22404") ? false : (stryCov_9fa48("22404", "22405"), row[COLUMN.STATUS] || row.status)) || STRING.UNKNOWN)).toLowerCase());
      const leaseRaw = stryMutAct_9fa48("22406") ? (row.lease_expires_at ?? row.leaseExpiresAt ?? row.completed_at ?? row.completedAt) && null : (stryCov_9fa48("22406"), (stryMutAct_9fa48("22407") ? (row.lease_expires_at ?? row.leaseExpiresAt ?? row.completed_at) && row.completedAt : (stryCov_9fa48("22407"), (stryMutAct_9fa48("22408") ? (row.lease_expires_at ?? row.leaseExpiresAt) && row.completed_at : (stryCov_9fa48("22408"), (stryMutAct_9fa48("22409") ? row.lease_expires_at && row.leaseExpiresAt : (stryCov_9fa48("22409"), row.lease_expires_at ?? row.leaseExpiresAt)) ?? row.completed_at)) ?? row.completedAt)) ?? null);
      const leaseExpiresAt = Number.isFinite(Number(leaseRaw)) ? Math.floor(Number(leaseRaw)) : null;
      const updatedAtRaw = stryMutAct_9fa48("22410") ? (row[COLUMN.UPDATED_AT] ?? row.updated_at) && row.updatedAt : (stryCov_9fa48("22410"), (stryMutAct_9fa48("22411") ? row[COLUMN.UPDATED_AT] && row.updated_at : (stryCov_9fa48("22411"), row[COLUMN.UPDATED_AT] ?? row.updated_at)) ?? row.updatedAt);
      const updatedAt = Number.isFinite(Number(updatedAtRaw)) ? Math.floor(Number(updatedAtRaw)) : Date.now();
      const stepsHistoryRaw = stryMutAct_9fa48("22412") ? (row.steps_history ?? row.stepsHistory) && null : (stryCov_9fa48("22412"), (stryMutAct_9fa48("22413") ? row.steps_history && row.stepsHistory : (stryCov_9fa48("22413"), row.steps_history ?? row.stepsHistory)) ?? null);
      let stepsHistory = stryMutAct_9fa48("22414") ? ["Stryker was here"] : (stryCov_9fa48("22414"), []);
      if (stryMutAct_9fa48("22416") ? false : stryMutAct_9fa48("22415") ? true : (stryCov_9fa48("22415", "22416"), Array.isArray(stepsHistoryRaw))) {
        if (stryMutAct_9fa48("22417")) {
          {}
        } else {
          stryCov_9fa48("22417");
          stepsHistory = stepsHistoryRaw;
        }
      } else if (stryMutAct_9fa48("22420") ? typeof stepsHistoryRaw === TYPEOF.STRING || stepsHistoryRaw.length > NUM.ZERO : stryMutAct_9fa48("22419") ? false : stryMutAct_9fa48("22418") ? true : (stryCov_9fa48("22418", "22419", "22420"), (stryMutAct_9fa48("22422") ? typeof stepsHistoryRaw !== TYPEOF.STRING : stryMutAct_9fa48("22421") ? true : (stryCov_9fa48("22421", "22422"), typeof stepsHistoryRaw === TYPEOF.STRING)) && (stryMutAct_9fa48("22425") ? stepsHistoryRaw.length <= NUM.ZERO : stryMutAct_9fa48("22424") ? stepsHistoryRaw.length >= NUM.ZERO : stryMutAct_9fa48("22423") ? true : (stryCov_9fa48("22423", "22424", "22425"), stepsHistoryRaw.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("22426")) {
          {}
        } else {
          stryCov_9fa48("22426");
          try {
            if (stryMutAct_9fa48("22427")) {
              {}
            } else {
              stryCov_9fa48("22427");
              const parsedStepsHistory = JSON.parse(stepsHistoryRaw);
              if (stryMutAct_9fa48("22429") ? false : stryMutAct_9fa48("22428") ? true : (stryCov_9fa48("22428", "22429"), Array.isArray(parsedStepsHistory))) {
                if (stryMutAct_9fa48("22430")) {
                  {}
                } else {
                  stryCov_9fa48("22430");
                  stepsHistory = parsedStepsHistory;
                }
              }
            }
          } catch (_error) {
            if (stryMutAct_9fa48("22431")) {
              {}
            } else {
              stryCov_9fa48("22431");
              stepsHistory = stryMutAct_9fa48("22432") ? ["Stryker was here"] : (stryCov_9fa48("22432"), []);
            }
          }
        }
      }
      if (stryMutAct_9fa48("22435") ? (!normalizedAssignmentId || !replicaId) && !targetNodeId : stryMutAct_9fa48("22434") ? false : stryMutAct_9fa48("22433") ? true : (stryCov_9fa48("22433", "22434", "22435"), (stryMutAct_9fa48("22437") ? !normalizedAssignmentId && !replicaId : stryMutAct_9fa48("22436") ? false : (stryCov_9fa48("22436", "22437"), (stryMutAct_9fa48("22438") ? normalizedAssignmentId : (stryCov_9fa48("22438"), !normalizedAssignmentId)) || (stryMutAct_9fa48("22439") ? replicaId : (stryCov_9fa48("22439"), !replicaId)))) || (stryMutAct_9fa48("22440") ? targetNodeId : (stryCov_9fa48("22440"), !targetNodeId)))) {
        if (stryMutAct_9fa48("22441")) {
          {}
        } else {
          stryCov_9fa48("22441");
          return null;
        }
      }
      return stryMutAct_9fa48("22442") ? {} : (stryCov_9fa48("22442"), {
        assignmentId: normalizedAssignmentId,
        replicaId,
        sourceNodeId,
        targetNodeId,
        groupId,
        status,
        leaseExpiresAt,
        updatedAt,
        stepsHistory
      });
    }
  }
  async getActiveMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("22443")) {
      {}
    } else {
      stryCov_9fa48("22443");
      const now = Date.now();
      const reservations = await this.collectMoveReplicaAssignmentReservations(stryMutAct_9fa48("22444") ? {} : (stryCov_9fa48("22444"), {
        now
      }));
      return stryMutAct_9fa48("22445") ? reservations : (stryCov_9fa48("22445"), reservations.filter(stryMutAct_9fa48("22446") ? () => undefined : (stryCov_9fa48("22446"), reservation => this.isMoveReplicaAssignmentReservationActive(reservation, now))));
    }
  }
  async getBlockingMoveReplicaBootstrapAdmissions(now = Date.now()) {
    if (stryMutAct_9fa48("22447")) {
      {}
    } else {
      stryCov_9fa48("22447");
      const reservations = stryMutAct_9fa48("22448") ? ["Stryker was here"] : (stryCov_9fa48("22448"), []);
      const byAssignmentId = new Map();
      const collectedReservations = await this.collectMoveReplicaAssignmentReservations(stryMutAct_9fa48("22449") ? {} : (stryCov_9fa48("22449"), {
        now
      }));
      for (const reservation of collectedReservations) {
        if (stryMutAct_9fa48("22450")) {
          {}
        } else {
          stryCov_9fa48("22450");
          byAssignmentId.set(reservation.assignmentId, reservation);
        }
      }
      for (const reservation of byAssignmentId.values()) {
        if (stryMutAct_9fa48("22451")) {
          {}
        } else {
          stryCov_9fa48("22451");
          if (stryMutAct_9fa48("22453") ? false : stryMutAct_9fa48("22452") ? true : (stryCov_9fa48("22452", "22453"), this.isMoveReplicaBootstrapAdmissionBlocked(reservation, now))) {
            if (stryMutAct_9fa48("22454")) {
              {}
            } else {
              stryCov_9fa48("22454");
              reservations.push(reservation);
            }
          }
        }
      }
      stryMutAct_9fa48("22455") ? reservations : (stryCov_9fa48("22455"), reservations.sort((left, right) => {
        if (stryMutAct_9fa48("22456")) {
          {}
        } else {
          stryCov_9fa48("22456");
          const leftUpdatedAt = Number.isFinite(stryMutAct_9fa48("22457") ? left.updatedAt : (stryCov_9fa48("22457"), left?.updatedAt)) ? left.updatedAt : NUM.ZERO;
          const rightUpdatedAt = Number.isFinite(stryMutAct_9fa48("22458") ? right.updatedAt : (stryCov_9fa48("22458"), right?.updatedAt)) ? right.updatedAt : NUM.ZERO;
          return stryMutAct_9fa48("22459") ? leftUpdatedAt + rightUpdatedAt : (stryCov_9fa48("22459"), leftUpdatedAt - rightUpdatedAt);
        }
      }));
      return reservations;
    }
  }
  async getMoveReplicaBootstrapExclusionReservations(now = Date.now()) {
    if (stryMutAct_9fa48("22460")) {
      {}
    } else {
      stryCov_9fa48("22460");
      const reservations = stryMutAct_9fa48("22461") ? ["Stryker was here"] : (stryCov_9fa48("22461"), []);
      const byAssignmentId = new Map();
      const collectedReservations = await this.collectMoveReplicaAssignmentReservations(stryMutAct_9fa48("22462") ? {} : (stryCov_9fa48("22462"), {
        now
      }));
      for (const reservation of collectedReservations) {
        if (stryMutAct_9fa48("22463")) {
          {}
        } else {
          stryCov_9fa48("22463");
          byAssignmentId.set(reservation.assignmentId, reservation);
        }
      }
      for (const reservation of byAssignmentId.values()) {
        if (stryMutAct_9fa48("22464")) {
          {}
        } else {
          stryCov_9fa48("22464");
          if (stryMutAct_9fa48("22467") ? this.isMoveReplicaAssignmentReservationOpen(reservation, now) && this.isCommittedMoveReplicaHandoffStabilizing(reservation, now) : stryMutAct_9fa48("22466") ? false : stryMutAct_9fa48("22465") ? true : (stryCov_9fa48("22465", "22466", "22467"), this.isMoveReplicaAssignmentReservationOpen(reservation, now) || this.isCommittedMoveReplicaHandoffStabilizing(reservation, now))) {
            if (stryMutAct_9fa48("22468")) {
              {}
            } else {
              stryCov_9fa48("22468");
              reservations.push(reservation);
            }
          }
        }
      }
      stryMutAct_9fa48("22469") ? reservations : (stryCov_9fa48("22469"), reservations.sort((left, right) => {
        if (stryMutAct_9fa48("22470")) {
          {}
        } else {
          stryCov_9fa48("22470");
          const leftUpdatedAt = Number.isFinite(stryMutAct_9fa48("22471") ? left.updatedAt : (stryCov_9fa48("22471"), left?.updatedAt)) ? left.updatedAt : NUM.ZERO;
          const rightUpdatedAt = Number.isFinite(stryMutAct_9fa48("22472") ? right.updatedAt : (stryCov_9fa48("22472"), right?.updatedAt)) ? right.updatedAt : NUM.ZERO;
          return stryMutAct_9fa48("22473") ? leftUpdatedAt + rightUpdatedAt : (stryCov_9fa48("22473"), leftUpdatedAt - rightUpdatedAt);
        }
      }));
      return reservations;
    }
  }
  isMoveReplicaBootstrapAdmissionBlocked(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22474")) {
      {}
    } else {
      stryCov_9fa48("22474");
      return this.isCommittedMoveReplicaHandoffStabilizing(reservation, now);
    }
  }
  isMoveReplicaAssignmentReservationOpen(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22475")) {
      {}
    } else {
      stryCov_9fa48("22475");
      if (stryMutAct_9fa48("22478") ? (!reservation || typeof reservation.assignmentId !== TYPEOF.STRING) && reservation.assignmentId.length === NUM.ZERO : stryMutAct_9fa48("22477") ? false : stryMutAct_9fa48("22476") ? true : (stryCov_9fa48("22476", "22477", "22478"), (stryMutAct_9fa48("22480") ? !reservation && typeof reservation.assignmentId !== TYPEOF.STRING : stryMutAct_9fa48("22479") ? false : (stryCov_9fa48("22479", "22480"), (stryMutAct_9fa48("22481") ? reservation : (stryCov_9fa48("22481"), !reservation)) || (stryMutAct_9fa48("22483") ? typeof reservation.assignmentId === TYPEOF.STRING : stryMutAct_9fa48("22482") ? false : (stryCov_9fa48("22482", "22483"), typeof reservation.assignmentId !== TYPEOF.STRING)))) || (stryMutAct_9fa48("22485") ? reservation.assignmentId.length !== NUM.ZERO : stryMutAct_9fa48("22484") ? false : (stryCov_9fa48("22484", "22485"), reservation.assignmentId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("22486")) {
          {}
        } else {
          stryCov_9fa48("22486");
          return stryMutAct_9fa48("22487") ? true : (stryCov_9fa48("22487"), false);
        }
      }
      if (stryMutAct_9fa48("22490") ? !reservation.replicaId && !reservation.targetNodeId : stryMutAct_9fa48("22489") ? false : stryMutAct_9fa48("22488") ? true : (stryCov_9fa48("22488", "22489", "22490"), (stryMutAct_9fa48("22491") ? reservation.replicaId : (stryCov_9fa48("22491"), !reservation.replicaId)) || (stryMutAct_9fa48("22492") ? reservation.targetNodeId : (stryCov_9fa48("22492"), !reservation.targetNodeId)))) {
        if (stryMutAct_9fa48("22493")) {
          {}
        } else {
          stryCov_9fa48("22493");
          return stryMutAct_9fa48("22494") ? true : (stryCov_9fa48("22494"), false);
        }
      }
      if (stryMutAct_9fa48("22496") ? false : stryMutAct_9fa48("22495") ? true : (stryCov_9fa48("22495", "22496"), BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22497")) {
          {}
        } else {
          stryCov_9fa48("22497");
          return stryMutAct_9fa48("22498") ? true : (stryCov_9fa48("22498"), false);
        }
      }
      if (stryMutAct_9fa48("22501") ? false : stryMutAct_9fa48("22500") ? true : stryMutAct_9fa48("22499") ? BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(reservation.status) : (stryCov_9fa48("22499", "22500", "22501"), !BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(reservation.status))) {
        if (stryMutAct_9fa48("22502")) {
          {}
        } else {
          stryCov_9fa48("22502");
          return stryMutAct_9fa48("22503") ? true : (stryCov_9fa48("22503"), false);
        }
      }
      const ownership = this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
      if (stryMutAct_9fa48("22505") ? false : stryMutAct_9fa48("22504") ? true : (stryCov_9fa48("22504", "22505"), ownership.observedCommitted)) {
        if (stryMutAct_9fa48("22506")) {
          {}
        } else {
          stryCov_9fa48("22506");
          return stryMutAct_9fa48("22507") ? true : (stryCov_9fa48("22507"), false);
        }
      }
      if (stryMutAct_9fa48("22509") ? false : stryMutAct_9fa48("22508") ? true : (stryCov_9fa48("22508", "22509"), ownership.continuingTargetAdoption)) {
        if (stryMutAct_9fa48("22510")) {
          {}
        } else {
          stryCov_9fa48("22510");
          return stryMutAct_9fa48("22511") ? false : (stryCov_9fa48("22511"), true);
        }
      }
      return this.hasViableMoveReplicaAssignmentSource(reservation, now);
    }
  }
  isCommittedMoveReplicaHandoffStabilizing(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22512")) {
      {}
    } else {
      stryCov_9fa48("22512");
      if (stryMutAct_9fa48("22515") ? false : stryMutAct_9fa48("22514") ? true : stryMutAct_9fa48("22513") ? reservation : (stryCov_9fa48("22513", "22514", "22515"), !reservation)) {
        if (stryMutAct_9fa48("22516")) {
          {}
        } else {
          stryCov_9fa48("22516");
          return stryMutAct_9fa48("22517") ? true : (stryCov_9fa48("22517"), false);
        }
      }
      const observedOwnership = this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
      const logicallyCommitted = stryMutAct_9fa48("22520") ? reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED && observedOwnership.observedCommitted : stryMutAct_9fa48("22519") ? false : stryMutAct_9fa48("22518") ? true : (stryCov_9fa48("22518", "22519", "22520"), (stryMutAct_9fa48("22522") ? reservation.status !== BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED : stryMutAct_9fa48("22521") ? false : (stryCov_9fa48("22521", "22522"), reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED)) || observedOwnership.observedCommitted);
      if (stryMutAct_9fa48("22525") ? false : stryMutAct_9fa48("22524") ? true : stryMutAct_9fa48("22523") ? logicallyCommitted : (stryCov_9fa48("22523", "22524", "22525"), !logicallyCommitted)) {
        if (stryMutAct_9fa48("22526")) {
          {}
        } else {
          stryCov_9fa48("22526");
          return stryMutAct_9fa48("22527") ? true : (stryCov_9fa48("22527"), false);
        }
      }
      const stabilizationExpiresAt = Number.isFinite(reservation.updatedAt) ? stryMutAct_9fa48("22528") ? reservation.updatedAt - this.getMoveReplicaAssignmentLeaseMs() : (stryCov_9fa48("22528"), reservation.updatedAt + this.getMoveReplicaAssignmentLeaseMs()) : null;
      if (stryMutAct_9fa48("22531") ? !Number.isFinite(stabilizationExpiresAt) && stabilizationExpiresAt <= now : stryMutAct_9fa48("22530") ? false : stryMutAct_9fa48("22529") ? true : (stryCov_9fa48("22529", "22530", "22531"), (stryMutAct_9fa48("22532") ? Number.isFinite(stabilizationExpiresAt) : (stryCov_9fa48("22532"), !Number.isFinite(stabilizationExpiresAt))) || (stryMutAct_9fa48("22535") ? stabilizationExpiresAt > now : stryMutAct_9fa48("22534") ? stabilizationExpiresAt < now : stryMutAct_9fa48("22533") ? false : (stryCov_9fa48("22533", "22534", "22535"), stabilizationExpiresAt <= now)))) {
        if (stryMutAct_9fa48("22536")) {
          {}
        } else {
          stryCov_9fa48("22536");
          return stryMutAct_9fa48("22537") ? true : (stryCov_9fa48("22537"), false);
        }
      }
      return stryMutAct_9fa48("22538") ? this.isMoveReplicaAssignmentTargetReady(reservation, now) : (stryCov_9fa48("22538"), !this.isMoveReplicaAssignmentTargetReady(reservation, now));
    }
  }
  isMoveReplicaAssignmentTargetReady(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22539")) {
      {}
    } else {
      stryCov_9fa48("22539");
      if (stryMutAct_9fa48("22542") ? !reservation?.targetNodeId && !reservation?.replicaId : stryMutAct_9fa48("22541") ? false : stryMutAct_9fa48("22540") ? true : (stryCov_9fa48("22540", "22541", "22542"), (stryMutAct_9fa48("22543") ? reservation?.targetNodeId : (stryCov_9fa48("22543"), !(stryMutAct_9fa48("22544") ? reservation.targetNodeId : (stryCov_9fa48("22544"), reservation?.targetNodeId)))) || (stryMutAct_9fa48("22545") ? reservation?.replicaId : (stryCov_9fa48("22545"), !(stryMutAct_9fa48("22546") ? reservation.replicaId : (stryCov_9fa48("22546"), reservation?.replicaId)))))) {
        if (stryMutAct_9fa48("22547")) {
          {}
        } else {
          stryCov_9fa48("22547");
          return stryMutAct_9fa48("22548") ? true : (stryCov_9fa48("22548"), false);
        }
      }
      const targetNodeRow = stryMutAct_9fa48("22551") ? this.getSystemTableCache()?.get(TABLES.NODES, reservation.targetNodeId) && null : stryMutAct_9fa48("22550") ? false : stryMutAct_9fa48("22549") ? true : (stryCov_9fa48("22549", "22550", "22551"), (stryMutAct_9fa48("22552") ? this.getSystemTableCache().get(TABLES.NODES, reservation.targetNodeId) : (stryCov_9fa48("22552"), this.getSystemTableCache()?.get(TABLES.NODES, reservation.targetNodeId))) || null);
      if (stryMutAct_9fa48("22555") ? !targetNodeRow && !isNodeRecordReady(targetNodeRow, {
        now
      }) : stryMutAct_9fa48("22554") ? false : stryMutAct_9fa48("22553") ? true : (stryCov_9fa48("22553", "22554", "22555"), (stryMutAct_9fa48("22556") ? targetNodeRow : (stryCov_9fa48("22556"), !targetNodeRow)) || (stryMutAct_9fa48("22557") ? isNodeRecordReady(targetNodeRow, {
        now
      }) : (stryCov_9fa48("22557"), !isNodeRecordReady(targetNodeRow, stryMutAct_9fa48("22558") ? {} : (stryCov_9fa48("22558"), {
        now
      })))))) {
        if (stryMutAct_9fa48("22559")) {
          {}
        } else {
          stryCov_9fa48("22559");
          return stryMutAct_9fa48("22560") ? true : (stryCov_9fa48("22560"), false);
        }
      }
      const existingServiceRow = stryMutAct_9fa48("22563") ? this.getSystemTableCache()?.get(TABLES.SERVICES, reservation.replicaId) && null : stryMutAct_9fa48("22562") ? false : stryMutAct_9fa48("22561") ? true : (stryCov_9fa48("22561", "22562", "22563"), (stryMutAct_9fa48("22564") ? this.getSystemTableCache().get(TABLES.SERVICES, reservation.replicaId) : (stryCov_9fa48("22564"), this.getSystemTableCache()?.get(TABLES.SERVICES, reservation.replicaId))) || null);
      const existingNodeId = stryMutAct_9fa48("22567") ? existingServiceRow?.[COLUMN.NODE_ID] && null : stryMutAct_9fa48("22566") ? false : stryMutAct_9fa48("22565") ? true : (stryCov_9fa48("22565", "22566", "22567"), (stryMutAct_9fa48("22568") ? existingServiceRow[COLUMN.NODE_ID] : (stryCov_9fa48("22568"), existingServiceRow?.[COLUMN.NODE_ID])) || null);
      const existingStatus = stryMutAct_9fa48("22569") ? String(existingServiceRow?.[COLUMN.STATUS] || STRING.UNKNOWN).toUpperCase() : (stryCov_9fa48("22569"), String(stryMutAct_9fa48("22572") ? existingServiceRow?.[COLUMN.STATUS] && STRING.UNKNOWN : stryMutAct_9fa48("22571") ? false : stryMutAct_9fa48("22570") ? true : (stryCov_9fa48("22570", "22571", "22572"), (stryMutAct_9fa48("22573") ? existingServiceRow[COLUMN.STATUS] : (stryCov_9fa48("22573"), existingServiceRow?.[COLUMN.STATUS])) || STRING.UNKNOWN)).toLowerCase());
      return stryMutAct_9fa48("22576") ? existingNodeId === reservation.targetNodeId || existingStatus === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22575") ? false : stryMutAct_9fa48("22574") ? true : (stryCov_9fa48("22574", "22575", "22576"), (stryMutAct_9fa48("22578") ? existingNodeId !== reservation.targetNodeId : stryMutAct_9fa48("22577") ? true : (stryCov_9fa48("22577", "22578"), existingNodeId === reservation.targetNodeId)) && (stryMutAct_9fa48("22580") ? existingStatus !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("22579") ? true : (stryCov_9fa48("22579", "22580"), existingStatus === SERVICE_STATUS.ACTIVE)));
    }
  }
  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22581")) {
      {}
    } else {
      stryCov_9fa48("22581");
      const admissionFloor = (stryMutAct_9fa48("22584") ? Number.isFinite(this.getBootstrapAdmissionRetryAfterMs()) || this.getBootstrapAdmissionRetryAfterMs() > NUM.ZERO : stryMutAct_9fa48("22583") ? false : stryMutAct_9fa48("22582") ? true : (stryCov_9fa48("22582", "22583", "22584"), Number.isFinite(this.getBootstrapAdmissionRetryAfterMs()) && (stryMutAct_9fa48("22587") ? this.getBootstrapAdmissionRetryAfterMs() <= NUM.ZERO : stryMutAct_9fa48("22586") ? this.getBootstrapAdmissionRetryAfterMs() >= NUM.ZERO : stryMutAct_9fa48("22585") ? true : (stryCov_9fa48("22585", "22586", "22587"), this.getBootstrapAdmissionRetryAfterMs() > NUM.ZERO)))) ? this.getBootstrapAdmissionRetryAfterMs() : BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
      const sweepInterval = (stryMutAct_9fa48("22590") ? Number.isFinite(this.getMoveReplicaAssignmentSweepIntervalMs()) || this.getMoveReplicaAssignmentSweepIntervalMs() > NUM.ZERO : stryMutAct_9fa48("22589") ? false : stryMutAct_9fa48("22588") ? true : (stryCov_9fa48("22588", "22589", "22590"), Number.isFinite(this.getMoveReplicaAssignmentSweepIntervalMs()) && (stryMutAct_9fa48("22593") ? this.getMoveReplicaAssignmentSweepIntervalMs() <= NUM.ZERO : stryMutAct_9fa48("22592") ? this.getMoveReplicaAssignmentSweepIntervalMs() >= NUM.ZERO : stryMutAct_9fa48("22591") ? true : (stryCov_9fa48("22591", "22592", "22593"), this.getMoveReplicaAssignmentSweepIntervalMs() > NUM.ZERO)))) ? this.getMoveReplicaAssignmentSweepIntervalMs() : admissionFloor;
      if (stryMutAct_9fa48("22596") ? false : stryMutAct_9fa48("22595") ? true : stryMutAct_9fa48("22594") ? reservation : (stryCov_9fa48("22594", "22595", "22596"), !reservation)) {
        if (stryMutAct_9fa48("22597")) {
          {}
        } else {
          stryCov_9fa48("22597");
          return admissionFloor;
        }
      }
      const blockingUntilMs = (stryMutAct_9fa48("22600") ? reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED || Number.isFinite(reservation.updatedAt) : stryMutAct_9fa48("22599") ? false : stryMutAct_9fa48("22598") ? true : (stryCov_9fa48("22598", "22599", "22600"), (stryMutAct_9fa48("22602") ? reservation.status !== BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED : stryMutAct_9fa48("22601") ? true : (stryCov_9fa48("22601", "22602"), reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED)) && Number.isFinite(reservation.updatedAt))) ? stryMutAct_9fa48("22603") ? reservation.updatedAt - this.getMoveReplicaAssignmentLeaseMs() : (stryCov_9fa48("22603"), reservation.updatedAt + this.getMoveReplicaAssignmentLeaseMs()) : reservation.leaseExpiresAt;
      if (stryMutAct_9fa48("22606") ? false : stryMutAct_9fa48("22605") ? true : stryMutAct_9fa48("22604") ? Number.isFinite(blockingUntilMs) : (stryCov_9fa48("22604", "22605", "22606"), !Number.isFinite(blockingUntilMs))) {
        if (stryMutAct_9fa48("22607")) {
          {}
        } else {
          stryCov_9fa48("22607");
          return stryMutAct_9fa48("22608") ? Math.min(admissionFloor, sweepInterval) : (stryCov_9fa48("22608"), Math.max(admissionFloor, sweepInterval));
        }
      }
      const remainingMs = stryMutAct_9fa48("22609") ? Math.min(NUM.ZERO, blockingUntilMs - now) : (stryCov_9fa48("22609"), Math.max(NUM.ZERO, stryMutAct_9fa48("22610") ? blockingUntilMs + now : (stryCov_9fa48("22610"), blockingUntilMs - now)));
      if (stryMutAct_9fa48("22613") ? remainingMs !== NUM.ZERO : stryMutAct_9fa48("22612") ? false : stryMutAct_9fa48("22611") ? true : (stryCov_9fa48("22611", "22612", "22613"), remainingMs === NUM.ZERO)) {
        if (stryMutAct_9fa48("22614")) {
          {}
        } else {
          stryCov_9fa48("22614");
          return admissionFloor;
        }
      }
      return stryMutAct_9fa48("22615") ? Math.min(admissionFloor, Math.min(sweepInterval, remainingMs)) : (stryCov_9fa48("22615"), Math.max(admissionFloor, stryMutAct_9fa48("22616") ? Math.max(sweepInterval, remainingMs) : (stryCov_9fa48("22616"), Math.min(sweepInterval, remainingMs))));
    }
  }
  isMoveReplicaAssignmentReservationActive(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22617")) {
      {}
    } else {
      stryCov_9fa48("22617");
      return stryMutAct_9fa48("22620") ? this.getMoveReplicaAssignmentReservationInvalidationReason(reservation, now) !== null : stryMutAct_9fa48("22619") ? false : stryMutAct_9fa48("22618") ? true : (stryCov_9fa48("22618", "22619", "22620"), this.getMoveReplicaAssignmentReservationInvalidationReason(reservation, now) === null);
    }
  }
  async expireMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("22621")) {
      {}
    } else {
      stryCov_9fa48("22621");
      const now = Date.now();
      const reservations = stryMutAct_9fa48("22622") ? ["Stryker was here"] : (stryCov_9fa48("22622"), []);
      const seenAssignmentIds = new Set();
      const assignmentReservations = this.getMoveReplicaAssignmentReservations();
      const pushReservation = reservation => {
        if (stryMutAct_9fa48("22623")) {
          {}
        } else {
          stryCov_9fa48("22623");
          const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
          if (stryMutAct_9fa48("22626") ? !normalized && seenAssignmentIds.has(normalized.assignmentId) : stryMutAct_9fa48("22625") ? false : stryMutAct_9fa48("22624") ? true : (stryCov_9fa48("22624", "22625", "22626"), (stryMutAct_9fa48("22627") ? normalized : (stryCov_9fa48("22627"), !normalized)) || seenAssignmentIds.has(normalized.assignmentId))) {
            if (stryMutAct_9fa48("22628")) {
              {}
            } else {
              stryCov_9fa48("22628");
              return;
            }
          }
          seenAssignmentIds.add(normalized.assignmentId);
          reservations.push(normalized);
        }
      };
      for (const reservation of stryMutAct_9fa48("22631") ? assignmentReservations?.values?.() && [] : stryMutAct_9fa48("22630") ? false : stryMutAct_9fa48("22629") ? true : (stryCov_9fa48("22629", "22630", "22631"), (stryMutAct_9fa48("22633") ? assignmentReservations.values?.() : stryMutAct_9fa48("22632") ? assignmentReservations?.values() : (stryCov_9fa48("22632", "22633"), assignmentReservations?.values?.())) || (stryMutAct_9fa48("22634") ? ["Stryker was here"] : (stryCov_9fa48("22634"), [])))) {
        if (stryMutAct_9fa48("22635")) {
          {}
        } else {
          stryCov_9fa48("22635");
          pushReservation(reservation);
        }
      }
      const cacheOrSqlReservations = await this.collectMoveReplicaAssignmentReservations(stryMutAct_9fa48("22636") ? {} : (stryCov_9fa48("22636"), {
        now
      }));
      for (const reservation of cacheOrSqlReservations) {
        if (stryMutAct_9fa48("22637")) {
          {}
        } else {
          stryCov_9fa48("22637");
          pushReservation(reservation);
        }
      }
      for (const reservation of reservations) {
        if (stryMutAct_9fa48("22638")) {
          {}
        } else {
          stryCov_9fa48("22638");
          if (stryMutAct_9fa48("22640") ? false : stryMutAct_9fa48("22639") ? true : (stryCov_9fa48("22639", "22640"), this.shouldReconcileMoveReplicaAssignmentReservationToCommitted(reservation, now))) {
            if (stryMutAct_9fa48("22641")) {
              {}
            } else {
              stryCov_9fa48("22641");
              await this.reconcileMoveReplicaAssignmentReservationToCommitted(reservation, now);
              continue;
            }
          }
          const invalidationReason = this.getMoveReplicaAssignmentReservationInvalidationReason(reservation, now);
          if (stryMutAct_9fa48("22644") ? invalidationReason !== null : stryMutAct_9fa48("22643") ? false : stryMutAct_9fa48("22642") ? true : (stryCov_9fa48("22642", "22643", "22644"), invalidationReason === null)) {
            if (stryMutAct_9fa48("22645")) {
              {}
            } else {
              stryCov_9fa48("22645");
              continue;
            }
          }
          if (stryMutAct_9fa48("22648") ? (invalidationReason === 'terminal' || invalidationReason === 'inactive_status') && invalidationReason === 'invalid_reservation' : stryMutAct_9fa48("22647") ? false : stryMutAct_9fa48("22646") ? true : (stryCov_9fa48("22646", "22647", "22648"), (stryMutAct_9fa48("22650") ? invalidationReason === 'terminal' && invalidationReason === 'inactive_status' : stryMutAct_9fa48("22649") ? false : (stryCov_9fa48("22649", "22650"), (stryMutAct_9fa48("22652") ? invalidationReason !== 'terminal' : stryMutAct_9fa48("22651") ? false : (stryCov_9fa48("22651", "22652"), invalidationReason === (stryMutAct_9fa48("22653") ? "" : (stryCov_9fa48("22653"), 'terminal')))) || (stryMutAct_9fa48("22655") ? invalidationReason !== 'inactive_status' : stryMutAct_9fa48("22654") ? false : (stryCov_9fa48("22654", "22655"), invalidationReason === (stryMutAct_9fa48("22656") ? "" : (stryCov_9fa48("22656"), 'inactive_status')))))) || (stryMutAct_9fa48("22658") ? invalidationReason !== 'invalid_reservation' : stryMutAct_9fa48("22657") ? false : (stryCov_9fa48("22657", "22658"), invalidationReason === (stryMutAct_9fa48("22659") ? "" : (stryCov_9fa48("22659"), 'invalid_reservation')))))) {
            if (stryMutAct_9fa48("22660")) {
              {}
            } else {
              stryCov_9fa48("22660");
              stryMutAct_9fa48("22661") ? assignmentReservations.delete(reservation.assignmentId) : (stryCov_9fa48("22661"), assignmentReservations?.delete(reservation.assignmentId));
              continue;
            }
          }
          if (stryMutAct_9fa48("22664") ? invalidationReason !== 'lease_expired' : stryMutAct_9fa48("22663") ? false : stryMutAct_9fa48("22662") ? true : (stryCov_9fa48("22662", "22663", "22664"), invalidationReason === (stryMutAct_9fa48("22665") ? "" : (stryCov_9fa48("22665"), 'lease_expired')))) {
            if (stryMutAct_9fa48("22666")) {
              {}
            } else {
              stryCov_9fa48("22666");
              stryMutAct_9fa48("22667") ? assignmentReservations.set(reservation.assignmentId, reservation) : (stryCov_9fa48("22667"), assignmentReservations?.set(reservation.assignmentId, reservation));
              continue;
            }
          }
          stryMutAct_9fa48("22668") ? assignmentReservations.set(reservation.assignmentId, reservation) : (stryCov_9fa48("22668"), assignmentReservations?.set(reservation.assignmentId, reservation));
          await this.markMoveReplicaAssignmentReservationTerminal(reservation.assignmentId, BOOTSTRAP_API_HANDOFF_STATUS.FAILED, WORKFLOW_STEP.FAILED, (stryMutAct_9fa48("22671") ? invalidationReason !== 'source_owner_unavailable' : stryMutAct_9fa48("22670") ? false : stryMutAct_9fa48("22669") ? true : (stryCov_9fa48("22669", "22670", "22671"), invalidationReason === (stryMutAct_9fa48("22672") ? "" : (stryCov_9fa48("22672"), 'source_owner_unavailable')))) ? stryMutAct_9fa48("22673") ? "" : (stryCov_9fa48("22673"), 'assignment source owner unavailable') : stryMutAct_9fa48("22674") ? "" : (stryCov_9fa48("22674"), 'assignment reservation invalid'));
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_EXPIRED, stryMutAct_9fa48("22675") ? {} : (stryCov_9fa48("22675"), {
            assignmentId: reservation.assignmentId,
            replicaId: reservation.replicaId,
            targetNodeId: reservation.targetNodeId,
            invalidationReason
          }));
        }
      }
    }
  }
  async reserveMoveReplicaAssignment(targetNodeId, assignment) {
    if (stryMutAct_9fa48("22676")) {
      {}
    } else {
      stryCov_9fa48("22676");
      const replicaId = stryMutAct_9fa48("22677") ? assignment.replicaToMove : (stryCov_9fa48("22677"), assignment?.replicaToMove);
      if (stryMutAct_9fa48("22680") ? false : stryMutAct_9fa48("22679") ? true : stryMutAct_9fa48("22678") ? replicaId : (stryCov_9fa48("22678", "22679", "22680"), !replicaId)) {
        if (stryMutAct_9fa48("22681")) {
          {}
        } else {
          stryCov_9fa48("22681");
          throw new Error(stryMutAct_9fa48("22682") ? "" : (stryCov_9fa48("22682"), 'MOVE_REPLICA reservation requires replicaToMove'));
        }
      }
      const activeReservations = await this.getActiveMoveReplicaAssignmentReservations();
      const conflictingReservation = activeReservations.find(stryMutAct_9fa48("22683") ? () => undefined : (stryCov_9fa48("22683"), reservation => stryMutAct_9fa48("22686") ? reservation.replicaId !== replicaId : stryMutAct_9fa48("22685") ? false : stryMutAct_9fa48("22684") ? true : (stryCov_9fa48("22684", "22685", "22686"), reservation.replicaId === replicaId)));
      if (stryMutAct_9fa48("22688") ? false : stryMutAct_9fa48("22687") ? true : (stryCov_9fa48("22687", "22688"), conflictingReservation)) {
        if (stryMutAct_9fa48("22689")) {
          {}
        } else {
          stryCov_9fa48("22689");
          this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_CONFLICT, stryMutAct_9fa48("22690") ? {} : (stryCov_9fa48("22690"), {
            requestedNodeId: targetNodeId,
            replicaId,
            conflictingAssignmentId: conflictingReservation.assignmentId,
            conflictingTargetNodeId: conflictingReservation.targetNodeId
          }));
          throw new Error(stryMutAct_9fa48("22691") ? "" : (stryCov_9fa48("22691"), 'MOVE_REPLICA reservation conflict'));
        }
      }
      const now = Date.now();
      const assignmentId = uuidv4();
      const leaseExpiresAt = stryMutAct_9fa48("22692") ? now - this.getMoveReplicaAssignmentLeaseMs() : (stryCov_9fa48("22692"), now + this.getMoveReplicaAssignmentLeaseMs());
      const stepsHistory = stryMutAct_9fa48("22693") ? [] : (stryCov_9fa48("22693"), [stryMutAct_9fa48("22694") ? {} : (stryCov_9fa48("22694"), {
        phase: stryMutAct_9fa48("22695") ? "" : (stryCov_9fa48("22695"), 'reserved'),
        step: WORKFLOW_STEP.PENDING,
        status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
        timestamp: now,
        leaseExpiresAt
      })]);
      const reservation = stryMutAct_9fa48("22696") ? {} : (stryCov_9fa48("22696"), {
        assignmentId,
        replicaId,
        sourceNodeId: stryMutAct_9fa48("22699") ? assignment.sourceNodeId && null : stryMutAct_9fa48("22698") ? false : stryMutAct_9fa48("22697") ? true : (stryCov_9fa48("22697", "22698", "22699"), assignment.sourceNodeId || null),
        targetNodeId,
        groupId: stryMutAct_9fa48("22702") ? assignment.groupId && null : stryMutAct_9fa48("22701") ? false : stryMutAct_9fa48("22700") ? true : (stryCov_9fa48("22700", "22701", "22702"), assignment.groupId || null),
        status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
        leaseExpiresAt,
        updatedAt: now,
        stepsHistory
      });
      const reservations = this.getMoveReplicaAssignmentReservations();
      stryMutAct_9fa48("22703") ? reservations.set(assignmentId, reservation) : (stryCov_9fa48("22703"), reservations?.set(assignmentId, reservation));
      if (stryMutAct_9fa48("22705") ? false : stryMutAct_9fa48("22704") ? true : (stryCov_9fa48("22704", "22705"), this.getSqlQueryEngine())) {
        if (stryMutAct_9fa48("22706")) {
          {}
        } else {
          stryCov_9fa48("22706");
          try {
            if (stryMutAct_9fa48("22707")) {
              {}
            } else {
              stryCov_9fa48("22707");
              const persistResult = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("22708") ? {} : (stryCov_9fa48("22708"), {
                operation: stryMutAct_9fa48("22709") ? "" : (stryCov_9fa48("22709"), 'insert'),
                tableName: TABLES.REPLICA_OPERATIONS,
                row: this.buildMoveReplicaAssignmentReplicaOperationRow(reservation, WORKFLOW_STEP.PENDING, stryMutAct_9fa48("22710") ? {} : (stryCov_9fa48("22710"), {
                  createdAt: now
                }))
              }));
              if (stryMutAct_9fa48("22713") ? persistResult?.success !== false : stryMutAct_9fa48("22712") ? false : stryMutAct_9fa48("22711") ? true : (stryCov_9fa48("22711", "22712", "22713"), (stryMutAct_9fa48("22714") ? persistResult.success : (stryCov_9fa48("22714"), persistResult?.success)) === (stryMutAct_9fa48("22715") ? true : (stryCov_9fa48("22715"), false)))) {
                if (stryMutAct_9fa48("22716")) {
                  {}
                } else {
                  stryCov_9fa48("22716");
                  if (stryMutAct_9fa48("22719") ? false : stryMutAct_9fa48("22718") ? true : stryMutAct_9fa48("22717") ? this.isRetryableMoveReplicaAssignmentPersistenceFailure(persistResult) : (stryCov_9fa48("22717", "22718", "22719"), !this.isRetryableMoveReplicaAssignmentPersistenceFailure(persistResult))) {
                    if (stryMutAct_9fa48("22720")) {
                      {}
                    } else {
                      stryCov_9fa48("22720");
                      stryMutAct_9fa48("22721") ? reservations.delete(assignmentId) : (stryCov_9fa48("22721"), reservations?.delete(assignmentId));
                      throw this.buildBootstrapControlPlaneQueryError(persistResult, stryMutAct_9fa48("22722") ? "" : (stryCov_9fa48("22722"), 'Failed to persist MOVE_REPLICA assignment reservation'));
                    }
                  }
                  this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVATION_WRITE_FAILED, stryMutAct_9fa48("22723") ? {} : (stryCov_9fa48("22723"), {
                    assignmentId,
                    replicaId,
                    targetNodeId,
                    sourceNodeId: reservation.sourceNodeId,
                    retryAfterMs: stryMutAct_9fa48("22726") ? persistResult?.retryAfterMs && null : stryMutAct_9fa48("22725") ? false : stryMutAct_9fa48("22724") ? true : (stryCov_9fa48("22724", "22725", "22726"), (stryMutAct_9fa48("22727") ? persistResult.retryAfterMs : (stryCov_9fa48("22727"), persistResult?.retryAfterMs)) || null),
                    error: stryMutAct_9fa48("22730") ? persistResult?.error && 'failed to persist MOVE_REPLICA assignment reservation' : stryMutAct_9fa48("22729") ? false : stryMutAct_9fa48("22728") ? true : (stryCov_9fa48("22728", "22729", "22730"), (stryMutAct_9fa48("22731") ? persistResult.error : (stryCov_9fa48("22731"), persistResult?.error)) || (stryMutAct_9fa48("22732") ? "" : (stryCov_9fa48("22732"), 'failed to persist MOVE_REPLICA assignment reservation')))
                  }));
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("22733")) {
              {}
            } else {
              stryCov_9fa48("22733");
              if (stryMutAct_9fa48("22736") ? false : stryMutAct_9fa48("22735") ? true : stryMutAct_9fa48("22734") ? this.isRetryableMoveReplicaAssignmentPersistenceFailure(error) : (stryCov_9fa48("22734", "22735", "22736"), !this.isRetryableMoveReplicaAssignmentPersistenceFailure(error))) {
                if (stryMutAct_9fa48("22737")) {
                  {}
                } else {
                  stryCov_9fa48("22737");
                  stryMutAct_9fa48("22738") ? reservations.delete(assignmentId) : (stryCov_9fa48("22738"), reservations?.delete(assignmentId));
                  throw error;
                }
              }
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVATION_WRITE_FAILED, stryMutAct_9fa48("22739") ? {} : (stryCov_9fa48("22739"), {
                assignmentId,
                replicaId,
                targetNodeId,
                sourceNodeId: reservation.sourceNodeId,
                retryAfterMs: stryMutAct_9fa48("22742") ? error?.retryAfterMs && null : stryMutAct_9fa48("22741") ? false : stryMutAct_9fa48("22740") ? true : (stryCov_9fa48("22740", "22741", "22742"), (stryMutAct_9fa48("22743") ? error.retryAfterMs : (stryCov_9fa48("22743"), error?.retryAfterMs)) || null),
                error: stryMutAct_9fa48("22746") ? error?.message && String(error) : stryMutAct_9fa48("22745") ? false : stryMutAct_9fa48("22744") ? true : (stryCov_9fa48("22744", "22745", "22746"), (stryMutAct_9fa48("22747") ? error.message : (stryCov_9fa48("22747"), error?.message)) || String(error))
              }));
            }
          }
        }
      }
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVED, stryMutAct_9fa48("22748") ? {} : (stryCov_9fa48("22748"), {
        assignmentId,
        replicaId,
        targetNodeId,
        sourceNodeId: reservation.sourceNodeId,
        leaseExpiresAt
      }));
      return reservation;
    }
  }
  async markMoveReplicaAssignmentReservationTerminal(assignmentId, status, workflowStep, errorMessage = null) {
    if (stryMutAct_9fa48("22749")) {
      {}
    } else {
      stryCov_9fa48("22749");
      const reservations = this.getMoveReplicaAssignmentReservations();
      const existing = stryMutAct_9fa48("22750") ? reservations.get(assignmentId) : (stryCov_9fa48("22750"), reservations?.get(assignmentId));
      const now = Date.now();
      const nextReservation = stryMutAct_9fa48("22751") ? {} : (stryCov_9fa48("22751"), {
        ...(stryMutAct_9fa48("22754") ? existing && {} : stryMutAct_9fa48("22753") ? false : stryMutAct_9fa48("22752") ? true : (stryCov_9fa48("22752", "22753", "22754"), existing || {})),
        assignmentId,
        status,
        updatedAt: now,
        leaseExpiresAt: now
      });
      stryMutAct_9fa48("22755") ? reservations.set(assignmentId, nextReservation) : (stryCov_9fa48("22755"), reservations?.set(assignmentId, nextReservation));
      if (stryMutAct_9fa48("22757") ? false : stryMutAct_9fa48("22756") ? true : (stryCov_9fa48("22756", "22757"), this.getSqlQueryEngine())) {
        if (stryMutAct_9fa48("22758")) {
          {}
        } else {
          stryCov_9fa48("22758");
          const updateResult = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("22759") ? {} : (stryCov_9fa48("22759"), {
            operation: stryMutAct_9fa48("22760") ? "" : (stryCov_9fa48("22760"), 'update'),
            tableName: TABLES.REPLICA_OPERATIONS,
            whereClause: stryMutAct_9fa48("22761") ? {} : (stryCov_9fa48("22761"), {
              operation_id: assignmentId
            }),
            data: this.buildMoveReplicaAssignmentReplicaOperationUpdateData(nextReservation, workflowStep, stryMutAct_9fa48("22762") ? {} : (stryCov_9fa48("22762"), {
              completedAt: now,
              errorMessage
            }))
          }));
          if (stryMutAct_9fa48("22765") ? updateResult?.success !== false : stryMutAct_9fa48("22764") ? false : stryMutAct_9fa48("22763") ? true : (stryCov_9fa48("22763", "22764", "22765"), (stryMutAct_9fa48("22766") ? updateResult.success : (stryCov_9fa48("22766"), updateResult?.success)) === (stryMutAct_9fa48("22767") ? true : (stryCov_9fa48("22767"), false)))) {
            if (stryMutAct_9fa48("22768")) {
              {}
            } else {
              stryCov_9fa48("22768");
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED, stryMutAct_9fa48("22769") ? {} : (stryCov_9fa48("22769"), {
                assignmentId,
                status,
                error: stryMutAct_9fa48("22772") ? updateResult.error && 'failed to persist reservation terminal status' : stryMutAct_9fa48("22771") ? false : stryMutAct_9fa48("22770") ? true : (stryCov_9fa48("22770", "22771", "22772"), updateResult.error || (stryMutAct_9fa48("22773") ? "" : (stryCov_9fa48("22773"), 'failed to persist reservation terminal status')))
              }));
            }
          }
        }
      }
    }
  }
  async reconcileMoveReplicaAssignmentReservationToCommitted(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("22774")) {
      {}
    } else {
      stryCov_9fa48("22774");
      if (stryMutAct_9fa48("22777") ? false : stryMutAct_9fa48("22776") ? true : stryMutAct_9fa48("22775") ? reservation?.assignmentId : (stryCov_9fa48("22775", "22776", "22777"), !(stryMutAct_9fa48("22778") ? reservation.assignmentId : (stryCov_9fa48("22778"), reservation?.assignmentId)))) {
        if (stryMutAct_9fa48("22779")) {
          {}
        } else {
          stryCov_9fa48("22779");
          return;
        }
      }
      const existingStepsHistory = Array.isArray(reservation.stepsHistory) ? reservation.stepsHistory : stryMutAct_9fa48("22780") ? ["Stryker was here"] : (stryCov_9fa48("22780"), []);
      const lastStep = stryMutAct_9fa48("22783") ? existingStepsHistory[existingStepsHistory.length - 1] && null : stryMutAct_9fa48("22782") ? false : stryMutAct_9fa48("22781") ? true : (stryCov_9fa48("22781", "22782", "22783"), existingStepsHistory[stryMutAct_9fa48("22784") ? existingStepsHistory.length + 1 : (stryCov_9fa48("22784"), existingStepsHistory.length - 1)] || null);
      const stepsHistory = (stryMutAct_9fa48("22787") ? lastStep?.phase === 'observed_committed' && lastStep?.step === WORKFLOW_STEP.ACTIVE || lastStep?.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED : stryMutAct_9fa48("22786") ? false : stryMutAct_9fa48("22785") ? true : (stryCov_9fa48("22785", "22786", "22787"), (stryMutAct_9fa48("22789") ? lastStep?.phase === 'observed_committed' || lastStep?.step === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("22788") ? true : (stryCov_9fa48("22788", "22789"), (stryMutAct_9fa48("22791") ? lastStep?.phase !== 'observed_committed' : stryMutAct_9fa48("22790") ? true : (stryCov_9fa48("22790", "22791"), (stryMutAct_9fa48("22792") ? lastStep.phase : (stryCov_9fa48("22792"), lastStep?.phase)) === (stryMutAct_9fa48("22793") ? "" : (stryCov_9fa48("22793"), 'observed_committed')))) && (stryMutAct_9fa48("22795") ? lastStep?.step !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("22794") ? true : (stryCov_9fa48("22794", "22795"), (stryMutAct_9fa48("22796") ? lastStep.step : (stryCov_9fa48("22796"), lastStep?.step)) === WORKFLOW_STEP.ACTIVE)))) && (stryMutAct_9fa48("22798") ? lastStep?.status !== BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED : stryMutAct_9fa48("22797") ? true : (stryCov_9fa48("22797", "22798"), (stryMutAct_9fa48("22799") ? lastStep.status : (stryCov_9fa48("22799"), lastStep?.status)) === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED)))) ? existingStepsHistory : stryMutAct_9fa48("22800") ? [] : (stryCov_9fa48("22800"), [...existingStepsHistory, stryMutAct_9fa48("22801") ? {} : (stryCov_9fa48("22801"), {
        phase: stryMutAct_9fa48("22802") ? "" : (stryCov_9fa48("22802"), 'observed_committed'),
        step: WORKFLOW_STEP.ACTIVE,
        status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
        timestamp: now
      })]);
      const nextReservation = stryMutAct_9fa48("22803") ? {} : (stryCov_9fa48("22803"), {
        ...reservation,
        status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
        leaseExpiresAt: now,
        updatedAt: now,
        stepsHistory
      });
      stryMutAct_9fa48("22804") ? this.getMoveReplicaAssignmentReservations().set(reservation.assignmentId, nextReservation) : (stryCov_9fa48("22804"), this.getMoveReplicaAssignmentReservations()?.set(reservation.assignmentId, nextReservation));
      if (stryMutAct_9fa48("22806") ? false : stryMutAct_9fa48("22805") ? true : (stryCov_9fa48("22805", "22806"), this.getSqlQueryEngine())) {
        if (stryMutAct_9fa48("22807")) {
          {}
        } else {
          stryCov_9fa48("22807");
          const updateResult = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("22808") ? {} : (stryCov_9fa48("22808"), {
            operation: stryMutAct_9fa48("22809") ? "" : (stryCov_9fa48("22809"), 'update'),
            tableName: TABLES.REPLICA_OPERATIONS,
            whereClause: stryMutAct_9fa48("22810") ? {} : (stryCov_9fa48("22810"), {
              operation_id: reservation.assignmentId
            }),
            data: this.buildMoveReplicaAssignmentReplicaOperationUpdateData(nextReservation, WORKFLOW_STEP.ACTIVE, stryMutAct_9fa48("22811") ? {} : (stryCov_9fa48("22811"), {
              completedAt: now
            }))
          }));
          if (stryMutAct_9fa48("22814") ? updateResult?.success !== false : stryMutAct_9fa48("22813") ? false : stryMutAct_9fa48("22812") ? true : (stryCov_9fa48("22812", "22813", "22814"), (stryMutAct_9fa48("22815") ? updateResult.success : (stryCov_9fa48("22815"), updateResult?.success)) === (stryMutAct_9fa48("22816") ? true : (stryCov_9fa48("22816"), false)))) {
            if (stryMutAct_9fa48("22817")) {
              {}
            } else {
              stryCov_9fa48("22817");
              this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED, stryMutAct_9fa48("22818") ? {} : (stryCov_9fa48("22818"), {
                assignmentId: reservation.assignmentId,
                status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
                error: stryMutAct_9fa48("22821") ? updateResult.error && 'failed to reconcile MOVE_REPLICA assignment to committed state' : stryMutAct_9fa48("22820") ? false : stryMutAct_9fa48("22819") ? true : (stryCov_9fa48("22819", "22820", "22821"), updateResult.error || (stryMutAct_9fa48("22822") ? "" : (stryCov_9fa48("22822"), 'failed to reconcile MOVE_REPLICA assignment to committed state')))
              }));
              return;
            }
          }
        }
      }
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RECONCILED, stryMutAct_9fa48("22823") ? {} : (stryCov_9fa48("22823"), {
        assignmentId: reservation.assignmentId,
        replicaId: reservation.replicaId,
        targetNodeId: reservation.targetNodeId,
        sourceNodeId: stryMutAct_9fa48("22826") ? reservation.sourceNodeId && null : stryMutAct_9fa48("22825") ? false : stryMutAct_9fa48("22824") ? true : (stryCov_9fa48("22824", "22825", "22826"), reservation.sourceNodeId || null)
      }));
    }
  }
}
export { MoveReplicaAssignmentOwner };