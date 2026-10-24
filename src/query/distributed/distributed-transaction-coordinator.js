import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  TIMEOUT_BUDGET_DEFAULT,
  createTopLevelOperationBudget,
} from '../../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from '../../workflow/durable-workflow-coordinator.js';
import {
  COMMIT_MODE,
  isCanonicalTransactionEpoch,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../constants/index.js';
import {
  PARTICIPANT_RETRY_DEFAULT,
  PARTICIPANT_STATUS,
  RECOVERY_SWEEP_DEFAULT_INTERVAL_MS,
  TRANSACTION_ID_MINT_ATTEMPTS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {distributedTransactionRecoveryMethods} from
  './distributed-transaction-recovery.js';
import {
  setTransactionStatus,
  getRemainingTransactionBudgetMs,
  isTransactionBudgetExceeded,
  hasTimeoutFailure,
  abortTimedOutTransaction,
  buildParticipantFailureResult,
  getPrepareParticipantKeys,
  getCommitParticipantKeys,
  getRollbackParticipantKeys,
  executeParticipantStage,
  executeParticipantOperationWithRetry,
  resolveParticipantCommitMiss,
  createTransactionTimeoutError,
  emitParticipantRetryDiagnostic,
  calculateParticipantRetryDelay,
} from './distributed-transaction-protocol.js';
import {distributedTransactionDecisionProtocolMethods} from
  './distributed-transaction-decision-protocol.js';
import {
  createEndedTransactionRecords,
  stampThrownCommitPoint,
  withCommitPoint,
} from './distributed-transaction-commit-point.js';
import {
  persistTransactionRecord,
  persistParticipants,
  persistParticipantRecord,
  persistWriteOperationRecord,
  createTransactionId,
  createParticipantId,
  createWritePayloadHash,
  parseJsonArrayField,
  resolveFiniteNumberField,
  getOrderedParticipantIds,
  getOrderedParticipantDetails,
} from './distributed-transaction-records.js';
import {distributedTransactionParticipantSetMethods} from
  './distributed-transaction-participant-set.js';
import {
  isTransactionIdCollision,
} from './distributed-transaction-identity.js';
import {distributedTransactionStatementMethods} from
  './distributed-transaction-statement.js';
import {admitExpectedTransaction, STATEMENT_ADMISSION} from
  '../sql-query-engine-statement-admission.js';


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
   * @param {Function} [options.persistTransactionDecision] - Record the
   *   transaction's insert-once decision; throws when one is already
   *   recorded or the write's outcome is unknown.
   * @param {Function} [options.readTransactionDecision] - Read the recorded
   *   decision row of a transaction (null when none is readable).
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
    this.persistWriteOperation =
      options.persistWriteOperation || (async () => {});
    this.persistTransactionParticipantSet = options.persistTransactionParticipantSet ||
      (async () => {});
    this.readTransactionRecoveryState = options.readTransactionRecoveryState || null;
    this.persistTransactionDecision =
      options.persistTransactionDecision || (async () => {});
    this.readTransactionDecision =
      typeof options.readTransactionDecision === 'function' ?
        options.readTransactionDecision :
        null;
    this.resolveParticipantCommitOutcome =
      typeof options.resolveParticipantCommitOutcome === 'function' ?
        options.resolveParticipantCommitOutcome :
        null;
    this.now = options.now || (() => Date.now());
    this.nextEpoch = Number.isFinite(options.initialEpoch) ?
      Math.floor(options.initialEpoch) :
      this.now();
    this.epochSource =
      options.epochSource ||
      (() => {
        this.nextEpoch += 1;
        return this.nextEpoch;
      });
    this.transactionBudgetMs =
      Number.isFinite(options.transactionBudgetMs) &&
      options.transactionBudgetMs > 0 ?
        Math.floor(options.transactionBudgetMs) :
        TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS;
    this.participantRetryMaxRetries =
      Number.isFinite(options.participantRetryMaxRetries) &&
      options.participantRetryMaxRetries >= 0 ?
        Math.floor(options.participantRetryMaxRetries) :
        PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES;
    this.participantRetryBaseDelayMs =
      Number.isFinite(options.participantRetryBaseDelayMs) &&
      options.participantRetryBaseDelayMs > 0 ?
        Math.floor(options.participantRetryBaseDelayMs) :
        PARTICIPANT_RETRY_DEFAULT.BASE_DELAY_MS;
    this.participantRetryMaxDelayMs =
      Number.isFinite(options.participantRetryMaxDelayMs) &&
      options.participantRetryMaxDelayMs > 0 ?
        Math.floor(options.participantRetryMaxDelayMs) :
        PARTICIPANT_RETRY_DEFAULT.MAX_DELAY_MS;
    this.sleep =
      options.sleep ||
      ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.onParticipantRetry = options.onParticipantRetry || null;
    this.logger = options.logger || console;
    this.loadRecoveryStateForSweep = options.loadRecoveryStateForSweep || null;
    this.retainAdvancedTransactionReadback =
      typeof options.retainAdvancedTransactionReadback === 'function' ?
        options.retainAdvancedTransactionReadback :
        null;
    this.recoverySweepIntervalMs =
      Number.isFinite(options.recoverySweepIntervalMs) &&
      options.recoverySweepIntervalMs > 0 ?
        Math.floor(options.recoverySweepIntervalMs) :
        RECOVERY_SWEEP_DEFAULT_INTERVAL_MS;
    this.recoverySweepTimer = null;
    this.recoverySweepInFlight = false;
    this.recoverySweepDeferredUntilMs = 0;
    this.recoverySweepDeferredAttempts = 0;
    this.workflowCoordinator =
      options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        // The transaction row is inserted once, before any participant
        // work; every later write of it updates the existing row.
        persistWorkflow: async (workflow) => {
          await this.persistTransaction({
            transactionId: workflow.transactionId || workflow.workflowId,
            sessionId: workflow.sessionId || workflow.ownerKey,
            status: workflow.status,
            transactionEpoch: workflow.transactionEpoch,
            timeoutDeadline: workflow.timeoutDeadline,
            transactionMode: workflow.transactionMode,
            participantSetState: workflow.participantSetState,
            participantSetText: workflow.participantSetText,
            commitMode: workflow.commitMode,
            frozenParticipantCount: workflow.frozenParticipantCount,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
          }, {insertOnce: workflow.transactionRowInserted !== true});
          workflow.transactionRowInserted = true;
        },
        persistParticipant: async (participant) => {
          await this.persistParticipant({
            participantId: participant.participantId,
            transactionId: participant.transactionId || participant.workflowId,
            partitionId: participant.partitionId || participant.participantKey,
            status: participant.status,
            lastError: participant.lastError,
            preparedDigest: participant.preparedDigest ?? null,
            prepareIndex: participant.prepareIndex ?? null,
            prepareTerm: participant.prepareTerm ?? null,
            createdAt: participant.createdAt,
            updatedAt: participant.updatedAt,
          });
          if (participant.status === PARTICIPANT_STATUS.PREPARED) {
            participant.prepareEvidenceRetained = true;
          }
        },
        now: this.now,
      });
    this.transactionsBySession = this.workflowCoordinator.workflowsByOwnerKey;
    // Each session's last ended transaction: a COMMIT that finds none reads
    // whether that transaction reached its commit point from here.
    this.endedTransactions = createEndedTransactionRecords();
    this.transactionOperationTailBySession = new Map();
    this.recoveredTransactionIds = new Set();
  }

  /**
   * Begin a distributed transaction for a session.
   * @param {string} sessionId - Session ID.
   * @param {Object} [options] - {transactionMode, timeoutDeadline}: a
   *   retried statement-autocommit attempt names its first attempt's
   *   deadline and keeps it (TX1 seam V: one end-to-end budget).
   * @return {Promise<Object>} Transaction begin result.
   */
  async begin(sessionId, options = {}) {
    const expectedTransactionId = options.expectedTransactionId ??
      this.getTransaction(sessionId)?.transactionId;
    return this.runTransactionOperation(sessionId,
      () => this.beginOwned(sessionId, {...options, expectedTransactionId}));
  }

  async beginOwned(sessionId, options) {
    const admission = admitExpectedTransaction(this, sessionId,
      options.expectedTransactionId);
    if (admission.state === STATEMENT_ADMISSION.REFUSED) return admission.failure;
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
    if (!isCanonicalTransactionEpoch(transactionEpoch)) {
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
      startedAtMs: Number.isFinite(options.timeoutDeadline) ?
        options.timeoutDeadline - this.transactionBudgetMs : this.now(),
    });
    const transactionMode =
      options.transactionMode === TRANSACTION_MODE.AUTOCOMMIT ?
        TRANSACTION_MODE.AUTOCOMMIT :
        TRANSACTION_MODE.EXPLICIT;
    return this.registerUniqueTransaction(sessionId, {
      transactionEpoch, timeoutBudget, transactionMode,
    });
  }

  async registerUniqueTransaction(sessionId, fields) {
    const {transactionEpoch, timeoutBudget, transactionMode} = fields;
    for (let attempt = 1; ; attempt += 1) {
      const transactionId = this.createTransactionId(sessionId);
      try {
        await this.registerTransaction(sessionId, transactionId, {
          transactionEpoch,
          timeoutBudget,
          transactionMode,
        });
      } catch (error) {
        if (error?.code === QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE &&
            error.advancedTransactionRow &&
            this.retainAdvancedTransactionReadback !== null) {
          try {
            this.retainAdvancedTransactionReadback(
              error.advancedTransactionRow,
            );
          } catch (recoveryError) {
            this.logger?.warn?.(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
              {transactionId, error: recoveryError?.message});
          }
        }
        // Only a confirmed collision of the minted identity re-mints; any
        // other persistence failure is a typed BEGIN failure (seam B/S).
        if (isTransactionIdCollision(error) &&
            attempt < TRANSACTION_ID_MINT_ATTEMPTS) {
          continue;
        }
        return {
          success: false,
          error: error?.message || QUERY_ERROR_MSG.BEGIN_FAILED,
          errorCode: error?.code || error?.errorCode ||
            QUERY_ERROR_CODE.TRANSACTION_STATE_PERSIST_FAILED,
        };
      }
      return {
        success: true,
        operation: QUERY_OPERATION.BEGIN_TRANSACTION,
        sessionId,
        transactionId,
        transactionEpoch,
        transactionMode,
      };
    }
  }

  /**
   * Insert the transaction's row once, before any participant work, and
   * hold the transaction for its session.
   * @param {string} sessionId - Session ID.
   * @param {string} transactionId - The minted identity.
   * @param {Object} fields - {transactionEpoch, timeoutBudget,
   *   transactionMode}.
   * @return {Promise<void>}
   * @private
   */
  async registerTransaction(sessionId, transactionId, fields) {
    const {transactionEpoch, timeoutBudget, transactionMode} = fields;
    const now = this.now();
    const tx = {
      sessionId,
      ownerKey: sessionId,
      transactionId,
      workflowId: transactionId,
      transactionEpoch,
      timeoutBudget,
      timeoutDeadline: timeoutBudget.deadlineMs,
      status: TRANSACTION_STATUS.ACTIVE,
      transactionMode,
      participantSetState: PARTICIPANT_SET_STATE.OPEN,
      participantSetText: JSON.stringify([]),
      commitMode: COMMIT_MODE.NOT_SELECTED,
      frozenParticipantCount: 0,
      participantSetFrozenAt: 0,
      decisionTrace: [],
      participants: new Map(),
      writeOperations: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.workflowCoordinator.registerWorkflow(tx);
  }

  /**
   * Enlist partition participants and begin transaction on new participants.
   * @param {string} sessionId - Session ID.
   * @param {string[]} partitionIds - Target partition IDs.
   * @return {Promise<Object>} Enlistment result.
   */
  async enlistParticipants(sessionId, partitionIds,
    expectedTransactionId = this.getTransaction(sessionId)?.transactionId) {
    return this.runTransactionOperation(
      sessionId,
      () => {
        const admission = admitExpectedTransaction(this, sessionId, expectedTransactionId);
        return admission.state === STATEMENT_ADMISSION.REFUSED ? admission.failure :
          this.enlistParticipantsOwned(sessionId, partitionIds);
      },
    );
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

    await this.persistTransactionRecord(tx);
    await this.persistWriteOperationRecord(tx, operation);
  }

  /**
   * Commit a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @param {Object} [options] - {expectedTransactionId}: the COMMIT's own
   *   transaction, when the caller knows it.
   * @return {Promise<Object>} Commit result.
   */
  async commit(sessionId, options = {}) {
    const expectedTransactionId = options.expectedTransactionId ??
      this.getTransaction(sessionId)?.transactionId ?? null;
    return this.runTransactionOperation(
      sessionId,
      () => this.commitOwned(sessionId, expectedTransactionId),
    );
  }

  async commitOwned(sessionId, expectedTransactionId = null) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx || tx.transactionId !== expectedTransactionId) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
        ...this.endedTransactions.commitPointFor(sessionId,
          expectedTransactionId),
      };
    }
    // Not stamped with a commit point: the restored status is a progress
    // hint, so the held answer is outcome-unknown, never "not committed".
    const held = this.recoveryObligationStageRefusal(tx, QUERY_OPERATION.COMMIT);
    if (held) return held;
    await this.freezeParticipantSet(tx);
    try {
      return withCommitPoint(await this.runCommitProtocol(tx), tx);
    } catch (error) {
      throw stampThrownCommitPoint(error, tx);
    }
  }

  /**
   * Roll back a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   */
  async rollback(sessionId, options = {}) {
    const expectedTransactionId = options.expectedTransactionId ??
      this.getTransaction(sessionId)?.transactionId ?? null;
    return this.runTransactionOperation(
      sessionId,
      () => this.rollbackOwned(sessionId, expectedTransactionId),
    );
  }

  async rollbackOwned(sessionId, expectedTransactionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx || tx.transactionId !== expectedTransactionId) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }
    return this.recoveryObligationStageRefusal(tx, QUERY_OPERATION.ROLLBACK) ??
      this.runRollbackProtocol(tx);
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

// The recovery and decision protocol owners act on the coordinator itself.
Object.assign(DistributedTransactionCoordinator.prototype,
  distributedTransactionRecoveryMethods,
  distributedTransactionParticipantSetMethods,
  distributedTransactionStatementMethods,
  distributedTransactionDecisionProtocolMethods);

export {
  DistributedTransactionCoordinator,
  PARTICIPANT_STATUS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
};
