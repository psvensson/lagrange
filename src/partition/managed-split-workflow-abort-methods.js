import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  PRE_CUTOVER_SPLIT_STATES,
  SPLIT_OWNER_STEP_LANE_SUFFIX,
} from './managed-split-workflow-execution-gate-methods.js';

const LOCAL_STR_SPLIT_SOURCE_EXECUTION_FAILURE =
  'split_source_execution_failure';

/**
 * Outcome variants of one lane-serialized split abort step.
 * @enum {string}
 */
const SPLIT_ABORT_OUTCOME = Object.freeze({
  ABORTED: 'aborted',
  ALREADY_ABORTED: 'already_aborted',
  REFUSED_POST_CUTOVER: 'refused_post_cutover',
});

/**
 * Fail-safe abort methods for ManagedSplitWorkflow: a pre-cutover
 * source failure acknowledgement persists a FAILED transition (whose
 * durable mutation withdraws pending_partition_version, leaving the
 * source partition authoritative) and tears down the provisioned-but-
 * never-authoritative children. Extracted verbatim from the execution
 * gate module; the owner lane, fence, and state semantics are unchanged.
 */
class ManagedSplitWorkflowAbortMethods {
  /**
   * Abort the split fail-safe on a pre-cutover source failure
   * acknowledgement: persist a FAILED transition (whose durable
   * mutation withdraws pending_partition_version, leaving the source
   * partition authoritative) and tear down the provisioned-but-never-
   * authoritative children. Post-cutover failures are recorded but
   * cannot un-promote the epoch.
   * @param {string} workflowId
   * @param {string} ackStatus - The failure SPLIT_ACK_STATUS received.
   * @return {Promise<boolean>} True when the split is (now) aborted.
   * @private
   */
  async abortSplitOnSourceFailure(workflowId, ackStatus) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return true;
    }
    if (!PRE_CUTOVER_SPLIT_STATES.has(workflow.status)) {
      this.logger.error(
        MANAGED_SPLIT_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: workflow.status, ackStatus},
      );
      return false;
    }

    // The FAILED persist AND the child teardown run in one FIFO owner-
    // lane slot: nothing can interleave a cutover between them, and any
    // cutover step enqueued later re-validates against the FAILED
    // status.
    return this.runSerializedOwnerStep(workflow.ownerKey, () =>
      this.runSplitAbortStep(workflowId, workflow.ownerKey, ackStatus));
  }

  /**
   * Execute the serialized abort step: re-validate the CURRENT status
   * inside the lane, persist FAILED (withdrawing the pending epoch)
   * through the FENCED transition path, then tear down the never-
   * authoritative children and restore any promoted sibling descriptors.
   * F18 residual: the split abort was the last unfenced owner-lane
   * transition write; the step result now carries the renewed ownership
   * fenceToken/ownerId exactly like the phase-advance path, engaging
   * the storage-backed assertTransitionFence.
   * @param {string} workflowId
   * @param {string} ownerKey
   * @param {string} ackStatus - The failure SPLIT_ACK_STATUS received.
   * @return {Promise<boolean>} True when the split is (now) aborted.
   * @private
   */
  async runSplitAbortStep(workflowId, ownerKey, ackStatus) {
    const abortOutcome = await this.workflowStepRunner.runStep({
      workflowId,
      ownerKey: ownerKey + SPLIT_OWNER_STEP_LANE_SUFFIX,
      stepName: PARTITION_TRANSITION_STATE.FAILED,
      execute: async ({workflow: currentWorkflow}) =>
        this.buildSplitAbortStepResult(workflowId, ackStatus, currentWorkflow, {
          ownership: await this.renewSplitWorkflowOwnership(workflowId),
        }),
    });

    if (abortOutcome !== SPLIT_ABORT_OUTCOME.ABORTED) {
      return abortOutcome === SPLIT_ABORT_OUTCOME.ALREADY_ABORTED;
    }
    const abortedWorkflow = this.resolveWorkflowState(workflowId);
    if (!this.isSplitWorkflowStateUnavailable(abortedWorkflow)) {
      await this.teardownAbortedSplitChildren(workflowId, abortedWorkflow);
      await this.restoreAbortedSplitSiblings(abortedWorkflow);
    }
    this.logger.error(
      MANAGED_SPLIT_LOG_MSG.SPLIT_ABORTED_ON_SOURCE_FAILURE,
      {workflowId, ackStatus},
    );
    return true;
  }

  /**
   * Build the abort step result from the workflow's CURRENT status.
   * @param {string} workflowId
   * @param {string} ackStatus
   * @param {Object} currentWorkflow
   * @param {Object} [options]
   * @param {Object} [options.ownership] - Renewed ownership claim
   *   ({fenceToken, ownerId}) stamped on the abort transition (F18).
   * @return {Object} Step result carrying a SPLIT_ABORT_OUTCOME.
   * @private
   */
  buildSplitAbortStepResult(
    workflowId,
    ackStatus,
    currentWorkflow,
    options = {},
  ) {
    if (currentWorkflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return {result: SPLIT_ABORT_OUTCOME.ALREADY_ABORTED};
    }
    if (!PRE_CUTOVER_SPLIT_STATES.has(currentWorkflow.status)) {
      this.logger.error(
        MANAGED_SPLIT_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: currentWorkflow.status, ackStatus},
      );
      return {result: SPLIT_ABORT_OUTCOME.REFUSED_POST_CUTOVER};
    }
    return {
      nextStep: PARTITION_TRANSITION_STATE.FAILED,
      reason: PARTITION_TRANSITION_STATE.FAILED,
      fenceToken: options.ownership?.fenceToken,
      ownerId: options.ownership?.ownerId,
      updates: {
        status: PARTITION_TRANSITION_STATE.FAILED,
        metadata: {
          ...(currentWorkflow.metadata || {}),
          [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
            classification: LOCAL_STR_SPLIT_SOURCE_EXECUTION_FAILURE,
            message: ackStatus,
            failedAt: new Date(this.now()).toISOString(),
            retryable: true,
          },
        },
      },
      result: SPLIT_ABORT_OUTCOME.ABORTED,
    };
  }
}

export {ManagedSplitWorkflowAbortMethods};
