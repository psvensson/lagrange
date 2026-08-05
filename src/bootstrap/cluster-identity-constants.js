// Cluster identity vocabulary (quest durable-cluster-identity-v2, spec
// join-path-audit-finding-3-no-cluster-identity). Owns the durable cluster
// identity constants shared by the three persistence seams (rejoin hints,
// the replicated CONFIG-row singleton, and the raft snapshot-checkpoint
// identity) plus the typed mismatch refusal vocabulary. This is a LEAF
// module: bootstrap, raft, and entrypoint code may import it without
// importing each other.
//
// The cluster id is minted exactly once — by the first seed bootstrap as a
// randomUUID — and never changes for the life of the cluster. Every durable
// evidence source that carries it must agree; a mismatch at any source fails
// closed with the typed CLUSTER_ID_MISMATCH outcome, never a fall-through to
// fresh seed or join.

// The replicated CONFIG-row singleton key. The CONFIG table is raft-
// replicated and CDC-propagated into every node's SystemTableCache
// (precedent: EPOCH_CONFIG_KEY = 'current_epoch'), so this row is the
// authoritative cluster-wide copy of the identity.
const CLUSTER_ID_CONFIG_KEY = 'cluster_id';

// The compatibility policy for a request or durable source that carries no
// cluster identity (a pre-identity joiner or a hints file written before the
// identity existed). Explicit variants, never null/undefined semantics:
//   UNKNOWN  — the source predates cluster identity; accepted by explicit
//              compatibility policy (the seed stamps the joiner with this
//              cluster's id via the bootstrap response).
//   MATCH    — the source carries this cluster's identity.
//   MISMATCH — the source carries a DIFFERENT cluster's identity; fail
//              closed, never silent acceptance.
const CLUSTER_ID_MATCH_STATE = Object.freeze({
  UNKNOWN: 'unknown',
  MATCH: 'match',
  MISMATCH: 'mismatch',
});

/**
 * Compare an expected cluster id against an actual one with an explicit
 * three-valued outcome (absent identity is UNKNOWN, not a silent match).
 * @param {string|null|undefined} expected the id the caller expects
 * @param {string|null|undefined} actual the id the source carries
 * @return {string} one of CLUSTER_ID_MATCH_STATE
 */
function classifyClusterIdMatch(expected, actual) {
  const expectedId = typeof expected === 'string' && expected.length > 0 ?
    expected :
    null;
  const actualId = typeof actual === 'string' && actual.length > 0 ?
    actual :
    null;
  if (!expectedId || !actualId) {
    return CLUSTER_ID_MATCH_STATE.UNKNOWN;
  }
  return expectedId === actualId ?
    CLUSTER_ID_MATCH_STATE.MATCH :
    CLUSTER_ID_MATCH_STATE.MISMATCH;
}

export {
  CLUSTER_ID_CONFIG_KEY,
  CLUSTER_ID_MATCH_STATE,
  classifyClusterIdMatch,
};
