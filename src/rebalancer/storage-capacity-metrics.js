/**
 * Storage Capacity Metrics - collects per-node capacity metrics and
 * tracks admission decision counters for observability.
 *
 * Requirements: 10.1, 10.2
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM} from '../constants/index.js';
import {
  ADMISSION_DECISION,
  STORAGE_CAPACITY_SUBSYSTEM,
  STORAGE_METRIC,
} from './storage-capacity-constants.js';

class StorageCapacityMetrics {
  /**
   * @param {Object} options
   * @param {Object} options.accountingService -
   *   StorageCapacityAccountingService instance
   */
  constructor(options = {}) {
    this.accountingService = options.accountingService || null;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;

    this.admissionAllowCount = NUM.ZERO;
    this.admissionDenyCount = NUM.ZERO;
  }

  /**
   * Collect capacity metrics for a single node.
   * @param {string} nodeId
   * @return {Promise<Object|null>} metrics snapshot or null
   */
  async collectNodeMetrics(nodeId) {
    if (!this.accountingService || !nodeId) {
      return null;
    }

    const snapshot = await this.accountingService
      .getCapacitySnapshotForNode(nodeId);

    if (!snapshot) {
      return null;
    }

    return this.buildMetrics(snapshot);
  }

  /**
   * Collect capacity metrics for all known nodes.
   * @return {Promise<Object[]>}
   */
  async collectAllNodeMetrics() {
    if (!this.accountingService) {
      return [];
    }

    const snapshots = await this.accountingService
      .getCapacitySnapshots();

    if (!snapshots || !snapshots.length) {
      return [];
    }

    return snapshots.map((snapshot) => this.buildMetrics(snapshot));
  }

  /**
   * Record an admission decision for counter tracking.
   * @param {Object} decision - admission result from StorageAdmissionService
   */
  recordAdmission(decision) {
    if (!decision) {
      return;
    }

    if (decision.decision === ADMISSION_DECISION.ALLOW) {
      this.admissionAllowCount++;
    } else if (decision.decision === ADMISSION_DECISION.DENY) {
      this.admissionDenyCount++;
    }
  }

  /**
   * Return current admission counters.
   * @return {Object}
   */
  getAdmissionMetrics() {
    return Object.freeze({
      [STORAGE_METRIC.ADMISSION_ALLOW_COUNT]: this.admissionAllowCount,
      [STORAGE_METRIC.ADMISSION_DENY_COUNT]: this.admissionDenyCount,
    });
  }

  /**
   * Build a metrics object from a capacity snapshot.
   * @param {Object} snapshot
   * @return {Object}
   * @private
   */
  buildMetrics(snapshot) {
    return Object.freeze({
      nodeId: snapshot.nodeId,
      [STORAGE_METRIC.BUDGET_BYTES]: snapshot.budgetBytes,
      [STORAGE_METRIC.USED_BYTES]: snapshot.usedBytes,
      [STORAGE_METRIC.RESERVED_BYTES]: snapshot.reservedBytes,
      [STORAGE_METRIC.AVAILABLE_BYTES]: snapshot.availableBytes,
      [STORAGE_METRIC.UTILIZATION_PERCENT]: snapshot.utilizationPercent,
      [STORAGE_METRIC.PRESSURE_STATE]: snapshot.pressureState,
    });
  }
}

export {StorageCapacityMetrics};
