import {TYPEOF} from '../constants/index.js';

function applyReplicaLeadership(replica, role) {
  replica.role = role;
  replica.isLeader = true;
  replica.leaderId = replica.replicaId;
  if (typeof replica.queueRoleUpdate === TYPEOF.FUNCTION) {
    replica.queueRoleUpdate(role);
  }
  if (typeof replica.queueLeaderNodeUpdate === TYPEOF.FUNCTION) {
    replica.queueLeaderNodeUpdate(replica.nodeId);
  }
}

function clearReplicaLeaderUpdateState(replica) {
  replica.pendingLeaderNodeUpdate = null;
  replica.persistedLeaderNodeId = null;
  if (replica.leaderNodeUpdateRetryTimer) {
    clearTimeout(replica.leaderNodeUpdateRetryTimer);
    replica.leaderNodeUpdateRetryTimer = null;
  }
}

function applyReplicaDemotion(replica, role) {
  replica.role = role;
  replica.isLeader = false;
  replica.leaderId = null;
  if (typeof replica.queueRoleUpdate === TYPEOF.FUNCTION) {
    replica.queueRoleUpdate(role);
  }
  clearReplicaLeaderUpdateState(replica);
}

function reconcileReplicaLeaderChange(replica, nextLeaderId, followerRole) {
  const normalizedLeaderId =
    typeof nextLeaderId === TYPEOF.STRING && nextLeaderId.length > 0 ?
      nextLeaderId :
      null;
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
  const shouldIgnoreDemotionEvent =
    typeof options.shouldIgnoreDemotionEvent === TYPEOF.FUNCTION ?
      options.shouldIgnoreDemotionEvent :
      () => false;
  const getCurrentTerm =
    typeof options.getCurrentTerm === TYPEOF.FUNCTION ?
      options.getCurrentTerm :
      (() => null);
  const onLeader =
    typeof options.onLeader === TYPEOF.FUNCTION ?
      options.onLeader :
      (() => {});
  const onFollower =
    typeof options.onFollower === TYPEOF.FUNCTION ?
      options.onFollower :
      (() => {});
  const onCandidate =
    typeof options.onCandidate === TYPEOF.FUNCTION ?
      options.onCandidate :
      (() => {});
  const onCommit =
    typeof options.onCommit === TYPEOF.FUNCTION ?
      options.onCommit :
      (() => {});
  const onLeaderChange =
    typeof options.onLeaderChange === TYPEOF.FUNCTION ?
      options.onLeaderChange :
      (() => {});
  const onTermChange =
    typeof options.onTermChange === TYPEOF.FUNCTION ?
      options.onTermChange :
      (() => {});

  raft.on(events.LEADER, () => {
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
  reconcileReplicaLeaderChange,
  wireReplicaLifecycleEvents,
};
