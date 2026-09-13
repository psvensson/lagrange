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
import {ServiceEndpointsOwner} from
  '../../control-plane/owners/service-endpoints-owner.js';
import {
  wireRuntimeEndpointPublication,
} from '../../runtime/runtime-endpoint-publication-wiring.js';

const LOG_MSG = Object.freeze({
  CREATING: 'Creating RuntimeServiceHandler',
  CREATED: 'RuntimeServiceHandler created and registered',
  ENDPOINT_PUBLICATION_WIRED:
    'Runtime endpoint publication wired to the canonical endpoint owner',
  ENDPOINT_PUBLICATION_NOT_OWNED:
    'Runtime invocation owner publishes no endpoints; ' +
    'endpoint publication wiring not applicable',
});

const RUNTIME_SERVICE_HANDLER_SETUP_NAME =
  'RuntimeServiceHandlerSetup';

const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  CDC_INTEGRATION_SERVICE_REQUIRED: 'cdcIntegrationService',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  SERVICE_LIFECYCLE_MANAGER_REQUIRED: 'serviceLifecycleManager',
  SERVICE_ENDPOINTS_OWNER_REQUIRED:
    'serviceEndpointsOwner (systemMetadataOwners.serviceEndpointsOwner ' +
    'from ControlPlaneSetup.create) when serviceRuntimeLifecycle publishes ' +
    'endpoints',
});

/**
 * Decide whether the supplied runtime owner publishes endpoints at all.
 * ServiceRuntimeLifecycle exposes the endpoint writer/remover registration
 * contract; a plain runtime invocation owner (health/invoke only) never
 * returns endpoint intents, so there is nothing to wire for it.
 * @param {Object|null|undefined} serviceRuntimeLifecycle
 * @return {boolean}
 */
function ownsRuntimeEndpointPublication(serviceRuntimeLifecycle) {
  return Boolean(serviceRuntimeLifecycle) &&
    typeof serviceRuntimeLifecycle.setEndpointWriter === 'function' &&
    typeof serviceRuntimeLifecycle.setEndpointRemover === 'function';
}

/**
 * Resolve the canonical endpoint-metadata owner the runtime lifecycle
 * publishes through. Both startup paths (seed workflow and joiner) receive
 * it from ControlPlaneSetup.create() as
 * systemMetadataOwners.serviceEndpointsOwner and hand it here explicitly;
 * this setup never reads the control-plane gateway registry, which is an
 * admin-side seam. A missing owner is a startup ordering defect and is
 * refused explicitly: silently skipping the wiring would leave every
 * runtime replica ACTIVE with no published endpoint.
 * @param {Object} options
 * @return {ServiceEndpointsOwner}
 * @throws {DependencyError} When the owner is absent.
 */
function resolveServiceEndpointsOwner(options) {
  if (options.serviceEndpointsOwner instanceof ServiceEndpointsOwner) {
    return options.serviceEndpointsOwner;
  }
  throw new DependencyError(
    RUNTIME_SERVICE_HANDLER_SETUP_NAME,
    ERROR_MSG.SERVICE_ENDPOINTS_OWNER_REQUIRED,
  );
}

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
   * @param {Object} [options.serviceRuntimeLifecycle] - Runtime invocation
   *   owner.
   * @param {Object} [options.serviceEndpointsOwner] - Canonical endpoint
   *   metadata owner (systemMetadataOwners.serviceEndpointsOwner). Required
   *   when serviceRuntimeLifecycle publishes endpoints.
   * @param {Object} [options.callBindingRouteResolver] - Call Binding route
   *   resolver shared with the call-cell ingress; the handler self-defaults
   *   a cache-provider-backed resolver when absent.
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
      serviceRuntimeLifecycle,
      callBindingRouteResolver,
      partitionServicesProvider,
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

    if (ownsRuntimeEndpointPublication(serviceRuntimeLifecycle)) {
      wireRuntimeEndpointPublication({
        nodeId,
        serviceEndpointsOwner: resolveServiceEndpointsOwner(options),
        serviceRuntimeLifecycle,
        systemTableCache,
      });
      logger.info(LOG_MSG.ENDPOINT_PUBLICATION_WIRED, {nodeId});
    } else if (serviceRuntimeLifecycle) {
      logger.info(LOG_MSG.ENDPOINT_PUBLICATION_NOT_OWNED, {nodeId});
    }

    const runtimeServiceHandler = new RuntimeServiceHandler({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      serviceLifecycleManager,
      serviceRuntimeLifecycle,
      callBindingRouteResolver,
      partitionServicesProvider,
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
