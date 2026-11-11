/**
 * Owner contract:
 * Owner: what the group says about a replica being removed that has no
 * consensus port of its own to read (a removal resumed after a restart):
 * the group's committed configuration as its leader answers it, through the
 * creation owner's committed-membership read (READ_COMMITTED_MEMBERSHIP,
 * committed-membership-bootstrap-read.js: only a leader answers COMMITTED,
 * one NOT_LEADER redirect) - never a row (2026-11-11).
 * Inputs: the replica and its partition; the partition's other services
 * rows only to route the question to their nodes.
 * Canonical output: GROUP_REMOVAL_VERDICT - REMOVED (the leader's committed
 * configuration names it nowhere: its removal applied), STILL_MEMBER (it is
 * a voter or learner there), UNANSWERED (no node answered as leader).
 * Prohibited: concluding from a row, from silence, or from elapsed time.
 */
import {readCommittedMembershipStamp} from
  '../rebalancer/committed-membership-bootstrap-read.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const GROUP_REMOVAL_VERDICT = Object.freeze({
  REMOVED: 'group_committed_removal',
  STILL_MEMBER: 'group_still_member',
  UNANSWERED: 'group_unanswered',
});
const FUNCTION_TYPE = 'function';

// The nodes hosting the partition's other replicas (routing only).
function peerNodeIdsOf(handler, partitionId, replicaId) {
  const rows = handler.systemTableCache?.getAll?.(SYSTEM_TABLE_NAME.SERVICES) ||
    [];
  const nodeIds = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.partition_id === partitionId &&
        (row.service_id || row.replica_id) !== replicaId &&
        typeof row.node_id === 'string' && row.node_id.length > 0 &&
        row.node_id !== handler.nodeId) {
      nodeIds.add(row.node_id);
    }
  }
  return [...nodeIds];
}

function stampNames(stamp, replicaId) {
  const peerIds = [...(stamp.voters || []), ...(stamp.votersOutgoing || []),
    ...(stamp.learners || []), ...(stamp.learnersNext || [])];
  return peerIds.some((peerId) => stamp.identities?.[peerId] === replicaId);
}

/**
 * Ask the group whether this replica's removal applied.
 * @param {Object} handler - The ReplicaHandler (messageRouter, nodeId,
 *   systemTableCache).
 * @param {Object} request - {partitionId, replicaId}.
 * @return {Promise<string>} A GROUP_REMOVAL_VERDICT.
 */
async function readGroupVerdictOnOwnRemoval(handler, {partitionId, replicaId}) {
  if (typeof handler.messageRouter?.deliver !== FUNCTION_TYPE) {
    return GROUP_REMOVAL_VERDICT.UNANSWERED;
  }
  for (const nodeId of peerNodeIdsOf(handler, partitionId, replicaId)) {
    let stamp = null;
    try {
      stamp = await readCommittedMembershipStamp(handler, partitionId,
        {firstNodeId: nodeId});
    } catch (_error) {
      continue;
    }
    return stampNames(stamp, replicaId) ? GROUP_REMOVAL_VERDICT.STILL_MEMBER :
      GROUP_REMOVAL_VERDICT.REMOVED;
  }
  return GROUP_REMOVAL_VERDICT.UNANSWERED;
}

export {GROUP_REMOVAL_VERDICT, readGroupVerdictOnOwnRemoval};
