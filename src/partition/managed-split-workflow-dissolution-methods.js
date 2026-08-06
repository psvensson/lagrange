import {SERVICE_TYPE} from '../constants/index.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {PARTICIPANT_ACK_FIELD} from '../workflow/workflow-constants.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from './split-ack-constants.js';

const LOCAL_STR_SPLIT_SOURCE_DISSOLUTION = 'split_source_dissolution';
const LOCAL_NUM_DISSOLUTION_WITNESS_AFFECTED_ROWS = 1;
const LOCAL_STR_SPLIT_ABORTED_CHILD_TEARDOWN = 'split_aborted_child_teardown';
const LOCAL_STR_DISSOLVE_SEGMENT = ':dissolve:';
const LOCAL_STR_REPLICA_ID_SNAKE = 'replica_id';
const LOCAL_STR_REPLICA_ID_CAMEL = 'replicaId';
const LOCAL_STR_NODE_ID_SNAKE = 'node_id';
const LOCAL_STR_NODE_ID_CAMEL = 'nodeId';
const LOCAL_STR_NORMAL_PARTITION_STATE = 'NORMAL';

const ACCEPTED_REPLICA_REMOVAL_STATUSES = Object.freeze(new Set([
  ReplicaOperationResponseStatus.INITIATED,
  ReplicaOperationResponseStatus.IN_PROGRESS,
  ReplicaOperationResponseStatus.COMPLETED,
  ReplicaOperationResponseStatus.NOT_FOUND,
]));

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
 * Resolve one snake/camel service-row field as a string.
 * @param {Object|null} serviceRow
 * @param {string} snakeKey
 * @param {string} camelKey
 * @return {string}
 */
function resolveServiceRowField(serviceRow, snakeKey, camelKey) {
  const record = serviceRow || {};
  return String(record[snakeKey] ?? record[camelKey] ?? '');
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
  async finalizeSplitDissolutionIfReady(workflowId) {
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
        LOCAL_STR_SPLIT_SOURCE_DISSOLUTION,
      );
      const deleteWitness =
        await this.deletePartitionMetadata(sourcePartitionId);
      if (!this.isDissolutionWitnessPersisted(deleteWitness)) {
        throw new Error(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_WITNESS_MISSING);
      }
      await this.workflowCoordinator.acknowledgeParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
        [PARTICIPANT_ACK_FIELD.CHECKPOINT]: {
          [SPLIT_ACK_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS]:
            dissolvedReplicaIds,
        },
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
      this.logger.info(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED, {
        workflowId,
        sourcePartitionId,
        dissolvedReplicaIds,
      });
    } catch (error) {
      this.logger.error(MANAGED_SPLIT_LOG_MSG.DISSOLUTION_FAILED, {
        workflowId,
        sourcePartitionId,
        error: error?.message || error,
      });
      await this.workflowCoordinator.acknowledgeParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
    }
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
      try {
        await this.dispatchSplitReplicaRemovals(
          workflowId,
          childPartitionId,
          LOCAL_STR_SPLIT_ABORTED_CHILD_TEARDOWN,
        );
        await this.deletePartitionMetadata(childPartitionId);
      } catch (error) {
        this.logger.warn(MANAGED_SPLIT_LOG_MSG.CHILD_TEARDOWN_FAILED, {
          workflowId,
          childPartitionId,
          error: error?.message || error,
        });
      }
    }
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
   * Dispatch REMOVE_REPLICA for every authoritative replica of one
   * retired partition (the dissolved source or an aborted child).
   * @param {string} workflowId
   * @param {string} partitionId
   * @param {string} reason - Replica-removal reason label.
   * @return {Promise<string[]>} Replica ids with accepted removal
   *   dispatch.
   * @private
   */
  async dispatchSplitReplicaRemovals(workflowId, partitionId, reason) {
    const serviceRows = this.listPartitionServiceRows(partitionId);
    const dissolvedReplicaIds = [];
    for (const serviceRow of serviceRows) {
      const dispatchedReplicaId = await this.dispatchOneSplitReplicaRemoval(
        workflowId,
        partitionId,
        serviceRow,
        reason,
      );
      if (dispatchedReplicaId) {
        dissolvedReplicaIds.push(dispatchedReplicaId);
      }
    }
    return dissolvedReplicaIds;
  }

  /**
   * Dispatch REMOVE_REPLICA for one authoritative replica row.
   * @param {string} workflowId
   * @param {string} partitionId
   * @param {Object} serviceRow
   * @param {string} reason - Replica-removal reason label.
   * @return {Promise<string|null>} Replica id when dispatch was accepted.
   * @private
   */
  async dispatchOneSplitReplicaRemoval(
    workflowId,
    partitionId,
    serviceRow,
    reason,
  ) {
    const replicaId = resolveServiceRowField(
      serviceRow, LOCAL_STR_REPLICA_ID_SNAKE, LOCAL_STR_REPLICA_ID_CAMEL,
    );
    const nodeId = resolveServiceRowField(
      serviceRow, LOCAL_STR_NODE_ID_SNAKE, LOCAL_STR_NODE_ID_CAMEL,
    );
    if (!replicaId || !nodeId) {
      return null;
    }
    const response = await this.deliverReplicaRemoval({
      nodeId,
      message: this.buildSplitReplicaRemovalMessage({
        workflowId,
        partitionId,
        replicaId,
        reason,
      }),
    });
    const responseStatus = String(response?.status || '');
    if (!ACCEPTED_REPLICA_REMOVAL_STATUSES.has(responseStatus)) {
      throw new Error(
        response?.error || MANAGED_SPLIT_LOG_MSG.DISSOLUTION_FAILED,
      );
    }
    return replicaId;
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
      [ReplicaOperationField.OPERATION_ID]:
        options.workflowId + LOCAL_STR_DISSOLVE_SEGMENT + options.replicaId,
      [ReplicaOperationField.OPERATION_TYPE]: OperationType.REMOVE,
      [ReplicaOperationField.PARTITION_ID]: options.partitionId,
      [ReplicaOperationField.REPLICA_ID]: options.replicaId,
      [ReplicaOperationField.ENTITY_TYPE]: SERVICE_TYPE.PARTITION,
      [ReplicaOperationField.ENTITY_ID]: options.partitionId,
      [ReplicaOperationField.REASON]: options.reason,
    };
  }
}

export {ManagedSplitWorkflowDissolutionMethods};
