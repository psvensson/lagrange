/**
 * Shared helpers for computing and applying Raft timing settings.
 */

import LifeRaft from './liferaft.js';
import {NUM, STRING} from '../constants/index.js';

const RAFT_TIMING_DEFAULT = Object.freeze({
  HASH_MODULO: NUM.TEN,
});

/**
 * Compute election timeout values with replica-index jitter applied.
 * @param {Object} options
 * @param {string} options.replicaId
 * @param {Array<string>} options.replicaIds
 * @param {number} options.baseElectionMinMs
 * @param {number} options.baseElectionMaxMs
 * @param {number} options.electionJitterPerReplicaMs
 * @return {{electionMinMs: number, electionMaxMs: number, jitterMs: number}}
 */
function computeReplicaElectionTimeouts(options = {}) {
  const replicaId = options.replicaId || STRING.EMPTY;
  const replicaIds = Array.isArray(options.replicaIds) ? options.replicaIds : [];
  const baseElectionMinMs = Number.isFinite(options.baseElectionMinMs) ?
    options.baseElectionMinMs : 0;
  const baseElectionMaxMs = Number.isFinite(options.baseElectionMaxMs) ?
    options.baseElectionMaxMs : 0;
  const electionJitterPerReplicaMs =
    Number.isFinite(options.electionJitterPerReplicaMs) ?
      options.electionJitterPerReplicaMs :
      0;

  let replicaIndex = replicaIds.indexOf(replicaId);
  if (replicaIndex < 0) {
    const hashCode = replicaId.split(STRING.EMPTY).reduce(
      (acc, char) => acc + char.charCodeAt(0), 0,
    );
    replicaIndex = replicaIds.length +
      (hashCode % RAFT_TIMING_DEFAULT.HASH_MODULO);
  }

  const jitterMs = replicaIndex * electionJitterPerReplicaMs;
  return {
    electionMinMs: baseElectionMinMs + jitterMs,
    electionMaxMs: baseElectionMaxMs + jitterMs,
    jitterMs,
  };
}

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
