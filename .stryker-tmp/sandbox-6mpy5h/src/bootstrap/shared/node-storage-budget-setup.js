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
import { NodeStorageBudgetService } from '../../rebalancer/node-storage-budget-service.js';
import { LoggingService } from '../../logging/logging-service.js';
import { DependencyError } from '../bootstrap-errors.js';
import { SUBSYSTEM } from '../../constants/index.js';
import { STORAGE_CAPACITY_LOG_MSG, STORAGE_CAPACITY_SUBSYSTEM } from '../../rebalancer/storage-capacity-constants.js';

/**
 * Log messages for NodeStorageBudgetSetup.
 */
const LOG_MSG = Object.freeze(stryMutAct_9fa48("30222") ? {} : (stryCov_9fa48("30222"), {
  CREATING: stryMutAct_9fa48("30223") ? "" : (stryCov_9fa48("30223"), 'Creating NodeStorageBudgetService'),
  RESOLVING: stryMutAct_9fa48("30224") ? "" : (stryCov_9fa48("30224"), 'Resolving node storage budget'),
  RESOLVED: stryMutAct_9fa48("30225") ? "" : (stryCov_9fa48("30225"), 'Node storage budget resolved during startup'),
  FAILED: stryMutAct_9fa48("30226") ? "" : (stryCov_9fa48("30226"), 'Node storage budget resolution failed during startup')
}));

/**
 * Error messages for NodeStorageBudgetSetup.
 */
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("30227") ? {} : (stryCov_9fa48("30227"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("30228") ? "" : (stryCov_9fa48("30228"), 'nodeId'),
  CDC_REQUIRED: stryMutAct_9fa48("30229") ? "" : (stryCov_9fa48("30229"), 'cdcIntegrationService'),
  NODE_ROW_REQUIRED: stryMutAct_9fa48("30230") ? "" : (stryCov_9fa48("30230"), 'nodeRow'),
  REGISTER_NODE_BUDGET_REQUIRED: stryMutAct_9fa48("30231") ? "" : (stryCov_9fa48("30231"), 'budgetService.registerNodeBudget'),
  RESOLVE_BUDGET_ROW_REQUIRED: stryMutAct_9fa48("30232") ? "" : (stryCov_9fa48("30232"), 'budgetService.resolveBudgetRow')
}));

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
    if (stryMutAct_9fa48("30233")) {
      {}
    } else {
      stryCov_9fa48("30233");
      const {
        nodeId,
        cdcIntegrationService
      } = options;
      if (stryMutAct_9fa48("30236") ? false : stryMutAct_9fa48("30235") ? true : stryMutAct_9fa48("30234") ? nodeId : (stryCov_9fa48("30234", "30235", "30236"), !nodeId)) {
        if (stryMutAct_9fa48("30237")) {
          {}
        } else {
          stryCov_9fa48("30237");
          throw new DependencyError(stryMutAct_9fa48("30238") ? "" : (stryCov_9fa48("30238"), 'NodeStorageBudgetSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30241") ? false : stryMutAct_9fa48("30240") ? true : stryMutAct_9fa48("30239") ? cdcIntegrationService : (stryCov_9fa48("30239", "30240", "30241"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("30242")) {
          {}
        } else {
          stryCov_9fa48("30242");
          throw new DependencyError(stryMutAct_9fa48("30243") ? "" : (stryCov_9fa48("30243"), 'NodeStorageBudgetSetup'), ERROR_MSG.CDC_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(SUBSYSTEM.NODE_STORAGE_BUDGET_SETUP) : console;
      logger.info(LOG_MSG.CREATING, stryMutAct_9fa48("30244") ? {} : (stryCov_9fa48("30244"), {
        nodeId
      }));
      const service = new NodeStorageBudgetService(stryMutAct_9fa48("30245") ? {} : (stryCov_9fa48("30245"), {
        nodeId,
        cdcIntegrationService
      }));
      service.initialize(stryMutAct_9fa48("30246") ? {} : (stryCov_9fa48("30246"), {
        nodeId,
        cdcIntegrationService
      }));
      return service;
    }
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
    if (stryMutAct_9fa48("30247")) {
      {}
    } else {
      stryCov_9fa48("30247");
      const {
        budgetService,
        nodeRow,
        nodeId,
        upsertOptions
      } = options;
      if (stryMutAct_9fa48("30250") ? false : stryMutAct_9fa48("30249") ? true : stryMutAct_9fa48("30248") ? nodeRow : (stryCov_9fa48("30248", "30249", "30250"), !nodeRow)) {
        if (stryMutAct_9fa48("30251")) {
          {}
        } else {
          stryCov_9fa48("30251");
          throw new DependencyError(stryMutAct_9fa48("30252") ? "" : (stryCov_9fa48("30252"), 'NodeStorageBudgetSetup'), ERROR_MSG.NODE_ROW_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30255") ? typeof budgetService?.registerNodeBudget === 'function' : stryMutAct_9fa48("30254") ? false : stryMutAct_9fa48("30253") ? true : (stryCov_9fa48("30253", "30254", "30255"), typeof (stryMutAct_9fa48("30256") ? budgetService.registerNodeBudget : (stryCov_9fa48("30256"), budgetService?.registerNodeBudget)) !== (stryMutAct_9fa48("30257") ? "" : (stryCov_9fa48("30257"), 'function')))) {
        if (stryMutAct_9fa48("30258")) {
          {}
        } else {
          stryCov_9fa48("30258");
          throw new DependencyError(stryMutAct_9fa48("30259") ? "" : (stryCov_9fa48("30259"), 'NodeStorageBudgetSetup'), ERROR_MSG.REGISTER_NODE_BUDGET_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const setupLogger = loggingService.isInitialized() ? loggingService.forSubsystem(SUBSYSTEM.NODE_STORAGE_BUDGET_SETUP) : console;
      const capacityLogger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
      setupLogger.info(LOG_MSG.RESOLVING, stryMutAct_9fa48("30260") ? {} : (stryCov_9fa48("30260"), {
        nodeId
      }));
      const outcome = await budgetService.registerNodeBudget(stryMutAct_9fa48("30261") ? {} : (stryCov_9fa48("30261"), {
        nodeRow,
        upsertOptions
      }));

      // Startup diagnostics (Req 9.4)
      if (stryMutAct_9fa48("30263") ? false : stryMutAct_9fa48("30262") ? true : (stryCov_9fa48("30262", "30263"), outcome.resolution.isValid)) {
        if (stryMutAct_9fa48("30264")) {
          {}
        } else {
          stryCov_9fa48("30264");
          capacityLogger.info(STORAGE_CAPACITY_LOG_MSG.BUDGET_RESOLVED, stryMutAct_9fa48("30265") ? {} : (stryCov_9fa48("30265"), {
            nodeId,
            budgetBytes: outcome.resolution.budgetBytes,
            budgetSource: outcome.resolution.source,
            diskBytes: outcome.resolution.diskBytes,
            phase: stryMutAct_9fa48("30266") ? "" : (stryCov_9fa48("30266"), 'startup')
          }));
          setupLogger.info(LOG_MSG.RESOLVED, stryMutAct_9fa48("30267") ? {} : (stryCov_9fa48("30267"), {
            nodeId,
            budgetBytes: outcome.resolution.budgetBytes,
            budgetSource: outcome.resolution.source
          }));
        }
      } else {
        if (stryMutAct_9fa48("30268")) {
          {}
        } else {
          stryCov_9fa48("30268");
          capacityLogger.warn(STORAGE_CAPACITY_LOG_MSG.BUDGET_MISSING, stryMutAct_9fa48("30269") ? {} : (stryCov_9fa48("30269"), {
            nodeId,
            error: outcome.resolution.error,
            diskBytes: outcome.resolution.diskBytes,
            phase: stryMutAct_9fa48("30270") ? "" : (stryCov_9fa48("30270"), 'startup')
          }));
          setupLogger.warn(LOG_MSG.FAILED, stryMutAct_9fa48("30271") ? {} : (stryCov_9fa48("30271"), {
            nodeId,
            error: outcome.resolution.error
          }));
        }
      }
      return outcome;
    }
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
    if (stryMutAct_9fa48("30272")) {
      {}
    } else {
      stryCov_9fa48("30272");
      const {
        budgetService,
        nodeRow,
        nodeId
      } = options;
      if (stryMutAct_9fa48("30275") ? false : stryMutAct_9fa48("30274") ? true : stryMutAct_9fa48("30273") ? nodeRow : (stryCov_9fa48("30273", "30274", "30275"), !nodeRow)) {
        if (stryMutAct_9fa48("30276")) {
          {}
        } else {
          stryCov_9fa48("30276");
          throw new DependencyError(stryMutAct_9fa48("30277") ? "" : (stryCov_9fa48("30277"), 'NodeStorageBudgetSetup'), ERROR_MSG.NODE_ROW_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30280") ? typeof budgetService?.resolveBudgetRow === 'function' : stryMutAct_9fa48("30279") ? false : stryMutAct_9fa48("30278") ? true : (stryCov_9fa48("30278", "30279", "30280"), typeof (stryMutAct_9fa48("30281") ? budgetService.resolveBudgetRow : (stryCov_9fa48("30281"), budgetService?.resolveBudgetRow)) !== (stryMutAct_9fa48("30282") ? "" : (stryCov_9fa48("30282"), 'function')))) {
        if (stryMutAct_9fa48("30283")) {
          {}
        } else {
          stryCov_9fa48("30283");
          throw new DependencyError(stryMutAct_9fa48("30284") ? "" : (stryCov_9fa48("30284"), 'NodeStorageBudgetSetup'), ERROR_MSG.RESOLVE_BUDGET_ROW_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const setupLogger = loggingService.isInitialized() ? loggingService.forSubsystem(SUBSYSTEM.NODE_STORAGE_BUDGET_SETUP) : console;
      const capacityLogger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
      setupLogger.info(LOG_MSG.RESOLVING, stryMutAct_9fa48("30285") ? {} : (stryCov_9fa48("30285"), {
        nodeId
      }));
      const outcome = budgetService.resolveBudgetRow(nodeRow);
      if (stryMutAct_9fa48("30287") ? false : stryMutAct_9fa48("30286") ? true : (stryCov_9fa48("30286", "30287"), outcome.resolution.isValid)) {
        if (stryMutAct_9fa48("30288")) {
          {}
        } else {
          stryCov_9fa48("30288");
          capacityLogger.info(STORAGE_CAPACITY_LOG_MSG.BUDGET_RESOLVED, stryMutAct_9fa48("30289") ? {} : (stryCov_9fa48("30289"), {
            nodeId,
            budgetBytes: outcome.resolution.budgetBytes,
            budgetSource: outcome.resolution.source,
            diskBytes: outcome.resolution.diskBytes,
            phase: stryMutAct_9fa48("30290") ? "" : (stryCov_9fa48("30290"), 'startup')
          }));
          setupLogger.info(LOG_MSG.RESOLVED, stryMutAct_9fa48("30291") ? {} : (stryCov_9fa48("30291"), {
            nodeId,
            budgetBytes: outcome.resolution.budgetBytes,
            budgetSource: outcome.resolution.source
          }));
        }
      } else {
        if (stryMutAct_9fa48("30292")) {
          {}
        } else {
          stryCov_9fa48("30292");
          capacityLogger.warn(STORAGE_CAPACITY_LOG_MSG.BUDGET_MISSING, stryMutAct_9fa48("30293") ? {} : (stryCov_9fa48("30293"), {
            nodeId,
            error: outcome.resolution.error,
            diskBytes: outcome.resolution.diskBytes,
            phase: stryMutAct_9fa48("30294") ? "" : (stryCov_9fa48("30294"), 'startup')
          }));
          setupLogger.warn(LOG_MSG.FAILED, stryMutAct_9fa48("30295") ? {} : (stryCov_9fa48("30295"), {
            nodeId,
            error: outcome.resolution.error
          }));
        }
      }
      return outcome;
    }
  }
}
export { NodeStorageBudgetSetup };