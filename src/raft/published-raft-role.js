import {RAFT_ROLE} from './constants.js';

const DEFAULT_OPTIONS = Object.freeze({
  collapseLeaderToFollower: false,
});

// Published-role projection table: tracked raft role -> role published on the
// durable row. CANDIDATE publishes as FOLLOWER (a transient election state is
// not a distinct published role); unknown/absent roles publish as FOLLOWER.
const PUBLISHED_RAFT_ROLE_BY_TRACKED_ROLE = Object.freeze(new Map([
  [RAFT_ROLE.LEADER, RAFT_ROLE.LEADER],
  [RAFT_ROLE.FOLLOWER, RAFT_ROLE.FOLLOWER],
  [RAFT_ROLE.CANDIDATE, RAFT_ROLE.FOLLOWER],
  [RAFT_ROLE.LEARNER, RAFT_ROLE.LEARNER],
]));

function normalizePublishedRaftRole(role, options = {}) {
  const config = {...DEFAULT_OPTIONS, ...(options || {})};
  const published =
    PUBLISHED_RAFT_ROLE_BY_TRACKED_ROLE.get(role) ?? RAFT_ROLE.FOLLOWER;
  if (published === RAFT_ROLE.LEADER && config.collapseLeaderToFollower) {
    return RAFT_ROLE.FOLLOWER;
  }
  return published;
}

export {normalizePublishedRaftRole};
