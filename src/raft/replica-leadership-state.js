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

function applyReplicaLeadership(replica, role) {
  replica.role = role;
  replica.isLeader = true;
  replica.leaderId = replica.replicaId;
  if (typeof replica.queueRoleUpdate === 'function') {
    replica.queueRoleUpdate(role);
  }
  if (typeof replica.queueLeaderNodeUpdate === 'function') {
    // The tenure claim is minted here: the term travels with the leadership
    // event so the owner-local canonical leader projection can stamp it
    // (quest local-leadership-tenure-bound-safety-evidence). Replicas that
    // cannot resolve a term simply mint no claim — fail-closed.
    replica.queueLeaderNodeUpdate(
      replica.nodeId,
      typeof replica.resolveCurrentTermSafe === 'function' ?
        replica.resolveCurrentTermSafe() :
        null,
    );
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

function applyReplicaDemotion(replica, role) {
  replica.role = role;
  replica.isLeader = false;
  replica.leaderId = null;
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
  const subscribe = eventSubscriber(raft);
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
  const onCommit = optionFunction(options, 'onCommit');
  const onLeaderChange = optionFunction(options, 'onLeaderChange');
  const onTermChange = optionFunction(options, 'onTermChange');
  const normalizeLeaderId = optionFunction(
    options, 'normalizeLeaderId', null);

  subscribe(events.LEADER, () => {
    if (shouldIgnoreLeaderEvent(events.LEADER)) {
      return;
    }
    applyReplicaLeadership(replica, roles.LEADER);
    onLeader({term: getCurrentTerm()});
  });

  subscribe(events.FOLLOWER, () => {
    if (shouldIgnoreDemotionEvent(events.FOLLOWER)) {
      return;
    }
    applyReplicaDemotion(replica, roles.FOLLOWER);
    onFollower({
      term: getCurrentTerm(),
      demotedByLeaderChange: false,
    });
  });

  subscribe(events.CANDIDATE, () => {
    if (shouldIgnoreDemotionEvent(events.CANDIDATE)) {
      return;
    }
    applyReplicaDemotion(replica, roles.CANDIDATE);
    onCandidate({term: getCurrentTerm()});
  });

  subscribe(events.COMMIT, (command) => {
    onCommit(command);
  });

  subscribe(events.LEADER_CHANGE, (nextLeaderId) => {
    const previousLeaderId = replica.leaderId;
    const demoted = reconcileReplicaLeaderChange(
      replica,
      nextLeaderId,
      roles.FOLLOWER,
      {normalizeLeaderId},
    );
    if (demoted) {
      onFollower({
        term: getCurrentTerm(),
        demotedByLeaderChange: true,
      });
    }
    onLeaderChange({
      demoted,
      leaderId: replica.leaderId,
      previousLeaderId,
      rawLeaderId: nextLeaderId,
      term: getCurrentTerm(),
    });
  });

  subscribe(events.TERM_CHANGE, (term) => {
    onTermChange({term});
  });
}

export {
  applyReplicaLeadership,
  applyReplicaDemotion,
  clearReplicaLeaderUpdateState,
  reconcileReplicaLeaderChange,
  wireReplicaLifecycleEvents,
};
