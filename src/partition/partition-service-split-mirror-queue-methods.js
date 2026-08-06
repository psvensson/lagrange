import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  findDurableMirrorTransitionForService,
  resolveSnapshotBarrierIndex,
} from './partition-mirror-replay-cursor.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_TRANSITION_STATE,
  RaftRole,
} = PARTITION_SERVICE_SHARED;

const LOCAL_STR_CONSTRUCTOR = 'constructor';

/**
 * Split mirror queue/flush methods for PartitionService.
 *
 * Owner boundary: the source partition leader owns the ordered delta
 * queue behind an in-flight split; these methods decide when a live
 * write mirrors directly versus queues behind undelivered entries, and
 * expose the in-flight drain as a joinable promise so concurrent
 * flushers await the SAME drain instead of returning early.
 */
class PartitionServiceSplitMirrorQueueMethods {
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
  seedSplitReplayCursorFromDurableLog(splitReplication) {
    splitReplication.snapshotBarrierIndex =
      resolveSnapshotBarrierIndex(this);
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
  enqueueSplitDeltaBounded(splitReplication, entry) {
    if (splitReplication.pendingEntries.length >=
        PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.MIRROR_DELTA_QUEUE_AT_CAPACITY,
      );
    }
    splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
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
  resumeDurableMirrorReplicationWorkers() {
    const resumers = [
      this.startOrResumeSplitReplicationFromDurable,
      this.startOrResumeMergeReplicationFromDurable,
    ];
    for (const resume of resumers) {
      if (typeof resume !== 'function') {
        continue;
      }
      Promise.resolve()
        .then(() => resume.call(this))
        .catch((error) => {
          this.logger.warn(
            PARTITION_SERVICE_LOG_MSG.MIRROR_REPLICATION_RESUME_FAILED,
            {partitionId: this.partitionId, error: error.message},
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
  async startOrResumeSplitReplicationFromDurable() {
    if (this.role !== RaftRole.LEADER ||
        this.splitReplication ||
        this.mergeReplication) {
      return Boolean(this.splitReplication);
    }
    const transition = findDurableMirrorTransitionForService(this, {
      activeStates: [
        PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
        PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      ],
      matchesSource: (metadata) =>
        metadata.sourcePartitionId === this.partitionId,
      normalizeMetadata: (rawMetadata) =>
        this.normalizeSplitTransitionMetadata(rawMetadata),
    });
    if (!transition) {
      return false;
    }
    const reconstructed = this.reconstructSplitExecutionState({
      phase: transition.state,
      metadata: transition.metadata,
    });
    if (!reconstructed) {
      return false;
    }
    this.splitReplicationRun = this.runSplitReplicationWorkflow().catch(
      (error) => {
        if (this.splitReplication) {
          this.splitReplication.lastError = error.message;
          this.splitReplication.phase = PARTITION_TRANSITION_STATE.FAILED;
        }
        this.logger.error(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
      },
    );
    return true;
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
  async mirrorCutoverActiveSplitWrite(entry, splitReplication) {
    if (splitReplication.pendingEntries.length > 0 ||
        splitReplication.flushPromise !== null) {
      splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
      await this.drainSplitReplicationQueueQuietly(splitReplication);
      return;
    }
    try {
      await this.replaySplitEntry(entry, splitReplication.metadata);
    } catch (error) {
      splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
      splitReplication.lastError = error.message;
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED,
        {partitionId: this.partitionId, error: error.message},
      );
      await this.drainSplitReplicationQueueQuietly(splitReplication);
    }
  }
  /**
   * Drain the split queue, recording (not throwing) delivery failures so
   * the write ack path is never poisoned by a transient mirror error.
   * @param {Object} splitReplication - Active split replication handle.
   * @return {Promise<void>}
   * @private
   */
  async drainSplitReplicationQueueQuietly(splitReplication) {
    try {
      await this.flushSplitReplicationQueue();
    } catch (flushError) {
      splitReplication.lastError = flushError.message;
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED,
        {partitionId: this.partitionId, error: flushError.message},
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
  flushSplitReplicationQueue() {
    const splitReplication = this.splitReplication;
    if (!splitReplication) {
      return Promise.resolve();
    }
    if (splitReplication.flushPromise !== null) {
      return splitReplication.flushPromise;
    }
    const flushPromise = this.drainSplitReplicationQueue(splitReplication)
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
  async drainSplitReplicationQueue(splitReplication) {
    while (splitReplication.pendingEntries.length > 0) {
      const entry = splitReplication.pendingEntries.shift();
      try {
        await this.replaySplitEntry(entry, splitReplication.metadata);
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
}

function createPartitionServiceSplitMirrorQueueMethods() {
  const methods = {};
  const prototypeNames = Object.getOwnPropertyNames(
    PartitionServiceSplitMirrorQueueMethods.prototype,
  );
  for (const name of prototypeNames) {
    if (name !== LOCAL_STR_CONSTRUCTOR) {
      methods[name] =
        PartitionServiceSplitMirrorQueueMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceSplitMirrorQueueMethods};
