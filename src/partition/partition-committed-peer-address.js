// The partition's binding of the one committed peer address
// (raft-rs-committed-peer-address.js): the raft-rs port hands each peer's
// committed node to this resolver; nothing here reads a row, a hint list or
// a cache. A peer without a committed node refuses typed
// (peer_not_in_configuration).

import {ENTITY_TYPE} from '../constants/index.js';
import {committedPeerAddress} from '../raft/raft-rs-committed-peer-address.js';

/**
 * @param {string} replicaIdentity - The peer replica.
 * @param {string|null} committedNodeId - Its committed node, or null.
 * @return {string} The peer's unified address.
 * @throws {Error} PEER_NOT_IN_CONFIGURATION without a committed node.
 */
function committedPartitionPeerAddress(replicaIdentity, committedNodeId) {
  return committedPeerAddress(ENTITY_TYPE.PARTITION, replicaIdentity,
    committedNodeId);
}

export {committedPartitionPeerAddress};
