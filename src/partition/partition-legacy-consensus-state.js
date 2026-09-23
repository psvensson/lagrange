// Legacy partition consensus-state detector.
//
// The rs-raft durable store is the only partition consensus record, and a
// partition never migrates, reuses or dual-writes the retired backend's log.
// A partition database that still holds that backend's consensus state and
// no rs-raft record for the partition therefore cannot be started: its
// committed history lives in a log nothing on the partition path reads. The
// partition's boot block asks this owner right after the database is opened,
// before any DDL and before the consensus port exists, and refuses to start
// on DETECTED.
//
// Read-only: the schema is asked first, and nothing is created or written.
// Meaningful state is content, never table existence: any legacy log row, or
// a legacy state row holding a positive term, a recorded vote, or a positive
// committed index. Legacy content beside an rs-raft record for the same
// partition is tolerated: the rs-raft record is the authority and the legacy
// rows are inert.

import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  LEGACY_PARTITION_CONSENSUS_ERROR_MSG,
  LEGACY_PARTITION_CONSENSUS_OUTCOME,
  LEGACY_PARTITION_CONSENSUS_REASON,
  LEGACY_PARTITION_CONSENSUS_SQL,
  LEGACY_PARTITION_CONSENSUS_STATE_KEY,
  LEGACY_PARTITION_CONSENSUS_TABLE,
} from './partition-legacy-consensus-state-constants.js';

/**
 * One read of everything the decision needs, taken only from tables that
 * exist. A value whose table is absent reads as absent, which no reason
 * below counts as state.
 * @param {Object} db - The partition's better-sqlite3 database.
 * @return {Object} {logRowPresent, currentTerm, votedFor, committedIndex}.
 */
function readLegacyConsensusSnapshot(db) {
  const tablePresent = db.prepare(
    LEGACY_PARTITION_CONSENSUS_SQL.SELECT_TABLE_PRESENT);
  const logPresent =
    tablePresent.get(LEGACY_PARTITION_CONSENSUS_TABLE.LOG) !== undefined;
  const statePresent =
    tablePresent.get(LEGACY_PARTITION_CONSENSUS_TABLE.STATE) !== undefined;
  const selectValue = statePresent ?
    db.prepare(LEGACY_PARTITION_CONSENSUS_SQL.SELECT_STATE_VALUE) :
    null;
  const stateValue = (key) => selectValue?.get(key)?.value;
  return Object.freeze({
    logRowPresent: logPresent && db.prepare(
      LEGACY_PARTITION_CONSENSUS_SQL.SELECT_ANY_LOG_ROW).get() !== undefined,
    currentTerm: stateValue(LEGACY_PARTITION_CONSENSUS_STATE_KEY.CURRENT_TERM),
    votedFor: stateValue(LEGACY_PARTITION_CONSENSUS_STATE_KEY.VOTED_FOR),
    committedIndex:
      stateValue(LEGACY_PARTITION_CONSENSUS_STATE_KEY.COMMITTED_INDEX),
  });
}

// When each reason holds, over one snapshot. Table existence is never a
// reason: only content is.
const LEGACY_CONSENSUS_REASON_HOLDS = Object.freeze({
  [LEGACY_PARTITION_CONSENSUS_REASON.LOG_ENTRIES]:
    (snapshot) => snapshot.logRowPresent,
  [LEGACY_PARTITION_CONSENSUS_REASON.CURRENT_TERM]:
    (snapshot) => Number(snapshot.currentTerm) > 0,
  [LEGACY_PARTITION_CONSENSUS_REASON.VOTED_FOR]:
    (snapshot) => typeof snapshot.votedFor === 'string' &&
      snapshot.votedFor.length > 0,
  [LEGACY_PARTITION_CONSENSUS_REASON.COMMITTED_INDEX]:
    (snapshot) => Number(snapshot.committedIndex) > 0,
});

/**
 * Decide whether a partition database may be started on the rs-raft path.
 * @param {Object} options
 * @param {Object} options.db - The partition's opened database.
 * @param {string} options.partitionId - The partition, which is the rs-raft
 *   group id of its durable record.
 * @return {{outcome: string, reasons: Array<string>}} A frozen decision whose
 *   outcome is a LEGACY_PARTITION_CONSENSUS_OUTCOME value.
 */
function detectLegacyPartitionConsensusState({db, partitionId}) {
  const snapshot = readLegacyConsensusSnapshot(db);
  const reasons = Object.freeze(Object.values(LEGACY_PARTITION_CONSENSUS_REASON)
    .filter((reason) => LEGACY_CONSENSUS_REASON_HOLDS[reason](snapshot)));
  if (reasons.length === 0) {
    return Object.freeze({
      outcome: LEGACY_PARTITION_CONSENSUS_OUTCOME.ABSENT, reasons});
  }
  const outcome = RaftRsDurableStore.hasDurableRecordIn(db, partitionId) ?
    LEGACY_PARTITION_CONSENSUS_OUTCOME.BESIDE_RS_RAFT_RECORD :
    LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED;
  return Object.freeze({outcome, reasons});
}

/**
 * The typed startup refusal for a DETECTED decision.
 * @param {{reasons: Array<string>}} decision - A DETECTED decision.
 * @param {string} partitionId - The partition that was refused.
 * @return {Error} An Error whose `code` is the DETECTED outcome and whose
 *   `reasons` are the decision's reasons.
 */
function legacyPartitionConsensusStateError(decision, partitionId) {
  const error = new Error(LEGACY_PARTITION_CONSENSUS_ERROR_MSG.detected(
    partitionId, decision.reasons));
  error.code = LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED;
  error.reasons = decision.reasons;
  return error;
}

export {
  detectLegacyPartitionConsensusState,
  legacyPartitionConsensusStateError,
};
