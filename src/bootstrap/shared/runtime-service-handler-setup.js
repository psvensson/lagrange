/**
 * RuntimeServiceHandlerSetup - Shared runtime service handler creation
 * and configuration used by both BootstrapService and NodeJoiningService.
 *
 * Creates and registers the RuntimeServiceHandler with the message
 * router so the node can receive and execute runtime-service
 * replica operations (ADD/REMOVE/REPLACE).
 *
 * Requirements: 2.1, 3.2, 4.4, 11.2
 */

import {RuntimeServiceHandler} from '../../node/runtime-service-handler.js';
import {LoggingService} from '../../logging/logging-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {SUBSYSTEM} from '../../constants/index.js';

const LOG_MSG = Object.freeze({
  CREATING: 'Creating RuntimeServiceHandler',
  CREATED: 'RuntimeServiceHandler created and registered',
});

const RUNTIME_SERVICE_HANDLER_SETUP_NAME =
  'RuntimeServiceHandlerSetup';

const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  CDC_INTEGRATION_SERVICE_REQUIRED: 'cdcIntegrationService',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  SERVICE_LIFECYCLE_MANAGER_REQUIRED: 'serviceLifecycleManager',
});

class RuntimeServiceHandlerSetup {
  /**
   * Create and configure runtime service handler.
   *
   * @param {Object} options
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Object} options.cdcIntegrationService - CDC service (required).
   * @param {Object} options.systemTableCache - Cache (required).
   * @param {Object} options.serviceLifecycleManager - Lifecycle
   *   manager (required).
   * @param {Object} [options.rpcClient] - Optional RPC client.
   * @param {Object} [options.executorOutcomeEmitter] - Optional executor
   *   outcome emitter shared with the rebalance coordinator.
   * @return {Object} Object containing runtimeServiceHandler.
   * @throws {DependencyError} If required dependencies missing.
   */
  static create(options) {
    const {
      nodeId,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      serviceLifecycleManager,
      rpcClient,
      executorOutcomeEmitter,
    } = options;

    if (!nodeId) {
      throw new DependencyError(
        RUNTIME_SERVICE_HANDLER_SETUP_NAME, ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!messageRouter) {
      throw new DependencyError(
        RUNTIME_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        RUNTIME_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED,
      );
    }
    if (!systemTableCache) {
      throw new DependencyError(
        RUNTIME_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
      );
    }
    if (!serviceLifecycleManager) {
      throw new DependencyError(
        RUNTIME_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.SERVICE_LIFECYCLE_MANAGER_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        SUBSYSTEM.RUNTIME_SERVICE_HANDLER_SETUP,
      ) : console;

    logger.info(LOG_MSG.CREATING, {nodeId});

    const runtimeServiceHandler = new RuntimeServiceHandler({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      serviceLifecycleManager,
      executorOutcomeEmitter,
    });

    runtimeServiceHandler.initialize();

    runtimeServiceHandler.registerWithRouter(messageRouter, {
      rpcClient,
    });

    logger.info(LOG_MSG.CREATED, {nodeId});

    return {runtimeServiceHandler};
  }
}

export {RuntimeServiceHandlerSetup};
