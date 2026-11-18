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
 * a voter or learner there), UNANSWERED (every node asked answered the read's
 * typed refusal: none answered as leader).
 * Required collaborators: the handler's message router (the question's only
 * transport; a handler without one cannot ask and fails loudly, never
 * reading its own wiring gap as a group that did not answer) and its
 * system-table cache (routing only).
 * Prohibited: concluding from a row, from silence, or from elapsed time; an
 * error other than the read's typed refusal read as UNANSWERED.
 */
import {readCommittedMembershipStamp} from
  '../rebalancer/committed-membership-bootstrap-read.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../raft/raft-committed-membership-constants.js';

const GROUP_REMOVAL_VERDICT = Object.freeze({
  REMOVED: 'group_committed_removal',
  STILL_MEMBER: 'group_still_member',
  UNANSWERED: 'group_unanswered',
});
// The committed-membership read's typed refusals (committedMembershipReadRefused
// sets code to one of them): the only errors that mean "not answered here".
const COMMITTED_MEMBERSHIP_REFUSAL_CODES = Object.freeze(new Set(
  Object.values(COMMITTED_MEMBERSHIP_REFUSAL)));
const GROUP_VERDICT_ERROR = Object.freeze({
  noMessageRouter: (replicaId) => `Replica ${replicaId} removal cannot ` +
    'ask its group: the replica handler has no message router',
});

// The nodes hosting the partition's other replicas (routing only). A
// services row's identity is its primary key, service_id (the replica id
// every lifecycle read of the handler keys by).
function peerNodeIdsOf(handler, partitionId, replicaId) {
  const rows = handler.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES,
    (row) => row.partition_id === partitionId &&
      row.service_id !== replicaId &&
      typeof row.node_id === 'string' && row.node_id.length > 0 &&
      row.node_id !== handler.nodeId);
  return [...new Set(rows.map((row) => row.node_id))];
}

// Whether the leader's COMMITTED stamp (readCommittedMembershipStamp's
// validated record: every peer list and the identities always present)
// names the replica in any role.
function stampNames(stamp, replicaId) {
  const peerIds = [...stamp.voters, ...stamp.votersOutgoing,
    ...stamp.learners, ...stamp.learnersNext];
  return peerIds.some((peerId) => stamp.identities[peerId] === replicaId);
}

/**
 * Ask the group whether this replica's removal applied.
 * @param {Object} handler - The ReplicaHandler (messageRouter, nodeId,
 *   systemTableCache).
 * @param {Object} request - {partitionId, replicaId}.
 * @return {Promise<string>} A GROUP_REMOVAL_VERDICT.
 * @throws {Error} Without a message router, or on any error other than the
 *   read's typed refusal.
 */
async function readGroupVerdictOnOwnRemoval(handler, {partitionId, replicaId}) {
  if (!handler.messageRouter) {
    throw new Error(GROUP_VERDICT_ERROR.noMessageRouter(replicaId));
  }
  for (const nodeId of peerNodeIdsOf(handler, partitionId, replicaId)) {
    let stamp = null;
    try {
      stamp = await readCommittedMembershipStamp(handler, partitionId,
        {firstNodeId: nodeId});
    } catch (error) {
      if (!COMMITTED_MEMBERSHIP_REFUSAL_CODES.has(error.code)) {
        throw error;
      }
      continue;
    }
    return stampNames(stamp, replicaId) ? GROUP_REMOVAL_VERDICT.STILL_MEMBER :
      GROUP_REMOVAL_VERDICT.REMOVED;
  }
  return GROUP_REMOVAL_VERDICT.UNANSWERED;
}

export {GROUP_REMOVAL_VERDICT, readGroupVerdictOnOwnRemoval};
