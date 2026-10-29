import {QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_OPERATION} from '../query-constants.js';
import {TIMEOUT_BUDGET_DEFAULT, createTopLevelOperationBudget} from '../../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from '../../workflow/durable-workflow-coordinator.js';
import {COMMIT_MODE, PARTICIPANT_SET_STATE, TRANSACTION_MODE} from '../../constants/index.js';
import {
  PARTICIPANT_RETRY_DEFAULT, PARTICIPANT_STATUS,
  RECOVERY_SWEEP_DEFAULT_INTERVAL_MS, TRANSACTION_STATUS, WRITE_OPERATION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {
  recover, resumeRecoveredTransactions, runRecoverySweep, startRecoverySweep,
  stopRecoverySweep, isRecoverySweepDeferred, shouldDeferRecoverySweepError,
  deferRecoverySweep, clearRecoverySweepDeferState, buildDeferredRecoverySweepResult,
  recoverFromSystemTables,
} from './distributed-transaction-recovery.js';
import {
  setTransactionStatus, getRemainingTransactionBudgetMs,
  isTransactionBudgetExceeded, hasTimeoutFailure,
  abortTimedOutTransaction, runCommitProtocol, runRollbackProtocol,
  buildParticipantFailureResult, getPrepareParticipantKeys,
  getCommitParticipantKeys, getRollbackParticipantKeys,
  executeParticipantStage, executeOnePhaseCommitStage,
  executeParticipantOperationWithRetry, resolveParticipantCommitMiss,
  createTransactionTimeoutError, emitParticipantRetryDiagnostic,
  calculateParticipantRetryDelay,
} from './distributed-transaction-protocol.js';
import {
  persistTransactionRecord, persistParticipants,
  persistParticipantRecord, persistWriteOperationRecord,
  createTransactionId, createParticipantId, createWritePayloadHash,
  parseJsonArrayField, resolveFiniteNumberField, getOrderedParticipantIds,
  getOrderedParticipantDetails, resolveEnlistDeadlockState,
} from './distributed-transaction-records.js';
import {buildFrozenTransactionDecision} from './distributed-transaction-commit-mode.js';

const LOCAL_NUM_ENLIST_BUSY_DELAY_MS = 10;
const LOCAL_NUM_ENLIST_MAX_BUSY_ATTEMPTS = 500;
const LOCAL_NUM_ENLIST_DEADLOCK_VICTIM_LIMIT = 2;
const LOCAL_NUM_ENLIST_DEADLOCK_NON_VICTIM_LIMIT = 8;


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
    this.resolveParticipantCommitOutcome =
      typeof options.resolveParticipantCommitOutcome === 'function' ?
        options.resolveParticipantCommitOutcome : null;
    this.now = options.now || (() => Date.now());
    this.nextEpoch = Number.isFinite(options.initialEpoch) ?
      Math.floor(options.initialEpoch) : this.now();
    this.epochSource = options.epochSource || (() => {
      this.nextEpoch = Number.isFinite(options.initialEpoch) ?
        this.nextEpoch + 1 : Math.max(this.nextEpoch + 1, this.now());
      return this.nextEpoch;
    });
    this.transactionBudgetMs = Number.isFinite(options.transactionBudgetMs) &&
      options.transactionBudgetMs > 0 ?
      Math.floor(options.transactionBudgetMs) : TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS;
    this.participantRetryMaxRetries = Number.isFinite(options.participantRetryMaxRetries) &&
      options.participantRetryMaxRetries >= 0 ?
      Math.floor(options.participantRetryMaxRetries) : PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES;
    this.participantRetryBaseDelayMs = Number.isFinite(options.participantRetryBaseDelayMs) &&
      options.participantRetryBaseDelayMs > 0 ?
      Math.floor(options.participantRetryBaseDelayMs) : PARTICIPANT_RETRY_DEFAULT.BASE_DELAY_MS;
    this.participantRetryMaxDelayMs = Number.isFinite(options.participantRetryMaxDelayMs) &&
      options.participantRetryMaxDelayMs > 0 ?
      Math.floor(options.participantRetryMaxDelayMs) : PARTICIPANT_RETRY_DEFAULT.MAX_DELAY_MS;
    this.sleep = options.sleep ||
      ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.onParticipantRetry = options.onParticipantRetry || null;
    this.logger = options.logger || console;
    this.loadRecoveryStateForSweep = options.loadRecoveryStateForSweep || null;
    this.recoverySweepIntervalMs = Number.isFinite(options.recoverySweepIntervalMs) &&
      options.recoverySweepIntervalMs > 0 ?
      Math.floor(options.recoverySweepIntervalMs) : RECOVERY_SWEEP_DEFAULT_INTERVAL_MS;
    this.recoverySweepTimer = null;
    this.recoverySweepInFlight = false;
    this.recoverySweepDeferredUntilMs = 0;
    this.recoverySweepDeferredAttempts = 0;
    this.workflowCoordinator =
      options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: (w) => this.persistTransaction({
          transactionId: w.transactionId || w.workflowId,
          sessionId: w.sessionId || w.ownerKey,
          status: w.status,
          transactionEpoch: w.transactionEpoch,
          timeoutDeadline: w.timeoutDeadline,
          transactionMode: w.transactionMode,
          participantSetState: w.participantSetState,
          commitMode: w.commitMode,
          frozenParticipantCount: w.frozenParticipantCount,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        }),
        persistParticipant: (p) => this.persistParticipant({
          participantId: p.participantId,
          transactionId: p.transactionId || p.workflowId,
          partitionId: p.partitionId || p.participantKey,
          status: p.status,
          lastError: p.lastError,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }),
        now: this.now,
      });
    this.transactions = this.workflowCoordinator.workflowsById;
    this.transactionsBySession = this.workflowCoordinator.workflowsByOwnerKey;
    this.transactionOperationTailBySession = new Map();
    this.recoveredTransactionIds = new Set();
  }

  /**
   * Begin a distributed transaction for a session.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Transaction begin result.
   */
  async begin(sessionId, options = {}) {
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
      transactionMode:
        options.transactionMode === TRANSACTION_MODE.AUTOCOMMIT ?
          TRANSACTION_MODE.AUTOCOMMIT :
          TRANSACTION_MODE.EXPLICIT,
      participantSetState: PARTICIPANT_SET_STATE.OPEN,
      commitMode: COMMIT_MODE.NOT_SELECTED,
      frozenParticipantCount: 0,
      participantSetFrozenAt: 0,
      decisionTrace: [],
      participants: new Map(),
      writeOperations: [],
      hasReadStatement: false,
      firstReadEpochByPartition: new Map(),
      waitingForPartitionId: null,
      enlistingPartitionIds: new Set(),
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
      transactionMode: tx.transactionMode,
    };
  }

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
  }

  /**
   * Enlist partition participants and begin transaction on new participants.
   * @param {string} sessionId - Session ID.
   * @param {string[]} partitionIds - Target partition IDs.
   * @return {Promise<Object>} Enlistment result.
   */
  async enlistParticipants(sessionId, partitionIds) {
    return this.runTransactionOperation(
      sessionId,
      () => this.enlistParticipantsOwned(sessionId, partitionIds),
    );
  }

  async enlistParticipantsOwned(sessionId, partitionIds) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }
    if (tx.participantSetState !== PARTICIPANT_SET_STATE.OPEN) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.TRANSACTION_PARTICIPANTS_FROZEN,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_PARTICIPANTS_FROZEN,
      };
    }

    const uniquePartitionIds = Array.from(new Set(partitionIds || [])).sort();
    const newPartitionIds = uniquePartitionIds.filter((id) => !tx.participants.has(id));
    const newlyEnlisted = [];
    const participantEpochs = new Map();
    tx.enlistingPartitionIds = new Set();
    try {
      for (const partitionId of newPartitionIds) {
        let attempt = 0;
        tx.waitingForPartitionId = partitionId;
        while (true) {
          attempt += 1;
          const priorReadEpoch = tx.firstReadEpochByPartition?.get?.(partitionId);
          const hasPriorReadOnPartition = Number.isFinite(priorReadEpoch);
          let participantEpoch;
          if (hasPriorReadOnPartition) {
            participantEpoch = priorReadEpoch;
          } else if (attempt > 1) {
            participantEpoch = Math.max(tx.transactionEpoch, this.epochSource());
            tx.transactionEpoch = participantEpoch;
          } else {
            participantEpoch = tx.transactionEpoch;
          }
          tx.transactionEpoch = Math.max(
            Number(tx.transactionEpoch) || 0,
            Number(participantEpoch) || 0,
          );
          participantEpochs.set(partitionId, participantEpoch);
          try {
            await this.beginParticipant(sessionId, partitionId, participantEpoch);
            break;
          } catch (error) {
            const isBusy = String(error?.message || '').includes(
              'Transaction already active on this partition',
            );
            if (isBusy) {
              const deadlock = resolveEnlistDeadlockState(
                this.transactionsBySession,
                tx,
                partitionId,
                newlyEnlisted,
              );
              const limit = deadlock.inCycle ?
                (deadlock.isVictim ?
                  LOCAL_NUM_ENLIST_DEADLOCK_VICTIM_LIMIT :
                  LOCAL_NUM_ENLIST_DEADLOCK_NON_VICTIM_LIMIT) :
                LOCAL_NUM_ENLIST_MAX_BUSY_ATTEMPTS;
              if (attempt < limit) {
                await this.sleep(LOCAL_NUM_ENLIST_BUSY_DELAY_MS);
                continue;
              }
            }
            tx.waitingForPartitionId = null;
            const partitionsToRelease = isBusy ?
              [...newlyEnlisted, ...Array.from(tx.participants.keys())] :
              newlyEnlisted;
            for (const enlistedId of partitionsToRelease) {
              try {
                const epoch = tx.participants.get(enlistedId)?.transactionEpoch ??
                  participantEpochs.get(enlistedId) ??
                  tx.transactionEpoch;
                await this.rollbackParticipant(sessionId, enlistedId, epoch);
              } catch (_rollbackErr) {
                void _rollbackErr;
              }
            }
            throw error;
          }
        }
        tx.waitingForPartitionId = null;
        newlyEnlisted.push(partitionId);
        tx.enlistingPartitionIds.add(partitionId);
      }
      for (const partitionId of newlyEnlisted) {
        const now = this.now();
        await this.workflowCoordinator.upsertParticipant(tx.workflowId, {
          participantId: this.createParticipantId(tx.transactionId, partitionId),
          transactionId: tx.transactionId,
          partitionId,
          transactionEpoch: participantEpochs.get(partitionId) ?? tx.transactionEpoch,
          status: PARTICIPANT_STATUS.ACTIVE,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      tx.updatedAt = this.now();
      if (newlyEnlisted.length > 0) {
        await this.persistTransactionRecord(tx);
        await this.persistParticipants(tx, newlyEnlisted);
      }
    } finally {
      tx.waitingForPartitionId = null;
      tx.enlistingPartitionIds?.clear?.();
    }

    return {
      success: true,
      participants: this.getOrderedParticipantIds(tx),
      newlyEnlisted,
    };
  }

  /**
   * Execute one complete transactional write while the session FIFO lane is
   * held, so commit cannot freeze between enlistment and statement outcome.
   * @param {string} sessionId
   * @param {Object} operation
   * @param {Function} executeWrite
   * @return {Promise<Object>}
   */
  async executeWriteStatement(sessionId, operation, executeWrite) {
    return this.runTransactionOperation(sessionId, async () => {
      const enlistResult = await this.enlistParticipantsOwned(
        sessionId,
        operation.partitionIds,
      );
      if (enlistResult.success !== true) {
        return enlistResult;
      }
      await this.recordWriteOperation(sessionId, operation);
      const result = await executeWrite();
      await this.markWriteOperationResult(
        sessionId,
        operation.operationId,
        result,
      );
      return result;
    });
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
      payloadHash:
        operation.payloadHash || this.createWritePayloadHash(operation),
      status: WRITE_OPERATION_STATUS.PENDING,
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.writeOperations.push(normalized);
    tx.updatedAt = now;

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

    const operation = tx.writeOperations.find(
      (entry) => entry.operationId === operationId,
    );
    if (!operation) {
      return;
    }

    operation.status =
      result?.success === true ?
        WRITE_OPERATION_STATUS.SUCCEEDED :
        WRITE_OPERATION_STATUS.FAILED;
    operation.retryCount = Number.isInteger(result?.retryCount) ?
      result.retryCount :
      0;
    operation.lastError =
      result?.success === true ?
        null :
        result?.error || QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE;
    operation.updatedAt = this.now();
    tx.updatedAt = operation.updatedAt;

    await this.persistWriteOperationRecord(tx, operation);
  }

  /**
   * Commit a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   */
  async commit(sessionId) {
    return this.runTransactionOperation(
      sessionId,
      () => this.commitOwned(sessionId),
    );
  }

  async commitOwned(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }
    if (tx.participantSetState === PARTICIPANT_SET_STATE.OPEN) {
      const previousDecision = {
        participantSetState: tx.participantSetState, commitMode: tx.commitMode,
        frozenParticipantCount: tx.frozenParticipantCount,
        participantSetFrozenAt: tx.participantSetFrozenAt,
        decisionTrace: tx.decisionTrace, updatedAt: tx.updatedAt,
      };
      const decision = buildFrozenTransactionDecision({
        transactionMode: tx.transactionMode,
        participantCount: tx.participants.size,
        onePhaseCommitSupported:
          typeof this.resolveParticipantCommitOutcome === 'function',
        decidedAt: this.now(),
      });
      Object.assign(tx, decision);
      tx.updatedAt = decision.participantSetFrozenAt;
      try {
        await this.persistTransactionRecord(tx);
      } catch (error) {
        Object.assign(tx, previousDecision);
        throw error;
      }
    }
    return this.runCommitProtocol(tx);
  }

  /**
   * Roll back a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   */
  async rollback(sessionId) {
    return this.runTransactionOperation(
      sessionId,
      () => this.rollbackOwned(sessionId),
    );
  }

  async rollbackOwned(sessionId) {
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
      transactionMode: tx.transactionMode,
      participantSetState: tx.participantSetState,
      commitMode: tx.commitMode,
      frozenParticipantCount: tx.frozenParticipantCount,
      participantSetFrozenAt: tx.participantSetFrozenAt,
      decisionTrace: tx.decisionTrace.map((entry) => ({...entry})),
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

  recover(rows) {
    return recover.call(this, rows);
  }

  async resumeRecoveredTransactions() {
    return resumeRecoveredTransactions.call(this);
  }

  async runRecoverySweep() {
    return runRecoverySweep.call(this);
  }

  startRecoverySweep() {
    return startRecoverySweep.call(this);
  }

  stopRecoverySweep() {
    return stopRecoverySweep.call(this);
  }

  isRecoverySweepDeferred() {
    return isRecoverySweepDeferred.call(this);
  }

  shouldDeferRecoverySweepError(errorLike) {
    return shouldDeferRecoverySweepError.call(this, errorLike);
  }

  deferRecoverySweep(errorLike) {
    return deferRecoverySweep.call(this, errorLike);
  }

  clearRecoverySweepDeferState() {
    return clearRecoverySweepDeferState.call(this);
  }

  buildDeferredRecoverySweepResult(errorLike, overrides = {}) {
    return buildDeferredRecoverySweepResult.call(this, errorLike, overrides);
  }

  recoverFromSystemTables(payload = {}, options = {}) {
    return recoverFromSystemTables.call(this, payload, options);
  }

  async setTransactionStatus(tx, status) {
    return setTransactionStatus.call(this, tx, status);
  }

  getRemainingTransactionBudgetMs(tx) {
    return getRemainingTransactionBudgetMs.call(this, tx);
  }

  isTransactionBudgetExceeded(tx) {
    return isTransactionBudgetExceeded.call(this, tx);
  }

  hasTimeoutFailure(failedParticipants) {
    return hasTimeoutFailure.call(this, failedParticipants);
  }

  async abortTimedOutTransaction(tx, stage) {
    return abortTimedOutTransaction.call(this, tx, stage);
  }

  async runCommitProtocol(tx, options = {}) {
    return runCommitProtocol.call(this, tx, options);
  }

  async runRollbackProtocol(tx) {
    return runRollbackProtocol.call(this, tx);
  }

  buildParticipantFailureResult(tx, operation, stage, failedParticipants) {
    return buildParticipantFailureResult.call(
      this,
      tx,
      operation,
      stage,
      failedParticipants,
    );
  }

  getPrepareParticipantKeys(tx) {
    return getPrepareParticipantKeys.call(this, tx);
  }

  getCommitParticipantKeys(tx) {
    return getCommitParticipantKeys.call(this, tx);
  }

  getRollbackParticipantKeys(tx) {
    return getRollbackParticipantKeys.call(this, tx);
  }

  async executeParticipantStage(
    tx,
    transientStatus,
    successStatus,
    operation,
    options = {},
  ) {
    return executeParticipantStage.call(
      this,
      tx,
      transientStatus,
      successStatus,
      operation,
      options,
    );
  }

  async executeParticipantOperationWithRetry(
    tx,
    stage,
    partitionId,
    operation,
    options = {},
  ) {
    return executeParticipantOperationWithRetry.call(
      this,
      tx,
      stage,
      partitionId,
      operation,
      options,
    );
  }

  async executeOnePhaseCommitStage(tx, options = {}) {
    return executeOnePhaseCommitStage.call(this, tx, options);
  }

  async resolveParticipantCommitMiss(tx, stage, partitionId, error) {
    return resolveParticipantCommitMiss.call(
      this,
      tx,
      stage,
      partitionId,
      error,
    );
  }

  createTransactionTimeoutError() {
    return createTransactionTimeoutError.call(this);
  }

  emitParticipantRetryDiagnostic(diagnostic) {
    return emitParticipantRetryDiagnostic.call(this, diagnostic);
  }

  calculateParticipantRetryDelay(attempt) {
    return calculateParticipantRetryDelay.call(this, attempt);
  }

  async persistTransactionRecord(tx) {
    return persistTransactionRecord.call(this, tx);
  }

  async persistParticipants(tx, partitionIds) {
    return persistParticipants.call(this, tx, partitionIds);
  }

  async persistParticipantRecord(tx, participant) {
    return persistParticipantRecord.call(this, tx, participant);
  }

  async persistWriteOperationRecord(tx, operation) {
    return persistWriteOperationRecord.call(this, tx, operation);
  }

  createTransactionId(sessionId) {
    return createTransactionId.call(this, sessionId);
  }

  createParticipantId(transactionId, partitionId) {
    return createParticipantId.call(this, transactionId, partitionId);
  }

  createWritePayloadHash(operation) {
    return createWritePayloadHash.call(this, operation);
  }

  parseJsonArrayField(value) {
    return parseJsonArrayField.call(this, value);
  }

  resolveFiniteNumberField(row, snakeKey, camelKey) {
    return resolveFiniteNumberField.call(this, row, snakeKey, camelKey);
  }

  getOrderedParticipantIds(tx) {
    return getOrderedParticipantIds.call(this, tx);
  }

  getOrderedParticipantDetails(tx) {
    return getOrderedParticipantDetails.call(this, tx);
  }
}

export {
  DistributedTransactionCoordinator,
  PARTICIPANT_STATUS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
};
