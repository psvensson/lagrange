/**
 * The one by-id replica_operations visibility contract.
 *
 * An owner read of one operation answers exactly one named state:
 *   PRESENT     - the read succeeded and returned the operation row; it is
 *                 the authority at the read mode the caller requested.
 *   ABSENT      - the read succeeded and the authority holds no such
 *                 (coordinator-owned) row. A caller that discharges or
 *                 completes work on absence requests OWNER_RPC_REQUIRED, so
 *                 the answer is the owner's.
 *   UNAVAILABLE - no answer: the read failed (retryably or not), or the
 *                 owner deferred it (priority-recovery deferral, a lagging
 *                 read behind this owner's own persisted transition). It
 *                 carries `deferredOutcome` with the retry semantics of the
 *                 failure. It is never absence and never carries a row: no
 *                 cache or projected row stands in for the owner.
 *
 * `operation` is set only in PRESENT; `deferredOutcome` and `retryAfterMs`
 * only in UNAVAILABLE. A consumer decides on `state` through
 * readOperationVisibilityState, which refuses a value without a named state.
 */

const OPERATION_VISIBILITY_STATE = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
});

const OPERATION_VISIBILITY_STATES = Object.freeze(
  new Set(Object.values(OPERATION_VISIBILITY_STATE)),
);

// The typed error a scalar read raises instead of answering null on
// unavailability (queryAuthoritativeOperationById).
const OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE =
  'REPLICA_OPERATION_OWNER_READ_UNAVAILABLE';
const OPERATION_VISIBILITY_UNAVAILABLE_MESSAGE =
  'replica_operations owner read unavailable for ';
const STATE_REFUSAL_MESSAGE =
  'replica operation visibility observation without a named state: ';

function buildPresentOperationVisibility(operation) {
  return Object.freeze({
    state: OPERATION_VISIBILITY_STATE.PRESENT,
    operation: {...operation},
    deferredOutcome: null,
    retryAfterMs: null,
  });
}

const ABSENT_OPERATION_VISIBILITY = Object.freeze({
  state: OPERATION_VISIBILITY_STATE.ABSENT,
  operation: null,
  deferredOutcome: null,
  retryAfterMs: null,
});

function buildAbsentOperationVisibility() {
  return ABSENT_OPERATION_VISIBILITY;
}

/**
 * @param {Object} deferredOutcome - The typed unavailability (reasonCode,
 *   source, retryAfterMs, retryable, errorCode); required.
 * @return {Object}
 */
function buildUnavailableOperationVisibility(deferredOutcome) {
  if (!deferredOutcome || typeof deferredOutcome !== 'object') {
    throw new TypeError(
      `${STATE_REFUSAL_MESSAGE}UNAVAILABLE without its deferred outcome`);
  }
  return Object.freeze({
    state: OPERATION_VISIBILITY_STATE.UNAVAILABLE,
    operation: null,
    deferredOutcome: Object.freeze({...deferredOutcome}),
    retryAfterMs: Number.isFinite(deferredOutcome.retryAfterMs) ?
      deferredOutcome.retryAfterMs :
      null,
  });
}

/**
 * The named state of one observation. A value that carries none (an
 * operation-or-null, a legacy {operation, deferredOutcome} pair) is refused:
 * no consumer may infer absence from a missing row.
 * @param {Object} observation
 * @return {string} An OPERATION_VISIBILITY_STATE value.
 */
function readOperationVisibilityState(observation) {
  const state = observation?.state;
  if (!OPERATION_VISIBILITY_STATES.has(state)) {
    throw new TypeError(`${STATE_REFUSAL_MESSAGE}${String(state)}`);
  }
  return state;
}

/**
 * The retryable typed error for an UNAVAILABLE observation, for a consumer
 * whose contract is a value or a throw.
 * @param {Object} observation - UNAVAILABLE.
 * @param {string|null} operationId
 * @return {Error}
 */
function buildOperationVisibilityUnavailableError(observation, operationId) {
  const deferredOutcome = observation?.deferredOutcome || null;
  const error = new Error(
    `${OPERATION_VISIBILITY_UNAVAILABLE_MESSAGE}${operationId}`);
  error.code = OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE;
  error.errorCode = OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE;
  error.deferRetry = true;
  error.retryAfterMs = observation?.retryAfterMs ?? null;
  error.operationId = operationId || null;
  error.visibilityState = OPERATION_VISIBILITY_STATE.UNAVAILABLE;
  error.deferredOutcome = deferredOutcome;
  return error;
}

/**
 * The retryable typed error a list read raises when the owner did not
 * answer, instead of an empty list (no operations is never inferred from a
 * failed read).
 * @param {Object|null} result - The failed read result.
 * @param {string} scope - What was being listed.
 * @param {number|null} [retryAfterMs]
 * @return {Error}
 */
function buildOperationListUnavailableError(result, scope, retryAfterMs = null) {
  const error = new Error(`${OPERATION_VISIBILITY_UNAVAILABLE_MESSAGE}${scope}`);
  error.code = OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE;
  error.errorCode = OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE;
  error.deferRetry = true;
  error.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : null;
  error.visibilityState = OPERATION_VISIBILITY_STATE.UNAVAILABLE;
  error.cause = result || null;
  return error;
}

/**
 * The PRESENT row of an observation, else null - for a consumer whose
 * null branch DECIDES NOTHING (it keeps its own copy behind a CAS, re-arms,
 * or reports no winner). It still refuses a value without a named state. A
 * consumer that acts on absence branches on readOperationVisibilityState.
 * @param {Object} observation
 * @return {Object|null}
 */
function presentOperationOf(observation) {
  return readOperationVisibilityState(observation) ===
    OPERATION_VISIBILITY_STATE.PRESENT ?
    observation.operation :
    null;
}

function isOperationVisibilityUnavailableError(error) {
  return error?.code === OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE;
}

export {
  OPERATION_VISIBILITY_STATE,
  OPERATION_VISIBILITY_UNAVAILABLE_ERROR_CODE,
  buildAbsentOperationVisibility,
  buildOperationListUnavailableError,
  buildOperationVisibilityUnavailableError,
  buildPresentOperationVisibility,
  buildUnavailableOperationVisibility,
  isOperationVisibilityUnavailableError,
  presentOperationOf,
  readOperationVisibilityState,
};
