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
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_ROLE_TRANSITION,
        role: PARTITION_SERVICE_ROLE.LEADER,
        trigger: PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_QUORUM_ELECTED,
        term,
      });
      service.scheduleLeaderOwnedActivation(term);
    },
    onFollower: ({term, demotedByLeaderChange}) => {
      service.storage.currentTerm = term;
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
      service.storage.currentTerm = term;
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
    onCommit: (command) => {
      service.applyCommittedEntry(command);
      // Applied-watermark certificate (raft-snapshot-checkpoint-format):
      // commit events arrive once per committed entry in index order and
      // applyCommittedEntry is synchronous, so a dense +1 advance equals the
      // applied entry's own index. The adapter committedIndex must NOT be
      // copied here — on a batch it already sits at the batch end before the
      // first apply. On apply throw the advance is skipped and checkpoint
      // creation fails closed on the divergence.
      service.storage.recordAppliedAdvance();
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
    onTermChange: ({term}) => {
      service.storage.currentTerm = term;
    },
  });
}

export {wirePartitionRaftLifecycleEvents};
