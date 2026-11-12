/**
 * The one incomplete-operation list read contract (the list sibling of the
 * by-id PRESENT / ABSENT / UNAVAILABLE contract in
 * replica-operation-repository-operation-visibility.js).
 *
 * An owner read of this node's incomplete operations answers exactly one
 * named state:
 *   PRESENT  - the owner answered with rows; `operations` is its complete
 *              list as of the read.
 *   EMPTY    - the owner answered with no rows: a confirmed empty.
 *   DEFERRED - no answer: the read failed, is backing off, was deferred by
 *              priority recovery or paused by local router pressure. It
 *              carries no list (`operations` is empty, `complete` false) and
 *              `deferredOutcome` with the retry semantics of the failure. No
 *              cache or projected row stands in for the owner: a consumer
 *              that needs a hint reads the cache projection by name
 *              (queryCachedIncompleteOperations) and decides nothing on it.
 *
 * A consumer decides on `state` through readIncompleteOperationListState,
 * which refuses a value without a named state (a bare array included).
 */

const INCOMPLETE_OPERATION_OBSERVATION_STATE = Object.freeze({
  PRESENT: 'present',
  EMPTY: 'empty',
  DEFERRED: 'deferred',
});

const INCOMPLETE_OPERATION_OBSERVATION_STATES = Object.freeze(
  new Set(Object.values(INCOMPLETE_OPERATION_OBSERVATION_STATE)),
);

const STATE_REFUSAL_MESSAGE =
  'incomplete operation list observation without a named state: ';

const NO_OPERATIONS = Object.freeze([]);

/**
 * The owner's answer: PRESENT, or a confirmed EMPTY.
 * @param {Array<Object>} operations - The owner's complete list.
 * @return {Object}
 */
function buildAnsweredIncompleteOperationListObservation(operations) {
  if (!Array.isArray(operations)) {
    throw new TypeError(`${STATE_REFUSAL_MESSAGE}answer without a list`);
  }
  const answered = Object.freeze(operations.map((operation) =>
    operation && typeof operation === 'object' ? {...operation} : operation));
  return Object.freeze({
    state: answered.length > 0 ?
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
      INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
    complete: true,
    operations: answered,
    operationCount: answered.length,
    deferredOutcome: null,
    retryAfterMs: null,
  });
}

/**
 * The owner did not answer: DEFERRED, with no list.
 * @param {Object} deferredOutcome - The typed unavailability; required.
 * @return {Object}
 */
function buildDeferredIncompleteOperationListObservation(deferredOutcome) {
  if (!deferredOutcome || typeof deferredOutcome !== 'object') {
    throw new TypeError(
      `${STATE_REFUSAL_MESSAGE}DEFERRED without its deferred outcome`);
  }
  return Object.freeze({
    state: INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED,
    complete: false,
    operations: NO_OPERATIONS,
    operationCount: 0,
    deferredOutcome: Object.freeze({...deferredOutcome}),
    retryAfterMs: Number.isFinite(deferredOutcome.retryAfterMs) ?
      deferredOutcome.retryAfterMs :
      null,
  });
}

/**
 * @param {Object} observation
 * @return {string} An INCOMPLETE_OPERATION_OBSERVATION_STATE value.
 */
function readIncompleteOperationListState(observation) {
  const state = observation?.state;
  if (!INCOMPLETE_OPERATION_OBSERVATION_STATES.has(state)) {
    throw new TypeError(`${STATE_REFUSAL_MESSAGE}${String(state)}`);
  }
  return state;
}

/**
 * True only for the owner's complete answer (PRESENT or EMPTY).
 * @param {Object} observation
 * @return {boolean}
 */
function isAnsweredIncompleteOperationList(observation) {
  return readIncompleteOperationListState(observation) !==
    INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED &&
    observation.complete === true;
}

export {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  buildAnsweredIncompleteOperationListObservation,
  buildDeferredIncompleteOperationListObservation,
  isAnsweredIncompleteOperationList,
  readIncompleteOperationListState,
};
