import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  GROUP_RETIREMENT_KIND,
  retiringSourceStatus,
} from './group-retirement-evidence.js';
import {SPLIT_ACK_STATUS} from './split-ack-constants.js';
import {
  findDurableMirrorTransitionForService,
  resolveSnapshotBarrierIndex,
} from './partition-mirror-replay-cursor.js';
import {
  beginSourceReplicationActivity,
  finishSourceReplicationActivity,
  startSplitReplicationHandle,
} from './partition-service-source-replication-start-methods.js';

function withRetiringSourceStatus(normalized, source) {
  return normalized && source.retiring ?
    {...normalized, retiringSourceStatus: source.participantStatus} :
    normalized;
}

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_TRANSITION_STATE,
  RaftRole,
  PARTITION_SPLIT_MIRROR_ORIGIN,
} = PARTITION_SERVICE_SHARED;

/**
 * Split mirror queue/flush methods for PartitionService.
 *
 * Owner boundary: the source partition leader owns the ordered delta
 * queue behind an in-flight split; these methods decide when a live
 * write mirrors directly versus queues behind undelivered entries, and
 * expose the in-flight drain as a joinable promise so concurrent
 * flushers await the SAME drain instead of returning early.
 */
async function handleSplitReplicationAfterWrite(service, entry) {
  const handle = service.splitReplication;
  if (!handle?.metadata ||
      service.partitionId !== handle.metadata.sourcePartitionId ||
      handle.quiescing || handle.quiesced || handle.authorized !== true) {
    return;
  }
  const activity = beginSourceReplicationActivity(service, handle);
  if (!activity) return;
  try {
    if (entry.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.TARGET) {
      return;
    }
    if (handle.phase === PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING ||
        handle.phase === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP) {
      service.enqueueSplitDeltaBounded(handle, entry);
    } else if (handle.phase ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      await service.mirrorCutoverActiveSplitWrite(entry, handle);
    }
  } finally {
    finishSourceReplicationActivity(service, handle, activity);
  }
}

/**
 * Seed the durable replay cursor on an active split handle from the
 * source partition's Raft log: every entry up to and including the
 * barrier index is covered by the snapshot backfill, so the replay
 * watermark starts there and a restarted source replays from the
 * durable log.
 * @param {Object} splitReplication - Active split replication handle.
 * @return {void}
 * @private
 */
function seedSplitReplayCursorFromDurableLog(service, splitReplication) {
  splitReplication.snapshotBarrierIndex =
    resolveSnapshotBarrierIndex(service);
  splitReplication.replayWatermarkIndex =
    splitReplication.snapshotBarrierIndex;
}

/**
 * Enqueue one split delta under the queue bound: the durable replay
 * source is the Raft log, so the in-memory array only holds
 * post-snapshot live writes; at capacity the write path applies
 * backpressure.
 * @param {Object} splitReplication - Active split replication handle.
 * @param {Object} entry - Applied source write entry.
 * @return {void}
 * @private
 */
function enqueueSplitDeltaBounded(service, splitReplication, entry) {
  if (splitReplication.pendingEntries.length >=
      PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MIRROR_DELTA_QUEUE_AT_CAPACITY,
    );
  }
  splitReplication.pendingEntries.push(service.cloneSplitEntry(entry));
}

/**
 * Resume any durable split/merge mirror replication workers this
 * source partition owns after a restart or leader transition. Each
 * resumer is a no-op unless the durable transition row names this
 * partition as the source of an in-flight transition and no worker is
 * already live; failures are logged, never thrown into the leader
 * activation path.
 * @return {void}
 * @private
 */
function resumeDurableMirrorReplicationWorkers(service) {
  const resumers = [
    service.startOrResumeSplitReplicationFromDurable,
    service.startOrResumeMergeReplicationFromDurable,
  ];
  for (const resume of resumers) {
    if (typeof resume !== 'function') {
      continue;
    }
    Promise.resolve()
      .then(() => resume.call(service))
      .catch((error) => {
        service.logger.warn(
          PARTITION_SERVICE_LOG_MSG.MIRROR_REPLICATION_RESUME_FAILED,
          {partitionId: service.partitionId, error: error.message},
        );
      });
  }
}

/**
 * Start-or-resume the split replication worker after a source restart
 * or leader transition: when the durable transition row names this
 * partition as the source of an in-flight split, reconstruct the
 * execution state (catch-up deltas replay from the durable Raft log
 * behind the persisted watermark) and re-run the worker.
 * Reconstruction WITHOUT resumption is not recovery.
 * @return {Promise<boolean>} True when a worker is running.
 * @private
 */
async function startOrResumeSplitReplicationFromDurable(service) {
  if (service.role !== RaftRole.LEADER ||
      service.splitReplication ||
      service.mergeReplication) {
    return Boolean(service.splitReplication);
  }
  const transition = findDurableMirrorTransitionForService(service, {
    activeStates: [
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    ],
    matchesSource: (metadata) =>
      metadata.sourcePartitionId === service.partitionId,
    normalizeMetadata: (rawMetadata) => withRetiringSourceStatus(
      service.normalizeSplitTransitionMetadata(rawMetadata),
      retiringSourceStatus(GROUP_RETIREMENT_KIND.SPLIT_SOURCE, rawMetadata,
        service.partitionId)),
  });
  if (!transition) {
    return false;
  }
  // A source that already finished mirroring is ending with its group
  // (group-retirement-evidence.js): nothing of it resumes. Its leader only
  // re-delivers the finished acknowledgement, so the workflow owner of
  // this node resumes an unfinished dissolution from the durable record
  // (the DISSOLUTION_FAILED -> CLEANUP_COMPLETED edge, or a duplicate
  // CLEANUP_COMPLETED after an owner restart mid-dissolution).
  if (transition.metadata.retiringSourceStatus) {
    if (transition.metadata.retiringSourceStatus !==
        SPLIT_ACK_STATUS.SOURCE_DISSOLVED) {
      await service.emitSplitSourceAck(transition.metadata,
        SPLIT_ACK_STATUS.CLEANUP_COMPLETED);
    }
    return false;
  }
  const reconstructed = service.reconstructSplitExecutionState({
    phase: transition.state,
    metadata: transition.metadata,
  });
  if (!reconstructed) {
    return false;
  }
  const response = await startSplitReplicationHandle(
    service, reconstructed);
  return response.success === true;
}

/**
 * Mirror one live write while the cutover is active. While older queued
 * entries remain undelivered (or a flush is draining), the new write
 * routes through the queue so source order is preserved; direct replay
 * happens only on an empty, idle queue (same guard as merge).
 * @param {Object} entry - Applied source write entry.
 * @param {Object} splitReplication - Active split replication handle.
 * @return {Promise<void>}
 * @private
 */
async function mirrorCutoverActiveSplitWrite(service, entry, splitReplication) {
  if (splitReplication.pendingEntries.length > 0 ||
      splitReplication.flushPromise !== null) {
    splitReplication.pendingEntries.push(service.cloneSplitEntry(entry));
    await service.drainSplitReplicationQueueQuietly(splitReplication);
    return;
  }
  try {
    await service.replaySplitEntry(entry, splitReplication.metadata);
  } catch (error) {
    splitReplication.pendingEntries.push(service.cloneSplitEntry(entry));
    splitReplication.lastError = error.message;
    service.logger.warn(
      PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED,
      {partitionId: service.partitionId, error: error.message},
    );
    await service.drainSplitReplicationQueueQuietly(splitReplication);
  }
}

/**
 * Drain the split queue, recording (not throwing) delivery failures so
 * the write ack path is never poisoned by a transient mirror error.
 * @param {Object} splitReplication - Active split replication handle.
 * @return {Promise<void>}
 * @private
 */
async function drainSplitReplicationQueueQuietly(service, splitReplication) {
  try {
    await service.flushSplitReplicationQueue();
  } catch (flushError) {
    splitReplication.lastError = flushError.message;
    service.logger.warn(
      PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED,
      {partitionId: service.partitionId, error: flushError.message},
    );
  }
}

/**
 * Flush queued post-snapshot deltas in source order. The in-flight
 * flush is exposed as a joinable promise so concurrent callers await
 * the SAME drain instead of returning while entries remain queued.
 * @return {Promise<void>}
 * @private
 */
function flushSplitReplicationQueue(service) {
  const splitReplication = service.splitReplication;
  if (!splitReplication) {
    return Promise.resolve();
  }
  if (splitReplication.flushPromise !== null) {
    return splitReplication.flushPromise;
  }
  const flushPromise = service.drainSplitReplicationQueue(splitReplication)
    .finally(() => {
      if (splitReplication.flushPromise === flushPromise) {
        splitReplication.flushPromise = null;
      }
    });
  splitReplication.flushPromise = flushPromise;
  return flushPromise;
}

/**
 * Drain queued entries in source order, re-queueing the head entry on
 * failure so ordering is preserved for the next flush attempt.
 * @param {Object} splitReplication - Active split replication handle.
 * @return {Promise<void>}
 * @private
 */
async function drainSplitReplicationQueue(service, splitReplication) {
  while (splitReplication.pendingEntries.length > 0) {
    const entry = splitReplication.pendingEntries.shift();
    try {
      await service.replaySplitEntry(entry, splitReplication.metadata);
    } catch (error) {
      splitReplication.pendingEntries.unshift(entry);
      throw error;
    }
    // Advance the durable replay watermark behind each delivered
    // delta; the next cursor checkpoint persists it so a restarted
    // source resumes from the Raft log instead of the volatile queue.
    if (Number.isSafeInteger(entry.logIndex) && entry.logIndex > 0) {
      splitReplication.replayWatermarkIndex = Math.max(
        Number(splitReplication.replayWatermarkIndex) || 0,
        entry.logIndex,
      );
    }
  }
}

export {
  drainSplitReplicationQueue,
  drainSplitReplicationQueueQuietly,
  enqueueSplitDeltaBounded,
  flushSplitReplicationQueue,
  handleSplitReplicationAfterWrite,
  mirrorCutoverActiveSplitWrite,
  resumeDurableMirrorReplicationWorkers,
  seedSplitReplayCursorFromDurableLog,
  startOrResumeSplitReplicationFromDurable,
};
