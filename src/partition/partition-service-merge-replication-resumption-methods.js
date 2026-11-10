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
  GROUP_RETIREMENT_KIND,
  retiringSourceStatus,
} from './group-retirement-evidence.js';
import {MERGE_ACK_STATUS} from './merge-ack-constants.js';
import {
  findDurableMirrorTransitionForService,
  loadDurableDeltasBehindWatermark,
} from './partition-mirror-replay-cursor.js';
import {startMergeReplicationHandle} from
  './partition-service-source-replication-start-methods.js';

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
async function startOrResumeMergeReplicationFromDurable(service) {
  if (service.role !== RAFT_ROLE.LEADER ||
      service.mergeReplication ||
      service.splitReplication) {
    return Boolean(service.mergeReplication);
  }
  const transition = findDurableMirrorTransitionForService(service, {
    activeStates: [
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
      PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
      PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
    ],
    matchesSource: (metadata) =>
      Array.isArray(metadata.sourcePartitionIds) &&
      metadata.sourcePartitionIds.includes(service.partitionId),
    normalizeMetadata: (rawMetadata) => {
      const normalized = service.normalizeMergeTransitionMetadata(rawMetadata);
      const source = retiringSourceStatus(GROUP_RETIREMENT_KIND.MERGE_SOURCE,
        rawMetadata, service.partitionId);
      return normalized && source.retiring ? {...normalized,
        retiringSourceStatus: source.participantStatus} : normalized;
    },
  });
  if (!transition) {
    return false;
  }
  // A source that already finished mirroring is ending with its group
  // (group-retirement-evidence.js): nothing of it resumes. Its leader only
  // re-delivers mirror-removed, so the workflow owner of this node resumes
  // an unfinished dissolution from the durable record.
  if (transition.metadata.retiringSourceStatus) {
    if (transition.metadata.retiringSourceStatus !==
        MERGE_ACK_STATUS.SOURCE_DISSOLVED) {
      await service.emitMergeSourceAck(transition.metadata,
        MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED);
    }
    return false;
  }
  // Seed the catch-up queue from the DURABLE Raft log behind the
  // persisted replay watermark (mirrors the split reconstruction).
  const replayedDeltas = loadDurableDeltasBehindWatermark(
    service,
    transition.metadata.replayWatermarkIndex,
  );
  service.mergeReplication = {
    metadata: transition.metadata,
    phase: transition.state,
    pendingEntries: replayedDeltas,
    flushPromise: null,
    startedAt: Date.now(),
    lastError: null,
    snapshotBarrierIndex: transition.metadata.snapshotBarrierIndex,
    replayWatermarkIndex: transition.metadata.replayWatermarkIndex,
  };
  service.logger.info(
    PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_RECONSTRUCTED,
    {
      partitionId: service.partitionId,
      phase: transition.state,
      workflowId: transition.metadata.workflowId,
    },
  );
  const response = await startMergeReplicationHandle(
    service, service.mergeReplication);
  return response.success === true;
}

export {
  startOrResumeMergeReplicationFromDurable,
};
