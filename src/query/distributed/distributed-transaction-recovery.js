import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  PARTICIPANT_STATUS,
  RECOVERY_COMMIT_TRANSACTION_STATUS,
  RECOVERY_ROLLBACK_TRANSACTION_STATUS,
  RECOVERY_SWEEP_DEFER_BASE_MS,
  RECOVERY_SWEEP_DEFER_MAX_MS,
  RECOVERY_SWEEP_LOG_MSG,
  TERMINAL_TRANSACTION_STATUS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
} from './distributed-transaction-coordinator-constants.js';

const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_TRANSACTION_EPOCH = 'transaction_epoch';
const LOCAL_STR_TRANSACTIONEPOCH = 'transactionEpoch';
const LOCAL_STR_TIMEOUT_DEADLINE = 'timeout_deadline';
const LOCAL_STR_TIMEOUTDEADLINE = 'timeoutDeadline';

function recover(rows) {
  if (!Array.isArray(rows)) {
    return;
  }

  this.recoverFromSystemTables({
    transactions: rows,
    participants: rows.flatMap((row) => {
      const transactionId = row.transaction_id || row.transactionId;
      const participants = Array.isArray(row.participants) ?
        row.participants :
        [];
      return participants.map((partitionId) => ({
        transaction_id: transactionId,
        partition_id: partitionId,
      }));
    }),
    writeOperations: rows.flatMap((row) => {
      const transactionId = row.transaction_id || row.transactionId;
      const writeOperations = Array.isArray(row.writeOperations) ?
        row.writeOperations :
        [];
      return writeOperations.map((operation) => ({
        ...operation,
        transaction_id: transactionId,
      }));
    }),
  });
}

/**
 * Resume all transactions recovered from system-table snapshots.
 * Transactions recovered in ACTIVE status are rolled back; transactions
 * recovered mid-commit are advanced to COMMITTED.
 *
 * @return {Promise<Object>} Replay summary.
 */

async function resumeRecoveredTransactions() {
  const recoveredWorkflowIds = Array.from(this.recoveredTransactionIds);
  const results = [];

  for (const workflowId of recoveredWorkflowIds) {
    const tx = this.workflowCoordinator.getWorkflowById(workflowId);
    if (!tx) {
      this.recoveredTransactionIds.delete(workflowId);
      continue;
    }

    const statusBefore = tx.status;
    let protocolResult;
    let replayPath = null;
    let skipped = false;

    await this.workflowCoordinator.runExclusive(tx.ownerKey, async () => {
      if (TERMINAL_TRANSACTION_STATUS.has(tx.status)) {
        skipped = true;
        protocolResult = {
          success: true,
          operation: null,
          transactionId: tx.transactionId,
          participants: this.getOrderedParticipantIds(tx),
          failedParticipants: [],
        };
        return;
      }
      if (tx.status === TRANSACTION_STATUS.FAILED) {
        skipped = true;
        protocolResult = {
          success: false,
          operation: null,
          transactionId: tx.transactionId,
          participants: this.getOrderedParticipantIds(tx),
          failedParticipants: [],
          errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
          error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        };
        return;
      }
      if (RECOVERY_ROLLBACK_TRANSACTION_STATUS.has(tx.status)) {
        replayPath = QUERY_OPERATION.ROLLBACK;
        protocolResult = await this.runRollbackProtocol(tx);
        return;
      }
      if (RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status)) {
        replayPath = QUERY_OPERATION.COMMIT;
        protocolResult = await this.runCommitProtocol(tx, {
          allowTimedOutCommitStatuses: true,
        });
        return;
      }
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
      protocolResult = {
        success: false,
        operation: QUERY_OPERATION.ROLLBACK,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants: [],
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
      };
    });

    results.push({
      transactionId: tx.transactionId,
      sessionId: tx.sessionId,
      statusBefore,
      statusAfter: tx.status,
      replayPath,
      skipped,
      success: protocolResult?.success === true,
      error: protocolResult?.error || null,
      failedParticipants: protocolResult?.failedParticipants || [],
    });
    this.recoveredTransactionIds.delete(workflowId);
  }

  const resumed = results.filter(
    (entry) => entry.success && !entry.skipped,
  ).length;
  const failed = results.filter((entry) => !entry.success).length;
  return {
    totalRecovered: recoveredWorkflowIds.length,
    resumed,
    failed,
    results,
  };
}

/**
 * Run one recovery sweep cycle for timed-out non-terminal transactions.
 * @return {Promise<Object>} Sweep summary.
 */

async function runRecoverySweep() {
  if (this.recoverySweepInFlight) {
    return {
      swept: LOCAL_NUM_ZERO,
      resolved: LOCAL_NUM_ZERO,
      failed: LOCAL_NUM_ZERO,
      skipped: true,
      deferred: LOCAL_NUM_ZERO,
      results: [],
    };
  }
  if (this.isRecoverySweepDeferred()) {
    return {
      swept: LOCAL_NUM_ZERO,
      resolved: LOCAL_NUM_ZERO,
      failed: LOCAL_NUM_ZERO,
      skipped: false,
      deferred: LOCAL_NUM_ONE,
      deferredUntilMs: this.recoverySweepDeferredUntilMs,
      results: [],
    };
  }
  this.recoverySweepInFlight = true;
  try {
    if (typeof this.loadRecoveryStateForSweep === LOCAL_STR_FUNCTION) {
      let payload;
      try {
        payload = await this.loadRecoveryStateForSweep();
      } catch (error) {
        if (this.shouldDeferRecoverySweepError(error)) {
          return this.buildDeferredRecoverySweepResult(error);
        }
        throw error;
      }
      if (payload && typeof payload === LOCAL_STR_OBJECT) {
        this.recoverFromSystemTables(payload);
      }
    }

    const stuckTransactions = Array.from(
      this.transactionsBySession.values(),
    ).filter(
      (tx) =>
        !TERMINAL_TRANSACTION_STATUS.has(tx.status) &&
        tx.status !== TRANSACTION_STATUS.FAILED &&
        this.isTransactionBudgetExceeded(tx),
    );
    const results = [];
    let deferred = LOCAL_NUM_ZERO;

    for (const tx of stuckTransactions) {
      let protocolResult = null;
      let sweepPath = null;
      try {
        await this.workflowCoordinator.runExclusive(tx.ownerKey, async () => {
          if (RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status)) {
            sweepPath = QUERY_OPERATION.COMMIT;
            protocolResult = await this.runCommitProtocol(tx, {
              allowTimedOutCommitStatuses: true,
            });
            return;
          }
          sweepPath = QUERY_OPERATION.ROLLBACK;
          protocolResult = await this.runRollbackProtocol(tx);
        });
      } catch (error) {
        if (this.shouldDeferRecoverySweepError(error)) {
          deferred += LOCAL_NUM_ONE;
          const deferredResult = this.buildDeferredRecoverySweepResult(
            error,
            {
              swept: stuckTransactions.length,
              results: [
                {
                  transactionId: tx.transactionId,
                  sessionId: tx.sessionId,
                  sweepPath,
                  statusAfter: tx.status,
                  success: false,
                  deferred: true,
                  error: error?.message || String(error),
                },
              ],
            },
          );
          results.push(...deferredResult.results);
          continue;
        }
        throw error;
      }

      if (
        protocolResult?.success !== true &&
        this.shouldDeferRecoverySweepError(protocolResult)
      ) {
        deferred += LOCAL_NUM_ONE;
        this.deferRecoverySweep(protocolResult);
        results.push({
          transactionId: tx.transactionId,
          sessionId: tx.sessionId,
          sweepPath,
          statusAfter: tx.status,
          success: false,
          deferred: true,
          error: protocolResult?.error || null,
        });
        continue;
      }

      results.push({
        transactionId: tx.transactionId,
        sessionId: tx.sessionId,
        sweepPath,
        statusAfter: tx.status,
        success: protocolResult?.success === true,
        error: protocolResult?.error || null,
      });
    }

    const resolved = results.filter((entry) => entry.success).length;
    const failed = results.filter(
      (entry) => entry.success !== true && entry.deferred !== true,
    ).length;
    if (deferred === LOCAL_NUM_ZERO) {
      this.clearRecoverySweepDeferState();
    }
    return {
      swept: stuckTransactions.length,
      resolved,
      failed,
      deferred,
      deferredUntilMs: deferred > LOCAL_NUM_ZERO ? this.recoverySweepDeferredUntilMs : LOCAL_NUM_ZERO,
      skipped: false,
      results,
    };
  } finally {
    this.recoverySweepInFlight = false;
  }
}

/**
 * Start periodic transaction recovery sweep.
 */

function startRecoverySweep() {
  if (this.recoverySweepTimer) {
    return;
  }
  this.recoverySweepTimer = setInterval(() => {
    void this.runRecoverySweep().catch((error) => {
      this.logger?.error?.(RECOVERY_SWEEP_LOG_MSG, {
        error: error?.message || String(error),
      });
    });
  }, this.recoverySweepIntervalMs);
  this.recoverySweepTimer.unref();
}

/**
 * Stop periodic transaction recovery sweep.
 */

function stopRecoverySweep() {
  if (!this.recoverySweepTimer) {
    return;
  }
  clearInterval(this.recoverySweepTimer);
  this.recoverySweepTimer = null;
}

/**
 * @return {boolean}
 * @private
 */

function isRecoverySweepDeferred() {
  return (
    Number.isFinite(this.recoverySweepDeferredUntilMs) &&
    this.recoverySweepDeferredUntilMs > this.now()
  );
}

/**
 * @param {*} errorLike
 * @return {boolean}
 * @private
 */

function shouldDeferRecoverySweepError(errorLike) {
  return isRetryableControlPlaneError(errorLike);
}

/**
 * @param {*} errorLike
 * @return {{delayMs: number, deferredUntilMs: number}}
 * @private
 */

function deferRecoverySweep(errorLike) {
  const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
  const backoffMs =
    retryAfterMs > 0 ?
      retryAfterMs :
      Math.min(
        RECOVERY_SWEEP_DEFER_MAX_MS,
        Math.max(
          this.recoverySweepIntervalMs,
          RECOVERY_SWEEP_DEFER_BASE_MS *
              2 ** this.recoverySweepDeferredAttempts,
        ),
      );
  this.recoverySweepDeferredAttempts += LOCAL_NUM_ONE;
  this.recoverySweepDeferredUntilMs = this.now() + backoffMs;
  return {
    delayMs: backoffMs,
    deferredUntilMs: this.recoverySweepDeferredUntilMs,
  };
}

/**
 * @return {void}
 * @private
 */

function clearRecoverySweepDeferState() {
  this.recoverySweepDeferredUntilMs = LOCAL_NUM_ZERO;
  this.recoverySweepDeferredAttempts = LOCAL_NUM_ZERO;
}

/**
 * @param {*} errorLike
 * @param {Object} [overrides={}]
 * @return {Object}
 * @private
 */

function buildDeferredRecoverySweepResult(errorLike, overrides = {}) {
  this.deferRecoverySweep(errorLike);
  return {
    swept: overrides.swept || LOCAL_NUM_ZERO,
    resolved: LOCAL_NUM_ZERO,
    failed: LOCAL_NUM_ZERO,
    skipped: false,
    deferred: Number.isFinite(overrides.deferred) ? overrides.deferred : LOCAL_NUM_ONE,
    deferredUntilMs: this.recoverySweepDeferredUntilMs,
    error: errorLike?.message || String(errorLike),
    results: Array.isArray(overrides.results) ? overrides.results : [],
  };
}

/**
 * Recover coordinator state from canonical system-table rows.
 *
 * @param {Object} payload - Recovery payload.
 * @param {Object[]} [payload.transactions] - sql_transactions rows.
 * @param {Object[]} [payload.participants] - sql_transaction_participants rows.
 * @param {Object[]} [payload.writeOperations] - sql_write_operations rows.
 */

function recoverFromSystemTables(payload = {}) {
  const transactionRows = Array.isArray(payload.transactions) ?
    payload.transactions :
    [];
  const participantRows = Array.isArray(payload.participants) ?
    payload.participants :
    [];
  const writeOperationRows = Array.isArray(payload.writeOperations) ?
    payload.writeOperations :
    [];

  this.workflowCoordinator.recover({
    workflows: transactionRows,
    participants: participantRows,
    loadWorkflow: (row) => {
      const sessionId = row.session_id || row.sessionId;
      const transactionId = row.transaction_id || row.transactionId;
      const status = row.status || TRANSACTION_STATUS.FAILED;
      if (!sessionId || !transactionId) {
        return null;
      }
      return {
        sessionId,
        ownerKey: sessionId,
        transactionId,
        workflowId: transactionId,
        status,
        transactionEpoch: this.resolveFiniteNumberField(
          row,
          LOCAL_STR_TRANSACTION_EPOCH,
          LOCAL_STR_TRANSACTIONEPOCH,
        ),
        timeoutDeadline: this.resolveFiniteNumberField(
          row,
          LOCAL_STR_TIMEOUT_DEADLINE,
          LOCAL_STR_TIMEOUTDEADLINE,
        ),
        writeOperations: [],
        createdAt: row.created_at || row.createdAt || this.now(),
        updatedAt: row.updated_at || row.updatedAt || this.now(),
      };
    },
    loadParticipant: (row) => {
      const transactionId = row.transaction_id || row.transactionId;
      const partitionId = row.partition_id || row.partitionId;
      if (!transactionId || !partitionId) {
        return null;
      }
      return {
        workflowId: transactionId,
        transactionId,
        participantId:
          row.participant_id ||
          row.participantId ||
          this.createParticipantId(transactionId, partitionId),
        participantKey: partitionId,
        partitionId,
        status: row.status || PARTICIPANT_STATUS.FAILED,
        lastError: row.last_error || row.lastError || null,
        createdAt: row.created_at || row.createdAt || this.now(),
        updatedAt: row.updated_at || row.updatedAt || this.now(),
      };
    },
    isTerminalWorkflow: (workflow) =>
      TERMINAL_TRANSACTION_STATUS.has(workflow.status),
  });

  for (const row of transactionRows) {
    const transactionId = row.transaction_id || row.transactionId;
    if (!transactionId) {
      continue;
    }
    const tx = this.workflowCoordinator.getWorkflowById(transactionId);
    if (!tx) {
      continue;
    }
    this.recoveredTransactionIds.add(transactionId);
  }

  for (const row of writeOperationRows) {
    const transactionId = row.transaction_id || row.transactionId;
    if (!transactionId) {
      continue;
    }
    const tx = this.workflowCoordinator.getWorkflowById(transactionId);
    if (!tx) {
      continue;
    }
    tx.writeOperations.push({
      operationId: row.operation_id || row.operationId,
      statementType: row.statement_type || row.statementType,
      partitionIds: this.parseJsonArrayField(
        row.partition_ids || row.partitionIds,
      ),
      idempotencyKey: row.idempotency_key || row.idempotencyKey,
      payloadHash: row.payload_hash || row.payloadHash,
      status: row.status || WRITE_OPERATION_STATUS.PENDING,
      retryCount: row.retry_count || row.retryCount || LOCAL_NUM_ZERO,
      lastError: row.last_error || row.lastError || null,
      createdAt: row.created_at || row.createdAt || tx.createdAt,
      updatedAt: row.updated_at || row.updatedAt || tx.updatedAt,
    });
  }
}

/**
 * Persist one transaction status transition.
 * @param {Object} tx - Transaction state.
 * @param {string} status - Next status.
 * @return {Promise<void>}
 * @private
 */

export {
  recover,
  resumeRecoveredTransactions,
  runRecoverySweep,
  startRecoverySweep,
  stopRecoverySweep,
  isRecoverySweepDeferred,
  shouldDeferRecoverySweepError,
  deferRecoverySweep,
  clearRecoverySweepDeferState,
  buildDeferredRecoverySweepResult,
  recoverFromSystemTables,
};
