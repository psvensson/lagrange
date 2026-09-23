// Vocabulary of the legacy partition consensus-state detector
// (partition-legacy-consensus-state.js).
//
// The rs-raft durable store is the only partition consensus record. A
// partition database written by the retired backend carries that backend's
// log and state tables; this module owns their historical names so the
// detector can recognise them without importing the retired backend. The
// names are read-only facts about old files: nothing on the partition path
// creates or writes these tables.

const LEGACY_PARTITION_CONSENSUS_TABLE = Object.freeze({
  LOG: '_raft_log',
  STATE: '_raft_state',
});

// The `_raft_state` keys whose values are consensus state, not an empty
// default. A key's presence alone is not state: a zero term, an empty vote
// and a zero committed index are what a table that never held consensus
// reads as.
const LEGACY_PARTITION_CONSENSUS_STATE_KEY = Object.freeze({
  CURRENT_TERM: 'currentTerm',
  VOTED_FOR: 'votedFor',
  COMMITTED_INDEX: 'committedIndex',
});

const LEGACY_PARTITION_CONSENSUS_SQL = Object.freeze({
  SELECT_TABLE_PRESENT:
    'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?',
  SELECT_ANY_LOG_ROW:
    `SELECT 1 FROM ${LEGACY_PARTITION_CONSENSUS_TABLE.LOG} LIMIT 1`,
  SELECT_STATE_VALUE:
    `SELECT value FROM ${LEGACY_PARTITION_CONSENSUS_TABLE.STATE} ` +
    'WHERE key = ?',
});

// The detector's decision. DETECTED is the only refusal; the other two are
// the cases a partition may start from.
const LEGACY_PARTITION_CONSENSUS_OUTCOME = Object.freeze({
  ABSENT: 'legacy_partition_consensus_state_absent',
  BESIDE_RS_RAFT_RECORD:
    'legacy_partition_consensus_state_beside_rs_raft_record',
  DETECTED: 'legacy_partition_consensus_state_detected',
});

// Why a database holds meaningful legacy consensus state. A refusal carries
// every reason that held, in this order.
const LEGACY_PARTITION_CONSENSUS_REASON = Object.freeze({
  LOG_ENTRIES: 'legacy_log_entries_present',
  CURRENT_TERM: 'legacy_current_term_positive',
  VOTED_FOR: 'legacy_vote_recorded',
  COMMITTED_INDEX: 'legacy_committed_index_positive',
});

const LEGACY_PARTITION_CONSENSUS_ERROR_MSG = Object.freeze({
  detected: (partitionId, reasons) =>
    `partition ${JSON.stringify(partitionId)} database holds legacy ` +
    'consensus state and no rs-raft record ' +
    `(${reasons.join(', ')}); it is not reused and not migrated`,
});

export {
  LEGACY_PARTITION_CONSENSUS_ERROR_MSG,
  LEGACY_PARTITION_CONSENSUS_OUTCOME,
  LEGACY_PARTITION_CONSENSUS_REASON,
  LEGACY_PARTITION_CONSENSUS_SQL,
  LEGACY_PARTITION_CONSENSUS_STATE_KEY,
  LEGACY_PARTITION_CONSENSUS_TABLE,
};
