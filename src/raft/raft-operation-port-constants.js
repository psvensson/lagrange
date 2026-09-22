const RAFT_EVENT = Object.freeze({
  DATA: 'data',
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER_CHANGE: 'leader change',
  COMMIT: 'commit',
  TERM_CHANGE: 'term change',
  COMMITTED_PREFIX_DIVERGENCE: 'committed prefix divergence',
});

const RAFT_OPERATION_OUTCOME = Object.freeze({
  CORE_OK: 'CORE_OK',
  CORE_REFUSED: 'CORE_REFUSED',
  CORE_FATAL: 'CORE_FATAL',
  HOST_FAILURE: 'HOST_FAILURE',
});

const RAFT_MEMBERSHIP_OPERATION = Object.freeze({
  ADD_PEER: 'add-peer',
  REMOVE_PEER: 'remove-peer',
  ADD_LEARNER: 'add-learner',
});

const RAFT_MEMBERSHIP_RESERVATION_OUTCOME = Object.freeze({
  RESERVED: 'RESERVED',
  NOT_MANAGED: 'NOT_MANAGED',
});

export {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
};
