// The service façade for the current participant hold cadence. The volatile
// session/durable PREPARED owner performs the hold sweep; durability fitness
// and snapshot cadence retain the same tick and lifecycle.
import {trackStuckTransactionHeal} from '../diagnostics/raft-churn-sync-sections.js';
import {sweepParticipantTransactionHolds} from
  './partition-participant-transaction-session.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {createPartitionSnapshotCadence} from
  './partition-snapshot-cadence.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
} = PARTITION_SERVICE_SHARED;

const PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS = Object.freeze({
  /**
   * One checkpoint-cadence tick, driven by the 1s prepared-state-hold sweep.
   * The cadence owner holds the leader-only role gate and in-flight flag. It
   * is constructed lazily so guard-injected services without raft stay inert.
   * @param {number} nowMs sweep timestamp
   * @return {Promise<Object>} typed cadence result
   */
  runSnapshotCadenceTick(nowMs) {
    if (!this.snapshotCadence) {
      this.snapshotCadence = createPartitionSnapshotCadence({service: this});
    }
    return this.snapshotCadence.tick(nowMs);
  },

  enforcePreparedStateHoldTimeouts(nowMs = Date.now()) {
    return trackStuckTransactionHeal(() =>
      sweepParticipantTransactionHolds(this, nowMs));
  },

  startPreparedStateHoldTimeoutSweep() {
    if (this.preparedStateHoldTimer) return;
    if (this.isShutdown) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
        partitionId: this.partitionId,
        timer: PARTITION_SERVICE_LITERAL.PREPAREDSTATEHOLDTIMER,
      });
      return;
    }
    this.preparedStateHoldTimer = this.timeSource.setInterval(() => {
      const nowMs = this.timeSource.now();
      this.enforcePreparedStateHoldTimeouts(nowMs);
      this.enforceLeaderDurabilityFitness?.(nowMs);
      void this.runSnapshotCadenceTick?.(nowMs);
    }, this.preparedStateHoldSweepIntervalMs);
    this.preparedStateHoldTimer.unref?.();
  },

  stopPreparedStateHoldTimeoutSweep() {
    if (!this.preparedStateHoldTimer) return;
    this.timeSource.clearInterval(this.preparedStateHoldTimer);
    this.preparedStateHoldTimer = null;
  },
});

export {PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS};
