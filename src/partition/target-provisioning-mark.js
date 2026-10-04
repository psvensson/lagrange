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
import {PARTITION_TRANSITION_METADATA_FIELD} from './partition-constants.js';

const TARGET_PROVISIONING = Object.freeze({
  NONE: 'none',
  DISPATCHED: 'dispatched',
});
const MARKS = Object.freeze(new Set(Object.values(TARGET_PROVISIONING)));
const FIELD = PARTITION_TRANSITION_METADATA_FIELD.TARGET_PROVISIONING;

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

/**
 * Make DISPATCHED durable for one target before its first create is sent:
 * the workflow's own update (a throw means nothing may be sent), then the
 * caller's metadata carries it so no later write of it rolls the mark back.
 * @param {Object} owner - The workflow owner (workflowCoordinator).
 * @param {string} workflowId
 * @param {Object} metadata - The caller's transition metadata (mutated
 *   after the write landed).
 * @param {string} partitionId - The target about to be provisioned.
 * @return {Promise<void>}
 */
async function markTargetProvisioningDispatched(owner, workflowId, metadata,
  partitionId) {
  const marks = {...(metadata[FIELD] || {}),
    [String(partitionId)]: TARGET_PROVISIONING.DISPATCHED};
  await owner.workflowCoordinator.updateWorkflow(workflowId,
    {metadata: {...metadata, [FIELD]: marks}});
  metadata[FIELD] = marks;
}

export {
  TARGET_PROVISIONING,
  markTargetProvisioningDispatched,
  targetProvisioningMarks,
  targetProvisioningOf,
};
