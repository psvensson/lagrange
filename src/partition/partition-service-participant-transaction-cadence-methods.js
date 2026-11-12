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
import {createPartitionSnapshotCatchupDriver} from
  './partition-snapshot-catchup-driver.js';
import {createPartitionSnapshotOutcomeLog} from './partition-snapshot-outcome-log.js';
import {
  PARTITION_SNAPSHOT_PROGRESS_EVENT,
  PARTITION_SNAPSHOT_PROGRESS_LOG_MSG,
} from './partition-snapshot-progress-constants.js';

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
    return this.resolveSnapshotCadence().tick(nowMs);
  },

  /**
   * The checkpoint cadence owner, constructed on first use. It is this
   * partition's one image creation owner.
   * @return {Object} the cadence owner
   */
  resolveSnapshotCadence() {
    if (!this.snapshotCadence) {
      this.snapshotCadence = createPartitionSnapshotCadence({service: this});
    }
    return this.snapshotCadence;
  },

  /**
   * A generation the catch-up dispatch needs and no sealed one can serve:
   * sealed by the cadence owner, under its standing refusal.
   * @param {Object} request {identity, checkpointsRoot, inProcessPins}
   * @return {Promise<Object>} typed creation result
   */
  sealSnapshotGenerationForCatchup(request) {
    return this.resolveSnapshotCadence().sealForCatchup(request);
  },

  /**
   * The leader's catch-up driver, constructed on first use (a notification
   * or a diagnostics read): it keeps one record per follower the consensus
   * runtime said needs a snapshot.
   * @return {Object} the driver
   */
  resolveSnapshotCatchupDriver() {
    if (!this.snapshotCatchupDriver) {
      this.snapshotCatchupDriver =
        createPartitionSnapshotCatchupDriver({service: this});
    }
    return this.snapshotCatchupDriver;
  },

  /**
   * Service shutdown: the catch-up driver's flights are aborted and its
   * records closed. The sweep that bounds a silent dispatch stops with the
   * service, so this is the only place a flight of a stopped service ends.
   * @return {void}
   */
  stopSnapshotCatchupDriver() {
    this.resolveSnapshotCatchupDriver().shutdown();
  },

  /**
   * A follower-side install orchestration on this replica that did not end
   * installed and recreated: one typed, throttled line and the last such
   * result for the diagnostics read.
   * @param {Object} outcome {outcome, reason}
   * @return {void}
   */
  recordSnapshotInstallOutcome(outcome) {
    if (!this.snapshotInstallOutcomeLog) {
      this.snapshotInstallOutcomeLog = createPartitionSnapshotOutcomeLog({
        service: this,
        event: PARTITION_SNAPSHOT_PROGRESS_EVENT.INSTALL_OUTCOME,
        message: PARTITION_SNAPSHOT_PROGRESS_LOG_MSG.INSTALL_OUTCOME,
      });
    }
    this.snapshotInstallOutcome = Object.freeze({...outcome,
      atMs: this.timeSource.now()});
    this.snapshotInstallOutcomeLog.report(this.replicaId,
      {replicaId: this.replicaId, ...outcome});
  },

  /**
   * The consensus runtime's notification that one follower needs a snapshot:
   * recorded and handed to the dispatcher seam by the catch-up driver.
   * @param {Object} decision typed install_snapshot decision
   * @return {Promise<Object>} the typed dispatch result
   */
  requestSnapshotCatchupDispatch(decision) {
    return this.resolveSnapshotCatchupDriver().dispatch(decision);
  },

  /**
   * One re-ask sweep of the catch-up driver, driven by the same 1s sweep as
   * the checkpoint cadence. With no follower record the sweep reads nothing.
   * @param {number} nowMs sweep timestamp
   * @return {Promise<Object>} typed sweep result
   */
  runSnapshotCatchupReaskTick(nowMs) {
    return this.resolveSnapshotCatchupDriver().sweep(nowMs);
  },

  /**
   * This replica's snapshot progress as its two owners hold it: the
   * checkpoint cadence's last outcome, last compaction and standing refusal,
   * and one record per follower whose snapshot has not taken effect.
   * @return {Object} frozen {cadence, catchup, install}; cadence is null
   *   until the cadence has ticked, install until an install orchestration
   *   on this replica did not complete
   */
  getSnapshotCatchupDiagnostics() {
    return Object.freeze({
      cadence: this.snapshotCadence ?
        this.snapshotCadence.readDiagnostics() : null,
      catchup: this.resolveSnapshotCatchupDriver().readDiagnostics(),
      install: this.snapshotInstallOutcome ? this.snapshotInstallOutcome : null,
    });
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
      void this.runSnapshotCatchupReaskTick?.(nowMs);
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
