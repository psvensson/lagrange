/**
 * The PG-wire session's transaction state after a FAILED statement, taken
 * from the engine's truth (its typed error code and whether it still holds
 * the session's transaction), never from the handler's assumption.
 *
 * PostgreSQL rules followed:
 * - ROLLBACK (or COMMIT, outside a block) with no transaction in progress
 *   answers its own tag plus a WARNING (25P01); the session is idle.
 * - A COMMIT always ends the block: when the engine no longer holds the
 *   transaction the session is idle and the client is told plainly that
 *   nothing was committed.
 * - Inside a block, a statement for a transaction the engine dropped is an
 *   error and the block is failed until ROLLBACK (never run outside it).
 *
 * @module runtime/pgwire-transaction-outcome
 */

import {readExecutedStatementType} from
  '../query/application-database-result.js';
import {AST_TYPE} from '../query/parser-constants.js';
import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {SESSION_TRANSACTION_ACTIVE_FIELD} from
  '../query/sql-query-engine-statement-admission.js';
import {
  buildCommandComplete,
  buildErrorResponse,
  buildNoticeResponse,
} from './pgwire-message-builders.js';
import {
  PG_ERROR_CODE,
  PG_SEVERITY,
  PG_TRANSACTION_STATE,
} from './pgwire-protocol-constants.js';
import {resolveFailureSqlState} from './pgwire-result-mapper.js';

const PGWIRE_TRANSACTION_OUTCOME_KIND = Object.freeze({
  // CommandComplete with the statement's tag (optionally after a WARNING).
  COMPLETE: 'complete',
  // ErrorResponse with the outcome's SQLSTATE and message.
  ERROR: 'error',
  // ErrorResponse with the engine's own error and its mapped SQLSTATE.
  ENGINE_ERROR: 'engine_error',
});

const NO_TRANSACTION_WARNING = 'there is no transaction in progress';
const NOTHING_COMMITTED = '; no changes were committed';
// Engine reasons a COMMIT found its transaction rolled back, not committed.
const ROLLED_BACK_BEFORE_COMMIT_MESSAGE = new Map([
  [QUERY_ERROR_CODE.NO_TRANSACTION,
    'the transaction is no longer active on the server: it was rolled ' +
    'back (its transaction budget expired)' + NOTHING_COMMITTED],
  [QUERY_ERROR_CODE.TIMEOUT,
    'the transaction exceeded its transaction budget and was rolled back' +
    NOTHING_COMMITTED],
]);
const TAG_BY_TRANSACTION_END = new Map([
  [AST_TYPE.COMMIT, 'COMMIT'],
  [AST_TYPE.ROLLBACK, 'ROLLBACK'],
]);

function engineDetail(failure) {
  return {
    engine_error_code: failure.errorCode,
    engine_error: failure.error ?? failure.message ?? null,
    ...(failure.transactionId ? {transaction_id: failure.transactionId} : {}),
  };
}

function engineError(state) {
  return {kind: PGWIRE_TRANSACTION_OUTCOME_KIND.ENGINE_ERROR, state};
}

function complete(statementType, state, warn) {
  return {
    kind: PGWIRE_TRANSACTION_OUTCOME_KIND.COMPLETE,
    tag: TAG_BY_TRANSACTION_END.get(statementType),
    state,
    warning: warn ? {
      code: PG_ERROR_CODE.NO_ACTIVE_SQL_TRANSACTION,
      message: NO_TRANSACTION_WARNING,
    } : null,
  };
}

function rolledBackError(failure, message, state) {
  return {
    kind: PGWIRE_TRANSACTION_OUTCOME_KIND.ERROR,
    sqlState: PG_ERROR_CODE.TRANSACTION_TIMEOUT,
    message,
    detail: engineDetail(failure),
    state,
  };
}

/**
 * The outcome of a failed COMMIT inside a block: the block is over unless
 * the engine still holds the transaction (then it is failed, recoverable by
 * ROLLBACK).
 * @param {Object} failure - The failed engine result.
 * @param {Function} engineHoldsTransaction - () => boolean, engine truth.
 * @return {Object} The outcome (ENGINE_ERROR: the engine's own error answer,
 *   with the state set here).
 */
function failedCommitOutcome(failure, engineHoldsTransaction) {
  const state = engineHoldsTransaction() ?
    PG_TRANSACTION_STATE.FAILED :
    PG_TRANSACTION_STATE.IDLE;
  const rolledBack = ROLLED_BACK_BEFORE_COMMIT_MESSAGE.get(failure.errorCode);
  if (rolledBack) return rolledBackError(failure, rolledBack, state);
  return engineError(state);
}

/**
 * Resolve the wire answer and the next session state for a failed engine
 * result.
 *
 * @param {Object} input
 * @param {number} input.stateBefore - Session PG_TRANSACTION_STATE.
 * @param {?string} input.statementType - The executed statement kind the
 *   engine stamped (COMMIT, ROLLBACK, ...), or null.
 * @param {Object} input.failure - The failed engine result (errorCode).
 * @param {Function} input.engineHoldsTransaction - () => boolean: whether
 *   the engine still holds the session's transaction.
 * @return {{kind: string, state: number}} kind COMPLETE (tag, warning) or
 *   ERROR (sqlState, message, detail) answers in place of the engine's
 *   error; ENGINE_ERROR answers the engine's own error. `state` is the
 *   session's next transaction state.
 */
function resolveFailedStatementOutcome({
  stateBefore, statementType, failure, engineHoldsTransaction,
}) {
  const idle = stateBefore === PG_TRANSACTION_STATE.IDLE;
  const noTransaction =
    failure?.errorCode === QUERY_ERROR_CODE.NO_TRANSACTION;
  if (TAG_BY_TRANSACTION_END.has(statementType)) {
    return failedTransactionEndOutcome({idle, noTransaction, statementType,
      failure, engineHoldsTransaction});
  }
  if (idle) return engineError(PG_TRANSACTION_STATE.IDLE);
  if (noTransaction) {
    return rolledBackError(failure, failure.error ?? failure.message,
      PG_TRANSACTION_STATE.FAILED);
  }
  return engineError(PG_TRANSACTION_STATE.FAILED);
}

/**
 * A failed COMMIT or ROLLBACK (see resolveFailedStatementOutcome).
 * @param {Object} input - {idle, noTransaction, statementType, failure,
 *   engineHoldsTransaction}.
 * @return {{kind: string, state: number}}
 */
function failedTransactionEndOutcome({idle, noTransaction, statementType,
  failure, engineHoldsTransaction}) {
  const rollback = statementType === AST_TYPE.ROLLBACK;
  if (noTransaction && (rollback || idle)) {
    return complete(statementType, PG_TRANSACTION_STATE.IDLE, idle);
  }
  if (!rollback && !idle) {
    return failedCommitOutcome(failure, engineHoldsTransaction);
  }
  return engineError(engineHoldsTransaction() ?
    PG_TRANSACTION_STATE.FAILED : PG_TRANSACTION_STATE.IDLE);
}

/**
 * Whether the engine still holds the session's transaction after a failed
 * transaction end, as the engine stamped it on its answer. An answer that
 * does not say leaves the block failed (recoverable by ROLLBACK), never
 * silently idle.
 * @param {Object} failure - The failed engine result fields.
 * @return {boolean}
 */
function engineHoldsSessionTransaction(failure) {
  return failure?.[SESSION_TRANSACTION_ACTIVE_FIELD] !== false;
}

/**
 * Answer a failed statement on the wire and move the session's transaction
 * state to the engine's truth.
 *
 * @param {Object} input
 * @param {Error} input.failure - The failure (engine result fields
 *   assigned: errorCode, the executed statement kind, detail).
 * @param {number} input.stateBefore - Session state when it was sent.
 * @param {Object} input.session - PgWireSession.
 * @param {Function} input.write - (Buffer) => void, the socket write.
 */
function answerFailedStatement({failure, stateBefore, session, write}) {
  const outcome = resolveFailedStatementOutcome({
    stateBefore,
    statementType: readExecutedStatementType(failure),
    failure,
    engineHoldsTransaction: () => engineHoldsSessionTransaction(failure),
  });
  session.setTransactionState(outcome.state);
  if (outcome.kind === PGWIRE_TRANSACTION_OUTCOME_KIND.COMPLETE) {
    if (outcome.warning) {
      write(buildNoticeResponse(PG_SEVERITY.WARNING, outcome.warning.code,
        outcome.warning.message));
    }
    write(buildCommandComplete(outcome.tag));
    return;
  }
  if (outcome.kind === PGWIRE_TRANSACTION_OUTCOME_KIND.ERROR) {
    write(buildErrorResponse(PG_SEVERITY.ERROR, outcome.sqlState,
      outcome.message, outcome.detail));
    return;
  }
  write(buildErrorResponse(PG_SEVERITY.ERROR, resolveFailureSqlState(failure),
    failure.message, failure.detail || null));
}

export {
  answerFailedStatement,
  resolveFailedStatementOutcome,
};
