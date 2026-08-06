/**
 * Merge replication worker resumption for the source PartitionService:
 * after a source restart or leader transition, when the durable
 * transition row names this partition as a source of an in-flight
 * merge, reconstruct the execution state (catch-up deltas replay from
 * the durable Raft log behind the persisted watermark) and re-run the
 * worker. Reconstruction WITHOUT resumption is not recovery (mirrors
 * the split resumption in partition-service-split-mirror-queue-methods.js).
 */

import {RAFT_ROLE} from '../raft/constants.js';
import {
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  PARTITION_SERVICE_LOG_MSG,
} from './partition-service-constants.js';
import {
  findDurableMirrorTransitionForService,
  loadDurableDeltasBehindWatermark,
} from './partition-mirror-replay-cursor.js';

class PartitionServiceMergeReplicationResumptionMethods {
  /**
   * Start-or-resume the merge replication worker after a source restart
   * or leader transition: when the durable transition row names this
   * partition as a source of an in-flight merge, reconstruct the
   * execution state (catch-up deltas replay from the durable Raft log
   * behind the persisted watermark) and re-run the worker (mirrors
   * startOrResumeSplitReplicationFromDurable).
   * @return {Promise<boolean>} True when a worker is running.
   * @private
   */
  async startOrResumeMergeReplicationFromDurable() {
    if (this.role !== RAFT_ROLE.LEADER ||
        this.mergeReplication ||
        this.splitReplication) {
      return Boolean(this.mergeReplication);
    }
    const transition = findDurableMirrorTransitionForService(this, {
      activeStates: [
        PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
        PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
      ],
      matchesSource: (metadata) =>
        Array.isArray(metadata.sourcePartitionIds) &&
        metadata.sourcePartitionIds.includes(this.partitionId),
      normalizeMetadata: (rawMetadata) =>
        this.normalizeMergeTransitionMetadata(rawMetadata),
    });
    if (!transition) {
      return false;
    }
    // Seed the catch-up queue from the DURABLE Raft log behind the
    // persisted replay watermark (mirrors the split reconstruction).
    const replayedDeltas = loadDurableDeltasBehindWatermark(
      this,
      transition.metadata.replayWatermarkIndex,
    );
    this.mergeReplication = {
      metadata: transition.metadata,
      phase: transition.state,
      pendingEntries: replayedDeltas,
      flushPromise: null,
      startedAt: Date.now(),
      lastError: null,
      snapshotBarrierIndex: transition.metadata.snapshotBarrierIndex,
      replayWatermarkIndex: transition.metadata.replayWatermarkIndex,
    };
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_RECONSTRUCTED,
      {
        partitionId: this.partitionId,
        phase: transition.state,
        workflowId: transition.metadata.workflowId,
      },
    );
    this.mergeReplicationRun = this.runMergeReplicationWorkflow().catch(
      (error) => this.handleMergeReplicationRunFailure(
        transition.metadata,
        error,
      ),
    );
    return true;
  }
}

const LOCAL_STR_CONSTRUCTOR = 'constructor';

/**
 * Mixin factory mirroring the assembly pattern used by the other
 * PartitionService method modules.
 * @return {Object<string, Function>}
 */
function createPartitionServiceMergeReplicationResumptionMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(
    PartitionServiceMergeReplicationResumptionMethods.prototype,
  )) {
    if (name === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    methods[name] =
      PartitionServiceMergeReplicationResumptionMethods.prototype[name];
  }
  return methods;
}

export {createPartitionServiceMergeReplicationResumptionMethods};
