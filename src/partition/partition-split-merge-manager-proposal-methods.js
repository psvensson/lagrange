/**
 * Outstanding durable split proposals: the manager is the one re-driver.
 *
 * A split that admission refuses (BLOCKED / DEFERRED) is already recorded
 * durably by the split workflow: a retryable split transition on the
 * tables row naming the source partition, with retry.attemptCount and
 * retry.nextAttemptAt. That record IS the request. The durable record does
 * not say who made it (an explicit engine.executeManagedSplit call or this
 * manager on a threshold), so:
 *  - a proposal THIS manager originated on the policy in this process
 *    lifetime is re-driven only through the policy: the threshold loop
 *    re-proposes it while it still qualifies, and it is not re-driven once
 *    its trigger is gone;
 *  - every other proposal (explicit, or the policy's from before a
 *    restart, which the record cannot tell apart) is re-driven regardless
 *    of the split thresholds. Telling those apart needs a durable origin
 *    marker (requestedBy: explicit|policy) in the transition metadata,
 *    which the split workflow (the record's writer) owns.
 * The re-drive:
 *  - when the record's own retry is due and this node leads the source
 *    (the workflow refuses an attempt before nextAttemptAt);
 *  - woken by the events that change it: the tables-row write of the
 *    proposal and the source partition's leader-row change (the table
 *    creation service's cache listener requests an evaluation), and, for
 *    a not-yet-due record, by the manager's deferred-retry scheduler at the
 *    record's nextAttemptAt;
 *  - at most OUTSTANDING_SPLIT_MAX_ATTEMPTS attempts; then the spent bound
 *    is reported once per workflow and the record stays as the visible
 *    durable state (no silent drop, no endless retry).
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_LOG_MSG,
  SPLIT_MERGE_REASON,
} from './partition-constants.js';
import {isRetryableManagedSplitTransition} from './managed-split-retry-policy.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

/**
 * Describe the outstanding durable split proposal one tables row carries,
 * if any: a retryable split transition (one source partition; a merge
 * names several) per the one retryable-transition classifier.
 * @param {Object} transition - Parsed {state, metadata} of the tables row.
 * @param {Object} context - {tableId, nowMs}.
 * @return {Object|null} Proposal descriptor (without localLeader).
 */
function describeOutstandingSplitProposal(transition, context) {
  const partitionId = resolveOutstandingSplitSourceId(transition);
  if (!partitionId) {
    return null;
  }
  const metadata = transition.metadata;
  const retry = metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] || {};
  const admission = metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION];
  return {
    partitionId,
    tableId: context.tableId || null,
    workflowId:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || null,
    state: transition.state,
    attemptCount: Number(retry.attemptCount) || 0,
    nextAttemptAt: retry.nextAttemptAt || null,
    retryDue: resolveProposalRetryDue(retry.nextAttemptAt, context.nowMs),
    blockingReasons: Array.isArray(admission?.blockingReasons) ?
      [...admission.blockingReasons] :
      [],
  };
}

/**
 * The source partition id of a retryable split transition, else null.
 * @param {Object|null} transition - Parsed {state, metadata}.
 * @return {string|null}
 */
function resolveOutstandingSplitSourceId(transition) {
  const metadata = transition?.metadata;
  if (!metadata || typeof metadata !== LOCAL_STR_OBJECT ||
      !isRetryableManagedSplitTransition(transition)) {
    return null;
  }
  const partitionId =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
  return partitionId ? String(partitionId) : null;
}

/**
 * Whether a proposal's retry is due. A record without a parseable schedule
 * is due.
 * @param {string|undefined} nextAttemptAt - Persisted schedule.
 * @param {number} nowMs - Clock reading.
 * @return {boolean}
 */
function resolveProposalRetryDue(nextAttemptAt, nowMs) {
  const nextAttemptAtMs = Date.parse(String(nextAttemptAt || ''));
  return !Number.isFinite(nextAttemptAtMs) || nextAttemptAtMs <= nowMs;
}

const OUTSTANDING_SPLIT_PROPOSAL_WAIT = Object.freeze({
  wait: 'outstanding_split_proposal_attempts',
  awaited: 'split admission of the outstanding durable split proposal',
});

class PartitionSplitMergeManagerProposalMethods {
  /**
   * Load the outstanding durable split proposals.
   * @return {Promise<Array<Object>>} Proposal descriptors.
   * @private
   */
  async loadOutstandingSplitProposals() {
    if (typeof this.listOutstandingSplitProposals !== LOCAL_STR_FUNCTION) {
      return [];
    }
    const proposals = await this.listOutstandingSplitProposals();
    return Array.isArray(proposals) ? proposals : [];
  }

  /**
   * Whether one proposal has spent its attempt bound.
   * @param {Object} proposal - Proposal descriptor.
   * @return {boolean}
   * @private
   */
  isOutstandingSplitProposalSpent(proposal) {
    return Number(proposal?.attemptCount) >=
      SPLIT_MERGE_DEFAULT.OUTSTANDING_SPLIT_MAX_ATTEMPTS;
  }

  /**
   * Report one spent proposal (folded per workflow by the reporter).
   * @param {Object} proposal - Proposal descriptor.
   * @return {void}
   * @private
   */
  reportOutstandingSplitProposalSpent(proposal) {
    reportWaitBoundSpent(this.logger, {
      ...OUTSTANDING_SPLIT_PROPOSAL_WAIT,
      boundMs: null,
      subject: proposal.workflowId || proposal.partitionId,
      lastObserved: () => ({
        state: proposal.state || null,
        attemptCount: Number(proposal.attemptCount) || 0,
        maxAttempts: SPLIT_MERGE_DEFAULT.OUTSTANDING_SPLIT_MAX_ATTEMPTS,
        blockingReasons: Array.isArray(proposal.blockingReasons) ?
          proposal.blockingReasons :
          [],
        nextAttemptAt: proposal.nextAttemptAt || null,
      }),
      scope: {
        nodeId: this.nodeId,
        partitionId: proposal.partitionId,
        tableId: proposal.tableId || null,
        workflowId: proposal.workflowId || null,
      },
    });
  }

  /**
   * Resolve the source partitions this evaluation re-drives.
   * @param {Array<Object>} proposals - Outstanding proposals.
   * @param {Set<string>} listedPartitionIds - Partitions this evaluation
   *   lists (local leaders, retry due).
   * @return {string[]} Source partition ids to re-drive.
   * @private
   */
  resolveOutstandingSplitRedrives(proposals, listedPartitionIds) {
    this.forgetUnlistedPolicySplitSources(listedPartitionIds);
    const redrives = [];
    for (const proposal of proposals) {
      const partitionId = proposal?.partitionId;
      if (!partitionId || proposal.localLeader !== true) {
        // The source's leader's manager owns it; a leader-row change wakes
        // whichever manager becomes the leader.
        continue;
      }
      if (this.isOutstandingSplitProposalSpent(proposal)) {
        this.reportOutstandingSplitProposalSpent(proposal);
        continue;
      }
      if (proposal.retryDue !== true) {
        this.scheduleDeferredManagedSplitRetry(partitionId, {
          retry: {nextAttemptAt: proposal.nextAttemptAt},
        });
        continue;
      }
      if (!listedPartitionIds.has(partitionId) ||
          this.policySplitSources.has(partitionId)) {
        // A policy proposal of this manager is re-checked by the threshold
        // loop instead.
        continue;
      }
      this.logger.info(SPLIT_MERGE_LOG_MSG.OUTSTANDING_SPLIT_REDRIVEN, {
        partitionId,
        workflowId: proposal.workflowId || null,
        state: proposal.state || null,
        attemptCount: Number(proposal.attemptCount) || 0,
        reason: SPLIT_MERGE_REASON.OUTSTANDING_SPLIT_PROPOSAL,
      });
      redrives.push(partitionId);
    }
    return redrives;
  }

  /**
   * Record the split candidates this evaluation proposed on the policy.
   * @param {string[]} partitionIds - Policy split candidates.
   * @return {void}
   * @private
   */
  notePolicySplitSources(partitionIds) {
    for (const partitionId of partitionIds) {
      this.policySplitSources.add(partitionId);
    }
  }

  /**
   * Forget policy split sources this node no longer lists (split done,
   * dissolved, or no longer led here): the set is bounded by the listed
   * partitions.
   * @param {Set<string>} listedPartitionIds - Partitions listed now.
   * @return {void}
   * @private
   */
  forgetUnlistedPolicySplitSources(listedPartitionIds) {
    for (const partitionId of this.policySplitSources) {
      if (!listedPartitionIds.has(partitionId)) {
        this.policySplitSources.delete(partitionId);
      }
    }
  }
}

function createPartitionSplitMergeManagerProposalMethods() {
  const methods = {};
  const names = Object.getOwnPropertyNames(
    PartitionSplitMergeManagerProposalMethods.prototype,
  );
  for (const name of names) {
    if (name !== LOCAL_STR_CONSTRUCTOR) {
      methods[name] = PartitionSplitMergeManagerProposalMethods.prototype[name];
    }
  }
  return methods;
}

export {
  createPartitionSplitMergeManagerProposalMethods,
  describeOutstandingSplitProposal,
};
