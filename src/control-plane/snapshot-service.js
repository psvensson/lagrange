import {OwnerQueue} from './owner-queue.js';


/**
 * SnapshotService coordinates active-gate snapshot operations and write queue management.
 */
class SnapshotService {
  /**
   * Determine if the logs table write queue is under load or deferred.
   * @return {boolean}
   */
  static isQueuePressureDetected() {
    return OwnerQueue.isDeferred() || OwnerQueue.getPendingWritesCount() > 0;
  }

  /**
   * Proactively bypass/drain the write queue for critical snapshot operations.
   * @return {Promise<number>} The number of written entries drained.
   */
  static async drainQueueForSnapshot() {
    let drainedCount = 0;
    if (this.isQueuePressureDetected()) {
      drainedCount = await OwnerQueue.drain();
    }
    return drainedCount;
  }
}

export {SnapshotService};
