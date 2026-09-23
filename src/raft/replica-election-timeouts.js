// Election-timeout jitter for a replica group: each replica's election window
// is offset by its position in the group, so replicas that start together do
// not time out together. Backend-neutral arithmetic over the group's own
// replica list; it knows nothing of any consensus implementation.

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

export {computeReplicaElectionTimeouts};
