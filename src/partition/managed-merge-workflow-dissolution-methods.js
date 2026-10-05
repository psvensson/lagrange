import {assertWorkflowRecordHeld} from './managed-workflow-ownership-core.js';
import {SERVICE_TYPE} from '../constants/index.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../workflow/workflow-constants.js';
import {
  GROUP_RETIREMENT_KIND,
  buildGroupRetirementEvidence,
} from './group-retirement-evidence.js';
import {retireFrozenGroupMembers} from './group-retirement-members.js';
import {
  MANAGED_MERGE_LOG_MSG,
  MERGE_ABORT_OUTCOME,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRE_CUTOVER_MERGE_STATES,
} from './partition-constants.js';
import {
  MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  MERGE_ACK_STATUS,
  MERGE_PARTICIPANT_PREFIX,
  buildMergeSourceParticipantKey,
} from './merge-ack-constants.js';

const LOCAL_STR_MERGE_SOURCE_DISSOLUTION = 'merge_source_dissolution';
const LOCAL_NUM_DISSOLUTION_WITNESS_AFFECTED_ROWS = 1;
const LOCAL_STR_MERGE_SOURCE_EXECUTION_FAILURE =
  'merge_source_execution_failure';
const LOCAL_STR_DISSOLVE_SEGMENT = ':dissolve:';

const MERGE_SOURCES_DISSOLVED_STATUSES = Object.freeze(new Set([
  MERGE_ACK_STATUS.SOURCE_DISSOLVED,
]));

/**
 * Resolve one merge source participant's current status.
 * @param {Object} workflow - Workflow snapshot.
 * @param {string} partitionId - Source partition ID.
 * @return {string}
 */
function resolveMergeSourceParticipantStatus(workflow, partitionId) {
  const participant = workflow?.participants instanceof Map ?
    workflow.participants.get(
      buildMergeSourceParticipantKey(partitionId),
    ) :
    null;
  return String(participant?.status || '');
}

/**
 * Dissolution and teardown methods for ManagedMergeWorkflow: retired
 * source raft-group removal (reusing the rebalancer REMOVE_REPLICA node
 * handler), aborted-target teardown, and the terminal transition clear.
 */
// The record states in which a retired group's partitions row may be
// deleted: a merge source after its cutover; an aborted target.
const MERGE_SOURCE_RETIRING_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]));
const ABORTED_RECORD_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.FAILED,
]));

class ManagedMergeWorkflowDissolutionMethods {
  /**
   * Dissolve both retired source partitions once every source participant
   * has removed its mirror: dispatch replica removal to each hosting node
   * and delete the authoritative source partition descriptors. Sources
   * already dissolved are skipped, so a re-delivered SOURCE_MIRROR_REMOVED
   * acknowledgement re-attempts only the sources whose dissolution failed.
   *
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the merge reached its terminal.
   * @private
   */
  finalizeMergeDissolutionIfReady(workflowId) {
    // One run per workflow at a time; a trigger arriving during a run
    // (ack, node-ready, fallback) runs it once more after it.
    return this.groupRetirementRedrive.exclusive(workflowId,
      () => this.finalizeMergeDissolutionStep(workflowId));
  }

  /**
   * One run of the dissolution step (finalizeMergeDissolutionIfReady).
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the merge reached its terminal.
   * @private
   */
  async finalizeMergeDissolutionStep(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isMergeWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (!this.areAllMergeSourcesAtStatus(
      workflow,
      MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
    )) {
      return false;
    }
    const sourcePartitionIds = this.resolveMergeSourcePartitionIds(
      workflow.metadata || {},
    );
    for (const sourcePartitionId of sourcePartitionIds) {
      if (resolveMergeSourceParticipantStatus(workflow, sourcePartitionId) ===
          MERGE_ACK_STATUS.SOURCE_DISSOLVED) {
        continue;
      }
      await this.dissolveMergeSourcePartition(workflowId, sourcePartitionId);
    }
    return this.completeMergeTerminalIfDissolved(workflowId);
  }

  /**
   * Terminal step: once every source is dissolved, clear the durable
   * transition columns so the table is admissible for future split/merge
   * work, and release the in-memory workflow.
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the merge reached its terminal.
   * @private
   */
  async completeMergeTerminalIfDissolved(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isMergeWorkflowStateUnavailable(workflow) ||
        !this.areAllMergeSourcesAtStatus(
          workflow,
          MERGE_SOURCES_DISSOLVED_STATUSES,
        )) {
      return false;
    }
    await this.persistTerminalTransitionClear(workflow);
    this.workflowCoordinator.removeWorkflow(workflowId);
    return true;
  }

  /**
   * Resolve the durable witness for one partitions-row removal: exactly
   * one affected row means the descriptor is durably gone (F14 parity
   * with the split dissolution).
   * @param {Object|null} mutationResult - Gateway mutation result.
   * @return {boolean}
   * @private
   */
  isDissolutionWitnessPersisted(mutationResult) {
    const affectedRows = Number(
      mutationResult?.partitionResult?.affectedRows ??
      mutationResult?.affectedRows ??
      0,
    );
    return mutationResult?.success !== false &&
      affectedRows === LOCAL_NUM_DISSOLUTION_WITNESS_AFFECTED_ROWS;
  }

  /**
   * Dissolve one retired source partition: replica teardown dispatch plus
   * descriptor deletion, acknowledged as SOURCE_DISSOLVED (or
   * DISSOLUTION_FAILED — never a fake success). The SOURCE_DISSOLVED ack
   * is recorded ONLY against the persisted partitions-row witness
   * (affectedRows === 1) and both owner-recorded acks carry the
   * workflow's claim fence token, so dissolution passes the same
   * participant-fence validation as every other ack and can never lead
   * the durable removal.
   * @param {string} workflowId
   * @param {string} sourcePartitionId
   * @return {Promise<void>}
   * @private
   */
  async dissolveMergeSourcePartition(workflowId, sourcePartitionId) {
    const workflow = this.resolveWorkflowState(workflowId);
    const fenceToken = Number.isInteger(workflow?.fenceToken) ?
      workflow.fenceToken :
      null;
    try {
      const dissolvedReplicaIds = await this.dispatchSourceReplicaRemovals(
        workflowId,
        sourcePartitionId,
        buildMergeSourceParticipantKey(sourcePartitionId),
        buildGroupRetirementEvidence({
          kind: GROUP_RETIREMENT_KIND.MERGE_SOURCE,
          workflow,
        }),
      );
      // The row delete is irreversible: this owner proves, at apply time,
      // that it still holds the record (a renewal compare-and-swap).
      await assertWorkflowRecordHeld(this, workflowId,
        MERGE_SOURCE_RETIRING_STATES);
      const deleteWitness =
        await this.deleteSourcePartitionMetadata(sourcePartitionId);
      if (!this.isDissolutionWitnessPersisted(deleteWitness)) {
        throw new Error(MANAGED_MERGE_LOG_MSG.DISSOLUTION_WITNESS_MISSING);
      }
      await this.workflowCoordinator.acknowledgeParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          buildMergeSourceParticipantKey(sourcePartitionId),
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        // The frozen and answered sets are already durable on the
        // participant checkpoint (group-retirement-members.js), kept as is.
        [PARTICIPANT_ACK_FIELD.STATUS]: MERGE_ACK_STATUS.SOURCE_DISSOLVED,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
      this.groupRetirementRedrive.settle(workflowId, sourcePartitionId);
      this.logger.info(MANAGED_MERGE_LOG_MSG.DISSOLUTION_DISPATCHED, {
        workflowId,
        sourcePartitionId,
        dissolvedReplicaIds,
      });
    } catch (error) {
      this.logger.error(MANAGED_MERGE_LOG_MSG.DISSOLUTION_FAILED, {
        workflowId,
        sourcePartitionId,
        error: error?.message || error,
      });
      // The progress so far is durable on the participant checkpoint (each
      // positive answer as it arrived), so a resumed dissolution re-sends
      // only to the frozen members that have not answered.
      await this.workflowCoordinator.acknowledgeParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          buildMergeSourceParticipantKey(sourcePartitionId),
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        [PARTICIPANT_ACK_FIELD.STATUS]: MERGE_ACK_STATUS.DISSOLUTION_FAILED,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
      this.reportIncompleteMergeRetirement(workflowId, sourcePartitionId,
        error, () => this.finalizeMergeDissolutionIfReady(workflowId));
    }
  }

  /**
   * The durable resume of an unfinished dissolution: the finished source
   * re-delivers SOURCE_MIRROR_REMOVED on leader activation (owner restart,
   * ownership change). A duplicate of the persisted status still resumes the
   * step - its fence already passed, and the step is idempotent and
   * exclusive per workflow.
   * @param {string} workflowId
   * @param {Object} ackResult - The coordinator's answer.
   * @param {Object} ack - The acknowledgement.
   * @return {Promise<void>}
   * @private
   */
  async resumeMergeDissolutionOnRedelivery(workflowId, ackResult, ack) {
    if (ackResult?.result === PARTICIPANT_ACK_RESULT.DUPLICATE &&
        ack?.[PARTICIPANT_ACK_FIELD.STATUS] ===
          MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED) {
      await this.finalizeMergeDissolutionIfReady(workflowId);
    }
  }

  /**
   * Hand an incomplete group retirement (members did not acknowledge) to
   * the workflow owner's re-drive (group-retirement-redrive.js).
   * @param {string} workflowId
   * @param {string} partitionId - The retiring group.
   * @param {Error} error - The step's failure.
   * @param {Function} redrive - Re-runs the step.
   * @return {void}
   * @private
   */
  reportIncompleteMergeRetirement(workflowId, partitionId, error, redrive) {
    if (!Array.isArray(error?.unacknowledged)) {
      return;
    }
    this.groupRetirementRedrive.report({workflowId, partitionId,
      unacknowledged: error.unacknowledged,
      superseded: error.superseded === true,
      membershipUnavailable: error.membershipUnavailable === true, redrive});
  }

  /**
   * Execute the serialized abort step: re-validate the CURRENT status
   * inside the lane, persist FAILED (withdrawing the pending epoch), then
   * tear down the never-authoritative target and restore any promoted
   * sibling descriptors.
   *
   * The abort is fail-safe: when the fenced transition is CAS-rejected by
   * the same-owner durable-write race even after the durable-row re-sync,
   * the FAILED mutation is retried with a CAS witness taken from the
   * durable row itself (still gated on this owner's persisted ownerId at
   * the same fence — a foreign claim is never retried). A merge that
   * received a source failure must never be left running pre-cutover
   * because its own ack flush raced its own in-flight write.
   * @param {string} workflowId
   * @param {string} ownerKey
   * @param {string} ackStatus - The failure MERGE_ACK_STATUS received.
   * @param {string} ownerStepLaneSuffix - Owner-lane step key suffix.
   * @return {Promise<boolean>} True when the merge is (now) aborted.
   * @private
   */
  async runMergeAbortStep(workflowId, ownerKey, ackStatus, ownerStepLaneSuffix) {
    let abortOutcome = MERGE_ABORT_OUTCOME.UNRESOLVED;
    try {
      abortOutcome = await this.runMergeOwnerLaneStepWithSameOwnerResync({
        workflowId,
        ownerKey: ownerKey + ownerStepLaneSuffix,
        stepName: PARTITION_TRANSITION_STATE.FAILED,
        execute: async ({workflow: currentWorkflow}) =>
          this.buildMergeAbortStepResult(
            workflowId,
            ackStatus,
            currentWorkflow,
          ),
      });
    } catch (error) {
      if (!this.isMergeStaleFenceTransitionError(error)) {
        throw error;
      }
      abortOutcome = await this.persistOwnedMergeAbortFallback(
        workflowId,
        ackStatus,
        MERGE_ABORT_OUTCOME,
        PRE_CUTOVER_MERGE_STATES,
      );
    }

    if (abortOutcome !== MERGE_ABORT_OUTCOME.ABORTED) {
      return abortOutcome === MERGE_ABORT_OUTCOME.ALREADY_ABORTED;
    }
    const abortedWorkflow = this.resolveWorkflowState(workflowId);
    if (!this.isMergeWorkflowStateUnavailable(abortedWorkflow)) {
      await this.teardownAbortedMergeTarget(workflowId, abortedWorkflow);
      await this.restoreAbortedMergeSiblings(abortedWorkflow);
    }
    this.logger.error(MANAGED_MERGE_LOG_MSG.MERGE_ABORTED_ON_SOURCE_FAILURE, {
      workflowId,
      ackStatus,
    });
    return true;
  }

  /**
   * Build the abort step result from the workflow's CURRENT status.
   * @param {string} workflowId
   * @param {string} ackStatus
   * @param {Object} currentWorkflow
   * @return {Object} Step result carrying a MERGE_ABORT_OUTCOME.
   * @private
   */
  buildMergeAbortStepResult(workflowId, ackStatus, currentWorkflow) {
    if (currentWorkflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return {result: MERGE_ABORT_OUTCOME.ALREADY_ABORTED};
    }
    if (!PRE_CUTOVER_MERGE_STATES.has(currentWorkflow.status)) {
      this.logger.error(
        MANAGED_MERGE_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: currentWorkflow.status, ackStatus},
      );
      return {result: MERGE_ABORT_OUTCOME.REFUSED_POST_CUTOVER};
    }
    return {
      updates: {
        status: PARTITION_TRANSITION_STATE.FAILED,
        metadata: {
          ...(currentWorkflow.metadata || {}),
          [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
            classification: LOCAL_STR_MERGE_SOURCE_EXECUTION_FAILURE,
            message: ackStatus,
            failedAt: new Date(this.now()).toISOString(),
            retryable: true,
          },
        },
      },
      result: MERGE_ABORT_OUTCOME.ABORTED,
    };
  }

  /**
   * Tear down the provisioned merged target of an aborted merge: dispatch
   * replica removal for its raft group and delete its descriptor row. The
   * abort transition has already withdrawn the pending epoch, so even a
   * failed teardown leaves the target non-authoritative.
   * @param {string} workflowId
   * @param {Object} workflow - Workflow snapshot at abort time.
   * @return {Promise<void>}
   * @private
   */
  async teardownAbortedMergeTarget(workflowId, workflow) {
    const targetPartitionId = this.resolveMergeTargetPartitionId(
      workflow.metadata || {},
    );
    if (!targetPartitionId) {
      return;
    }
    await this.groupRetirementRedrive.exclusive(
      `${workflowId}:${targetPartitionId}`, async () => {
        try {
          await this.dispatchSourceReplicaRemovals(workflowId,
            targetPartitionId, MERGE_PARTICIPANT_PREFIX.MERGED_TARGET,
            buildGroupRetirementEvidence({
              kind: GROUP_RETIREMENT_KIND.MERGE_ABORTED_TARGET,
              workflow,
            }));
          await assertWorkflowRecordHeld(this, workflowId,
            ABORTED_RECORD_STATES);
          await this.deleteSourcePartitionMetadata(targetPartitionId);
          this.groupRetirementRedrive.settle(workflowId, targetPartitionId);
        } catch (error) {
          this.logger.warn(MANAGED_MERGE_LOG_MSG.TARGET_TEARDOWN_FAILED, {
            workflowId,
            targetPartitionId,
            error: error?.message || error,
          });
          this.reportIncompleteMergeRetirement(workflowId, targetPartitionId,
            error, () => this.teardownAbortedMergeTarget(workflowId,
              workflow));
        }
      });
  }

  /**
   * Restore any carried-forward sibling descriptors back to the active
   * epoch after an abort. If the cutover step never promoted them this is
   * a no-op update; if the abort raced a cutover that had already promoted
   * siblings but was refused, this prevents their key ranges from being
   * stranded at the withdrawn epoch.
   * @param {Object} workflow - Workflow snapshot at abort time.
   * @return {Promise<void>}
   * @private
   */
  async restoreAbortedMergeSiblings(workflow) {
    const siblingPartitionIds =
      this.resolveCutoverSiblingPartitionIds(workflow);
    if (siblingPartitionIds.length === 0) {
      return;
    }
    const activeVersion = this.resolveActivePartitionVersion(
      this.getTableInfo(workflow.tableName || workflow.tableId),
    );
    for (const siblingPartitionId of siblingPartitionIds) {
      await this.promoteSiblingPartitionVersion(
        siblingPartitionId,
        activeVersion,
      );
    }
    this.logger.info(
      MANAGED_MERGE_LOG_MSG.SIBLINGS_RESTORED_AFTER_ABORT,
      {
        workflowId: workflow.workflowId,
        siblingPartitionIds,
        activeVersion,
      },
    );
  }

  /**
   * Dispatch REMOVE_REPLICA to every frozen member of one retired group (a
   * dissolved source or an aborted merge target): the group's committed
   * configuration frozen on its participant at the first dispatch
   * (group-retirement-members.js). The group ends as a unit (owner decision
   * 2026-10-04): every REMOVE carries the workflow's group-retirement
   * evidence.
   * @param {string} workflowId
   * @param {string} sourcePartitionId
   * @param {string} participantKey - The group's participant.
   * @param {Object} groupRetirement - buildGroupRetirementEvidence's
   *   evidence for this retired group.
   * @return {Promise<string[]>} Every positively answered replica id;
   *   throws (unacknowledged members) until every frozen member answered.
   * @private
   */
  dispatchSourceReplicaRemovals(workflowId, sourcePartitionId,
    participantKey, groupRetirement) {
    return retireFrozenGroupMembers(this, {
      workflowId,
      participantKey,
      partitionId: sourcePartitionId,
      deliver: ({replicaId, nodeId}) => this.deliverReplicaRemoval({
        nodeId,
        message: this.buildReplicaRemovalMessage({
          workflowId,
          partitionId: sourcePartitionId,
          replicaId,
          groupRetirement,
        }),
      }),
    });
  }

  /**
   * Build one REMOVE_REPLICA request for the node replica handler.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildReplicaRemovalMessage(options) {
    return {
      [ReplicaOperationField.TYPE]:
        ReplicaOperationMessageType.REMOVE_REPLICA,
      [ReplicaOperationField.OPERATION_ID]:
        options.workflowId + LOCAL_STR_DISSOLVE_SEGMENT + options.replicaId,
      [ReplicaOperationField.OPERATION_TYPE]: OperationType.REMOVE,
      [ReplicaOperationField.PARTITION_ID]: options.partitionId,
      [ReplicaOperationField.REPLICA_ID]: options.replicaId,
      [ReplicaOperationField.ENTITY_TYPE]: SERVICE_TYPE.PARTITION,
      [ReplicaOperationField.ENTITY_ID]: options.partitionId,
      [ReplicaOperationField.REASON]: LOCAL_STR_MERGE_SOURCE_DISSOLUTION,
      [ReplicaOperationField.GROUP_RETIREMENT]: options.groupRetirement,
    };
  }
}

export {ManagedMergeWorkflowDissolutionMethods};
