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
 *  - the claim: the replica's authoritative services row is REMOVING out of
 *    FAILED under this removal's own failed-create remove token (the
 *    lifecycle owner's exact-generation FAILED -> REMOVING transition);
 *  - the replica's own durable record (its database file): its applied
 *    configuration names it as the only member with no configuration change
 *    waiting, and it holds no history (nothing was ever proposed in it).
 * Inputs: the removal request; the state machine's authoritative lifecycle
 * read; the raft lifecycle administration's own-group-record read.
 * Canonical output: a frozen {state, membership, history}
 * (SOLE_FOUNDER_RETIREMENT):
 *   RETIRES_GROUP      both facts hold: the cleanup may proceed;
 *   NOT_CLAIMED        the row is not this removal's failed-create claim (an
 *                      ordinary REMOVE never retires a last voter: only its
 *                      group, or a group retirement, removes it);
 *   CLAIM_UNAVAILABLE  the authoritative row could not be read;
 *   NOT_SOLE_FOUNDER   the durable record names another member, has a
 *                      configuration change waiting, holds history, or holds
 *                      no configuration or lifecycle row (membership and
 *                      history say which);
 * A database that cannot be read is no state of the record: the decision
 * throws the removal's typed retryable deferral
 * (REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED, reason SOLE_FOUNDER_RECORD_UNREADABLE, the
 * read's own error its cause). Every state but RETIRES_GROUP retires nothing.
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
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED,
  retryableRemovalDebtError,
} from './replica-removal-debt-errors.js';

const SOLE_FOUNDER_RETIREMENT = Object.freeze({
  RETIRES_GROUP: 'sole_founder_failed_create_retires_group',
  NOT_CLAIMED: 'sole_founder_not_failed_create_claim',
  CLAIM_UNAVAILABLE: 'sole_founder_claim_unavailable',
  NOT_SOLE_FOUNDER: 'sole_founder_record_not_sole_founder',
});
const STATE = SOLE_FOUNDER_RETIREMENT;
const SOLE_FOUNDER_RECORD_UNREADABLE = 'sole_founder_record_unreadable';

function decision(state, record = null) {
  return Object.freeze({state, membership: record?.membership ?? null,
    history: record?.history ?? null});
}

// Whether the authoritative row is this removal's failed-create claim.
function isOwnFailedCreateClaim(row, request) {
  const token = buildFailedCreateRemoveToken(request.operationId);
  return token !== null && row?.status === ReplicaStatus.REMOVING &&
    row.previous_state === ReplicaStatus.FAILED &&
    row.cleanup_token === token && row.node_id === request.nodeId;
}

function readOwnGroupRecord(handler, request) {
  try {
    return raftRsLifecycleAdministration.readReplicaOwnGroupRecord(
      handler.getPartitionDbPath(request.partitionId, request.replicaId),
      request.partitionId, request.replicaId);
  } catch (cause) {
    throw Object.assign(retryableRemovalDebtError(
      REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED,
      `Replica ${request.replicaId} own durable record cannot be read ` +
        `(${SOLE_FOUNDER_RECORD_UNREADABLE}); nothing retired`),
    {cause, reason: SOLE_FOUNDER_RECORD_UNREADABLE});
  }
}

/**
 * Decide whether this removal retires its replica's group as its sole
 * founder's failed create.
 * @param {Object} handler - The ReplicaHandler (replicaStateMachine,
 *   getPartitionDbPath, nodeId).
 * @param {Object} request - {operationId, partitionId, replicaId}.
 * @return {Promise<Object>} Frozen {state, membership, history}.
 * @throws {Error} The typed deferral when the replica's record is unreadable.
 */
async function decideSoleFounderRetirement(handler, request) {
  const observation = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(request.replicaId);
  if (observation?.available !== true) {
    return decision(STATE.CLAIM_UNAVAILABLE);
  }
  if (!isOwnFailedCreateClaim(observation.row,
    {operationId: request.operationId, nodeId: handler.nodeId})) {
    return decision(STATE.NOT_CLAIMED);
  }
  const record = readOwnGroupRecord(handler, request);
  return decision(
    record.membership === DURABLE_OWN_MEMBERSHIP.SOLE_MEMBER &&
      record.history === DURABLE_OWN_HISTORY.EMPTY ?
      STATE.RETIRES_GROUP : STATE.NOT_SOLE_FOUNDER, record);
}

export {
  SOLE_FOUNDER_RETIREMENT,
  decideSoleFounderRetirement,
};
