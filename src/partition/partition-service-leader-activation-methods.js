// Leader activation and its rebalancer leadership sink. Activation retains
// the existing gate ordering and resumes durable split/merge mirror workers.
import {trackLeaderActivation} from '../diagnostics/raft-churn-sync-sections.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  getTrafficReadinessSnapshot,
} = PARTITION_SERVICE_SHARED;

const PARTITION_SERVICE_LEADER_ACTIVATION_METHODS = Object.freeze({
  /**
   * Resolve whether this partition's rebalancer should hold leadership.
   *
   * Policy: background-work readiness gates rebalancer-leadership
   * ACQUISITION; raft leadership gates RETENTION. Once a rebalancer has
   * acquired leadership while the node was ready, a transient node-wide
   * readiness dip (e.g. the shared metadata-publication readiness state
   * re-entering a degraded phase during control-plane recovery) must NOT
   * demote it while this partition still holds raft leadership. Without
   * this hysteresis every partition's rebalancer flaps in lockstep with
   * the single shared readiness object each time it oscillates, which
   * resets the post-restart quiescence window and stalls convergence. A
   * draining/shutting-down node still demotes (drain is terminal).
   *
   * @return {boolean} Desired rebalancer leadership state.
   * @private
   */
  resolveRebalancerLeadership() {
    if (!this.isLeader) {
      return false;
    }
    if (this.isBackgroundWorkReady()) {
      return true;
    }
    const rebalancer = this.rebalancer;
    if (
      !rebalancer ||
      rebalancer.isLeader !== true ||
      rebalancer.isShuttingDown === true
    ) {
      return false;
    }
    const snapshot = getTrafficReadinessSnapshot(
      this.metadataPublicationReadinessState,
    );
    if (snapshot && snapshot.draining === true) {
      return false;
    }
    return true;
  },
  /**
   * Attach a secondary leadership sink driven in lockstep with this partition's
   * own rebalancer leadership. Used to gate a non-partition reconciler (e.g. the
   * RUNTIME_SERVICE rebalancer owner bound to `service_definitions-p1`) on this
   * partition's raft leadership, so it starts/quiesces with the partition leader
   * and inherits the same drain hysteresis. Pass `null` to detach. A no-op for
   * every partition that has no sink attached.
   * @param {?{setLeader: function(boolean): void}} sink
   */
  setRebalancerLeadershipSink(sink) {
    this.rebalancerLeadershipSink =
      sink && typeof sink.setLeader === PARTITION_SERVICE_TYPE.FUNCTION ?
        sink :
        null;
    this.driveRebalancerLeadershipSink();
  },
  /** @private */
  driveRebalancerLeadershipSink() {
    if (this.rebalancerLeadershipSink) {
      this.rebalancerLeadershipSink.setLeader(this.resolveRebalancerLeadership());
    }
  },
  updateRebalancerLeadership() {
    if (!this.rebalancer) {
      this.maybeInitializeRebalancer();
      this.driveRebalancerLeadershipSink();
      return;
    }
    if (typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.rebalancer.setLeader(this.resolveRebalancerLeadership());
    }
    this.driveRebalancerLeadershipSink();
  },
  cancelLeaderOwnedActivation() {
    this.leaderActivationGate.cancel({clearActivatedTerm: true});
  },
  scheduleLeaderOwnedActivation(term) {
    this.leaderActivationGate.schedule(
      term,
      // Sync-section attribution only (see raft-churn-sync-sections.js).
      () => trackLeaderActivation(() => {
        if (this.isShutdown || !this.isLeader) {
          return;
        }
        this.reassertDurableLeaderNodeId();
        if (!this.isJoiningExistingGroup) {
          this.updateRebalancerLeadership();
        }
        this.logger.info(PARTITION_SERVICE_LOG_MSG.BECAME_LEADER, {
          term,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
          rebalancerActive:
            !this.isJoiningExistingGroup && this.isBackgroundWorkReady(),
        });
        this.resumeDurableMirrorReplicationWorkers();
        this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
          leaderId: this.replicaId,
          term,
          partitionId: this.partitionId,
        });
      }),
      {
        immediate: this.replicaIds.length === 1,
        shouldActivate: () => !this.isShutdown && this.isLeader,
      },
    );
  },
});

export {PARTITION_SERVICE_LEADER_ACTIVATION_METHODS};
