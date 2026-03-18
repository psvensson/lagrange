/**
 * Storage Capacity Migration - backfills node storage budgets and
 * manages rollout mode transitions.
 *
 * Requirements: 12.2, 12.4, 12.5
 */

import {LoggingService} from '../logging/logging-service.js';
import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  ControlPlaneSystemTableGateway,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  BACKFILL_DEFAULT_RATIO,
  STORAGE_BUDGET_SOURCE,
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
} from './storage-capacity-constants.js';

const MIGRATION_ERROR_MSG = Object.freeze({
  CDC_REQUIRED:
    'StorageCapacityMigration requires cdcIntegrationService',
  NODE_ROWS_REQUIRED:
    'backfillNodeBudgets requires an array of node rows',
});

class StorageCapacityMigration {
  /**
   * @param {Object} options
   * @param {Object} options.cdcIntegrationService
   */
  constructor(options = {}) {
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
  }

  /**
   * Compute deterministic backfill budget bytes from a node row.
   * Uses BACKFILL_DEFAULT_RATIO of disk_gb converted to bytes.
   *
   * @param {Object} nodeRow
   * @return {number|null} budget bytes or null if disk_gb unavailable
   */
  getBackfillBudget(nodeRow) {
    const diskGb = Number(nodeRow?.[COLUMN.DISK_GB]);
    if (!Number.isFinite(diskGb) || diskGb <= NUM.ZERO) {
      return null;
    }
    return Math.floor(diskGb * NUM.BYTES_PER_GIB * BACKFILL_DEFAULT_RATIO);
  }

  /**
   * Backfill storage budgets for nodes missing them.
   *
   * @param {Array<Object>} nodeRows - array of node row objects
   * @return {Promise<Object>} summary with backfilled and skipped counts
   */
  async backfillNodeBudgets(nodeRows) {
    if (!Array.isArray(nodeRows)) {
      throw new Error(MIGRATION_ERROR_MSG.NODE_ROWS_REQUIRED);
    }
    if (!this.cdcIntegrationService) {
      throw new Error(MIGRATION_ERROR_MSG.CDC_REQUIRED);
    }

    let backfilled = NUM.ZERO;
    let skipped = NUM.ZERO;

    for (const row of nodeRows) {
      const nodeId = row[COLUMN.NODE_ID];
      const existingBudget = row[COLUMN.STORAGE_BUDGET_BYTES];

      if (typeof existingBudget === TYPEOF.NUMBER &&
          Number.isFinite(existingBudget) &&
          existingBudget > NUM.ZERO) {
        this.logger.info(STORAGE_CAPACITY_LOG_MSG.BACKFILL_SKIPPED, {
          nodeId,
          existingBudget,
        });
        skipped++;
        continue;
      }

      const budgetBytes = this.getBackfillBudget(row);
      if (budgetBytes === null) {
        this.logger.warn(STORAGE_CAPACITY_LOG_MSG.BACKFILL_SKIPPED, {
          nodeId,
          reason: 'disk_gb unavailable',
        });
        skipped++;
        continue;
      }

      const budgetRow = {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STORAGE_BUDGET_BYTES]: budgetBytes,
        [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE.BACKFILL,
        [COLUMN.STORAGE_BUDGET_UPDATED_AT]: Date.now(),
      };

      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.NODES,
        row: budgetRow,
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: 'critical',
      });

      this.logger.info(STORAGE_CAPACITY_LOG_MSG.BACKFILL_APPLIED, {
        nodeId,
        budgetBytes,
        source: STORAGE_BUDGET_SOURCE.BACKFILL,
      });
      backfilled++;
    }

    return {backfilled, skipped};
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      if (!this.controlPlaneSystemTableGateway.cdcIntegrationService &&
          this.cdcIntegrationService) {
        this.controlPlaneSystemTableGateway
          .setCdcIntegrationService(this.cdcIntegrationService);
      }
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
      cdcIntegrationService: this.cdcIntegrationService,
    });
    return this.controlPlaneSystemTableGateway;
  }
}

export {StorageCapacityMigration, MIGRATION_ERROR_MSG};
