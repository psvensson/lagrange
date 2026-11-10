// Leader activation and its rebalancer leadership sink. Activation retains
// the existing gate ordering and resumes durable split/merge mirror workers.
import {trackLeaderActivation} from '../diagnostics/raft-churn-sync-sections.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTITION_SERVICE_COLLABORATOR as COLLABORATOR,
  assertPartitionServiceCollaborator,
} from './partition-service-collaborators.js';

const {
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  getTrafficReadinessSnapshot,
} = PARTITION_SERVICE_SHARED;

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
function resolveRebalancerLeadership(service) {
  if (!service.isLeader) {
    return false;
  }
  if (service.isBackgroundWorkReady()) {
    return true;
  }
  const rebalancer = service.rebalancer;
  if (
    !rebalancer ||
    rebalancer.isLeader !== true ||
    rebalancer.isShuttingDown === true
  ) {
    return false;
  }
  const snapshot = getTrafficReadinessSnapshot(
    service.metadataPublicationReadinessState,
  );
  if (snapshot && snapshot.draining === true) {
    return false;
  }
  return true;
}

/**
 * Attach a secondary leadership sink driven in lockstep with this partition's
 * own rebalancer leadership. Used to gate a non-partition reconciler (e.g. the
 * RUNTIME_SERVICE rebalancer owner bound to `service_definitions-p1`) on this
 * partition's raft leadership, so it starts/quiesces with the partition leader
 * and inherits the same drain hysteresis. Pass `null` to detach. A no-op for
 * every partition that has no sink attached.
 * @param {?{setLeader: function(boolean): void}} sink
 */
function setRebalancerLeadershipSink(service, sink) {
  assertPartitionServiceCollaborator(COLLABORATOR.REBALANCER_LEADERSHIP_SINK,
    sink);
  service.rebalancerLeadershipSink = sink || null;
  service.driveRebalancerLeadershipSink();
}

/** @private */
function driveRebalancerLeadershipSink(service) {
  if (service.rebalancerLeadershipSink) {
    service.rebalancerLeadershipSink.setLeader(service.resolveRebalancerLeadership());
  }
}

function updateRebalancerLeadership(service) {
  if (!service.rebalancer) {
    service.maybeInitializeRebalancer();
    service.driveRebalancerLeadershipSink();
    return;
  }
  service.rebalancer.setLeader(service.resolveRebalancerLeadership());
  service.driveRebalancerLeadershipSink();
}

function cancelLeaderOwnedActivation(service) {
  service.leaderActivationGate.cancel({clearActivatedTerm: true});
}

function scheduleLeaderOwnedActivation(service, term) {
  service.leaderActivationGate.schedule(
    term,
    // Sync-section attribution only (see raft-churn-sync-sections.js).
    () => trackLeaderActivation(() => {
      if (service.isShutdown || !service.isLeader) {
        return;
      }
      service.reassertDurableLeaderNodeId();
      if (!service.isJoiningExistingGroup) {
        service.updateRebalancerLeadership();
      }
      service.logger.info(PARTITION_SERVICE_LOG_MSG.BECAME_LEADER, {
        term,
        replicaId: service.replicaId,
        partitionId: service.partitionId,
        rebalancerActive:
          !service.isJoiningExistingGroup && service.isBackgroundWorkReady(),
      });
      service.resumeDurableMirrorReplicationWorkers();
      service.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
        leaderId: service.replicaId,
        term,
        partitionId: service.partitionId,
      });
    }),
    {
      immediate: service.replicaIds.length === 1,
      shouldActivate: () => !service.isShutdown && service.isLeader,
    },
  );
}

export {
  cancelLeaderOwnedActivation,
  driveRebalancerLeadershipSink,
  resolveRebalancerLeadership,
  scheduleLeaderOwnedActivation,
  setRebalancerLeadershipSink,
  updateRebalancerLeadership,
};
