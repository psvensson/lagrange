/**
 * Statement admission refusals the engine answers before it executes:
 * a statement sent for an explicit transaction the engine no longer holds,
 * and statement forms the engine cannot execute as written.
 *
 * @module query/sql-query-engine-statement-admission
 */

import {AST_TYPE} from './parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';

// Whether the engine executes a statement it was sent.
const STATEMENT_ADMISSION = Object.freeze({
  ADMITTED: 'admitted',
  // Refused before execution; `failure` is the engine's answer.
  REFUSED: 'refused',
});

// Failed COMMIT/ROLLBACK results: whether the engine still holds the
// session's transaction after the attempt.
const SESSION_TRANSACTION_ACTIVE_FIELD = 'sessionTransactionActive';

const WRITE_STATEMENT_TYPES = new Set([
  AST_TYPE.INSERT,
  AST_TYPE.UPDATE,
  AST_TYPE.DELETE,
]);

const ADMITTED = Object.freeze({state: STATEMENT_ADMISSION.ADMITTED});

function refused(failure) {
  return {state: STATEMENT_ADMISSION.REFUSED, failure};
}

/**
 * Admit a statement a session sent for an explicit transaction only while
 * the engine holds that transaction (its budget may have expired and the
 * recovery sweep rolled it back). Without this the statement would run
 * outside any transaction (autocommit) while the client believes it is
 * part of its transaction block.
 *
 * @param {Object} transactionCoordinator - The engine's coordinator.
 * @param {string} sessionId - Session the statement runs for.
 * @param {?string} expectedTransactionId - The transaction the session
 *   expects to be in (absent: the session expects none, nothing to check).
 * @return {{state: string, failure?: Object}} ADMITTED when there is no
 *   expectation or the engine holds exactly that transaction; else REFUSED
 *   with a failed result (errorCode NO_TRANSACTION).
 */
function admitExpectedTransaction(
  transactionCoordinator, sessionId, expectedTransactionId,
) {
  const expects = typeof expectedTransactionId === 'string' &&
    expectedTransactionId.length > 0;
  const held = expects ?
    transactionCoordinator.getTransaction(sessionId)?.transactionId :
    expectedTransactionId;
  if (held === expectedTransactionId) return ADMITTED;
  return refused({
    success: false,
    error: QUERY_ERROR_MSG.EXPECTED_TRANSACTION_NOT_HELD_PREFIX +
      expectedTransactionId +
      QUERY_ERROR_MSG.EXPECTED_TRANSACTION_NOT_HELD_SUFFIX,
    errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
    transactionId: expectedTransactionId,
  });
}

/**
 * Refuse a write with a RETURNING clause: the partition write path answers
 * an affected-row count and no rows, so the clause would silently return
 * nothing (a client reading a generated id would get none).
 *
 * @param {Object} ast - Parsed statement.
 * @return {{state: string, failure?: Object}} ADMITTED, or REFUSED with a
 *   failed result (errorCode UNSUPPORTED_SQL_FEATURE).
 */
function admitStatementForm(ast) {
  if (!WRITE_STATEMENT_TYPES.has(ast?.type) || !ast.returning) {
    return ADMITTED;
  }
  return refused({
    success: false,
    error: QUERY_ERROR_MSG.RETURNING_UNSUPPORTED,
    errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
  });
}

/**
 * Stamp a failed transaction end (COMMIT, ROLLBACK) with whether the engine
 * still holds the session's transaction after it: a protocol session takes
 * its transaction state from this (the block is over when the engine no
 * longer holds it, failed when it does), never from its own assumption.
 *
 * @param {Object} result - The COMMIT/ROLLBACK result.
 * @param {Object} transactionCoordinator - The engine's coordinator.
 * @param {string} sessionId - Session identifier.
 * @return {Object} The result, with sessionTransactionActive when failed.
 */
function withSessionTransactionState(result, transactionCoordinator,
  sessionId) {
  if (result?.success !== false) return result;
  return {
    ...result,
    [SESSION_TRANSACTION_ACTIVE_FIELD]:
      transactionCoordinator.hasActiveTransaction(sessionId) === true,
  };
}

export {
  SESSION_TRANSACTION_ACTIVE_FIELD,
  STATEMENT_ADMISSION,
  admitExpectedTransaction,
  admitStatementForm,
  withSessionTransactionState,
};
