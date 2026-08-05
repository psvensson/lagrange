// Raft snapshot compacted-follower catch-up vocabulary (quest
// raft-snapshot-compacted-follower-catchup, spec
// solve/specs/raft-snapshot-transfer-install/compacted-follower-catchup-
// design.md, S4). Owns the leader-side typed catch-up decision (emitted by
// liferaft.js at the three append-fail decision sites), the dispatch and
// follower-side install-orchestration outcomes, and the deployment-default
// cluster identity. This is a LEAF module: liferaft.js may import it without
// ever importing transfer/install code.

// The typed decision one leader append-fail evaluation can emit.
// INSTALL_SNAPSHOT: the follower's required start (or failed) index is at or
// below this leader's positive snapshot boundary — the prefix is genuinely
// absent and only an install can make progress. CATCHUP_RANGE_EMPTY: an
// empty catch-up read with NO boundary excuse (boundary-0 gap or an
// above-boundary torn log) — LOG CORRUPTION, and the dispatcher must never
// mint a checkpoint for it (design-verifier MUST-CHANGE).
const RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME = Object.freeze({
  INSTALL_SNAPSHOT: 'install_snapshot',
  CATCHUP_RANGE_EMPTY: 'catchup_range_empty',
});

// Typed outcomes of one leader-side dispatch attempt.
const RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME = Object.freeze({
  SERVED: 'served',
  ALREADY_IN_FLIGHT: 'already_in_flight',
  NOT_INSTALL_DECISION: 'not_install_decision',
  FOLLOWER_ADDRESS_INVALID: 'follower_address_invalid',
  CHECKPOINT_CREATION_FAILED: 'checkpoint_creation_failed',
  SOCKET_UNAVAILABLE: 'socket_unavailable',
  TRANSFER_ABORTED: 'transfer_aborted',
});

// Typed outcomes of one follower-side install orchestration run. Only
// INSTALLED_AND_RECREATED represents recovery progress; INSTALL_REJECTED
// deliberately does NOT recreate — the old state boots per the S2 marker
// semantics.
const RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME = Object.freeze({
  INSTALLED_AND_RECREATED: 'installed_and_recreated',
  RECEIVE_FAILED: 'receive_failed',
  SHUTDOWN_FAILED: 'shutdown_failed',
  INSTALL_REJECTED: 'install_rejected',
  RECREATE_FAILED: 'recreate_failed',
  REGISTER_FAILED: 'register_failed',
});

// Deployment-default cluster identity (S4 identity pinning, superseded by
// the durable cluster identity quest): the checkpoint clusterId now reads
// the replicated CONFIG-row singleton `cluster_id` (minted once at first
// seed bootstrap) via buildSnapshotCatchupIdentityFromCache; this default
// remains only as the pre-identity fallback while no durable identity is
// visible. Real cross-cluster isolation is parity-bound to the
// unauthenticated transport and stays with future authenticated-transport
// work (recorded, not silently widened).
const RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID = 'lagrange-default-cluster';

/**
 * Build one frozen typed catch-up decision as emitted by the leader's
 * append-fail handling.
 * @param {Object} facts decision facts
 * @param {string} facts.outcome one of RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME
 * @param {string} facts.followerAddress the failing follower's address
 * @param {number} facts.startIndex the catch-up start index the leader needs
 * @param {number} facts.failedIndex the index the follower append-failed at
 * @param {number} facts.leaderBoundary the leader's snapshot boundary index
 * @return {Object} frozen decision
 */
function buildSnapshotCatchupDecision(facts) {
  return Object.freeze({
    outcome: facts.outcome,
    followerAddress: facts.followerAddress,
    startIndex: facts.startIndex,
    failedIndex: facts.failedIndex,
    leaderBoundary: facts.leaderBoundary,
  });
}

export {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  buildSnapshotCatchupDecision,
};
