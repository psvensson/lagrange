/**
 * Owner contract:
 * Owner: the REPLACE owner's completion authority (quest
 * replace-source-removal-owner, R-1a as amended by the committed-read
 * amendment, owner ruling on FINDING F1, 2026-09-26): the group's
 * leader-answered CURRENT committed configuration. The target t's own view is
 * a wake and a route, never the verdict: a lagging target shows an old
 * configuration (a source removed and since re-admitted still reads absent
 * there).
 * Inputs: the witness read (READ_REPLICA_MEMBERSHIP, the port's
 * committed-membership read with WITNESS purpose) of t - or, when t is gone
 * (failure detector FAILED, or row REMOVED; D2), of the surviving members,
 * source first; the leader each answer names; the partition's cached rows as
 * a route to that leader's node only (the answer's own leader role is the
 * check).
 * Canonical output: the leader's own answer (its replica leads in its own
 * observation), reached with at most one redirect; otherwise UNAVAILABLE
 * with a REPLACE_COMPLETION_AUTHORITY_WAIT reason. Whether the target is
 * gone.
 * Prohibited: no decision; never a row as membership; no second redirect.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  readReplaceWitnessMembership,
  replaceReplicaIdsOf,
} from './operation-workflow-replace-witness.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../partition/partition-replica-membership-constants.js';

const {OPERATION_WORKFLOW_OWNER_LITERAL, ReplicaStatus} =
  OPERATION_WORKFLOW_OWNER_SHARED;

// No target row can be observed (no identity, or no cache).
const TARGET_STATUS_UNOBSERVED = 'target_status_unobserved';

// Target rows under which t can no longer witness anything.
const TARGET_GONE_STATUSES = Object.freeze(new Set([
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVED,
]));

/**
 * The REPLACE target replica's observed lifecycle status (its row as the
 * failure detector and the lifecycle maintain it).
 * @param {Object} owner
 * @param {Object} operation
 * @return {string} The status, or TARGET_STATUS_UNOBSERVED.
 */
function observedReplaceTargetStatus(owner, operation) {
  const {targetReplicaId} = replaceReplicaIdsOf(owner, operation);
  if (!targetReplicaId ||
      typeof owner.repository?.getObservedReplicaStatusFromCache !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
    return TARGET_STATUS_UNOBSERVED;
  }
  return owner.repository.getObservedReplicaStatusFromCache(
    targetReplicaId,
    operation.partitionId,
    operation.targetNodeId,
    {allowPartitionNodeFallback: false},
  );
}

/**
 * Whether the REPLACE's target replica is gone: the failure detector marked
 * it FAILED, or its row reads REMOVED.
 * @param {Object} owner
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceTargetGone(owner, operation) {
  return TARGET_GONE_STATUSES.has(observedReplaceTargetStatus(owner, operation));
}

function survivingMembersOf(owner, operation) {
  const {sourceReplicaId, targetReplicaId} =
    replaceReplicaIdsOf(owner, operation);
  const members = [];
  const seen = new Set([targetReplicaId]);
  const add = (replicaId, nodeId) => {
    if (typeof replicaId === 'string' && replicaId.length > 0 &&
        typeof nodeId === 'string' && nodeId.length > 0 &&
        !seen.has(replicaId)) {
      seen.add(replicaId);
      members.push({replicaId, nodeId});
    }
  };
  add(sourceReplicaId, operation?.sourceNodeId);
  const rows = typeof owner.getCachedCriticalReplicaRows ===
    OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
    owner.getCachedCriticalReplicaRows(operation?.partitionId) : [];
  for (const row of Array.isArray(rows) ? rows : []) {
    add(row?.replica_id || row?.service_id, row?.node_id);
  }
  return members;
}

// Why the completion authority could not be read (the owner waits).
const REPLACE_COMPLETION_AUTHORITY_WAIT = Object.freeze({
  // No answering replica named a leader.
  LEADER_UNKNOWN: 'completion_authority_leader_unknown',
  // The named leader's node could not be routed to, or it did not answer.
  LEADER_UNREACHABLE: 'completion_authority_leader_unreachable',
  // The redirected answer came from a replica that does not lead.
  NOT_LEADER: 'completion_authority_not_leader',
  // No replica answered at all.
  NO_ANSWER: 'completion_authority_no_answer',
});

function authorityUnavailable(reason) {
  return Object.freeze({
    state: PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE,
    reason,
  });
}

function isAnswered(observation) {
  return observation.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE;
}

// An answer is the leader's own when its replica leads in its observation.
function isLeaderAnswer(observation) {
  return typeof observation.replicaId === 'string' &&
    observation.leaderReplicaId === observation.replicaId;
}

// The node a named replica is routed to: the REPLACE's own source and target
// nodes, else the partition's cached replica rows (a route, never an
// answer).
function memberRouteOf(owner, operation, replicaId) {
  const {sourceReplicaId, targetReplicaId} =
    replaceReplicaIdsOf(owner, operation);
  if (replicaId === targetReplicaId) {
    return {replicaId, nodeId: operation.targetNodeId};
  }
  if (replicaId === sourceReplicaId) {
    return {replicaId, nodeId: operation.sourceNodeId};
  }
  const rows = typeof owner.getCachedCriticalReplicaRows ===
    OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
    owner.getCachedCriticalReplicaRows(operation?.partitionId) : [];
  const row = (Array.isArray(rows) ? rows : []).find((candidate) =>
    (candidate?.replica_id || candidate?.service_id) === replicaId);
  return typeof row?.node_id === 'string' && row.node_id.length > 0 ?
    {replicaId, nodeId: row.node_id} : null;
}

// The first answer of the addressees: t, or - t gone - the surviving
// members, source first.
async function readFirstAnswer(owner, operation) {
  const first = await readReplaceWitnessMembership(owner, operation);
  if (isAnswered(first) || !isReplaceTargetGone(owner, operation)) {
    return first;
  }
  for (const member of survivingMembersOf(owner, operation)) {
    const observation =
      await readReplaceWitnessMembership(owner, operation, member);
    if (isAnswered(observation)) {
      return observation;
    }
  }
  return authorityUnavailable(REPLACE_COMPLETION_AUTHORITY_WAIT.NO_ANSWER);
}

/**
 * The completion authority: the leader's answer, reached from the first
 * answering addressee with at most one redirect to the leader it names.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>} The leader's frozen witness observation, or
 *   UNAVAILABLE with a REPLACE_COMPLETION_AUTHORITY_WAIT reason.
 */
async function readReplaceCompletionAuthority(owner, operation) {
  const answer = await readFirstAnswer(owner, operation);
  if (!isAnswered(answer) || isLeaderAnswer(answer)) {
    return answer;
  }
  if (typeof answer.leaderReplicaId !== 'string' ||
      answer.leaderReplicaId.length === 0) {
    return authorityUnavailable(REPLACE_COMPLETION_AUTHORITY_WAIT.LEADER_UNKNOWN);
  }
  const route = memberRouteOf(owner, operation, answer.leaderReplicaId);
  if (route === null) {
    return authorityUnavailable(
      REPLACE_COMPLETION_AUTHORITY_WAIT.LEADER_UNREACHABLE);
  }
  const redirected =
    await readReplaceWitnessMembership(owner, operation, route);
  if (!isAnswered(redirected)) {
    return authorityUnavailable(
      REPLACE_COMPLETION_AUTHORITY_WAIT.LEADER_UNREACHABLE);
  }
  return isLeaderAnswer(redirected) ? redirected :
    authorityUnavailable(REPLACE_COMPLETION_AUTHORITY_WAIT.NOT_LEADER);
}

export {
  isReplaceTargetGone,
  observedReplaceTargetStatus,
  readReplaceCompletionAuthority,
};
