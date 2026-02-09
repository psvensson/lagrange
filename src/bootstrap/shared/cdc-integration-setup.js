/**
 * CDCIntegrationSetup - Shared CDC integration service creation and configuration.
 *
 * This component extracts the common CDC integration service setup logic used by
 * both BootstrapService and NodeJoiningService. It handles:
 * - Creating the CDCIntegrationService instance
 * - Configuring bootstrap mode for seed node direct writes
 * - Setting up SQL query engine for normal operation
 * - Configuring message router for mesh connectivity
 *
 * Two modes of operation:
 * 1. Bootstrap mode (seed node): Direct writes to local partitions without cache
 * 2. Normal mode (joining node): Routes through SQL engine to partition leaders
 *
 * Requirements: 3.4 - Shared CDC_Integration_Setup component
 *
 * @module bootstrap/shared/cdc-integration-setup
 */

import {CDCIntegrationService} from '../../cdc/cdc-integration-service.js';
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
  CREATING_BOOTSTRAP: 'Creating CDCIntegrationService in bootstrap mode',
  CREATING_NORMAL: 'Creating CDCIntegrationService in normal mode',
  CREATED: 'CDCIntegrationService created successfully',
  BOOTSTRAP_MODE_ENABLED: 'Bootstrap mode enabled for direct partition writes',
  MESSAGE_ROUTER_SET: 'Message router configured for mesh connectivity',
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
   * Create CDCIntegrationService for bootstrap mode (seed node).
   *
   * Bootstrap mode is used during seed node registration phase when:
   * - System cache is not yet populated
   * - Writes must go directly to local partitions
   * - SQL query engine is not yet available
   *
   * After cache hydration, the service should be upgraded to normal mode
   * using the upgrade() method or by creating a new service with createNormal().
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router for mesh connectivity (optional).
   * @return {CDCIntegrationService} Configured CDC integration service in bootstrap mode.
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
    // In bootstrap mode, writes go directly to local partitions via
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
      mode: 'bootstrap',
      hasMessageRouter: !!messageRouter,
    });

    return cdcIntegrationService;
  }

  /**
   * Create CDCIntegrationService for normal mode (joining node or post-hydration).
   *
   * Normal mode is used when:
   * - System cache is populated and available
   * - SQL query engine can route to partition leaders
   * - All writes should go through SQL for cache consistency
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.sqlQueryEngine - SQL query engine for routing (required).
   * @param {Object} options.systemTableCache - System table cache (required).
   * @param {Object} options.messageRouter - Message router for mesh connectivity (required).
   * @return {CDCIntegrationService} Configured CDC integration service in normal mode.
   * @throws {DependencyError} If required dependencies are not provided.
   */
  static createForNormal({nodeId, sqlQueryEngine, systemTableCache, messageRouter}) {
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
    });
    cdcIntegrationService.initialize();
    cdcIntegrationService.setSystemTableCache(systemTableCache);

    // Set message router for mesh connectivity
    cdcIntegrationService.setMessageRouter(messageRouter);

    logger.info(LOG_MSG.CREATED, {
      nodeId,
      mode: 'normal',
      hasSqlQueryEngine: true,
      hasSystemTableCache: true,
      hasMessageRouter: true,
    });

    return cdcIntegrationService;
  }

  /**
   * Upgrade an existing bootstrap-mode CDCIntegrationService to normal mode.
   *
   * This is used after cache hydration when the seed node transitions from
   * bootstrap mode (direct partition writes) to normal mode (SQL routing).
   *
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - Existing service to upgrade (required).
   * @param {Object} options.sqlQueryEngine - SQL query engine for routing (required).
   * @param {Object} options.systemTableCache - System table cache (required).
   * @param {Object} options.messageRouter - Message router (optional, updates if provided).
   * @throws {DependencyError} If required dependencies are not provided.
   */
  static upgrade({cdcIntegrationService, sqlQueryEngine, systemTableCache, messageRouter}) {
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

    logger.info('Upgrading CDCIntegrationService from bootstrap to normal mode', {
      nodeId,
    });

    // Update the service to use cache-based routing
    cdcIntegrationService.sqlQueryEngine = sqlQueryEngine;
    cdcIntegrationService.setSystemTableCache(systemTableCache);

    // Update message router if provided and not already set
    if (messageRouter && !cdcIntegrationService.messageRouter) {
      cdcIntegrationService.setMessageRouter(messageRouter);
    }

    logger.info('CDCIntegrationService upgraded to normal mode', {
      nodeId,
      hasSqlQueryEngine: true,
      hasSystemTableCache: true,
      hasMessageRouter: !!cdcIntegrationService.messageRouter,
    });
  }
}

export {CDCIntegrationSetup};
