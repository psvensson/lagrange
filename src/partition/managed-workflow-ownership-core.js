/**
 * Shared durable workflow-ownership claim core for the split and merge
 * workflow owners. Both owners run the identical claim math — terminal
 * refusal when the workflow is gone, renew keeps the current fence,
 * fresh claim bumps it, the lease rides the coordinator's claim — and
 * differ only in the log message constants their renew paths throw.
 */

import {
  WORKFLOW_CLAIM_RESULT,
} from '../workflow/workflow-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
} from './partition-constants.js';

const WORKFLOW_RECORD_NOT_HELD = 'Workflow record not held by this owner ' +
  'at apply time; the irreversible step is refused for ';

/**
 * Stamp the durable ownership claim triple (fence token, owner id,
 * lease expiry) onto one transition metadata object, clearing the
 * fields when the workflow carries no value. Both workflow owners
 * serialize the identical triple — the tables transition row carries
 * the fencing state without a schema change.
 * @param {Object} metadata - Transition metadata (mutated).
 * @param {Object} workflow - Workflow state.
 * @return {Object} The same metadata object.
 */
function stampOwnershipClaimMetadata(metadata, workflow) {
  if (Number.isInteger(workflow.fenceToken)) {
    metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN] =
      workflow.fenceToken;
  } else {
    delete metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN
    ];
  }
  if (workflow.workflowOwnerId) {
    metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID] =
      workflow.workflowOwnerId;
  } else {
    delete metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID];
  }
  if (Number.isFinite(workflow.leaseExpiresAt)) {
    metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT
    ] = workflow.leaseExpiresAt;
  } else {
    delete metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT
    ];
  }
  return metadata;
}

/**
 * The durable ownership claim triple one transition metadata object
 * carries (the inverse of stampOwnershipClaimMetadata): what a recovered or
 * resynced workflow must hold, or the fenced-transition and claim CAS
 * witness a row the durable record never had. A field the record does not
 * carry well-formed is undefined.
 * @param {Object|null} metadata - Durable transition metadata.
 * @return {{fenceToken: (number|undefined), workflowOwnerId: *,
 *   leaseExpiresAt: (number|undefined)}}
 */
function durableOwnershipClaimOf(metadata) {
  const fenceToken =
    metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN];
  const leaseExpiresAt = metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT];
  return {
    fenceToken: Number.isInteger(fenceToken) ? fenceToken : undefined,
    workflowOwnerId:
      metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID],
    leaseExpiresAt: Number.isFinite(leaseExpiresAt) ?
      Number(leaseExpiresAt) : undefined,
  };
}

/**
 * Claim (or renew) durable ownership of one workflow through the
 * coordinator. Renew keeps the current fence token; a fresh claim
 * starts the next fence epoch.
 * @param {Object} owner - Workflow owner (coordinator, identity, now).
 * @param {string} workflowId - Workflow to claim.
 * @param {Object} [options]
 * @param {boolean} [options.renew=false] - Renew the live lease.
 * @return {Promise<Object>} Coordinator claim outcome.
 */
function claimWorkflowOwnershipCore(owner, workflowId, options = {}) {
  const workflow = owner.workflowCoordinator.getWorkflowById(workflowId);
  if (!workflow) {
    return {accepted: false, result: WORKFLOW_CLAIM_RESULT.TERMINAL};
  }
  const currentFence = Number.isInteger(workflow.fenceToken) ?
    workflow.fenceToken :
    0;
  const fenceToken = options.renew === true ?
    currentFence :
    currentFence + 1;
  return owner.workflowCoordinator.claimWorkflow(workflowId, {
    ownerId: owner.workflowOwnerId,
    fenceToken,
    leaseExpiresAt: owner.now() + owner.workflowLeaseMs,
  });
}

/**
 * Renew the ownership lease and return the fence/owner identity the
 * enclosing step's transition must carry. Claim loss throws with the
 * owner's OWNERSHIP_LOST message — the step must not proceed without
 * ownership.
 * @param {Object} owner - Workflow owner (coordinator, identity, now).
 * @param {string} workflowId - Workflow to renew.
 * @param {string} ownershipLostMessage - Owner's OWNERSHIP_LOST log msg.
 * @return {Promise<Object>} {fenceToken, ownerId}.
 */
async function renewWorkflowOwnershipCore(
  owner,
  workflowId,
  ownershipLostMessage,
) {
  const claim = await claimWorkflowOwnershipCore(owner, workflowId, {
    renew: true,
  });
  if (claim.accepted !== true) {
    throw new Error(
      ownershipLostMessage +
      ` (${workflowId}: ${String(
        claim.result || WORKFLOW_CLAIM_RESULT.UNKNOWN,
      )})`,
    );
  }
  return {
    fenceToken: claim.workflow.fenceToken,
    ownerId: claim.workflow.workflowOwnerId,
  };
}

/**
 * Claim before register (owner ruling 2026-10-05): from the record AS READ,
 * whether this owner may take the workflow, and the claim it takes. A live
 * lease of another owner on the record refuses without any write; otherwise
 * the claim is the next fence over the record's own, this owner, a fresh
 * lease - and the witness the registration's compare-and-swap names (the
 * record as read; an absent record is the compared state).
 * @param {Object} owner - Workflow owner (workflowOwnerId, workflowLeaseMs,
 *   now, parsePartitionTransition).
 * @param {Object|null} tableInfo - The table's `tables` row as read.
 * @param {Function} witnessOf - recordWitnessOf (the record store's).
 * @return {Object} {refusal, recordOwnerId, recordLeaseExpiresAt} or
 *   {claim: {fenceToken, workflowOwnerId, leaseExpiresAt, recordWitness}}.
 */
function claimFromRecordAsRead(owner, tableInfo, witnessOf) {
  const recorded = durableOwnershipClaimOf(
    owner.parsePartitionTransition?.(tableInfo)?.metadata);
  const now = owner.now();
  if (recorded.workflowOwnerId &&
      recorded.workflowOwnerId !== owner.workflowOwnerId &&
      Number.isFinite(recorded.leaseExpiresAt) &&
      recorded.leaseExpiresAt > now) {
    return {refusal: WORKFLOW_CLAIM_RESULT.ACTIVE_OWNER,
      recordOwnerId: recorded.workflowOwnerId,
      recordLeaseExpiresAt: recorded.leaseExpiresAt};
  }
  return {claim: {
    fenceToken: (recorded.fenceToken ?? 0) + 1,
    workflowOwnerId: owner.workflowOwnerId,
    leaseExpiresAt: now + owner.workflowLeaseMs,
    recordWitness: witnessOf(tableInfo),
  }};
}

/**
 * Register a workflow whose FIRST durable write is its ownership claim: the
 * registration carries the claim (claimFromRecordAsRead) and lands as one
 * compare-and-swap on the record as read. A live foreign lease writes
 * nothing; a refused compare-and-swap (another owner's write landed since
 * the read) is a typed refusal with nothing registered in memory.
 * @param {Object} owner - Workflow owner (workflowCoordinator, logger).
 * @param {Object} record - The registration record.
 * @param {Object|null} tableInfo - The table's `tables` row as read.
 * @param {Object} recordStore - The record store's recordWitnessOf and
 *   beginWorkflowRecordLineage (managed-workflow-record-store.js).
 * @return {Promise<Object>} {workflow} or {refusal, ...}.
 */
async function registerWorkflowWithClaim(owner, record, tableInfo,
  recordStore) {
  const decision = claimFromRecordAsRead(owner, tableInfo,
    recordStore.recordWitnessOf);
  if (decision.refusal) {
    return decision;
  }
  recordStore.beginWorkflowRecordLineage(owner, record.workflowId);
  try {
    return {workflow: await owner.workflowCoordinator.registerWorkflow({
      ...record, ...decision.claim, attemptCount: 1})};
  } catch (error) {
    if (typeof error?.recordWriteOutcome === 'string') {
      return {refusal: WORKFLOW_CLAIM_RESULT.STORAGE_REJECTED,
        recordWriteOutcome: error.recordWriteOutcome};
    }
    throw error;
  }
}

/**
 * Prove, at apply time, that this owner still holds the workflow's record in
 * one of `states` before an irreversible effect (a retirement pass's first
 * record write and REMOVE, a retired group's partitions row deleted): a
 * lease renewal compare-and-swapped on the record
 * as last read. Another owner's claim, another fence, a moved record or a
 * state outside `states` refuses (typed, superseded) - and the renewal keeps
 * the lease alive for the effect that follows.
 * @param {Object} owner - Workflow owner.
 * @param {string} workflowId
 * @param {ReadonlySet<string>|null} [states] - Record states the effect
 *   needs (null: any).
 * @return {Promise<void>} Throws {superseded: true} on refusal.
 */
async function assertWorkflowRecordHeld(owner, workflowId, states = null) {
  const workflow = owner.workflowCoordinator.getWorkflowById(workflowId);
  const held = workflow &&
    workflow.workflowOwnerId === owner.workflowOwnerId &&
    (states === null || states.has(String(workflow.status))) &&
    (await claimWorkflowOwnershipCore(owner, workflowId, {renew: true}))
      .accepted === true;
  if (!held) {
    throw Object.assign(new Error(WORKFLOW_RECORD_NOT_HELD + workflowId), {
      superseded: true, unacknowledged: [], acknowledgedReplicaIds: []});
  }
}

export {
  assertWorkflowRecordHeld,
  claimWorkflowOwnershipCore,
  durableOwnershipClaimOf,
  registerWorkflowWithClaim,
  renewWorkflowOwnershipCore,
  stampOwnershipClaimMetadata,
};
