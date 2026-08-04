import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_LOG_MSG,
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
