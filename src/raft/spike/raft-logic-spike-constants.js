/**
 * Constants for raft-logic contained spike implementation.
 */

import {
  RAFT_PROVIDER_CONTROL,
} from '../raft-provider-control-constants.js';

const RAFT_LOGIC_SPIKE_ROLE = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
});

const RAFT_LOGIC_SPIKE_EVENT = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  COMMIT: 'commit',
  LEADER_CHANGE: 'leader change',
  TERM_CHANGE: 'term change',
});

const RAFT_LOGIC_SPIKE_DEFAULT = Object.freeze({
  ELECTION_TICK: 10,
  HEARTBEAT_TICK: 1,
  TICK_INTERVAL_MS: 20,
  WAIT_FOR_LEADER_TIMEOUT_MS: 5000,
  WAIT_FOR_COMMIT_TIMEOUT_MS: 5000,
  CLIENT_REQUEST_TIMEOUT_MS: 5000,
  LEADER_STABILIZE_WAIT_MS: 200,
  RESTART_WAIT_MS: 150,
  MIN_INTERNAL_NODE_ID: 1,
  CLUSTER_NODE_ID_STEP: 1,
});

const RAFT_LOGIC_SPIKE_TIME = Object.freeze({
  SECOND_MS: 1000,
  MINUTE_MS: 60 * 1000,
});

const RAFT_LOGIC_SPIKE_ERROR = Object.freeze({
  INVALID_REPLICA_IDS: 'replicaIds must be a non-empty array',
  MISSING_REPLICA_ID: 'replicaId must be a non-empty string',
  REPLICA_ID_NOT_IN_CLUSTER:
    'replicaId must exist in replicaIds',
  ADAPTER_NOT_STARTED: 'raft-logic spike adapter is not started',
});

const RAFT_LOGIC_SPIKE_LOG_MSG = Object.freeze({
  STARTING: 'Starting raft-logic spike adapter',
  STARTED: 'Started raft-logic spike adapter',
  STOPPING: 'Stopping raft-logic spike adapter',
  STOPPED: 'Stopped raft-logic spike adapter',
  COMMAND_REJECTED: 'raft-logic spike command rejected',
  ROLE_CHANGED: 'raft-logic spike role changed',
  LEADER_CHANGED: 'raft-logic spike leader changed',
});

const RAFT_LOGIC_SPIKE_JSON = Object.freeze({
  EMPTY_OBJECT: '{}',
});

export {
  RAFT_PROVIDER_CONTROL,
  RAFT_LOGIC_SPIKE_DEFAULT,
  RAFT_LOGIC_SPIKE_ERROR,
  RAFT_LOGIC_SPIKE_EVENT,
  RAFT_LOGIC_SPIKE_JSON,
  RAFT_LOGIC_SPIKE_LOG_MSG,
  RAFT_LOGIC_SPIKE_ROLE,
  RAFT_LOGIC_SPIKE_TIME,
};
