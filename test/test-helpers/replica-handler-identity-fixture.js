/**
 * Test-layer fixtures for the replica transport-handler identity contract
 * (owner decision N2): a durable ACTIVE is written only while the replica's
 * exact transport handler is registered, retired through the lifecycle owner
 * that runs the activation, and handler removal is exact-identity only.
 */

import assert from 'node:assert/strict';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {PARTICIPANT_CUTOVER_OUTCOME, PARTICIPANT_RELEASE_ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_TRIGGER, PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

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

// For fixtures whose partition factory cannot perform a native transaction
// cutover, supply that external effect at the registered responder. Exercise
// actual route selection, accepted delivery, and result decoding. Native
// release witnesses use the production responder without this decorator.
function registerCompletedFreshCreateReleaseFixture(handler,
  {transport = createInProcessMockTransport(), rpcClient} = {}) {
  const handleMessage = handler.handleMessage.bind(handler);
  handler.handleMessage = (envelope) => {
    const request = envelope.payload;
    if (request?.type !== PARTICIPANT_RELEASE_TYPE ||
        request.action !== PARTICIPANT_RELEASE_ACTION.RELEASE ||
        request.trigger !== PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE) {
      return handleMessage(envelope);
    }
    const identity = request.createAdmissionIdentity;
    const service = handler.getTrackedService(identity.replicaId);
    assert.ok(service, 'fresh release reached the handler of the materialized service');
    assert.equal(identity.targetNodeId, handler.nodeId);
    assert.equal(request.partitionId, service.partitionId);
    assert.equal(identity.operationId, service.createAdmissionOperationId);
    assert.equal(identity.admissionToken, service.createAdmissionToken);
    assert.equal(identity.attemptToken, service.createAttemptToken);
    return {[PARTICIPANT_RELEASE_RESULT_FIELD]: {outcome: PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER}};
  };
  handler.registerWithRouter(transport, {rpcClient});
  return transport;
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
  const transportHandler = () => (null);
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
  registerCompletedFreshCreateReleaseFixture,
  createIdentityTransport,
  createInProcessMockTransport,
  forwardHandlerRegistry,
  handlerIdentityApi,
  withRegisteredActivationHandler,
};
