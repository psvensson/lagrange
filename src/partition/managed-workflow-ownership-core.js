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

export {
  claimWorkflowOwnershipCore,
  renewWorkflowOwnershipCore,
  stampOwnershipClaimMetadata,
};
