/**
 * Statement admission refusals the engine answers before it executes:
 * a statement sent for an explicit transaction the engine no longer holds,
 * and statement forms the engine cannot execute as written.
 *
 * @module query/sql-query-engine-statement-admission
 */

import {AST_TYPE} from './parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';
import {PG_ERROR_CODE} from '../runtime/pgwire-protocol-constants.js';
import {TRANSACTION_MODE} from '../constants/index.js';
import {
  LOCKING_READ_AGGREGATE_TYPE,
  LOCKING_READ_CLAUSE,
  LOCKING_READ_ERROR_MSG,
  LOCKING_READ_SET_OPERATION_KEYS,
  LOCKING_READ_STRENGTH,
  LOCKING_READ_SUBQUERY_TYPE,
} from './sql-locking-read-constants.js';
import {coordinatorTableParticipantRefusal} from
  './distributed/distributed-transaction-participant-admission.js';

// Whether the engine executes a statement it was sent.
const STATEMENT_ADMISSION = Object.freeze({
  ADMITTED: 'admitted',
  // Refused before execution; `failure` is the engine's answer.
  REFUSED: 'refused',
});

// Failed COMMIT/ROLLBACK results: whether the engine still holds the
// session's transaction after the attempt.
const SESSION_TRANSACTION_ACTIVE_FIELD = 'sessionTransactionActive';

// The statements that end a transaction block: they answer for a
// transaction the engine no longer holds themselves (NO_TRANSACTION).
const TRANSACTION_END_TYPES = new Set([AST_TYPE.COMMIT, AST_TYPE.ROLLBACK]);

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
 * Admit a parsed statement before it executes, for every caller of
 * executeQuery (the PG-wire dispatch, the application-database facade,
 * internal owners): its form (admitStatementForm), then the explicit
 * transaction its session expects (admitExpectedTransaction) - a read or
 * DDL for a transaction the engine dropped must not run outside it any more
 * than a write. COMMIT and ROLLBACK answer for a missing transaction
 * themselves.
 *
 * @param {Object} transactionCoordinator - The engine's coordinator.
 * @param {string} sessionId - Session the statement runs for.
 * @param {Object} ast - Parsed statement.
 * @param {?string} expectedTransactionId - The expected transaction.
 * @return {{state: string, failure?: Object}} STATEMENT_ADMISSION decision.
 */
function isLockingReadAst(ast) {
  if (!ast) return false;
  return Boolean(
    ast.locking?.strength === LOCKING_READ_STRENGTH.UPDATE ||
    ast.locking_read === LOCKING_READ_CLAUSE.FOR_UPDATE ||
    ast.forUpdate === true ||
    ast.locking,
  );
}

function hasAggregateColumns(columns) {
  if (!Array.isArray(columns)) return false;
  return columns.some((col) => {
    if (!col) return false;
    if (col.type === LOCKING_READ_AGGREGATE_TYPE ||
        col.expression?.type === LOCKING_READ_AGGREGATE_TYPE ||
        col.hasAggregates === true || col.aggregate) {
      return true;
    }
    const fn = col.expression?.function || col.expression?.name || col.name;
    return typeof fn === 'string' &&
      /^(COUNT|SUM|AVG|MIN|MAX)$/i.test(fn);
  });
}

function checkUnsupportedLockingOptions(locking) {
  if (!locking) return null;
  if (locking.strength && locking.strength !== LOCKING_READ_STRENGTH.UPDATE) {
    return `FOR ${locking.strength} is not supported; only FOR UPDATE is supported`;
  }
  if (locking.nowait === true) {
    return LOCKING_READ_ERROR_MSG.NOWAIT_NOT_SUPPORTED;
  }
  if (locking.skipLocked === true) {
    return LOCKING_READ_ERROR_MSG.SKIP_LOCKED_NOT_SUPPORTED;
  }
  if (locking.of) {
    return LOCKING_READ_ERROR_MSG.OF_NOT_SUPPORTED;
  }
  return null;
}

function hasSetOperation(ast) {
  return LOCKING_READ_SET_OPERATION_KEYS
    .some((key) => Boolean(ast[key]));
}

function hasGrouping(ast) {
  if (ast.having) return true;
  if (Array.isArray(ast.groupBy)) return ast.groupBy.length > 0;
  if (Array.isArray(ast.group_by)) return ast.group_by.length > 0;
  return Boolean(ast.groupBy && typeof ast.groupBy === 'object');
}

function checkUnsupportedLockingClauses(ast) {
  if (ast.distinct === true) {
    return LOCKING_READ_ERROR_MSG.DISTINCT_NOT_SUPPORTED;
  }
  if (hasGrouping(ast)) {
    return LOCKING_READ_ERROR_MSG.GROUP_BY_OR_HAVING_NOT_SUPPORTED;
  }
  if (hasSetOperation(ast)) {
    return LOCKING_READ_ERROR_MSG.SET_OPERATIONS_NOT_SUPPORTED;
  }
  if (Array.isArray(ast.joins) && ast.joins.length > 0) {
    return LOCKING_READ_ERROR_MSG.JOIN_NOT_SUPPORTED;
  }
  return null;
}

function checkUnsupportedLockingStructure(ast) {
  if (ast.with || ast.cte || ast.from?.type === LOCKING_READ_SUBQUERY_TYPE || ast.from?.ast) {
    return LOCKING_READ_ERROR_MSG.SUBQUERY_OR_CTE_NOT_SUPPORTED;
  }
  if (ast.hasAggregates || hasAggregateColumns(ast.columns)) {
    return LOCKING_READ_ERROR_MSG.AGGREGATES_NOT_SUPPORTED;
  }
  if (!ast.from?.name) {
    return LOCKING_READ_ERROR_MSG.REQUIRES_FROM_TABLE;
  }
  return null;
}

function admitLockingReadStatement(transactionCoordinator, sessionId, ast) {
  if (!isLockingReadAst(ast)) return ADMITTED;

  const optError = checkUnsupportedLockingOptions(ast.locking);
  if (optError) {
    return refused({
      success: false,
      error: optError,
      errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
    });
  }

  const clauseError = checkUnsupportedLockingClauses(ast);
  if (clauseError) {
    return refused({
      success: false,
      error: clauseError,
      errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
    });
  }

  const structError = checkUnsupportedLockingStructure(ast);
  if (structError) {
    return refused({
      success: false,
      error: structError,
      errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
    });
  }

  const tx = transactionCoordinator.getTransaction(sessionId);
  if (!tx || tx.transactionMode !== TRANSACTION_MODE.EXPLICIT) {
    return refused({
      success: false,
      error: LOCKING_READ_ERROR_MSG.REQUIRES_ACTIVE_EXPLICIT_TRANSACTION,
      errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      sqlState: PG_ERROR_CODE.NO_ACTIVE_SQL_TRANSACTION,
    });
  }

  return ADMITTED;
}

function admitParsedStatement(
  transactionCoordinator, sessionId, ast, expectedTransactionId,
) {
  const form = admitStatementForm(ast);
  if (form.state === STATEMENT_ADMISSION.REFUSED) return form;
  const locking = admitLockingReadStatement(transactionCoordinator, sessionId, ast);
  if (locking.state === STATEMENT_ADMISSION.REFUSED) return locking;
  if (transactionCoordinator.getTransaction(sessionId)) {
    const tables = [ast?.table, ast?.from?.name,
      ...(ast?.joins || []).map((join) => join.table?.name)];
    const failure = tables.map(coordinatorTableParticipantRefusal).find(Boolean);
    if (failure) return refused(failure);
  }
  return TRANSACTION_END_TYPES.has(ast?.type) ?
    ADMITTED :
    admitExpectedTransaction(transactionCoordinator, sessionId,
      expectedTransactionId);
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
  TRANSACTION_END_TYPES,
  admitExpectedTransaction,
  admitParsedStatement,
  withSessionTransactionState,
};
