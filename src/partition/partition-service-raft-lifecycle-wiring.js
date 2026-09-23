import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  ERRORS,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_RAFT_EVIDENCE,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_ROLE,
  RaftRole,
  wireReplicaLifecycleEvents,
} = PARTITION_SERVICE_SHARED;

function wirePartitionRaftLifecycleEvents(
  service,
  shouldIgnoreDemotionEvent,
) {
  const recordTransition = (fields) => {
    service.logger.info(PARTITION_SERVICE_LOG_MSG.RAFT_TRANSITION_EVIDENCE, {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
      nodeId: service.nodeId,
      peerCohort: Array.isArray(service.replicaIds) ?
        [...service.replicaIds].sort() :
        [],
      ...fields,
    });
  };
  // The term is the consensus core's own (readStatus().term); nothing here
  // copies it. Committed entries are applied only by the port's
  // committed-entry application, so COMMIT carries no handler; it stays in
  // the map because the lifecycle owner subscribes to every named event.
  wireReplicaLifecycleEvents(service, {
    events: {
      LEADER: PARTITION_SERVICE_ROLE.LEADER,
      FOLLOWER: PARTITION_SERVICE_ROLE.FOLLOWER,
      CANDIDATE: PARTITION_SERVICE_ROLE.CANDIDATE,
      COMMIT: PARTITION_SERVICE_REASON.COMMIT,
      LEADER_CHANGE: PARTITION_SERVICE_REASON.LEADER_CHANGE,
      TERM_CHANGE: PARTITION_SERVICE_REASON.TERM_CHANGE,
    },
    roles: RaftRole,
    getCurrentTerm: () => service.raft.readStatus().term,
    normalizeLeaderId: (candidate) =>
      service.normalizeLeaderReplicaId(candidate),
    shouldIgnoreDemotionEvent,
    onLeader: ({term}) => {
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_ROLE_TRANSITION,
        role: PARTITION_SERVICE_ROLE.LEADER,
        trigger: PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_QUORUM_ELECTED,
        term,
      });
      service.scheduleLeaderOwnedActivation(term);
    },
    onFollower: ({term, demotedByLeaderChange}) => {
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_ROLE_TRANSITION,
        role: PARTITION_SERVICE_ROLE.FOLLOWER,
        trigger: demotedByLeaderChange ?
          PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_LEADER_CHANGE :
          PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_FOLLOWER_EVENT,
        term,
      });
      service.clearPendingCommittedWrites(
        ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      );
      service.cancelLeaderOwnedActivation();
      service.updateRebalancerLeadership();
    },
    onCandidate: ({term}) => {
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_ROLE_TRANSITION,
        role: PARTITION_SERVICE_ROLE.CANDIDATE,
        trigger: PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_CAMPAIGN_STARTED,
        term,
      });
      service.clearPendingCommittedWrites(
        ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      );
      service.cancelLeaderOwnedActivation();
      service.updateRebalancerLeadership();
    },
    onLeaderChange: ({leaderId, previousLeaderId, term, demoted}) => {
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_LEADER_OBSERVATION,
        role: service.role,
        trigger: PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_LEADER_CHANGE,
        term,
        previousLeader: previousLeaderId,
        newLeader: leaderId,
        demoted,
      });
      service.logger.debug(PARTITION_SERVICE_LOG_MSG.LEADER_CHANGED, {
        newLeader: leaderId,
        previousLeader: previousLeaderId,
        term,
        partitionId: service.partitionId,
      });
    },
  });
}

export {wirePartitionRaftLifecycleEvents};
