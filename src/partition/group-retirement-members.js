/**
 * Owner contract:
 * Owner: WHICH replicas a whole-group retirement step must hear from before
 * it may complete, and WHICH of them have answered (owner ruling 2026-10-04,
 * fail-closed: absence, timeout, a deleted services or nodes row, eviction
 * or NOT_FOUND is never proof a replica is gone; a member that never answers
 * stays listed and the step stays incomplete).
 * Inputs: the group's COMMITTED configuration (voters and learners), read
 * once from its leader through the committed-membership read the creation
 * owner already uses (committed-membership-bootstrap-read.js) - never the
 * services rows, which are discovery only (owner decision O1); the retiring
 * group's participant record on the workflow's durable transition record;
 * the services rows of the local view, as ADDRESSES only (recorded per frozen
 * member, never removed by a row's absence); each member's own answer to its
 * REMOVE.
 * Canonical output: the frozen required set (REQUIRED_REPLICA_IDS), its
 * members' addresses (MEMBER_NODE_IDS) and the set that answered COMPLETED
 * (DISSOLVED_REPLICA_IDS) - or, for a target whose durable provisioning mark
 * (target-provisioning-mark.js) says no create was ever sent, the empty set
 * frozen with NEVER_PROVISIONED - all persisted on that
 * participant's checkpoint by a change of the record (groupCheckpointOf:
 * the frozen set immutable once written, the answered ids only growing);
 * completion is required ⊆ dissolved and nothing else.
 * Ownership: a pass starts only after this owner proves, at apply time, that
 * it holds the workflow's record (managed-workflow-ownership-core.js); every
 * checkpoint write is a change applied by the record store to the record at
 * its turn (managed-workflow-record-store.js).
 * Prohibited: an empty or unreadable configuration is "membership
 * unavailable", never "no members" (only the durable never-provisioned mark
 * is); a member with no address is listed,
 * never skipped; no answer other than a positive one marks a member done.
 */
import {readCommittedMembershipStamp} from
  '../rebalancer/committed-membership-bootstrap-read.js';
import {ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../raft/raft-committed-membership-constants.js';
import {GROUP_RETIREMENT_REFUSAL} from './group-retirement-evidence.js';
import {assertWorkflowRecordHeld} from './managed-workflow-ownership-core.js';
import {
  RECORD_UNCHANGED,
  isRecordRefusal,
  refuseRecordChange,
} from './managed-workflow-record-store.js';
import {SPLIT_ACK_CHECKPOINT_FIELD} from './split-ack-constants.js';
import {PARTITION_TRANSITION_STATE} from './partition-constants.js';
import {
  TARGET_PROVISIONING,
  targetProvisioningOf,
} from './target-provisioning-mark.js';

// The checkpoint fields on a retiring group's participant record (the merge
// checkpoint enum names the same strings).
const GROUP_MEMBER_CHECKPOINT_FIELD = Object.freeze({
  REQUIRED_REPLICA_IDS: SPLIT_ACK_CHECKPOINT_FIELD.REQUIRED_REPLICA_IDS,
  MEMBER_NODE_IDS: SPLIT_ACK_CHECKPOINT_FIELD.MEMBER_NODE_IDS,
  DISSOLVED_REPLICA_IDS: SPLIT_ACK_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS,
  NEVER_PROVISIONED: SPLIT_ACK_CHECKPOINT_FIELD.NEVER_PROVISIONED,
});

// Why a required member is still listed, owner side (the handler's typed
// refusals ride along unchanged).
const GROUP_MEMBER_REFUSAL = Object.freeze({
  MEMBERSHIP_UNAVAILABLE: 'group-retirement-membership-unavailable',
  MEMBER_UNADDRESSABLE: 'group-retirement-member-unaddressable',
  PROGRESS_UNRECORDED: 'group-retirement-progress-unrecorded',
  REMOVAL_IN_PROGRESS: 'group-retirement-removal-in-progress',
  FROZEN_SET_IMMUTABLE: 'group-retirement-frozen-set-immutable',
});
const IN_PROGRESS_STATUSES = Object.freeze(new Set([
  ReplicaOperationResponseStatus.INITIATED,
  ReplicaOperationResponseStatus.IN_PROGRESS,
]));

// A member is done only when it answers its replica durably retired:
// INITIATED rests on memory until its REMOVING row is durable, and both it
// and IN_PROGRESS keep the member listed and re-driven by its row events.
const ACCEPTED_REMOVAL_STATUSES = Object.freeze(new Set([
  ReplicaOperationResponseStatus.COMPLETED,
]));
// A refusal saying this owner's evidence is not the record's: a newer owner
// (fence) or another workflow holds the record.
const SUPERSEDED_REFUSALS = Object.freeze(new Set([
  GROUP_RETIREMENT_REFUSAL.WORKFLOW_MISMATCH,
  GROUP_RETIREMENT_REFUSAL.FENCE_MISMATCH,
]));
const GROUP_MEMBER_ERROR = Object.freeze({
  INCOMPLETE: 'Group retirement incomplete: unacknowledged replicas ',
  MEMBERSHIP_UNAVAILABLE: 'Group retirement membership unavailable: the ' +
    'committed configuration of the group could not be read for ',
  SUPERSEDED: 'Group retirement progress refused: this owner\'s fence is ' +
    'older than the participant record\'s for ',
});
const REPLICA_ID_SEPARATOR = ',';

function idsOf(checkpoint, field) {
  const ids = checkpoint?.[field];
  return Array.isArray(ids) ? ids.map(String).filter((id) => id.length > 0) :
    [];
}

function participantOf(workflow, participantKey) {
  return workflow?.participants instanceof Map ?
    workflow.participants.get(participantKey) ?? null : null;
}

function rowField(row, snake, camel) {
  return String(row?.[snake] ?? row?.[camel] ?? '');
}

/**
 * The replica identities of a validated COMMITTED stamp: its voters and
 * learners (the group's whole committed configuration), or none when any
 * peer has no identity.
 * @param {Object} stamp - readCommittedMembershipStamp's frozen stamp.
 * @return {string[]}
 */
function memberIdsOfCommittedStamp(stamp) {
  const peerIds = [...new Set([...(stamp?.voters || []),
    ...(stamp?.learners || [])])];
  const ids = peerIds.map((peerId) => stamp?.identities?.[peerId]);
  return ids.every((id) => typeof id === 'string' && id.length > 0) ?
    ids : [];
}

/**
 * The committed member identities of one partition's group, read from its
 * leader by the creation owner's committed-membership read.
 * @param {Object|null} reader - The owner that read uses (systemTableCache,
 *   messageRouter, nodeId): the node's rebalance coordinator.
 * @param {string} partitionId
 * @return {Promise<string[]>} Throws the read's typed refusal.
 */
async function readCommittedGroupMemberIds(reader, partitionId) {
  // The retirement read: refused while a configuration change is pending
  // or the configuration is joint (a member added after the freeze would
  // never be retired); the step re-runs on the group's row events.
  return memberIdsOfCommittedStamp(
    await readCommittedMembershipStamp(reader, partitionId,
      {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT}));
}

function incompleteRetirementError(unacknowledged, acknowledged,
  extra = {}) {
  return Object.assign(new Error(GROUP_MEMBER_ERROR.INCOMPLETE +
    unacknowledged.map((member) => member.replicaId)
      .join(REPLICA_ID_SEPARATOR)), {
    unacknowledged,
    superseded: unacknowledged.some((member) =>
      SUPERSEDED_REFUSALS.has(member.refusal)),
    acknowledgedReplicaIds: acknowledged,
    ...extra,
  });
}

function membershipUnavailableError(partitionId) {
  return Object.assign(new Error(GROUP_MEMBER_ERROR.MEMBERSHIP_UNAVAILABLE +
    partitionId), {unacknowledged: [], superseded: false,
    membershipUnavailable: true, acknowledgedReplicaIds: []});
}

// Whether `fields` would replace a frozen set (or its never-provisioned
// mark) the checkpoint already holds with a different one.
function refreezesDifferently(checkpoint, fields) {
  const field = GROUP_MEMBER_CHECKPOINT_FIELD;
  return Object.hasOwn(checkpoint, field.REQUIRED_REPLICA_IDS) &&
    (idsOf(fields, field.REQUIRED_REPLICA_IDS).join(REPLICA_ID_SEPARATOR) !==
      idsOf(checkpoint, field.REQUIRED_REPLICA_IDS)
        .join(REPLICA_ID_SEPARATOR) ||
      Boolean(fields[field.NEVER_PROVISIONED]) !==
        Boolean(checkpoint[field.NEVER_PROVISIONED]));
}

/**
 * The retiring group's checkpoint with `fields` applied to the RECORD's own
 * checkpoint: the frozen set (required ids, or the never-provisioned empty
 * set) is immutable once written - a different one refuses; the answered
 * (dissolved) ids and the address book only grow; never-provisioned is
 * sticky. RECORD_UNCHANGED when nothing moves.
 * @param {Object|undefined} previous - The record's checkpoint.
 * @param {Object} fields
 * @return {Object|symbol} The checkpoint, a refusal, or RECORD_UNCHANGED.
 */
function groupCheckpointOf(previous = {}, fields) {
  const field = GROUP_MEMBER_CHECKPOINT_FIELD;
  const next = {...(previous || {})};
  if (Object.hasOwn(fields, field.REQUIRED_REPLICA_IDS)) {
    if (refreezesDifferently(next, fields)) {
      return refuseRecordChange(GROUP_MEMBER_REFUSAL.FROZEN_SET_IMMUTABLE);
    }
    next[field.REQUIRED_REPLICA_IDS] = idsOf(fields,
      field.REQUIRED_REPLICA_IDS);
  }
  if (fields[field.NEVER_PROVISIONED] === true) {
    next[field.NEVER_PROVISIONED] = true;
  }
  if (Object.hasOwn(fields, field.DISSOLVED_REPLICA_IDS)) {
    next[field.DISSOLVED_REPLICA_IDS] = [...new Set([
      ...idsOf(next, field.DISSOLVED_REPLICA_IDS),
      ...idsOf(fields, field.DISSOLVED_REPLICA_IDS)])];
  }
  if (Object.hasOwn(fields, field.MEMBER_NODE_IDS)) {
    next[field.MEMBER_NODE_IDS] = {...fields[field.MEMBER_NODE_IDS],
      ...(next[field.MEMBER_NODE_IDS] || {})};
  }
  return JSON.stringify(next) === JSON.stringify(previous || {}) ?
    RECORD_UNCHANGED : next;
}

/**
 * Whether the record proves a target never provisioned: its own mark is NONE
 * and the record is aborted (FAILED: a create can no longer be sent - the
 * provisioning mark flips only while the record is preparing).
 * @param {Object} record - The decoded record.
 * @param {Object} participant - The target's participant on it.
 * @return {boolean}
 */
function isNeverProvisionedOnRecord(record, participant) {
  return record.status === PARTITION_TRANSITION_STATE.FAILED &&
    targetProvisioningOf(record.metadata, participant.partitionId) ===
      TARGET_PROVISIONING.NONE;
}

/**
 * Persist checkpoint fields on the retiring group's participant: a change of
 * the record (owner decision 2026-10-05) applied to the RECORD's participant
 * under the participant fence rule every acknowledgement follows (an owner
 * fence older than the participant's is refused as superseded), the frozen
 * set immutable and the answered ids only growing (groupCheckpointOf). The
 * group's workflow and participant are refreshed from the projection after
 * the change landed.
 * @private
 */
async function recordProgress(owner, group, fields) {
  const {participantKey} = group;
  const updated = await owner.workflowCoordinator.updateWorkflow(
    group.workflow.workflowId, (current) => {
      const participant = current.participants.get(participantKey);
      if (!participant) {
        return refuseRecordChange(GROUP_MEMBER_REFUSAL.MEMBERSHIP_UNAVAILABLE);
      }
      const fence = current.fenceToken;
      if (Number.isInteger(participant.fenceToken) &&
          !(Number.isInteger(fence) && fence >= participant.fenceToken)) {
        return refuseRecordChange(GROUP_MEMBER_ERROR.SUPERSEDED +
          current.workflowId, {superseded: true});
      }
      if (fields[GROUP_MEMBER_CHECKPOINT_FIELD.NEVER_PROVISIONED] === true &&
          !isNeverProvisionedOnRecord(current, participant)) {
        // The empty set is frozen only on the RECORD's own NONE mark, once
        // the record is aborted (no create can follow it): a create the
        // record says may have been sent has members.
        return refuseRecordChange(GROUP_MEMBER_REFUSAL.MEMBERSHIP_UNAVAILABLE);
      }
      const checkpoint = groupCheckpointOf(participant.checkpoint, fields);
      if (checkpoint === RECORD_UNCHANGED || isRecordRefusal(checkpoint)) {
        return checkpoint;
      }
      const participants = new Map(current.participants);
      participants.set(participantKey, {...participant, checkpoint,
        fenceToken: Number.isInteger(fence) ? fence : participant.fenceToken,
        updatedAt: owner.now()});
      return {...current, participants};
    });
  group.workflow = updated;
  group.participant = updated.participants.get(participantKey);
}

// recordProgress, answering whether the write landed: a superseded owner's
// typed refusal propagates; a failed write is false (the caller keeps the
// member listed or the membership unfrozen).
function recordedProgress(owner, group, fields) {
  return recordProgress(owner, group, fields).then(
    () => true, (error) => {
      if (error?.superseded === true) {
        throw error;
      }
      return false;
    });
}

/**
 * The frozen required set: the participant's persisted one, else (the first
 * dispatch, or a record written before the set existed) the committed
 * configuration read now plus any member already recorded as answered,
 * persisted before any REMOVE is sent.
 * @private
 */
async function frozenMembersOf(owner, group, partitionId) {
  const {participant} = group;
  if (participant.checkpoint?.[
    GROUP_MEMBER_CHECKPOINT_FIELD.NEVER_PROVISIONED] === true) {
    return [];
  }
  const frozen = idsOf(participant.checkpoint,
    GROUP_MEMBER_CHECKPOINT_FIELD.REQUIRED_REPLICA_IDS);
  if (frozen.length > 0) {
    return frozen;
  }
  if (targetProvisioningOf(group.workflow.metadata, partitionId) ===
      TARGET_PROVISIONING.NONE) {
    return freezeNeverProvisioned(owner, group, partitionId);
  }
  const members = await Promise.resolve()
    .then(() => owner.readCommittedGroupMembers(partitionId))
    .catch(() => []);
  if (!Array.isArray(members) || members.length === 0) {
    throw membershipUnavailableError(partitionId);
  }
  const required = [...new Set([...members.map(String), ...idsOf(
    participant.checkpoint,
    GROUP_MEMBER_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS)])].sort();
  // A set that is not durable is not frozen: nothing is sent on it.
  if (!await recordedProgress(owner, group, {
    [GROUP_MEMBER_CHECKPOINT_FIELD.REQUIRED_REPLICA_IDS]: required})) {
    throw membershipUnavailableError(partitionId);
  }
  return required;
}

/**
 * A target whose durable mark says no create was ever sent has no member:
 * its empty set is frozen with the never-provisioned mark (durable before
 * the caller deletes its row), never inferred from an unreadable group.
 * @private
 */
async function freezeNeverProvisioned(owner, group, partitionId) {
  if (!await recordedProgress(owner, group, {
    [GROUP_MEMBER_CHECKPOINT_FIELD.REQUIRED_REPLICA_IDS]: [],
    [GROUP_MEMBER_CHECKPOINT_FIELD.NEVER_PROVISIONED]: true})) {
    throw membershipUnavailableError(partitionId);
  }
  return [];
}

// Why a member that was asked (or could not be) is still listed.
function refusalOf(nodeId, positive, answer) {
  if (!nodeId) {
    return GROUP_MEMBER_REFUSAL.MEMBER_UNADDRESSABLE;
  }
  if (positive) {
    return GROUP_MEMBER_REFUSAL.PROGRESS_UNRECORDED;
  }
  return IN_PROGRESS_STATUSES.has(String(answer?.status || '')) ?
    GROUP_MEMBER_REFUSAL.REMOVAL_IN_PROGRESS :
    answer?.groupRetirementRefusal ?? null;
}

/**
 * The frozen members' addresses: the ones recorded on the participant, plus
 * any a services row of the view now gives a member that has none yet. A
 * row only ever ADDS an address (a member's own cleanup deletes its row
 * once it retired; it must still be asked), and new addresses are recorded
 * so a later pass, or a restarted owner, keeps them.
 * @private
 */
async function addressBookOf(owner, group, required, partitionId) {
  const {participant} = group;
  const recorded = participant.checkpoint?.[
    GROUP_MEMBER_CHECKPOINT_FIELD.MEMBER_NODE_IDS] || {};
  const book = {...recorded};
  for (const row of owner.listPartitionServiceRows(partitionId) || []) {
    const replicaId = rowField(row, 'replica_id', 'replicaId');
    const nodeId = rowField(row, 'node_id', 'nodeId');
    if (required.includes(replicaId) && nodeId && !book[replicaId]) {
      book[replicaId] = nodeId;
    }
  }
  if (Object.keys(book).length > Object.keys(recorded).length) {
    // Best effort: an unrecorded address is still used on this pass.
    await recordedProgress(owner, group, {
      [GROUP_MEMBER_CHECKPOINT_FIELD.MEMBER_NODE_IDS]: book});
  }
  return book;
}

/**
 * Deliver the group-retirement REMOVE to every frozen member that has not
 * answered positively (one pass, never stopping at the first failure),
 * recording each positive answer durably as it arrives. Completes only when
 * every frozen member answered; otherwise throws an Error carrying
 * {unacknowledged: [{replicaId, nodeId, refusal}], superseded,
 * acknowledgedReplicaIds, membershipUnavailable}: the caller neither deletes
 * the group's row nor reports completion.
 * @param {Object} owner - The workflow owner (resolveWorkflowState,
 *   workflowCoordinator, readCommittedGroupMembers,
 *   listPartitionServiceRows, now).
 * @param {Object} options
 * @param {string} options.workflowId
 * @param {string} options.participantKey - The retiring group's participant.
 * @param {string} options.partitionId - The retiring group.
 * @param {Function} options.deliver - async ({replicaId, nodeId}) => the
 *   handler's answer (or null when undelivered).
 * @return {Promise<string[]>} Every positively answered replica id.
 */
async function retireFrozenGroupMembers(owner, {workflowId, participantKey,
  partitionId, deliver}) {
  const workflow = owner.resolveWorkflowState(workflowId);
  if (!participantOf(workflow, participantKey)) {
    throw membershipUnavailableError(partitionId);
  }
  // Only the record's current owner retires a group: proved at apply time
  // (a renewal compare-and-swap) before any record write or REMOVE of this
  // pass; anyone else stops here as superseded.
  await assertWorkflowRecordHeld(owner, workflowId);
  // The projection after the renewal (the record's own participant).
  const group = {workflow, participantKey,
    participant: participantOf(workflow, participantKey)};
  if (!group.participant) {
    throw membershipUnavailableError(partitionId);
  }
  const required = await frozenMembersOf(owner, group, partitionId);
  const dissolved = new Set(idsOf(group.participant.checkpoint,
    GROUP_MEMBER_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS));
  const nodeIdOf = await addressBookOf(owner, group, required, partitionId);
  const unacknowledged = [];
  for (const replicaId of required.filter((id) => !dissolved.has(id))) {
    const nodeId = String(nodeIdOf[replicaId] || '');
    const answer = nodeId ?
      await deliver({replicaId, nodeId}).catch(() => null) : null;
    const positive = ACCEPTED_REMOVAL_STATUSES.has(
      String(answer?.status || ''));
    if (positive && await recordedProgress(owner, group, {
      [GROUP_MEMBER_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS]:
        [...dissolved, replicaId]})) {
      dissolved.add(replicaId);
      continue;
    }
    unacknowledged.push({replicaId, nodeId,
      refusal: refusalOf(nodeId, positive, answer)});
  }
  if (unacknowledged.length > 0) {
    throw incompleteRetirementError(unacknowledged, [...dissolved]);
  }
  return [...dissolved];
}

export {
  readCommittedGroupMemberIds,
  retireFrozenGroupMembers,
};
