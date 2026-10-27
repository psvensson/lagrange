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
  groupRetirementOperationIdOf,
} from './group-retirement-evidence.js';
import {retireFrozenGroupMembers} from './group-retirement-members.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from './split-ack-constants.js';

const LOCAL_STR_SPLIT_SOURCE_DISSOLUTION = 'split_source_dissolution';
const LOCAL_NUM_DISSOLUTION_WITNESS_AFFECTED_ROWS = 1;
const LOCAL_STR_SPLIT_ABORTED_CHILD_TEARDOWN = 'split_aborted_child_teardown';
const LOCAL_STR_NORMAL_PARTITION_STATE = 'NORMAL';

/**
 * Durable statuses from which the terminal dissolving advance is
 * admissible: the cutover must already be active (or the dissolving
 * phase already reached, so a retried terminal step is idempotent).
 * @type {ReadonlySet<string>}
 */
const SPLIT_TERMINAL_PREDECESSOR_STATUSES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
]));

/**
 * The participant of one split child (left = the first target, right = the
 * second), whose checkpoint carries that child group's frozen members.
 * @param {Object} workflow - Workflow snapshot.
 * @param {string} childPartitionId
 * @return {string}
 */
function splitChildParticipantKey(workflow, childPartitionId) {
  const targetPartitionIds = workflow?.metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
  return Array.isArray(targetPartitionIds) &&
    targetPartitionIds.indexOf(childPartitionId) === 0 ?
    SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD :
    SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD;
}

/**
 * Dissolution and teardown methods for ManagedSplitWorkflow: retired
 * source raft-group removal (reusing the rebalancer REMOVE_REPLICA node
 * handler), aborted-child teardown, sibling restore, and the terminal
 * transition clear. Ported from the merge dissolution template — the
 * split is the mirror image: one source retires after its children
 * become authoritative, and an abort keeps the source while tearing
 * down the never-authoritative children.
 */
// The record states in which a retired group's partitions row may be
// deleted: a split source after its cutover; an aborted child.
const SPLIT_SOURCE_RETIRING_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
]));
const ABORTED_RECORD_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.FAILED,
]));

class ManagedSplitWorkflowDissolutionMethods {
  /**
   * Resolve the non-participating sibling partitions of one split: every
   * partitions row of the same table at the ACTIVE epoch, state NORMAL,
   * excluding the split source and the two child targets. Without
   * carry-forward these rows become unroutable the instant the cutover
   * promotes the epoch (routing requires partition_version to equal the
   * table's active version exactly).
   * @param {Object} options
   * @param {string} options.tableId
   * @param {Object} options.tableInfo
   * @param {string} options.sourcePartitionId
   * @param {string[]} [options.targetPartitionIds]
   * @return {string[]} Sibling partition ids.
   * @private
   */
  resolveSplitSiblingPartitionIds(options) {
    const activeVersion = this.resolveActivePartitionVersion(
      options.tableInfo,
    );
    const excludedPartitionIds = new Set([
      String(options.sourcePartitionId || ''),
      ...(Array.isArray(options.targetPartitionIds) ?
        options.targetPartitionIds :
        []),
    ]);
    return this.listTablePartitionRows(options.tableId)
      .map((partitionRow) => ({
        partitionId: String(
          partitionRow?.partition_id ?? partitionRow?.partitionId ?? '',
        ),
        partitionVersion: Number(
          partitionRow?.partition_version ?? partitionRow?.partitionVersion,
        ),
        rowState: String(
          partitionRow?.state ?? LOCAL_STR_NORMAL_PARTITION_STATE,
        ),
      }))
      .filter((row) =>
        row.partitionId.length > 0 &&
        !excludedPartitionIds.has(row.partitionId) &&
        row.partitionVersion === activeVersion &&
        row.rowState === LOCAL_STR_NORMAL_PARTITION_STATE)
      .map((row) => row.partitionId);
  }

  /**
   * Resolve the sibling set to carry forward at cutover: the union of
   * the plan-time sibling set persisted in the workflow metadata and a
   * fresh recomputation against the authoritative partitions rows (the
   * transition gate prevents concurrent topology changes, so these
   * should match; the union is the safe superset — promoting a
   * descriptor that no longer exists is a no-op update).
   * @param {Object} workflow - Workflow snapshot.
   * @return {string[]} Sibling partition ids to promote.
   * @private
   */
  resolveCutoverSiblingPartitionIds(workflow) {
    const metadata = workflow?.metadata || {};
    const plannedSiblingIds =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS];
    const freshSiblingIds = this.resolveSplitSiblingPartitionIds({
      tableId: workflow.tableId,
      tableInfo: this.getTableInfo(workflow.tableName || workflow.tableId),
      sourcePartitionId: String(
        metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] ||
        workflow.partitionId ||
        '',
      ),
      targetPartitionIds:
        metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
    });
    const siblingPartitionIds = new Set(freshSiblingIds);
    for (const partitionId of Array.isArray(plannedSiblingIds) ?
      plannedSiblingIds : []) {
      const normalizedPartitionId = String(partitionId || '');
      if (normalizedPartitionId) {
        siblingPartitionIds.add(normalizedPartitionId);
      }
    }
    return [...siblingPartitionIds];
  }

  /**
   * Resolve the source participant's current status on one workflow.
   * @param {Object} workflow - Workflow snapshot.
   * @return {string}
   * @private
   */
  resolveSplitSourceParticipantStatus(workflow) {
    const participant = workflow?.participants instanceof Map ?
      workflow.participants.get(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) :
      null;
    return String(participant?.status || '');
  }

  /**
   * Resolve whether a workflow snapshot is missing or carries no
   * durable state (mirrors isMergeWorkflowStateUnavailable).
   * @param {Object|null} workflow - Workflow snapshot.
   * @return {boolean}
   * @private
   */
  isSplitWorkflowStateUnavailable(workflow) {
    return !workflow || !workflow.workflowId;
  }


  /**
   * Dissolve the retired source partition once the source participant
   * has removed its mirror: dispatch replica removal to each hosting
   * node and delete the authoritative source partition descriptor. A
   * source already dissolved is skipped, so a re-delivered
   * CLEANUP_COMPLETED acknowledgement re-attempts only a dissolution
   * that previously failed.
   *
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the split reached its terminal.
   * @private
   */
  finalizeSplitDissolutionIfReady(workflowId) {
    // One run per workflow at a time; a trigger arriving during a run
    // (ack, node-ready, fallback) runs it once more after it.
    return this.groupRetirementRedrive.exclusive(workflowId,
      () => this.finalizeSplitDissolutionStep(workflowId));
  }

  /**
   * One run of the dissolution step (finalizeSplitDissolutionIfReady).
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the split reached its terminal.
   * @private
   */
  async finalizeSplitDissolutionStep(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (!SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES.has(
      this.resolveSplitSourceParticipantStatus(workflow),
    )) {
      return false;
    }
    if (
      this.resolveSplitSourceParticipantStatus(workflow) !==
        SPLIT_ACK_STATUS.SOURCE_DISSOLVED
    ) {
      await this.dissolveSplitSourcePartition(workflowId);
    }
    return this.completeSplitTerminalIfDissolved(workflowId);
  }

  /**
   * Terminal step: once the source is dissolved, advance through the
   * dissolving phase, clear the durable transition columns so the table
   * is admissible for future split/merge work, emit the terminal
   * SPLIT_COMPLETED signal, and release the in-memory workflow.
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the split reached its terminal.
   * @private
   */
  async completeSplitTerminalIfDissolved(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow) ||
        this.resolveSplitSourceParticipantStatus(workflow) !==
          SPLIT_ACK_STATUS.SOURCE_DISSOLVED) {
      return false;
    }
    await this.advanceSplitPhase(
      workflowId,
      PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
      {},
      SPLIT_TERMINAL_PREDECESSOR_STATUSES,
    );
    const terminalWorkflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(terminalWorkflow) ||
        terminalWorkflow.status !==
          PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING) {
      return false;
    }
    await this.persistTerminalTransitionClear(terminalWorkflow);
    this.emitTerminalSplitCompleted(terminalWorkflow);
    this.workflowCoordinator.removeWorkflow(workflowId);
    return true;
  }

  /**
   * Resolve the durable witness for one partitions-row removal: exactly
   * one affected row means the descriptor is durably gone. Anything else
   * (no mutation result, zero rows, or more than one) is NOT a witness —
   * recording dissolution against it would let a crashed owner believe a
   * source is dissolved while its durable row survives (F14).
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
   * Dissolve the retired source partition: replica teardown dispatch
   * plus descriptor deletion, acknowledged as SOURCE_DISSOLVED (or
   * DISSOLUTION_FAILED — never a fake success). The SOURCE_DISSOLVED ack
   * is recorded ONLY against the persisted partitions-row witness
   * (affectedRows === 1) and both owner-recorded acks carry the
   * workflow's claim fence token, so dissolution passes the same
   * participant-fence validation as every other ack and can never lead
   * the durable removal.
   * @param {string} workflowId
   * @return {Promise<void>}
   * @private
   */
  async dissolveSplitSourcePartition(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    const sourcePartitionId = String(
      workflow?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID
      ] || workflow?.partitionId || '',
    );
    const fenceToken = Number.isInteger(workflow?.fenceToken) ?
      workflow.fenceToken :
      null;
    try {
      const dissolvedReplicaIds = await this.dispatchSplitReplicaRemovals(
        workflowId,
        sourcePartitionId,
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        LOCAL_STR_SPLIT_SOURCE_DISSOLUTION,
        buildGroupRetirementEvidence({
          kind: GROUP_RETIREMENT_KIND.SPLIT_SOURCE,
          workflow,
        }),
      );
      // The row delete is irreversible: this owner proves, at apply time,
      // that it still holds the record (a renewal compare-and-swap).
      await assertWorkflowRecordHeld(this, workflowId,
        SPLIT_SOURCE_RETIRING_STATES);
      const deleteWitness =
        await this.deletePartitionMetadata(sourcePartitionId);
      if (!this.isDissolutionWitnessPersisted(deleteWitness)) {
        throw new Error(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_WITNESS_MISSING);
      }
      await this.workflowCoordinator.acknowledgeOwnerOutcome(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        // The frozen and answered sets are already durable on the
        // participant checkpoint (group-retirement-members.js), kept as is.
        [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
      this.groupRetirementRedrive.settle(workflowId, sourcePartitionId);
      this.logger.info(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED, {
        workflowId,
        sourcePartitionId,
        dissolvedReplicaIds,
      });
    } catch (error) {
      await this.recordSplitDissolutionFailure(workflowId, sourcePartitionId,
        fenceToken, error);
    }
  }

  /**
   * A dissolution that did not complete: logged, recorded on the source
   * participant (the progress so far is durable on its checkpoint - each
   * positive answer as it arrived - so a resumed dissolution re-sends only to
   * the frozen members that have not answered) unless this owner was
   * superseded (the record is another owner's: it records nothing), and
   * handed to the re-drive (told it was superseded, when it was).
   * @param {string} workflowId
   * @param {string} sourcePartitionId
   * @param {number|null} fenceToken
   * @param {Error} error
   * @return {Promise<void>}
   * @private
   */
  async recordSplitDissolutionFailure(workflowId, sourcePartitionId,
    fenceToken, error) {
    this.logger.error(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_FAILED, {
      workflowId,
      sourcePartitionId,
      error: error?.message || error,
    });
    if (error?.superseded !== true) {
      await this.workflowCoordinator.acknowledgeOwnerOutcome(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      }).catch((ackError) => {
        // Not recorded (typed and logged by the coordinator, or the
        // workflow is gone): the re-drive below still runs.
        this.logger.error(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_FAILED, {workflowId,
          sourcePartitionId, failureUnrecorded: true,
          error: ackError?.message || ackError});
      });
    }
    this.reportIncompleteGroupRetirement(workflowId, sourcePartitionId,
      error, () => this.finalizeSplitDissolutionIfReady(workflowId));
  }

  /**
   * The durable resume of an unfinished dissolution: the finished source
   * re-delivers CLEANUP_COMPLETED on leader activation (owner restart,
   * ownership change). A re-delivery that is a duplicate of the persisted
   * status still resumes the step - its fence already passed (a stale fence
   * is rejected before duplicates), and the step is idempotent and
   * exclusive per workflow.
   * @param {string} workflowId
   * @param {Object} ackResult - The coordinator's answer.
   * @param {Object} ack - The acknowledgement.
   * @return {Promise<void>}
   * @private
   */
  async resumeSplitDissolutionOnRedelivery(workflowId, ackResult, ack) {
    if (ackResult?.result === PARTICIPANT_ACK_RESULT.DUPLICATE &&
        ack?.[PARTICIPANT_ACK_FIELD.STATUS] ===
          SPLIT_ACK_STATUS.CLEANUP_COMPLETED) {
      await this.finalizeSplitDissolutionIfReady(workflowId);
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
  reportIncompleteGroupRetirement(workflowId, partitionId, error, redrive) {
    if (!Array.isArray(error?.unacknowledged)) {
      return;
    }
    this.groupRetirementRedrive.report({workflowId, partitionId,
      unacknowledged: error.unacknowledged,
      superseded: error.superseded === true,
      membershipUnavailable: error.membershipUnavailable === true, redrive});
  }

  /**
   * Tear down the provisioned children of an aborted split: dispatch
   * replica removal for their raft groups and delete their descriptor
   * rows. The abort transition has already withdrawn the pending epoch,
   * so even a failed teardown leaves the children non-authoritative
   * (the source partition stays authoritative at the active epoch).
   * @param {string} workflowId
   * @param {Object} workflow - Workflow snapshot at abort time.
   * @return {Promise<void>}
   * @private
   */
  async teardownAbortedSplitChildren(workflowId, workflow) {
    const targetPartitionIds = Array.isArray(
      workflow?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ],
    ) ?
      workflow.metadata[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ] :
      [];
    for (const childPartitionId of targetPartitionIds) {
      await this.teardownAbortedSplitChild(workflowId, workflow,
        childPartitionId);
    }
  }

  /**
   * Tear down one aborted child; members that did not acknowledge leave the
   * child's row in place and go to the owner's re-drive.
   * @param {string} workflowId
   * @param {Object} workflow - Workflow snapshot at abort time.
   * @param {string} childPartitionId
   * @return {Promise<void>}
   * @private
   */
  teardownAbortedSplitChild(workflowId, workflow, childPartitionId) {
    return this.groupRetirementRedrive.exclusive(
      `${workflowId}:${childPartitionId}`, async () => {
        try {
          await this.dispatchSplitReplicaRemovals(
            workflowId,
            childPartitionId,
            splitChildParticipantKey(workflow, childPartitionId),
            LOCAL_STR_SPLIT_ABORTED_CHILD_TEARDOWN,
            buildGroupRetirementEvidence({
              kind: GROUP_RETIREMENT_KIND.SPLIT_ABORTED_CHILD,
              workflow,
            }),
          );
          await assertWorkflowRecordHeld(this, workflowId,
            ABORTED_RECORD_STATES);
          await this.deletePartitionMetadata(childPartitionId);
          this.groupRetirementRedrive.settle(workflowId, childPartitionId);
        } catch (error) {
          this.logger.warn(MANAGED_SPLIT_LOG_MSG.CHILD_TEARDOWN_FAILED, {
            workflowId,
            childPartitionId,
            error: error?.message || error,
          });
          this.reportIncompleteGroupRetirement(workflowId, childPartitionId,
            error, () => this.teardownAbortedSplitChild(workflowId, workflow,
              childPartitionId));
        }
      });
  }

  /**
   * Restore any carried-forward sibling descriptors back to the active
   * epoch after an abort. If the cutover step never promoted them this
   * is a no-op update; if the abort raced a cutover that had already
   * promoted siblings but was refused, this prevents their key ranges
   * from being stranded at the withdrawn epoch.
   * @param {Object} workflow - Workflow snapshot at abort time.
   * @return {Promise<void>}
   * @private
   */
  async restoreAbortedSplitSiblings(workflow) {
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
      MANAGED_SPLIT_LOG_MSG.SIBLINGS_RESTORED_AFTER_ABORT,
      {
        workflowId: workflow.workflowId,
        siblingPartitionIds,
        activeVersion,
      },
    );
  }

  /**
   * Dispatch REMOVE_REPLICA to every frozen member of one retired group
   * (the dissolved source or an aborted child): the group's committed
   * configuration frozen on its participant at the first dispatch
   * (group-retirement-members.js). The group ends as a unit (owner decision
   * 2026-10-04): every REMOVE carries the workflow's group-retirement
   * evidence.
   * @param {string} workflowId
   * @param {string} partitionId
   * @param {string} participantKey - The group's participant.
   * @param {string} reason - Replica-removal reason label.
   * @param {Object} groupRetirement - buildGroupRetirementEvidence's
   *   evidence for this retired group.
   * @return {Promise<string[]>} Every positively answered replica id;
   *   throws (unacknowledged members) until every frozen member answered.
   * @private
   */
  dispatchSplitReplicaRemovals(workflowId, partitionId, participantKey,
    reason, groupRetirement) {
    return retireFrozenGroupMembers(this, {
      workflowId,
      participantKey,
      partitionId,
      deliver: ({replicaId, nodeId}) => this.deliverReplicaRemoval({
        nodeId,
        message: this.buildSplitReplicaRemovalMessage({
          workflowId,
          partitionId,
          replicaId,
          reason,
          groupRetirement,
        }),
      }),
    });
  }

  /**
   * Emit the terminal SPLIT_COMPLETED signal through the composition-
   * wired listener. Terminal, not plan time: the payload mirrors the
   * planner result shape (left/right partition identities + split key)
   * so the stabilization-reset consumer needs no variant handling.
   * @param {Object} workflow - Terminal workflow snapshot.
   * @return {void}
   * @private
   */
  emitTerminalSplitCompleted(workflow) {
    if (typeof this.splitCompletionListener !== 'function') {
      return;
    }
    const metadata = workflow?.metadata || {};
    const targetPartitionIds = Array.isArray(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
    ) ?
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] :
      [];
    this.splitCompletionListener({
      workflowId: workflow.workflowId,
      tableId: workflow.tableId,
      tableName: workflow.tableName,
      leftPartition: {partitionId: targetPartitionIds[0] || null},
      rightPartition: {partitionId: targetPartitionIds[1] || null},
      medianKey:
        metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY] ?? null,
      timestamp: this.now(),
    });
  }

  /**
   * Build one REMOVE_REPLICA request for the node replica handler.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildSplitReplicaRemovalMessage(options) {
    return {
      [ReplicaOperationField.TYPE]:
        ReplicaOperationMessageType.REMOVE_REPLICA,
      [ReplicaOperationField.OPERATION_ID]: groupRetirementOperationIdOf(
        options.groupRetirement, options.replicaId),
      [ReplicaOperationField.OPERATION_TYPE]: OperationType.REMOVE,
      [ReplicaOperationField.PARTITION_ID]: options.partitionId,
      [ReplicaOperationField.REPLICA_ID]: options.replicaId,
      [ReplicaOperationField.ENTITY_TYPE]: SERVICE_TYPE.PARTITION,
      [ReplicaOperationField.ENTITY_ID]: options.partitionId,
      [ReplicaOperationField.REASON]: options.reason,
      [ReplicaOperationField.GROUP_RETIREMENT]: options.groupRetirement,
    };
  }
}

export {ManagedSplitWorkflowDissolutionMethods};
