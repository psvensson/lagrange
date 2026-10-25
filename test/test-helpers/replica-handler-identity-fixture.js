/**
 * Test-layer fixtures for the replica transport-handler identity contract
 * (owner decision N2): a durable ACTIVE is written only while the replica's
 * exact transport handler is registered, retired through the lifecycle owner
 * that runs the activation, and handler removal is exact-identity only.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';

/**
 * The exact-identity handler API over a handler map, for in-process transport
 * fixtures: identity lookup and exact removal, never removal by address.
 * @param {Map<string, Function>} handlers - The fixture's handler registry.
 * @return {Object} {getRegisteredHandler, unregisterExact}.
 */
function handlerIdentityApi(handlers) {
  return {
    getRegisteredHandler(address) {
      return handlers.get(address) || null;
    },
    unregisterExact(address, handler) {
      if (handlers.get(address) !== handler) return false;
      handlers.delete(address);
      return true;
    },
  };
}

/**
 * The handler registry of a delivery-decorating transport double, forwarded
 * to the transport it wraps: registration and the exact-identity API, so a
 * double that only reshapes `deliver` still consumes the owner's identity
 * contract instead of restating it (and never removes by address).
 * @param {Object} inner - The wrapped transport (register,
 *   getRegisteredHandler, unregisterExact).
 * @return {Object} {register, getRegisteredHandler, unregisterExact}.
 */
function forwardHandlerRegistry(inner) {
  return {
    register: (address, handler) => inner.register(address, handler),
    getRegisteredHandler: (address) => inner.getRegisteredHandler(address),
    unregisterExact: (address, handler) =>
      inner.unregisterExact(address, handler),
  };
}

/**
 * A minimal in-memory transport with the identity API.
 * @return {Object}
 */
function createIdentityTransport() {
  const handlers = new Map();
  return {
    handlers,
    register(address, handler) {
      handlers.set(address, handler);
    },
    isRegistered(address) {
      return handlers.has(address);
    },
    ...handlerIdentityApi(handlers),
  };
}

/**
 * An in-process routing transport for multi-replica property tests: delivers
 * to the registered handler and resolves the transport owner's delivery
 * envelope (the handler's answer when delivered, a no-handler failure
 * otherwise), and exposes the identity API.
 * @return {Object}
 */
function createInProcessMockTransport() {
  const transport = createIdentityTransport();
  transport.deliver = async (address, message) => {
    const handler = transport.handlers.get(address);
    if (handler) {
      return buildDeliveryEnvelope({acknowledged: true},
        await handler({payload: message}));
    }
    return buildDeliveryEnvelope({acknowledged: false, noHandler: true,
      error: 'No handler'});
  };
  return transport;
}

/**
 * Give a mock replica runtime a registered exact transport handler, retired
 * through the lifecycle owner the executor passed (createPartitionService
 * options.resolveHandlerRetirementLane).
 * @param {Object} service - The mock runtime (needs replicaId).
 * @param {Object} [options] - createPartitionService options.
 * @return {Object} The same service.
 */
function bindRegisteredReplicaHandler(service, options = {}) {
  const transport = createIdentityTransport();
  const unifiedAddress = `${options.nodeId || 'node'}/partition/` +
    `${service.replicaId}`;
  const transportHandler = () => ({acknowledged: true});
  transport.register(unifiedAddress, transportHandler);
  return Object.assign(service, {
    transport,
    unifiedAddress,
    transportHandler,
    resolveHandlerRetirementLane:
      options.resolveHandlerRetirementLane || null,
  });
}

/**
 * Model a lifecycle-state-machine test whose replicas' exact handlers are
 * registered: every transition carries an exact-handler check that holds.
 * @param {Object} stateMachine - A ReplicaStateMachine.
 * @return {Object} The same state machine.
 */
function withRegisteredActivationHandler(stateMachine) {
  const transition = stateMachine.transition.bind(stateMachine);
  stateMachine.transition = (replicaId, newState, context = {}) =>
    transition(replicaId, newState,
      {isEffectHandlerCurrent: () => true, ...context});
  return stateMachine;
}

export {
  bindRegisteredReplicaHandler,
  createIdentityTransport,
  createInProcessMockTransport,
  forwardHandlerRegistry,
  handlerIdentityApi,
  withRegisteredActivationHandler,
};
