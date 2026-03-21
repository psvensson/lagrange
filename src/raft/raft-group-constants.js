/**
 * Constants for RaftGroup - composable Raft lifecycle management.
 * Encapsulates liferaft instance creation, event wiring, peer joining,
 * election management, and shutdown.
 */

/**
 * Events emitted by RaftGroup to consumers.
 * These are the public API events that callers subscribe to.
 */
const RAFT_GROUP_EVENT = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  COMMIT: 'commit',
  LEADER_CHANGE: 'leaderChange',
  TERM_CHANGE: 'termChange',
  SHUTDOWN: 'shutdown',
});

/**
 * Raw liferaft events wired during initialize().
 * These are the event names emitted by the liferaft instance itself.
 */
const RAFT_GROUP_LIFERAFT_EVENT = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  COMMIT: 'commit',
  LEADER_CHANGE: 'leader change',
  TERM_CHANGE: 'term change',
});

/**
 * Liferaft timer property names used for clearing during shutdown
 * and deferred election management.
 */
const RAFT_GROUP_LIFERAFT_TIMER = Object.freeze({
  HEARTBEAT: 'heartbeat',
  ELECTION_MIN: 'election min',
  ELECTION_MAX: 'election max',
  LOG: 'Log',
});

/**
 * Raft group roles. A replica is always in exactly one of these roles.
 */
const RAFT_GROUP_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner',
});

/**
 * Default configuration values for RaftGroup timing.
 * These can be overridden via constructor options.
 */
const RAFT_GROUP_DEFAULT = Object.freeze({
  HEARTBEAT_MS: 150,
  ELECTION_MIN_MS: 1000,
  ELECTION_MAX_MS: 3000,
  ELECTION_JITTER_PER_REPLICA_MS: 500,
  LEADER_ACTIVATION_STABILIZATION_MS: 250,
  LEADER_ACTIVATION_NODE_SPACING_MS: 25,
});

/**
 * Address format constants used for peer address validation.
 */
const RAFT_GROUP_ADDRESS = Object.freeze({
  SEPARATOR: '/',
});

/**
 * Log messages emitted by RaftGroup during lifecycle operations.
 */
const RAFT_GROUP_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing RaftGroup',
  INITIALIZED: 'RaftGroup initialized',
  DEFERRING_ELECTION_START: 'Deferring election start',
  BECAME_LEADER: 'Became leader (liferaft)',
  LEADER_CHANGED: 'Leader changed',
  JOINING_PEER_ADDRESS: 'Joining peer with fully qualified address',
  SINGLE_REPLICA_LEADER: 'Single replica - becoming leader immediately',
  STARTING_ELECTION_TIMER: 'Starting Raft election timer',
  RECEIVED_RAFT_PACKET: 'Received Raft packet',
  INVALID_SENDER_ADDRESS:
    'Received Raft packet with invalid sender address',
  SKIPPING_RAFT_RESPONSE:
    'Skipping Raft response due to invalid sender address',
  SENDING_RAFT_RESPONSE: 'Sending Raft response',
  FAILED_RAFT_RESPONSE: 'Failed to send Raft response',
  SHUTDOWN_START: 'Shutting down RaftGroup',
  SHUTDOWN_COMPLETE: 'RaftGroup shutdown complete',
  CLEARED_LIFERAFT_TIMERS:
    'Cleared liferaft timers for deferred election',
  ELECTION_ALREADY_STARTED: 'Election already started, skipping',
});

/**
 * Error messages for RaftGroup validation and runtime errors.
 * Static messages are strings; dynamic messages are functions.
 */
const RAFT_GROUP_ERROR_MSG = Object.freeze({
  MISSING_REPLICA_ID: 'RaftGroup requires replicaId',
  MISSING_ENTITY_TYPE: 'RaftGroup requires entityType',
  MISSING_TRANSPORT: 'RaftGroup requires transport',
  MISSING_PEER_ADDRESS_RESOLVER:
    'RaftGroup requires peerAddressResolver',
  NOT_INITIALIZED: 'RaftGroup not initialized',
  ALREADY_INITIALIZED: 'RaftGroup already initialized',
  peerJoinFailed: (peerId) =>
    `Failed to join peer: ${peerId}`,
  packetHandleFailed: (type) =>
    `Failed to handle Raft packet of type: ${type}`,
});

export {
  RAFT_GROUP_ADDRESS,
  RAFT_GROUP_DEFAULT,
  RAFT_GROUP_ERROR_MSG,
  RAFT_GROUP_EVENT,
  RAFT_GROUP_LIFERAFT_EVENT,
  RAFT_GROUP_LIFERAFT_TIMER,
  RAFT_GROUP_LOG_MSG,
  RAFT_GROUP_ROLE,
};
