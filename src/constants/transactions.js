const TRANSACTION_MODE = Object.freeze({
  AUTOCOMMIT: 'AUTOCOMMIT',
  EXPLICIT: 'EXPLICIT',
});

const PARTICIPANT_SET_STATE = Object.freeze({
  OPEN: 'OPEN',
  FROZEN: 'FROZEN',
});

// A coordinator-managed transaction prepares before its decision, a single
// participant included (TX1 prepare-first): NOT_SELECTED until the
// participant set freezes, then TWO_PHASE_COMMIT. The retired
// ONE_PHASE_COMMIT fast path has no value here.
const COMMIT_MODE = Object.freeze({
  NOT_SELECTED: 'NOT_SELECTED',
  TWO_PHASE_COMMIT: 'TWO_PHASE_COMMIT',
});

const PARTICIPANT_COMMIT_OUTCOME = Object.freeze({
  COMMITTED: 'COMMITTED',
  NOT_COMMITTED: 'NOT_COMMITTED',
  UNKNOWN: 'UNKNOWN',
});

// This is the one numeric domain used for transaction birth identity at
// admission and recovery. SQLite cannot retain JavaScript's negative zero,
// and fractional or unsafe integers do not name a stable generation.
function isCanonicalTransactionEpoch(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

export {
  COMMIT_MODE,
  isCanonicalTransactionEpoch,
  PARTICIPANT_COMMIT_OUTCOME,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
};
