import {RESUME_TRIGGER} from './group-retirement-resume.js';
import {randomUUID} from 'node:crypto';

import {MANAGED_SPLIT_LOG_MSG} from './partition-constants.js';
import {
  WORKFLOW_DEFAULT_NODE_ID,
} from '../workflow/workflow-constants.js';
import {
  claimWorkflowOwnershipCore,
  renewWorkflowOwnershipCore,
} from './managed-workflow-ownership-core.js';
import {
  SPLIT_PARTICIPANT_PREFIX,
  isSplitSourceAckTransitionAllowed,
} from './split-ack-constants.js';

/**
 * Build the durable ownership identity for a split coordinator process:
 * nodeId + a per-process boot nonce so a restarted same-node process
 * can never tie on ownerId; the fence token carries the epoch (mirrors
 * the schema-provisioning owner).
 * @param {Object} options - Constructor options.
 * @param {string|undefined} nodeId - Local node identity.
 * @return {string}
 */
function buildSplitWorkflowOwnerId(options, nodeId) {
  return options.workflowOwnerId ||
    String(nodeId || WORKFLOW_DEFAULT_NODE_ID) +
      `-split-${randomUUID()}`;
}

/**
 * Hand the table's current record to the owner's durable group-retirement
 * resume after a refused start (it arms the foreign lease's expiry wait when
 * the record is retiring; anything else re-runs on the caller's own retry).
 * @param {Object} owner - The workflow owner.
 * @param {Object|null} tableInfo - The record as read at the start.
 * @return {void}
 */
function resumeAfterRefusedStart(owner, tableInfo) {
  if (typeof owner.resumeGroupRetirement !== 'function' || !tableInfo) {
    return;
  }
  const tableId = String(tableInfo.table_id ?? tableInfo.tableId ?? '');
  const current = (owner.listTableInfos?.() || []).find((row) =>
    String(row?.table_id ?? '') === tableId) || tableInfo;
  owner.resumeGroupRetirement(current, RESUME_TRIGGER.START_REFUSED).catch(() => {});
}

/**
 * Durable ownership methods for ManagedSplitWorkflow: the explicit
 * participant transition graph validator and the claim/renew helpers
 * that drive the existing claimDurableWorkflow/assertTransitionFence
 * machinery (the schema-provisioning-job-owner precedent). Split out of
 * the execution-gate methods to keep that file within its size budget.
 */
class ManagedSplitWorkflowOwnershipMethods {
  /**
   * Run one owner-scoped step strictly AFTER every previously enqueued
   * step for the same owner key (FIFO).
   *
   * This exists because the canonical lane's runExclusive() COALESCES
   * concurrent callers — a second caller receives the in-flight
   * execution's promise instead of being queued — so cross-
   * acknowledgement mutations (a cutover step racing a fail-safe
   * abort) would otherwise interleave or be silently swallowed. Every
   * owner-side durable phase mutation (phase advances, the cutover
   * step, the abort step) routes through this FIFO; the step runner's
   * lane remains the execution substrate inside each slot.
   *
   * @param {string} ownerKey - Split owner key.
   * @param {Function} stepFactory - Async step to run.
   * @return {Promise<*>} The step's own settlement.
   */
  runSerializedOwnerStep(ownerKey, stepFactory) {
    const previousTail =
      this.splitOwnerLaneTailByOwnerKey.get(ownerKey) || Promise.resolve();
    const execution = previousTail
      .catch(() => {})
      .then(() => stepFactory());
    const tail = execution
      .catch(() => {})
      .finally(() => {
        if (this.splitOwnerLaneTailByOwnerKey.get(ownerKey) === tail) {
          this.splitOwnerLaneTailByOwnerKey.delete(ownerKey);
        }
      });
    this.splitOwnerLaneTailByOwnerKey.set(ownerKey, tail);
    return execution;
  }

  /**
   * Resolve when every currently enqueued owner-lane step for one
   * workflow has settled (fire-and-forget aborts included).
   * Observability surface for guards and diagnostics.
   * @param {string} workflowId
   * @return {Promise<void>}
   */
  async settleSplitOwnerLaneForWorkflow(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    const ownerKey = this.isSplitWorkflowStateUnavailable(workflow) ?
      '' :
      String(workflow.ownerKey || '');
    await (this.splitOwnerLaneTailByOwnerKey.get(ownerKey) ||
      Promise.resolve());
  }

  /**
   * Explicit participant transition graph validator, wired into the
   * coordinator as isParticipantTransitionAllowed: only the split
   * source participant has a declared graph (owner-recorded child
   * provisioning outcomes are admitted unconditionally).
   * @param {string} participantKey
   * @param {string|null} fromStatus
   * @param {string} toStatus
   * @return {boolean}
   * @private
   */
  isSplitParticipantTransitionAllowed(participantKey, fromStatus, toStatus) {
    if (String(participantKey || '') ===
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) {
      return isSplitSourceAckTransitionAllowed(fromStatus, toStatus);
    }
    return true;
  }

  /**
   * Claim durable ownership of one split workflow for this owner
   * (new epoch), or renew an existing claim (same fence, extended
   * lease). Returns the accepted claim result or a typed rejection;
   * never throws on contention (mirrors the schema-provisioning owner).
   * @param {string} workflowId
   * @param {Object} [options]
   * @param {boolean} [options.renew] - Renew at the current fence
   *   instead of claiming a new epoch.
   * @return {Promise<Object>} Claim result ({accepted, result, workflow}).
   * @private
   */
  async claimSplitWorkflowOwnership(workflowId, options = {}) {
    return claimWorkflowOwnershipCore(this, workflowId, options);
  }

  /**
   * Renew the ownership lease inside a serialized owner-lane step and
   * return the fence/owner identity the step's transition must carry.
   * Claim loss throws — the step must not proceed without ownership.
   * @param {string} workflowId
   * @return {Promise<Object>} {fenceToken, ownerId}.
   * @private
   */
  async renewSplitWorkflowOwnership(workflowId) {
    return renewWorkflowOwnershipCore(
      this,
      workflowId,
      MANAGED_SPLIT_LOG_MSG.OWNERSHIP_LOST,
    );
  }

  /**
   * The typed outcome of a split whose start-time claim was refused (claim
   * before register: nothing was written, nothing is registered): a live
   * foreign lease, or a registration compare-and-swap another owner's write
   * beat. This node must not drive the workflow; a retiring record is handed
   * to the durable resume (it waits for that lease's expiry).
   * @param {string} workflowId
   * @param {string} partitionId - Source partition (log context).
   * @param {Object} registration - registerWorkflowWithClaim's refusal.
   * @param {Object|null} tableInfo - The record as read.
   * @return {Object} Refusal result.
   * @private
   */
  refuseSplitOwnershipAtStart(workflowId, partitionId, registration,
    tableInfo) {
    this.logger.info(MANAGED_SPLIT_LOG_MSG.OWNERSHIP_CLAIM_REFUSED, {
      workflowId,
      partitionId,
      result: registration.refusal,
      recordOwnerId: registration.recordOwnerId ?? null,
      recordLeaseExpiresAt: registration.recordLeaseExpiresAt ?? null,
    });
    resumeAfterRefusedStart(this, tableInfo);
    return {
      success: false,
      partitionId,
      workflowId,
      ownership: registration.refusal,
    };
  }
}

export {buildSplitWorkflowOwnerId, ManagedSplitWorkflowOwnershipMethods};
