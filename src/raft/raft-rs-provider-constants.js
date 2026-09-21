// What the experimental raft-rs-wasm provider serves at the seam in phase 1,
// what it defers, and why each deferred name is deferred.
//
// The two lists partition the provider seam the production call census finds
// in `src`. Nothing is silently absent: a deferred name is a function that
// refuses by name, so a caller that reaches one gets a typed outcome instead
// of a quieter path.

const RAFT_RS_PROVIDER_METHOD = Object.freeze({
  CREATE_NODE_CLASS: 'createNodeClass',
  CREATE_PARTITION_NODE: 'createPartitionNode',
  PROPOSE: 'propose',
  PROPOSE_WITH_LEADER_ROUTING: 'proposeWithLeaderRouting',
  JOIN_PEER: 'joinPeer',
  START_ELECTION_TIMER: 'startElectionTimer',
  REQUEST_ELECTION_NOW: 'requestElectionNow',
  CLEAR_TIMERS: 'clearTimers',
  SHUTDOWN_NODE: 'shutdownNode',
  GET_CURRENT_TERM: 'getCurrentTerm',
  GET_COMMITTED_INDEX: 'getCommittedIndex',
});

// Served by the core. `createNodeClass` joined them in phase 3: the node
// object it returns is the seam's real integration surface, and
// raft-rs-node-constants.js holds that object's own partition of the census.
const RAFT_RS_PROVIDER_SERVED = Object.freeze([
  RAFT_RS_PROVIDER_METHOD.CREATE_NODE_CLASS,
  // Phase 5: a real partition group runs on this backend. The durable store
  // is opened on the replica's own database, every bootstrap member's raft
  // identity is REGISTERED rather than taken from its position, the tick
  // driver runs on the substrate the group handed over, and the durable
  // retirement record is read before anything ticks.
  RAFT_RS_PROVIDER_METHOD.CREATE_PARTITION_NODE,
  // The tick driver is what an election follows from under this backend, so
  // starting and clearing it are the same owner. They serve nodes this
  // backend built and refuse anything else by name.
  RAFT_RS_PROVIDER_METHOD.START_ELECTION_TIMER,
  RAFT_RS_PROVIDER_METHOD.CLEAR_TIMERS,
  RAFT_RS_PROVIDER_METHOD.REQUEST_ELECTION_NOW,
  RAFT_RS_PROVIDER_METHOD.PROPOSE,
  RAFT_RS_PROVIDER_METHOD.SHUTDOWN_NODE,
  RAFT_RS_PROVIDER_METHOD.GET_CURRENT_TERM,
  RAFT_RS_PROVIDER_METHOD.GET_COMMITTED_INDEX,
]);

// Deferred, each with the reason it is deferred rather than missing.
const RAFT_RS_PROVIDER_DEFERRED = Object.freeze({
  [RAFT_RS_PROVIDER_METHOD.PROPOSE_WITH_LEADER_ROUTING]:
    'leader routing needs the transport integration that phase 1 does not ' +
    'build; raft-rs answers who the leader is through status(), but the ' +
    'forwarding path is the transport owner\'s.',
  [RAFT_RS_PROVIDER_METHOD.JOIN_PEER]:
    'joining a peer by address is liferaft\'s local membership mutation. ' +
    'Under this backend the committed configuration is the membership ' +
    'authority, so a join is a proposed configuration change, not a call ' +
    'that edits a local array. The binding exposes the primitive; the ' +
    'workflow that uses it is a later phase.',
});

// The core status fields the seam's two numeric getters read.
const RAFT_RS_PROVIDER_STATUS_FIELD = Object.freeze({
  TERM: 'term',
  COMMIT: 'commit',
});

const RAFT_RS_PROVIDER_ERROR_MSG = Object.freeze({
  deferred: (name) =>
    `the raft-rs-wasm backend does not serve ${name}() yet: ` +
    `${RAFT_RS_PROVIDER_DEFERRED[name]}`,
  callRefused: (outcome, detail) =>
    `the raft-rs group refused this call: ${outcome}${detail ? ` - ${detail}` : ''}`,
  notARaftRsGroup: (value) =>
    'the raft-rs-wasm provider was handed something that is not one of its ' +
    `groups: ${JSON.stringify(typeof value)}`,
  beyondSafeInteger: (name, value) =>
    `${name} is ${value}, which a JavaScript number cannot hold exactly; ` +
    'the seam\'s shape is a number and this backend refuses to round it',
});

export {
  RAFT_RS_PROVIDER_DEFERRED,
  RAFT_RS_PROVIDER_ERROR_MSG,
  RAFT_RS_PROVIDER_METHOD,
  RAFT_RS_PROVIDER_SERVED,
  RAFT_RS_PROVIDER_STATUS_FIELD,
};
