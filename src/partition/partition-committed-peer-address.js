// The one address of a partition peer: its unified address on the node its
// admission committed (the admission context, a founding or joining stamp, a
// snapshot image; raft-rs-peer-identity.js records it). The raft-rs port
// hands each peer's committed node to this resolver; nothing here reads a
// row, a hint list or a cache. A peer without a committed node refuses
// typed (peer_not_in_configuration), recorded as that peer's own delivery
// outcome by the port.

import {AddressManager} from '../address/address-manager.js';
import {ENTITY_TYPE} from '../constants/index.js';
import {RAFT_RS_PEER_ADDRESS_REFUSAL} from
  '../raft/raft-rs-peer-identity-constants.js';

/**
 * @param {string} replicaIdentity - The peer replica.
 * @param {string|null} committedNodeId - Its committed node, or null.
 * @return {string} The peer's unified address.
 * @throws {Error} PEER_NOT_IN_CONFIGURATION without a committed node.
 */
function committedPartitionPeerAddress(replicaIdentity, committedNodeId) {
  if (typeof committedNodeId !== 'string' || committedNodeId.length === 0) {
    throw Object.assign(
      new Error(RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION),
      {replicaIdentity});
  }
  return AddressManager.getInstance().format(
    committedNodeId, ENTITY_TYPE.PARTITION, replicaIdentity);
}

export {committedPartitionPeerAddress};
