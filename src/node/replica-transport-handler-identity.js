// A replica's transport handler is bound to its exact registration identity
// (owner decision N2): activation proves the handler it registered is the one
// at the address, and retirement removes only that handler, against the
// activation effect boundary of the replica's lifecycle owner.

const TYPEOF_FUNCTION = 'function';

/**
 * Whether the exact handler (identity, not presence) is registered at the
 * address: a successor generation's handler never satisfies it. A router
 * without the identity API answers presence.
 * @param {Object} messageRouter
 * @param {string} address
 * @param {Function|null} handler - The handler the replica registered.
 * @return {boolean}
 */
function isExactReplicaHandlerRegistered(messageRouter, address, handler) {
  if (typeof messageRouter.getRegisteredHandler !== TYPEOF_FUNCTION) {
    return messageRouter.isRegistered(address);
  }
  return Boolean(handler) &&
    messageRouter.getRegisteredHandler(address) === handler;
}

/**
 * Retire a replica's exact transport handler through its lifecycle owner: an
 * activation that confirmed the handler completes its ACTIVE CAS first; a
 * later one finds it gone. A successor's handler is never removed.
 * @param {Object} retirement - {transport, address, handler, replicaId, lane}.
 * @return {Promise<void>}
 */
async function retireReplicaTransportHandler(retirement) {
  const {transport, address, handler, replicaId, lane} = retirement;
  if (!transport) return;
  const retire = () => {
    if (typeof transport.unregisterExact === TYPEOF_FUNCTION && handler) {
      transport.unregisterExact(address, handler);
    } else {
      transport.unregister(address);
    }
  };
  if (typeof lane?.retireReplicaHandler === TYPEOF_FUNCTION && replicaId) {
    await lane.retireReplicaHandler(replicaId, retire);
    return;
  }
  retire();
}

export {
  isExactReplicaHandlerRegistered,
  retireReplicaTransportHandler,
};
