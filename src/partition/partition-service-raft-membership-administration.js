import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {raftRsMembershipAdministration} from
  '../raft/raft-rs-membership-administration.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';

const {PARTITION_SERVICE_LOG_MSG, RaftRole} = PARTITION_SERVICE_SHARED;
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

export {admitPartitionRaftPeer, reservePartitionRaftPeerIdentity};
