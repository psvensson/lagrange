/**
 * A partition replica's periodic size-accounting cadence.
 *
 * Small and self-contained on purpose: it is one timer, armed on the
 * replica's own clock and cleared on the same one, and it is the only thing
 * in the replica that schedules for size accounting. Keeping it beside the
 * CDC stream it used to live in made that file carry a concern it never
 * needed to.
 *
 * @module partition/partition-service-size-cadence
 */

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
} = PARTITION_SERVICE_SHARED;

/**
 * Arm the replica's size-update cadence, unless one is armed or the replica
 * is already shut down.
 * @param {Object} replica - The PartitionService.
 * @return {void}
 */
function startPartitionSizeCadence(replica) {
  if (replica.sizeUpdateTimer) {
    return;
  }
  if (replica.isShutdown) {
    replica.logger.debug(
      PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN,
      {
        partitionId: replica.partitionId,
        timer: PARTITION_SERVICE_LITERAL.SIZEUPDATETIMER,
      },
    );
    return;
  }
  // This replica's own cadence, on this replica's clock.
  replica.sizeUpdateTimer = replica.timeSource.setInterval(async () => {
    const sinceLastUpdateMs =
      replica.timeSource.now() - replica.lastSizeUpdate;
    if (sinceLastUpdateMs >= replica.sizeUpdateIntervalMs) {
      await replica.updatePartitionSize();
    }
  }, replica.sizeUpdateIntervalMs);
  // unref keeps a HOST timer from holding the event loop open; a handle from
  // a non-host time source has no event loop to release.
  replica.sizeUpdateTimer.unref?.();
}

/**
 * Disarm it.
 * @param {Object} replica - The PartitionService.
 * @return {void}
 */
function stopPartitionSizeCadence(replica) {
  if (!replica.sizeUpdateTimer) {
    return;
  }
  replica.timeSource.clearInterval(replica.sizeUpdateTimer);
  replica.sizeUpdateTimer = null;
}

export {startPartitionSizeCadence, stopPartitionSizeCadence};
