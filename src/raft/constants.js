import {RAFT_EVENT} from './raft-operation-port-constants.js';

const RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner', // Non-voting member during catch-up phase
});

// VOTER_RAFT_ROLES moved to ./replica-voter-readiness.js — the single owner
// of every voter-readiness membership row (quorum-voter, load-routable,
// repair-only, catchup-learner). Import it from there.

const RAFT_ERROR_NAME = Object.freeze({
  NOT_FOUND: 'NotFoundError',
});

const RAFT_ERROR_CODE = Object.freeze({
  COMMITTED_ENTRY_CONFLICT: 'RAFT_COMMITTED_ENTRY_CONFLICT',
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

export {
  RAFT_ELECTION_TIMING,
  RAFT_EVENT,
  RAFT_ROLE,
  RAFT_ERROR_NAME,
  RAFT_ERROR_CODE,
};
