/**
 * The commit point of a distributed transaction, as a typed fact on every
 * failed COMMIT answer.
 *
 * A transaction reaches its commit point when the coordinator moves it to
 * COMMITTING: from then on participant commits may be sent, and some may
 * have applied even when the COMMIT fails (a budget abort between two
 * participant commits, a participant whose commit answer was lost). Before
 * it, no participant has been asked to commit, so a failed COMMIT committed
 * nothing.
 *
 * A failed COMMIT carries `commitPointReached`:
 * - false: the engine establishes that nothing was committed;
 * - true: the transaction reached its commit point, some changes may have
 *   been committed (the outcome is unknown to the caller).
 * A failure that does not carry the field is unknown, never "not committed".
 *
 * A COMMIT that finds no transaction for its session (the budget sweep or
 * an abort ended it) reads the fact from the ended-transaction record the
 * coordinator keeps for the session's last ended transaction.
 *
 * @module query/distributed/distributed-transaction-commit-point
 */

import {TRANSACTION_STATUS} from
  './distributed-transaction-coordinator-constants.js';

const COMMIT_POINT_REACHED_FIELD = 'commitPointReached';
// Ended-transaction records kept (oldest dropped first; a dropped record
// answers unknown, never "not committed").
const ENDED_TRANSACTION_RECORD_LIMIT = 4096;

/**
 * Note a status transition on the transaction: entering (or leaving)
 * COMMITTING marks the commit point reached, for good.
 * @param {Object} tx - Transaction state.
 * @param {string} status - The status being set.
 */
function noteCommitPoint(tx, status) {
  if (status === TRANSACTION_STATUS.COMMITTING ||
      tx.status === TRANSACTION_STATUS.COMMITTING) {
    tx[COMMIT_POINT_REACHED_FIELD] = true;
  }
}

/**
 * Whether the transaction reached its commit point.
 * @param {Object} tx - Transaction state.
 * @return {boolean}
 */
function commitPointReached(tx) {
  return tx?.[COMMIT_POINT_REACHED_FIELD] === true ||
    tx?.status === TRANSACTION_STATUS.COMMITTING ||
    tx?.status === TRANSACTION_STATUS.COMMITTED;
}

/**
 * Stamp a failed COMMIT answer with the transaction's commit point.
 * @param {Object} result - The commit protocol result.
 * @param {Object} tx - Transaction state.
 * @return {Object} The result (stamped when failed).
 */
function withCommitPoint(result, tx) {
  if (result?.success !== false) return result;
  return {...result, [COMMIT_POINT_REACHED_FIELD]: commitPointReached(tx)};
}

/**
 * Stamp an error thrown out of the commit protocol with the transaction's
 * commit point, so its failed answer still carries the fact.
 * @param {Error} error - The thrown error.
 * @param {Object} tx - Transaction state.
 * @return {Error} The error.
 */
function stampThrownCommitPoint(error, tx) {
  if (error && typeof error === 'object') {
    error[COMMIT_POINT_REACHED_FIELD] = commitPointReached(tx);
  }
  return error;
}

/**
 * The coordinator's record of each session's last ended transaction.
 * @return {{record: Function, commitPointFor: Function}}
 */
function createEndedTransactionRecords() {
  const bySession = new Map();
  return Object.freeze({
    /**
     * Record a transaction the coordinator no longer holds.
     * @param {Object} tx - The ended transaction.
     */
    record(tx) {
      bySession.delete(tx.sessionId);
      bySession.set(tx.sessionId, Object.freeze({
        transactionId: tx.transactionId,
        [COMMIT_POINT_REACHED_FIELD]: commitPointReached(tx),
      }));
      if (bySession.size > ENDED_TRANSACTION_RECORD_LIMIT) {
        bySession.delete(bySession.keys().next().value);
      }
    },
    /**
     * The commit-point fields for a COMMIT that found no transaction.
     * @param {string} sessionId - Session ID.
     * @param {?string} [transactionId] - The COMMIT's own transaction, when
     *   known: another transaction's record never answers for it.
     * @return {Object} {commitPointReached, transactionId} from the record,
     *   or {} when there is none or it is another transaction's (unknown).
     */
    commitPointFor(sessionId, transactionId = null) {
      const ended = bySession.get(sessionId);
      if (!ended || (transactionId && ended.transactionId !== transactionId)) {
        return {};
      }
      return {...ended};
    },
  });
}

export {
  COMMIT_POINT_REACHED_FIELD,
  createEndedTransactionRecords,
  noteCommitPoint,
  stampThrownCommitPoint,
  withCommitPoint,
};
