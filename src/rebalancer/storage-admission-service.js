/**
 * Storage Admission Service - single gate for storage-increasing operations.
 *
 * Every ADD, REPLACE, or SPLIT operation must pass admission before
 * operation creation. No alternate operation path shall bypass this service.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.4, 11.2
 */

import {ConfigurationManager} from '../config/configuration-manager.js';
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

const ADMISSION_ERROR_MSG = Object.freeze({
  ACCOUNTING_SERVICE_REQUIRED:
    'StorageAdmissionService requires accountingService',
  TARGET_NODE_REQUIRED:
    'Admission check requires targetNodeId',
  ESTIMATED_BYTES_REQUIRED:
    'Admission check requires positive estimatedBytes',
});

const PERCENT_DIVISOR = NUM.HUNDRED;

/**
 * Build an admission result object.
 * @param {string} decision - ADMISSION_DECISION.ALLOW or DENY
 * @param {string} reason - ADMISSION_REASON code
 * @param {Object} projected - projected utilization after operation
 * @return {Object}
 */
function buildResult(decision, reason, projected) {
  return Object.freeze({
    decision,
    reason,
    projectedUtilization: Object.freeze(projected),
  });
}

class StorageAdmissionService {
  /**
   * @param {Object} options
   * @param {Object} options.accountingService -
   *   StorageCapacityAccountingService instance
   */
  constructor(options = {}) {
    assertCritical(
      options.accountingService,
      ADMISSION_ERROR_MSG.ACCOUNTING_SERVICE_REQUIRED,
    );
    this.accountingService = options.accountingService;
    this.config = ConfigurationManager.getInstance();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;

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
   *
   * @param {Object} options
   * @param {string} options.targetNodeId - node receiving the replica
   * @param {number} options.estimatedBytes - estimated bytes for the replica
   * @return {Promise<Object>} admission result
   */
  async checkAdd(options = {}) {
    const result = await this.evaluate(options, false);
    return this.applyModeOverride(result, options?.targetNodeId);
  }

  /**
   * Check admission for a REPLACE operation.
   *
   * @param {Object} options
   * @param {string} options.targetNodeId - node receiving the replacement
   * @param {number} options.estimatedBytes - estimated bytes for the replica
   * @param {boolean} [options.isCritical] - whether this is a critical
   *   correctness-preserving replacement
   * @return {Promise<Object>} admission result
   */
  async checkReplace(options = {}) {
    const result = await this.evaluate(options, !!options.isCritical);
    return this.applyModeOverride(result, options?.targetNodeId);
  }

  /**
   * Check admission for a SPLIT-triggered replica creation.
   *
   * @param {Object} options
   * @param {string} options.targetNodeId - node receiving the split replica
   * @param {number} options.estimatedBytes - estimated bytes including
   *   amplification
   * @return {Promise<Object>} admission result
   */
  async checkSplit(options = {}) {
    const result = await this.evaluate(options, false);
    return this.applyModeOverride(result, options?.targetNodeId);
  }

  /**
   * Core admission evaluation.
   *
   * Algorithm:
   * 1. Build node capacity snapshot
   * 2. Compute projected available bytes after reservation
   * 3. Reject if projected availability violates hard limit or policy
   * 4. For critical operations, allow when emergency-headroom rule passes
   * 5. Emit structured decision
   *
   * @param {Object} options
   * @param {string} options.targetNodeId
   * @param {number} options.estimatedBytes
   * @param {boolean} isCritical - whether emergency headroom applies
   * @return {Promise<Object>} admission result
   * @private
   */
  async evaluate(options, isCritical) {
    const targetNodeId = options?.targetNodeId;
    assertCritical(targetNodeId, ADMISSION_ERROR_MSG.TARGET_NODE_REQUIRED);

    const estimatedBytes = Number(options?.estimatedBytes);
    assertCritical(
      Number.isFinite(estimatedBytes) && estimatedBytes > NUM.ZERO,
      ADMISSION_ERROR_MSG.ESTIMATED_BYTES_REQUIRED,
    );

    const snapshot = await this.accountingService
      .getCapacitySnapshotForNode(targetNodeId);

    if (!snapshot || snapshot.budgetBytes === null) {
      const projected = this.buildProjectedUtilization(
        null, NUM.ZERO, NUM.ZERO, estimatedBytes,
      );
      this.logDenial(targetNodeId, ADMISSION_REASON.NO_BUDGET_REGISTERED,
        projected);
      return buildResult(
        ADMISSION_DECISION.DENY,
        ADMISSION_REASON.NO_BUDGET_REGISTERED,
        projected,
      );
    }

    const {budgetBytes, usedBytes, reservedBytes} = snapshot;
    const projected = this.buildProjectedUtilization(
      budgetBytes, usedBytes, reservedBytes, estimatedBytes,
    );

    // Exhausted: no capacity at all
    if (projected.projectedAvailableBytes < NUM.ZERO ||
        (projected.projectedUtilizationPercent >= PERCENT_DIVISOR &&
         budgetBytes > NUM.ZERO)) {
      if (isCritical && this.passesEmergencyHeadroom(
        budgetBytes, usedBytes, reservedBytes, estimatedBytes)) {
        this.logAllow(targetNodeId,
          ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE, projected);
        return buildResult(
          ADMISSION_DECISION.ALLOW,
          ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
          projected,
        );
      }
      const reason = projected.projectedUtilizationPercent >= PERCENT_DIVISOR ?
        ADMISSION_REASON.BUDGET_EXCEEDED :
        ADMISSION_REASON.EXHAUSTED;
      this.logDenial(targetNodeId, reason, projected);
      return buildResult(ADMISSION_DECISION.DENY, reason, projected);
    }

    // Hard pressure: block non-critical operations
    if (projected.projectedUtilizationPercent >= this.hardPressurePercent) {
      if (isCritical && this.passesEmergencyHeadroom(
        budgetBytes, usedBytes, reservedBytes, estimatedBytes)) {
        this.logAllow(targetNodeId,
          ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE, projected);
        return buildResult(
          ADMISSION_DECISION.ALLOW,
          ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
          projected,
        );
      }
      this.logDenial(targetNodeId,
        ADMISSION_REASON.HARD_PRESSURE_EXCEEDED, projected);
      return buildResult(
        ADMISSION_DECISION.DENY,
        ADMISSION_REASON.HARD_PRESSURE_EXCEEDED,
        projected,
      );
    }

    // Normal / soft: allow
    this.logAllow(targetNodeId,
      ADMISSION_REASON.CAPACITY_AVAILABLE, projected);
    return buildResult(
      ADMISSION_DECISION.ALLOW,
      ADMISSION_REASON.CAPACITY_AVAILABLE,
      projected,
    );
  }

  /**
   * Apply observe-mode override if active.
   * In observe mode, denials are logged but overridden to allow.
   * @param {Object} result - original admission result
   * @param {string} targetNodeId
   * @return {Object}
   * @private
   */
  applyModeOverride(result, targetNodeId) {
    if (this.mode !== ADMISSION_MODE.OBSERVE) {
      return result;
    }
    if (result.decision === ADMISSION_DECISION.DENY) {
      this.logger.warn(STORAGE_CAPACITY_LOG_MSG.OBSERVE_MODE_OVERRIDE, {
        targetNodeId,
        originalDecision: result.decision,
        originalReason: result.reason,
        projectedUtilizationPercent:
          result.projectedUtilization.projectedUtilizationPercent,
      });
      return buildResult(
        ADMISSION_DECISION.ALLOW,
        result.reason,
        result.projectedUtilization,
      );
    }
    return result;
  }

  /**
   * Check whether the emergency headroom rule allows a critical operation.
   *
   * Emergency headroom reserves a fraction of the budget exclusively for
   * critical correctness-preserving operations. The operation is allowed
   * when the projected used+reserved bytes (including this operation) stay
   * within (100% - emergencyHeadroomPercent) of the budget, evaluated
   * against the full budget rather than the normal hard-pressure threshold.
   *
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
      Math.max(NUM.ZERO, budgetBytes - projectedAllocated) : NUM.ZERO;
    const projectedUtilizationPercent = hasBudget ?
      (projectedAllocated / budgetBytes) * PERCENT_DIVISOR : PERCENT_DIVISOR;

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
