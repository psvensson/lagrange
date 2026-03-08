import {createHash} from 'node:crypto';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  TIMEOUT_BUDGET_DEFAULT,
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from '../../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from
  '../../workflow/durable-workflow-coordinator.js';

const TRANSACTION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  PREPARING: 'PREPARING',
  PREPARED: 'PREPARED',
  COMMITTING: 'COMMITTING',
  COMMITTED: 'COMMITTED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
});

// Participants share the same lifecycle status vocabulary as transactions.
const PARTICIPANT_STATUS = TRANSACTION_STATUS;

const WRITE_OPERATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
});

const TERMINAL_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.COMMITTED,
  TRANSACTION_STATUS.ROLLED_BACK,
]));

const RECOVERY_COMMIT_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.PREPARED,
  TRANSACTION_STATUS.COMMITTING,
]));

const RECOVERY_ROLLBACK_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.ACTIVE,
  TRANSACTION_STATUS.PREPARING,
  TRANSACTION_STATUS.ROLLING_BACK,
]));

const PARTICIPANT_RETRY_DEFAULT = Object.freeze({
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 10,
  MAX_DELAY_MS: 250,
});

const PARTICIPANT_RETRY_LOG_MSG = 'Distributed transaction participant retry';
const RECOVERY_SWEEP_DEFAULT_INTERVAL_MS = 1000;
const TIMEOUT_ERROR_MESSAGES = new Set([
  QUERY_ERROR_MSG.QUERY_TIMEOUT,
  QUERY_ERROR_MSG.QUERY_TIMED_OUT,
]);

/**
 * Distributed transaction coordinator with participant state persistence hooks.
 */
class DistributedTransactionCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Function} options.beginParticipant - Begin callback.
   * @param {Function} [options.prepareParticipant] - Prepare callback.
   * @param {Function} options.commitParticipant - Commit callback.
   * @param {Function} options.rollbackParticipant - Rollback callback.
   * @param {Function} [options.persistTransaction] - Persist tx row callback.
   * @param {Function} [options.persistParticipant] - Persist participant callback.
   * @param {Function} [options.persistWriteOperation] - Persist write op callback.
   * @param {Function} [options.epochSource] - Monotonic transaction epoch source.
   * @param {number} [options.transactionBudgetMs] - Transaction timeout budget.
   * @param {number} [options.participantRetryMaxRetries] - Retry attempts.
   * @param {number} [options.participantRetryBaseDelayMs] - Retry base delay.
   * @param {number} [options.participantRetryMaxDelayMs] - Retry max delay.
   * @param {Function} [options.sleep] - Async sleep hook.
   * @param {Function} [options.onParticipantRetry] - Retry diagnostic hook.
   * @param {Function} [options.now] - Clock function.
   */
  constructor(options = {}) {
    this.beginParticipant = options.beginParticipant || (async () => {});
    this.prepareParticipant = options.prepareParticipant || (async () => {});
    this.commitParticipant = options.commitParticipant || (async () => {});
    this.rollbackParticipant = options.rollbackParticipant || (async () => {});
    this.persistTransaction = options.persistTransaction || (async () => {});
    this.persistParticipant = options.persistParticipant || (async () => {});
    this.persistWriteOperation = options.persistWriteOperation || (async () => {});
    this.now = options.now || (() => Date.now());
    this.nextEpoch = Number.isFinite(options.initialEpoch) ?
      Math.floor(options.initialEpoch) :
      this.now();
    this.epochSource = options.epochSource || (() => {
      this.nextEpoch += 1;
      return this.nextEpoch;
    });
    this.transactionBudgetMs = Number.isFinite(options.transactionBudgetMs) &&
      options.transactionBudgetMs > 0 ?
      Math.floor(options.transactionBudgetMs) :
      TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS;
    this.participantRetryMaxRetries = Number.isFinite(
      options.participantRetryMaxRetries,
    ) && options.participantRetryMaxRetries >= 0 ?
      Math.floor(options.participantRetryMaxRetries) :
      PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES;
    this.participantRetryBaseDelayMs = Number.isFinite(
      options.participantRetryBaseDelayMs,
    ) && options.participantRetryBaseDelayMs > 0 ?
      Math.floor(options.participantRetryBaseDelayMs) :
      PARTICIPANT_RETRY_DEFAULT.BASE_DELAY_MS;
    this.participantRetryMaxDelayMs = Number.isFinite(
      options.participantRetryMaxDelayMs,
    ) && options.participantRetryMaxDelayMs > 0 ?
      Math.floor(options.participantRetryMaxDelayMs) :
      PARTICIPANT_RETRY_DEFAULT.MAX_DELAY_MS;
    this.sleep = options.sleep || ((delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.onParticipantRetry = options.onParticipantRetry || null;
    this.logger = options.logger || console;
    this.loadRecoveryStateForSweep =
      options.loadRecoveryStateForSweep || null;
    this.recoverySweepIntervalMs = Number.isFinite(
      options.recoverySweepIntervalMs,
    ) && options.recoverySweepIntervalMs > 0 ?
      Math.floor(options.recoverySweepIntervalMs) :
      RECOVERY_SWEEP_DEFAULT_INTERVAL_MS;
    this.recoverySweepTimer = null;
    this.recoverySweepInFlight = false;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) => {
          await this.persistTransaction({
            transactionId: workflow.transactionId || workflow.workflowId,
            sessionId: workflow.sessionId || workflow.ownerKey,
            status: workflow.status,
            transactionEpoch: workflow.transactionEpoch,
            timeoutDeadline: workflow.timeoutDeadline,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
          });
        },
        persistParticipant: async (participant) => {
          await this.persistParticipant({
            participantId: participant.participantId,
            transactionId: participant.transactionId || participant.workflowId,
            partitionId: participant.partitionId || participant.participantKey,
            status: participant.status,
            lastError: participant.lastError,
            createdAt: participant.createdAt,
            updatedAt: participant.updatedAt,
          });
        },
        now: this.now,
      });
    this.transactionsBySession = this.workflowCoordinator.workflowsByOwnerKey;
    this.recoveredTransactionIds = new Set();
  }

  /**
   * Begin a distributed transaction for a session.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Transaction begin result.
   */
  async begin(sessionId) {
    if (this.transactionsBySession.has(sessionId)) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_ACTIVE,
      };
    }

    let transactionEpoch;
    try {
      transactionEpoch = this.epochSource();
    } catch (_err) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.BEGIN_FAILED,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }
    if (!Number.isFinite(transactionEpoch)) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.BEGIN_FAILED,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }

    const timeoutBudget = createTopLevelOperationBudget({
      configuredBudgetMs: this.transactionBudgetMs,
      operationName: QUERY_OPERATION.TRANSACTION,
      now: this.now,
    });
    const now = this.now();
    const transactionId = this.createTransactionId(sessionId);
    const tx = {
      sessionId,
      ownerKey: sessionId,
      transactionId,
      workflowId: transactionId,
      transactionEpoch,
      timeoutBudget,
      timeoutDeadline: timeoutBudget.deadlineMs,
      status: TRANSACTION_STATUS.ACTIVE,
      participants: new Map(),
      writeOperations: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.workflowCoordinator.registerWorkflow(tx);

    return {
      success: true,
      operation: QUERY_OPERATION.BEGIN_TRANSACTION,
      sessionId,
      transactionId,
      transactionEpoch,
    };
  }

  /**
   * Enlist partition participants and begin transaction on new participants.
   * @param {string} sessionId - Session ID.
   * @param {string[]} partitionIds - Target partition IDs.
   * @return {Promise<Object>} Enlistment result.
   */
  async enlistParticipants(sessionId, partitionIds) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    const uniquePartitionIds = Array.from(new Set(partitionIds || []));
    const newlyEnlisted = [];
    for (const partitionId of uniquePartitionIds) {
      if (tx.participants.has(partitionId)) {
        continue;
      }
      await this.beginParticipant(sessionId, partitionId, tx.transactionEpoch);
      const now = this.now();
      await this.workflowCoordinator.upsertParticipant(tx.workflowId, {
        participantId: this.createParticipantId(tx.transactionId, partitionId),
        transactionId: tx.transactionId,
        partitionId,
        status: PARTICIPANT_STATUS.ACTIVE,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
      newlyEnlisted.push(partitionId);
    }

    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
    await this.persistParticipants(tx, newlyEnlisted);

    return {
      success: true,
      participants: this.getOrderedParticipantIds(tx),
      newlyEnlisted,
    };
  }

  /**
   * Record distributed write operation metadata under a transaction.
   * @param {string} sessionId - Session ID.
   * @param {Object} operation - Operation metadata.
   * @return {Promise<void>}
   */
  async recordWriteOperation(sessionId, operation) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return;
    }

    const now = this.now();
    const normalized = {
      operationId: operation.operationId,
      statementType: operation.statementType || QUERY_OPERATION.UPDATE,
      partitionIds: Array.isArray(operation.partitionIds) ?
        [...operation.partitionIds] :
        [],
      idempotencyKey: operation.idempotencyKey || operation.operationId,
      payloadHash: operation.payloadHash || this.createWritePayloadHash(operation),
      status: WRITE_OPERATION_STATUS.PENDING,
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.writeOperations.push(normalized);
    tx.updatedAt = now;

    await this.persistTransactionRecord(tx);
    await this.persistWriteOperationRecord(tx, normalized);
  }

  /**
   * Mark one recorded write operation with execution outcome.
   * @param {string} sessionId - Session ID.
   * @param {string} operationId - Operation identifier.
   * @param {Object} result - Aggregated write result.
   * @return {Promise<void>}
   */
  async markWriteOperationResult(sessionId, operationId, result) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return;
    }

    const operation = tx.writeOperations.find((entry) =>
      entry.operationId === operationId);
    if (!operation) {
      return;
    }

    operation.status = result?.success === true ?
      WRITE_OPERATION_STATUS.SUCCEEDED :
      WRITE_OPERATION_STATUS.FAILED;
    operation.retryCount = Number.isInteger(result?.retryCount) ?
      result.retryCount :
      0;
    operation.lastError = result?.success === true ?
      null :
      result?.error || QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE;
    operation.updatedAt = this.now();
    tx.updatedAt = operation.updatedAt;

    await this.persistTransactionRecord(tx);
    await this.persistWriteOperationRecord(tx, operation);
  }

  /**
   * Commit a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   */
  async commit(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }
    return this.runCommitProtocol(tx);
  }

  /**
   * Roll back a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   */
  async rollback(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }
    return this.runRollbackProtocol(tx);
  }

  /**
   * Return transaction metadata for one session.
   * @param {string} sessionId - Session ID.
   * @return {Object|null} Transaction metadata.
   */
  getTransaction(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return null;
    }
    return {
      sessionId: tx.sessionId,
      transactionId: tx.transactionId,
      status: tx.status,
      transactionEpoch: tx.transactionEpoch,
      timeoutDeadline: tx.timeoutDeadline,
      participants: this.getOrderedParticipantIds(tx),
      participantDetails: this.getOrderedParticipantDetails(tx),
      writeOperations: tx.writeOperations.map((operation) => ({...operation})),
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} Active transaction state.
   */
  hasActiveTransaction(sessionId) {
    return this.transactionsBySession.has(sessionId);
  }

  /**
   * Recover in-flight transactions after restart.
   * Accepts canonical system-table row arrays.
   *
   * @param {Object[]|Object} rows - Transaction rows in
   *   canonical system-table shape.
   */
  recover(rows) {
    if (!Array.isArray(rows)) {
      return;
    }

    this.recoverFromSystemTables({
      transactions: rows,
      participants: rows.flatMap((row) => {
        const transactionId = row.transaction_id || row.transactionId;
        const participants = Array.isArray(row.participants) ? row.participants : [];
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
  async resumeRecoveredTransactions() {
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

    const resumed = results.filter((entry) =>
      entry.success && !entry.skipped).length;
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
  async runRecoverySweep() {
    if (this.recoverySweepInFlight) {
      return {
        swept: 0,
        resolved: 0,
        failed: 0,
        skipped: true,
        results: [],
      };
    }
    this.recoverySweepInFlight = true;
    try {
      if (typeof this.loadRecoveryStateForSweep === 'function') {
        const payload = await this.loadRecoveryStateForSweep();
        if (payload && typeof payload === 'object') {
          this.recoverFromSystemTables(payload);
        }
      }

      const stuckTransactions = Array.from(this.transactionsBySession.values())
        .filter((tx) =>
          !TERMINAL_TRANSACTION_STATUS.has(tx.status) &&
          tx.status !== TRANSACTION_STATUS.FAILED &&
          this.isTransactionBudgetExceeded(tx),
        );
      const results = [];

      for (const tx of stuckTransactions) {
        let protocolResult = null;
        let sweepPath = null;
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
      const failed = results.length - resolved;
      return {
        swept: stuckTransactions.length,
        resolved,
        failed,
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
  startRecoverySweep() {
    if (this.recoverySweepTimer) {
      return;
    }
    this.recoverySweepTimer = setInterval(() => {
      void this.runRecoverySweep();
    }, this.recoverySweepIntervalMs);
    this.recoverySweepTimer.unref();
  }

  /**
   * Stop periodic transaction recovery sweep.
   */
  stopRecoverySweep() {
    if (!this.recoverySweepTimer) {
      return;
    }
    clearInterval(this.recoverySweepTimer);
    this.recoverySweepTimer = null;
  }

  /**
   * Recover coordinator state from canonical system-table rows.
   *
   * @param {Object} payload - Recovery payload.
   * @param {Object[]} [payload.transactions] - sql_transactions rows.
   * @param {Object[]} [payload.participants] - sql_transaction_participants rows.
   * @param {Object[]} [payload.writeOperations] - sql_write_operations rows.
   */
  recoverFromSystemTables(payload = {}) {
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
            'transaction_epoch',
            'transactionEpoch',
          ),
          timeoutDeadline: this.resolveFiniteNumberField(
            row,
            'timeout_deadline',
            'timeoutDeadline',
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
          participantId: row.participant_id ||
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
        partitionIds: this.parseJsonArrayField(row.partition_ids || row.partitionIds),
        idempotencyKey: row.idempotency_key || row.idempotencyKey,
        payloadHash: row.payload_hash || row.payloadHash,
        status: row.status || WRITE_OPERATION_STATUS.PENDING,
        retryCount: row.retry_count || row.retryCount || 0,
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
  async setTransactionStatus(tx, status) {
    tx.status = status;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
  }

  /**
   * Resolve remaining timeout budget for one transaction.
   * @param {Object} tx - Transaction state.
   * @return {number} Remaining budget in milliseconds.
   * @private
   */
  getRemainingTransactionBudgetMs(tx) {
    if (tx?.timeoutBudget && Number.isFinite(tx.timeoutBudget.deadlineMs)) {
      return getRemainingBudgetMs(tx.timeoutBudget, {now: this.now});
    }
    if (Number.isFinite(tx?.timeoutDeadline)) {
      return Math.max(0, tx.timeoutDeadline - this.now());
    }
    return Number.POSITIVE_INFINITY;
  }

  /**
   * Determine whether one transaction exceeded its timeout budget.
   * @param {Object} tx - Transaction state.
   * @return {boolean} True when timeout budget is exhausted.
   * @private
   */
  isTransactionBudgetExceeded(tx) {
    return this.getRemainingTransactionBudgetMs(tx) <= 0;
  }

  /**
   * Check whether participant failures include a timeout condition.
   * @param {Object[]} failedParticipants - Failed participants.
   * @return {boolean} True when at least one failure is timeout-related.
   * @private
   */
  hasTimeoutFailure(failedParticipants) {
    return failedParticipants.some((entry) =>
      TIMEOUT_ERROR_MESSAGES.has(entry.error),
    );
  }

  /**
   * Abort one transaction due to timeout budget exhaustion.
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Protocol stage where timeout happened.
   * @return {Promise<Object>} Timeout failure payload.
   * @private
   */
  async abortTimedOutTransaction(tx, stage) {
    if (tx.status !== TRANSACTION_STATUS.ROLLING_BACK) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
    }
    const rollbackResult = await this.runRollbackProtocol(tx);
    return {
      success: false,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: [],
      rollbackFailedParticipants: rollbackResult.failedParticipants || [],
      stage,
      errorCode: QUERY_ERROR_CODE.TIMEOUT,
      error: QUERY_ERROR_MSG.QUERY_TIMEOUT,
    };
  }

  /**
   * Drive one transaction through the commit protocol.
   * Supports replay from PREPARING/PREPARED/COMMITTING statuses.
   *
   * @param {Object} tx - Transaction state.
   * @param {Object} [options] - Commit options.
   * @param {boolean} [options.allowTimedOutCommitStatuses] - Allow commit
   *   continuation for PREPARED/COMMITTING transactions after timeout.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async runCommitProtocol(tx, options = {}) {
    const commitStatusAllowsTimeout = options.allowTimedOutCommitStatuses === true &&
      (tx.status === TRANSACTION_STATUS.PREPARED ||
      tx.status === TRANSACTION_STATUS.COMMITTING);

    if (!commitStatusAllowsTimeout && this.isTransactionBudgetExceeded(tx)) {
      return this.abortTimedOutTransaction(tx, tx.status);
    }

    if (tx.status === TRANSACTION_STATUS.ACTIVE ||
      tx.status === TRANSACTION_STATUS.FAILED) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARING);
    }

    if (tx.status === TRANSACTION_STATUS.PREPARING) {
      if (!commitStatusAllowsTimeout && this.isTransactionBudgetExceeded(tx)) {
        return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARING);
      }
      const prepareFailures = await this.executeParticipantStage(
        tx,
        PARTICIPANT_STATUS.PREPARING,
        PARTICIPANT_STATUS.PREPARED,
        (partitionId) => this.prepareParticipant(tx.sessionId, partitionId),
        {participantKeys: this.getPrepareParticipantKeys(tx)},
      );
      if (prepareFailures.length > 0) {
        if (this.hasTimeoutFailure(prepareFailures)) {
          return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARING);
        }
        await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
        const rollbackResult = await this.runRollbackProtocol(tx);
        return {
          success: false,
          operation: QUERY_OPERATION.COMMIT,
          transactionId: tx.transactionId,
          participants: this.getOrderedParticipantIds(tx),
          failedParticipants: prepareFailures,
          rollbackFailedParticipants: rollbackResult.failedParticipants || [],
          stage: TRANSACTION_STATUS.PREPARING,
          errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
          error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        };
      }
      if (!commitStatusAllowsTimeout && this.isTransactionBudgetExceeded(tx)) {
        return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARING);
      }
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARED);
    }

    if (tx.status === TRANSACTION_STATUS.PREPARED) {
      if (!commitStatusAllowsTimeout && this.isTransactionBudgetExceeded(tx)) {
        return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.PREPARED);
      }
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTING);
    }

    if (tx.status !== TRANSACTION_STATUS.COMMITTING) {
      return this.buildParticipantFailureResult(
        tx,
        QUERY_OPERATION.COMMIT,
        tx.status,
        [],
      );
    }

    if (!commitStatusAllowsTimeout && this.isTransactionBudgetExceeded(tx)) {
      return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.COMMITTING);
    }
    const commitFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.COMMITTING,
      PARTICIPANT_STATUS.COMMITTED,
      (partitionId) => this.commitParticipant(tx.sessionId, partitionId),
      {
        participantKeys: this.getCommitParticipantKeys(tx),
        skipBudgetEnforcement: commitStatusAllowsTimeout,
      },
    );
    if (commitFailures.length > 0) {
      if (!commitStatusAllowsTimeout && this.hasTimeoutFailure(commitFailures)) {
        return this.abortTimedOutTransaction(tx, TRANSACTION_STATUS.COMMITTING);
      }
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
      return this.buildParticipantFailureResult(
        tx,
        QUERY_OPERATION.COMMIT,
        TRANSACTION_STATUS.COMMITTING,
        commitFailures,
      );
    }

    await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTED);
    this.transactionsBySession.delete(tx.sessionId);
    return {
      success: true,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
    };
  }

  /**
   * Drive one transaction through rollback.
   * Supports replay from ACTIVE/ROLLING_BACK statuses.
   *
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async runRollbackProtocol(tx) {
    if (tx.status !== TRANSACTION_STATUS.ROLLING_BACK) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
    }

    const rollbackFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.ROLLING_BACK,
      PARTICIPANT_STATUS.ROLLED_BACK,
      (partitionId) => this.rollbackParticipant(tx.sessionId, partitionId),
      {participantKeys: this.getRollbackParticipantKeys(tx)},
    );

    if (rollbackFailures.length > 0) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
    } else {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLED_BACK);
    }
    this.transactionsBySession.delete(tx.sessionId);

    return {
      success: rollbackFailures.length === 0,
      operation: QUERY_OPERATION.ROLLBACK,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: rollbackFailures,
      errorCode: rollbackFailures.length > 0 ?
        QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE :
        undefined,
      error: rollbackFailures.length > 0 ?
        QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE :
        undefined,
    };
  }

  /**
   * Build a consistent participant-failure result payload.
   *
   * @param {Object} tx - Transaction state.
   * @param {string} operation - Operation type.
   * @param {string} stage - Current stage.
   * @param {Object[]} failedParticipants - Failed participant entries.
   * @return {Object} Failure payload.
   * @private
   */
  buildParticipantFailureResult(tx, operation, stage, failedParticipants) {
    return {
      success: false,
      operation,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants,
      stage,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    };
  }

  /**
   * Resolve prepare-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getPrepareParticipantKeys(tx) {
    return Array.from(tx.participants.values())
      .filter((participant) =>
        participant.status !== PARTICIPANT_STATUS.PREPARED &&
        participant.status !== PARTICIPANT_STATUS.COMMITTED)
      .map((participant) => participant.partitionId)
      .sort();
  }

  /**
   * Resolve commit-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getCommitParticipantKeys(tx) {
    return Array.from(tx.participants.values())
      .filter((participant) =>
        participant.status !== PARTICIPANT_STATUS.COMMITTED)
      .map((participant) => participant.partitionId)
      .sort();
  }

  /**
   * Resolve rollback-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getRollbackParticipantKeys(tx) {
    return Array.from(tx.participants.values())
      .filter((participant) =>
        participant.status !== PARTICIPANT_STATUS.ROLLED_BACK)
      .map((participant) => participant.partitionId)
      .sort();
  }

  /**
   * Execute one participant stage and persist participant state updates.
   *
   * @param {Object} tx - Transaction state object.
   * @param {string} transientStatus - Status while stage is running.
   * @param {string} successStatus - Status on success.
   * @param {Function} operation - Async participant operation callback.
   * @param {Object} [options] - Stage options.
   * @param {string[]} [options.participantKeys] - Participant keys.
   * @param {boolean} [options.skipBudgetEnforcement] - Skip budget timeout
   *   checks during participant operation retries.
   * @return {Promise<Object[]>} Failed participant entries.
   * @private
   */
  async executeParticipantStage(
    tx,
    transientStatus,
    successStatus,
    operation,
    options = {},
  ) {
    const stageOptions = {
      failureStatus: PARTICIPANT_STATUS.FAILED,
    };
    if (Array.isArray(options.participantKeys)) {
      stageOptions.participantKeys = options.participantKeys;
    }
    const failedParticipants = await this.workflowCoordinator.executeParticipantStage(
      tx.workflowId,
      transientStatus,
      successStatus,
      (partitionId) => this.executeParticipantOperationWithRetry(
        tx,
        transientStatus,
        partitionId,
        operation,
        {
          skipBudgetEnforcement: options.skipBudgetEnforcement === true,
        },
      ),
      stageOptions,
    );
    return failedParticipants.map((entry) => ({
      partitionId: entry.participantKey,
      error: entry.error,
    }));
  }

  /**
   * Execute one participant operation with bounded exponential retry.
   *
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Participant stage.
   * @param {string} partitionId - Participant partition ID.
   * @param {Function} operation - Participant callback.
   * @param {Object} [options] - Retry options.
   * @param {boolean} [options.skipBudgetEnforcement] - Skip budget timeout
   *   checks before attempts and retries.
   * @return {Promise<void>}
   * @private
   */
  async executeParticipantOperationWithRetry(
    tx,
    stage,
    partitionId,
    operation,
    options = {},
  ) {
    let attempt = 0;
    const skipBudgetEnforcement = options.skipBudgetEnforcement === true;
    while (true) {
      if (!skipBudgetEnforcement &&
        stage !== PARTICIPANT_STATUS.ROLLING_BACK &&
        this.isTransactionBudgetExceeded(tx)) {
        throw this.createTransactionTimeoutError();
      }
      try {
        await operation(partitionId);
        return;
      } catch (error) {
        if (attempt >= this.participantRetryMaxRetries) {
          throw error;
        }

        attempt += 1;
        const retryDelayMs = this.calculateParticipantRetryDelay(attempt);
        this.emitParticipantRetryDiagnostic({
          transactionId: tx.transactionId,
          sessionId: tx.sessionId,
          partitionId,
          stage,
          duringRecovery: this.recoveredTransactionIds.has(tx.workflowId),
          attempt,
          retryDelayMs,
          error: error.message,
        });
        if (!skipBudgetEnforcement &&
          stage !== PARTICIPANT_STATUS.ROLLING_BACK &&
          this.isTransactionBudgetExceeded(tx)) {
          throw this.createTransactionTimeoutError();
        }
        await this.sleep(retryDelayMs);
      }
    }
  }

  /**
   * Build one timeout error for participant-stage execution.
   * @return {Error} Timeout error.
   * @private
   */
  createTransactionTimeoutError() {
    const timeoutError = new Error(QUERY_ERROR_MSG.QUERY_TIMEOUT);
    timeoutError.errorCode = QUERY_ERROR_CODE.TIMEOUT;
    return timeoutError;
  }

  /**
   * Emit one structured participant retry diagnostic.
   * @param {Object} diagnostic - Retry diagnostic payload.
   * @private
   */
  emitParticipantRetryDiagnostic(diagnostic) {
    if (typeof this.onParticipantRetry === 'function') {
      this.onParticipantRetry(diagnostic);
    }
    if (diagnostic?.duringRecovery !== true) {
      return;
    }
    if (typeof this.logger?.warn === 'function') {
      this.logger.warn(PARTICIPANT_RETRY_LOG_MSG, diagnostic);
    }
  }

  /**
   * Compute bounded exponential backoff delay for participant retries.
   * @param {number} attempt - Retry attempt index (1-based).
   * @return {number} Delay in milliseconds.
   * @private
   */
  calculateParticipantRetryDelay(attempt) {
    const exponentialDelay = this.participantRetryBaseDelayMs *
      (2 ** Math.max(attempt - 1, 0));
    return Math.min(this.participantRetryMaxDelayMs, exponentialDelay);
  }

  /**
   * Persist transaction record through callback.
   * @param {Object} tx - Transaction state.
   * @return {Promise<void>}
   * @private
   */
  async persistTransactionRecord(tx) {
    await this.workflowCoordinator.persistWorkflowState(tx.workflowId);
  }

  /**
   * Persist selected participants for a transaction.
   * @param {Object} tx - Transaction state.
   * @param {string[]} partitionIds - Participant IDs to persist.
   * @return {Promise<void>}
   * @private
   */
  async persistParticipants(tx, partitionIds) {
    for (const partitionId of partitionIds) {
      const participant = tx.participants.get(partitionId);
      if (!participant) {
        continue;
      }
      await this.persistParticipantRecord(tx, participant);
    }
  }

  /**
   * Persist one participant record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} participant - Participant state.
   * @return {Promise<void>}
   * @private
   */
  async persistParticipantRecord(tx, participant) {
    await this.workflowCoordinator.persistParticipantState(
      tx.workflowId,
      participant.partitionId,
    );
  }

  /**
   * Persist one write-operation record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} operation - Write operation metadata.
   * @return {Promise<void>}
   * @private
   */
  async persistWriteOperationRecord(tx, operation) {
    await this.persistWriteOperation({
      operationId: operation.operationId,
      transactionId: tx.transactionId,
      statementType: operation.statementType,
      status: operation.status,
      idempotencyKey: operation.idempotencyKey,
      payloadHash: operation.payloadHash,
      partitionIds: operation.partitionIds,
      retryCount: operation.retryCount,
      lastError: operation.lastError,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    });
  }

  /**
   * Build transaction ID.
   * @param {string} sessionId - Session ID.
   * @return {string} Transaction ID.
   * @private
   */
  createTransactionId(sessionId) {
    return `tx-${sessionId}-${this.now()}`;
  }

  /**
   * Build a deterministic participant ID.
   * @param {string} transactionId - Transaction ID.
   * @param {string} partitionId - Partition ID.
   * @return {string} Participant ID.
   * @private
   */
  createParticipantId(transactionId, partitionId) {
    return `${transactionId}:${partitionId}`;
  }

  /**
   * Build payload hash for write operation persistence.
   * @param {Object} operation - Write operation metadata.
   * @return {string} Payload hash.
   * @private
   */
  createWritePayloadHash(operation) {
    const payload = JSON.stringify({
      operationId: operation.operationId,
      statementType: operation.statementType,
      partitionIds: operation.partitionIds || [],
    });
    return createHash('sha1')
      .update(payload)
      .digest('hex');
  }

  /**
   * Parse serialized JSON array payloads.
   * @param {*} value - Raw value.
   * @return {string[]} Parsed array.
   * @private
   */
  parseJsonArrayField(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }
    if (typeof value !== 'string' || !value.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch (_parseErr) {
      return [];
    }
  }

  /**
   * Resolve one numeric field from snake_case/camelCase row keys.
   * @param {Object} row - Source row.
   * @param {string} snakeKey - Snake-case key.
   * @param {string} camelKey - Camel-case key.
   * @return {number|null} Parsed numeric value.
   * @private
   */
  resolveFiniteNumberField(row, snakeKey, camelKey) {
    if (Number.isFinite(row?.[snakeKey])) {
      return row[snakeKey];
    }
    if (Number.isFinite(row?.[camelKey])) {
      return row[camelKey];
    }
    return null;
  }

  /**
   * Return ordered participant IDs for API responses.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Ordered participant IDs.
   * @private
   */
  getOrderedParticipantIds(tx) {
    return Array.from(tx.participants.keys()).sort();
  }

  /**
   * Return ordered participant details for API responses.
   * @param {Object} tx - Transaction state.
   * @return {Object[]} Ordered participant records.
   * @private
   */
  getOrderedParticipantDetails(tx) {
    return Array.from(tx.participants.values())
      .map((participant) => ({...participant}))
      .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  }
}

export {
  DistributedTransactionCoordinator,
  PARTICIPANT_STATUS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
};
