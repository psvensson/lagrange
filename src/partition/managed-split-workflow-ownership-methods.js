import {randomUUID} from 'node:crypto';

import {TABLES} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  WORKFLOW_CLAIM_RESULT,
  WORKFLOW_DEFAULT_NODE_ID,
} from '../workflow/workflow-constants.js';
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
    const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
    if (!workflow) {
      return {accepted: false, result: WORKFLOW_CLAIM_RESULT.TERMINAL};
    }
    const currentFence = Number.isInteger(workflow.fenceToken) ?
      workflow.fenceToken :
      0;
    const fenceToken = options.renew === true ?
      currentFence :
      currentFence + 1;
    return this.workflowCoordinator.claimWorkflow(workflowId, {
      ownerId: this.workflowOwnerId,
      fenceToken,
      leaseExpiresAt: this.now() + this.workflowLeaseMs,
    });
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
    const claim = await this.claimSplitWorkflowOwnership(workflowId, {
      renew: true,
    });
    if (claim.accepted !== true) {
      throw new Error(
        MANAGED_SPLIT_LOG_MSG.OWNERSHIP_LOST +
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
   * Claim durable ownership at workflow start (new fence epoch) and
   * return the refusal outcome when another owner holds the live lease.
   * Exactly one node holds the lease; a refused claim is a typed
   * outcome — this node must not drive the workflow.
   * @param {string} workflowId
   * @param {string} partitionId - Source partition (log context).
   * @return {Promise<Object|null>} Refusal result, or null when claimed.
   * @private
   */
  async claimSplitWorkflowAtStart(workflowId, partitionId) {
    const ownershipClaim = await this.claimSplitWorkflowOwnership(
      workflowId,
    );
    if (ownershipClaim.accepted !== true) {
      this.logger.info(MANAGED_SPLIT_LOG_MSG.OWNERSHIP_CLAIM_REFUSED, {
        workflowId,
        partitionId,
        result: ownershipClaim.result,
      });
      return {
        success: false,
        partitionId,
        workflowId,
        ownership: ownershipClaim.result,
      };
    }
    this.logger.info(MANAGED_SPLIT_LOG_MSG.OWNERSHIP_CLAIMED, {
      workflowId,
      partitionId,
      fenceToken: ownershipClaim.workflow.fenceToken,
      ownerId: this.workflowOwnerId,
    });
    return null;
  }
  /**
   * Durable claim persistence for the ownership machinery: the claim
   * lands through the same tables transition row write, compare-and-
   * swapped on the previously persisted transition metadata so two
   * nodes claiming concurrently can never both succeed (the loser's
   * conditional update matches zero rows because the winner already
   * rewrote the metadata payload). This mirrors the schema-provisioning
   * repository's row_version CAS, with the full previous metadata
   * payload as the version witness (the fence triple is embedded in
   * that payload, so a metadata match proves the fence epoch we read).
   * @param {Object} workflow - Claim candidate (carries fenceToken,
   *   workflowOwnerId, leaseExpiresAt).
   * @param {Object} [context] - Claim context ({previousWorkflow}).
   * @return {Promise<Object>} {accepted: boolean, workflow}.
   * @private
   */
  async persistSplitWorkflowClaim(workflow, context = {}) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !== LOCAL_STR_FUNCTION) {
      return {accepted: false, workflow};
    }
    const previousWorkflow = context.previousWorkflow || {};
    const expectedSerializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(previousWorkflow),
    );
    const serializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(workflow),
    );
    const mutationResult = await cdcIntegrationService.updateSystemTableRow(
      TABLES.TABLES,
      {
        table_id: workflow.tableId,
        partition_transition_metadata: expectedSerializedMetadata,
      },
      {
        partition_transition_metadata: serializedMetadata,
        updated_at: workflow.updatedAt,
      },
      // Claim/renew writes are not epoch transitions: they tolerate
      // pending cache visibility like every other routine transition
      // write (the CAS witness, not the cache wait, carries the race
      // guarantee).
      this.buildManagedSplitMutationOptions({
        allowPendingVisibility: true,
      }),
    );
    if (mutationResult?.success === false) {
      return {accepted: false, workflow};
    }
    const affectedRows = Number(
      mutationResult?.partitionResult?.affectedRows ??
        mutationResult?.affectedRows,
    );
    // Exactly one row must match the previous-metadata witness; zero
    // means a concurrent claim (or transition) already moved the row.
    return {accepted: affectedRows === 1, workflow};
  }

  /**
   * Durable transition persistence for the ownership machinery: a
   * fenced workflow transition lands with the FULL transition payload
   * (epoch fields included) compare-and-swapped on the previously
   * persisted transition metadata — the same witness the claim CAS
   * uses. The in-memory assertTransitionFence has already enforced
   * exact fence/owner/lease; this write adds the durable race guard so
   * two processes can never both persist a transition at the same
   * fence epoch. Returns the storage-hook shape ({accepted}); the
   * machinery throws STALE_FENCE_TOKEN on rejection.
   * @param {Object} workflow - Transition candidate.
   * @param {Object} [context] - ({previousWorkflow}).
   * @return {Promise<Object>} {accepted: boolean, workflow}.
   * @private
   */
  async persistSplitWorkflowTransitionFence(workflow, context = {}) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !== LOCAL_STR_FUNCTION) {
      return {accepted: false, workflow};
    }
    const previousWorkflow = context.previousWorkflow || {};
    const expectedSerializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(previousWorkflow),
    );
    // Reuse the canonical transition payload builder, then add the CAS
    // witness to the where-clause.
    const pendingPartitionVersion = Number(
      workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
      ],
    );
    const serializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(workflow),
    );
    const updatePayload = {
      pending_partition_version: Number.isInteger(pendingPartitionVersion) ?
        pendingPartitionVersion :
        null,
      partition_transition_state: workflow.status,
      partition_transition_metadata: serializedMetadata,
      updated_at: workflow.updatedAt,
    };
    if (workflow.status ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      const targetIds = workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ];
      const siblingIds = workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS
      ];
      if (Number.isInteger(pendingPartitionVersion)) {
        updatePayload.active_partition_version = pendingPartitionVersion;
        updatePayload.pending_partition_version = null;
      }
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        updatePayload.partition_count = targetIds.length +
          (Array.isArray(siblingIds) ? siblingIds.length : 0);
      }
    }
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      updatePayload.pending_partition_version = null;
    }
    // Same visibility contract as the canonical persist: routine
    // transitions tolerate pending cache visibility; the epoch
    // transitions (cutover promotion, FAILED withdrawal) do not.
    const isEpochTransition =
      workflow.status === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE ||
      workflow.status === PARTITION_TRANSITION_STATE.FAILED;
    const mutationResult = await cdcIntegrationService.updateSystemTableRow(
      TABLES.TABLES,
      {
        table_id: workflow.tableId,
        partition_transition_metadata: expectedSerializedMetadata,
      },
      updatePayload,
      this.buildManagedSplitMutationOptions({
        allowPendingVisibility: !isEpochTransition,
        expectedCacheFields: {
          partition_transition_state: workflow.status,
          partition_transition_metadata: serializedMetadata,
        },
      }),
    );
    if (mutationResult?.success === false) {
      return {accepted: false, workflow};
    }
    const affectedRows = Number(
      mutationResult?.partitionResult?.affectedRows ??
        mutationResult?.affectedRows,
    );
    return {accepted: affectedRows === 1, workflow};
  }
}

export {buildSplitWorkflowOwnerId, ManagedSplitWorkflowOwnershipMethods};
