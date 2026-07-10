/**
 * Decide whether a value is a valid Raft log index at an API boundary.
 * SQLite affinity must never coerce strings or fractional values into indexes.
 * @param {*} value - Candidate log index.
 * @return {boolean} True only for non-negative safe integers.
 */
function isValidRaftLogIndex(value) {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

export {isValidRaftLogIndex};
