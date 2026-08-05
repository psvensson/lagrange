/**
 * Seed-restart recovery gate: the proof computation that decides whether a
 * durable seed may serve bootstrap. Extracted from rejoin-hints.js to keep
 * that module under the file-size ratchet while the gate logic stays one
 * canonical owner (the startup decision seam consumes its boolean verdict).
 *
 * A persisted seed role is NOT proof of cluster membership: before a durable
 * seed may serve bootstrap it must confirm its cluster identity (present on
 * both the node-local hints and the startup expectation) AND hold either live
 * peer contact (a probed-reachable current member) or durable quorum evidence
 * (a multi-node membership record with at least one recovered peer). This is
 * what stops an isolated stale seed from resurrecting a divergent cluster
 * purely on its persisted role.
 */

import {
  CLUSTER_ID_MATCH_STATE,
} from './cluster-identity-constants.js';

const SEED_RECOVERY_PROOF_MISSING_ERROR_MESSAGE =
  'A persisted seed role is not proof of cluster membership: this node ' +
  'could not confirm its cluster identity plus either durable quorum ' +
  'evidence or contact with a current cluster member, so it must not ' +
  'serve bootstrap and risk resurrecting a divergent cluster. Verify no ' +
  'cluster member still owns this data before forcing a fresh bootstrap';

/**
 * Decide whether a durable seed holds sufficient recovery proof to serve.
 * @param {Object} options - The startup decision inputs.
 * @param {string} options.clusterIdMatch - classifyClusterIdMatch outcome.
 * @param {string|null} options.selectedPeerAddress - Probed-reachable peer.
 * @param {number} options.clusterNodeCount - Durable membership node count.
 * @param {Array<string>} options.peerAddresses - Recovered peer addresses.
 * @return {boolean} True only when cluster-id is MATCH and either live peer
 *   contact or durable quorum evidence is present.
 */
function resolveSeedRecoveryProofSatisfied({
  clusterIdMatch,
  selectedPeerAddress,
  clusterNodeCount,
  peerAddresses,
}) {
  const clusterIdConfirmed = clusterIdMatch === CLUSTER_ID_MATCH_STATE.MATCH;
  const livePeerProof = typeof selectedPeerAddress === 'string' &&
    selectedPeerAddress.length > 0;
  const durableQuorumProof = clusterNodeCount > 1 ||
    (Array.isArray(peerAddresses) && peerAddresses.length > 0);
  return clusterIdConfirmed && (livePeerProof || durableQuorumProof);
}

/**
 * Build the fail-closed startup decision for a durable seed that lacks
 * recovery proof. Kept here so the decision-build switch in rejoin-hints.js
 * stays under the file-size ratchet; the vocabulary mirrors the other
 * fail-closed startup decisions (typed reason + operator message).
 * @param {Object} context - The collected startup decision context.
 * @param {string} state - The SEED_RECOVERY_PROOF_MISSING decision state.
 * @param {Object} vocabulary - Frozen mode/source/error vocabulary.
 * @return {Object} The fail-closed startup decision (pre-outcome-attach).
 */
function buildSeedRecoveryProofMissingDecision(context, state, vocabulary) {
  return {
    state,
    mode: vocabulary.STARTUP_MODE_FAIL,
    peerAddressState: vocabulary.PEER_ADDRESS_STATE_UNAVAILABLE,
    peerAddress: null,
    peerAddresses: [],
    source: vocabulary.source,
    startupMode: vocabulary.STARTUP_JOIN_MODE_SEED,
    durableStateDetected: true,
    identityMismatch: false,
    clusterIncarnationFence: context.clusterIncarnationFence,
    error: SEED_RECOVERY_PROOF_MISSING_ERROR_MESSAGE,
  };
}

/**
 * Resolve the startup decision state for a node whose persisted role is
 * seed. A persisted seed role is NOT sufficient to serve bootstrap: the node
 * must additionally hold recovery proof (cluster-id match plus live peer
 * contact or durable quorum evidence). An isolated stale seed without proof
 * fails closed instead of resurrecting a divergent cluster.
 * @param {Object} context - The collected startup decision context.
 * @param {Object} decisionState - The AUTO_REJOIN_DECISION_STATE vocabulary.
 * @return {string} DURABLE_SEED when proof holds, else
 *   SEED_RECOVERY_PROOF_MISSING.
 */
function resolveSeedServingDecisionState(context, decisionState) {
  return context.seedRecoveryProofSatisfied === true ?
    decisionState.DURABLE_SEED :
    decisionState.SEED_RECOVERY_PROOF_MISSING;
}

/**
 * Build the startup decision for a durable seed, gated on recovery proof.
 * The seed may serve (mode seed) only when the proof holds; otherwise it
 * fails closed (mode fail) with the typed seed-recovery-proof reason. This
 * is the single owner of the seed-serving decision shape.
 * @param {Object} context - The collected startup decision context.
 * @param {string} state - The resolved seed decision state.
 * @param {Object} vocabulary - Frozen mode/source vocabulary + the durable
 *   startup source resolver.
 * @return {Object} The startup decision (pre-outcome-attach).
 */
function buildSeedServingStartupDecision(context, state, vocabulary) {
  const source = vocabulary.resolveDurableStartupSource(context);
  if (state === vocabulary.DECISION_STATE.SEED_RECOVERY_PROOF_MISSING) {
    return buildSeedRecoveryProofMissingDecision(context, state, {
      STARTUP_MODE_FAIL: vocabulary.STARTUP_MODE_FAIL,
      STARTUP_JOIN_MODE_SEED: vocabulary.STARTUP_JOIN_MODE_SEED,
      PEER_ADDRESS_STATE_UNAVAILABLE:
        vocabulary.PEER_ADDRESS_STATE_UNAVAILABLE,
      source,
    });
  }
  return {
    state,
    mode: vocabulary.STARTUP_MODE_SEED,
    peerAddressState: vocabulary.PEER_ADDRESS_STATE_UNAVAILABLE,
    peerAddress: null,
    peerAddresses: [],
    source,
    startupMode: vocabulary.STARTUP_JOIN_MODE_SEED,
    durableStateDetected: context.durableStateDetected,
    identityMismatch: false,
    clusterIncarnationFence: context.clusterIncarnationFence,
  };
}

export {
  buildSeedServingStartupDecision,
  resolveSeedRecoveryProofSatisfied,
  resolveSeedServingDecisionState,
};
