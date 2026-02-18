const RAFT_PROVIDER_CONTRACT_METHOD = Object.freeze({
  CREATE_NODE_CLASS: 'createNodeClass',
  PROPOSE: 'propose',
  JOIN_PEER: 'joinPeer',
  START_ELECTION_TIMER: 'startElectionTimer',
  CLEAR_TIMERS: 'clearTimers',
  SHUTDOWN_NODE: 'shutdownNode',
  GET_CURRENT_TERM: 'getCurrentTerm',
  GET_COMMITTED_INDEX: 'getCommittedIndex',
});

const RAFT_PROVIDER_CONTRACT = Object.freeze({
  METHODS: RAFT_PROVIDER_CONTRACT_METHOD,
  REQUIRED_METHODS: Object.freeze(
    Object.values(RAFT_PROVIDER_CONTRACT_METHOD),
  ),
});

const RAFT_PROVIDER_CONTRACT_ERROR_MSG = Object.freeze({
  MISSING_PROVIDER: 'raftProvider is required',
  invalidProviderMethod: (methodName) =>
    `raftProvider must implement ${methodName}(...)`,
});

export {
  RAFT_PROVIDER_CONTRACT,
  RAFT_PROVIDER_CONTRACT_METHOD,
  RAFT_PROVIDER_CONTRACT_ERROR_MSG,
};
