/**
 * Shared helpers for computing and applying Raft timing settings.
 */

import LifeRaft from './liferaft.js';
import {NUM, STRING, TYPEOF} from '../constants/index.js';

const RAFT_TIMING_DEFAULT = Object.freeze({
  HASH_MODULO: NUM.TEN,
});

// Deterministic, node-independent 32-bit FNV-1a hash. Used to derive a
// per-partition leadership-preference rotation that is identical on every node,
// so it cannot introduce a cross-node election-timeout disagreement.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hashStringDeterministic(value) {
  let hash = FNV_OFFSET_BASIS;
  for (let index = NUM.ZERO; index < value.length; index += NUM.ONE) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> NUM.ZERO;
  }
  return hash >>> NUM.ZERO;
}

/**
 * Compute election timeout values with replica-index jitter applied.
 * @param {Object} options
 * @param {string} options.replicaId
 * @param {Array<string>} options.replicaIds
 * @param {number} options.baseElectionMinMs
 * @param {number} options.baseElectionMaxMs
 * @param {number} options.electionJitterPerReplicaMs
 * @param {string} [options.partitionRotationKey] Stable per-partition key
 *   (partition/group id, identical on every node) used to rotate the
 *   leadership-preference jitter so it spreads across partitions instead of
 *   always preferring the index-0 replica. Omit for index-based behaviour.
 * @return {{electionMinMs: number, electionMaxMs: number, jitterMs: number}}
 */
function computeReplicaElectionTimeouts(options = {}) {
  const replicaId = options.replicaId || STRING.EMPTY;
  const replicaIds = Array.isArray(options.replicaIds) ? options.replicaIds : [];
  const baseElectionMinMs = Number.isFinite(options.baseElectionMinMs) ?
    options.baseElectionMinMs : NUM.ZERO;
  const baseElectionMaxMs = Number.isFinite(options.baseElectionMaxMs) ?
    options.baseElectionMaxMs : NUM.ZERO;
  const electionJitterPerReplicaMs =
    Number.isFinite(options.electionJitterPerReplicaMs) ?
      options.electionJitterPerReplicaMs :
      NUM.ZERO;

  let replicaIndex = replicaIds.indexOf(replicaId);
  if (replicaIndex < NUM.ZERO) {
    const hashCode = replicaId.split(STRING.EMPTY).reduce(
      (acc, char) => acc + char.charCodeAt(NUM.ZERO), NUM.ZERO,
    );
    replicaIndex = replicaIds.length +
      (hashCode % RAFT_TIMING_DEFAULT.HASH_MODULO);
  } else {
    // Leadership de-concentration: the index-0 replica gets jitter 0 (shortest
    // election timeout) and therefore wins leadership for most partitions, piling
    // ~all leaderships onto whichever node holds the index-0 replica. That node then
    // serializes every surplus-drain source-removal on its event loop (the
    // rolling-restart convergence_timeout root). Rotate the jitter assignment by a
    // per-partition offset so a different replica is preferred per partition and
    // leadership spreads across nodes. The rotation is a cyclic permutation of
    // [0, replicaCount), so every replica still receives a DISTINCT jitter (the
    // split-vote-avoidance property is preserved); keyed on the partition/group id
    // (identical on every node) it stays cross-node consistent. No key => unchanged.
    const rotationKey = typeof options.partitionRotationKey === TYPEOF.STRING ?
      options.partitionRotationKey : STRING.EMPTY;
    const replicaCount = replicaIds.length;
    if (rotationKey.length > NUM.ZERO && replicaCount > NUM.ZERO) {
      const rotation = hashStringDeterministic(rotationKey) % replicaCount;
      replicaIndex = (replicaIndex + rotation) % replicaCount;
    }
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
  if (!raft.election || typeof raft.election !== TYPEOF.OBJECT) {
    raft.election = {};
  }
  raft.election.min = electionMinMs;
  raft.election.max = electionMaxMs;

  if (options.rearmTimer &&
    typeof raft.heartbeat === TYPEOF.FUNCTION &&
    typeof raft.timeout === TYPEOF.FUNCTION) {
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
