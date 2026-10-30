// The service façade for the current participant hold cadence. The volatile
// session/durable PREPARED owner performs the hold sweep; durability fitness
// and snapshot cadence retain the same tick and lifecycle.
import {trackStuckTransactionHeal} from '../diagnostics/raft-churn-sync-sections.js';
import {sweepParticipantTransactionHolds} from
  './partition-participant-transaction-session.js';
import {getStagingReplayStats} from
  './partition-participant-transaction-staging.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  createPartitionSnapshotCadence,
  evaluatePartitionSnapshotCadence,
} from './partition-snapshot-cadence.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
} = PARTITION_SERVICE_SHARED;

const PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS = Object.freeze({
  /**
   * Record a committed write and trigger snapshot cadence evaluation.
   * @param {number} [count=1] - Number of committed writes.
   * @return {Object} Cadence outcome.
   */
  recordCommittedWriteForSnapshotCadence(count = 1) {
    if (typeof this.committedWritesSinceSnapshot === 'number') {
      this.committedWritesSinceSnapshot += count;
    } else {
      this.committedWritesSinceSnapshot = count;
    }
    const outcome = evaluatePartitionSnapshotCadence(this);
    this.lastSnapshotCadenceOutcome = outcome;
    if (outcome?.status === 'failed') {
      this.logger?.warn?.('partition snapshot cadence failed', {
        partitionId: this.partitionId,
        outcome,
      });
    }
    return outcome;
  },

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

  getStagingReplayStats() {
    return getStagingReplayStats(this);
  },
});

export {PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS};
