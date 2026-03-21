/**
 * Shared raft timing defaults for worker-hosted replicas.
 *
 * Worker replicas handle both replica traffic and test/query control traffic
 * on the same thread. Use a wider election window than the in-process
 * defaults so routine cache polling does not destabilize leadership.
 */

const WORKER_RAFT_RUNTIME_DEFAULT = Object.freeze({
  HEARTBEAT_MS: 200,
  ELECTION_MIN_MS: 2500,
  ELECTION_MAX_MS: 4500,
  ELECTION_JITTER_PER_REPLICA_MS: 750,
});

export {WORKER_RAFT_RUNTIME_DEFAULT};
