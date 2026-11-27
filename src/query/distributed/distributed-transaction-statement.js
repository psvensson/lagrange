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
import {PARTICIPANT_ENLISTMENT_MODE} from
  './distributed-transaction-coordinator-constants.js';
import {resolveNowMs} from './distributed-transaction-telemetry.js';

const LOCAL_STR_TYPED_CANCELLED = 'typed_transaction_cancelled';
const ROW_KEY_WAIT_CYCLE_DETECTED = 'ROW_KEY_WAIT_CYCLE_DETECTED';
const SETTLED_STATUS_REJECTED = 'rejected';

function enqueueDeferredWriteOperationPersist(tx, persistPromise) {
  if (!Array.isArray(tx.pendingWriteOperationPersists)) {
    tx.pendingWriteOperationPersists = [];
  }
  persistPromise.catch(() => {});
  tx.pendingWriteOperationPersists.push(persistPromise);
}

function drainPendingWriteOperationPersists(tx) {
  if (!Array.isArray(tx?.pendingWriteOperationPersists) ||
      tx.pendingWriteOperationPersists.length === 0) {
    return Promise.resolve();
  }
  return Promise.allSettled(tx.pendingWriteOperationPersists.splice(0));
}

function settledCycleRollbacksOf(coordinator) {
  if (coordinator.settledCycleRollbacksBySession === undefined) {
    coordinator.settledCycleRollbacksBySession = new Map();
  }
  return coordinator.settledCycleRollbacksBySession;
}

function entryHasWaitCycleFailure(entry) {
  return Boolean(entry && typeof entry === 'object' &&
    (entry.deadlockDetected === true ||
      entry.failureReason === ROW_KEY_WAIT_CYCLE_DETECTED));
}

function isRowKeyWaitCycleFailure(result) {
  if (!result || result.success !== false) return false;
  if (entryHasWaitCycleFailure(result) ||
      entryHasWaitCycleFailure(result.firstFailedParticipant)) {
    return true;
  }
  return (Array.isArray(result.participantFailures) &&
    result.participantFailures.some(entryHasWaitCycleFailure)) ||
    (Array.isArray(result.participantResults) &&
      result.participantResults.some(entryHasWaitCycleFailure));
}

async function settleCycleVictimTransaction(coordinator, sessionId, tx, result) {
  if (!tx || !isRowKeyWaitCycleFailure(result)) return result;
  const manifestParticipants = coordinator.getOrderedParticipantIds(tx);
  const manifestParticipantDetails = coordinator.getOrderedParticipantDetails(tx);
  const rawRollback = await coordinator.runRollbackProtocol(tx);
  const rollbackResult = {
    ...rawRollback,
    transactionId: tx.transactionId,
    transactionEpoch: tx.transactionEpoch,
    participants: rawRollback?.participants ?? manifestParticipants,
    participantDetails: manifestParticipantDetails,
    failureReason: ROW_KEY_WAIT_CYCLE_DETECTED,
    deadlockDetected: true,
  };
  if (rawRollback?.success === true &&
      !coordinator.transactionsBySession.has(sessionId)) {
    settledCycleRollbacksOf(coordinator).set(sessionId, rollbackResult);
  }
  return {
    ...result,
    failureReason: ROW_KEY_WAIT_CYCLE_DETECTED,
    deadlockDetected: true,
    transactionId: tx.transactionId,
    transactionEpoch: tx.transactionEpoch,
    participants: rollbackResult.participants,
    participantDetails: manifestParticipantDetails,
    rollback: rollbackResult,
  };
}

const distributedTransactionStatementMethods = {
  consumeSettledCycleRollback(sessionId, expectedTransactionId = null) {
    const map = this.settledCycleRollbacksBySession;
    const settled = map?.get(sessionId) ?? null;
    if (!settled) return null;
    if (expectedTransactionId !== null &&
        expectedTransactionId !== undefined &&
        settled.transactionId !== expectedTransactionId) {
      map.delete(sessionId);
      return null;
    }
    map.delete(sessionId);
    return settled;
  },

  clearSettledCycleRollback(sessionId) {
    this.settledCycleRollbacksBySession?.delete(sessionId);
  },

  recordSettledRecoveryRollback(tx) {
    if (!tx || typeof tx.sessionId !== 'string' || tx.sessionId.length === 0) {
      return;
    }
    settledCycleRollbacksOf(this).set(tx.sessionId, {
      success: true,
      operation: QUERY_OPERATION.ROLLBACK,
      transactionId: tx.transactionId,
      transactionEpoch: tx.transactionEpoch,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: [],
      participantFailures: [],
      firstFailedParticipant: null,
    });
  },

  async rollbackTransaction(sessionId, options = {}) {
    return this.rollback(sessionId, options);
  },

  enqueueDeferredWriteOperationPersist(tx, persistPromise) {
    enqueueDeferredWriteOperationPersist(tx, persistPromise);
  },
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
    expectedTransactionId = this.transactionsBySession.get(sessionId)?.transactionId) {
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
        PARTICIPANT_ENLISTMENT_MODE.AUTHORITATIVE,
        {deferActivePersistence: true},
      );
      if (enlistResult.success !== true) {
        return enlistResult;
      }
      // Retain sql_transaction_participants ACTIVE state concurrently with
      // partition QUERY execution; beginParticipant already established the
      // partition session, so both only need to finish before outcome bookkeeping.
      const persistActivePromise = enlistResult.persistActiveParticipants ?
        enlistResult.persistActiveParticipants() :
        Promise.resolve();
      await this.recordWriteOperation(sessionId, operation, {
        deferPersistence: true,
      });
      const tx = this.transactionsBySession.get(sessionId);
      const [activePersistSettled, , writeSettled] = await Promise.allSettled([
        persistActivePromise,
        drainPendingWriteOperationPersists(tx),
        Promise.resolve().then(() =>
          executeWrite(tx ? statementTransactionIdentityOf(tx) : null)),
      ]);
      if (activePersistSettled.status === SETTLED_STATUS_REJECTED) {
        throw activePersistSettled.reason;
      }
      if (writeSettled.status === SETTLED_STATUS_REJECTED) {
        throw writeSettled.reason;
      }
      const result = writeSettled.value;
      await this.markWriteOperationResult(
        sessionId,
        operation.operationId,
        result,
        {deferPersistenceAwait: result?.success === true},
      );
      if (tx?.telemetry) {
        tx.telemetry.statementsMs += Math.max(0, resolveNowMs() - startedAtMs);
        tx.telemetry.statementCount += 1;
      }
      return settleCycleVictimTransaction(this, sessionId, tx, result);
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
      return executeRead({
        identity: statementTransactionIdentityOf(tx),
        enlist: (
          partitionIds,
          enlistmentMode = PARTICIPANT_ENLISTMENT_MODE.VOLATILE_READ,
        ) => this.enlistParticipantsOwned(sessionId, partitionIds, enlistmentMode),
      });
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
