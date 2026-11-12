/**
 * Owner contract:
 * Owner: whether a claimed failed-create cleanup retires its replica's whole
 * group because the replica is the group's sole founder (2026-11-11). A
 * founder that founded its group alone, whose create then failed, has no
 * consensus port (its runtime was fenced and closed) and no peer: no leader
 * exists to commit its RemoveNode or to answer for the group, and the last
 * voter of a group is never removed by a conf change (REMOVES_LAST_VOTER).
 * Its removal is the end of a group that never completed its creation.
 * This is a group retirement decided from two positive durable facts, both
 * required, never from an absence or a silence:
 *  - the claim (replica-failed-create-removal-claim.js, the one predicate
 *    the REMOVE's admission uses): the replica's authoritative services row
 *    is REMOVING out of FAILED under this removal's own failed-create remove
 *    token, for the FAILED row the cleanup was decided on - or, for the
 *    node's REMOVING re-drive (no operation), under the failed-create remove
 *    token that row still holds;
 *  - the replica's own durable record (raft-rs-durable-own-group-record.js):
 *    its applied configuration names it as the only member, and it holds no
 *    history (nothing was ever proposed in it).
 * Inputs: the removal's execution request ({operationId, partitionId,
 * replicaId, failedCreatePrecondition}); the state machine's authoritative
 * lifecycle read; the raft lifecycle administration's own-group-record read.
 * Canonical output: a frozen {state, membership, history, cause}
 * (SOLE_FOUNDER_RETIREMENT; membership, history and cause are the record's,
 * null when the record was not read; cause is why it was unreadable):
 *   RETIRES_GROUP      both facts hold: the cleanup may proceed;
 *   NOT_CLAIMED        the row is not this removal's failed-create claim (an
 *                      ordinary REMOVE never retires a last voter: only its
 *                      group, or a group retirement, removes it);
 *   CLAIM_UNAVAILABLE  the authoritative row could not be read;
 *   NOT_SOLE_FOUNDER   the durable record names another member, holds
 *                      history, or holds no configuration or lifecycle row;
 *   RECORD_UNREADABLE  the replica's database could not be read.
 * Every state but RETIRES_GROUP retires nothing.
 * Prohibited: a retirement from a services row of another replica, from a
 * missing row, from an unreadable file, or from elapsed time.
 */
import {raftRsLifecycleAdministration} from
  '../raft/raft-rs-lifecycle-administration.js';
import {
  DURABLE_OWN_HISTORY,
  DURABLE_OWN_MEMBERSHIP,
} from '../raft/raft-rs-durable-own-group-record.js';
import {buildFailedCreateRemoveToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {
  isRowOwnedFailedCreateRemoval,
  matchesClaimedFailedCreateRemoval,
} from './replica-failed-create-removal-claim.js';

const SOLE_FOUNDER_RETIREMENT = Object.freeze({
  RETIRES_GROUP: 'sole_founder_failed_create_retires_group',
  NOT_CLAIMED: 'sole_founder_not_failed_create_claim',
  CLAIM_UNAVAILABLE: 'sole_founder_claim_unavailable',
  NOT_SOLE_FOUNDER: 'sole_founder_record_not_sole_founder',
  RECORD_UNREADABLE: 'sole_founder_record_unreadable',
});
const STATE = SOLE_FOUNDER_RETIREMENT;

function decision(state, record = null) {
  return Object.freeze({state, membership: record?.membership ?? null,
    history: record?.history ?? null, cause: record?.cause ?? null});
}

function stateOfRecord(record) {
  if (record.membership === DURABLE_OWN_MEMBERSHIP.UNREADABLE) {
    return STATE.RECORD_UNREADABLE;
  }
  return record.membership === DURABLE_OWN_MEMBERSHIP.SOLE_MEMBER &&
    record.history === DURABLE_OWN_HISTORY.EMPTY ?
    STATE.RETIRES_GROUP : STATE.NOT_SOLE_FOUNDER;
}

// The claim, by who drives the removal: a REMOVE operation owns its token
// and precondition; the REMOVING re-drive (no operation) reads the claim its
// durable row holds (replica-failed-create-removal-claim.js).
function isOwnFailedCreateClaim(handler, request, row) {
  if (request.operationId === null) {
    return isRowOwnedFailedCreateRemoval(row, {replicaId: request.replicaId,
      partitionId: request.partitionId, nodeId: handler.nodeId});
  }
  return matchesClaimedFailedCreateRemoval(row,
    request.failedCreatePrecondition,
    buildFailedCreateRemoveToken(request.operationId));
}

/**
 * Decide whether this removal retires its replica's group as its sole
 * founder's failed create.
 * @param {Object} handler - The ReplicaHandler (replicaStateMachine,
 *   getPartitionDbPath, nodeId).
 * @param {Object} request - {operationId, partitionId, replicaId,
 *   failedCreatePrecondition}.
 * @return {Promise<Object>} Frozen {state, membership, history, cause}.
 */
async function decideSoleFounderRetirement(handler, request) {
  const observation = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(request.replicaId);
  if (observation?.available !== true) {
    return decision(STATE.CLAIM_UNAVAILABLE);
  }
  if (!isOwnFailedCreateClaim(handler, request, observation.row)) {
    return decision(STATE.NOT_CLAIMED);
  }
  const record = raftRsLifecycleAdministration.readReplicaOwnGroupRecord(
    handler.getPartitionDbPath(request.partitionId, request.replicaId),
    request.partitionId, request.replicaId);
  return decision(stateOfRecord(record), record);
}

export {SOLE_FOUNDER_RETIREMENT, decideSoleFounderRetirement};
