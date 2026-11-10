// The service façade for the current participant hold cadence. The volatile
// session/durable PREPARED owner performs the hold sweep; durability fitness
// and snapshot cadence retain the same tick and lifecycle.
import {trackStuckTransactionHeal} from '../diagnostics/raft-churn-sync-sections.js';
import {sweepParticipantTransactionHolds} from
  './partition-participant-transaction-session.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  CADENCE_STATUS_FAILED,
  createPartitionSnapshotCadence,
  evaluatePartitionSnapshotCadence,
} from './partition-snapshot-cadence.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
} = PARTITION_SERVICE_SHARED;

/**
 * Record a committed write and trigger snapshot cadence evaluation.
 * @param {number} [count=1] - Number of committed writes.
 * @return {Object} Cadence outcome.
 */
function recordCommittedWriteForSnapshotCadence(service, count = 1) {
  if (typeof service.committedWritesSinceSnapshot === 'number') {
    service.committedWritesSinceSnapshot += count;
  } else {
    service.committedWritesSinceSnapshot = count;
  }
  const outcome = evaluatePartitionSnapshotCadence(service);
  service.lastSnapshotCadenceOutcome = outcome;
  if (outcome?.status === CADENCE_STATUS_FAILED) {
    service.logger?.warn?.(PARTITION_SERVICE_LOG_MSG.SNAPSHOT_CADENCE_FAILED, {
      partitionId: service.partitionId,
      outcome,
    });
  }
  return outcome;
}

/**
 * One checkpoint-cadence tick, driven by the 1s prepared-state-hold sweep.
 * The cadence owner holds the leader-only role gate and in-flight flag. It
 * is constructed lazily so guard-injected services without raft stay inert.
 * @param {number} nowMs sweep timestamp
 * @return {Promise<Object>} typed cadence result
 */
function runSnapshotCadenceTick(service, nowMs) {
  if (!service.snapshotCadence) {
    service.snapshotCadence = createPartitionSnapshotCadence({service});
  }
  return service.snapshotCadence.tick(nowMs);
}

function enforcePreparedStateHoldTimeouts(service, nowMs = Date.now()) {
  return trackStuckTransactionHeal(() =>
    sweepParticipantTransactionHolds(service, nowMs));
}

function startPreparedStateHoldTimeoutSweep(service) {
  if (service.preparedStateHoldTimer) return;
  if (service.isShutdown) {
    service.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
      partitionId: service.partitionId,
      timer: PARTITION_SERVICE_LITERAL.PREPAREDSTATEHOLDTIMER,
    });
    return;
  }
  service.preparedStateHoldTimer = service.timeSource.setInterval(() => {
    const nowMs = service.timeSource.now();
    service.enforcePreparedStateHoldTimeouts(nowMs);
    service.enforceLeaderDurabilityFitness(nowMs);
    void service.runSnapshotCadenceTick(nowMs);
  }, service.preparedStateHoldSweepIntervalMs);
  service.preparedStateHoldTimer.unref?.();
}

function stopPreparedStateHoldTimeoutSweep(service) {
  if (!service.preparedStateHoldTimer) return;
  service.timeSource.clearInterval(service.preparedStateHoldTimer);
  service.clearPreparedStateHoldTimer();
}

export {
  enforcePreparedStateHoldTimeouts,
  recordCommittedWriteForSnapshotCadence,
  runSnapshotCadenceTick,
  startPreparedStateHoldTimeoutSweep,
  stopPreparedStateHoldTimeoutSweep,
};
