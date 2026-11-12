import {assertRaftOperationSucceeded, deepFreeze} from './raft-operation-port.js';
import {RAFT_EVENT, RAFT_OPERATION_OUTCOME,
  RAFT_REPLICA_MEMBERSHIP as MEMBERSHIP} from './raft-operation-port-constants.js';
import {RAFT_ROLE} from './constants.js';
import {TYPEOF} from '../constants/index.js';


function normalizeReplicaLeaderId(nextLeaderId, options = {}) {
  if (typeof nextLeaderId !== 'string' || nextLeaderId.length === 0) {
    return null;
  }
  const normalizeLeaderId =
    typeof options.normalizeLeaderId === 'function' ?
      options.normalizeLeaderId :
      null;
  if (!normalizeLeaderId) {
    return nextLeaderId;
  }
  const normalizedLeaderId = normalizeLeaderId(nextLeaderId);
  return typeof normalizedLeaderId === 'string' &&
    normalizedLeaderId.length > 0 ?
    normalizedLeaderId :
    nextLeaderId;
}

const CONSENSUS_UNAVAILABLE = deepFreeze({
  outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
  reason: 'replica-consensus-unavailable', phase: 'replica-role-and-term',
  retryable: true, recoveryRequired: false,
});

// One read adapter for service consumers, never a retained field or ledger.
function readReplicaRoleAndTerm(replica) {
  return assertRaftOperationSucceeded(replica?.raft == null ? CONSENSUS_UNAVAILABLE :
    replica.raft.readRoleAndTerm());
}

const SERVICE_AUTHORITY_REFUSAL = Object.freeze({
  MEMBERSHIP: 'replica-membership-unavailable',
  PARTICIPATION: 'replica-participation-unavailable',
  ROUTING: 'replica-routing-unavailable',
  LEADERSHIP: 'replica-leadership-unavailable',
});
const SERVICE_AUTHORITY_PHASE = 'replica-service-authority';

function refuseServiceAuthority(reason) {
  return assertRaftOperationSucceeded(deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason, phase: SERVICE_AUTHORITY_PHASE, retryable: true, recoveryRequired: false,
  }));
}

// Service role is membership-sensitive. A learner remains publishable while
// its participation gate is closed; a voter claim requires its admission.
function serviceRoleOf(observed) {
  if (observed.membership === MEMBERSHIP.LEARNER) return RAFT_ROLE.LEARNER;
  if (observed.membership !== MEMBERSHIP.VOTER) {
    return refuseServiceAuthority(SERVICE_AUTHORITY_REFUSAL.MEMBERSHIP);
  }
  if (observed.gateOpen !== true) {
    return refuseServiceAuthority(SERVICE_AUTHORITY_REFUSAL.PARTICIPATION);
  }
  return observed.role;
}

function readReplicaServiceRole(replica) {
  return serviceRoleOf(readReplicaRoleAndTerm(replica));
}

function activeServiceLeader(replica, observed) {
  return serviceRoleOf(observed) === RAFT_ROLE.LEADER &&
    replica.isLeader === true && replica.leadershipTenure != null &&
    replica.leadershipTenure.term === observed.term;
}

function isReplicaServiceLeader(replica) {
  return activeServiceLeader(replica, readReplicaRoleAndTerm(replica));
}

function requireReplicaServiceLeader(replica) {
  if (!isReplicaServiceLeader(replica)) {
    refuseServiceAuthority(SERVICE_AUTHORITY_REFUSAL.LEADERSHIP);
  }
}

// A successful observation alone cannot restore lifecycle-owned routing.
// Reconsideration happens on the next normal announcement, never in this read.
function readReplicaLeaderRoute(replica) {
  const observed = readReplicaRoleAndTerm(replica);
  const role = serviceRoleOf(observed);
  if (activeServiceLeader(replica, observed)) {
    return {local: true, leaderId: replica.replicaId, role};
  }
  if (observed.role !== RAFT_ROLE.LEADER &&
      typeof replica.leaderId === 'string' && replica.leaderId.length > 0 &&
      replica.leaderId !== replica.replicaId) {
    return {local: false, leaderId: replica.leaderId, role};
  }
  return refuseServiceAuthority(SERVICE_AUTHORITY_REFUSAL.ROUTING);
}

/**
 * Mint a new leadership tenure: a NEW frozen object per tenure, so a reader
 * that kept the previous token sees a different one by identity (the
 * managed-split QPM authority's continuity key: no port read, no state
 * change). Minted at the leadership edge and on every term this replica
 * observes while it leads (a re-election the role events did not separate,
 * e.g. a restored sole voter that campaigns again at a higher term).
 * @param {Object} replica - Replica state.
 * @param {number|null} term - The term the tenure belongs to.
 */
function mintReplicaLeadershipTenure(replica, term) {
  replica.leadershipTenure = Object.freeze({
    term: Number.isFinite(term) ? term : null,
  });
}

/**
 * End the replica's leadership tenure (demotion, shutdown): no token is
 * no leadership a reader may continue.
 * @param {Object} replica - Replica state.
 */
function endReplicaLeadershipTenure(replica) {
  replica.leadershipTenure = null;
}

function renewReplicaLeadershipTenureOnTerm(replica, term) {
  const observedTerm = Number(term);
  if (replica.isLeader !== true || !Number.isFinite(observedTerm) ||
      replica.leadershipTenure?.term === observedTerm) {
    return;
  }
  mintReplicaLeadershipTenure(replica, observedTerm);
}

function applyReplicaLeadership(replica, role, term) {
  replica.role = role;
  replica.isLeader = true;
  replica.leaderId = replica.replicaId;
  // The term is resolved once per leadership edge: the tenure token and
  // the tenure claim below carry the same value.
  mintReplicaLeadershipTenure(replica, term);
  if (typeof replica.queueRoleUpdate === 'function') {
    replica.queueRoleUpdate(role);
  }
  if (typeof replica.queueLeaderNodeUpdate === 'function') {
    // The tenure claim is minted here: the term travels with the leadership
    // event so the owner-local canonical leader projection can stamp it
    // (quest local-leadership-tenure-bound-safety-evidence). Replicas that
    // cannot resolve a term simply mint no claim — fail-closed.
    replica.queueLeaderNodeUpdate(replica.nodeId, term);
  }
}

function clearReplicaLeaderUpdateState(replica) {
  replica.pendingLeaderNodeUpdate = null;
  replica.persistedLeaderNodeId = null;
  if (replica.leaderNodeUpdateRetryTimer) {
    clearTimeout(replica.leaderNodeUpdateRetryTimer);
    replica.leaderNodeUpdateRetryTimer = null;
  }
  if (typeof replica.clearLocalCanonicalLeaderNodeIdIfOwned === 'function') {
    replica.clearLocalCanonicalLeaderNodeIdIfOwned();
  }
}

// Invalidity withdraws permissions; it does not assert a follower role.
function withdrawReplicaLeadership(replica) {
  const active = replica.isLeader === true || replica.leadershipTenure != null;
  replica.isLeader = false;
  replica.leaderId = null;
  endReplicaLeadershipTenure(replica);
  clearReplicaLeaderUpdateState(replica);
  return active;
}

function applyReplicaDemotion(replica, role) {
  replica.role = role;
  replica.isLeader = false;
  replica.leaderId = null;
  endReplicaLeadershipTenure(replica);
  if (typeof replica.queueRoleUpdate === 'function') {
    replica.queueRoleUpdate(role);
  }
  clearReplicaLeaderUpdateState(replica);
}

function reconcileReplicaLeaderChange(
  replica,
  nextLeaderId,
  followerRole,
  options = {},
) {
  const normalizedLeaderId =
    normalizeReplicaLeaderId(nextLeaderId, options);
  const shouldDemote = normalizedLeaderId !== null &&
    normalizedLeaderId !== replica.replicaId &&
    (replica.isLeader === true || replica.role === TYPEOF.STRING &&
      replica.role.toLowerCase() === 'leader');

  if (shouldDemote) {
    applyReplicaDemotion(replica, followerRole);
  }
  replica.leaderId = normalizedLeaderId;
  return shouldDemote;
}

function optionFunction(options, name, fallback = () => {}) {
  return typeof options[name] === 'function' ? options[name] : fallback;
}

function eventSubscriber(raft) {
  return typeof raft?.subscribe === 'function' ?
    raft.subscribe : raft.on.bind(raft);
}

function wireReplicaLifecycleEvents(replica, options = {}) {
  const raft = options.raft || replica.raft;
  // A publication dedupe key only. Every permission still reads its owner;
  // the first config announcement need not repeat initial role publication.
  let publishedMembership = readReplicaRoleAndTerm({raft}).membership;
  const rawSubscribe = eventSubscriber(raft);
  const events = options.events || {};
  const roles = options.roles || {};
  const shouldIgnoreLeaderEvent = optionFunction(
    options, 'shouldIgnoreLeaderEvent', () => false);
  const shouldIgnoreDemotionEvent = optionFunction(
    options, 'shouldIgnoreDemotionEvent', () => false);
  const getCurrentTerm = optionFunction(
    options, 'getCurrentTerm', () => null);
  const onLeader = optionFunction(options, 'onLeader');
  const onFollower = optionFunction(options, 'onFollower');
  const onCandidate = optionFunction(options, 'onCandidate');
  const onLeaderChange = optionFunction(options, 'onLeaderChange');
  const onTermChange = optionFunction(options, 'onTermChange');
  const onObservationRefused = optionFunction(options, 'onObservationRefused');
  const consumeRefusal = (refusal) => {
    const active = withdrawReplicaLeadership(replica);
    onObservationRefused({refusal, active});
    return refusal;
  };
  const subscribe = (event, listener) => rawSubscribe(event, (...args) => {
    try {
      return listener(...args);
    } catch (error) {
      if (error.raftResult === undefined) throw error;
      return consumeRefusal(error.raftResult);
    }
  });
  rawSubscribe(RAFT_EVENT.ROLE_OBSERVATION_REFUSED, consumeRefusal);
  // A committed promotion need not change StateRole. Refresh its projection
  // without changing the catch-up workflow stage or granting leader tenure.
  subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, () => {
    const observed = readReplicaRoleAndTerm(replica);
    if (observed.membership === publishedMembership) return;
    publishedMembership = observed.membership;
    const role = serviceRoleOf(observed);
    if (typeof replica.queueRoleUpdate === 'function') replica.queueRoleUpdate(role);
  });
  const normalizeLeaderId = optionFunction(
    options, 'normalizeLeaderId', null);

  subscribe(events.LEADER, () => {
    if (shouldIgnoreLeaderEvent(events.LEADER)) {
      return;
    }
    const term = getCurrentTerm();
    applyReplicaLeadership(replica, roles.LEADER, term);
    onLeader({term});
  });

  subscribe(events.FOLLOWER, () => {
    if (shouldIgnoreDemotionEvent(events.FOLLOWER)) {
      return;
    }
    const term = getCurrentTerm();
    applyReplicaDemotion(replica, readReplicaServiceRole(replica));
    onFollower({
      term,
      demotedByLeaderChange: false,
    });
  });

  subscribe(events.CANDIDATE, () => {
    if (shouldIgnoreDemotionEvent(events.CANDIDATE)) {
      return;
    }
    const term = getCurrentTerm();
    applyReplicaDemotion(replica, readReplicaServiceRole(replica));
    onCandidate({term});
  });

  subscribe(events.LEADER_CHANGE, (nextLeaderId) => {
    const term = getCurrentTerm();
    const previousLeaderId = replica.leaderId;
    const demoted = reconcileReplicaLeaderChange(
      replica,
      nextLeaderId,
      readReplicaServiceRole(replica),
      {normalizeLeaderId},
    );
    if (demoted) {
      onFollower({
        term,
        demotedByLeaderChange: true,
      });
    }
    onLeaderChange({
      demoted,
      leaderId: replica.leaderId,
      previousLeaderId,
      rawLeaderId: nextLeaderId,
      term,
    });
  });

  subscribe(events.TERM_CHANGE, (term) => {
    renewReplicaLeadershipTenureOnTerm(replica, term);
    onTermChange({term});
  });
}

export {
  readReplicaRoleAndTerm,
  readReplicaServiceRole,
  isReplicaServiceLeader,
  requireReplicaServiceLeader,
  readReplicaLeaderRoute,
  withdrawReplicaLeadership,
  applyReplicaLeadership,
  applyReplicaDemotion,
  endReplicaLeadershipTenure,
  wireReplicaLifecycleEvents,
};
