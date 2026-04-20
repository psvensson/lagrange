/**
 * Node Storage Budget Service - resolves and persists node storage budgets.
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5, 9.1, 9.3, 9.4
 */

import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {
  COLUMN,
  NODE_STATE,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  createControlPlaneRuntimeBundle,
} from '../control-plane/control-plane-runtime-bundle.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  STORAGE_BUDGET_CONFIG_KEY,
  STORAGE_BUDGET_SOURCE,
  STORAGE_BUDGET_VALIDATION,
  STORAGE_CAPACITY_ERROR_MSG,
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
} from './storage-capacity-constants.js';

const NODE_STORAGE_BUDGET_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'NodeStorageBudgetService requires nodeId',
  MISSING_CDC: 'NodeStorageBudgetService requires cdcIntegrationService',
  INVALID_NODE_ROW: 'NodeStorageBudgetService requires a node row object',
  REGISTRATION_FAILED: 'Node storage budget registration failed',
});

class NodeStorageBudgetService {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.cdcIntegrationService
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getCdcIntegrationService: () => this.cdcIntegrationService,
      }).controlPlaneSystemTableGateway;
    this.config = ConfigurationManager.getInstance();
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
  }

  /**
   * Initialize or refresh dependencies.
   * @param {Object} options
   * @param {string} [options.nodeId]
   * @param {Object} [options.cdcIntegrationService]
   */
  initialize(options = {}) {
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    }

    assertCritical(this.nodeId, NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(
      this.cdcIntegrationService,
      NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_CDC,
    );
  }

  /**
   * Resolve disk bytes from node row data.
   * @param {Object} nodeRow
   * @return {number|null}
   * @private
   */
  getDiskBytesFromNodeRow(nodeRow) {
    const diskGb = Number(nodeRow?.[COLUMN.DISK_GB]);
    if (!Number.isFinite(diskGb) || diskGb <= NUM.ZERO) {
      return null;
    }
    return Math.floor(diskGb * NUM.BYTES_PER_GIB);
  }

  /**
   * Resolve storage budget from config and node metadata.
   * @param {Object} nodeRow
   * @return {Object}
   */
  resolveBudget(nodeRow) {
    assertCritical(
      nodeRow && typeof nodeRow === TYPEOF.OBJECT,
      NODE_STORAGE_BUDGET_ERROR_MSG.INVALID_NODE_ROW,
    );

    const budgetBytesConfig =
      this.config.get(STORAGE_BUDGET_CONFIG_KEY.BUDGET_BYTES);
    const budgetRatioConfig =
      this.config.get(STORAGE_BUDGET_CONFIG_KEY.BUDGET_RATIO);
    const hasBudgetBytes = Number.isFinite(budgetBytesConfig);
    const hasBudgetRatio = Number.isFinite(budgetRatioConfig);
    const diskBytes = this.getDiskBytesFromNodeRow(nodeRow);
    const resolvedAt = Date.now();

    let budgetBytes = null;
    let source = null;
    let error = null;
    let warning = null;

    if (hasBudgetBytes) {
      budgetBytes = Math.floor(budgetBytesConfig);
      source = STORAGE_BUDGET_SOURCE.ABSOLUTE;
      if (hasBudgetRatio) {
        warning = STORAGE_CAPACITY_ERROR_MSG.BOTH_BUDGET_TYPES_PROVIDED;
      }
    } else if (hasBudgetRatio) {
      if (budgetRatioConfig < STORAGE_BUDGET_VALIDATION.MIN_RATIO ||
          budgetRatioConfig > STORAGE_BUDGET_VALIDATION.MAX_RATIO) {
        error = STORAGE_CAPACITY_ERROR_MSG.RATIO_OUT_OF_RANGE;
      } else if (!Number.isFinite(diskBytes)) {
        error = STORAGE_CAPACITY_ERROR_MSG.DISK_SIZE_UNAVAILABLE;
      } else {
        budgetBytes = Math.floor(diskBytes * budgetRatioConfig);
        source = STORAGE_BUDGET_SOURCE.RATIO;
      }
    } else if (Number.isFinite(diskBytes)) {
      budgetBytes = Math.floor(diskBytes);
      source = STORAGE_BUDGET_SOURCE.BACKFILL;
    } else {
      error = STORAGE_CAPACITY_ERROR_MSG.DISK_SIZE_UNAVAILABLE;
    }

    if (!error) {
      if (!Number.isFinite(budgetBytes)) {
        error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_MALFORMED;
      } else if (budgetBytes <= NUM.ZERO) {
        error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_NON_POSITIVE;
      } else if (budgetBytes < STORAGE_BUDGET_VALIDATION.MIN_BUDGET_BYTES) {
        error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_TOO_SMALL;
      } else if (Number.isFinite(diskBytes) && budgetBytes > diskBytes) {
        error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_EXCEEDS_DISK;
      }
    }

    const isValid = !error;

    return {
      isValid,
      budgetBytes: isValid ? budgetBytes : null,
      source: isValid ? source : null,
      resolvedAt,
      diskBytes,
      error,
      warning,
    };
  }

  /**
   * Build a node row with storage budget fields.
   * @param {Object} nodeRow
   * @param {Object} resolution
   * @return {Object}
   * @private
   */
  buildBudgetRow(nodeRow, resolution) {
    const status = resolution.isValid ?
      (nodeRow[COLUMN.STATUS] || NODE_STATE.ACTIVE) :
      NODE_STATE.JOINING;

    return {
      ...nodeRow,
      [COLUMN.STATUS]: status,
      [COLUMN.STORAGE_BUDGET_BYTES]: resolution.isValid ?
        resolution.budgetBytes : null,
      [COLUMN.STORAGE_BUDGET_SOURCE]: resolution.isValid ?
        resolution.source : null,
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: resolution.resolvedAt,
    };
  }

  /**
   * Resolve one startup/storage-budget projection without persisting it.
   * This keeps storage-budget ownership centralized while allowing callers
   * with different row-lifecycle owners to reuse the canonical budget fields.
   * @param {Object} nodeRow
   * @return {{budgetRow: Object, resolution: Object}}
   */
  resolveBudgetRow(nodeRow) {
    const resolution = this.resolveBudget(nodeRow);
    return {
      budgetRow: this.buildBudgetRow(nodeRow, resolution),
      resolution,
    };
  }

  /**
   * Resolve and persist the node storage budget in the nodes table.
   * @param {Object} options
   * @param {Object} options.nodeRow
   * @return {Promise<Object>}
   */
  async registerNodeBudget(options = {}) {
    const nodeRow = options.nodeRow;
    const upsertOptions = options.upsertOptions &&
      typeof options.upsertOptions === TYPEOF.OBJECT ?
      options.upsertOptions :
      undefined;
    assertCritical(
      nodeRow && typeof nodeRow === TYPEOF.OBJECT,
      NODE_STORAGE_BUDGET_ERROR_MSG.INVALID_NODE_ROW,
    );

    const nodeId = this.nodeId || nodeRow[COLUMN.NODE_ID];
    assertCritical(nodeId, NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_NODE_ID);
    this.nodeId = nodeId;

    assertCritical(
      this.cdcIntegrationService,
      NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_CDC,
    );

    const {budgetRow, resolution} = this.resolveBudgetRow(nodeRow);
    const workloadProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_METADATA_MUTATION,
    );
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.NODES,
      row: budgetRow,
    }, {
      ...upsertOptions,
      workloadClass: workloadProfile.workloadClass,
      workClass: workloadProfile.workClass,
      allowPressureDefer: workloadProfile.allowPressureDefer,
      allowPressureDegrade: workloadProfile.allowPressureDegrade,
      deliveryPriority: 'critical',
    });

    if (!result?.success) {
      throw new Error(
        result?.error || NODE_STORAGE_BUDGET_ERROR_MSG.REGISTRATION_FAILED,
      );
    }

    if (resolution.isValid) {
      this.logger.info(STORAGE_CAPACITY_LOG_MSG.BUDGET_RESOLVED, {
        nodeId,
        budgetBytes: resolution.budgetBytes,
        budgetSource: resolution.source,
        diskBytes: resolution.diskBytes,
        warning: resolution.warning,
      });
    } else {
      this.logger.warn(STORAGE_CAPACITY_LOG_MSG.BUDGET_MISSING, {
        nodeId,
        error: resolution.error,
        diskBytes: resolution.diskBytes,
      });
    }

    return {result, budgetRow, resolution};
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }
}

export {NodeStorageBudgetService};
