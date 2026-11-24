/**
 * Helpers for validating and normalizing canonical SQLite-stored raft log
 * entries consumed by the consensus log owners.
 */

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_COMMAND = 'command';
const LOCAL_STR_COMMITTED = 'committed';
const UNSUPPORTED_LOG_ENTRY_SHAPE_ERROR_CODE =
  'RAFT_LOG_ENTRY_SHAPE_UNSUPPORTED';
const UNSUPPORTED_LOG_ENTRY_SHAPE_ERROR_MSG =
  'Non-canonical raft log entry shape is unsupported';

/**
 * Check whether a persisted payload uses the canonical entry shape.
 * @param {*} entry
 * @return {boolean}
 */
function isCanonicalLogEntryShape(entry) {
  return !!entry &&
    typeof entry === LOCAL_STR_OBJECT &&
    (
      Object.prototype.hasOwnProperty.call(entry, LOCAL_STR_COMMAND) ||
      Object.prototype.hasOwnProperty.call(entry, LOCAL_STR_COMMITTED)
    );
}

/**
 * Validate and normalize a stored or incoming canonical raft entry.
 * Bare-command rows without the canonical entry shape are rejected fail-closed.
 * @param {*} entry
 * @param {Object} [fallback]
 * @param {number} [fallback.index]
 * @param {number} [fallback.term]
 * @return {Object}
 */
function normalizeLogEntry(entry, fallback = {}) {
  if (!isCanonicalLogEntryShape(entry)) {
    const error = new Error(UNSUPPORTED_LOG_ENTRY_SHAPE_ERROR_MSG);
    error.code = UNSUPPORTED_LOG_ENTRY_SHAPE_ERROR_CODE;
    throw error;
  }
  const index = Number.isFinite(entry.index) ? entry.index : fallback.index;
  const term = Number.isFinite(entry.term) ? entry.term : fallback.term;

  return {
    index,
    term,
    committed: entry.committed === true,
    command: entry.command,
  };
}

export {
  isCanonicalLogEntryShape,
  normalizeLogEntry,
};
