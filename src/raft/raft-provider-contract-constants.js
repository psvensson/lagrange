const RAFT_PROVIDER_CONTRACT_METHOD = Object.freeze({
  CREATE_NODE_CLASS: 'createNodeClass',
  CREATE_PARTITION_NODE: 'createPartitionNode',
  PROPOSE: 'propose',
  JOIN_PEER: 'joinPeer',
  START_ELECTION_TIMER: 'startElectionTimer',
  REQUEST_ELECTION_NOW: 'requestElectionNow',
  CLEAR_TIMERS: 'clearTimers',
  SHUTDOWN_NODE: 'shutdownNode',
  GET_CURRENT_TERM: 'getCurrentTerm',
  GET_COMMITTED_INDEX: 'getCommittedIndex',
});

// What a partition group hands its backend when it asks for the node it will
// run on. These are the group's own requirements, named once so both backends
// read the same names: who the group is, who this peer is and where it is
// reachable, the membership it starts from, the durable log it must not
// diverge from, how to reach a peer, what to do with a committed entry, what
// its timers are, and whether elections are deferred. Nothing here is a
// liferaft concept, and nothing is a hidden global: a backend that needs
// something absent from this list is a boundary change, not a lookup.
const RAFT_PARTITION_NODE_REQUEST = Object.freeze({
  GROUP_ID: 'groupId',
  PEER_ID: 'peerId',
  PEER_ADDRESS: 'peerAddress',
  BOOTSTRAP_PEER_IDS: 'bootstrapPeerIds',
  DURABLE_LOG: 'durableLog',
  // The replica's own durable storage handle. A backend whose record is not
  // an entry log - raft-rs keeps a hard state, an applied position, a
  // configuration state and a snapshot beside its entries - needs the storage
  // itself, not a log shaped for one backend's entries. It is named here
  // because addendum §1 says a backend that needs something absent from this
  // list changes the boundary rather than reaching around it: reading it off
  // the log adapter would be exactly that reach.
  DURABLE_STORAGE: 'durableStorage',
  TIMING: 'timing',
  SUBSTRATE: 'substrate',
  DEFER_ELECTION: 'deferElection',
  SEND_TO_PEER: 'sendToPeer',
  RESOLVE_PEER_ADDRESS: 'resolvePeerAddress',
  APPLY_COMMITTED_ENTRY: 'applyCommittedEntry',
  SNAPSHOT_CATCHUP_NEEDED: 'snapshotCatchupNeeded',
  // The semantic fact behind liferaft's own commit-rollback event: a durable
  // apply transaction did NOT commit, so any cached applied progress is
  // unreliable and must be re-read from the durable store. Every backend can
  // fail an apply transaction, so this is a partition requirement rather
  // than a liferaft detail - and it is the fact that crosses, never the
  // event name.
  APPLY_TRANSACTION_ROLLED_BACK: 'applyTransactionRolledBack',
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
  RAFT_PARTITION_NODE_REQUEST,
  RAFT_PROVIDER_CONTRACT,
  RAFT_PROVIDER_CONTRACT_METHOD,
  RAFT_PROVIDER_CONTRACT_ERROR_MSG,
};
