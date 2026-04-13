/**
 * ProvisioningAdmissionPolicy
 *
 * Owns storage/admission/readiness synthesis for storage-increasing topology
 * mutations. Extracted from RebalanceCoordinator per D7.1 / D7.2.
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
import { NUM, SERVICE_TYPE } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { CONTROL_PLANE_MUTATION_WORK_CLASS, getLocalControlPlaneMutationReadinessBlocker, normalizeControlPlaneMutationWorkClass, requiresStableLocalControlPlaneMutationReadiness } from '../control-plane/control-plane-mutation-readiness.js';
import { REBALANCE_COORDINATOR_ERROR_MSG, REBALANCE_COORDINATOR_LOG_MSG, REBALANCER_SKIP_REASON } from './rebalancer-constants.js';
import { STORAGE_ADMISSION_DECISION_TYPE, STORAGE_ADMISSION_REASON } from './storage-admission-constants.js';
import { OperationType } from './replica-status.js';
const PROVISIONING_ADMISSION_EVALUATION_STATE = Object.freeze(stryMutAct_9fa48("135045") ? {} : (stryCov_9fa48("135045"), {
  CHECK_ADD: stryMutAct_9fa48("135046") ? "" : (stryCov_9fa48("135046"), 'check_add'),
  CHECK_REPLACE: stryMutAct_9fa48("135047") ? "" : (stryCov_9fa48("135047"), 'check_replace'),
  NO_ADMISSION_REQUIRED: stryMutAct_9fa48("135048") ? "" : (stryCov_9fa48("135048"), 'no_admission_required')
}));
class ProvisioningAdmissionPolicy {
  /**
   * @param {Object} options
   * @param {string} [options.nodeId]
   * @param {Object} [options.logger]
   * @param {Object} [options.delegates]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("135049")) {
      {}
    } else {
      stryCov_9fa48("135049");
      this.nodeId = stryMutAct_9fa48("135052") ? options.nodeId && null : stryMutAct_9fa48("135051") ? false : stryMutAct_9fa48("135050") ? true : (stryCov_9fa48("135050", "135051", "135052"), options.nodeId || null);
      this.logger = stryMutAct_9fa48("135055") ? options.logger && console : stryMutAct_9fa48("135054") ? false : stryMutAct_9fa48("135053") ? true : (stryCov_9fa48("135053", "135054", "135055"), options.logger || console);
      this.delegates = stryMutAct_9fa48("135058") ? options.delegates && {} : stryMutAct_9fa48("135057") ? false : stryMutAct_9fa48("135056") ? true : (stryCov_9fa48("135056", "135057", "135058"), options.delegates || {});
    }
  }

  /**
   * @return {string|null}
   * @private
   */
  getNodeId() {
    if (stryMutAct_9fa48("135059")) {
      {}
    } else {
      stryCov_9fa48("135059");
      if (stryMutAct_9fa48("135062") ? typeof this.delegates.getNodeId !== 'function' : stryMutAct_9fa48("135061") ? false : stryMutAct_9fa48("135060") ? true : (stryCov_9fa48("135060", "135061", "135062"), typeof this.delegates.getNodeId === (stryMutAct_9fa48("135063") ? "" : (stryCov_9fa48("135063"), 'function')))) {
        if (stryMutAct_9fa48("135064")) {
          {}
        } else {
          stryCov_9fa48("135064");
          return this.delegates.getNodeId();
        }
      }
      return this.nodeId;
    }
  }

  /**
   * @return {Object|null}
   * @private
   */
  getControlPlaneReadinessService() {
    if (stryMutAct_9fa48("135065")) {
      {}
    } else {
      stryCov_9fa48("135065");
      if (stryMutAct_9fa48("135068") ? typeof this.delegates.getControlPlaneReadinessService !== 'function' : stryMutAct_9fa48("135067") ? false : stryMutAct_9fa48("135066") ? true : (stryCov_9fa48("135066", "135067", "135068"), typeof this.delegates.getControlPlaneReadinessService === (stryMutAct_9fa48("135069") ? "" : (stryCov_9fa48("135069"), 'function')))) {
        if (stryMutAct_9fa48("135070")) {
          {}
        } else {
          stryCov_9fa48("135070");
          return this.delegates.getControlPlaneReadinessService();
        }
      }
      return null;
    }
  }

  /**
   * @return {Object|null}
   * @private
   */
  getStorageAdmissionService() {
    if (stryMutAct_9fa48("135071")) {
      {}
    } else {
      stryCov_9fa48("135071");
      if (stryMutAct_9fa48("135074") ? typeof this.delegates.getStorageAdmissionService !== 'function' : stryMutAct_9fa48("135073") ? false : stryMutAct_9fa48("135072") ? true : (stryCov_9fa48("135072", "135073", "135074"), typeof this.delegates.getStorageAdmissionService === (stryMutAct_9fa48("135075") ? "" : (stryCov_9fa48("135075"), 'function')))) {
        if (stryMutAct_9fa48("135076")) {
          {}
        } else {
          stryCov_9fa48("135076");
          return this.delegates.getStorageAdmissionService();
        }
      }
      return null;
    }
  }

  /**
   * @return {Object|null}
   * @private
   */
  getStorageAccountingService() {
    if (stryMutAct_9fa48("135077")) {
      {}
    } else {
      stryCov_9fa48("135077");
      if (stryMutAct_9fa48("135080") ? typeof this.delegates.getStorageAccountingService !== 'function' : stryMutAct_9fa48("135079") ? false : stryMutAct_9fa48("135078") ? true : (stryCov_9fa48("135078", "135079", "135080"), typeof this.delegates.getStorageAccountingService === (stryMutAct_9fa48("135081") ? "" : (stryCov_9fa48("135081"), 'function')))) {
        if (stryMutAct_9fa48("135082")) {
          {}
        } else {
          stryCov_9fa48("135082");
          return this.delegates.getStorageAccountingService();
        }
      }
      return null;
    }
  }

  /**
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    if (stryMutAct_9fa48("135083")) {
      {}
    } else {
      stryCov_9fa48("135083");
      if (stryMutAct_9fa48("135086") ? typeof this.delegates.isCriticalSystemPartition !== 'function' : stryMutAct_9fa48("135085") ? false : stryMutAct_9fa48("135084") ? true : (stryCov_9fa48("135084", "135085", "135086"), typeof this.delegates.isCriticalSystemPartition === (stryMutAct_9fa48("135087") ? "" : (stryCov_9fa48("135087"), 'function')))) {
        if (stryMutAct_9fa48("135088")) {
          {}
        } else {
          stryCov_9fa48("135088");
          return stryMutAct_9fa48("135091") ? this.delegates.isCriticalSystemPartition(partitionId) !== true : stryMutAct_9fa48("135090") ? false : stryMutAct_9fa48("135089") ? true : (stryCov_9fa48("135089", "135090", "135091"), this.delegates.isCriticalSystemPartition(partitionId) === (stryMutAct_9fa48("135092") ? false : (stryCov_9fa48("135092"), true)));
        }
      }
      return stryMutAct_9fa48("135093") ? true : (stryCov_9fa48("135093"), false);
    }
  }

  /**
   * Resolve whether one admission should use critical-system semantics.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  resolveAdmissionCriticality(context = {}) {
    if (stryMutAct_9fa48("135094")) {
      {}
    } else {
      stryCov_9fa48("135094");
      const partitionId = stryMutAct_9fa48("135097") ? (context.partitionId || context.entityId || context.move?.partitionId || context.move?.entityId) && null : stryMutAct_9fa48("135096") ? false : stryMutAct_9fa48("135095") ? true : (stryCov_9fa48("135095", "135096", "135097"), (stryMutAct_9fa48("135099") ? (context.partitionId || context.entityId || context.move?.partitionId) && context.move?.entityId : stryMutAct_9fa48("135098") ? false : (stryCov_9fa48("135098", "135099"), (stryMutAct_9fa48("135101") ? (context.partitionId || context.entityId) && context.move?.partitionId : stryMutAct_9fa48("135100") ? false : (stryCov_9fa48("135100", "135101"), (stryMutAct_9fa48("135103") ? context.partitionId && context.entityId : stryMutAct_9fa48("135102") ? false : (stryCov_9fa48("135102", "135103"), context.partitionId || context.entityId)) || (stryMutAct_9fa48("135104") ? context.move.partitionId : (stryCov_9fa48("135104"), context.move?.partitionId)))) || (stryMutAct_9fa48("135105") ? context.move.entityId : (stryCov_9fa48("135105"), context.move?.entityId)))) || null);
      return this.isCriticalSystemPartition(partitionId);
    }
  }

  /**
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (stryMutAct_9fa48("135106")) {
      {}
    } else {
      stryCov_9fa48("135106");
      if (stryMutAct_9fa48("135109") ? typeof this.delegates.normalizeMoveType !== 'function' : stryMutAct_9fa48("135108") ? false : stryMutAct_9fa48("135107") ? true : (stryCov_9fa48("135107", "135108", "135109"), typeof this.delegates.normalizeMoveType === (stryMutAct_9fa48("135110") ? "" : (stryCov_9fa48("135110"), 'function')))) {
        if (stryMutAct_9fa48("135111")) {
          {}
        } else {
          stryCov_9fa48("135111");
          return this.delegates.normalizeMoveType(moveType);
        }
      }
      return moveType;
    }
  }

  /**
   * @param {Object} move
   * @return {string}
   * @private
   */
  normalizeControlPlaneMutationWorkClass(move) {
    if (stryMutAct_9fa48("135112")) {
      {}
    } else {
      stryCov_9fa48("135112");
      return normalizeControlPlaneMutationWorkClass(stryMutAct_9fa48("135113") ? move.controlPlaneMutationWorkClass : (stryCov_9fa48("135113"), move?.controlPlaneMutationWorkClass), CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE);
    }
  }

  /**
   * Build an admission result for local control-plane mutation unhealthiness.
   * @param {Object} blocker
   * @return {Object}
   */
  buildLocalControlPlaneMutationAdmissionResult(blocker) {
    if (stryMutAct_9fa48("135114")) {
      {}
    } else {
      stryCov_9fa48("135114");
      const reasonCodes = (stryMutAct_9fa48("135117") ? Array.isArray(blocker?.reasonCodes) || blocker.reasonCodes.length > NUM.ZERO : stryMutAct_9fa48("135116") ? false : stryMutAct_9fa48("135115") ? true : (stryCov_9fa48("135115", "135116", "135117"), Array.isArray(stryMutAct_9fa48("135118") ? blocker.reasonCodes : (stryCov_9fa48("135118"), blocker?.reasonCodes)) && (stryMutAct_9fa48("135121") ? blocker.reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("135120") ? blocker.reasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("135119") ? true : (stryCov_9fa48("135119", "135120", "135121"), blocker.reasonCodes.length > NUM.ZERO)))) ? blocker.reasonCodes : stryMutAct_9fa48("135122") ? [] : (stryCov_9fa48("135122"), [STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY]);
      const firstReason = String(stryMutAct_9fa48("135125") ? reasonCodes[NUM.ZERO] && STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY : stryMutAct_9fa48("135124") ? false : stryMutAct_9fa48("135123") ? true : (stryCov_9fa48("135123", "135124", "135125"), reasonCodes[NUM.ZERO] || STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY));
      const nodeSummary = (stryMutAct_9fa48("135128") ? blocker?.readiness || typeof blocker.readiness === 'object' : stryMutAct_9fa48("135127") ? false : stryMutAct_9fa48("135126") ? true : (stryCov_9fa48("135126", "135127", "135128"), (stryMutAct_9fa48("135129") ? blocker.readiness : (stryCov_9fa48("135129"), blocker?.readiness)) && (stryMutAct_9fa48("135131") ? typeof blocker.readiness !== 'object' : stryMutAct_9fa48("135130") ? true : (stryCov_9fa48("135130", "135131"), typeof blocker.readiness === (stryMutAct_9fa48("135132") ? "" : (stryCov_9fa48("135132"), 'object')))))) ? Object.freeze(stryMutAct_9fa48("135133") ? {} : (stryCov_9fa48("135133"), {
        status: stryMutAct_9fa48("135134") ? blocker.readiness.lifecycleState && null : (stryCov_9fa48("135134"), blocker.readiness.lifecycleState ?? null),
        connectionState: stryMutAct_9fa48("135135") ? blocker.readiness.nodeEvidence?.connectionState && null : (stryCov_9fa48("135135"), (stryMutAct_9fa48("135136") ? blocker.readiness.nodeEvidence.connectionState : (stryCov_9fa48("135136"), blocker.readiness.nodeEvidence?.connectionState)) ?? null),
        lastHeartbeat: stryMutAct_9fa48("135137") ? blocker.readiness.nodeEvidence?.lastHeartbeat && null : (stryCov_9fa48("135137"), (stryMutAct_9fa48("135138") ? blocker.readiness.nodeEvidence.lastHeartbeat : (stryCov_9fa48("135138"), blocker.readiness.nodeEvidence?.lastHeartbeat)) ?? null),
        readyLeaseExpiresAt: stryMutAct_9fa48("135139") ? blocker.readiness.nodeEvidence?.readyLeaseExpiresAt && null : (stryCov_9fa48("135139"), (stryMutAct_9fa48("135140") ? blocker.readiness.nodeEvidence.readyLeaseExpiresAt : (stryCov_9fa48("135140"), blocker.readiness.nodeEvidence?.readyLeaseExpiresAt)) ?? null),
        storageBudgetBytes: stryMutAct_9fa48("135141") ? blocker.readiness.capacity?.storageBudgetBytes && null : (stryCov_9fa48("135141"), (stryMutAct_9fa48("135142") ? blocker.readiness.capacity.storageBudgetBytes : (stryCov_9fa48("135142"), blocker.readiness.capacity?.storageBudgetBytes)) ?? null)
      })) : null;
      return Object.freeze(stryMutAct_9fa48("135143") ? {} : (stryCov_9fa48("135143"), {
        allowed: stryMutAct_9fa48("135144") ? true : (stryCov_9fa48("135144"), false),
        decision: stryMutAct_9fa48("135145") ? "" : (stryCov_9fa48("135145"), 'defer'),
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
        reason: firstReason,
        blockingReasons: Object.freeze(reasonCodes.map(stryMutAct_9fa48("135146") ? () => undefined : (stryCov_9fa48("135146"), code => Object.freeze(stryMutAct_9fa48("135147") ? {} : (stryCov_9fa48("135147"), {
          code
        }))))),
        eligibleNodeIds: Object.freeze(stryMutAct_9fa48("135148") ? ["Stryker was here"] : (stryCov_9fa48("135148"), [])),
        ineligibleNodes: Object.freeze(stryMutAct_9fa48("135149") ? [] : (stryCov_9fa48("135149"), [Object.freeze(stryMutAct_9fa48("135150") ? {} : (stryCov_9fa48("135150"), {
          nodeId: stryMutAct_9fa48("135153") ? blocker?.nodeId && this.getNodeId() : stryMutAct_9fa48("135152") ? false : stryMutAct_9fa48("135151") ? true : (stryCov_9fa48("135151", "135152", "135153"), (stryMutAct_9fa48("135154") ? blocker.nodeId : (stryCov_9fa48("135154"), blocker?.nodeId)) || this.getNodeId()),
          failedDimensions: Array.isArray(stryMutAct_9fa48("135155") ? blocker.failedDimensions : (stryCov_9fa48("135155"), blocker?.failedDimensions)) ? stryMutAct_9fa48("135156") ? [] : (stryCov_9fa48("135156"), [...blocker.failedDimensions]) : stryMutAct_9fa48("135157") ? ["Stryker was here"] : (stryCov_9fa48("135157"), []),
          reasonCodes: Object.freeze(stryMutAct_9fa48("135158") ? [] : (stryCov_9fa48("135158"), [...reasonCodes])),
          nodeSummary,
          readinessSnapshot: stryMutAct_9fa48("135161") ? blocker?.readinessSnapshot && null : stryMutAct_9fa48("135160") ? false : stryMutAct_9fa48("135159") ? true : (stryCov_9fa48("135159", "135160", "135161"), (stryMutAct_9fa48("135162") ? blocker.readinessSnapshot : (stryCov_9fa48("135162"), blocker?.readinessSnapshot)) || null)
        }))]))
      }));
    }
  }

  /**
   * Defer optional background topology mutation when local control-plane
   * readiness is degraded.
   * @param {Object} move
   * @return {void}
   */
  assertLocalControlPlaneMutationReady(move) {
    if (stryMutAct_9fa48("135163")) {
      {}
    } else {
      stryCov_9fa48("135163");
      if (stryMutAct_9fa48("135166") ? false : stryMutAct_9fa48("135165") ? true : stryMutAct_9fa48("135164") ? requiresStableLocalControlPlaneMutationReadiness(this.normalizeControlPlaneMutationWorkClass(move)) : (stryCov_9fa48("135164", "135165", "135166"), !requiresStableLocalControlPlaneMutationReadiness(this.normalizeControlPlaneMutationWorkClass(move)))) {
        if (stryMutAct_9fa48("135167")) {
          {}
        } else {
          stryCov_9fa48("135167");
          return;
        }
      }
      const blocker = getLocalControlPlaneMutationReadinessBlocker(stryMutAct_9fa48("135168") ? {} : (stryCov_9fa48("135168"), {
        nodeId: this.getNodeId(),
        controlPlaneReadinessService: this.getControlPlaneReadinessService()
      }));
      if (stryMutAct_9fa48("135171") ? false : stryMutAct_9fa48("135170") ? true : stryMutAct_9fa48("135169") ? blocker : (stryCov_9fa48("135169", "135170", "135171"), !blocker)) {
        if (stryMutAct_9fa48("135172")) {
          {}
        } else {
          stryCov_9fa48("135172");
          return;
        }
      }
      const admissionResult = this.buildLocalControlPlaneMutationAdmissionResult(blocker);
      const error = this.createProvisioningAdmissionError(move, admissionResult);
      error.rebalanceSkipReason = REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY;
      throw error;
    }
  }

  /**
   * Probe provisioning admission without persisting replica_operations rows.
   * @param {Object} move
   * @return {Promise<Object>}
   */
  async checkProvisioningAdmission(move) {
    if (stryMutAct_9fa48("135173")) {
      {}
    } else {
      stryCov_9fa48("135173");
      const moveType = this.normalizeMoveType(stryMutAct_9fa48("135174") ? move.type : (stryCov_9fa48("135174"), move?.type));
      if (stryMutAct_9fa48("135177") ? moveType !== OperationType.ADD || moveType !== OperationType.REPLACE : stryMutAct_9fa48("135176") ? false : stryMutAct_9fa48("135175") ? true : (stryCov_9fa48("135175", "135176", "135177"), (stryMutAct_9fa48("135179") ? moveType === OperationType.ADD : stryMutAct_9fa48("135178") ? true : (stryCov_9fa48("135178", "135179"), moveType !== OperationType.ADD)) && (stryMutAct_9fa48("135181") ? moveType === OperationType.REPLACE : stryMutAct_9fa48("135180") ? true : (stryCov_9fa48("135180", "135181"), moveType !== OperationType.REPLACE)))) {
        if (stryMutAct_9fa48("135182")) {
          {}
        } else {
          stryCov_9fa48("135182");
          return stryMutAct_9fa48("135183") ? {} : (stryCov_9fa48("135183"), {
            allowed: stryMutAct_9fa48("135184") ? false : (stryCov_9fa48("135184"), true),
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
            admissionResult: stryMutAct_9fa48("135185") ? {} : (stryCov_9fa48("135185"), {
              allowed: stryMutAct_9fa48("135186") ? false : (stryCov_9fa48("135186"), true),
              decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED
            })
          });
        }
      }
      const entityType = stryMutAct_9fa48("135189") ? move.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("135188") ? false : stryMutAct_9fa48("135187") ? true : (stryCov_9fa48("135187", "135188", "135189"), move.entityType || SERVICE_TYPE.PARTITION);
      const entityId = stryMutAct_9fa48("135192") ? move.entityId && move.partitionId : stryMutAct_9fa48("135191") ? false : stryMutAct_9fa48("135190") ? true : (stryCov_9fa48("135190", "135191", "135192"), move.entityId || move.partitionId);
      const partitionId = stryMutAct_9fa48("135195") ? move.partitionId && entityId : stryMutAct_9fa48("135194") ? false : stryMutAct_9fa48("135193") ? true : (stryCov_9fa48("135193", "135194", "135195"), move.partitionId || entityId);
      const normalizedMove = stryMutAct_9fa48("135196") ? {} : (stryCov_9fa48("135196"), {
        ...move,
        type: moveType
      });
      const sourceNodeId = (stryMutAct_9fa48("135199") ? moveType !== OperationType.REPLACE : stryMutAct_9fa48("135198") ? false : stryMutAct_9fa48("135197") ? true : (stryCov_9fa48("135197", "135198", "135199"), moveType === OperationType.REPLACE)) ? stryMutAct_9fa48("135202") ? move.sourceNodeId && this.getNodeId() : stryMutAct_9fa48("135201") ? false : stryMutAct_9fa48("135200") ? true : (stryCov_9fa48("135200", "135201", "135202"), move.sourceNodeId || this.getNodeId()) : this.getNodeId();
      try {
        if (stryMutAct_9fa48("135203")) {
          {}
        } else {
          stryCov_9fa48("135203");
          await this.ensureProvisioningAdmissionAllowed(stryMutAct_9fa48("135204") ? {} : (stryCov_9fa48("135204"), {
            move: normalizedMove,
            entityType,
            entityId,
            partitionId,
            sourceNodeId
          }));
          return stryMutAct_9fa48("135205") ? {} : (stryCov_9fa48("135205"), {
            allowed: stryMutAct_9fa48("135206") ? false : (stryCov_9fa48("135206"), true),
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
            admissionResult: stryMutAct_9fa48("135207") ? {} : (stryCov_9fa48("135207"), {
              allowed: stryMutAct_9fa48("135208") ? false : (stryCov_9fa48("135208"), true),
              decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED
            })
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("135209")) {
          {}
        } else {
          stryCov_9fa48("135209");
          if (stryMutAct_9fa48("135212") ? false : stryMutAct_9fa48("135211") ? true : stryMutAct_9fa48("135210") ? error?.admissionResult : (stryCov_9fa48("135210", "135211", "135212"), !(stryMutAct_9fa48("135213") ? error.admissionResult : (stryCov_9fa48("135213"), error?.admissionResult)))) {
            if (stryMutAct_9fa48("135214")) {
              {}
            } else {
              stryCov_9fa48("135214");
              throw error;
            }
          }
          return stryMutAct_9fa48("135215") ? {} : (stryCov_9fa48("135215"), {
            allowed: stryMutAct_9fa48("135216") ? true : (stryCov_9fa48("135216"), false),
            decisionType: stryMutAct_9fa48("135219") ? error.admissionResult?.decisionType && STORAGE_ADMISSION_DECISION_TYPE.DEFERRED : stryMutAct_9fa48("135218") ? false : stryMutAct_9fa48("135217") ? true : (stryCov_9fa48("135217", "135218", "135219"), (stryMutAct_9fa48("135220") ? error.admissionResult.decisionType : (stryCov_9fa48("135220"), error.admissionResult?.decisionType)) || STORAGE_ADMISSION_DECISION_TYPE.DEFERRED),
            admissionResult: error.admissionResult,
            error
          });
        }
      }
    }
  }

  /**
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   */
  async ensureProvisioningAdmissionAllowed(context) {
    if (stryMutAct_9fa48("135221")) {
      {}
    } else {
      stryCov_9fa48("135221");
      const {
        moveType,
        admissionResult,
        estimatedBytes
      } = await this.evaluateProvisioningAdmission(context);
      if (stryMutAct_9fa48("135224") ? false : stryMutAct_9fa48("135223") ? true : stryMutAct_9fa48("135222") ? admissionResult : (stryCov_9fa48("135222", "135223", "135224"), !admissionResult)) {
        if (stryMutAct_9fa48("135225")) {
          {}
        } else {
          stryCov_9fa48("135225");
          return;
        }
      }
      if (stryMutAct_9fa48("135228") ? admissionResult.allowed === true && admissionResult.decisionType === STORAGE_ADMISSION_DECISION_TYPE.ADMITTED : stryMutAct_9fa48("135227") ? false : stryMutAct_9fa48("135226") ? true : (stryCov_9fa48("135226", "135227", "135228"), (stryMutAct_9fa48("135230") ? admissionResult.allowed !== true : stryMutAct_9fa48("135229") ? false : (stryCov_9fa48("135229", "135230"), admissionResult.allowed === (stryMutAct_9fa48("135231") ? false : (stryCov_9fa48("135231"), true)))) || (stryMutAct_9fa48("135233") ? admissionResult.decisionType !== STORAGE_ADMISSION_DECISION_TYPE.ADMITTED : stryMutAct_9fa48("135232") ? false : (stryCov_9fa48("135232", "135233"), admissionResult.decisionType === STORAGE_ADMISSION_DECISION_TYPE.ADMITTED)))) {
        if (stryMutAct_9fa48("135234")) {
          {}
        } else {
          stryCov_9fa48("135234");
          return;
        }
      }
      const firstIneligibleNode = (stryMutAct_9fa48("135237") ? Array.isArray(admissionResult.ineligibleNodes) || admissionResult.ineligibleNodes.length > NUM.ZERO : stryMutAct_9fa48("135236") ? false : stryMutAct_9fa48("135235") ? true : (stryCov_9fa48("135235", "135236", "135237"), Array.isArray(admissionResult.ineligibleNodes) && (stryMutAct_9fa48("135240") ? admissionResult.ineligibleNodes.length <= NUM.ZERO : stryMutAct_9fa48("135239") ? admissionResult.ineligibleNodes.length >= NUM.ZERO : stryMutAct_9fa48("135238") ? true : (stryCov_9fa48("135238", "135239", "135240"), admissionResult.ineligibleNodes.length > NUM.ZERO)))) ? admissionResult.ineligibleNodes[NUM.ZERO] : null;
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PROVISIONING_ADMISSION_DENIED, stryMutAct_9fa48("135241") ? {} : (stryCov_9fa48("135241"), {
        moveType,
        targetNodeId: stryMutAct_9fa48("135244") ? context?.move?.nodeId && null : stryMutAct_9fa48("135243") ? false : stryMutAct_9fa48("135242") ? true : (stryCov_9fa48("135242", "135243", "135244"), (stryMutAct_9fa48("135246") ? context.move?.nodeId : stryMutAct_9fa48("135245") ? context?.move.nodeId : (stryCov_9fa48("135245", "135246"), context?.move?.nodeId)) || null),
        sourceNodeId: stryMutAct_9fa48("135249") ? context?.sourceNodeId && null : stryMutAct_9fa48("135248") ? false : stryMutAct_9fa48("135247") ? true : (stryCov_9fa48("135247", "135248", "135249"), (stryMutAct_9fa48("135250") ? context.sourceNodeId : (stryCov_9fa48("135250"), context?.sourceNodeId)) || null),
        estimatedBytes,
        decisionType: stryMutAct_9fa48("135253") ? admissionResult?.decisionType && null : stryMutAct_9fa48("135252") ? false : stryMutAct_9fa48("135251") ? true : (stryCov_9fa48("135251", "135252", "135253"), (stryMutAct_9fa48("135254") ? admissionResult.decisionType : (stryCov_9fa48("135254"), admissionResult?.decisionType)) || null),
        blockingReasons: Array.isArray(stryMutAct_9fa48("135255") ? admissionResult.blockingReasons : (stryCov_9fa48("135255"), admissionResult?.blockingReasons)) ? admissionResult.blockingReasons : stryMutAct_9fa48("135256") ? ["Stryker was here"] : (stryCov_9fa48("135256"), []),
        eligibleNodeIds: Array.isArray(stryMutAct_9fa48("135257") ? admissionResult.eligibleNodeIds : (stryCov_9fa48("135257"), admissionResult?.eligibleNodeIds)) ? admissionResult.eligibleNodeIds : stryMutAct_9fa48("135258") ? ["Stryker was here"] : (stryCov_9fa48("135258"), []),
        firstIneligibleNode: firstIneligibleNode ? stryMutAct_9fa48("135259") ? {} : (stryCov_9fa48("135259"), {
          nodeId: stryMutAct_9fa48("135262") ? firstIneligibleNode.nodeId && null : stryMutAct_9fa48("135261") ? false : stryMutAct_9fa48("135260") ? true : (stryCov_9fa48("135260", "135261", "135262"), firstIneligibleNode.nodeId || null),
          failedDimensions: Array.isArray(firstIneligibleNode.failedDimensions) ? firstIneligibleNode.failedDimensions : stryMutAct_9fa48("135263") ? ["Stryker was here"] : (stryCov_9fa48("135263"), []),
          reasonCodes: Array.isArray(firstIneligibleNode.reasonCodes) ? firstIneligibleNode.reasonCodes : stryMutAct_9fa48("135264") ? ["Stryker was here"] : (stryCov_9fa48("135264"), []),
          nodeSummary: (stryMutAct_9fa48("135267") ? firstIneligibleNode.nodeSummary || typeof firstIneligibleNode.nodeSummary === 'object' : stryMutAct_9fa48("135266") ? false : stryMutAct_9fa48("135265") ? true : (stryCov_9fa48("135265", "135266", "135267"), firstIneligibleNode.nodeSummary && (stryMutAct_9fa48("135269") ? typeof firstIneligibleNode.nodeSummary !== 'object' : stryMutAct_9fa48("135268") ? true : (stryCov_9fa48("135268", "135269"), typeof firstIneligibleNode.nodeSummary === (stryMutAct_9fa48("135270") ? "" : (stryCov_9fa48("135270"), 'object')))))) ? stryMutAct_9fa48("135271") ? {} : (stryCov_9fa48("135271"), {
            status: stryMutAct_9fa48("135272") ? firstIneligibleNode.nodeSummary.status && null : (stryCov_9fa48("135272"), firstIneligibleNode.nodeSummary.status ?? null),
            connectionState: stryMutAct_9fa48("135273") ? firstIneligibleNode.nodeSummary.connectionState && null : (stryCov_9fa48("135273"), firstIneligibleNode.nodeSummary.connectionState ?? null),
            lastHeartbeat: stryMutAct_9fa48("135274") ? firstIneligibleNode.nodeSummary.lastHeartbeat && null : (stryCov_9fa48("135274"), firstIneligibleNode.nodeSummary.lastHeartbeat ?? null),
            readyLeaseExpiresAt: stryMutAct_9fa48("135275") ? firstIneligibleNode.nodeSummary.readyLeaseExpiresAt && null : (stryCov_9fa48("135275"), firstIneligibleNode.nodeSummary.readyLeaseExpiresAt ?? null),
            storageBudgetBytes: stryMutAct_9fa48("135276") ? firstIneligibleNode.nodeSummary.storageBudgetBytes && null : (stryCov_9fa48("135276"), firstIneligibleNode.nodeSummary.storageBudgetBytes ?? null)
          }) : null
        }) : null
      }));
      throw this.createProvisioningAdmissionError(context.move, admissionResult);
    }
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async evaluateProvisioningAdmission(context) {
    if (stryMutAct_9fa48("135277")) {
      {}
    } else {
      stryCov_9fa48("135277");
      const evaluation = this.buildProvisioningAdmissionEvaluationSnapshot(context);
      if (stryMutAct_9fa48("135280") ? evaluation.state !== PROVISIONING_ADMISSION_EVALUATION_STATE.NO_ADMISSION_REQUIRED : stryMutAct_9fa48("135279") ? false : stryMutAct_9fa48("135278") ? true : (stryCov_9fa48("135278", "135279", "135280"), evaluation.state === PROVISIONING_ADMISSION_EVALUATION_STATE.NO_ADMISSION_REQUIRED)) {
        if (stryMutAct_9fa48("135281")) {
          {}
        } else {
          stryCov_9fa48("135281");
          return stryMutAct_9fa48("135282") ? {} : (stryCov_9fa48("135282"), {
            moveType: evaluation.moveType,
            state: evaluation.state,
            admissionResult: null,
            estimatedBytes: NUM.ZERO
          });
        }
      }
      this.assertProvisioningAdmissionDependencies(evaluation.moveType);
      const storageAdmissionService = this.getStorageAdmissionService();
      const admissionResult = await this.executeProvisioningAdmissionCheck(evaluation, storageAdmissionService);
      assertCritical(admissionResult, REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_REQUIRED);
      return stryMutAct_9fa48("135283") ? {} : (stryCov_9fa48("135283"), {
        moveType: evaluation.moveType,
        state: evaluation.state,
        admissionResult,
        estimatedBytes: evaluation.estimatedBytes
      });
    }
  }

  /**
   * Normalize one provisioning-admission evaluation into one explicit state
   * snapshot before dispatching to admission owners.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildProvisioningAdmissionEvaluationSnapshot(context) {
    if (stryMutAct_9fa48("135284")) {
      {}
    } else {
      stryCov_9fa48("135284");
      const moveType = this.normalizeMoveType(stryMutAct_9fa48("135286") ? context.move?.type : stryMutAct_9fa48("135285") ? context?.move.type : (stryCov_9fa48("135285", "135286"), context?.move?.type));
      return Object.freeze(stryMutAct_9fa48("135287") ? {} : (stryCov_9fa48("135287"), {
        moveType,
        state: this.resolveProvisioningAdmissionEvaluationState(moveType),
        targetNodeId: stryMutAct_9fa48("135290") ? context?.move?.nodeId && null : stryMutAct_9fa48("135289") ? false : stryMutAct_9fa48("135288") ? true : (stryCov_9fa48("135288", "135289", "135290"), (stryMutAct_9fa48("135292") ? context.move?.nodeId : stryMutAct_9fa48("135291") ? context?.move.nodeId : (stryCov_9fa48("135291", "135292"), context?.move?.nodeId)) || null),
        sourceNodeId: stryMutAct_9fa48("135295") ? context?.sourceNodeId && null : stryMutAct_9fa48("135294") ? false : stryMutAct_9fa48("135293") ? true : (stryCov_9fa48("135293", "135294", "135295"), (stryMutAct_9fa48("135296") ? context.sourceNodeId : (stryCov_9fa48("135296"), context?.sourceNodeId)) || null),
        estimatedBytes: this.estimateProvisioningAdmissionBytes(stryMutAct_9fa48("135297") ? context.entityType : (stryCov_9fa48("135297"), context?.entityType)),
        isCritical: this.resolveAdmissionCriticality(context)
      }));
    }
  }

  /**
   * Resolve one provisioning-admission state from one normalized move type.
   * @param {string|null} moveType
   * @return {string}
   * @private
   */
  resolveProvisioningAdmissionEvaluationState(moveType) {
    if (stryMutAct_9fa48("135298")) {
      {}
    } else {
      stryCov_9fa48("135298");
      if (stryMutAct_9fa48("135301") ? moveType !== OperationType.ADD : stryMutAct_9fa48("135300") ? false : stryMutAct_9fa48("135299") ? true : (stryCov_9fa48("135299", "135300", "135301"), moveType === OperationType.ADD)) {
        if (stryMutAct_9fa48("135302")) {
          {}
        } else {
          stryCov_9fa48("135302");
          return PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_ADD;
        }
      }
      if (stryMutAct_9fa48("135305") ? moveType !== OperationType.REPLACE : stryMutAct_9fa48("135304") ? false : stryMutAct_9fa48("135303") ? true : (stryCov_9fa48("135303", "135304", "135305"), moveType === OperationType.REPLACE)) {
        if (stryMutAct_9fa48("135306")) {
          {}
        } else {
          stryCov_9fa48("135306");
          return PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_REPLACE;
        }
      }
      return PROVISIONING_ADMISSION_EVALUATION_STATE.NO_ADMISSION_REQUIRED;
    }
  }

  /**
   * Execute one admission-owner check from one normalized evaluation snapshot.
   * @param {Object} evaluation
   * @param {Object} storageAdmissionService
   * @return {Promise<Object>}
   * @private
   */
  async executeProvisioningAdmissionCheck(evaluation, storageAdmissionService) {
    if (stryMutAct_9fa48("135307")) {
      {}
    } else {
      stryCov_9fa48("135307");
      if (stryMutAct_9fa48("135310") ? evaluation.state !== PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_ADD : stryMutAct_9fa48("135309") ? false : stryMutAct_9fa48("135308") ? true : (stryCov_9fa48("135308", "135309", "135310"), evaluation.state === PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_ADD)) {
        if (stryMutAct_9fa48("135311")) {
          {}
        } else {
          stryCov_9fa48("135311");
          return storageAdmissionService.checkAdd(stryMutAct_9fa48("135312") ? {} : (stryCov_9fa48("135312"), {
            targetNodeId: evaluation.targetNodeId,
            estimatedBytes: evaluation.estimatedBytes,
            isCritical: evaluation.isCritical
          }));
        }
      }
      return storageAdmissionService.checkReplace(stryMutAct_9fa48("135313") ? {} : (stryCov_9fa48("135313"), {
        sourceNodeId: evaluation.sourceNodeId,
        targetNodeId: evaluation.targetNodeId,
        estimatedBytes: evaluation.estimatedBytes,
        isCritical: evaluation.isCritical
      }));
    }
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   */
  estimateProvisioningAdmissionBytes(entityType) {
    if (stryMutAct_9fa48("135314")) {
      {}
    } else {
      stryCov_9fa48("135314");
      const storageAccountingService = this.getStorageAccountingService();
      return storageAccountingService.estimateReplicaBytes(stryMutAct_9fa48("135315") ? {} : (stryCov_9fa48("135315"), {
        entityType: stryMutAct_9fa48("135318") ? entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("135317") ? false : stryMutAct_9fa48("135316") ? true : (stryCov_9fa48("135316", "135317", "135318"), entityType || SERVICE_TYPE.PARTITION),
        sizeBytes: NUM.ZERO
      }));
    }
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing
   * moves.
   * @param {string} moveType
   * @return {void}
   */
  assertProvisioningAdmissionDependencies(moveType) {
    if (stryMutAct_9fa48("135319")) {
      {}
    } else {
      stryCov_9fa48("135319");
      const storageAdmissionService = this.getStorageAdmissionService();
      const storageAccountingService = this.getStorageAccountingService();
      assertCritical(storageAdmissionService, REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_REQUIRED);
      assertCritical(stryMutAct_9fa48("135322") ? storageAccountingService || typeof storageAccountingService.estimateReplicaBytes === 'function' : stryMutAct_9fa48("135321") ? false : stryMutAct_9fa48("135320") ? true : (stryCov_9fa48("135320", "135321", "135322"), storageAccountingService && (stryMutAct_9fa48("135324") ? typeof storageAccountingService.estimateReplicaBytes !== 'function' : stryMutAct_9fa48("135323") ? true : (stryCov_9fa48("135323", "135324"), typeof storageAccountingService.estimateReplicaBytes === (stryMutAct_9fa48("135325") ? "" : (stryCov_9fa48("135325"), 'function'))))), REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED);
      if (stryMutAct_9fa48("135328") ? moveType !== OperationType.ADD : stryMutAct_9fa48("135327") ? false : stryMutAct_9fa48("135326") ? true : (stryCov_9fa48("135326", "135327", "135328"), moveType === OperationType.ADD)) {
        if (stryMutAct_9fa48("135329")) {
          {}
        } else {
          stryCov_9fa48("135329");
          assertCritical(stryMutAct_9fa48("135332") ? typeof storageAdmissionService.checkAdd !== 'function' : stryMutAct_9fa48("135331") ? false : stryMutAct_9fa48("135330") ? true : (stryCov_9fa48("135330", "135331", "135332"), typeof storageAdmissionService.checkAdd === (stryMutAct_9fa48("135333") ? "" : (stryCov_9fa48("135333"), 'function'))), REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_CHECK_ADD_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("135336") ? moveType !== OperationType.REPLACE : stryMutAct_9fa48("135335") ? false : stryMutAct_9fa48("135334") ? true : (stryCov_9fa48("135334", "135335", "135336"), moveType === OperationType.REPLACE)) {
        if (stryMutAct_9fa48("135337")) {
          {}
        } else {
          stryCov_9fa48("135337");
          assertCritical(stryMutAct_9fa48("135340") ? typeof storageAdmissionService.checkReplace !== 'function' : stryMutAct_9fa48("135339") ? false : stryMutAct_9fa48("135338") ? true : (stryCov_9fa48("135338", "135339", "135340"), typeof storageAdmissionService.checkReplace === (stryMutAct_9fa48("135341") ? "" : (stryCov_9fa48("135341"), 'function'))), REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_CHECK_REPLACE_REQUIRED);
        }
      }
    }
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   */
  createProvisioningAdmissionError(move, admissionResult) {
    if (stryMutAct_9fa48("135342")) {
      {}
    } else {
      stryCov_9fa48("135342");
      const blockingReasons = Array.isArray(stryMutAct_9fa48("135343") ? admissionResult.blockingReasons : (stryCov_9fa48("135343"), admissionResult?.blockingReasons)) ? stryMutAct_9fa48("135344") ? admissionResult.blockingReasons.map(reason => String(reason?.code || reason?.reason || reason || '')) : (stryCov_9fa48("135344"), admissionResult.blockingReasons.map(stryMutAct_9fa48("135345") ? () => undefined : (stryCov_9fa48("135345"), reason => String(stryMutAct_9fa48("135348") ? (reason?.code || reason?.reason || reason) && '' : stryMutAct_9fa48("135347") ? false : stryMutAct_9fa48("135346") ? true : (stryCov_9fa48("135346", "135347", "135348"), (stryMutAct_9fa48("135350") ? (reason?.code || reason?.reason) && reason : stryMutAct_9fa48("135349") ? false : (stryCov_9fa48("135349", "135350"), (stryMutAct_9fa48("135352") ? reason?.code && reason?.reason : stryMutAct_9fa48("135351") ? false : (stryCov_9fa48("135351", "135352"), (stryMutAct_9fa48("135353") ? reason.code : (stryCov_9fa48("135353"), reason?.code)) || (stryMutAct_9fa48("135354") ? reason.reason : (stryCov_9fa48("135354"), reason?.reason)))) || reason)) || (stryMutAct_9fa48("135355") ? "Stryker was here!" : (stryCov_9fa48("135355"), '')))))).filter(stryMutAct_9fa48("135356") ? () => undefined : (stryCov_9fa48("135356"), reason => stryMutAct_9fa48("135360") ? reason.length <= NUM.ZERO : stryMutAct_9fa48("135359") ? reason.length >= NUM.ZERO : stryMutAct_9fa48("135358") ? false : stryMutAct_9fa48("135357") ? true : (stryCov_9fa48("135357", "135358", "135359", "135360"), reason.length > NUM.ZERO)))) : stryMutAct_9fa48("135361") ? ["Stryker was here"] : (stryCov_9fa48("135361"), []);
      const primaryReason = (stryMutAct_9fa48("135365") ? blockingReasons.length <= NUM.ZERO : stryMutAct_9fa48("135364") ? blockingReasons.length >= NUM.ZERO : stryMutAct_9fa48("135363") ? false : stryMutAct_9fa48("135362") ? true : (stryCov_9fa48("135362", "135363", "135364", "135365"), blockingReasons.length > NUM.ZERO)) ? String(stryMutAct_9fa48("135368") ? blockingReasons[NUM.ZERO] && '' : stryMutAct_9fa48("135367") ? false : stryMutAct_9fa48("135366") ? true : (stryCov_9fa48("135366", "135367", "135368"), blockingReasons[NUM.ZERO] || (stryMutAct_9fa48("135369") ? "Stryker was here!" : (stryCov_9fa48("135369"), '')))) : String(stryMutAct_9fa48("135372") ? (admissionResult?.reason || admissionResult?.decisionType) && '' : stryMutAct_9fa48("135371") ? false : stryMutAct_9fa48("135370") ? true : (stryCov_9fa48("135370", "135371", "135372"), (stryMutAct_9fa48("135374") ? admissionResult?.reason && admissionResult?.decisionType : stryMutAct_9fa48("135373") ? false : (stryCov_9fa48("135373", "135374"), (stryMutAct_9fa48("135375") ? admissionResult.reason : (stryCov_9fa48("135375"), admissionResult?.reason)) || (stryMutAct_9fa48("135376") ? admissionResult.decisionType : (stryCov_9fa48("135376"), admissionResult?.decisionType)))) || (stryMutAct_9fa48("135377") ? "Stryker was here!" : (stryCov_9fa48("135377"), ''))));
      const secondaryReasons = stryMutAct_9fa48("135380") ? blockingReasons.filter(reason => reason !== primaryReason).slice(0, 3) : stryMutAct_9fa48("135379") ? blockingReasons.slice(NUM.ONE).slice(0, 3) : stryMutAct_9fa48("135378") ? blockingReasons.slice(NUM.ONE).filter(reason => reason !== primaryReason) : (stryCov_9fa48("135378", "135379", "135380"), blockingReasons.slice(NUM.ONE).filter(stryMutAct_9fa48("135381") ? () => undefined : (stryCov_9fa48("135381"), reason => stryMutAct_9fa48("135384") ? reason === primaryReason : stryMutAct_9fa48("135383") ? false : stryMutAct_9fa48("135382") ? true : (stryCov_9fa48("135382", "135383", "135384"), reason !== primaryReason))).slice(0, 3));
      const firstIneligibleReasonCodes = Array.isArray(stryMutAct_9fa48("135387") ? admissionResult.ineligibleNodes?.[NUM.ZERO]?.reasonCodes : stryMutAct_9fa48("135386") ? admissionResult?.ineligibleNodes[NUM.ZERO]?.reasonCodes : stryMutAct_9fa48("135385") ? admissionResult?.ineligibleNodes?.[NUM.ZERO].reasonCodes : (stryCov_9fa48("135385", "135386", "135387"), admissionResult?.ineligibleNodes?.[NUM.ZERO]?.reasonCodes)) ? stryMutAct_9fa48("135389") ? admissionResult.ineligibleNodes[NUM.ZERO].reasonCodes.map(reason => String(reason || '')).slice(0, 4) : stryMutAct_9fa48("135388") ? admissionResult.ineligibleNodes[NUM.ZERO].reasonCodes.map(reason => String(reason || '')).filter(reason => reason.length > NUM.ZERO) : (stryCov_9fa48("135388", "135389"), admissionResult.ineligibleNodes[NUM.ZERO].reasonCodes.map(stryMutAct_9fa48("135390") ? () => undefined : (stryCov_9fa48("135390"), reason => String(stryMutAct_9fa48("135393") ? reason && '' : stryMutAct_9fa48("135392") ? false : stryMutAct_9fa48("135391") ? true : (stryCov_9fa48("135391", "135392", "135393"), reason || (stryMutAct_9fa48("135394") ? "Stryker was here!" : (stryCov_9fa48("135394"), '')))))).filter(stryMutAct_9fa48("135395") ? () => undefined : (stryCov_9fa48("135395"), reason => stryMutAct_9fa48("135399") ? reason.length <= NUM.ZERO : stryMutAct_9fa48("135398") ? reason.length >= NUM.ZERO : stryMutAct_9fa48("135397") ? false : stryMutAct_9fa48("135396") ? true : (stryCov_9fa48("135396", "135397", "135398", "135399"), reason.length > NUM.ZERO))).slice(0, 4)) : stryMutAct_9fa48("135400") ? ["Stryker was here"] : (stryCov_9fa48("135400"), []);
      const diagnosticsSuffixParts = stryMutAct_9fa48("135401") ? ["Stryker was here"] : (stryCov_9fa48("135401"), []);
      if (stryMutAct_9fa48("135405") ? secondaryReasons.length <= NUM.ZERO : stryMutAct_9fa48("135404") ? secondaryReasons.length >= NUM.ZERO : stryMutAct_9fa48("135403") ? false : stryMutAct_9fa48("135402") ? true : (stryCov_9fa48("135402", "135403", "135404", "135405"), secondaryReasons.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("135406")) {
          {}
        } else {
          stryCov_9fa48("135406");
          diagnosticsSuffixParts.push((stryMutAct_9fa48("135407") ? "" : (stryCov_9fa48("135407"), 'secondary=')) + secondaryReasons.join(stryMutAct_9fa48("135408") ? "" : (stryCov_9fa48("135408"), ',')));
        }
      }
      if (stryMutAct_9fa48("135412") ? firstIneligibleReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("135411") ? firstIneligibleReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("135410") ? false : stryMutAct_9fa48("135409") ? true : (stryCov_9fa48("135409", "135410", "135411", "135412"), firstIneligibleReasonCodes.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("135413")) {
          {}
        } else {
          stryCov_9fa48("135413");
          diagnosticsSuffixParts.push((stryMutAct_9fa48("135414") ? "" : (stryCov_9fa48("135414"), 'node_reason_codes=')) + firstIneligibleReasonCodes.join(stryMutAct_9fa48("135415") ? "" : (stryCov_9fa48("135415"), ',')));
        }
      }
      const diagnosticsSuffix = (stryMutAct_9fa48("135419") ? diagnosticsSuffixParts.length <= NUM.ZERO : stryMutAct_9fa48("135418") ? diagnosticsSuffixParts.length >= NUM.ZERO : stryMutAct_9fa48("135417") ? false : stryMutAct_9fa48("135416") ? true : (stryCov_9fa48("135416", "135417", "135418", "135419"), diagnosticsSuffixParts.length > NUM.ZERO)) ? stryMutAct_9fa48("135420") ? `` : (stryCov_9fa48("135420"), ` (${diagnosticsSuffixParts.join(stryMutAct_9fa48("135421") ? "" : (stryCov_9fa48("135421"), '; '))})`) : stryMutAct_9fa48("135422") ? "Stryker was here!" : (stryCov_9fa48("135422"), '');
      const error = new Error(stryMutAct_9fa48("135423") ? `Provisioning admission ${admissionResult?.decisionType || 'blocked'} ` + `for ${move?.type || 'operation'} on ${move?.nodeId || 'unknown'}` + (primaryReason ? `: ${primaryReason}` : '') - diagnosticsSuffix : (stryCov_9fa48("135423"), (stryMutAct_9fa48("135424") ? `` : (stryCov_9fa48("135424"), `Provisioning admission ${stryMutAct_9fa48("135427") ? admissionResult?.decisionType && 'blocked' : stryMutAct_9fa48("135426") ? false : stryMutAct_9fa48("135425") ? true : (stryCov_9fa48("135425", "135426", "135427"), (stryMutAct_9fa48("135428") ? admissionResult.decisionType : (stryCov_9fa48("135428"), admissionResult?.decisionType)) || (stryMutAct_9fa48("135429") ? "" : (stryCov_9fa48("135429"), 'blocked')))} `)) + (stryMutAct_9fa48("135430") ? `` : (stryCov_9fa48("135430"), `for ${stryMutAct_9fa48("135433") ? move?.type && 'operation' : stryMutAct_9fa48("135432") ? false : stryMutAct_9fa48("135431") ? true : (stryCov_9fa48("135431", "135432", "135433"), (stryMutAct_9fa48("135434") ? move.type : (stryCov_9fa48("135434"), move?.type)) || (stryMutAct_9fa48("135435") ? "" : (stryCov_9fa48("135435"), 'operation')))} on ${stryMutAct_9fa48("135438") ? move?.nodeId && 'unknown' : stryMutAct_9fa48("135437") ? false : stryMutAct_9fa48("135436") ? true : (stryCov_9fa48("135436", "135437", "135438"), (stryMutAct_9fa48("135439") ? move.nodeId : (stryCov_9fa48("135439"), move?.nodeId)) || (stryMutAct_9fa48("135440") ? "" : (stryCov_9fa48("135440"), 'unknown')))}`)) + (primaryReason ? stryMutAct_9fa48("135441") ? `` : (stryCov_9fa48("135441"), `: ${primaryReason}`) : stryMutAct_9fa48("135442") ? "Stryker was here!" : (stryCov_9fa48("135442"), '')) + diagnosticsSuffix));
      error.admissionResult = admissionResult;
      return error;
    }
  }
}
export { ProvisioningAdmissionPolicy };