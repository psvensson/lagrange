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

import {CDCIntegrationService} from '../../cdc/cdc-integration-service.js';
import {WRITE_ROUTER_MODE} from '../../cdc/write-router/index.js';
import {LoggingService} from '../../logging/logging-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {SUBSYSTEM} from '../../constants/index.js';

/**
 * Subsystem identifier for logging.
 */
const CDC_INTEGRATION_SETUP_SUBSYSTEM = SUBSYSTEM.CDC_INTEGRATION_SETUP;

/**
 * Log messages for CDCIntegrationSetup.
 */
const LOG_MSG = Object.freeze({
  CREATING_BOOTSTRAP:
    'Creating CDCIntegrationService in bootstrap-direct write phase',
  CREATING_NORMAL:
    'Creating CDCIntegrationService in sql-routed write phase',
  CREATED: 'CDCIntegrationService created successfully',
  BOOTSTRAP_MODE_ENABLED:
    'Bootstrap-direct write phase enabled for direct partition writes',
  MESSAGE_ROUTER_SET: 'Message router configured for mesh connectivity',
  UPGRADING:
    'Upgrading CDCIntegrationService from bootstrap-direct to sql-routed write phase',
  UPGRADED: 'CDCIntegrationService upgraded to sql-routed write phase',
});

/**
 * Error messages for CDCIntegrationSetup.
 */
const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  SQL_QUERY_ENGINE_REQUIRED: 'sqlQueryEngine',
});

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
  static createForBootstrap({nodeId, messageRouter}) {
    // Validate required dependencies
    if (!nodeId) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.NODE_ID_REQUIRED);
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_INTEGRATION_SETUP_SUBSYSTEM) : console;

    logger.info(LOG_MSG.CREATING_BOOTSTRAP, {
      nodeId,
      hasMessageRouter: !!messageRouter,
    });

    // Create CDCIntegrationService WITHOUT SQLQueryEngine during bootstrap.
    // In the bootstrap-direct phase, writes go directly to local partitions via
    // setBootstrapMode(), bypassing the SQL query engine.
    const cdcIntegrationService = new CDCIntegrationService({
      nodeId,
    });
    cdcIntegrationService.initialize();

    // Set message router for mesh connectivity on node join
    if (messageRouter) {
      cdcIntegrationService.setMessageRouter(messageRouter);
      logger.debug(LOG_MSG.MESSAGE_ROUTER_SET, {nodeId});
    }

    logger.info(LOG_MSG.CREATED, {
      nodeId,
      writeRoutingPhase: WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT,
      hasMessageRouter: !!messageRouter,
    });

    return cdcIntegrationService;
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
  }) {
    // Validate required dependencies
    if (!nodeId) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.NODE_ID_REQUIRED);
    }
    if (!sqlQueryEngine) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.SQL_QUERY_ENGINE_REQUIRED);
    }
    if (!systemTableCache) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
    }
    if (!messageRouter) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_INTEGRATION_SETUP_SUBSYSTEM) : console;

    logger.info(LOG_MSG.CREATING_NORMAL, {
      nodeId,
    });

    // Create CDCIntegrationService with SQL query engine for transparent routing
    const cdcIntegrationService = new CDCIntegrationService({
      nodeId,
      sqlQueryEngine,
      systemTableCache,
      cacheMutationTarget,
    });
    cdcIntegrationService.initialize();
    cdcIntegrationService.setSystemTableCache(systemTableCache);
    if (cacheMutationTarget) {
      cdcIntegrationService.setCacheMutationTarget(cacheMutationTarget);
    }

    // Set message router for mesh connectivity
    cdcIntegrationService.setMessageRouter(messageRouter);

    logger.info(LOG_MSG.CREATED, {
      nodeId,
      writeRoutingPhase: WRITE_ROUTER_MODE.SQL_ROUTED,
      hasSqlQueryEngine: true,
      hasSystemTableCache: true,
      hasMessageRouter: true,
    });

    return cdcIntegrationService;
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
  }) {
    if (!cdcIntegrationService) {
      throw new DependencyError('CDCIntegrationSetup', 'cdcIntegrationService');
    }
    if (!sqlQueryEngine) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.SQL_QUERY_ENGINE_REQUIRED);
    }
    if (!systemTableCache) {
      throw new DependencyError('CDCIntegrationSetup', ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_INTEGRATION_SETUP_SUBSYSTEM) : console;

    const nodeId = cdcIntegrationService.nodeId;

    logger.info(LOG_MSG.UPGRADING, {nodeId});

    // Update the service to use cache-based routing
    cdcIntegrationService.setSqlQueryEngine(sqlQueryEngine);
    cdcIntegrationService.setSystemTableCache(systemTableCache);
    if (cacheMutationTarget) {
      cdcIntegrationService.setCacheMutationTarget(cacheMutationTarget);
    }

    // Update message router if provided and not already set
    if (messageRouter && !cdcIntegrationService.messageRouter) {
      cdcIntegrationService.setMessageRouter(messageRouter);
    }

    logger.info(LOG_MSG.UPGRADED, {
      nodeId,
      writeRoutingPhase: WRITE_ROUTER_MODE.SQL_ROUTED,
      hasSqlQueryEngine: true,
      hasSystemTableCache: true,
      hasMessageRouter: !!cdcIntegrationService.messageRouter,
    });
  }
}

export {CDCIntegrationSetup};
