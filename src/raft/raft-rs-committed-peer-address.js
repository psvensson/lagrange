// The one address of a configured raft peer: its unified address on the node
// its admission committed (an admission or managed membership context, a
// founding or joining stamp, a snapshot image; raft-rs-peer-identity.js
// records it at apply). The raft-rs port hands each peer's committed node to
// the host's resolver; the host binds this with its own entity type. Nothing
// here reads a row, a hint list or a cache. A peer without a committed node
// refuses typed (peer_not_in_configuration), recorded as that peer's own
// delivery outcome by the port.

import {AddressManager} from '../address/address-manager.js';
import {RAFT_RS_PEER_ADDRESS_REFUSAL} from './raft-rs-peer-identity-constants.js';

/**
 * @param {string} entityType - The host's unified-address entity type.
 * @param {string} replicaIdentity - The peer replica.
 * @param {string|null} committedNodeId - Its committed node, or null.
 * @return {string} The peer's unified address.
 * @throws {Error} PEER_NOT_IN_CONFIGURATION without a committed node.
 */
function committedPeerAddress(entityType, replicaIdentity, committedNodeId) {
  if (typeof committedNodeId !== 'string' || committedNodeId.length === 0) {
    throw Object.assign(
      new Error(RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION),
      {replicaIdentity});
  }
  return AddressManager.getInstance().format(
    committedNodeId, entityType, replicaIdentity);
}

/**
 * The node each founder is placed on, read from the founding placement's
 * unified addresses: the GENESIS stamp commits it.
 * @param {Array<string>} replicaIds - The founding replica identities.
 * @param {Array<string>} addresses - The founding placement's addresses.
 * @return {Object} {replicaIdentity: nodeId} for every placed founder.
 */
function founderNodeIdsOfPlacement(replicaIds, addresses) {
  const addressManager = AddressManager.getInstance();
  const founderNodeIds = {};
  for (const address of addresses) {
    const parsed = addressManager.parse(address);
    if (replicaIds.includes(parsed.serviceId)) {
      founderNodeIds[parsed.serviceId] = parsed.nodeId;
    }
  }
  return founderNodeIds;
}

export {committedPeerAddress, founderNodeIdsOfPlacement};
