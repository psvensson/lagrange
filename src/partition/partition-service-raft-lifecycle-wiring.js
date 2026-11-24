import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {
  isPortScheduling,
  readPortClockObligation,
  reconcilePortClockObligation,
} from '../raft/raft-rs-operation-port.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {createConsensusHoldLog} from './partition-consensus-hold-log.js';
import {
  PARTITION_WRITE_RELEASE_CAUSE,
  buildReleasedPendingWriteAnswer,
} from './partition-write-kernel.js';
import {discardParticipantSessions} from
  './partition-participant-transaction-session.js';
import {runLeaderDeterminismSelfCheck} from
  './partition-participant-transaction-self-check.js';

const {
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_RAFT_EVIDENCE,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_ROLE,
  RaftRole,
  wireReplicaLifecycleEvents,
} = PARTITION_SERVICE_SHARED;

const LOCAL_STR_VOTER = 'voter';

function attachPartitionClockObligationBridge(service) {
  if (!service || typeof service !== 'object') {
    return;
  }
  service.isScheduling = () => isPortScheduling(service.raft);
  service.readClockObligation = () => readPortClockObligation(service.raft);
}

function logStartingPartitionElectionTimer(service) {
  service.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_ELECTION_TIMER, {
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    peerCount: service.raft.readStatus().peerCount,
  });
}

function syncPartitionDeferredSchedulingFlag(service) {
  const obligation = readPortClockObligation(service?.raft);
  if (obligation !== null) {
    service.deferredFounderSchedulingPending =
      obligation.deferredSoloFounder === true;
  }
  return obligation;
}

function startPartitionElectionScheduling(service) {
  if (service.electionStarted) {
    return;
  }
  service.electionStarted = true;
  if (!service.raft) {
    return;
  }
  attachPartitionClockObligationBridge(service);
  if (readPortClockObligation(service.raft) === null) {
    service.deferredFounderSchedulingPending = false;
    logStartingPartitionElectionTimer(service);
    service.raft.startScheduling();
    return;
  }
  let logged = false;
  service.raft.startScheduling({
    onClockArmed: () => {
      if (logged || service.isShutdown) {
        return;
      }
      logged = true;
      service.deferredFounderSchedulingPending = false;
      logStartingPartitionElectionTimer(service);
    },
  });
  syncPartitionDeferredSchedulingFlag(service);
}

function activateDeferredFounderSchedulingIfNeeded(service) {
  if (
    !service?.raft ||
    !service.electionStarted ||
    service.isShutdown
  ) {
    return false;
  }
  attachPartitionClockObligationBridge(service);
  const before = readPortClockObligation(service.raft);
  const after = reconcilePortClockObligation(service.raft);
  if (after !== null) {
    service.deferredFounderSchedulingPending =
      after.deferredSoloFounder === true;
  }
  return Boolean(!before?.clockArmed && after?.clockArmed);
}

function wirePartitionRaftLifecycleEvents(
  service,
  shouldIgnoreDemotionEvent,
) {
  attachPartitionClockObligationBridge(service);
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
  // one never handed to it (a write parked while the partition was reserved
  // among them) was not proposed, and this replica does not lead. Its
  // participant staging sessions are discarded with it (TX1 design 7: they
  // hold nothing durable and no connection state).
  const releasePendingWrites = () => {
    service.releasePendingCommittedWrites(
      (pending) => buildReleasedPendingWriteAnswer(pending, service.partitionId,
        {cause: PARTITION_WRITE_RELEASE_CAUSE.LEADERSHIP_LOST}));
    discardParticipantSessions(service);
  };
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
      syncPartitionDeferredSchedulingFlag(service);
      recordTransition({
        eventType: PARTITION_SERVICE_RAFT_EVIDENCE.EVENT_ROLE_TRANSITION,
        role: PARTITION_SERVICE_ROLE.LEADER,
        trigger: PARTITION_SERVICE_RAFT_EVIDENCE.TRIGGER_QUORUM_ELECTED,
        term,
      });
      service.scheduleLeaderOwnedActivation(term);
      // The leader's determinism self-check (TX1 design 3.3), once per
      // connection, before it stages any transaction.
      runLeaderDeterminismSelfCheck(service);
      observeConsensusHold();
    },
    onFollower: ({term, demotedByLeaderChange}) => {
      syncPartitionDeferredSchedulingFlag(service);
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
      syncPartitionDeferredSchedulingFlag(service);
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
      syncPartitionDeferredSchedulingFlag(service);
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
    onTermChange: () => {
      syncPartitionDeferredSchedulingFlag(service);
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
function isJointConfStateObservation(observation) {
  if (observation?.joint === true) {
    return true;
  }
  const outgoing = observation?.confState?.votersOutgoing;
  return Array.isArray(outgoing) && outgoing.length > 0;
}

function isGrowthPromoteOwnedService(service) {
  return (
    service?.learnerFirstAdmission === true ||
    service?.rebalanceCoordinator?.placementAdmissionEnabled === true
  );
}

function voterSetContainsServiceReplica(voterSet, service) {
  const replicaId = String(service?.replicaId || '');
  if (
    replicaId.length > 0 &&
    (voterSet.has(replicaId) || voterSet.has(String(deriveRaftRsPeerId(replicaId))))
  ) {
    return true;
  }
  const statusId = service?.raft?.readStatus?.()?.id;
  return statusId !== undefined && statusId !== null && voterSet.has(String(statusId));
}

function isPromotedLearnerVoterObservation(service, observation) {
  if (
    !isGrowthPromoteOwnedService(service) ||
    !isCatchupLearnerRaftRole(service?.role) ||
    isJointConfStateObservation(observation)
  ) {
    return false;
  }
  if (observation?.role === LOCAL_STR_VOTER) {
    return true;
  }
  const voters = observation?.confState?.voters;
  if (!Array.isArray(voters) || voters.length === 0) {
    return false;
  }
  const voterSet = new Set(voters.map((v) => String(v)));
  return voterSetContainsServiceReplica(voterSet, service);
}

function relayPartitionConsensusObservations(service) {
  attachPartitionClockObligationBridge(service);
  const emit = (fields) => service.emit(
    PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
    {partitionId: service.partitionId, replicaId: service.replicaId,
      ...fields},
  );
  service.raft.subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, (observation) => {
    syncPartitionDeferredSchedulingFlag(service);
    if (isPromotedLearnerVoterObservation(service, observation)) {
      service.role = RaftRole.FOLLOWER;
      service.isJoiningExistingGroup = false;
      service.learnerBootstrapped = true;
      service.cancelLearnerPromotionMonitor?.();
      service.queueRoleUpdate?.(RaftRole.FOLLOWER);
      if (service.isLeader === true) {
        service.updateRebalancerLeadership?.();
      }
    }
    emit({confState: observation?.confState ?? null,
      commitIndex: observation?.commitIndex ?? null,
      appliedIndex: observation?.appliedIndex ?? null});
  });
  service.raft.subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED, (settlement) => {
    syncPartitionDeferredSchedulingFlag(service);
    if ((settlement?.confChangeEntries ?? 0) > 0) {
      emit({appliedIndex: settlement?.appliedIndex ?? null,
        confChangeEntries: settlement.confChangeEntries});
    }
  });
  service.raft.subscribe(RAFT_EVENT.LEADER_CHANGE, (leaderReplicaId) =>
    emit({leaderReplicaId: leaderReplicaId ?? null}));
  service.raft.subscribe(RAFT_EVENT.TERM_CHANGE, (term) => emit({term}));
}

export {
  activateDeferredFounderSchedulingIfNeeded,
  relayPartitionConsensusObservations,
  startPartitionElectionScheduling,
  wirePartitionRaftLifecycleEvents,
};
