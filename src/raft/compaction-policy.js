const RAFT_COMPACTION_OUTCOME = Object.freeze({
  SNAPSHOT_PROTOCOL_UNAVAILABLE: 'snapshot_protocol_unavailable',
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
