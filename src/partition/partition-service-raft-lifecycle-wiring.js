import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  ERRORS,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_ROLE,
  RaftRole,
  wireReplicaLifecycleEvents,
} = PARTITION_SERVICE_SHARED;

function wirePartitionRaftLifecycleEvents(
  service,
  shouldIgnoreDemotionEvent,
) {
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
    getCurrentTerm: () =>
      service.raftProvider.getCurrentTerm(service.raft),
    normalizeLeaderId: (candidate) =>
      service.normalizeLeaderReplicaId(candidate),
    shouldIgnoreDemotionEvent,
    onLeader: ({term}) => {
      service.storage.currentTerm = term;
      service.scheduleLeaderOwnedActivation(term);
    },
    onFollower: ({term}) => {
      service.storage.currentTerm = term;
      service.clearPendingCommittedWrites(
        ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      );
      service.cancelLeaderOwnedActivation();
      service.updateRebalancerLeadership();
    },
    onCandidate: ({term}) => {
      service.storage.currentTerm = term;
      service.clearPendingCommittedWrites(
        ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      );
      service.cancelLeaderOwnedActivation();
      service.updateRebalancerLeadership();
    },
    onCommit: (command) => {
      service.applyCommittedEntry(command);
    },
    onLeaderChange: ({leaderId}) => {
      service.logger.debug(PARTITION_SERVICE_LOG_MSG.LEADER_CHANGED, {
        newLeader: leaderId,
        partitionId: service.partitionId,
      });
    },
    onTermChange: ({term}) => {
      service.storage.currentTerm = term;
    },
  });
}

export {wirePartitionRaftLifecycleEvents};
