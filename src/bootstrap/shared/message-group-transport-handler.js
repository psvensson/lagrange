import {
  reportReplicaHandlerRetirement,
  requireReplicaHandlerRetirement,
  retireReplicaTransportHandler,
} from '../../node/replica-transport-handler-identity.js';
import {ADDRESS, ENTITY_TYPE} from '../../constants/index.js';
import {withRaftOpeningCleanupFailure} from '../../raft/raft-operation-port.js';

const OPENING_CLEANUP_MESSAGE = 'Message group opening cleanup remains pending';
const CREATE_CLEANUP_REQUIRED_CODE = 'MESSAGE_GROUP_CREATE_CLEANUP_REQUIRED';

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
 * replica's lifecycle owner; a refused retirement (the handler is left
 * registered) is surfaced through the replica's logger, never discarded.
 * @param {Object} retirement - {messageGroup, messageRouter, address,
 *   replicaId}.
 * @return {Promise<string>} A REPLICA_HANDLER_RETIREMENT_OUTCOME.
 */
async function retireMessageGroupTransportHandler(retirement) {
  const messageGroup = retirement.messageGroup || null;
  const outcome = await retireReplicaTransportHandler({
    transport: retirement.messageRouter,
    address: retirement.address,
    handler: messageGroup?.transportHandler || null,
    replicaId: retirement.replicaId,
    lane: messageGroup?.resolveHandlerRetirementLane?.() || null,
  });
  // A refusal needs a registered handler, so the replica (and its logger)
  // exists whenever there is something to report.
  const reported = reportReplicaHandlerRetirement(messageGroup?.logger, {
    address: retirement.address,
    replicaId: retirement.replicaId,
  }, outcome);
  requireReplicaHandlerRetirement(reported);
  return reported;
}

/**
 * Initialize a registered message-group replica before publishing it. A
 * failed constructor must not abandon a registered handler merely because
 * the service has not yet been placed in its host map.
 *
 * Both cleanup operations are attempted. If either fails, the exact runtime
 * stays in the EXISTING host map as cleanup debt, not a live service. A
 * subsequent create must refuse until the normal stop owner settles it.
 * @param {Object} options - {messageGroup, messageGroupServices,
 *   messageRouter, address, replicaId}.
 * @return {Promise<void>}
 */
async function initializeRegisteredMessageGroup(options) {
  const {messageGroup, messageGroupServices, messageRouter,
    address, replicaId} = options;
  try {
    await messageGroup.initialize();
  } catch (primary) {
    const failures = [];
    try {
      await messageGroup.shutdown();
    } catch (cleanup) {
      failures.push(cleanup);
    }
    try {
      await retireMessageGroupTransportHandler({
        messageGroup, messageRouter, address, replicaId,
      });
    } catch (cleanup) {
      failures.push(cleanup);
    }
    if (failures.length > 0) {
      // Never overwrite a successor if another generation has already
      // published the same identity; that is an independent owner conflict.
      const occupied = messageGroupServices.get(replicaId);
      if (!occupied || occupied === messageGroup) {
        messageGroupServices.set(replicaId, messageGroup);
      }
      throw withRaftOpeningCleanupFailure(primary,
        new AggregateError(failures, OPENING_CLEANUP_MESSAGE));
    }
    throw primary;
  }
}

/** A pending failed creation is cleanup debt, never a successful CREATE. */
function messageGroupCreationAlreadySettled(services, replicaId) {
  const existing = services.get(replicaId);
  if (!existing) return false;
  if (existing.initialized !== true || existing.isShutdown === true) {
    const error = new Error('Message-group cleanup is still required before CREATE');
    error.code = CREATE_CLEANUP_REQUIRED_CODE;
    error.deferRetry = true;
    throw error;
  }
  return true;
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
  initializeRegisteredMessageGroup,
  messageGroupCreationAlreadySettled,
  registerMessageGroupTransportHandler,
  retireMessageGroupTransportHandler,
  retireMessageGroupTransportHandlers,
};
