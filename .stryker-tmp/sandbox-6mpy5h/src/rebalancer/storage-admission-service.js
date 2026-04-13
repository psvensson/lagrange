/**
 * Storage Admission Service - single gate for storage-increasing operations.
 *
 * Every ADD, REPLACE, or SPLIT operation must pass admission before
 * operation creation. No alternate operation path shall bypass this service.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.4, 11.2
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { ControlPlaneReadinessService } from '../control-plane/control-plane-readiness-service.js';
import { CONTROL_PLANE_READINESS_DIMENSION, CONTROL_PLANE_READINESS_REASON } from '../control-plane/control-plane-readiness-constants.js';
import { compactEligibilitySnapshot, evaluateEligibilityDecision } from '../control-plane/eligibility-snapshot.js';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { NUM, TYPEOF } from '../constants/index.js';
import { ADMISSION_DECISION, ADMISSION_MODE, ADMISSION_REASON, STORAGE_CAPACITY_CONFIG_KEY, STORAGE_CAPACITY_DEFAULT, STORAGE_CAPACITY_LOG_MSG, STORAGE_CAPACITY_SUBSYSTEM } from './storage-capacity-constants.js';
import { STORAGE_ADMISSION_DECISION_TYPE, STORAGE_ADMISSION_DEFAULT, STORAGE_ADMISSION_OPERATION_TYPE, STORAGE_ADMISSION_REASON } from './storage-admission-constants.js';
const STORAGE_ADMISSION_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("140901") ? {} : (stryCov_9fa48("140901"), {
  VALUE_10000: 10000
}));
const ADMISSION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("140902") ? {} : (stryCov_9fa48("140902"), {
  ACCOUNTING_SERVICE_REQUIRED: stryMutAct_9fa48("140903") ? "" : (stryCov_9fa48("140903"), 'StorageAdmissionService requires accountingService'),
  TARGET_NODE_REQUIRED: stryMutAct_9fa48("140904") ? "" : (stryCov_9fa48("140904"), 'Admission check requires targetNodeId'),
  ESTIMATED_BYTES_REQUIRED: stryMutAct_9fa48("140905") ? "" : (stryCov_9fa48("140905"), 'Admission check requires positive estimatedBytes'),
  OPERATION_TYPE_REQUIRED: stryMutAct_9fa48("140906") ? "" : (stryCov_9fa48("140906"), 'Admission check requires a valid operationType')
}));
const PERCENT_DIVISOR = NUM.HUNDRED;
const VALID_OPERATION_TYPES = new Set(Object.values(STORAGE_ADMISSION_OPERATION_TYPE));
function freezeStrings(values) {
  if (stryMutAct_9fa48("140907")) {
    {}
  } else {
    stryCov_9fa48("140907");
    return Object.freeze(Array.isArray(values) ? stryMutAct_9fa48("140908") ? [] : (stryCov_9fa48("140908"), [...values]) : stryMutAct_9fa48("140909") ? ["Stryker was here"] : (stryCov_9fa48("140909"), []));
  }
}
function freezeProjectedUtilizationMap(entries) {
  if (stryMutAct_9fa48("140910")) {
    {}
  } else {
    stryCov_9fa48("140910");
    if (stryMutAct_9fa48("140913") ? !entries && typeof entries !== TYPEOF.OBJECT : stryMutAct_9fa48("140912") ? false : stryMutAct_9fa48("140911") ? true : (stryCov_9fa48("140911", "140912", "140913"), (stryMutAct_9fa48("140914") ? entries : (stryCov_9fa48("140914"), !entries)) || (stryMutAct_9fa48("140916") ? typeof entries === TYPEOF.OBJECT : stryMutAct_9fa48("140915") ? false : (stryCov_9fa48("140915", "140916"), typeof entries !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("140917")) {
        {}
      } else {
        stryCov_9fa48("140917");
        return Object.freeze({});
      }
    }
    return Object.freeze(stryMutAct_9fa48("140918") ? {} : (stryCov_9fa48("140918"), {
      ...entries
    }));
  }
}
function buildResult(options) {
  if (stryMutAct_9fa48("140919")) {
    {}
  } else {
    stryCov_9fa48("140919");
    const allowed = stryMutAct_9fa48("140922") ? options.allowed !== true : stryMutAct_9fa48("140921") ? false : stryMutAct_9fa48("140920") ? true : (stryCov_9fa48("140920", "140921", "140922"), options.allowed === (stryMutAct_9fa48("140923") ? false : (stryCov_9fa48("140923"), true)));
    const decision = allowed ? ADMISSION_DECISION.ALLOW : ADMISSION_DECISION.DENY;
    const ineligibleNodes = Array.isArray(options.ineligibleNodes) ? options.ineligibleNodes.map(entry => {
      if (stryMutAct_9fa48("140924")) {
        {}
      } else {
        stryCov_9fa48("140924");
        return Object.freeze(stryMutAct_9fa48("140925") ? {} : (stryCov_9fa48("140925"), {
          ...entry,
          failedDimensions: freezeStrings(entry.failedDimensions),
          reasonCodes: freezeStrings(entry.reasonCodes),
          nodeSummary: (stryMutAct_9fa48("140928") ? entry?.nodeSummary || typeof entry.nodeSummary === TYPEOF.OBJECT : stryMutAct_9fa48("140927") ? false : stryMutAct_9fa48("140926") ? true : (stryCov_9fa48("140926", "140927", "140928"), (stryMutAct_9fa48("140929") ? entry.nodeSummary : (stryCov_9fa48("140929"), entry?.nodeSummary)) && (stryMutAct_9fa48("140931") ? typeof entry.nodeSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("140930") ? true : (stryCov_9fa48("140930", "140931"), typeof entry.nodeSummary === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("140932") ? {} : (stryCov_9fa48("140932"), {
            ...entry.nodeSummary
          })) : null
        }));
      }
    }) : stryMutAct_9fa48("140933") ? ["Stryker was here"] : (stryCov_9fa48("140933"), []);
    const readinessSnapshots = options.readinessSnapshots ? Object.freeze(stryMutAct_9fa48("140934") ? {} : (stryCov_9fa48("140934"), {
      ...options.readinessSnapshots
    })) : Object.freeze({});
    return Object.freeze(stryMutAct_9fa48("140935") ? {} : (stryCov_9fa48("140935"), {
      allowed,
      decisionType: options.decisionType,
      operationType: options.operationType,
      requiredReplicaCount: options.requiredReplicaCount,
      eligibleNodeIds: freezeStrings(options.eligibleNodeIds),
      ineligibleNodes: Object.freeze(ineligibleNodes),
      blockingReasons: freezeStrings(options.blockingReasons),
      decisionTimestamp: options.decisionTimestamp,
      projectedUtilizationByNodeId: freezeProjectedUtilizationMap(options.projectedUtilizationByNodeId),
      decision,
      reason: options.reason,
      projectedUtilization: options.projectedUtilization ? Object.freeze(options.projectedUtilization) : null,
      readinessSnapshots
    }));
  }
}
class StorageAdmissionService {
  /**
  * @param {Object} options
  * @param {Object} options.accountingService
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("140936")) {
      {}
    } else {
      stryCov_9fa48("140936");
      assertCritical(options.accountingService, ADMISSION_ERROR_MSG.ACCOUNTING_SERVICE_REQUIRED);
      this.accountingService = options.accountingService;
      this.nodeId = stryMutAct_9fa48("140939") ? options.nodeId && null : stryMutAct_9fa48("140938") ? false : stryMutAct_9fa48("140937") ? true : (stryCov_9fa48("140937", "140938", "140939"), options.nodeId || null);
      this.now = (stryMutAct_9fa48("140942") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("140941") ? false : stryMutAct_9fa48("140940") ? true : (stryCov_9fa48("140940", "140941", "140942"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("140943") ? () => undefined : (stryCov_9fa48("140943"), () => Date.now());
      this.config = ConfigurationManager.getInstance();
      this.controlPlaneReadinessService = stryMutAct_9fa48("140946") ? options.controlPlaneReadinessService && new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: options.systemTableCache || this.accountingService.systemTableCache || null,
        cacheMutationTarget: options.cacheMutationTarget || options.systemTableCache || this.accountingService.systemTableCache || null,
        messageRouter: options.messageRouter || null,
        nodeLifecycleStateMachine: options.nodeLifecycleStateMachine || null,
        storageAccountingService: this.accountingService,
        cdcIntegrationService: options.cdcIntegrationService || null,
        cdcGroupPropagationService: options.cdcGroupPropagationService || null,
        controlPlaneSystemTableGateway: options.controlPlaneSystemTableGateway || null,
        now: this.now
      }) : stryMutAct_9fa48("140945") ? false : stryMutAct_9fa48("140944") ? true : (stryCov_9fa48("140944", "140945", "140946"), options.controlPlaneReadinessService || new ControlPlaneReadinessService(stryMutAct_9fa48("140947") ? {} : (stryCov_9fa48("140947"), {
        nodeId: this.nodeId,
        systemTableCache: stryMutAct_9fa48("140950") ? (options.systemTableCache || this.accountingService.systemTableCache) && null : stryMutAct_9fa48("140949") ? false : stryMutAct_9fa48("140948") ? true : (stryCov_9fa48("140948", "140949", "140950"), (stryMutAct_9fa48("140952") ? options.systemTableCache && this.accountingService.systemTableCache : stryMutAct_9fa48("140951") ? false : (stryCov_9fa48("140951", "140952"), options.systemTableCache || this.accountingService.systemTableCache)) || null),
        cacheMutationTarget: stryMutAct_9fa48("140955") ? (options.cacheMutationTarget || options.systemTableCache || this.accountingService.systemTableCache) && null : stryMutAct_9fa48("140954") ? false : stryMutAct_9fa48("140953") ? true : (stryCov_9fa48("140953", "140954", "140955"), (stryMutAct_9fa48("140957") ? (options.cacheMutationTarget || options.systemTableCache) && this.accountingService.systemTableCache : stryMutAct_9fa48("140956") ? false : (stryCov_9fa48("140956", "140957"), (stryMutAct_9fa48("140959") ? options.cacheMutationTarget && options.systemTableCache : stryMutAct_9fa48("140958") ? false : (stryCov_9fa48("140958", "140959"), options.cacheMutationTarget || options.systemTableCache)) || this.accountingService.systemTableCache)) || null),
        messageRouter: stryMutAct_9fa48("140962") ? options.messageRouter && null : stryMutAct_9fa48("140961") ? false : stryMutAct_9fa48("140960") ? true : (stryCov_9fa48("140960", "140961", "140962"), options.messageRouter || null),
        nodeLifecycleStateMachine: stryMutAct_9fa48("140965") ? options.nodeLifecycleStateMachine && null : stryMutAct_9fa48("140964") ? false : stryMutAct_9fa48("140963") ? true : (stryCov_9fa48("140963", "140964", "140965"), options.nodeLifecycleStateMachine || null),
        storageAccountingService: this.accountingService,
        cdcIntegrationService: stryMutAct_9fa48("140968") ? options.cdcIntegrationService && null : stryMutAct_9fa48("140967") ? false : stryMutAct_9fa48("140966") ? true : (stryCov_9fa48("140966", "140967", "140968"), options.cdcIntegrationService || null),
        cdcGroupPropagationService: stryMutAct_9fa48("140971") ? options.cdcGroupPropagationService && null : stryMutAct_9fa48("140970") ? false : stryMutAct_9fa48("140969") ? true : (stryCov_9fa48("140969", "140970", "140971"), options.cdcGroupPropagationService || null),
        controlPlaneSystemTableGateway: stryMutAct_9fa48("140974") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("140973") ? false : stryMutAct_9fa48("140972") ? true : (stryCov_9fa48("140972", "140973", "140974"), options.controlPlaneSystemTableGateway || null),
        now: this.now
      })));
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
      this.refreshConfig();
    }
  } /**
    * Refresh configuration values from ConfigurationManager.
    */
  refreshConfig() {
    if (stryMutAct_9fa48("140975")) {
      {}
    } else {
      stryCov_9fa48("140975");
      this.config = ConfigurationManager.getInstance();
      this.emergencyHeadroomPercent = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.EMERGENCY_HEADROOM_PERCENT, STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT);
      this.hardPressurePercent = this.getNumericConfig(STORAGE_CAPACITY_CONFIG_KEY.HARD_PRESSURE_PERCENT, STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT);
      this.mode = this.getStringConfig(STORAGE_CAPACITY_CONFIG_KEY.ADMISSION_MODE, STORAGE_CAPACITY_DEFAULT.ADMISSION_MODE);
    }
  } /**
    * Resolve numeric config value with default fallback.
    * @param {string} key
    * @param {number} fallback
    * @return {number}
    * @private
    */
  getNumericConfig(key, fallback) {
    if (stryMutAct_9fa48("140976")) {
      {}
    } else {
      stryCov_9fa48("140976");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("140979") ? typeof value === TYPEOF.NUMBER || Number.isFinite(value) : stryMutAct_9fa48("140978") ? false : stryMutAct_9fa48("140977") ? true : (stryCov_9fa48("140977", "140978", "140979"), (stryMutAct_9fa48("140981") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("140980") ? true : (stryCov_9fa48("140980", "140981"), typeof value === TYPEOF.NUMBER)) && Number.isFinite(value))) {
        if (stryMutAct_9fa48("140982")) {
          {}
        } else {
          stryCov_9fa48("140982");
          return value;
        }
      }
      return fallback;
    }
  } /**
    * Resolve string config value with default fallback.
    * @param {string} key
    * @param {string} fallback
    * @return {string}
    * @private
    */
  getStringConfig(key, fallback) {
    if (stryMutAct_9fa48("140983")) {
      {}
    } else {
      stryCov_9fa48("140983");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("140986") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("140985") ? false : stryMutAct_9fa48("140984") ? true : (stryCov_9fa48("140984", "140985", "140986"), (stryMutAct_9fa48("140988") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("140987") ? true : (stryCov_9fa48("140987", "140988"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("140991") ? value.length <= NUM.ZERO : stryMutAct_9fa48("140990") ? value.length >= NUM.ZERO : stryMutAct_9fa48("140989") ? true : (stryCov_9fa48("140989", "140990", "140991"), value.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140992")) {
          {}
        } else {
          stryCov_9fa48("140992");
          return value;
        }
      }
      return fallback;
    }
  } /**
    * Reuse the canonical readiness snapshot window for background admission.
    * Background planning should not force synchronous authoritative repair when
    * a recent ineligible snapshot can be reused and refreshed in the background.
    * @return {number}
    * @private
    */
  resolveReadinessSnapshotCacheMaxAgeMs() {
    if (stryMutAct_9fa48("140993")) {
      {}
    } else {
      stryCov_9fa48("140993");
      const configured = Number(stryMutAct_9fa48("140994") ? this.controlPlaneReadinessService.clusterMemberStaleHeartbeatMaxAgeMs : (stryCov_9fa48("140994"), this.controlPlaneReadinessService?.clusterMemberStaleHeartbeatMaxAgeMs));
      return (stryMutAct_9fa48("140997") ? Number.isFinite(configured) || configured > NUM.ZERO : stryMutAct_9fa48("140996") ? false : stryMutAct_9fa48("140995") ? true : (stryCov_9fa48("140995", "140996", "140997"), Number.isFinite(configured) && (stryMutAct_9fa48("141000") ? configured <= NUM.ZERO : stryMutAct_9fa48("140999") ? configured >= NUM.ZERO : stryMutAct_9fa48("140998") ? true : (stryCov_9fa48("140998", "140999", "141000"), configured > NUM.ZERO)))) ? Math.floor(configured) : STORAGE_ADMISSION_SERVICE_LITERAL.VALUE_10000;
    }
  } /**
    * Resolve readiness decision dimension for admission.
    * Critical system partition operations use recovery eligibility so
    * placement can converge during publication ACK_PENDING epochs.
    *
    * @param {Object} [options]
    * @return {string}
    * @private
    */
  resolveProvisioningReadinessDecisionDimension(options = {}) {
    if (stryMutAct_9fa48("141001")) {
      {}
    } else {
      stryCov_9fa48("141001");
      if (stryMutAct_9fa48("141004") ? options?.isCritical !== true : stryMutAct_9fa48("141003") ? false : stryMutAct_9fa48("141002") ? true : (stryCov_9fa48("141002", "141003", "141004"), (stryMutAct_9fa48("141005") ? options.isCritical : (stryCov_9fa48("141005"), options?.isCritical)) === (stryMutAct_9fa48("141006") ? false : (stryCov_9fa48("141006"), true)))) {
        if (stryMutAct_9fa48("141007")) {
          {}
        } else {
          stryCov_9fa48("141007");
          return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
        }
      }
      return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
    }
  } /**
    * Check admission for an ADD operation.
    * @param {Object} options
    * @return {Promise<Object>}
    */
  async checkAdd(options = {}) {
    if (stryMutAct_9fa48("141008")) {
      {}
    } else {
      stryCov_9fa48("141008");
      return this.evaluateProvisioning(stryMutAct_9fa48("141009") ? {} : (stryCov_9fa48("141009"), {
        ...options,
        operationType: STORAGE_ADMISSION_OPERATION_TYPE.REBALANCE_ADD,
        requiredReplicaCount: STORAGE_ADMISSION_DEFAULT.REQUIRED_REPLICA_COUNT,
        isCritical: stryMutAct_9fa48("141012") ? options.isCritical !== true : stryMutAct_9fa48("141011") ? false : stryMutAct_9fa48("141010") ? true : (stryCov_9fa48("141010", "141011", "141012"), options.isCritical === (stryMutAct_9fa48("141013") ? false : (stryCov_9fa48("141013"), true)))
      }));
    }
  } /**
    * Check admission for a REPLACE operation.
    * @param {Object} options
    * @return {Promise<Object>}
    */
  async checkReplace(options = {}) {
    if (stryMutAct_9fa48("141014")) {
      {}
    } else {
      stryCov_9fa48("141014");
      return this.evaluateProvisioning(stryMutAct_9fa48("141015") ? {} : (stryCov_9fa48("141015"), {
        ...options,
        operationType: STORAGE_ADMISSION_OPERATION_TYPE.REPLACE_REPLICA,
        requiredReplicaCount: STORAGE_ADMISSION_DEFAULT.REQUIRED_REPLICA_COUNT,
        isCritical: stryMutAct_9fa48("141016") ? !options.isCritical : (stryCov_9fa48("141016"), !(stryMutAct_9fa48("141017") ? options.isCritical : (stryCov_9fa48("141017"), !options.isCritical)))
      }));
    }
  }

  /**
   * Check admission for a SPLIT operation.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async checkSplit(options = {}) {
    if (stryMutAct_9fa48("141018")) {
      {}
    } else {
      stryCov_9fa48("141018");
      return this.evaluateProvisioning(stryMutAct_9fa48("141019") ? {} : (stryCov_9fa48("141019"), {
        ...options,
        operationType: STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
        requiredReplicaCount: this.normalizeRequiredReplicaCount(options.requiredReplicaCount),
        isCritical: stryMutAct_9fa48("141020") ? true : (stryCov_9fa48("141020"), false)
      }));
    }
  }

  /**
   * Evaluate provisioning admission through the single owner path.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async evaluateProvisioning(options = {}) {
    if (stryMutAct_9fa48("141021")) {
      {}
    } else {
      stryCov_9fa48("141021");
      const operationType = this.validateOperationType(options.operationType);
      const candidateNodeIds = this.normalizeCandidateNodeIds(options);
      assertCritical(stryMutAct_9fa48("141025") ? candidateNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("141024") ? candidateNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("141023") ? false : stryMutAct_9fa48("141022") ? true : (stryCov_9fa48("141022", "141023", "141024", "141025"), candidateNodeIds.length > NUM.ZERO), ADMISSION_ERROR_MSG.TARGET_NODE_REQUIRED);
      const estimatedBytes = Number(stryMutAct_9fa48("141026") ? options.estimatedBytes : (stryCov_9fa48("141026"), options?.estimatedBytes));
      assertCritical(stryMutAct_9fa48("141029") ? Number.isFinite(estimatedBytes) || estimatedBytes > NUM.ZERO : stryMutAct_9fa48("141028") ? false : stryMutAct_9fa48("141027") ? true : (stryCov_9fa48("141027", "141028", "141029"), Number.isFinite(estimatedBytes) && (stryMutAct_9fa48("141032") ? estimatedBytes <= NUM.ZERO : stryMutAct_9fa48("141031") ? estimatedBytes >= NUM.ZERO : stryMutAct_9fa48("141030") ? true : (stryCov_9fa48("141030", "141031", "141032"), estimatedBytes > NUM.ZERO))), ADMISSION_ERROR_MSG.ESTIMATED_BYTES_REQUIRED);
      const requiredReplicaCount = this.normalizeRequiredReplicaCount(options.requiredReplicaCount);
      const decisionTimestamp = new Date(this.now()).toISOString();
      const minimumRoutableSourceCount = this.normalizeSourceQuorumCount(options.minimumRoutableSourceCount);
      const sourceRoutableNodeIds = Array.isArray(options.sourceRoutableNodeIds) ? stryMutAct_9fa48("141033") ? options.sourceRoutableNodeIds : (stryCov_9fa48("141033"), options.sourceRoutableNodeIds.filter(Boolean)) : stryMutAct_9fa48("141034") ? ["Stryker was here"] : (stryCov_9fa48("141034"), []);
      if (stryMutAct_9fa48("141037") ? minimumRoutableSourceCount > NUM.ZERO || sourceRoutableNodeIds.length < minimumRoutableSourceCount : stryMutAct_9fa48("141036") ? false : stryMutAct_9fa48("141035") ? true : (stryCov_9fa48("141035", "141036", "141037"), (stryMutAct_9fa48("141040") ? minimumRoutableSourceCount <= NUM.ZERO : stryMutAct_9fa48("141039") ? minimumRoutableSourceCount >= NUM.ZERO : stryMutAct_9fa48("141038") ? true : (stryCov_9fa48("141038", "141039", "141040"), minimumRoutableSourceCount > NUM.ZERO)) && (stryMutAct_9fa48("141043") ? sourceRoutableNodeIds.length >= minimumRoutableSourceCount : stryMutAct_9fa48("141042") ? sourceRoutableNodeIds.length <= minimumRoutableSourceCount : stryMutAct_9fa48("141041") ? true : (stryCov_9fa48("141041", "141042", "141043"), sourceRoutableNodeIds.length < minimumRoutableSourceCount)))) {
        if (stryMutAct_9fa48("141044")) {
          {}
        } else {
          stryCov_9fa48("141044");
          return this.applyModeOverride(buildResult(stryMutAct_9fa48("141045") ? {} : (stryCov_9fa48("141045"), {
            allowed: stryMutAct_9fa48("141046") ? true : (stryCov_9fa48("141046"), false),
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
            operationType,
            requiredReplicaCount,
            eligibleNodeIds: stryMutAct_9fa48("141047") ? ["Stryker was here"] : (stryCov_9fa48("141047"), []),
            ineligibleNodes: stryMutAct_9fa48("141048") ? ["Stryker was here"] : (stryCov_9fa48("141048"), []),
            blockingReasons: stryMutAct_9fa48("141049") ? [] : (stryCov_9fa48("141049"), [STORAGE_ADMISSION_REASON.SOURCE_QUORUM_NOT_ROUTABLE]),
            decisionTimestamp,
            projectedUtilizationByNodeId: {},
            projectedUtilization: null,
            reason: STORAGE_ADMISSION_REASON.SOURCE_QUORUM_NOT_ROUTABLE
          })), candidateNodeIds);
        }
      }
      const eligibleNodeIds = stryMutAct_9fa48("141050") ? ["Stryker was here"] : (stryCov_9fa48("141050"), []);
      const ineligibleNodes = stryMutAct_9fa48("141051") ? ["Stryker was here"] : (stryCov_9fa48("141051"), []);
      const blockingReasons = stryMutAct_9fa48("141052") ? ["Stryker was here"] : (stryCov_9fa48("141052"), []);
      const projectedUtilizationByNodeId = {};
      const readinessSnapshots = {};
      let legacyReason = STORAGE_ADMISSION_REASON.CAPACITY_AVAILABLE;
      let legacyProjectedUtilization = null;
      const readinessDecisionDimension = this.resolveProvisioningReadinessDecisionDimension(options);
      for (const nodeId of candidateNodeIds) {
        if (stryMutAct_9fa48("141053")) {
          {}
        } else {
          stryCov_9fa48("141053");
          const readiness = await this.controlPlaneReadinessService.getNodeReadiness(nodeId, stryMutAct_9fa48("141054") ? {} : (stryCov_9fa48("141054"), {
            allowAuthoritativeRefresh: stryMutAct_9fa48("141055") ? false : (stryCov_9fa48("141055"), true),
            requireFreshOnIneligible: stryMutAct_9fa48("141056") ? false : (stryCov_9fa48("141056"), true),
            preferBackgroundRefreshOnIneligible: stryMutAct_9fa48("141057") ? false : (stryCov_9fa48("141057"), true),
            allowStaleOnCacheChange: stryMutAct_9fa48("141058") ? false : (stryCov_9fa48("141058"), true),
            maxCachedAgeMs: this.resolveReadinessSnapshotCacheMaxAgeMs(),
            decisionDimension: readinessDecisionDimension
          }));
          const eligibilityDecision = evaluateEligibilityDecision(readiness, readinessDecisionDimension);
          const nodeSummary = this.summarizeNodeReadinessRow(nodeId);
          readinessSnapshots[nodeId] = compactEligibilitySnapshot(readiness, readinessDecisionDimension);
          const capacity = await this.evaluateCapacity(stryMutAct_9fa48("141059") ? {} : (stryCov_9fa48("141059"), {
            targetNodeId: nodeId,
            estimatedBytes,
            isCritical: stryMutAct_9fa48("141060") ? !options.isCritical : (stryCov_9fa48("141060"), !(stryMutAct_9fa48("141061") ? options.isCritical : (stryCov_9fa48("141061"), !options.isCritical)))
          }));
          const failedDimensions = eligibilityDecision.failedDimensions;
          const nodeReasonCodes = this.collectNodeReasonCodes(eligibilityDecision.reasonCodes, capacity);
          const eligible = stryMutAct_9fa48("141064") ? failedDimensions.length === NUM.ZERO || capacity.allowed === true : stryMutAct_9fa48("141063") ? false : stryMutAct_9fa48("141062") ? true : (stryCov_9fa48("141062", "141063", "141064"), (stryMutAct_9fa48("141066") ? failedDimensions.length !== NUM.ZERO : stryMutAct_9fa48("141065") ? true : (stryCov_9fa48("141065", "141066"), failedDimensions.length === NUM.ZERO)) && (stryMutAct_9fa48("141068") ? capacity.allowed !== true : stryMutAct_9fa48("141067") ? true : (stryCov_9fa48("141067", "141068"), capacity.allowed === (stryMutAct_9fa48("141069") ? false : (stryCov_9fa48("141069"), true)))));
          projectedUtilizationByNodeId[nodeId] = capacity.projectedUtilization;
          const legacyProvisioningOutcome = this.resolveLegacyProvisioningOutcome(stryMutAct_9fa48("141070") ? {} : (stryCov_9fa48("141070"), {
            candidateNodeCount: candidateNodeIds.length,
            capacity,
            nodeReasonCodes,
            eligible,
            currentReason: legacyReason,
            currentProjectedUtilization: legacyProjectedUtilization
          }));
          legacyReason = legacyProvisioningOutcome.reason;
          legacyProjectedUtilization = legacyProvisioningOutcome.projectedUtilization;
          if (stryMutAct_9fa48("141072") ? false : stryMutAct_9fa48("141071") ? true : (stryCov_9fa48("141071", "141072"), eligible)) {
            if (stryMutAct_9fa48("141073")) {
              {}
            } else {
              stryCov_9fa48("141073");
              eligibleNodeIds.push(nodeId);
              continue;
            }
          }
          ineligibleNodes.push(stryMutAct_9fa48("141074") ? {} : (stryCov_9fa48("141074"), {
            nodeId,
            failedDimensions,
            reasonCodes: nodeReasonCodes,
            projectedUtilization: capacity.projectedUtilization,
            nodeSummary
          }));
          this.appendBlockingReasons(blockingReasons, nodeReasonCodes);
        }
      }
      const allowed = stryMutAct_9fa48("141078") ? eligibleNodeIds.length < requiredReplicaCount : stryMutAct_9fa48("141077") ? eligibleNodeIds.length > requiredReplicaCount : stryMutAct_9fa48("141076") ? false : stryMutAct_9fa48("141075") ? true : (stryCov_9fa48("141075", "141076", "141077", "141078"), eligibleNodeIds.length >= requiredReplicaCount);
      const finalizedBlockingReasons = allowed ? stryMutAct_9fa48("141079") ? ["Stryker was here"] : (stryCov_9fa48("141079"), []) : this.finalizeBlockingReasons(blockingReasons);
      const decisionType = allowed ? STORAGE_ADMISSION_DECISION_TYPE.ADMITTED : this.resolveDeniedDecisionType(finalizedBlockingReasons);
      return this.applyModeOverride(buildResult(stryMutAct_9fa48("141080") ? {} : (stryCov_9fa48("141080"), {
        allowed,
        decisionType,
        operationType,
        requiredReplicaCount,
        eligibleNodeIds,
        ineligibleNodes,
        blockingReasons: finalizedBlockingReasons,
        decisionTimestamp,
        projectedUtilizationByNodeId,
        projectedUtilization: (stryMutAct_9fa48("141083") ? candidateNodeIds.length !== NUM.ONE : stryMutAct_9fa48("141082") ? false : stryMutAct_9fa48("141081") ? true : (stryCov_9fa48("141081", "141082", "141083"), candidateNodeIds.length === NUM.ONE)) ? legacyProjectedUtilization : null,
        reason: (stryMutAct_9fa48("141086") ? candidateNodeIds.length !== NUM.ONE : stryMutAct_9fa48("141085") ? false : stryMutAct_9fa48("141084") ? true : (stryCov_9fa48("141084", "141085", "141086"), candidateNodeIds.length === NUM.ONE)) ? legacyReason : allowed ? legacyReason : stryMutAct_9fa48("141089") ? finalizedBlockingReasons[NUM.ZERO] && legacyReason : stryMutAct_9fa48("141088") ? false : stryMutAct_9fa48("141087") ? true : (stryCov_9fa48("141087", "141088", "141089"), finalizedBlockingReasons[NUM.ZERO] || legacyReason),
        readinessSnapshots
      })), candidateNodeIds);
    }
  }
  resolveLegacyProvisioningOutcome({
    candidateNodeCount,
    capacity,
    nodeReasonCodes,
    eligible,
    currentReason,
    currentProjectedUtilization
  }) {
    if (stryMutAct_9fa48("141090")) {
      {}
    } else {
      stryCov_9fa48("141090");
      if (stryMutAct_9fa48("141093") ? candidateNodeCount === NUM.ONE : stryMutAct_9fa48("141092") ? false : stryMutAct_9fa48("141091") ? true : (stryCov_9fa48("141091", "141092", "141093"), candidateNodeCount !== NUM.ONE)) {
        if (stryMutAct_9fa48("141094")) {
          {}
        } else {
          stryCov_9fa48("141094");
          return stryMutAct_9fa48("141095") ? {} : (stryCov_9fa48("141095"), {
            reason: currentReason,
            projectedUtilization: currentProjectedUtilization
          });
        }
      }
      const singleNodeReason = (stryMutAct_9fa48("141098") ? !eligible && nodeReasonCodes.length > NUM.ZERO || capacity.allowed === true : stryMutAct_9fa48("141097") ? false : stryMutAct_9fa48("141096") ? true : (stryCov_9fa48("141096", "141097", "141098"), (stryMutAct_9fa48("141100") ? !eligible || nodeReasonCodes.length > NUM.ZERO : stryMutAct_9fa48("141099") ? true : (stryCov_9fa48("141099", "141100"), (stryMutAct_9fa48("141101") ? eligible : (stryCov_9fa48("141101"), !eligible)) && (stryMutAct_9fa48("141104") ? nodeReasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("141103") ? nodeReasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("141102") ? true : (stryCov_9fa48("141102", "141103", "141104"), nodeReasonCodes.length > NUM.ZERO)))) && (stryMutAct_9fa48("141106") ? capacity.allowed !== true : stryMutAct_9fa48("141105") ? true : (stryCov_9fa48("141105", "141106"), capacity.allowed === (stryMutAct_9fa48("141107") ? false : (stryCov_9fa48("141107"), true)))))) ? nodeReasonCodes[NUM.ZERO] : capacity.reasonCode;
      return stryMutAct_9fa48("141108") ? {} : (stryCov_9fa48("141108"), {
        reason: singleNodeReason,
        projectedUtilization: capacity.projectedUtilization
      });
    }
  }
  buildCapacityResult(allowed, reasonCode, projectedUtilization) {
    if (stryMutAct_9fa48("141109")) {
      {}
    } else {
      stryCov_9fa48("141109");
      return stryMutAct_9fa48("141110") ? {} : (stryCov_9fa48("141110"), {
        allowed,
        reasonCode,
        projectedUtilization
      });
    }
  }

  /**
   * Evaluate storage capacity for one target node.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async evaluateCapacity(options) {
    if (stryMutAct_9fa48("141111")) {
      {}
    } else {
      stryCov_9fa48("141111");
      const targetNodeId = options.targetNodeId;
      const snapshot = await this.accountingService.getCapacitySnapshotForNode(targetNodeId);
      if (stryMutAct_9fa48("141114") ? !snapshot && snapshot.budgetBytes === null : stryMutAct_9fa48("141113") ? false : stryMutAct_9fa48("141112") ? true : (stryCov_9fa48("141112", "141113", "141114"), (stryMutAct_9fa48("141115") ? snapshot : (stryCov_9fa48("141115"), !snapshot)) || (stryMutAct_9fa48("141117") ? snapshot.budgetBytes !== null : stryMutAct_9fa48("141116") ? false : (stryCov_9fa48("141116", "141117"), snapshot.budgetBytes === null)))) {
        if (stryMutAct_9fa48("141118")) {
          {}
        } else {
          stryCov_9fa48("141118");
          const projected = this.buildProjectedUtilization(null, NUM.ZERO, NUM.ZERO, options.estimatedBytes);
          this.logDenial(targetNodeId, ADMISSION_REASON.NO_BUDGET_REGISTERED, projected);
          return this.buildCapacityResult(stryMutAct_9fa48("141119") ? true : (stryCov_9fa48("141119"), false), ADMISSION_REASON.NO_BUDGET_REGISTERED, projected);
        }
      }
      const {
        budgetBytes,
        usedBytes,
        reservedBytes
      } = snapshot;
      const projected = this.buildProjectedUtilization(budgetBytes, usedBytes, reservedBytes, options.estimatedBytes);
      if (stryMutAct_9fa48("141122") ? projected.projectedUtilizationPercent >= PERCENT_DIVISOR || budgetBytes > NUM.ZERO : stryMutAct_9fa48("141121") ? false : stryMutAct_9fa48("141120") ? true : (stryCov_9fa48("141120", "141121", "141122"), (stryMutAct_9fa48("141125") ? projected.projectedUtilizationPercent < PERCENT_DIVISOR : stryMutAct_9fa48("141124") ? projected.projectedUtilizationPercent > PERCENT_DIVISOR : stryMutAct_9fa48("141123") ? true : (stryCov_9fa48("141123", "141124", "141125"), projected.projectedUtilizationPercent >= PERCENT_DIVISOR)) && (stryMutAct_9fa48("141128") ? budgetBytes <= NUM.ZERO : stryMutAct_9fa48("141127") ? budgetBytes >= NUM.ZERO : stryMutAct_9fa48("141126") ? true : (stryCov_9fa48("141126", "141127", "141128"), budgetBytes > NUM.ZERO)))) {
        if (stryMutAct_9fa48("141129")) {
          {}
        } else {
          stryCov_9fa48("141129");
          if (stryMutAct_9fa48("141132") ? options.isCritical || this.passesEmergencyHeadroom(budgetBytes, usedBytes, reservedBytes, options.estimatedBytes) : stryMutAct_9fa48("141131") ? false : stryMutAct_9fa48("141130") ? true : (stryCov_9fa48("141130", "141131", "141132"), options.isCritical && this.passesEmergencyHeadroom(budgetBytes, usedBytes, reservedBytes, options.estimatedBytes))) {
            if (stryMutAct_9fa48("141133")) {
              {}
            } else {
              stryCov_9fa48("141133");
              this.logAllow(targetNodeId, ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE, projected);
              return this.buildCapacityResult(stryMutAct_9fa48("141134") ? false : (stryCov_9fa48("141134"), true), ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE, projected);
            }
          }
          this.logDenial(targetNodeId, ADMISSION_REASON.BUDGET_EXCEEDED, projected);
          return this.buildCapacityResult(stryMutAct_9fa48("141135") ? true : (stryCov_9fa48("141135"), false), ADMISSION_REASON.BUDGET_EXCEEDED, projected);
        }
      }
      if (stryMutAct_9fa48("141139") ? projected.projectedUtilizationPercent < this.hardPressurePercent : stryMutAct_9fa48("141138") ? projected.projectedUtilizationPercent > this.hardPressurePercent : stryMutAct_9fa48("141137") ? false : stryMutAct_9fa48("141136") ? true : (stryCov_9fa48("141136", "141137", "141138", "141139"), projected.projectedUtilizationPercent >= this.hardPressurePercent)) {
        if (stryMutAct_9fa48("141140")) {
          {}
        } else {
          stryCov_9fa48("141140");
          if (stryMutAct_9fa48("141143") ? options.isCritical || this.passesEmergencyHeadroom(budgetBytes, usedBytes, reservedBytes, options.estimatedBytes) : stryMutAct_9fa48("141142") ? false : stryMutAct_9fa48("141141") ? true : (stryCov_9fa48("141141", "141142", "141143"), options.isCritical && this.passesEmergencyHeadroom(budgetBytes, usedBytes, reservedBytes, options.estimatedBytes))) {
            if (stryMutAct_9fa48("141144")) {
              {}
            } else {
              stryCov_9fa48("141144");
              this.logAllow(targetNodeId, ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE, projected);
              return this.buildCapacityResult(stryMutAct_9fa48("141145") ? false : (stryCov_9fa48("141145"), true), ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE, projected);
            }
          }
          this.logDenial(targetNodeId, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED, projected);
          return this.buildCapacityResult(stryMutAct_9fa48("141146") ? true : (stryCov_9fa48("141146"), false), ADMISSION_REASON.HARD_PRESSURE_EXCEEDED, projected);
        }
      }
      this.logAllow(targetNodeId, ADMISSION_REASON.CAPACITY_AVAILABLE, projected);
      return this.buildCapacityResult(stryMutAct_9fa48("141147") ? false : (stryCov_9fa48("141147"), true), ADMISSION_REASON.CAPACITY_AVAILABLE, projected);
    }
  }

  /**
   * Apply observe-mode override if active.
   * @param {Object} result
   * @param {string[]} candidateNodeIds
   * @return {Object}
   * @private
   */
  applyModeOverride(result, candidateNodeIds) {
    if (stryMutAct_9fa48("141148")) {
      {}
    } else {
      stryCov_9fa48("141148");
      if (stryMutAct_9fa48("141151") ? this.mode !== ADMISSION_MODE.OBSERVE && result.allowed !== false : stryMutAct_9fa48("141150") ? false : stryMutAct_9fa48("141149") ? true : (stryCov_9fa48("141149", "141150", "141151"), (stryMutAct_9fa48("141153") ? this.mode === ADMISSION_MODE.OBSERVE : stryMutAct_9fa48("141152") ? false : (stryCov_9fa48("141152", "141153"), this.mode !== ADMISSION_MODE.OBSERVE)) || (stryMutAct_9fa48("141155") ? result.allowed === false : stryMutAct_9fa48("141154") ? false : (stryCov_9fa48("141154", "141155"), result.allowed !== (stryMutAct_9fa48("141156") ? true : (stryCov_9fa48("141156"), false)))))) {
        if (stryMutAct_9fa48("141157")) {
          {}
        } else {
          stryCov_9fa48("141157");
          return result;
        }
      }
      this.logger.warn(STORAGE_CAPACITY_LOG_MSG.OBSERVE_MODE_OVERRIDE, stryMutAct_9fa48("141158") ? {} : (stryCov_9fa48("141158"), {
        candidateNodeIds,
        originalDecision: result.decision,
        originalDecisionType: result.decisionType,
        originalReason: result.reason,
        blockingReasons: result.blockingReasons
      }));
      return buildResult(stryMutAct_9fa48("141159") ? {} : (stryCov_9fa48("141159"), {
        allowed: stryMutAct_9fa48("141160") ? false : (stryCov_9fa48("141160"), true),
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        operationType: result.operationType,
        requiredReplicaCount: result.requiredReplicaCount,
        eligibleNodeIds: candidateNodeIds,
        ineligibleNodes: result.ineligibleNodes,
        blockingReasons: result.blockingReasons,
        decisionTimestamp: result.decisionTimestamp,
        projectedUtilizationByNodeId: result.projectedUtilizationByNodeId,
        projectedUtilization: result.projectedUtilization,
        reason: result.reason,
        readinessSnapshots: result.readinessSnapshots
      }));
    }
  }

  /**
   * Validate operation type.
   * @param {string} operationType
   * @return {string}
   * @private
   */
  validateOperationType(operationType) {
    if (stryMutAct_9fa48("141161")) {
      {}
    } else {
      stryCov_9fa48("141161");
      assertCritical(VALID_OPERATION_TYPES.has(operationType), ADMISSION_ERROR_MSG.OPERATION_TYPE_REQUIRED);
      return operationType;
    }
  }

  /**
   * Normalize candidate node IDs.
   * @param {Object} options
   * @return {string[]}
   * @private
   */
  normalizeCandidateNodeIds(options) {
    if (stryMutAct_9fa48("141162")) {
      {}
    } else {
      stryCov_9fa48("141162");
      const rawNodeIds = (stryMutAct_9fa48("141165") ? Array.isArray(options?.targetNodeIds) || options.targetNodeIds.length > NUM.ZERO : stryMutAct_9fa48("141164") ? false : stryMutAct_9fa48("141163") ? true : (stryCov_9fa48("141163", "141164", "141165"), Array.isArray(stryMutAct_9fa48("141166") ? options.targetNodeIds : (stryCov_9fa48("141166"), options?.targetNodeIds)) && (stryMutAct_9fa48("141169") ? options.targetNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("141168") ? options.targetNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("141167") ? true : (stryCov_9fa48("141167", "141168", "141169"), options.targetNodeIds.length > NUM.ZERO)))) ? options.targetNodeIds : stryMutAct_9fa48("141170") ? [] : (stryCov_9fa48("141170"), [stryMutAct_9fa48("141171") ? options.targetNodeId : (stryCov_9fa48("141171"), options?.targetNodeId)]);
      const candidateNodeIds = stryMutAct_9fa48("141172") ? ["Stryker was here"] : (stryCov_9fa48("141172"), []);
      const seen = new Set();
      for (const nodeId of rawNodeIds) {
        if (stryMutAct_9fa48("141173")) {
          {}
        } else {
          stryCov_9fa48("141173");
          const normalizedNodeId = String(stryMutAct_9fa48("141176") ? nodeId && '' : stryMutAct_9fa48("141175") ? false : stryMutAct_9fa48("141174") ? true : (stryCov_9fa48("141174", "141175", "141176"), nodeId || (stryMutAct_9fa48("141177") ? "Stryker was here!" : (stryCov_9fa48("141177"), ''))));
          if (stryMutAct_9fa48("141180") ? normalizedNodeId.length === NUM.ZERO && seen.has(normalizedNodeId) : stryMutAct_9fa48("141179") ? false : stryMutAct_9fa48("141178") ? true : (stryCov_9fa48("141178", "141179", "141180"), (stryMutAct_9fa48("141182") ? normalizedNodeId.length !== NUM.ZERO : stryMutAct_9fa48("141181") ? false : (stryCov_9fa48("141181", "141182"), normalizedNodeId.length === NUM.ZERO)) || seen.has(normalizedNodeId))) {
            if (stryMutAct_9fa48("141183")) {
              {}
            } else {
              stryCov_9fa48("141183");
              continue;
            }
          }
          seen.add(normalizedNodeId);
          candidateNodeIds.push(normalizedNodeId);
        }
      }
      return candidateNodeIds;
    }
  }

  /**
   * Normalize required replica count.
   * @param {number} requiredReplicaCount
   * @return {number}
   * @private
   */
  normalizeRequiredReplicaCount(requiredReplicaCount) {
    if (stryMutAct_9fa48("141184")) {
      {}
    } else {
      stryCov_9fa48("141184");
      return (stryMutAct_9fa48("141187") ? Number.isInteger(requiredReplicaCount) || requiredReplicaCount > NUM.ZERO : stryMutAct_9fa48("141186") ? false : stryMutAct_9fa48("141185") ? true : (stryCov_9fa48("141185", "141186", "141187"), Number.isInteger(requiredReplicaCount) && (stryMutAct_9fa48("141190") ? requiredReplicaCount <= NUM.ZERO : stryMutAct_9fa48("141189") ? requiredReplicaCount >= NUM.ZERO : stryMutAct_9fa48("141188") ? true : (stryCov_9fa48("141188", "141189", "141190"), requiredReplicaCount > NUM.ZERO)))) ? requiredReplicaCount : STORAGE_ADMISSION_DEFAULT.REQUIRED_REPLICA_COUNT;
    }
  }

  /**
   * Normalize the source quorum count.
   * @param {number} sourceQuorumCount
   * @return {number}
   * @private
   */
  normalizeSourceQuorumCount(sourceQuorumCount) {
    if (stryMutAct_9fa48("141191")) {
      {}
    } else {
      stryCov_9fa48("141191");
      return (stryMutAct_9fa48("141194") ? Number.isInteger(sourceQuorumCount) || sourceQuorumCount > NUM.ZERO : stryMutAct_9fa48("141193") ? false : stryMutAct_9fa48("141192") ? true : (stryCov_9fa48("141192", "141193", "141194"), Number.isInteger(sourceQuorumCount) && (stryMutAct_9fa48("141197") ? sourceQuorumCount <= NUM.ZERO : stryMutAct_9fa48("141196") ? sourceQuorumCount >= NUM.ZERO : stryMutAct_9fa48("141195") ? true : (stryCov_9fa48("141195", "141196", "141197"), sourceQuorumCount > NUM.ZERO)))) ? sourceQuorumCount : STORAGE_ADMISSION_DEFAULT.SOURCE_QUORUM_COUNT;
    }
  }

  /**
   * Build a compact node-row summary used by admission diagnostics.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  summarizeNodeReadinessRow(nodeId) {
    if (stryMutAct_9fa48("141198")) {
      {}
    } else {
      stryCov_9fa48("141198");
      if (stryMutAct_9fa48("141201") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getNodeRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("141200") ? false : stryMutAct_9fa48("141199") ? true : (stryCov_9fa48("141199", "141200", "141201"), (stryMutAct_9fa48("141202") ? this.controlPlaneReadinessService : (stryCov_9fa48("141202"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("141204") ? typeof this.controlPlaneReadinessService.getNodeRow === TYPEOF.FUNCTION : stryMutAct_9fa48("141203") ? false : (stryCov_9fa48("141203", "141204"), typeof this.controlPlaneReadinessService.getNodeRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("141205")) {
          {}
        } else {
          stryCov_9fa48("141205");
          return null;
        }
      }
      const nodeRow = this.controlPlaneReadinessService.getNodeRow(nodeId);
      if (stryMutAct_9fa48("141208") ? !nodeRow && typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("141207") ? false : stryMutAct_9fa48("141206") ? true : (stryCov_9fa48("141206", "141207", "141208"), (stryMutAct_9fa48("141209") ? nodeRow : (stryCov_9fa48("141209"), !nodeRow)) || (stryMutAct_9fa48("141211") ? typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("141210") ? false : (stryCov_9fa48("141210", "141211"), typeof nodeRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("141212")) {
          {}
        } else {
          stryCov_9fa48("141212");
          return null;
        }
      }
      return Object.freeze(stryMutAct_9fa48("141213") ? {} : (stryCov_9fa48("141213"), {
        status: stryMutAct_9fa48("141214") ? nodeRow.status && null : (stryCov_9fa48("141214"), nodeRow.status ?? null),
        connectionState: stryMutAct_9fa48("141215") ? (nodeRow.connection_state ?? nodeRow.connectionState) && null : (stryCov_9fa48("141215"), (stryMutAct_9fa48("141216") ? nodeRow.connection_state && nodeRow.connectionState : (stryCov_9fa48("141216"), nodeRow.connection_state ?? nodeRow.connectionState)) ?? null),
        lastHeartbeat: stryMutAct_9fa48("141217") ? (nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat) && null : (stryCov_9fa48("141217"), (stryMutAct_9fa48("141218") ? nodeRow.last_heartbeat && nodeRow.lastHeartbeat : (stryCov_9fa48("141218"), nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat)) ?? null),
        readyLeaseExpiresAt: stryMutAct_9fa48("141219") ? (nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt) && null : (stryCov_9fa48("141219"), (stryMutAct_9fa48("141220") ? nodeRow.ready_lease_expires_at && nodeRow.readyLeaseExpiresAt : (stryCov_9fa48("141220"), nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt)) ?? null),
        storageBudgetBytes: stryMutAct_9fa48("141221") ? (nodeRow.storage_budget_bytes ?? nodeRow.storageBudgetBytes) && null : (stryCov_9fa48("141221"), (stryMutAct_9fa48("141222") ? nodeRow.storage_budget_bytes && nodeRow.storageBudgetBytes : (stryCov_9fa48("141222"), nodeRow.storage_budget_bytes ?? nodeRow.storageBudgetBytes)) ?? null)
      }));
    }
  }

  /**
   * Collect raw reason codes for one node.
   * @param {string[]} readinessReasonCodes
   * @param {Object} capacity
   * @return {string[]}
   * @private
   */
  collectNodeReasonCodes(readinessReasonCodes, capacity) {
    if (stryMutAct_9fa48("141223")) {
      {}
    } else {
      stryCov_9fa48("141223");
      const reasonCodes = stryMutAct_9fa48("141224") ? ["Stryker was here"] : (stryCov_9fa48("141224"), []);
      const seen = new Set();
      const reasons = Array.isArray(readinessReasonCodes) ? readinessReasonCodes : stryMutAct_9fa48("141225") ? ["Stryker was here"] : (stryCov_9fa48("141225"), []);
      for (const reason of reasons) {
        if (stryMutAct_9fa48("141226")) {
          {}
        } else {
          stryCov_9fa48("141226");
          const code = String(stryMutAct_9fa48("141229") ? reason && '' : stryMutAct_9fa48("141228") ? false : stryMutAct_9fa48("141227") ? true : (stryCov_9fa48("141227", "141228", "141229"), reason || (stryMutAct_9fa48("141230") ? "Stryker was here!" : (stryCov_9fa48("141230"), ''))));
          if (stryMutAct_9fa48("141233") ? code.length === NUM.ZERO && seen.has(code) : stryMutAct_9fa48("141232") ? false : stryMutAct_9fa48("141231") ? true : (stryCov_9fa48("141231", "141232", "141233"), (stryMutAct_9fa48("141235") ? code.length !== NUM.ZERO : stryMutAct_9fa48("141234") ? false : (stryCov_9fa48("141234", "141235"), code.length === NUM.ZERO)) || seen.has(code))) {
            if (stryMutAct_9fa48("141236")) {
              {}
            } else {
              stryCov_9fa48("141236");
              continue;
            }
          }
          seen.add(code);
          reasonCodes.push(code);
        }
      }
      if (stryMutAct_9fa48("141239") ? capacity.allowed !== true || !seen.has(capacity.reasonCode) : stryMutAct_9fa48("141238") ? false : stryMutAct_9fa48("141237") ? true : (stryCov_9fa48("141237", "141238", "141239"), (stryMutAct_9fa48("141241") ? capacity.allowed === true : stryMutAct_9fa48("141240") ? true : (stryCov_9fa48("141240", "141241"), capacity.allowed !== (stryMutAct_9fa48("141242") ? false : (stryCov_9fa48("141242"), true)))) && (stryMutAct_9fa48("141243") ? seen.has(capacity.reasonCode) : (stryCov_9fa48("141243"), !seen.has(capacity.reasonCode))))) {
        if (stryMutAct_9fa48("141244")) {
          {}
        } else {
          stryCov_9fa48("141244");
          reasonCodes.push(capacity.reasonCode);
        }
      }
      return reasonCodes;
    }
  }

  /**
   * Append aggregated blocking reasons in stable order.
   * @param {string[]} blockingReasons
   * @param {string[]} nodeReasonCodes
   * @private
   */
  appendBlockingReasons(blockingReasons, nodeReasonCodes) {
    if (stryMutAct_9fa48("141245")) {
      {}
    } else {
      stryCov_9fa48("141245");
      for (const reasonCode of nodeReasonCodes) {
        if (stryMutAct_9fa48("141246")) {
          {}
        } else {
          stryCov_9fa48("141246");
          const normalized = this.normalizeBlockingReason(reasonCode);
          if (stryMutAct_9fa48("141249") ? !normalized && blockingReasons.includes(normalized) : stryMutAct_9fa48("141248") ? false : stryMutAct_9fa48("141247") ? true : (stryCov_9fa48("141247", "141248", "141249"), (stryMutAct_9fa48("141250") ? normalized : (stryCov_9fa48("141250"), !normalized)) || blockingReasons.includes(normalized))) {
            if (stryMutAct_9fa48("141251")) {
              {}
            } else {
              stryCov_9fa48("141251");
              continue;
            }
          }
          blockingReasons.push(normalized);
        }
      }
    }
  }

  /**
   * Finalize blocking reasons for a denied decision.
   * @param {string[]} blockingReasons
   * @return {string[]}
   * @private
   */
  finalizeBlockingReasons(blockingReasons) {
    if (stryMutAct_9fa48("141252")) {
      {}
    } else {
      stryCov_9fa48("141252");
      const finalized = stryMutAct_9fa48("141253") ? [] : (stryCov_9fa48("141253"), [STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES]);
      for (const reasonCode of blockingReasons) {
        if (stryMutAct_9fa48("141254")) {
          {}
        } else {
          stryCov_9fa48("141254");
          if (stryMutAct_9fa48("141257") ? false : stryMutAct_9fa48("141256") ? true : stryMutAct_9fa48("141255") ? finalized.includes(reasonCode) : (stryCov_9fa48("141255", "141256", "141257"), !finalized.includes(reasonCode))) {
            if (stryMutAct_9fa48("141258")) {
              {}
            } else {
              stryCov_9fa48("141258");
              finalized.push(reasonCode);
            }
          }
        }
      }
      return finalized;
    }
  }

  /**
   * Normalize raw node reasons into aggregated blocking reasons.
   * @param {string} reasonCode
   * @return {string|null}
   * @private
   */
  normalizeBlockingReason(reasonCode) {
    if (stryMutAct_9fa48("141259")) {
      {}
    } else {
      stryCov_9fa48("141259");
      if (stryMutAct_9fa48("141262") ? reasonCode === CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED && reasonCode === CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY : stryMutAct_9fa48("141261") ? false : stryMutAct_9fa48("141260") ? true : (stryCov_9fa48("141260", "141261", "141262"), (stryMutAct_9fa48("141264") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED : stryMutAct_9fa48("141263") ? false : (stryCov_9fa48("141263", "141264"), reasonCode === CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED)) || (stryMutAct_9fa48("141266") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY : stryMutAct_9fa48("141265") ? false : (stryCov_9fa48("141265", "141266"), reasonCode === CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY)))) {
        if (stryMutAct_9fa48("141267")) {
          {}
        } else {
          stryCov_9fa48("141267");
          return STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED;
        }
      }
      if (stryMutAct_9fa48("141270") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY : stryMutAct_9fa48("141269") ? false : stryMutAct_9fa48("141268") ? true : (stryCov_9fa48("141268", "141269", "141270"), reasonCode === CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY)) {
        if (stryMutAct_9fa48("141271")) {
          {}
        } else {
          stryCov_9fa48("141271");
          return STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY;
        }
      }
      if (stryMutAct_9fa48("141274") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY : stryMutAct_9fa48("141273") ? false : stryMutAct_9fa48("141272") ? true : (stryCov_9fa48("141272", "141273", "141274"), reasonCode === CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY)) {
        if (stryMutAct_9fa48("141275")) {
          {}
        } else {
          stryCov_9fa48("141275");
          return STORAGE_ADMISSION_REASON.ROUTING_NOT_READY;
        }
      }
      if (stryMutAct_9fa48("141278") ? (reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED || reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED || reasonCode === ADMISSION_REASON.EXHAUSTED || reasonCode === ADMISSION_REASON.HARD_PRESSURE_EXCEEDED || reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE || reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD) && reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED : stryMutAct_9fa48("141277") ? false : stryMutAct_9fa48("141276") ? true : (stryCov_9fa48("141276", "141277", "141278"), (stryMutAct_9fa48("141280") ? (reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED || reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED || reasonCode === ADMISSION_REASON.EXHAUSTED || reasonCode === ADMISSION_REASON.HARD_PRESSURE_EXCEEDED || reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE) && reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD : stryMutAct_9fa48("141279") ? false : (stryCov_9fa48("141279", "141280"), (stryMutAct_9fa48("141282") ? (reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED || reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED || reasonCode === ADMISSION_REASON.EXHAUSTED || reasonCode === ADMISSION_REASON.HARD_PRESSURE_EXCEEDED) && reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE : stryMutAct_9fa48("141281") ? false : (stryCov_9fa48("141281", "141282"), (stryMutAct_9fa48("141284") ? (reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED || reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED || reasonCode === ADMISSION_REASON.EXHAUSTED) && reasonCode === ADMISSION_REASON.HARD_PRESSURE_EXCEEDED : stryMutAct_9fa48("141283") ? false : (stryCov_9fa48("141283", "141284"), (stryMutAct_9fa48("141286") ? (reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED || reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED) && reasonCode === ADMISSION_REASON.EXHAUSTED : stryMutAct_9fa48("141285") ? false : (stryCov_9fa48("141285", "141286"), (stryMutAct_9fa48("141288") ? reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED && reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED : stryMutAct_9fa48("141287") ? false : (stryCov_9fa48("141287", "141288"), (stryMutAct_9fa48("141290") ? reasonCode !== ADMISSION_REASON.NO_BUDGET_REGISTERED : stryMutAct_9fa48("141289") ? false : (stryCov_9fa48("141289", "141290"), reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED)) || (stryMutAct_9fa48("141292") ? reasonCode !== ADMISSION_REASON.BUDGET_EXCEEDED : stryMutAct_9fa48("141291") ? false : (stryCov_9fa48("141291", "141292"), reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED)))) || (stryMutAct_9fa48("141294") ? reasonCode !== ADMISSION_REASON.EXHAUSTED : stryMutAct_9fa48("141293") ? false : (stryCov_9fa48("141293", "141294"), reasonCode === ADMISSION_REASON.EXHAUSTED)))) || (stryMutAct_9fa48("141296") ? reasonCode !== ADMISSION_REASON.HARD_PRESSURE_EXCEEDED : stryMutAct_9fa48("141295") ? false : (stryCov_9fa48("141295", "141296"), reasonCode === ADMISSION_REASON.HARD_PRESSURE_EXCEEDED)))) || (stryMutAct_9fa48("141298") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE : stryMutAct_9fa48("141297") ? false : (stryCov_9fa48("141297", "141298"), reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE)))) || (stryMutAct_9fa48("141300") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD : stryMutAct_9fa48("141299") ? false : (stryCov_9fa48("141299", "141300"), reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD)))) || (stryMutAct_9fa48("141302") ? reasonCode !== CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED : stryMutAct_9fa48("141301") ? false : (stryCov_9fa48("141301", "141302"), reasonCode === CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED)))) {
        if (stryMutAct_9fa48("141303")) {
          {}
        } else {
          stryCov_9fa48("141303");
          return STORAGE_ADMISSION_REASON.STORAGE_BUDGET_EXHAUSTED;
        }
      }
      return null;
    }
  }

  /**
   * Resolve denied decision type.
   * @param {string[]} blockingReasons
   * @return {string}
   * @private
   */
  resolveDeniedDecisionType(blockingReasons) {
    if (stryMutAct_9fa48("141304")) {
      {}
    } else {
      stryCov_9fa48("141304");
      if (stryMutAct_9fa48("141306") ? false : stryMutAct_9fa48("141305") ? true : (stryCov_9fa48("141305", "141306"), blockingReasons.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED))) {
        if (stryMutAct_9fa48("141307")) {
          {}
        } else {
          stryCov_9fa48("141307");
          return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
        }
      }
      return STORAGE_ADMISSION_DECISION_TYPE.BLOCKED;
    }
  }

  /**
   * Check whether the emergency headroom rule allows a critical operation.
   * @param {number} budgetBytes
   * @param {number} usedBytes
   * @param {number} reservedBytes
   * @param {number} estimatedBytes
   * @return {boolean}
   * @private
   */
  passesEmergencyHeadroom(budgetBytes, usedBytes, reservedBytes, estimatedBytes) {
    if (stryMutAct_9fa48("141308")) {
      {}
    } else {
      stryCov_9fa48("141308");
      if (stryMutAct_9fa48("141311") ? !Number.isFinite(budgetBytes) && budgetBytes <= NUM.ZERO : stryMutAct_9fa48("141310") ? false : stryMutAct_9fa48("141309") ? true : (stryCov_9fa48("141309", "141310", "141311"), (stryMutAct_9fa48("141312") ? Number.isFinite(budgetBytes) : (stryCov_9fa48("141312"), !Number.isFinite(budgetBytes))) || (stryMutAct_9fa48("141315") ? budgetBytes > NUM.ZERO : stryMutAct_9fa48("141314") ? budgetBytes < NUM.ZERO : stryMutAct_9fa48("141313") ? false : (stryCov_9fa48("141313", "141314", "141315"), budgetBytes <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("141316")) {
          {}
        } else {
          stryCov_9fa48("141316");
          return stryMutAct_9fa48("141317") ? true : (stryCov_9fa48("141317"), false);
        }
      }
      const maxAllowedPercent = stryMutAct_9fa48("141318") ? PERCENT_DIVISOR + this.emergencyHeadroomPercent : (stryCov_9fa48("141318"), PERCENT_DIVISOR - this.emergencyHeadroomPercent);
      const projectedAllocated = stryMutAct_9fa48("141319") ? usedBytes + reservedBytes - estimatedBytes : (stryCov_9fa48("141319"), (stryMutAct_9fa48("141320") ? usedBytes - reservedBytes : (stryCov_9fa48("141320"), usedBytes + reservedBytes)) + estimatedBytes);
      const projectedPercent = stryMutAct_9fa48("141321") ? projectedAllocated / budgetBytes / PERCENT_DIVISOR : (stryCov_9fa48("141321"), (stryMutAct_9fa48("141322") ? projectedAllocated * budgetBytes : (stryCov_9fa48("141322"), projectedAllocated / budgetBytes)) * PERCENT_DIVISOR);
      return stryMutAct_9fa48("141326") ? projectedPercent > maxAllowedPercent : stryMutAct_9fa48("141325") ? projectedPercent < maxAllowedPercent : stryMutAct_9fa48("141324") ? false : stryMutAct_9fa48("141323") ? true : (stryCov_9fa48("141323", "141324", "141325", "141326"), projectedPercent <= maxAllowedPercent);
    }
  }

  /**
   * Build projected utilization object for the admission result.
   * @param {number|null} budgetBytes
   * @param {number} usedBytes
   * @param {number} reservedBytes
   * @param {number} estimatedBytes
   * @return {Object}
   * @private
   */
  buildProjectedUtilization(budgetBytes, usedBytes, reservedBytes, estimatedBytes) {
    if (stryMutAct_9fa48("141327")) {
      {}
    } else {
      stryCov_9fa48("141327");
      const hasBudget = stryMutAct_9fa48("141330") ? Number.isFinite(budgetBytes) || budgetBytes > NUM.ZERO : stryMutAct_9fa48("141329") ? false : stryMutAct_9fa48("141328") ? true : (stryCov_9fa48("141328", "141329", "141330"), Number.isFinite(budgetBytes) && (stryMutAct_9fa48("141333") ? budgetBytes <= NUM.ZERO : stryMutAct_9fa48("141332") ? budgetBytes >= NUM.ZERO : stryMutAct_9fa48("141331") ? true : (stryCov_9fa48("141331", "141332", "141333"), budgetBytes > NUM.ZERO)));
      const projectedAllocated = stryMutAct_9fa48("141334") ? usedBytes + reservedBytes - estimatedBytes : (stryCov_9fa48("141334"), (stryMutAct_9fa48("141335") ? usedBytes - reservedBytes : (stryCov_9fa48("141335"), usedBytes + reservedBytes)) + estimatedBytes);
      const projectedAvailableBytes = hasBudget ? stryMutAct_9fa48("141336") ? Math.min(NUM.ZERO, budgetBytes - projectedAllocated) : (stryCov_9fa48("141336"), Math.max(NUM.ZERO, stryMutAct_9fa48("141337") ? budgetBytes + projectedAllocated : (stryCov_9fa48("141337"), budgetBytes - projectedAllocated))) : NUM.ZERO;
      const projectedUtilizationPercent = hasBudget ? stryMutAct_9fa48("141338") ? projectedAllocated / budgetBytes / PERCENT_DIVISOR : (stryCov_9fa48("141338"), (stryMutAct_9fa48("141339") ? projectedAllocated * budgetBytes : (stryCov_9fa48("141339"), projectedAllocated / budgetBytes)) * PERCENT_DIVISOR) : PERCENT_DIVISOR;
      return stryMutAct_9fa48("141340") ? {} : (stryCov_9fa48("141340"), {
        budgetBytes: hasBudget ? budgetBytes : null,
        currentUsedBytes: usedBytes,
        currentReservedBytes: reservedBytes,
        estimatedBytes,
        projectedAllocatedBytes: projectedAllocated,
        projectedAvailableBytes,
        projectedUtilizationPercent
      });
    }
  }

  /**
   * Log an admission allow decision.
   * @param {string} targetNodeId
   * @param {string} reason
   * @param {Object} projected
   * @private
   */
  logAllow(targetNodeId, reason, projected) {
    if (stryMutAct_9fa48("141341")) {
      {}
    } else {
      stryCov_9fa48("141341");
      this.logger.info(STORAGE_CAPACITY_LOG_MSG.ADMISSION_ALLOWED, stryMutAct_9fa48("141342") ? {} : (stryCov_9fa48("141342"), {
        targetNodeId,
        decision: ADMISSION_DECISION.ALLOW,
        reason,
        estimatedBytes: projected.estimatedBytes,
        projectedUtilizationPercent: projected.projectedUtilizationPercent,
        projectedAvailableBytes: projected.projectedAvailableBytes
      }));
    }
  }

  /**
   * Log an admission deny decision.
   * @param {string} targetNodeId
   * @param {string} reason
   * @param {Object} projected
   * @private
   */
  logDenial(targetNodeId, reason, projected) {
    if (stryMutAct_9fa48("141343")) {
      {}
    } else {
      stryCov_9fa48("141343");
      this.logger.warn(STORAGE_CAPACITY_LOG_MSG.ADMISSION_DENIED, stryMutAct_9fa48("141344") ? {} : (stryCov_9fa48("141344"), {
        targetNodeId,
        decision: ADMISSION_DECISION.DENY,
        reason,
        estimatedBytes: projected.estimatedBytes,
        projectedUtilizationPercent: projected.projectedUtilizationPercent,
        projectedAvailableBytes: projected.projectedAvailableBytes
      }));
    }
  }
}
export { StorageAdmissionService, ADMISSION_ERROR_MSG };