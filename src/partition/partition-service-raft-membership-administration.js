import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {raftRsMembershipAdministration} from
  '../raft/raft-rs-membership-administration.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from '../raft/raft-committed-membership-constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
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
 * (recoveryRequired false) is DEFERRED; the port's typed NOT_LEADER (conf
 * changes are taken only at the leader's port, round 2 F-1) is NOT_LEADER,
 * with the leader it named; every other answer is REFUSED. The port's own
 * outcome and reason ride along.
 * @param {Object} answered - The port's settled answer.
 * @return {Object} {outcome, portOutcome, reason, leaderReplicaId?}.
 */
function admissionOfPortAnswer(answered) {
  const portOutcome = answered?.outcome;
  let outcome = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED;
  if (portOutcome === RAFT_OPERATION_OUTCOME.CORE_OK) {
    outcome = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED;
  } else if (portOutcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
      answered.retryable === true && answered.recoveryRequired === false) {
    outcome = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED;
  } else if (portOutcome === RAFT_OPERATION_OUTCOME.CORE_REFUSED &&
      answered.reason === RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER) {
    return {outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER,
      portOutcome, reason: answered.reason,
      leaderReplicaId: answered.leaderReplicaId ?? null};
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

// --- O1 admission liveness (committed-read amendment 1, section 3.5;
// verification V2) ---
// Two sets per replica, both re-driven when a configuration change settles
// (the port's CONF_CHANGE_APPLIED: a conf-change entry applied, effective or
// not, or the core's pending index reached) and when this replica gains
// leadership:
//  - in flight: a proposal the port accepted (or queued); it is not proposed
//    again meanwhile (IN_FLIGHT);
//  - deferred: a proposal the port deferred (the core held an unapplied
//    change and would have dropped it); it latches nothing, so any later
//    cache change still proposes it.
// Every admission is re-evaluated from its services row, without a poll.
// Proposals remembered without a latch and made again on the next
// settlement or leadership gain: deferred by the leader's port, or refused
// NOT_LEADER by a follower's (the leader proposes; this replica does if it
// leads later).
const REDRIVEN_OUTCOMES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER,
]));
const ADMISSION_IN_FLIGHT_OUTCOMES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED,
]));
const ADMISSIONS_IN_FLIGHT = new WeakMap();
const ADMISSIONS_DEFERRED = new WeakMap();

function admissionSetOf(sets, service) {
  if (!sets.has(service)) {
    sets.set(service, new Set());
  }
  return sets.get(service);
}

function admissionsInFlightOf(service) {
  return admissionSetOf(ADMISSIONS_IN_FLIGHT, service);
}

// Where one admission decision leaves its identity: in flight, deferred, or
// in neither (a queued proposal is placed again when the port settles it).
function trackAdmission(service, replicaIdentity, outcome) {
  const inFlight = admissionsInFlightOf(service);
  const deferred = admissionSetOf(ADMISSIONS_DEFERRED, service);
  inFlight.delete(replicaIdentity);
  deferred.delete(replicaIdentity);
  if (ADMISSION_IN_FLIGHT_OUTCOMES.has(outcome)) {
    inFlight.add(replicaIdentity);
  } else if (REDRIVEN_OUTCOMES.has(outcome)) {
    deferred.add(replicaIdentity);
  }
}

function proposeInFlightAdmission(service, peer) {
  const admission = proposeAdmission(service, peer);
  trackAdmission(service, peer.replicaIdentity, admission.outcome);
  admission.settled?.then((settled) =>
    trackAdmission(service, peer.replicaIdentity, settled.outcome));
  return admission;
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
    // Re-driven if this replica gains leadership (it admits then).
    trackAdmission(service, replicaIdentity, admission.outcome);
  } else if ((status.peers || []).some((peer) =>
    peer.replicaIdentity === replicaIdentity)) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER};
  } else if (admissionsInFlightOf(service).has(replicaIdentity)) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT};
  } else {
    admission = proposeInFlightAdmission(service,
      {replicaIdentity, peerAddress});
  }
  recordAdmission(service, peerAddress, admission);
  return Object.freeze(admission);
}

// The row-driven retirements (REMOVE_PEER) the port deferred, by the change
// proposed: re-proposed when a configuration change settles or this replica
// gains leadership, like a deferred admission (verification V2). Removing a
// peer that is no longer a member is a raft no-op, so a repeat is harmless.
const RETIREMENTS_DEFERRED = new WeakMap();

function retirementsDeferredOf(service) {
  if (!RETIREMENTS_DEFERRED.has(service)) {
    RETIREMENTS_DEFERRED.set(service, new Map());
  }
  return RETIREMENTS_DEFERRED.get(service);
}

function trackRetirement(service, change, answered) {
  const key = change.replicaIdentity ?? change.peerAddress;
  if (REDRIVEN_OUTCOMES.has(admissionOfPortAnswer(answered).outcome)) {
    retirementsDeferredOf(service).set(key, change);
  } else {
    retirementsDeferredOf(service).delete(key);
  }
}

/**
 * Propose one row-driven REMOVE_PEER through the port, remembering it when
 * the port deferred it (the core held an unapplied change).
 * @param {Object} service - The partition service.
 * @param {Object} change - The REMOVE_PEER change.
 * @return {*} What the port answered.
 */
function proposePeerRetirement(service, change) {
  const answered = service.raft.proposeConfChange(change);
  if (answered && typeof answered.then === 'function') {
    answered.then((settled) => trackRetirement(service, change, settled),
      (error) => trackRetirement(service, change, {reason: error?.message}));
  } else {
    trackRetirement(service, change, answered);
  }
  return answered;
}

/**
 * The deferred row-driven retirements, handed over and forgotten.
 * @param {Object} service - The partition service.
 * @return {Array<Object>} The REMOVE_PEER changes.
 */
function takeDeferredRetirements(service) {
  const deferred = retirementsDeferredOf(service);
  const taken = [...deferred.values()];
  deferred.clear();
  return taken;
}

/**
 * The admissions this replica proposed or deferred since a configuration
 * change last settled, handed over and forgotten: a change settled (or this
 * replica gained leadership), so none of them is in flight any more and each
 * is re-evaluated once (committed-read amendment 1, section 3.5;
 * verification V2).
 * @param {Object} service - The partition service.
 * @return {Set<string>} The replica identities.
 */
function takeAdmissionsInFlight(service) {
  const inFlight = admissionsInFlightOf(service);
  const deferred = admissionSetOf(ADMISSIONS_DEFERRED, service);
  const taken = new Set([...inFlight, ...deferred]);
  inFlight.clear();
  deferred.clear();
  return taken;
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

// The named voter's state in one committed-membership answer: a voter of
// the incoming or outgoing configuration, absent, or unresolved when an id of
// the configuration has no identity this replica reserved.
function voterMembershipStateOf(answer, sourceReplicaIdentity) {
  let unresolved = false;
  for (const peerId of [...answer.voters, ...answer.votersOutgoing]) {
    const identity = answer.identities[peerId];
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
 * This replica's own committed configuration and leadership, read through
 * its port's one committed-membership read (a witness read: this replica's
 * own applied configuration, whether it leads or not), with the named
 * voter's state in it. Never a row. The observation carries the applied
 * index of the answered configuration and the participation gate, so its
 * reader can tell a replica still below its gate (owner decision O1, B12).
 * @param {Object} service - The partition service (the witness replica).
 * @param {string} sourceReplicaIdentity - The voter asked about.
 * @return {Promise<Object>} Frozen observation.
 */
async function readPartitionReplicaMembership(service, sourceReplicaIdentity) {
  const read = service?.raft?.[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP];
  const answer = typeof read === 'function' ? await read({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS}) : null;
  if (answer?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return Object.freeze({
      state: PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE,
      replicaId: service?.replicaId || null,
      reason: answer?.reason || null,
    });
  }
  return Object.freeze({
    state: voterMembershipStateOf(answer, sourceReplicaIdentity),
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    term: answer.term,
    commitIndex: answer.commitIndex,
    appliedIndex: answer.appliedIndex,
    gateOpen: answer.gateOpen,
    leaderReplicaId: answer.leaderId ?? null,
    transferWindowMaxMs: leadershipTransferWindowMaxMsOf(service),
  });
}

/**
 * Propose the removal of one voter through this replica's port: reserve its
 * identity (so the proposal names a raft peer this replica can address),
 * then REMOVE_PEER in the port's canonical shape. Only the leader's port
 * takes it: a follower answers NOT_LEADER naming the leader (round 2 F-1),
 * so the caller addresses the leader. Removing a non-member is a no-op, so
 * a repeat is harmless. The answer is what the port said.
 * @param {Object} service - The partition service.
 * @param {string} replicaIdentity - The voter to remove.
 * @return {Promise<Object>} {outcome, portOutcome, reason,
 *   leaderReplicaId?}.
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
  proposePeerRetirement,
  reservePartitionRaftPeerIdentity,
  retirePartitionRaftPeer,
  takeAdmissionsInFlight,
  takeDeferredRetirements,
};
