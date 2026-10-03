// A replica's raft timing at initialization: the configured heartbeat and
// election window, with this replica's election jitter applied. Read from
// configuration and the group's own replica list; the same for every group
// kind that opens an operation port.

import {CONFIG_KEY} from '../config/config-constants.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {RAFT_ELECTION_TIMING} from './constants.js';
import {computeReplicaElectionTimeouts} from './replica-election-timeouts.js';

/**
 * The replica's timing at initialization.
 * @param {Object} replica - The replica ({replicaId, replicaIds}).
 * @return {Object} {heartbeatMs, baseElectionMinMs, baseElectionMaxMs,
 *   electionMinMs, electionMaxMs, tickIntervalMs}.
 */
function resolveReplicaRaftTiming(replica) {
  const config = ConfigurationManager.getInstance();
  const heartbeatMs =
    config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
    RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS;
  const baseElectionMinMs =
    config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
    RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS;
  const baseElectionMaxMs =
    config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
    RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS;
  const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
  const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
    replicaId: replica.replicaId,
    replicaIds: replica.replicaIds,
    baseElectionMinMs,
    baseElectionMaxMs,
    electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
  });
  return {
    heartbeatMs,
    baseElectionMinMs,
    baseElectionMaxMs,
    electionMinMs,
    electionMaxMs,
    tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null,
  };
}

export {resolveReplicaRaftTiming};
