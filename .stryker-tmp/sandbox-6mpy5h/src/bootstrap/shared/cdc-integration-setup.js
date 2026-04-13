/**
 * CDCIntegrationSetup - Shared CDC integration service creation and configuration.
 *
 * This component extracts the common CDC integration service setup logic used by
 * both BootstrapService and NodeJoiningService. It handles:
 * - Creating the CDCIntegrationService instance
 * - Configuring bootstrap-phase direct writes for seed-node registration
 * - Setting up SQL query engine for steady-state routed operation
 * - Configuring message router for mesh connectivity
 *
 * Two write-routing phases:
 * 1. Bootstrap-direct phase (seed node): Direct writes to local partitions
 * 2. Sql-routed phase (joining node / post-hydration): Route through SQL engine
 *
 * Requirements: 3.4 - Shared CDC_Integration_Setup component
 *
 * @module bootstrap/shared/cdc-integration-setup
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
import { CDCIntegrationService } from '../../cdc/cdc-integration-service.js';
import { WRITE_ROUTER_MODE } from '../../cdc/write-router/index.js';
import { LoggingService } from '../../logging/logging-service.js';
import { DependencyError } from '../bootstrap-errors.js';
import { SUBSYSTEM } from '../../constants/index.js';

/**
 * Subsystem identifier for logging.
 */
const CDC_INTEGRATION_SETUP_SUBSYSTEM = SUBSYSTEM.CDC_INTEGRATION_SETUP;

/**
 * Log messages for CDCIntegrationSetup.
 */
const LOG_MSG = Object.freeze(stryMutAct_9fa48("28209") ? {} : (stryCov_9fa48("28209"), {
  CREATING_BOOTSTRAP: stryMutAct_9fa48("28210") ? "" : (stryCov_9fa48("28210"), 'Creating CDCIntegrationService in bootstrap-direct write phase'),
  CREATING_NORMAL: stryMutAct_9fa48("28211") ? "" : (stryCov_9fa48("28211"), 'Creating CDCIntegrationService in sql-routed write phase'),
  CREATED: stryMutAct_9fa48("28212") ? "" : (stryCov_9fa48("28212"), 'CDCIntegrationService created successfully'),
  BOOTSTRAP_MODE_ENABLED: stryMutAct_9fa48("28213") ? "" : (stryCov_9fa48("28213"), 'Bootstrap-direct write phase enabled for direct partition writes'),
  MESSAGE_ROUTER_SET: stryMutAct_9fa48("28214") ? "" : (stryCov_9fa48("28214"), 'Message router configured for mesh connectivity'),
  UPGRADING: stryMutAct_9fa48("28215") ? "" : (stryCov_9fa48("28215"), 'Upgrading CDCIntegrationService from bootstrap-direct to sql-routed write phase'),
  UPGRADED: stryMutAct_9fa48("28216") ? "" : (stryCov_9fa48("28216"), 'CDCIntegrationService upgraded to sql-routed write phase')
}));

/**
 * Error messages for CDCIntegrationSetup.
 */
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("28217") ? {} : (stryCov_9fa48("28217"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("28218") ? "" : (stryCov_9fa48("28218"), 'nodeId'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("28219") ? "" : (stryCov_9fa48("28219"), 'systemTableCache'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("28220") ? "" : (stryCov_9fa48("28220"), 'messageRouter'),
  SQL_QUERY_ENGINE_REQUIRED: stryMutAct_9fa48("28221") ? "" : (stryCov_9fa48("28221"), 'sqlQueryEngine')
}));

/**
 * Shared CDC integration setup used by both bootstrap paths.
 * Provides static factory methods to create and configure CDCIntegrationService.
 */
class CDCIntegrationSetup {
  /**
   * Create CDCIntegrationService for the bootstrap-direct write phase.
   *
   * The bootstrap-direct phase is used during seed node registration when:
   * - System cache is not yet populated
   * - Writes must go directly to local partitions
   * - SQL query engine is not yet available
   *
   * After cache hydration, the service should be upgraded to the sql-routed phase
   * using the upgrade() method or by creating a new service with createNormal().
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router for mesh connectivity (optional).
   * @return {CDCIntegrationService} Configured CDC integration service in the
   * bootstrap-direct write phase.
   * @throws {DependencyError} If nodeId is not provided.
   */
  static createForBootstrap({
    nodeId,
    messageRouter
  }) {
    if (stryMutAct_9fa48("28222")) {
      {}
    } else {
      stryCov_9fa48("28222");
      // Validate required dependencies
      if (stryMutAct_9fa48("28225") ? false : stryMutAct_9fa48("28224") ? true : stryMutAct_9fa48("28223") ? nodeId : (stryCov_9fa48("28223", "28224", "28225"), !nodeId)) {
        if (stryMutAct_9fa48("28226")) {
          {}
        } else {
          stryCov_9fa48("28226");
          throw new DependencyError(stryMutAct_9fa48("28227") ? "" : (stryCov_9fa48("28227"), 'CDCIntegrationSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_INTEGRATION_SETUP_SUBSYSTEM) : console;
      logger.info(LOG_MSG.CREATING_BOOTSTRAP, stryMutAct_9fa48("28228") ? {} : (stryCov_9fa48("28228"), {
        nodeId,
        hasMessageRouter: stryMutAct_9fa48("28229") ? !messageRouter : (stryCov_9fa48("28229"), !(stryMutAct_9fa48("28230") ? messageRouter : (stryCov_9fa48("28230"), !messageRouter)))
      }));

      // Create CDCIntegrationService WITHOUT SQLQueryEngine during bootstrap.
      // In the bootstrap-direct phase, writes go directly to local partitions via
      // setBootstrapMode(), bypassing the SQL query engine.
      const cdcIntegrationService = new CDCIntegrationService(stryMutAct_9fa48("28231") ? {} : (stryCov_9fa48("28231"), {
        nodeId
      }));
      cdcIntegrationService.initialize();

      // Set message router for mesh connectivity on node join
      if (stryMutAct_9fa48("28233") ? false : stryMutAct_9fa48("28232") ? true : (stryCov_9fa48("28232", "28233"), messageRouter)) {
        if (stryMutAct_9fa48("28234")) {
          {}
        } else {
          stryCov_9fa48("28234");
          cdcIntegrationService.setMessageRouter(messageRouter);
          logger.debug(LOG_MSG.MESSAGE_ROUTER_SET, stryMutAct_9fa48("28235") ? {} : (stryCov_9fa48("28235"), {
            nodeId
          }));
        }
      }
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("28236") ? {} : (stryCov_9fa48("28236"), {
        nodeId,
        writeRoutingPhase: WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT,
        hasMessageRouter: stryMutAct_9fa48("28237") ? !messageRouter : (stryCov_9fa48("28237"), !(stryMutAct_9fa48("28238") ? messageRouter : (stryCov_9fa48("28238"), !messageRouter)))
      }));
      return cdcIntegrationService;
    }
  }

  /**
   * Create CDCIntegrationService for the sql-routed write phase.
   *
   * The sql-routed phase is used when:
   * - System cache is populated and available
   * - SQL query engine can route to partition leaders
   * - All writes should go through SQL for cache consistency
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.sqlQueryEngine - SQL query engine for routing (required).
   * @param {Object} options.systemTableCache - System table cache (required).
   * @param {Object} options.messageRouter - Message router for mesh connectivity (required).
   * @return {CDCIntegrationService} Configured CDC integration service in the
   * sql-routed write phase.
   * @throws {DependencyError} If required dependencies are not provided.
   */
  static createForNormal({
    nodeId,
    sqlQueryEngine,
    systemTableCache,
    messageRouter,
    cacheMutationTarget = null,
    partitionServicesProvider = null
  }) {
    if (stryMutAct_9fa48("28239")) {
      {}
    } else {
      stryCov_9fa48("28239");
      // Validate required dependencies
      if (stryMutAct_9fa48("28242") ? false : stryMutAct_9fa48("28241") ? true : stryMutAct_9fa48("28240") ? nodeId : (stryCov_9fa48("28240", "28241", "28242"), !nodeId)) {
        if (stryMutAct_9fa48("28243")) {
          {}
        } else {
          stryCov_9fa48("28243");
          throw new DependencyError(stryMutAct_9fa48("28244") ? "" : (stryCov_9fa48("28244"), 'CDCIntegrationSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28247") ? false : stryMutAct_9fa48("28246") ? true : stryMutAct_9fa48("28245") ? sqlQueryEngine : (stryCov_9fa48("28245", "28246", "28247"), !sqlQueryEngine)) {
        if (stryMutAct_9fa48("28248")) {
          {}
        } else {
          stryCov_9fa48("28248");
          throw new DependencyError(stryMutAct_9fa48("28249") ? "" : (stryCov_9fa48("28249"), 'CDCIntegrationSetup'), ERROR_MSG.SQL_QUERY_ENGINE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28252") ? false : stryMutAct_9fa48("28251") ? true : stryMutAct_9fa48("28250") ? systemTableCache : (stryCov_9fa48("28250", "28251", "28252"), !systemTableCache)) {
        if (stryMutAct_9fa48("28253")) {
          {}
        } else {
          stryCov_9fa48("28253");
          throw new DependencyError(stryMutAct_9fa48("28254") ? "" : (stryCov_9fa48("28254"), 'CDCIntegrationSetup'), ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28257") ? false : stryMutAct_9fa48("28256") ? true : stryMutAct_9fa48("28255") ? messageRouter : (stryCov_9fa48("28255", "28256", "28257"), !messageRouter)) {
        if (stryMutAct_9fa48("28258")) {
          {}
        } else {
          stryCov_9fa48("28258");
          throw new DependencyError(stryMutAct_9fa48("28259") ? "" : (stryCov_9fa48("28259"), 'CDCIntegrationSetup'), ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_INTEGRATION_SETUP_SUBSYSTEM) : console;
      logger.info(LOG_MSG.CREATING_NORMAL, stryMutAct_9fa48("28260") ? {} : (stryCov_9fa48("28260"), {
        nodeId
      }));

      // Create CDCIntegrationService with SQL query engine for transparent routing
      const cdcIntegrationService = new CDCIntegrationService(stryMutAct_9fa48("28261") ? {} : (stryCov_9fa48("28261"), {
        nodeId,
        sqlQueryEngine,
        systemTableCache,
        cacheMutationTarget,
        partitionServicesProvider
      }));
      cdcIntegrationService.initialize();
      cdcIntegrationService.setSystemTableCache(systemTableCache);
      if (stryMutAct_9fa48("28263") ? false : stryMutAct_9fa48("28262") ? true : (stryCov_9fa48("28262", "28263"), cacheMutationTarget)) {
        if (stryMutAct_9fa48("28264")) {
          {}
        } else {
          stryCov_9fa48("28264");
          cdcIntegrationService.setCacheMutationTarget(cacheMutationTarget);
        }
      }
      if (stryMutAct_9fa48("28267") ? partitionServicesProvider || typeof cdcIntegrationService.setPartitionServicesProvider === 'function' : stryMutAct_9fa48("28266") ? false : stryMutAct_9fa48("28265") ? true : (stryCov_9fa48("28265", "28266", "28267"), partitionServicesProvider && (stryMutAct_9fa48("28269") ? typeof cdcIntegrationService.setPartitionServicesProvider !== 'function' : stryMutAct_9fa48("28268") ? true : (stryCov_9fa48("28268", "28269"), typeof cdcIntegrationService.setPartitionServicesProvider === (stryMutAct_9fa48("28270") ? "" : (stryCov_9fa48("28270"), 'function')))))) {
        if (stryMutAct_9fa48("28271")) {
          {}
        } else {
          stryCov_9fa48("28271");
          cdcIntegrationService.setPartitionServicesProvider(partitionServicesProvider);
        }
      }

      // Set message router for mesh connectivity
      cdcIntegrationService.setMessageRouter(messageRouter);
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("28272") ? {} : (stryCov_9fa48("28272"), {
        nodeId,
        writeRoutingPhase: WRITE_ROUTER_MODE.SQL_ROUTED,
        hasSqlQueryEngine: stryMutAct_9fa48("28273") ? false : (stryCov_9fa48("28273"), true),
        hasSystemTableCache: stryMutAct_9fa48("28274") ? false : (stryCov_9fa48("28274"), true),
        hasMessageRouter: stryMutAct_9fa48("28275") ? false : (stryCov_9fa48("28275"), true)
      }));
      return cdcIntegrationService;
    }
  }

  /**
   * Upgrade an existing bootstrap-direct service to the sql-routed phase.
   *
   * This is used after cache hydration when the seed node transitions from
   * bootstrap-direct writes to sql-routed writes.
   *
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - Existing service to upgrade (required).
   * @param {Object} options.sqlQueryEngine - SQL query engine for routing (required).
   * @param {Object} options.systemTableCache - System table cache (required).
   * @param {Object} options.messageRouter - Message router (optional, updates if provided).
   * @throws {DependencyError} If required dependencies are not provided.
   */
  static upgrade({
    cdcIntegrationService,
    sqlQueryEngine,
    systemTableCache,
    messageRouter,
    cacheMutationTarget = null,
    partitionServicesProvider = null
  }) {
    if (stryMutAct_9fa48("28276")) {
      {}
    } else {
      stryCov_9fa48("28276");
      if (stryMutAct_9fa48("28279") ? false : stryMutAct_9fa48("28278") ? true : stryMutAct_9fa48("28277") ? cdcIntegrationService : (stryCov_9fa48("28277", "28278", "28279"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("28280")) {
          {}
        } else {
          stryCov_9fa48("28280");
          throw new DependencyError(stryMutAct_9fa48("28281") ? "" : (stryCov_9fa48("28281"), 'CDCIntegrationSetup'), stryMutAct_9fa48("28282") ? "" : (stryCov_9fa48("28282"), 'cdcIntegrationService'));
        }
      }
      if (stryMutAct_9fa48("28285") ? false : stryMutAct_9fa48("28284") ? true : stryMutAct_9fa48("28283") ? sqlQueryEngine : (stryCov_9fa48("28283", "28284", "28285"), !sqlQueryEngine)) {
        if (stryMutAct_9fa48("28286")) {
          {}
        } else {
          stryCov_9fa48("28286");
          throw new DependencyError(stryMutAct_9fa48("28287") ? "" : (stryCov_9fa48("28287"), 'CDCIntegrationSetup'), ERROR_MSG.SQL_QUERY_ENGINE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28290") ? false : stryMutAct_9fa48("28289") ? true : stryMutAct_9fa48("28288") ? systemTableCache : (stryCov_9fa48("28288", "28289", "28290"), !systemTableCache)) {
        if (stryMutAct_9fa48("28291")) {
          {}
        } else {
          stryCov_9fa48("28291");
          throw new DependencyError(stryMutAct_9fa48("28292") ? "" : (stryCov_9fa48("28292"), 'CDCIntegrationSetup'), ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_INTEGRATION_SETUP_SUBSYSTEM) : console;
      const nodeId = cdcIntegrationService.nodeId;
      logger.info(LOG_MSG.UPGRADING, stryMutAct_9fa48("28293") ? {} : (stryCov_9fa48("28293"), {
        nodeId
      }));

      // Update the service to use cache-based routing
      cdcIntegrationService.setSqlQueryEngine(sqlQueryEngine);
      cdcIntegrationService.setSystemTableCache(systemTableCache);
      if (stryMutAct_9fa48("28295") ? false : stryMutAct_9fa48("28294") ? true : (stryCov_9fa48("28294", "28295"), cacheMutationTarget)) {
        if (stryMutAct_9fa48("28296")) {
          {}
        } else {
          stryCov_9fa48("28296");
          cdcIntegrationService.setCacheMutationTarget(cacheMutationTarget);
        }
      }
      if (stryMutAct_9fa48("28299") ? partitionServicesProvider || typeof cdcIntegrationService.setPartitionServicesProvider === 'function' : stryMutAct_9fa48("28298") ? false : stryMutAct_9fa48("28297") ? true : (stryCov_9fa48("28297", "28298", "28299"), partitionServicesProvider && (stryMutAct_9fa48("28301") ? typeof cdcIntegrationService.setPartitionServicesProvider !== 'function' : stryMutAct_9fa48("28300") ? true : (stryCov_9fa48("28300", "28301"), typeof cdcIntegrationService.setPartitionServicesProvider === (stryMutAct_9fa48("28302") ? "" : (stryCov_9fa48("28302"), 'function')))))) {
        if (stryMutAct_9fa48("28303")) {
          {}
        } else {
          stryCov_9fa48("28303");
          cdcIntegrationService.setPartitionServicesProvider(partitionServicesProvider);
        }
      }

      // Update message router if provided and not already set
      if (stryMutAct_9fa48("28306") ? messageRouter || !cdcIntegrationService.messageRouter : stryMutAct_9fa48("28305") ? false : stryMutAct_9fa48("28304") ? true : (stryCov_9fa48("28304", "28305", "28306"), messageRouter && (stryMutAct_9fa48("28307") ? cdcIntegrationService.messageRouter : (stryCov_9fa48("28307"), !cdcIntegrationService.messageRouter)))) {
        if (stryMutAct_9fa48("28308")) {
          {}
        } else {
          stryCov_9fa48("28308");
          cdcIntegrationService.setMessageRouter(messageRouter);
        }
      }
      logger.info(LOG_MSG.UPGRADED, stryMutAct_9fa48("28309") ? {} : (stryCov_9fa48("28309"), {
        nodeId,
        writeRoutingPhase: WRITE_ROUTER_MODE.SQL_ROUTED,
        hasSqlQueryEngine: stryMutAct_9fa48("28310") ? false : (stryCov_9fa48("28310"), true),
        hasSystemTableCache: stryMutAct_9fa48("28311") ? false : (stryCov_9fa48("28311"), true),
        hasMessageRouter: stryMutAct_9fa48("28312") ? !cdcIntegrationService.messageRouter : (stryCov_9fa48("28312"), !(stryMutAct_9fa48("28313") ? cdcIntegrationService.messageRouter : (stryCov_9fa48("28313"), !cdcIntegrationService.messageRouter)))
      }));
    }
  }
}
export { CDCIntegrationSetup };