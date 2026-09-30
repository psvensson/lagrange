import {retireReplicaTransportHandler} from
  '../../node/replica-transport-handler-identity.js';
import {ADDRESS, ENTITY_TYPE} from '../../constants/index.js';

// A local message-group replica's transport handler (owner decision N2, class
// repair 2026-09-29g). Registration records the exact handler identity and
// the replica's lifecycle owner on the service; every removal goes through
// retireMessageGroupTransportHandler, which is exact-identity and waits only
// on an open activation effect section of that owner.

/**
 * Register the replica's transport handler and record its exact identity.
 * @param {Object} messageGroup - The MessageGroupService.
 * @param {Object} registration - {messageRouter, address, resolveLane,
 *   onEnvelope}. `resolveLane` returns the node's ReplicaStateMachine (lazy:
 *   it may not exist yet when the replica is created).
 * @return {Function} The registered handler.
 */
function registerMessageGroupTransportHandler(messageGroup, registration) {
  const onEnvelope = registration.onEnvelope;
  const handler = (envelope) => {
    if (onEnvelope) onEnvelope(envelope);
    return messageGroup.receiveMessage(envelope);
  };
  messageGroup.transportHandler = handler;
  messageGroup.resolveHandlerRetirementLane =
    registration.resolveLane || null;
  registration.messageRouter.register(registration.address, handler);
  return handler;
}

/**
 * Retire a local message-group replica's exact transport handler through the
 * replica's lifecycle owner.
 * @param {Object} retirement - {messageGroup, messageRouter, address,
 *   replicaId}.
 * @return {Promise<string>} A REPLICA_HANDLER_RETIREMENT_OUTCOME.
 */
function retireMessageGroupTransportHandler(retirement) {
  const messageGroup = retirement.messageGroup || null;
  return retireReplicaTransportHandler({
    transport: retirement.messageRouter,
    address: retirement.address,
    handler: messageGroup?.transportHandler || null,
    replicaId: retirement.replicaId,
    lane: messageGroup?.resolveHandlerRetirementLane?.() || null,
  });
}

/**
 * Retire every local message-group replica's exact transport handler (the
 * cleanup paths); each retirement is exact-identity through the owner.
 * @param {Object} retirement - {messageGroupServices, messageRouter, nodeId}.
 * @return {Promise<void>}
 */
async function retireMessageGroupTransportHandlers(retirement) {
  if (!retirement.messageRouter) return;
  for (const [replicaId, messageGroup] of retirement.messageGroupServices) {
    await retireMessageGroupTransportHandler({
      messageGroup,
      messageRouter: retirement.messageRouter,
      address: `${retirement.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
      replicaId,
    });
  }
}

export {
  registerMessageGroupTransportHandler,
  retireMessageGroupTransportHandler,
  retireMessageGroupTransportHandlers,
};
