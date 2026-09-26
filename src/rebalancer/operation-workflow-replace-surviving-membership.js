/**
 * Owner contract:
 * Owner: the REPLACE owner's reading of committed membership when its
 * witness, the target t, is gone (quest replace-source-removal-owner; owner
 * decision D2, "target death is handled from committed membership").
 * Inputs: the target's replica row (failure detector FAILED, or REMOVED);
 * the surviving members of the partition - the source first, then the other
 * replicas the cache holds - each read through its own port
 * (READ_REPLICA_MEMBERSHIP).
 * Canonical output: whether the target is gone, and one membership
 * observation of the source: ABSENT when any surviving member's applied
 * configuration no longer holds it (an applied configuration only ever
 * holds committed changes, so absence is proof), else VOTER when one holds
 * it, else UNAVAILABLE.
 * Prohibited: no decision; never a row as membership; used only while t
 * cannot answer.
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

/**
 * The source's membership as the surviving members' own ports report it.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>} Frozen observation (a membership state plus the
 *   answering member's commit index, applied index, leader and term).
 */
async function readReplaceSurvivingMembership(owner, operation) {
  let voterObservation = null;
  let lastUnavailable = null;
  for (const member of survivingMembersOf(owner, operation)) {
    const observation =
      await readReplaceWitnessMembership(owner, operation, member);
    if (observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT) {
      return observation;
    }
    if (observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER) {
      voterObservation = voterObservation || observation;
    } else {
      lastUnavailable = observation;
    }
  }
  return voterObservation || lastUnavailable || Object.freeze({
    state: PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE,
    reason: null,
  });
}

export {
  isReplaceTargetGone,
  observedReplaceTargetStatus,
  readReplaceSurvivingMembership,
};
