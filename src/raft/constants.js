const RAFT_PACKET_TYPE = Object.freeze({
  VOTE: 'vote',
  VOTED: 'voted',
  APPEND: 'append',
  APPEND_ACK: 'append ack',
  APPEND_FAIL: 'append fail',
  EXEC: 'exec',
  APPENDED: 'appended',
  ERROR: 'error',
});

const RAFT_PACKET_TYPES = new Set(Object.values(RAFT_PACKET_TYPE));

const RAFT_MESSAGE_TYPE = Object.freeze({
  REQUEST_VOTE: 'RAFT_REQUEST_VOTE',
  REQUEST_VOTE_RESPONSE: 'RAFT_REQUEST_VOTE_RESPONSE',
  APPEND_ENTRIES: 'RAFT_APPEND_ENTRIES',
  APPEND_ENTRIES_RESPONSE: 'RAFT_APPEND_ENTRIES_RESPONSE',
});

// Use a null-prototype object so lookups like map['valueOf'] don't resolve to
// Object.prototype and accidentally match "unknown" packet types.
const RAFT_PACKET_MESSAGE_TYPE = Object.freeze(Object.assign(Object.create(null), {
  [RAFT_PACKET_TYPE.VOTE]: RAFT_MESSAGE_TYPE.REQUEST_VOTE,
  [RAFT_PACKET_TYPE.VOTED]: RAFT_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE,
  [RAFT_PACKET_TYPE.APPEND]: RAFT_MESSAGE_TYPE.APPEND_ENTRIES,
  [RAFT_PACKET_TYPE.APPENDED]: RAFT_MESSAGE_TYPE.APPEND_ENTRIES_RESPONSE,
}));

const RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner', // Non-voting member during catch-up phase
});

const RAFT_EVENT = Object.freeze({
  LEADER: RAFT_ROLE.LEADER,
  FOLLOWER: RAFT_ROLE.FOLLOWER,
  CANDIDATE: RAFT_ROLE.CANDIDATE,
  LEADER_CHANGE: 'leader change',
  COMMIT: 'commit',
  TERM_CHANGE: 'term change',
});

const RAFT_ERROR_NAME = Object.freeze({
  NOT_FOUND: 'NotFoundError',
});

const RAFT_TRANSPORT_ERROR_MSG = Object.freeze({
  MESSAGE_ROUTER_REQUIRED: 'messageRouter is required',
  ENTITY_TYPE_REQUIRED: 'entityType is required',
  NODE_ID_REQUIRED: 'nodeId is required',
});

const RAFT_ELECTION_TIMING = Object.freeze({
  HEARTBEAT_DEFAULT_MS: 150,
  ELECTION_MIN_DEFAULT_MS: 1000,
  ELECTION_MAX_DEFAULT_MS: 3000,
  // Jitter added per replica index to stagger election timeouts.
  // Must be >= (ELECTION_MAX - ELECTION_MIN) so that replica N's max
  // timeout is always less than replica N+1's min timeout.
  // This guarantees lower-indexed replicas always fire first,
  // preventing re-elections and leadership instability.
  JITTER_PER_REPLICA_MS: 2500,
});

const RAFT_TRANSPORT_LOG_MSG = Object.freeze({
  WRITE: '[RaftTransportAdapter] write:',
  WRITE_ERROR: '[RaftTransportAdapter] write error:',
});

export {
  RAFT_ELECTION_TIMING,
  RAFT_PACKET_MESSAGE_TYPE,
  RAFT_PACKET_TYPE,
  RAFT_PACKET_TYPES,
  RAFT_MESSAGE_TYPE,
  RAFT_EVENT,
  RAFT_ROLE,
  RAFT_ERROR_NAME,
  RAFT_TRANSPORT_ERROR_MSG,
  RAFT_TRANSPORT_LOG_MSG,
};
