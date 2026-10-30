/**
 * Statement execution and serialization on the existing transaction owner.
 * Requests and recovery use one session FIFO; statement callbacks hold it
 * through participant enlistment, execution and durable write outcome.
 */
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_OPERATION} from
  '../query-constants.js';
import {admitExpectedTransaction, STATEMENT_ADMISSION} from
  '../sql-query-engine-statement-admission.js';
import {statementTransactionIdentityOf} from
  './distributed-transaction-identity.js';
import {resolveNowMs} from './distributed-transaction-telemetry.js';

const LOCAL_STR_TYPED_CANCELLED = 'typed_transaction_cancelled';

const distributedTransactionStatementMethods = {
  /**
   * Queue transaction operations in FIFO order for one session.
   * Unlike workflow single-flight, distinct calls never share a result.
   * @param {string} sessionId
   * @param {Function} operation
   * @return {Promise<*>}
   * @private
   */
  runTransactionOperation(sessionId, operation) {
    const previous = this.transactionOperationTailBySession.get(sessionId) ||
      Promise.resolve();
    const execution = previous
      .catch(() => {})
      .then(operation);
    this.transactionOperationTailBySession.set(sessionId, execution);
    return execution.finally(() => {
      if (this.transactionOperationTailBySession.get(sessionId) === execution) {
        this.transactionOperationTailBySession.delete(sessionId);
      }
    });
  },

  /**
   * Execute one complete transactional write while the session FIFO lane is
   * held, so commit cannot freeze between enlistment and statement outcome.
   * The write receives the identity its statement carries to every
   * participant it reaches (TX1 seam A).
   * @param {string} sessionId
   * @param {Object} operation
   * @param {Function} executeWrite - (statementIdentity) => result.
   * @return {Promise<Object>}
   */
  async executeWriteStatement(sessionId, operation, executeWrite,
    expectedTransactionId = this.getTransaction(sessionId)?.transactionId) {
    return this.runTransactionOperation(sessionId, async () => {
      const admission = admitExpectedTransaction(this, sessionId,
        expectedTransactionId);
      if (admission.state === STATEMENT_ADMISSION.REFUSED) {
        return admission.failure;
      }
      const startedAtMs = resolveNowMs();
      const enlistResult = await this.enlistParticipantsOwned(
        sessionId,
        operation.partitionIds,
      );
      if (enlistResult.success !== true) {
        return enlistResult;
      }
      await this.recordWriteOperation(sessionId, operation, {
        deferPersistence: true,
      });
      const tx = this.transactionsBySession.get(sessionId);
      const result = await executeWrite(tx ?
        statementTransactionIdentityOf(tx) : null);
      await this.markWriteOperationResult(
        sessionId,
        operation.operationId,
        result,
      );
      if (tx?.telemetry) {
        tx.telemetry.statementsMs += Math.max(0, resolveNowMs() - startedAtMs);
        tx.telemetry.statementCount += 1;
      }
      return result;
    });
  },

  /**
   * Hold the request lane through read planning, enlistment and execution.
   * The callback enlists its complete plan before issuing any QUERY. Reads
   * without a held transaction retain their ordinary routing semantics.
   * @param {string} sessionId
   * @param {?string} expectedTransactionId
   * @param {Function} executeRead - ({identity, enlist}|null) => result.
   * @return {Promise<Object>}
   */
  async executeReadStatement(sessionId, expectedTransactionId, executeRead) {
    return this.runTransactionOperation(sessionId, async () => {
      const admission = admitExpectedTransaction(this, sessionId,
        expectedTransactionId);
      if (admission.state === STATEMENT_ADMISSION.REFUSED) {
        return admission.failure;
      }
      const tx = this.transactionsBySession.get(sessionId);
      if (!tx) return executeRead(null);
      if (this.isTransactionBudgetExceeded(tx)) {
        return {success: false, operation: QUERY_OPERATION.SELECT,
          errorCode: QUERY_ERROR_CODE.TIMEOUT, error: QUERY_ERROR_MSG.QUERY_TIMEOUT};
      }
      return executeRead({identity: statementTransactionIdentityOf(tx),
        enlist: (partitionIds) =>
          this.enlistParticipantsOwned(sessionId, partitionIds)});
    });
  },

  /**
   * Cancel an active transaction explicitly: rolls back across all enlisted
   * participants and releases all reservations.
   * @param {string} sessionId
   * @return {Promise<Object>}
   */
  async cancel(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }
    const rollbackResult = await this.rollback(sessionId);
    return {
      ...rollbackResult,
      outcome: LOCAL_STR_TYPED_CANCELLED,
      cancellation: true,
    };
  },
};

export {distributedTransactionStatementMethods};
