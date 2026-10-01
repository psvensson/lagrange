import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {createConsensusHoldLog} from './partition-consensus-hold-log.js';
import {
  PARTITION_WRITE_RELEASE_CAUSE,
  buildReleasedPendingWriteAnswer,
} from './partition-write-kernel.js';

const {
  PARTITION_SERVICE_EVENT,
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
  // A replica that stops leading releases every pending write at once, each
  // answered with what this replica knows of it (the write kernel's typed
  // answer): one handed to consensus has an outcome this replica cannot know;
  // one never handed to it was not proposed, and this replica does not lead.
  const releasePendingWrites = () => service.releasePendingCommittedWrites(
    (pending) => buildReleasedPendingWriteAnswer(pending, service.partitionId,
      {cause: PARTITION_WRITE_RELEASE_CAUSE.LEADERSHIP_LOST}));
  // Every announcement is also where the partition sees its group held (the
  // port announces a held group without a role) and serving again.
  const observeConsensusHold = createConsensusHoldLog(service);
  // The term is the consensus core's own (readStatus().term); nothing here
  // copies it. Committed entries are applied only by the port's
  // committed-entry application, which is why no commit event is wired.
  wireReplicaLifecycleEvents(service, {
    events: {
      LEADER: PARTITION_SERVICE_ROLE.LEADER,
      FOLLOWER: PARTITION_SERVICE_ROLE.FOLLOWER,
      CANDIDATE: PARTITION_SERVICE_ROLE.CANDIDATE,
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
      observeConsensusHold();
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
      releasePendingWrites();
      service.cancelLeaderOwnedActivation();
      service.updateRebalancerLeadership();
      observeConsensusHold();
    },
    onCandidate: ({term}) => {
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_ROLE_TRANSITION,
        role: PARTITION_SERVICE_ROLE.CANDIDATE,
        trigger: PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_CAMPAIGN_STARTED,
        term,
      });
      releasePendingWrites();
      service.cancelLeaderOwnedActivation();
      service.updateRebalancerLeadership();
      observeConsensusHold();
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
      observeConsensusHold();
    },
  });
}

/**
 * Relay the port's consensus announcements as the partition service's own
 * CONSENSUS_OBSERVED event, as data: the applied ConfState transition (the
 * first observation after (re)construction included), the leader and the
 * term. A wake-up for the REPLACE owner (design S5.2), never an authority.
 * Called whenever the port is (re)created, so the relay follows the live
 * port.
 * @param {Object} service - The partition service.
 */
function relayPartitionConsensusObservations(service) {
  const emit = (fields) => service.emit(
    PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
    {partitionId: service.partitionId, replicaId: service.replicaId,
      ...fields},
  );
  service.raft.subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, (observation) =>
    emit({confState: observation?.confState ?? null,
      commitIndex: observation?.commitIndex ?? null,
      appliedIndex: observation?.appliedIndex ?? null}));
  service.raft.subscribe(RAFT_EVENT.LEADER_CHANGE, (leaderReplicaId) =>
    emit({leaderReplicaId: leaderReplicaId ?? null}));
  service.raft.subscribe(RAFT_EVENT.TERM_CHANGE, (term) => emit({term}));
}

export {relayPartitionConsensusObservations, wirePartitionRaftLifecycleEvents};
