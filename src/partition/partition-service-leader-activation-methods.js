// Leader activation and its rebalancer leadership sink. Activation retains
// the existing gate ordering and resumes durable split/merge mirror workers.
import {trackLeaderActivation} from '../diagnostics/raft-churn-sync-sections.js';
import {LEDGER_PARTITION_ID} from './partition-placement-admission-decision.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  getTrafficReadinessSnapshot,
} = PARTITION_SERVICE_SHARED;

const PARTITION_SERVICE_LEADER_ACTIVATION_METHODS = Object.freeze({
  /**
   * Resolve whether this partition's leadership sink should hold leadership.
   *
   * Policy: background-work readiness gates sink-leadership ACQUISITION;
   * raft leadership gates RETENTION. Once this partition has driven its sink
   * to leadership while the node was ready, a transient node-wide readiness
   * dip (e.g. the shared metadata-publication readiness state re-entering a
   * degraded phase during control-plane recovery) must NOT demote it while
   * this partition still holds raft leadership. Without this hysteresis the
   * sinks (the runtime-service owner, the service-installation reconciler)
   * flap in lockstep with the single shared readiness object each time it
   * oscillates. A draining/shutting-down node still demotes (drain is
   * terminal). The retained state is this partition's own record of the
   * leadership it last drove to its sink: the partition is the single owner
   * of that decision.
   *
   * @return {boolean} Desired sink leadership state.
   * @private
   */
  resolveRebalancerLeadership() {
    if (!this.isLeader) {
      return false;
    }
    if (this.isBackgroundWorkReady()) {
      return true;
    }
    if (this.rebalancerLeadershipSinkHeld !== true) {
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
    // A sink holds no leadership until this partition drives it.
    this.rebalancerLeadershipSinkHeld = false;
    this.driveRebalancerLeadershipSink();
  },
  /** @private */
  driveRebalancerLeadershipSink() {
    if (this.rebalancerLeadershipSink) {
      const desired = this.partitionId === LEDGER_PARTITION_ID ?
        Boolean(this.isLeader && !this.isShutdown) :
        this.resolveRebalancerLeadership();
      this.rebalancerLeadershipSinkHeld = desired;
      this.rebalancerLeadershipSink.setLeader(desired);
    }
  },
  updateRebalancerLeadership() {
    this.maybeInitializeRebalancer();
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
        this.isJoiningExistingGroup = false;
        this.reassertDurableLeaderNodeId();
        this.updateRebalancerLeadership();
        this.logger.info(PARTITION_SERVICE_LOG_MSG.BECAME_LEADER, {
          term,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
          rebalancerActive: this.isBackgroundWorkReady(),
        });
        this.resumeDurableMirrorReplicationWorkers();
        this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
          leaderId: this.replicaId,
          term,
          partitionId: this.partitionId,
        });
      }),
      {
        immediate: this.isSoloReplicaGroup(),
        shouldActivate: () => !this.isShutdown && this.isLeader,
      },
    );
  },
});

export {PARTITION_SERVICE_LEADER_ACTIVATION_METHODS};
