// The one group-neutral owner of admitting a peer into a raft-rs group's
// configuration (design R3 section 1.6, decision D4). A partition and a
// message group are its callers: each hands over its own raft-rs operation
// port and describes itself ({groupId, localReplicaIdentity, logger,
// logContext?}, where `logContext` is the caller's own fields for each
// admission record). Founder admission uses port.proposeConfChange; the
// operation-owned learner consumer below uses the semantic membership port
// after authoritative operation observation. Neither bypasses native admission.
//
// Only the leader proposes an admission, in the port's canonical request
// shape; a replica that is not the leader, or a peer the committed
// configuration already names, is a typed no-op the replica records - a
// follower that observes the same peer never forwards a redundant proposal.
// Leadership and membership are read from the port's status (the core),
// never from a cache. Every decision is recorded as what the port answered
// (RAFT_MEMBERSHIP_ADMISSION_OUTCOME), never as proposed regardless of the
// answer.

import {membershipTransitionRefusal} from './raft-rs-membership-transition.js';
import {deepFreeze} from './raft-operation-port.js';
import {raftRsMembershipAdministration} from
  './raft-rs-membership-administration.js';
import {RAFT_ROLE} from './constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME,
  RAFT_MEMBERSHIP_AUTHORIZATION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';

const RAFT_GROUP_MEMBERSHIP_ADMISSION_LOG_MSG = Object.freeze({
  PEER_ADMISSION: 'Raft peer admission',
});

// A refused admission leaves a peer the group's rows name outside the
// configuration, which an operator needs to see; every other decision is
// routine.
const ADMISSION_REFUSED_LOG_LEVEL = 'warn';
const ADMISSION_LOG_LEVEL = 'debug';

// The reservations a later admission may follow: the identity is reserved
// in this replica's registry, or no port of this replica manages the group.
const ADMISSIBLE_RESERVATION_OUTCOMES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME.NOT_MANAGED,
]));

/**
 * Reserve a joining replica's identity in this replica's peer registry, so a
 * proposal or a delivery can name the raft peer it derives.
 * @param {Object} group - {groupId, localReplicaIdentity}.
 * @param {string} joiningReplicaIdentity - The joining replica.
 * @return {Object} The membership administration's reservation answer.
 */
function reserveGroupPeerIdentity({groupId, localReplicaIdentity},
  joiningReplicaIdentity) {
  return raftRsMembershipAdministration.reservePeerIdentity({
    groupId,
    localReplicaIdentity,
    joiningReplicaIdentity,
  });
}

/**
 * What the port's answer to a membership proposal means for the admission:
 * CORE_OK is PROPOSED; a retryable host failure that left the group usable
 * (recoveryRequired false) is DEFERRED; the port's typed NOT_LEADER (conf
 * changes are taken only at the leader's port) is NOT_LEADER, with the
 * leader it named; every other answer is REFUSED. The port's own outcome and
 * reason ride along.
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

// One admission decision in the group's log, with the port's own outcome
// and reason when the admission reached the port.
function recordAdmission(group, peerAddress, admission) {
  const level = admission.outcome === RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED ?
    ADMISSION_REFUSED_LOG_LEVEL : ADMISSION_LOG_LEVEL;
  group.logger[level](RAFT_GROUP_MEMBERSHIP_ADMISSION_LOG_MSG.PEER_ADMISSION, {
    groupId: group.groupId,
    ...group.logContext,
    replicaId: group.localReplicaIdentity,
    peerAddress,
    admission: {
      replicaIdentity: admission.replicaIdentity,
      outcome: admission.outcome,
      portOutcome: admission.portOutcome,
      reason: admission.reason,
    },
  });
}

// Propose the admission through the port and settle it on what the port
// answered. An answer the port queued behind the group's in-flight work is
// QUEUED now and recorded again, as its settled outcome, when the port
// answers; `settled` carries that settled admission.
function proposeAdmission(port, group, {replicaIdentity, peerAddress}) {
  const proposal = port.proposeConfChange({
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
    recordAdmission(group, peerAddress, admission);
    return admission;
  };
  // A queued operation that rejects instead of answering is refused, with
  // the rejection as its reason; it never escapes as an unhandled rejection.
  const settled = Promise.resolve(proposal).then(settle, (error) =>
    settle({reason: error?.message}));
  return {replicaIdentity, settled,
    outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED};
}

// --- Admission liveness (committed-read amendment 1, section 3.5;
// verification V2) ---
// Two sets per port, both re-driven when a configuration change settles and
// when the replica gains leadership:
//  - in flight: a proposal the port accepted (or queued); it is not proposed
//    again meanwhile (IN_FLIGHT);
//  - deferred: a proposal the port deferred, or refused NOT_LEADER on a
//    follower; it latches nothing, so any later observation still proposes
//    it.
const REDRIVEN_ADMISSION_OUTCOMES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER,
]));
const ADMISSION_IN_FLIGHT_OUTCOMES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED,
]));
const ADMISSIONS_IN_FLIGHT = new WeakMap();
const ADMISSIONS_DEFERRED = new WeakMap();

function admissionSetOf(sets, port) {
  if (!sets.has(port)) {
    sets.set(port, new Set());
  }
  return sets.get(port);
}

// Where one admission decision leaves its identity: in flight, deferred, or
// in neither (a queued proposal is placed again when the port settles it).
function trackAdmission(port, replicaIdentity, outcome) {
  const inFlight = admissionSetOf(ADMISSIONS_IN_FLIGHT, port);
  const deferred = admissionSetOf(ADMISSIONS_DEFERRED, port);
  inFlight.delete(replicaIdentity);
  deferred.delete(replicaIdentity);
  if (ADMISSION_IN_FLIGHT_OUTCOMES.has(outcome)) {
    inFlight.add(replicaIdentity);
  } else if (REDRIVEN_ADMISSION_OUTCOMES.has(outcome)) {
    deferred.add(replicaIdentity);
  }
}

function proposeInFlightAdmission(port, group, peer) {
  const admission = proposeAdmission(port, group, peer);
  trackAdmission(port, peer.replicaIdentity, admission.outcome);
  admission.settled?.then((settled) =>
    trackAdmission(port, peer.replicaIdentity, settled.outcome));
  return admission;
}

/**
 * A group's one path to admitting a peer into its raft configuration.
 * @param {Object} port - The replica's raft-rs operation port.
 * @param {Object} group - {groupId, localReplicaIdentity, logger,
 *   logContext?}.
 * @param {Object} peer - {replicaIdentity, peerAddress}.
 * @return {Object} Frozen {replicaIdentity, outcome}, with the port's answer
 *   (`proposal`, `portOutcome`, `reason`) when the admission reached the
 *   port, and `settled` when the port queued it.
 */
function admitGroupPeer(port, group, {replicaIdentity, peerAddress}) {
  const status = port.readStatus();
  let admission;
  if (status?.role !== RAFT_ROLE.LEADER) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER};
    // Re-driven if this replica gains leadership (it admits then).
    trackAdmission(port, replicaIdentity, admission.outcome);
  } else if ((status.peers || []).some((member) =>
    member.replicaIdentity === replicaIdentity)) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER};
  } else if (admissionSetOf(ADMISSIONS_IN_FLIGHT, port).has(replicaIdentity)) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT};
  } else {
    admission = proposeInFlightAdmission(port, group,
      {replicaIdentity, peerAddress});
  }
  recordAdmission(group, peerAddress, admission);
  return Object.freeze(admission);
}

/**
 * Reserve the peer's identity, then admit it: a reservation this replica
 * cannot make is a recorded refusal and proposes nothing.
 * @param {Object} port - The replica's raft-rs operation port.
 * @param {Object} group - {groupId, localReplicaIdentity, logger,
 *   logContext?}.
 * @param {Object} peer - {replicaIdentity, peerAddress}.
 * @return {Object} The frozen admission record.
 */
function reserveAndAdmitGroupPeer(port, group, peer) {
  const reservation = reserveGroupPeerIdentity(group, peer.replicaIdentity);
  if (!ADMISSIBLE_RESERVATION_OUTCOMES.has(reservation.outcome)) {
    const refused = Object.freeze({
      replicaIdentity: peer.replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
      portOutcome: null,
      reason: reservation.reason || reservation.outcome,
    });
    recordAdmission(group, peer.peerAddress, refused);
    return refused;
  }
  return admitGroupPeer(port, group, peer);
}

/**
 * The admissions this port proposed or deferred since a configuration change
 * last settled, handed over and forgotten: a change settled (or the replica
 * gained leadership), so none of them is in flight any more and each is
 * re-evaluated once. A closed replica (no port) has none.
 * @param {Object|null} port - The replica's raft-rs operation port.
 * @return {Set<string>} The replica identities.
 */
function takeGroupAdmissionsInFlight(port) {
  if (port === null || typeof port !== 'object') {
    return new Set();
  }
  const inFlight = admissionSetOf(ADMISSIONS_IN_FLIGHT, port);
  const deferred = admissionSetOf(ADMISSIONS_DEFERRED, port);
  const taken = new Set([...inFlight, ...deferred]);
  inFlight.clear();
  deferred.clear();
  return taken;
}

// Host-composed bindings are read once before asking the repository. They
// are not filled in from a caller's request or from a later port observation.
function learnerReceiver(group) {
  return Object.freeze({groupId: group?.groupId, nodeId: group?.nodeId,
    bootIncarnation: group?.bootIncarnation, localReplicaIdentity: group?.localReplicaIdentity,
    senderNodeId: group?.senderNodeId, senderBootIncarnation: group?.senderBootIncarnation});
}

function learnerPortAvailable(port) {
  return typeof port?.readStatus === 'function' &&
    typeof port?.[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION] === 'function';
}

function refusedLearnerAuthorization(observed) {
  const missing = observed?.outcome === RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE;
  return deepFreeze({...membershipTransitionRefusal(missing ?
    RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE :
    observed?.reason ?? RAFT_MEMBERSHIP_AUTHORIZATION_REASON.MISMATCH), retryable: missing});
}

function learnerRecipientMatches(status, receiver, transition) {
  return status?.groupId === receiver.groupId &&
    status.replicaIdentity === receiver.localReplicaIdentity &&
    transition?.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER;
}

function reserveAndProposeAuthorizedLearner(port, receiver, transition, admitExecution) {
  if (!liveDelivery(admitExecution)) {
    return deliveryRefusal();
  }
  const reserved = reserveGroupPeerIdentity(receiver, transition.replicaIdentity);
  if (reserved.outcome !== RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED) {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.WRONG_RECIPIENT);
  }
  // Same-turn native fences remain authoritative. Do not refresh an issued
  // transition from status here: that would turn stale permission into a grant.
  return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](transition, admitExecution);
}

// Host-composed recipient boundary. The resolver is the existing operation
// repository's bound observation, never a boolean or caller-supplied permit
// validator. Transport authentication/registration and the workflow driver
// must supply the group/sender bindings; this helper does not invent them.
function learnerDeliveryMatches(receiver, delivery) {
  return delivery?.nodeId === receiver.nodeId &&
    delivery.bootIncarnation === receiver.bootIncarnation &&
    delivery.senderNodeId === receiver.senderNodeId &&
    delivery.senderBootIncarnation === receiver.senderBootIncarnation;
}

function liveDelivery(admitExecution) {
  try {
    return admitExecution() === true;
  } catch {
    return false;
  }
}

function deliveryRefusal() {
  return deepFreeze({...membershipTransitionRefusal(
    RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY), retryable: true});
}

function learnerDelivery(receiver, delivery) {
  const admitExecution = delivery?.isCurrent;
  if (typeof admitExecution !== 'function') {
    return {refusal: membershipTransitionRefusal(
      RAFT_MEMBERSHIP_AUTHORIZATION_REASON.DELIVERY_REQUIRED)};
  }
  if (!learnerDeliveryMatches(receiver, delivery) || !liveDelivery(admitExecution)) {
    return {refusal: deliveryRefusal()};
  }
  return {admitExecution};
}

async function proposeAuthorizedGroupLearner(port, group, request, observeAuthorization,
  delivery) {
  if (typeof observeAuthorization !== 'function') {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.REQUIRED);
  }
  if (!learnerPortAvailable(port)) {
    return refusedLearnerAuthorization({
      outcome: RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE});
  }
  const receiver = learnerReceiver(group);
  // Only a host-composed delivery context may cross this boundary. Inbound
  // JSON cannot carry its callable fence. Do not read it from request.
  const captured = learnerDelivery(receiver, delivery);
  if (captured.refusal) return captured.refusal;
  let observed;
  try {
    observed = await observeAuthorization(request, receiver);
  } catch {
    observed = {outcome: RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE};
  }
  if (observed?.outcome !== RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.OBSERVED) {
    return refusedLearnerAuthorization(observed);
  }
  if (!learnerRecipientMatches(port.readStatus(), receiver, observed.transition)) {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.WRONG_RECIPIENT);
  }
  return reserveAndProposeAuthorizedLearner(port, receiver, observed.transition,
    captured.admitExecution);
}

export {
  proposeAuthorizedGroupLearner,
  RAFT_GROUP_MEMBERSHIP_ADMISSION_LOG_MSG,
  REDRIVEN_ADMISSION_OUTCOMES,
  admissionOfPortAnswer,
  admitGroupPeer,
  reserveAndAdmitGroupPeer,
  reserveGroupPeerIdentity,
  takeGroupAdmissionsInFlight,
};
