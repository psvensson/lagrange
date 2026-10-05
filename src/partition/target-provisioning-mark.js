/**
 * Owner contract:
 * Owner: the durable fact that a split child or merge target group was NEVER
 * provisioned (owner ruling 2026-10-04: absence is never proof a replica is
 * gone; an authoritative durable fact is). A workflow writes a target's
 * partitions row before it sends the target's first replica create; an
 * abort between the two leaves a row with no group, whose members nobody
 * can read. This mark tells the teardown which case it holds.
 * Inputs: the workflow's transition metadata (TARGET_PROVISIONING, keyed by
 * target partition id, carried on every row the target ids are on).
 * Canonical output: per target, NONE (minted by this workflow, no create was
 * ever sent: the teardown may retire it with an empty member set) or
 * DISPATCHED (a create may have been sent: its members are required); a
 * missing mark (a record written before the mark existed, or a retried plan
 * whose mark was lost) is neither and stays "membership unavailable".
 * Prohibited: NONE is written only for target ids this attempt minted, and
 * never after DISPATCHED; DISPATCHED is durable BEFORE the first create is
 * sent (a failed write sends nothing); a mark never comes from a row.
 */
import {
  PARTITION_TRANSITION_METADATA_FIELD as METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  RECORD_UNCHANGED,
  refuseRecordChange,
} from './managed-workflow-record-store.js';
import {SPLIT_ACK_CHECKPOINT_FIELD} from './split-ack-constants.js';

const TARGET_PROVISIONING = Object.freeze({
  NONE: 'none',
  DISPATCHED: 'dispatched',
});
const MARKS = Object.freeze(new Set(Object.values(TARGET_PROVISIONING)));
const FIELD = METADATA_FIELD.TARGET_PROVISIONING;
// The record states in which a target's first create may be sent.
const PROVISIONING_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  PARTITION_TRANSITION_STATE.MERGE_PREPARING,
]));
const FROZEN_SET_FIELD = SPLIT_ACK_CHECKPOINT_FIELD.REQUIRED_REPLICA_IDS;
const MARK_REFUSAL = Object.freeze({
  NOT_PREPARING: 'target-provisioning-not-preparing',
});

/**
 * One target's durable provisioning mark, or null when the record has none.
 * @param {Object|null} metadata - The workflow's transition metadata.
 * @param {string} partitionId - The target partition.
 * @return {string|null} A TARGET_PROVISIONING value or null.
 */
function targetProvisioningOf(metadata, partitionId) {
  const mark = metadata?.[FIELD]?.[String(partitionId || '')];
  return MARKS.has(mark) ? mark : null;
}

/**
 * The marks of a set of target ids: NONE for ids this attempt minted, else
 * the prior record's own valid mark for each reused id (a reused id without
 * one gets none: fail-closed).
 * @param {string[]} targetIds - The target partition ids.
 * @param {Object} options
 * @param {boolean} options.minted - The ids were minted by this attempt.
 * @param {Object|null} [options.priorMetadata] - The prior record's metadata.
 * @return {Object} {[targetId]: mark}.
 */
function targetProvisioningMarks(targetIds, {minted, priorMetadata = null}) {
  const marks = {};
  for (const targetId of targetIds.map(String).filter(Boolean)) {
    const mark = minted ? TARGET_PROVISIONING.NONE :
      targetProvisioningOf(priorMetadata, targetId);
    if (mark) {
      marks[targetId] = mark;
    }
  }
  return marks;
}

// Whether a target's group retirement has frozen its member set on the
// record (its participant's checkpoint carries the set).
function isRetirementFrozen(record, target) {
  const participants = record.participants instanceof Map ?
    [...record.participants.values()] : [];
  return participants.some((participant) =>
    String(participant?.partitionId ?? '') === target &&
    Object.hasOwn(participant?.checkpoint || {}, FROZEN_SET_FIELD));
}

/**
 * Make DISPATCHED durable for one target before its first create is sent: a
 * change of the record (a throw means nothing may be sent). Applied to the
 * record at its turn: a target already DISPATCHED is unchanged; a record no
 * longer preparing (an abort landed first) refuses - no create follows; NONE
 * (or a missing mark) becomes DISPATCHED; nothing else of the record moves.
 * @param {Object} owner - The workflow owner (workflowCoordinator).
 * @param {string} workflowId
 * @param {string} partitionId - The target about to be provisioned.
 * @return {Promise<Object>} The workflow projection.
 */
function markTargetProvisioningDispatched(owner, workflowId, partitionId) {
  const target = String(partitionId);
  return owner.workflowCoordinator.updateWorkflow(workflowId, (current) => {
    if (targetProvisioningOf(current.metadata, target) ===
        TARGET_PROVISIONING.DISPATCHED) {
      return RECORD_UNCHANGED;
    }
    if (!PROVISIONING_STATES.has(String(current.status)) ||
        isRetirementFrozen(current, target)) {
      // An abort (or any later phase) landed first, or the target's group
      // retirement already froze its member set: no create may follow.
      return refuseRecordChange(MARK_REFUSAL.NOT_PREPARING);
    }
    return {...current, metadata: {...current.metadata,
      [FIELD]: {...(current.metadata?.[FIELD] || {}),
        [target]: TARGET_PROVISIONING.DISPATCHED}}};
  });
}

export {
  TARGET_PROVISIONING,
  markTargetProvisioningDispatched,
  targetProvisioningMarks,
  targetProvisioningOf,
};
