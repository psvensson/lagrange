import {QUERY_DEFAULTS} from '../../../src/query/query-constants.js';

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
// The product's schema-provisioning states as a client observes them
// (lab 2026-11-01): a CREATE answered 55P03 "Schema provisioning remains
// active" with a retry hint; a table that exists while its partition is not
// yet routable answers XX000 participant failures naming "Partition service
// not found" (ledger D29: the product should answer a provisioning state
// here); a table that does not exist answers 42P01 / "Table not found".
const PROVISIONING_STATE = Object.freeze({
  PROVISIONING_PENDING: 'provisioning_pending',
  PARTITION_NOT_ROUTABLE: 'partition_not_routable',
  TABLE_MISSING: 'table_missing',
});
const SCHEMA_PROVISIONING_ACTIVE_SQLSTATE = '55P03';
const SCHEMA_PROVISIONING_ACTIVE_MARKER = 'Schema provisioning remains active';
const UNDEFINED_TABLE_SQLSTATE = '42P01';
const TABLE_NOT_FOUND_MARKER = 'Table not found';
const INTERNAL_ERROR_SQLSTATE = 'XX000';
const PARTITION_NOT_ROUTABLE_MARKER = 'Partition service not found';

// The provisioning bound: as many engine query timeouts as the wait may
// span (the product's provisioning deadline answers 55P03 after one query
// timeout). Derived, recorded with every provisioning observation.
const SCHEMA_PROVISIONING_QUERY_TIMEOUTS = 4;
const SCHEMA_PROVISIONING_BOUND = Object.freeze({
  boundMs: SCHEMA_PROVISIONING_QUERY_TIMEOUTS * QUERY_DEFAULTS.QUERY_TIMEOUT_MS,
  derivation: Object.freeze({
    engineQueryTimeoutMs: QUERY_DEFAULTS.QUERY_TIMEOUT_MS,
    queryTimeouts: SCHEMA_PROVISIONING_QUERY_TIMEOUTS,
    rule: 'bound = queryTimeouts * engine QUERY_TIMEOUT_MS',
  }),
});
const COMMIT_FAILURE_OUTCOME = Object.freeze({
  ABORTED: 'aborted',
  UNKNOWN: 'unknown',
});

const stringIncludes = Function.call.bind(String.prototype.includes);
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

function answerText(error) {
  const detail = typeof error?.detail === 'string' ? error.detail :
    JSON.stringify(error?.detail ?? null);
  return `${String(error?.message || '')} ${detail}`;
}

// One typed provisioning state for a product answer, or null when the
// answer is not a provisioning state (the caller surfaces it as is).
function classifyOltpProvisioningState(error) {
  const sqlState = resolveSqlState(error);
  const text = answerText(error);
  if (sqlState === SCHEMA_PROVISIONING_ACTIVE_SQLSTATE &&
      stringIncludes(text, SCHEMA_PROVISIONING_ACTIVE_MARKER)) {
    return PROVISIONING_STATE.PROVISIONING_PENDING;
  }
  if (sqlState === UNDEFINED_TABLE_SQLSTATE || stringIncludes(text, TABLE_NOT_FOUND_MARKER)) {
    return PROVISIONING_STATE.TABLE_MISSING;
  }
  if (sqlState === INTERNAL_ERROR_SQLSTATE &&
      stringIncludes(text, PARTITION_NOT_ROUTABLE_MARKER)) {
    return PROVISIONING_STATE.PARTITION_NOT_ROUTABLE;
  }
  return null;
}

function isOltpSqlState(value) {
  return normalizeSqlState(value) !== null;
}

export {
  COMMIT_FAILURE_OUTCOME as OLTP_COMMIT_FAILURE_OUTCOME,
  PROVISIONING_STATE as OLTP_PROVISIONING_STATE,
  SCHEMA_PROVISIONING_BOUND as OLTP_SCHEMA_PROVISIONING_BOUND,
  classifyOltpProvisioningState,
  isOltpOutcomeUnknownError,
  isOltpSqlState,
  isOltpTransportError,
  resolveOltpCommitFailureOutcome,
  resolveSqlState as resolveOltpErrorSqlState,
};
