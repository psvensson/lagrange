// Owner of OLTP client-error classification shared by the retry owner, the
// adapter sessions (COMMIT-failure mapping) and the benchmark outcome owner:
// SQLSTATE resolution, transport detection and the definite-rollback versus
// unresolved-commit decision.
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;
// Node system-error codes (EPIPE, ETIME, ENXIO, EBUSY, ...) are five
// uppercase letters too; they are socket outcomes, never a SQLSTATE.
const SYSTEM_ERROR_CODE_PATTERN = /^E[A-Z]+$/u;
const CONNECTION_EXCEPTION_SQLSTATE_CLASS = '08';
const OUTCOME_UNKNOWN_CODE = 'OUTCOME_UNKNOWN';
const TRANSPORT_ERROR_CODES = Object.freeze(new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ER_CON_COUNT_ERROR',
]));
const TRANSPORT_ERROR_MESSAGE_PATTERN =
  /Connection terminated|Client has encountered a connection error|not queryable|socket hang up|Connection lost/iu;
// The outcome of a failed COMMIT: the product answered a definite rollback
// (any SQLSTATE outside the connection-exception class), or the answer was
// lost / typed unknown and the commit may have applied.
const COMMIT_FAILURE_OUTCOME = Object.freeze({
  ABORTED: 'aborted',
  UNKNOWN: 'unknown',
});

const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);

function normalizeSqlState(value) {
  if (typeof value !== 'string') return null;
  const normalized = stringToUpperCase(value);
  return SQLSTATE_PATTERN.test(normalized) ? normalized : null;
}

function isSystemError(error) {
  return typeof error?.syscall === 'string' ||
    (typeof error?.code === 'string' && SYSTEM_ERROR_CODE_PATTERN.test(error.code));
}

function resolveSqlState(error) {
  for (const value of [error?.sqlState, error?.sqlstate]) {
    const sqlState = normalizeSqlState(value);
    if (sqlState) return sqlState;
  }
  if (isSystemError(error)) return null;
  return normalizeSqlState(error?.code);
}

// A failure with no product answer: a socket/system error, a driver-level
// connection loss, or a connection-exception SQLSTATE (class 08).
function isOltpTransportError(error) {
  if (!error || typeof error !== 'object') return false;
  if (isSystemError(error)) return true;
  if (error.fatal === true) return true;
  if (typeof error.code === 'string' && TRANSPORT_ERROR_CODES.has(error.code)) return true;
  const sqlState = resolveSqlState(error);
  if (sqlState) return stringStartsWith(sqlState, CONNECTION_EXCEPTION_SQLSTATE_CLASS);
  return TRANSPORT_ERROR_MESSAGE_PATTERN.test(String(error.message || ''));
}

function isOltpOutcomeUnknownError(error) {
  return error?.commitOutcomeUnknown === true ||
    error?.outcome === OUTCOME_UNKNOWN_CODE ||
    error?.code === OUTCOME_UNKNOWN_CODE ||
    error?.errorCode === OUTCOME_UNKNOWN_CODE;
}

// Owner of the COMMIT-failure mapping used by every OLTP adapter session:
// 25P04 and every other product-answered SQLSTATE is a definite rollback;
// a lost answer (transport / 08xxx such as 08007) or a typed unknown outcome
// leaves the commit unresolved.
function resolveOltpCommitFailureOutcome(error) {
  if (error?.outcome === OUTCOME_UNKNOWN_CODE || error?.code === OUTCOME_UNKNOWN_CODE ||
      error?.errorCode === OUTCOME_UNKNOWN_CODE || isOltpTransportError(error)) {
    return COMMIT_FAILURE_OUTCOME.UNKNOWN;
  }
  return COMMIT_FAILURE_OUTCOME.ABORTED;
}

function isOltpSqlState(value) {
  return normalizeSqlState(value) !== null;
}

export {
  COMMIT_FAILURE_OUTCOME as OLTP_COMMIT_FAILURE_OUTCOME,
  isOltpOutcomeUnknownError,
  isOltpSqlState,
  isOltpTransportError,
  resolveOltpCommitFailureOutcome,
  resolveSqlState as resolveOltpErrorSqlState,
};
