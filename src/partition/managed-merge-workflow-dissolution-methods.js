import {SERVICE_TYPE} from '../constants/index.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {PARTICIPANT_ACK_FIELD} from '../workflow/workflow-constants.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  MERGE_ABORT_OUTCOME,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRE_CUTOVER_MERGE_STATES,
} from './partition-constants.js';
import {
  MERGE_ACK_CHECKPOINT_FIELD,
  MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from './merge-ack-constants.js';

const LOCAL_STR_MERGE_SOURCE_DISSOLUTION = 'merge_source_dissolution';
const LOCAL_STR_MERGE_SOURCE_EXECUTION_FAILURE =
  'merge_source_execution_failure';
const LOCAL_STR_DISSOLVE_SEGMENT = ':dissolve:';
const LOCAL_STR_REPLICA_ID_SNAKE = 'replica_id';
const LOCAL_STR_REPLICA_ID_CAMEL = 'replicaId';
const LOCAL_STR_NODE_ID_SNAKE = 'node_id';
const LOCAL_STR_NODE_ID_CAMEL = 'nodeId';

const ACCEPTED_REPLICA_REMOVAL_STATUSES = Object.freeze(new Set([
  ReplicaOperationResponseStatus.INITIATED,
  ReplicaOperationResponseStatus.IN_PROGRESS,
  ReplicaOperationResponseStatus.COMPLETED,
  ReplicaOperationResponseStatus.NOT_FOUND,
]));

const MERGE_SOURCES_DISSOLVED_STATUSES = Object.freeze(new Set([
  MERGE_ACK_STATUS.SOURCE_DISSOLVED,
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
  async finalizeMergeDissolutionIfReady(workflowId) {
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
   * Dissolve one retired source partition: replica teardown dispatch plus
   * descriptor deletion, acknowledged as SOURCE_DISSOLVED (or
   * DISSOLUTION_FAILED — never a fake success).
   * @param {string} workflowId
   * @param {string} sourcePartitionId
   * @return {Promise<void>}
   * @private
   */
  async dissolveMergeSourcePartition(workflowId, sourcePartitionId) {
    try {
      const dissolvedReplicaIds = await this.dispatchSourceReplicaRemovals(
        workflowId,
        sourcePartitionId,
      );
      await this.deleteSourcePartitionMetadata(sourcePartitionId);
      await this.workflowCoordinator.acknowledgeParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          buildMergeSourceParticipantKey(sourcePartitionId),
        [PARTICIPANT_ACK_FIELD.STATUS]: MERGE_ACK_STATUS.SOURCE_DISSOLVED,
        [PARTICIPANT_ACK_FIELD.CHECKPOINT]: {
          [MERGE_ACK_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS]:
            dissolvedReplicaIds,
        },
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
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
      await this.workflowCoordinator.acknowledgeParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          buildMergeSourceParticipantKey(sourcePartitionId),
        [PARTICIPANT_ACK_FIELD.STATUS]: MERGE_ACK_STATUS.DISSOLUTION_FAILED,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
      });
    }
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
    try {
      await this.dispatchSourceReplicaRemovals(workflowId, targetPartitionId);
      await this.deleteSourcePartitionMetadata(targetPartitionId);
    } catch (error) {
      this.logger.warn(MANAGED_MERGE_LOG_MSG.TARGET_TEARDOWN_FAILED, {
        workflowId,
        targetPartitionId,
        error: error?.message || error,
      });
    }
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
   * Dispatch REMOVE_REPLICA for every authoritative replica of one retired
   * partition (a dissolved source or an aborted merge target).
   * @param {string} workflowId
   * @param {string} sourcePartitionId
   * @return {Promise<string[]>} Replica ids with accepted removal dispatch.
   * @private
   */
  async dispatchSourceReplicaRemovals(workflowId, sourcePartitionId) {
    const serviceRows = this.listPartitionServiceRows(sourcePartitionId);
    const dissolvedReplicaIds = [];
    for (const serviceRow of serviceRows) {
      const dispatchedReplicaId = await this.dispatchOneSourceReplicaRemoval(
        workflowId,
        sourcePartitionId,
        serviceRow,
      );
      if (dispatchedReplicaId) {
        dissolvedReplicaIds.push(dispatchedReplicaId);
      }
    }
    return dissolvedReplicaIds;
  }

  /**
   * Dispatch REMOVE_REPLICA for one authoritative source replica row.
   * @param {string} workflowId
   * @param {string} sourcePartitionId
   * @param {Object} serviceRow
   * @return {Promise<string|null>} Replica id when dispatch was accepted.
   * @private
   */
  async dispatchOneSourceReplicaRemoval(
    workflowId,
    sourcePartitionId,
    serviceRow,
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
      message: this.buildReplicaRemovalMessage({
        workflowId,
        partitionId: sourcePartitionId,
        replicaId,
      }),
    });
    const responseStatus = String(response?.status || '');
    if (!ACCEPTED_REPLICA_REMOVAL_STATUSES.has(responseStatus)) {
      throw new Error(
        response?.error || MANAGED_MERGE_ERROR_MSG.START_FAILED,
      );
    }
    return replicaId;
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
    };
  }
}

export {ManagedMergeWorkflowDissolutionMethods};
