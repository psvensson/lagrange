/**
 * Deterministic ID mapping for raft-logic, which expects stringified u64 IDs.
 */

import {
  buildDeterministicRaftIdMaps,
} from '../raft-id-mapper.js';
import {
  RAFT_LOGIC_SPIKE_DEFAULT,
  RAFT_LOGIC_SPIKE_ERROR,
} from './raft-logic-spike-constants.js';


/**
 * Build deterministic external<->internal ID maps for a replica set.
 * @param {Array<string>} replicaIds
 * @return {{
 *   externalToInternal: Map<string, string>,
 *   internalToExternal: Map<string, string>,
 * }}
 */
function buildRaftLogicIdMaps(replicaIds) {
  if (!Array.isArray(replicaIds) || replicaIds.length === 0) {
    throw new Error(RAFT_LOGIC_SPIKE_ERROR.INVALID_REPLICA_IDS);
  }
  return buildDeterministicRaftIdMaps(replicaIds, {
    minInternalNodeId: RAFT_LOGIC_SPIKE_DEFAULT.MIN_INTERNAL_NODE_ID,
    clusterNodeIdStep: RAFT_LOGIC_SPIKE_DEFAULT.CLUSTER_NODE_ID_STEP,
  });
}

export {buildRaftLogicIdMaps};
