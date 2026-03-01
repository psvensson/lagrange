/**
 * Constants for RaftReplicaBase - shared Raft replica functionality.
 * Used by both MessageGroupService and PartitionService.
 */

import {NUM} from '../constants/numbers.js';
import {STRING} from '../constants/strings.js';
import {TIME_MS} from '../constants/time.js';

const RAFT_REPLICA_BASE_DEFAULT = Object.freeze({
  NODE_ID: STRING.UNKNOWN,
  // Learner phase: new replicas joining existing groups start as non-voting learners
  // They receive log entries but don't vote until caught up
  // This prevents new replicas from disrupting existing leadership
  LEARNER_PROMOTION_DELAY_MS: TIME_MS.SECOND * 30, // Min time before promotion (30s for stability)
  LEARNER_CATCH_UP_CHECK_INTERVAL_MS: TIME_MS.SECOND, // How often to check catch-up
  // Raft timing: heartbeat should be much smaller than election timeout
  // Election timeout should be 5-10x heartbeat to avoid unnecessary elections
  HEARTBEAT_DEFAULT_MS: 150,
  ELECTION_MIN_DEFAULT_MS: 1000,
  ELECTION_MAX_DEFAULT_MS: 3000,
  // Jitter added per replica index to stagger election timeouts
  // r1 gets base timeout, r2 gets base + 500ms, r3 gets base + 1000ms, etc.
  ELECTION_JITTER_PER_REPLICA_MS: 500,
});

const RAFT_REPLICA_BASE_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner', // Non-voting member during catch-up phase
});

const RAFT_REPLICA_BASE_EVENT = Object.freeze({
  DATA: 'data',
  INITIALIZED: 'initialized',
  LEADER_ELECTED: 'leaderElected',
  LEADER_CHANGED: 'leaderChanged',
  SHUTDOWN: 'shutdown',
  STATE_TRANSITION: 'stateTransition',
});

const RAFT_REPLICA_BASE_LIFERAFT_TIMER = Object.freeze({
  HEARTBEAT: 'heartbeat',
  ELECTION_MIN: 'election min',
  ELECTION_MAX: 'election max',
  LOG: 'Log',
  HEARTBEAT_ELECTION: 'heartbeat, election',
});

const RAFT_REPLICA_BASE_LIFERAFT_EVENT = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  COMMIT: 'commit',
  LEADER_CHANGE: 'leader change',
  TERM_CHANGE: 'term change',
});

const RAFT_REPLICA_BASE_ADDRESS = Object.freeze({
  SEPARATOR: '/',
});

const RAFT_REPLICA_BASE_LOG_MSG = Object.freeze({
  DEFERRING_ELECTION_START: 'Deferring election start',
  STARTING_AS_LEARNER: 'Starting as learner (non-voting) - will promote after catch-up',
  LEARNER_PROMOTION_SCHEDULED: 'Learner promotion check scheduled',
  LEARNER_PROMOTED_TO_FOLLOWER: 'Learner promoted to follower - now participating in elections',
  LEARNER_PROMOTION_CHECK: 'Checking learner promotion eligibility',
  CLEARED_LIFERAFT_TIMERS: 'Cleared liferaft timers for deferred election',
  BECAME_LEADER: 'Became leader (liferaft)',
  LEADER_CHANGED: 'Leader changed',
  JOINING_PEER_ADDRESS: 'Joining peer with fully qualified address',
  PEER_ADDRESS_NOT_UNIFIED: 'Peer address must be in unified format',
  PEER_ADDRESS_FROM_LIST: 'Built peer address from peerAddresses array',
  PEER_ADDRESS_FROM_CACHE: 'Built peer address from cache',
  SINGLE_REPLICA_LEADER: 'Single replica - becoming leader immediately',
  STARTING_ELECTION_TIMER: 'Starting Raft election timer',
  RECEIVED_RAFT_PACKET: 'Received Raft packet',
  SENDING_RAFT_RESPONSE: 'Sending Raft response',
  FAILED_RAFT_RESPONSE: 'Failed to send Raft response',
});

const RAFT_REPLICA_BASE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'RaftReplicaBase not initialized',
  peerAddressNotUnified: (peerId) => `Peer address must be unified: ${peerId}`,
  peerAddressUnresolved: (peerId) => `Unable to resolve unified peer address for ${peerId}`,
  PERSIST_ROLE_FAILED: 'Failed to persist raft role update',
  PERSIST_LEADER_FAILED: 'Failed to persist leader update',
});

const RAFT_REPLICA_BASE_VALUE = Object.freeze({
  HASH_MODULO: NUM.TEN,
});

export {
  RAFT_REPLICA_BASE_ADDRESS,
  RAFT_REPLICA_BASE_DEFAULT,
  RAFT_REPLICA_BASE_ERROR_MSG,
  RAFT_REPLICA_BASE_EVENT,
  RAFT_REPLICA_BASE_LIFERAFT_EVENT,
  RAFT_REPLICA_BASE_LIFERAFT_TIMER,
  RAFT_REPLICA_BASE_LOG_MSG,
  RAFT_REPLICA_BASE_ROLE,
  RAFT_REPLICA_BASE_VALUE,
};
