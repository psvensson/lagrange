import {PgWireStartupSafetyGate} from '../pgwire-startup-safety-gate.js';
import {RuntimeServiceHandlerSetup} from './runtime-service-handler-setup.js';

/**
 * Initialize a node's RuntimeServiceHandler behind the PG wire safety gate,
 * the one way the seed and every joiner do it. The gate ensures
 * control-plane readiness before runtime-service replica operations; a
 * startup failure is isolated so bootstrap or join still completes. Runtime
 * endpoints are published at the node's exact boot incarnation.
 * @param {Object} service - BootstrapService or NodeJoiningService.
 * @param {Object} systemTableCache
 */
function initializeGuardedRuntimeServiceHandler(service, systemTableCache) {
  const gate = new PgWireStartupSafetyGate({
    nodeId: service.nodeId,
    serviceLifecycleManager: service.serviceLifecycleManager,
    systemTableCache,
    heartbeatService: service.heartbeatService,
  });
  const result = gate.guardedSetup(() => RuntimeServiceHandlerSetup.create({
    bootIncarnation: service.bootIncarnation,
    nodeId: service.nodeId,
    messageRouter: service.messageRouter,
    cdcIntegrationService: service.cdcIntegrationService,
    systemTableCache,
    serviceLifecycleManager: service.serviceLifecycleManager,
    serviceRuntimeLifecycle: service.serviceRuntimeLifecycle,
    serviceEndpointsOwner:
      service.systemMetadataOwners?.serviceEndpointsOwner,
    rpcClient: service.rpcClient,
    executorOutcomeEmitter:
      service.rebalanceCoordinator?.executorOutcomeEmitter,
  }));
  if (result) {
    service.runtimeServiceHandler = result.runtimeServiceHandler;
  }
  service.attachRuntimeServiceRebalancerOwner();
}

export {initializeGuardedRuntimeServiceHandler};
