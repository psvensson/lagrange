// Exact-incarnation native opening history, owned by the lifecycle row.
// UNKNOWN (including a legacy NULL) is never permission to create genesis.
const RAFT_RS_OPENING_HISTORY = Object.freeze({
  NEVER_OPENED: 'never-opened',
  ESTABLISHED: 'established',
  UNKNOWN: 'unknown',
});
const RAFT_RS_OPENING_HISTORY_ERROR = Object.freeze({
  IDENTITY_CHANGED: 'opening-history-identity-changed',
  INVALID_STATE: 'opening-history-invalid-state',
  TRANSACTION_REQUIRED: 'opening-history-transaction-required',
});

export {RAFT_RS_OPENING_HISTORY, RAFT_RS_OPENING_HISTORY_ERROR};
