import {RAFT_ROLE} from './constants.js';

const DEFAULT_OPTIONS = Object.freeze({
  collapseLeaderToFollower: false,
});

function normalizePublishedRaftRole(role, options = {}) {
  const config = {...DEFAULT_OPTIONS, ...(options || {})};
  if (role === RAFT_ROLE.LEADER) {
    return config.collapseLeaderToFollower ?
      RAFT_ROLE.FOLLOWER :
      RAFT_ROLE.LEADER;
  }
  if (role === RAFT_ROLE.LEARNER) {
    return RAFT_ROLE.LEARNER;
  }
  if (role === RAFT_ROLE.CANDIDATE) {
    return RAFT_ROLE.FOLLOWER;
  }
  return RAFT_ROLE.FOLLOWER;
}

export {normalizePublishedRaftRole};
