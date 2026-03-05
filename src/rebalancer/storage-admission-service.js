/**
 * Storage Admission Service - single gate for storage-increasing operations.
 *
 * Every ADD, REPLACE, or SPLIT operation must pass admission before
 * operation creation. No alternate operation path shall bypass this service.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.4, 11.2
 */

import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  ControlPlaneReadinessService,
} from '../control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../control-plane/control-plane-readiness-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  ADMISSION_DECISION,
  ADMISSION_MODE,
  ADMISSION_REASON,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
} from './storage-capacity-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_DEFAULT,
  STORAGE_ADMISSION_OPERATION_TYPE,
  STORAGE_ADMISSION_REASON,
} from './storage-admission-constants.js';

const ADMISSION_ERROR_MSG = Object.freeze({
  ACCOUNTING_SERVICE_REQUIRED:
    'StorageAdmissionService requires accountingService',
  TARGET_NODE_REQUIRED:
    'Admission check requires targetNodeId',
  ESTIMATED_BYTES_REQUIRED:
    'Admission check requires positive estimatedBytes',
  OPERATION_TYPE_REQUIRED:
    'Admission check requires a valid operationType',
});

const PERCENT_DIVISOR = NUM.HUNDRED;
const VALID_OPERATION_TYPES = new Set(
  Object.values(STORAGE_ADMISSION_OPERATION_TYPE),
);

function freezeStrings(values) {
  return Object.freeze(Array.isArray(values) ? [...values] : []);
}

function freezeProjectedUtilizationMap(entries) {
  if (!entries || typeof entries !== TYPEOF.OBJECT) {
    return Object.freeze({});
  }
  return Object.freeze({...entries});
}

function buildResult(options) {
  const allowed = options.allowed === true;
  const decision = allowed ?
    ADMISSION_DECISION.ALLOW :
    ADMISSION_DECISION.DENY;
  const ineligibleNodes = Array.isArray(options.ineligibleNodes) ?
    options.ineligibleNodes.map((entry) => {
      return Object.freeze({
        ...entry,
        failedDimensions: freezeStrings(entry.failedDimensions),
        reasonCodes: freezeStrings(entry.reasonCodes),
      });
    }) :
    [];

  return Object.freeze({
    allowed,
    decisionType: options.decisionType,
    operationType: options.operationType,
    requiredReplicaCount: options.requiredReplicaCount,
    eligibleNodeIds: freezeStrings(options.eligibleNodeIds),
    ineligibleNodes: Object.freeze(ineligibleNodes),
    blockingReasons: freezeStrings(options.blockingReasons),
    decisionTimestamp: options.decisionTimestamp,
    projectedUtilizationByNodeId:
      freezeProjectedUtilizationMap(options.projectedUtilizationByNodeId),
    decision,
    reason: options.reason,
    projectedUtilization: options.projectedUtilization ?
      Object.freeze(options.projectedUtilization) :
      null,
  });
}

class StorageAdmissionService {
  /**
   * @param {Object} options
   * @param {Object} options.accountingService
   */
  constructor(options = {}) {
    assertCritical(
      options.accountingService,
      ADMISSION_ERROR_MSG.ACCOUNTING_SERVICE_REQUIRED,
    );
    this.accountingService = options.accountingService;
    this.nodeId = options.nodeId || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.config = ConfigurationManager.getInstance();
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache:
          options.systemTableCache ||
          this.accountingService.systemTableCache ||
          null,
        nodeLifecycleStateMachine:
          options.nodeLifecycleStateMachine || null,
        storageAccountingService: this.accountingService,
        cdcGroupPropagationService:
          options.cdcGroupPropagationService || null,
        now: this.now,
      });

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) :
      console;

    this.refreshConfig();
  }

  /**
   * Refresh configuration values from ConfigurationManager.
   */
  refreshConfig() {
    this.config = ConfigurationManager.getInstance();
    this.emergencyHeadroomPercent = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.EMERGENCY_HEADROOM_PERCENT,
      STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT,
    );
    this.hardPressurePercent = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.HARD_PRESSURE_PERCENT,
      STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
    );
    this.mode = this.getStringConfig(
      STORAGE_CAPACITY_CONFIG_KEY.ADMISSION_MODE,
      STORAGE_CAPACITY_DEFAULT.ADMISSION_MODE,
    );
  }

  /**
   * Resolve numeric config value with default fallback.
   * @param {string} key
   * @param {number} fallback
   * @return {number}
   * @private
   */
  getNumericConfig(key, fallback) {
    const value = this.config.get(key);
    if (typeof value === TYPEOF.NUMBER && Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }

  /**
   * Resolve string config value with default fallback.
   * @param {string} key
   * @param {string} fallback
   * @return {string}
   * @private
   */
  getStringConfig(key, fallback) {
    const value = this.config.get(key);
    if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
      return value;
    }
    return fallback;
  }

  /**
   * Check admission for an ADD operation.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async checkAdd(options = {}) {
    return this.evaluateProvisioning({
      ...options,
      operationType: STORAGE_ADMISSION_OPERATION_TYPE.REBALANCE_ADD,
      requiredReplicaCount: STORAGE_ADMISSION_DEFAULT.REQUIRED_REPLICA_COUNT,
      isCritical: false,
    });
  }

  /**
   * Check admission for a REPLACE operation.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async checkReplace(options = {}) {
    return this.evaluateProvisioning({
      ...options,
      operationType: STORAGE_ADMISSION_OPERATION_TYPE.REPLACE_REPLICA,
      requiredReplicaCount: STORAGE_ADMISSION_DEFAULT.REQUIRED_REPLICA_COUNT,
      isCritical: !!options.isCritical,
    });
  }

  /**
   * Check admission for a SPLIT operation.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async checkSplit(options = {}) {
    return this.evaluateProvisioning({
      ...options,
      operationType: STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
      requiredReplicaCount: this.normalizeRequiredReplicaCount(
        options.requiredReplicaCount,
      ),
      isCritical: false,
    });
  }

  /**
   * Evaluate provisioning admission through the single owner path.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async evaluateProvisioning(options = {}) {
    const operationType = this.validateOperationType(options.operationType);
    const candidateNodeIds = this.normalizeCandidateNodeIds(options);
    assertCritical(
      candidateNodeIds.length > NUM.ZERO,
      ADMISSION_ERROR_MSG.TARGET_NODE_REQUIRED,
    );

    const estimatedBytes = Number(options?.estimatedBytes);
    assertCritical(
      Number.isFinite(estimatedBytes) && estimatedBytes > NUM.ZERO,
      ADMISSION_ERROR_MSG.ESTIMATED_BYTES_REQUIRED,
    );

    const requiredReplicaCount = this.normalizeRequiredReplicaCount(
      options.requiredReplicaCount,
    );
    const decisionTimestamp = new Date(this.now()).toISOString();
    const minimumRoutableSourceCount =
      this.normalizeSourceQuorumCount(options.minimumRoutableSourceCount);
    const sourceRoutableNodeIds =
      Array.isArray(options.sourceRoutableNodeIds) ?
        options.sourceRoutableNodeIds.filter(Boolean) :
        [];

    if (minimumRoutableSourceCount > NUM.ZERO &&
        sourceRoutableNodeIds.length < minimumRoutableSourceCount) {
      return this.applyModeOverride(
        buildResult({
          allowed: false,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
          operationType,
          requiredReplicaCount,
          eligibleNodeIds: [],
          ineligibleNodes: [],
          blockingReasons: [
            STORAGE_ADMISSION_REASON.SOURCE_QUORUM_NOT_ROUTABLE,
          ],
          decisionTimestamp,
          projectedUtilizationByNodeId: {},
          projectedUtilization: null,
          reason: STORAGE_ADMISSION_REASON.SOURCE_QUORUM_NOT_ROUTABLE,
        }),
        candidateNodeIds,
      );
    }

    const eligibleNodeIds = [];
    const ineligibleNodes = [];
    const blockingReasons = [];
    const projectedUtilizationByNodeId = {};
    let legacyReason = STORAGE_ADMISSION_REASON.CAPACITY_AVAILABLE;
    let legacyProjectedUtilization = null;

    for (const nodeId of candidateNodeIds) {
      const readiness = await this.controlPlaneReadinessService
        .getNodeReadiness(nodeId);
      const capacity = await this.evaluateCapacity({
        targetNodeId: nodeId,
        estimatedBytes,
        isCritical: !!options.isCritical,
      });
      const failedDimensions = this.collectFailedDimensions(readiness);
      const nodeReasonCodes = this.collectNodeReasonCodes(readiness, capacity);

      projectedUtilizationByNodeId[nodeId] = capacity.projectedUtilization;
      if (candidateNodeIds.length === NUM.ONE) {
        legacyProjectedUtilization = capacity.projectedUtilization;
        legacyReason = capacity.reasonCode;
      }

      const eligible =
        failedDimensions.length === NUM.ZERO &&
        capacity.allowed === true;
      if (eligible) {
        eligibleNodeIds.push(nodeId);
        if (candidateNodeIds.length === NUM.ONE) {
          legacyReason = capacity.reasonCode;
        }
        continue;
      }

      if (candidateNodeIds.length === NUM.ONE &&
          nodeReasonCodes.length > NUM.ZERO) {
        legacyReason = capacity.allowed === true ?
          nodeReasonCodes[NUM.ZERO] :
          capacity.reasonCode;
      }

      ineligibleNodes.push({
        nodeId,
        failedDimensions,
        reasonCodes: nodeReasonCodes,
        projectedUtilization: capacity.projectedUtilization,
      });
      this.appendBlockingReasons(blockingReasons, nodeReasonCodes);
    }

    const allowed = eligibleNodeIds.length >= requiredReplicaCount;
    const finalizedBlockingReasons = allowed ?
      [] :
      this.finalizeBlockingReasons(blockingReasons);
    const decisionType = allowed ?
      STORAGE_ADMISSION_DECISION_TYPE.ADMITTED :
      this.resolveDeniedDecisionType(finalizedBlockingReasons);

    return this.applyModeOverride(
      buildResult({
        allowed,
        decisionType,
        operationType,
        requiredReplicaCount,
        eligibleNodeIds,
        ineligibleNodes,
        blockingReasons: finalizedBlockingReasons,
        decisionTimestamp,
        projectedUtilizationByNodeId,
        projectedUtilization: candidateNodeIds.length === NUM.ONE ?
          legacyProjectedUtilization :
          null,
        reason: candidateNodeIds.length === NUM.ONE ?
          legacyReason :
          (allowed ? legacyReason :
            (finalizedBlockingReasons[NUM.ZERO] || legacyReason)),
      }),
      candidateNodeIds,
    );
  }

  /**
   * Evaluate storage capacity for one target node.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async evaluateCapacity(options) {
    const targetNodeId = options.targetNodeId;
    const snapshot = await this.accountingService
      .getCapacitySnapshotForNode(targetNodeId);

    if (!snapshot || snapshot.budgetBytes === null) {
      const projected = this.buildProjectedUtilization(
        null,
        NUM.ZERO,
        NUM.ZERO,
        options.estimatedBytes,
      );
      this.logDenial(
        targetNodeId,
        ADMISSION_REASON.NO_BUDGET_REGISTERED,
        projected,
      );
      return {
        allowed: false,
        reasonCode: ADMISSION_REASON.NO_BUDGET_REGISTERED,
        projectedUtilization: projected,
      };
    }

    const {budgetBytes, usedBytes, reservedBytes} = snapshot;
    const projected = this.buildProjectedUtilization(
      budgetBytes,
      usedBytes,
      reservedBytes,
      options.estimatedBytes,
    );

    if (projected.projectedUtilizationPercent >= PERCENT_DIVISOR &&
        budgetBytes > NUM.ZERO) {
      if (options.isCritical && this.passesEmergencyHeadroom(
        budgetBytes,
        usedBytes,
        reservedBytes,
        options.estimatedBytes,
      )) {
        this.logAllow(
          targetNodeId,
          ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
          projected,
        );
        return {
          allowed: true,
          reasonCode: ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
          projectedUtilization: projected,
        };
      }
      this.logDenial(
        targetNodeId,
        ADMISSION_REASON.BUDGET_EXCEEDED,
        projected,
      );
      return {
        allowed: false,
        reasonCode: ADMISSION_REASON.BUDGET_EXCEEDED,
        projectedUtilization: projected,
      };
    }

    if (projected.projectedUtilizationPercent >= this.hardPressurePercent) {
      if (options.isCritical && this.passesEmergencyHeadroom(
        budgetBytes,
        usedBytes,
        reservedBytes,
        options.estimatedBytes,
      )) {
        this.logAllow(
          targetNodeId,
          ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
          projected,
        );
        return {
          allowed: true,
          reasonCode: ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
          projectedUtilization: projected,
        };
      }
      this.logDenial(
        targetNodeId,
        ADMISSION_REASON.HARD_PRESSURE_EXCEEDED,
        projected,
      );
      return {
        allowed: false,
        reasonCode: ADMISSION_REASON.HARD_PRESSURE_EXCEEDED,
        projectedUtilization: projected,
      };
    }

    this.logAllow(
      targetNodeId,
      ADMISSION_REASON.CAPACITY_AVAILABLE,
      projected,
    );
    return {
      allowed: true,
      reasonCode: ADMISSION_REASON.CAPACITY_AVAILABLE,
      projectedUtilization: projected,
    };
  }

  /**
   * Apply observe-mode override if active.
   * @param {Object} result
   * @param {string[]} candidateNodeIds
   * @return {Object}
   * @private
   */
  applyModeOverride(result, candidateNodeIds) {
    if (this.mode !== ADMISSION_MODE.OBSERVE || result.allowed !== false) {
      return result;
    }

    this.logger.warn(STORAGE_CAPACITY_LOG_MSG.OBSERVE_MODE_OVERRIDE, {
      candidateNodeIds,
      originalDecision: result.decision,
      originalDecisionType: result.decisionType,
      originalReason: result.reason,
      blockingReasons: result.blockingReasons,
    });

    return buildResult({
      allowed: true,
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
    });
  }

  /**
   * Validate operation type.
   * @param {string} operationType
   * @return {string}
   * @private
   */
  validateOperationType(operationType) {
    assertCritical(
      VALID_OPERATION_TYPES.has(operationType),
      ADMISSION_ERROR_MSG.OPERATION_TYPE_REQUIRED,
    );
    return operationType;
  }

  /**
   * Normalize candidate node IDs.
   * @param {Object} options
   * @return {string[]}
   * @private
   */
  normalizeCandidateNodeIds(options) {
    const rawNodeIds = Array.isArray(options?.targetNodeIds) &&
      options.targetNodeIds.length > NUM.ZERO ?
      options.targetNodeIds :
      [options?.targetNodeId];
    const candidateNodeIds = [];
    const seen = new Set();

    for (const nodeId of rawNodeIds) {
      const normalizedNodeId = String(nodeId || '');
      if (normalizedNodeId.length === NUM.ZERO || seen.has(normalizedNodeId)) {
        continue;
      }
      seen.add(normalizedNodeId);
      candidateNodeIds.push(normalizedNodeId);
    }

    return candidateNodeIds;
  }

  /**
   * Normalize required replica count.
   * @param {number} requiredReplicaCount
   * @return {number}
   * @private
   */
  normalizeRequiredReplicaCount(requiredReplicaCount) {
    return Number.isInteger(requiredReplicaCount) &&
      requiredReplicaCount > NUM.ZERO ?
      requiredReplicaCount :
      STORAGE_ADMISSION_DEFAULT.REQUIRED_REPLICA_COUNT;
  }

  /**
   * Normalize the source quorum count.
   * @param {number} sourceQuorumCount
   * @return {number}
   * @private
   */
  normalizeSourceQuorumCount(sourceQuorumCount) {
    return Number.isInteger(sourceQuorumCount) &&
      sourceQuorumCount > NUM.ZERO ?
      sourceQuorumCount :
      STORAGE_ADMISSION_DEFAULT.SOURCE_QUORUM_COUNT;
  }

  /**
   * Collect failed readiness dimensions.
   * @param {Object} readiness
   * @return {string[]}
   * @private
   */
  collectFailedDimensions(readiness) {
    const dimensions = readiness?.dimensions &&
      typeof readiness.dimensions === TYPEOF.OBJECT ?
      readiness.dimensions :
      {};
    return Object.keys(dimensions).filter((dimension) => {
      return dimensions[dimension] !== true;
    });
  }

  /**
   * Collect raw reason codes for one node.
   * @param {Object} readiness
   * @param {Object} capacity
   * @return {string[]}
   * @private
   */
  collectNodeReasonCodes(readiness, capacity) {
    const reasonCodes = [];
    const seen = new Set();
    const reasons = Array.isArray(readiness?.reasons) ?
      readiness.reasons :
      [];

    for (const reason of reasons) {
      const code = String(reason?.code || '');
      if (code.length === NUM.ZERO || seen.has(code)) {
        continue;
      }
      seen.add(code);
      reasonCodes.push(code);
    }

    if (capacity.allowed !== true && !seen.has(capacity.reasonCode)) {
      reasonCodes.push(capacity.reasonCode);
    }

    return reasonCodes;
  }

  /**
   * Append aggregated blocking reasons in stable order.
   * @param {string[]} blockingReasons
   * @param {string[]} nodeReasonCodes
   * @private
   */
  appendBlockingReasons(blockingReasons, nodeReasonCodes) {
    for (const reasonCode of nodeReasonCodes) {
      const normalized = this.normalizeBlockingReason(reasonCode);
      if (!normalized || blockingReasons.includes(normalized)) {
        continue;
      }
      blockingReasons.push(normalized);
    }
  }

  /**
   * Finalize blocking reasons for a denied decision.
   * @param {string[]} blockingReasons
   * @return {string[]}
   * @private
   */
  finalizeBlockingReasons(blockingReasons) {
    const finalized = [
      STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
    ];

    for (const reasonCode of blockingReasons) {
      if (!finalized.includes(reasonCode)) {
        finalized.push(reasonCode);
      }
    }

    return finalized;
  }

  /**
   * Normalize raw node reasons into aggregated blocking reasons.
   * @param {string} reasonCode
   * @return {string|null}
   * @private
   */
  normalizeBlockingReason(reasonCode) {
    if (reasonCode ===
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED ||
        reasonCode ===
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY) {
      return STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED;
    }
    if (reasonCode ===
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) {
      return STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY;
    }
    if (reasonCode ===
        CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY) {
      return STORAGE_ADMISSION_REASON.ROUTING_NOT_READY;
    }
    if (reasonCode === ADMISSION_REASON.NO_BUDGET_REGISTERED ||
        reasonCode === ADMISSION_REASON.BUDGET_EXCEEDED ||
        reasonCode === ADMISSION_REASON.EXHAUSTED ||
        reasonCode === ADMISSION_REASON.HARD_PRESSURE_EXCEEDED ||
        reasonCode ===
          CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE ||
        reasonCode ===
          CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD ||
        reasonCode ===
          CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED) {
      return STORAGE_ADMISSION_REASON.STORAGE_BUDGET_EXHAUSTED;
    }
    return null;
  }

  /**
   * Resolve denied decision type.
   * @param {string[]} blockingReasons
   * @return {string}
   * @private
   */
  resolveDeniedDecisionType(blockingReasons) {
    if (blockingReasons.includes(
      STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
    )) {
      return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
    }
    return STORAGE_ADMISSION_DECISION_TYPE.BLOCKED;
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
  passesEmergencyHeadroom(
    budgetBytes, usedBytes, reservedBytes, estimatedBytes,
  ) {
    if (!Number.isFinite(budgetBytes) || budgetBytes <= NUM.ZERO) {
      return false;
    }
    const maxAllowedPercent = PERCENT_DIVISOR - this.emergencyHeadroomPercent;
    const projectedAllocated = usedBytes + reservedBytes + estimatedBytes;
    const projectedPercent =
      (projectedAllocated / budgetBytes) * PERCENT_DIVISOR;
    return projectedPercent <= maxAllowedPercent;
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
  buildProjectedUtilization(
    budgetBytes, usedBytes, reservedBytes, estimatedBytes,
  ) {
    const hasBudget = Number.isFinite(budgetBytes) && budgetBytes > NUM.ZERO;
    const projectedAllocated = usedBytes + reservedBytes + estimatedBytes;
    const projectedAvailableBytes = hasBudget ?
      Math.max(NUM.ZERO, budgetBytes - projectedAllocated) :
      NUM.ZERO;
    const projectedUtilizationPercent = hasBudget ?
      (projectedAllocated / budgetBytes) * PERCENT_DIVISOR :
      PERCENT_DIVISOR;

    return {
      budgetBytes: hasBudget ? budgetBytes : null,
      currentUsedBytes: usedBytes,
      currentReservedBytes: reservedBytes,
      estimatedBytes,
      projectedAllocatedBytes: projectedAllocated,
      projectedAvailableBytes,
      projectedUtilizationPercent,
    };
  }

  /**
   * Log an admission allow decision.
   * @param {string} targetNodeId
   * @param {string} reason
   * @param {Object} projected
   * @private
   */
  logAllow(targetNodeId, reason, projected) {
    this.logger.info(STORAGE_CAPACITY_LOG_MSG.ADMISSION_ALLOWED, {
      targetNodeId,
      decision: ADMISSION_DECISION.ALLOW,
      reason,
      estimatedBytes: projected.estimatedBytes,
      projectedUtilizationPercent: projected.projectedUtilizationPercent,
      projectedAvailableBytes: projected.projectedAvailableBytes,
    });
  }

  /**
   * Log an admission deny decision.
   * @param {string} targetNodeId
   * @param {string} reason
   * @param {Object} projected
   * @private
   */
  logDenial(targetNodeId, reason, projected) {
    this.logger.warn(STORAGE_CAPACITY_LOG_MSG.ADMISSION_DENIED, {
      targetNodeId,
      decision: ADMISSION_DECISION.DENY,
      reason,
      estimatedBytes: projected.estimatedBytes,
      projectedUtilizationPercent: projected.projectedUtilizationPercent,
      projectedAvailableBytes: projected.projectedAvailableBytes,
    });
  }
}

export {StorageAdmissionService, ADMISSION_ERROR_MSG};
