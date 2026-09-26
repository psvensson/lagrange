import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {raftRsMembershipAdministration} from
  '../raft/raft-rs-membership-administration.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {recoveryRetryWindowMsOf} from '../raft/raft-rs-runtime-tuning.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  './partition-replica-membership-constants.js';
import {computeReplicaElectionTimeouts} from
  '../raft/replica-election-timeouts.js';

const {
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_VALUE,
  RaftRole,
} = PARTITION_SERVICE_SHARED;

// A refused admission leaves a peer the services cache names outside the
// configuration, which an operator needs to see; every other decision is
// routine.
const ADMISSION_REFUSED_LOG_LEVEL = 'warn';
const ADMISSION_LOG_LEVEL = 'debug';

function reservePartitionRaftPeerIdentity(
  service,
  joiningReplicaIdentity,
) {
  return raftRsMembershipAdministration.reservePeerIdentity({
    groupId: service.partitionId,
    localReplicaIdentity: service.replicaId,
    joiningReplicaIdentity,
  });
}

/**
 * What the port's answer to a membership proposal means for the admission:
 * CORE_OK is PROPOSED; a retryable host failure that left the group usable
 * (recoveryRequired false) is DEFERRED; every other answer is REFUSED. The
 * port's own outcome and reason ride along.
 * @param {Object} answered - The port's settled answer.
 * @return {Object} {outcome, portOutcome, reason}.
 */
function admissionOfPortAnswer(answered) {
  const portOutcome = answered?.outcome;
  let outcome = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED;
  if (portOutcome === RAFT_OPERATION_OUTCOME.CORE_OK) {
    outcome = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED;
  } else if (portOutcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
      answered.retryable === true && answered.recoveryRequired === false) {
    outcome = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED;
  }
  return {outcome, portOutcome, reason: answered?.reason};
}

/**
 * Record one admission decision in the partition's log, with the port's own
 * outcome and reason when the admission reached the port.
 * @param {Object} service - The partition service.
 * @param {string} peerAddress - The peer's address.
 * @param {Object} admission - The admission decision.
 */
function recordAdmission(service, peerAddress, admission) {
  const level = admission.outcome === RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED ?
    ADMISSION_REFUSED_LOG_LEVEL : ADMISSION_LOG_LEVEL;
  service.logger[level](PARTITION_SERVICE_LOG_MSG.RAFT_PEER_ADMISSION, {
    partitionId: service.partitionId,
    replicaId: service.replicaId,
    peerAddress,
    admission: {
      replicaIdentity: admission.replicaIdentity,
      outcome: admission.outcome,
      portOutcome: admission.portOutcome,
      reason: admission.reason,
    },
  });
}

/**
 * Propose the admission through the port and settle it on what the port
 * answered. An answer the port queued behind the group's in-flight work is
 * QUEUED now and recorded again, as its settled outcome, when the port
 * answers; `settled` carries that settled admission.
 * @param {Object} service - The partition service.
 * @param {Object} peer - {replicaIdentity, peerAddress}.
 * @return {Object} The admission decision.
 */
function proposeAdmission(service, {replicaIdentity, peerAddress}) {
  const proposal = service.raft.proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
    replicaIdentity,
    peerAddress,
  });
  if (!proposal || typeof proposal.then !== 'function') {
    return {replicaIdentity, proposal,
      ...admissionOfPortAnswer(proposal)};
  }
  const settle = (answered) => {
    const admission = Object.freeze({replicaIdentity, proposal: answered,
      ...admissionOfPortAnswer(answered)});
    recordAdmission(service, peerAddress, admission);
    return admission;
  };
  // A queued operation that rejects instead of answering is refused, with
  // the rejection as its reason; it never escapes as an unhandled rejection.
  const settled = Promise.resolve(proposal).then(settle, (error) =>
    settle({reason: error?.message}));
  return {replicaIdentity, settled,
    outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED};
}

/**
 * The partition's one path to admitting a peer into its raft configuration.
 * Only the leader proposes the admission, in the port's canonical request
 * shape; a replica that is not the leader, or a peer the committed
 * configuration already names, is a typed no-op the replica records - a
 * follower or learner that observes the same peer never forwards a redundant
 * proposal. Leadership and membership are read from the port's status (the
 * core), never from the services cache. A proposal is recorded as what the
 * port answered (RAFT_MEMBERSHIP_ADMISSION_OUTCOME), never as proposed
 * regardless of the answer.
 * @param {Object} service - The partition service.
 * @param {Object} peer - {replicaIdentity, peerAddress}.
 * @return {Object} Frozen {replicaIdentity, outcome}, with the port's answer
 *   (`proposal`, `portOutcome`, `reason`) when the admission reached the
 *   port, and `settled` when the port queued it.
 */
function admitPartitionRaftPeer(service, {replicaIdentity, peerAddress}) {
  const status = service.raft.readStatus();
  let admission;
  if (status?.role !== RaftRole.LEADER) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER};
  } else if ((status.peers || []).some((peer) =>
    peer.replicaIdentity === replicaIdentity)) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER};
  } else {
    admission = proposeAdmission(service, {replicaIdentity, peerAddress});
  }
  recordAdmission(service, peerAddress, admission);
  return Object.freeze(admission);
}

/**
 * The leadership-transfer abort window of the group, maximised over its
 * replica indices: raft-rs aborts a transfer after the leader's
 * election_timeout, which each replica derives from its own jittered timing.
 * @param {Object} service - The partition service.
 * @return {number|null} Milliseconds, or null when the timing is unknown.
 */
function leadershipTransferWindowMaxMsOf(service) {
  const timing = service.raftTimingConfig;
  const replicaIds = Array.isArray(service.replicaIds) ?
    service.replicaIds : [];
  if (!timing || replicaIds.length === 0) {
    return null;
  }
  let windowMs = 0;
  for (const replicaId of replicaIds) {
    const {electionMinMs} = computeReplicaElectionTimeouts({
      replicaId,
      replicaIds,
      baseElectionMinMs: timing.baseElectionMinMs,
      baseElectionMaxMs: timing.baseElectionMaxMs,
      electionJitterPerReplicaMs:
        PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
    });
    windowMs = Math.max(windowMs, recoveryRetryWindowMsOf({
      ...timing,
      electionMinMs,
    }));
  }
  return windowMs > 0 ? windowMs : null;
}

function voterMembershipStateOf(service, status, sourceReplicaIdentity) {
  const identityOfPeerId = new Map((status.peers || []).map((peer) =>
    [String(peer.peerId), peer.replicaIdentity]));
  identityOfPeerId.set(String(status.peerId), service.replicaId);
  const confState = status.confState || {};
  const voterIds = [
    ...(confState.voters || []),
    ...(confState.votersOutgoing || []),
  ].map(String);
  let unresolved = false;
  for (const peerId of voterIds) {
    const identity = identityOfPeerId.get(peerId);
    if (identity === sourceReplicaIdentity) {
      return PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER;
    }
    if (typeof identity !== 'string' || identity.length === 0) {
      unresolved = true;
    }
  }
  return unresolved ?
    PARTITION_REPLICA_MEMBERSHIP_STATE.UNRESOLVED :
    PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT;
}

/**
 * This replica's own committed configuration and leadership, read from its
 * port (the core), with the named voter's state in it. Never a row.
 * @param {Object} service - The partition service (the witness replica).
 * @param {string} sourceReplicaIdentity - The voter asked about.
 * @return {Promise<Object>} Frozen observation.
 */
async function readPartitionReplicaMembership(service, sourceReplicaIdentity) {
  const status = typeof service?.raft?.readStatus === 'function' ?
    await service.raft.readStatus() : null;
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK || !status.confState) {
    return Object.freeze({
      state: PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE,
      replicaId: service?.replicaId || null,
      reason: status?.reason || null,
    });
  }
  return Object.freeze({
    state: voterMembershipStateOf(service, status, sourceReplicaIdentity),
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    term: status.term,
    commitIndex: status.commitIndex,
    leaderReplicaId: status.leaderId ?? null,
    role: status.role,
    transferWindowMaxMs: leadershipTransferWindowMaxMsOf(service),
  });
}

/**
 * Propose the removal of one voter through this replica's port: reserve its
 * identity (so the proposal names a raft peer this replica can address),
 * then REMOVE_PEER in the port's canonical shape. raft-rs forwards a
 * follower's proposal to its leader; removing a non-member is a no-op, so a
 * repeat is harmless. The answer is what the port said.
 * @param {Object} service - The partition service.
 * @param {string} replicaIdentity - The voter to remove.
 * @return {Promise<Object>} {outcome, portOutcome, reason}.
 */
async function retirePartitionRaftPeer(service, replicaIdentity) {
  const reservation = reservePartitionRaftPeerIdentity(
    service, replicaIdentity);
  if (reservation.outcome !== RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED) {
    return Object.freeze({
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
      portOutcome: null,
      reason: reservation.reason || reservation.outcome,
    });
  }
  let answered;
  try {
    answered = await service.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity,
    });
  } catch (error) {
    answered = {reason: error?.message || String(error)};
  }
  return Object.freeze(admissionOfPortAnswer(answered));
}

export {
  admitPartitionRaftPeer,
  readPartitionReplicaMembership,
  reservePartitionRaftPeerIdentity,
  retirePartitionRaftPeer,
};
