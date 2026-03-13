/**
 * NodeStorageBudgetSetup - Shared node storage budget resolution
 * and persistence during bootstrap/join startup.
 *
 * This component extracts the common budget setup logic used by
 * both BootstrapService and NodeJoiningService. It handles:
 * - Creating and initializing NodeStorageBudgetService
 * - Resolving and persisting the node storage budget
 * - Emitting startup diagnostics for budget source and value
 *
 * Requirements: 9.1, 9.2, 9.4, 9.5, 11.1
 *
 * @module bootstrap/shared/node-storage-budget-setup
 */

import {
  NodeStorageBudgetService,
} from '../../rebalancer/node-storage-budget-service.js';
import {LoggingService} from '../../logging/logging-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {SUBSYSTEM} from '../../constants/index.js';
import {
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
} from '../../rebalancer/storage-capacity-constants.js';

/**
 * Log messages for NodeStorageBudgetSetup.
 */
const LOG_MSG = Object.freeze({
  CREATING: 'Creating NodeStorageBudgetService',
  RESOLVING: 'Resolving node storage budget',
  RESOLVED: 'Node storage budget resolved during startup',
  FAILED: 'Node storage budget resolution failed during startup',
});

/**
 * Error messages for NodeStorageBudgetSetup.
 */
const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  CDC_REQUIRED: 'cdcIntegrationService',
  NODE_ROW_REQUIRED: 'nodeRow',
});

/**
 * Shared node storage budget setup used by both bootstrap paths.
 * Provides static factory methods to create, resolve, and persist
 * the node storage budget.
 */
class NodeStorageBudgetSetup {
  /**
   * Create a configured NodeStorageBudgetService instance.
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.cdcIntegrationService - CDC service
   *   (required).
   * @return {NodeStorageBudgetService} Initialized service.
   * @throws {DependencyError} If required dependencies missing.
   */
  static create(options) {
    const {nodeId, cdcIntegrationService} = options;

    if (!nodeId) {
      throw new DependencyError(
        'NodeStorageBudgetSetup', ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        'NodeStorageBudgetSetup', ERROR_MSG.CDC_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        SUBSYSTEM.NODE_STORAGE_BUDGET_SETUP,
      ) : console;

    logger.info(LOG_MSG.CREATING, {nodeId});

    const service = new NodeStorageBudgetService({
      nodeId,
      cdcIntegrationService,
    });
    service.initialize({nodeId, cdcIntegrationService});

    return service;
  }

  /**
   * Resolve and persist the node storage budget, emitting
   * startup diagnostics.
   *
   * Must be called BEFORE the node becomes placement-eligible.
   *
   * @param {Object} options - Configuration options.
   * @param {NodeStorageBudgetService} options.budgetService -
   *   Initialized budget service (required).
   * @param {Object} options.nodeRow - Node row data (required).
   * @param {string} options.nodeId - Node ID for diagnostics.
   * @return {Promise<Object>} Resolution result with
   *   {result, budgetRow, resolution}.
   * @throws {DependencyError} If required dependencies missing.
   */
  static async resolveAndPersist(options) {
    const {budgetService, nodeRow, nodeId, upsertOptions} = options;

    if (!nodeRow) {
      throw new DependencyError(
        'NodeStorageBudgetSetup', ERROR_MSG.NODE_ROW_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const setupLogger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        SUBSYSTEM.NODE_STORAGE_BUDGET_SETUP,
      ) : console;
    const capacityLogger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        STORAGE_CAPACITY_SUBSYSTEM,
      ) : console;

    setupLogger.info(LOG_MSG.RESOLVING, {nodeId});

    const outcome =
      await budgetService.registerNodeBudget({nodeRow, upsertOptions});

    // Startup diagnostics (Req 9.4)
    if (outcome.resolution.isValid) {
      capacityLogger.info(
        STORAGE_CAPACITY_LOG_MSG.BUDGET_RESOLVED, {
          nodeId,
          budgetBytes: outcome.resolution.budgetBytes,
          budgetSource: outcome.resolution.source,
          diskBytes: outcome.resolution.diskBytes,
          phase: 'startup',
        },
      );
      setupLogger.info(LOG_MSG.RESOLVED, {
        nodeId,
        budgetBytes: outcome.resolution.budgetBytes,
        budgetSource: outcome.resolution.source,
      });
    } else {
      capacityLogger.warn(
        STORAGE_CAPACITY_LOG_MSG.BUDGET_MISSING, {
          nodeId,
          error: outcome.resolution.error,
          diskBytes: outcome.resolution.diskBytes,
          phase: 'startup',
        },
      );
      setupLogger.warn(LOG_MSG.FAILED, {
        nodeId,
        error: outcome.resolution.error,
      });
    }

    return outcome;
  }

  /**
   * Resolve the canonical budget row for startup without persisting it.
   * Use this when another owner is responsible for the nodes-row lifecycle.
   *
   * @param {Object} options - Configuration options.
   * @param {NodeStorageBudgetService} options.budgetService -
   *   Initialized budget service (required).
   * @param {Object} options.nodeRow - Node row data (required).
   * @param {string} options.nodeId - Node ID for diagnostics.
   * @return {Promise<Object>} Resolution result with {budgetRow, resolution}.
   * @throws {DependencyError} If required dependencies missing.
   */
  static async resolveWithoutPersist(options) {
    const {budgetService, nodeRow, nodeId} = options;

    if (!nodeRow) {
      throw new DependencyError(
        'NodeStorageBudgetSetup', ERROR_MSG.NODE_ROW_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const setupLogger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        SUBSYSTEM.NODE_STORAGE_BUDGET_SETUP,
      ) : console;
    const capacityLogger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        STORAGE_CAPACITY_SUBSYSTEM,
      ) : console;

    setupLogger.info(LOG_MSG.RESOLVING, {nodeId});

    const outcome = budgetService.resolveBudgetRow(nodeRow);

    if (outcome.resolution.isValid) {
      capacityLogger.info(
        STORAGE_CAPACITY_LOG_MSG.BUDGET_RESOLVED, {
          nodeId,
          budgetBytes: outcome.resolution.budgetBytes,
          budgetSource: outcome.resolution.source,
          diskBytes: outcome.resolution.diskBytes,
          phase: 'startup',
        },
      );
      setupLogger.info(LOG_MSG.RESOLVED, {
        nodeId,
        budgetBytes: outcome.resolution.budgetBytes,
        budgetSource: outcome.resolution.source,
      });
    } else {
      capacityLogger.warn(
        STORAGE_CAPACITY_LOG_MSG.BUDGET_MISSING, {
          nodeId,
          error: outcome.resolution.error,
          diskBytes: outcome.resolution.diskBytes,
          phase: 'startup',
        },
      );
      setupLogger.warn(LOG_MSG.FAILED, {
        nodeId,
        error: outcome.resolution.error,
      });
    }

    return outcome;
  }
}

export {NodeStorageBudgetSetup};
