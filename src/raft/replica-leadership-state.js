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

function wireReplicaLifecycleEvents(replica, options = {}) {
  const raft = options.raft || replica.raft;
  const events = options.events || {};
  const roles = options.roles || {};
  const shouldIgnoreLeaderEvent =
    typeof options.shouldIgnoreLeaderEvent === 'function' ?
      options.shouldIgnoreLeaderEvent :
      () => false;
  const shouldIgnoreDemotionEvent =
    typeof options.shouldIgnoreDemotionEvent === 'function' ?
      options.shouldIgnoreDemotionEvent :
      () => false;
  const getCurrentTerm =
    typeof options.getCurrentTerm === 'function' ?
      options.getCurrentTerm :
      (() => null);
  const onLeader =
    typeof options.onLeader === 'function' ?
      options.onLeader :
      (() => {});
  const onFollower =
    typeof options.onFollower === 'function' ?
      options.onFollower :
      (() => {});
  const onCandidate =
    typeof options.onCandidate === 'function' ?
      options.onCandidate :
      (() => {});
  const onCommit =
    typeof options.onCommit === 'function' ?
      options.onCommit :
      (() => {});
  const onLeaderChange =
    typeof options.onLeaderChange === 'function' ?
      options.onLeaderChange :
      (() => {});
  const onTermChange =
    typeof options.onTermChange === 'function' ?
      options.onTermChange :
      (() => {});
  const normalizeLeaderId =
    typeof options.normalizeLeaderId === 'function' ?
      options.normalizeLeaderId :
      null;

  raft.on(events.LEADER, () => {
    if (shouldIgnoreLeaderEvent(events.LEADER)) {
      return;
    }
    applyReplicaLeadership(replica, roles.LEADER);
    onLeader({term: getCurrentTerm()});
  });

  raft.on(events.FOLLOWER, () => {
    if (shouldIgnoreDemotionEvent(events.FOLLOWER)) {
      return;
    }
    applyReplicaDemotion(replica, roles.FOLLOWER);
    onFollower({
      term: getCurrentTerm(),
      demotedByLeaderChange: false,
    });
  });

  raft.on(events.CANDIDATE, () => {
    if (shouldIgnoreDemotionEvent(events.CANDIDATE)) {
      return;
    }
    applyReplicaDemotion(replica, roles.CANDIDATE);
    onCandidate({term: getCurrentTerm()});
  });

  raft.on(events.COMMIT, (command) => {
    onCommit(command);
  });

  raft.on(events.LEADER_CHANGE, (nextLeaderId) => {
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

  raft.on(events.TERM_CHANGE, (term) => {
    onTermChange({term});
  });
}

export {
  applyReplicaLeadership,
  applyReplicaDemotion,
  clearReplicaLeaderUpdateState,
  normalizeReplicaLeaderId,
  reconcileReplicaLeaderChange,
  wireReplicaLifecycleEvents,
};
