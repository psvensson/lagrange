/**
 * Shared helpers for computing and applying Raft timing settings.
 */

import LifeRaft from './liferaft.js';
import {computeReplicaElectionTimeouts} from './replica-election-timeouts.js';

/**
 * Apply Raft timing values to a live liferaft instance.
 * @param {Object} options
 * @param {Object|null} options.raft
 * @param {number} options.heartbeatMs
 * @param {number} options.electionMinMs
 * @param {number} options.electionMaxMs
 * @param {boolean} [options.rearmTimer]
 * @return {boolean} True when applied to a raft instance.
 */
function applyRuntimeRaftTiming(options = {}) {
  const raft = options.raft || null;
  const heartbeatMs = options.heartbeatMs;
  const electionMinMs = options.electionMinMs;
  const electionMaxMs = options.electionMaxMs;

  if (!raft ||
    !Number.isFinite(heartbeatMs) ||
    !Number.isFinite(electionMinMs) ||
    !Number.isFinite(electionMaxMs) ||
    electionMinMs > electionMaxMs) {
    return false;
  }

  raft.beat = heartbeatMs;
  if (!raft.election || typeof raft.election !== 'object') {
    raft.election = {};
  }
  raft.election.min = electionMinMs;
  raft.election.max = electionMaxMs;

  if (options.rearmTimer &&
    typeof raft.heartbeat === 'function' &&
    typeof raft.timeout === 'function') {
    const nextDuration = raft.state === LifeRaft.LEADER ?
      raft.beat :
      raft.timeout();
    raft.heartbeat(nextDuration);
  }

  return true;
}

export {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
};
