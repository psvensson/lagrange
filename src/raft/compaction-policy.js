// Typed compaction outcomes (quest raft-snapshot-retention-compaction, S5).
// SNAPSHOT_PROTOCOL_UNAVAILABLE stays the proofless refusal every existing
// caller receives; the S5 proof-gated decision table adds the rest. The
// frozen refusal result below stays byte-identical — the gated-compaction
// guard asserts deep equality against the exact two-field literal.
const RAFT_COMPACTION_OUTCOME = Object.freeze({
  SNAPSHOT_PROTOCOL_UNAVAILABLE: 'snapshot_protocol_unavailable',
  INVALID_COMPACTION_INDEX: 'invalid_compaction_index',
  ALREADY_COMPACTED: 'already_compacted',
  SNAPSHOT_PROOF_MISSING: 'snapshot_proof_missing',
  SNAPSHOT_PROOF_STALE: 'snapshot_proof_stale',
  SNAPSHOT_PROOF_TERM_CONFLICT: 'snapshot_proof_term_conflict',
  BEYOND_COMMITTED_REFUSAL: 'beyond_committed_refusal',
  BOUNDARY_TERM_UNRESOLVABLE: 'boundary_term_unresolvable',
  COMPACTED: 'compacted',
});

const SNAPSHOT_GATED_COMPACTION_RESULT = Object.freeze({
  outcome: RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROTOCOL_UNAVAILABLE,
  changed: false,
});

/**
 * Refuse physical committed-prefix removal until snapshot recovery exists.
 * @return {{outcome: string, changed: boolean}} Typed no-change outcome.
 */
function unsupportedRaftCompactionResult() {
  return SNAPSHOT_GATED_COMPACTION_RESULT;
}

export {
  RAFT_COMPACTION_OUTCOME,
  unsupportedRaftCompactionResult,
};
