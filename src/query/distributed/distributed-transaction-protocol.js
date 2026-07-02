import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {getRemainingBudgetMs} from '../../control-plane/timeout-budget.js';
import {
  IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES,
  PARTICIPANT_RETRY_LOG_MSG,
  PARTICIPANT_STATUS,
  TIMEOUT_ERROR_MESSAGES,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';

const LOCAL_STR_FUNCTION = 'function';

/**
 * Check whether participant failures include a timeout condition.
 * @param {Object[]} failedParticipants - Failed participants.
 * @return {boolean} True when at least one failure is timeout-related.
 * @private
 */

function hasTimeoutFailure(failedParticipants) {
  return failedParticipants.some((entry) =>
    TIMEOUT_ERROR_MESSAGES.has(entry.error),
  );
}

/**
 * Resolve prepare-stage participant keys.
 * @param {Object} tx - Transaction state.
 * @return {string[]} Participant keys.
 * @private
 */

function getPrepareParticipantKeys(tx) {
  return Array.from(tx.participants.values())
    .filter(
      (participant) =>
        participant.status !== PARTICIPANT_STATUS.PREPARED &&
        participant.status !== PARTICIPANT_STATUS.COMMITTED,
    )
    .map((participant) => participant.partitionId)
    .sort();
}

/**
 * Resolve commit-stage participant keys.
 * @param {Object} tx - Transaction state.
 * @return {string[]} Participant keys.
 * @private
 */

function getCommitParticipantKeys(tx) {
  return Array.from(tx.participants.values())
    .filter(
      (participant) => participant.status !== PARTICIPANT_STATUS.COMMITTED,
    )
    .map((participant) => participant.partitionId)
    .sort();
}

/**
 * Resolve rollback-stage participant keys.
 * @param {Object} tx - Transaction state.
 * @return {string[]} Participant keys.
 * @private
 */

function getRollbackParticipantKeys(tx) {
  return Array.from(tx.participants.values())
    .filter(
      (participant) => participant.status !== PARTICIPANT_STATUS.ROLLED_BACK,
    )
    .map((participant) => participant.partitionId)
    .sort();
}

/**
 * Build one timeout error for participant-stage execution.
 * @return {Error} Timeout error.
 * @private
 */

function createTransactionTimeoutError() {
  const timeoutError = new Error(QUERY_ERROR_MSG.QUERY_TIMEOUT);
  timeoutError.errorCode = QUERY_ERROR_CODE.TIMEOUT;
  return timeoutError;
}

/**
 * Treat replayed participant commits that already cleared local transaction
 * state as idempotent success so recovery can converge after ambiguous ACK
 * loss or duplicate commit delivery.
 * @param {string} stage
 * @param {Error|Object} error
 * @return {boolean}
 * @private
 */

function shouldTreatParticipantCommitMissAsSuccess(stage, error) {
  if (stage !== PARTICIPANT_STATUS.COMMITTING) {
    return false;
  }
  const errorCode = error?.errorCode || error?.code || null;
  if (errorCode === QUERY_ERROR_CODE.NO_TRANSACTION) {
    return true;
  }
  const errorMessage = String(error?.message || error?.error || '');
  return IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES.has(errorMessage);
}

const distributedTransactionProtocolMethods = {
  async setTransactionStatus(tx, status) {
    tx.status = status;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
  },

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
  },

  /**
   * Determine whether one transaction exceeded its timeout budget.
   * @param {Object} tx - Transaction state.
   * @return {boolean} True when timeout budget is exhausted.
   * @private
   */

  isTransactionBudgetExceeded(tx) {
    return this.getRemainingTransactionBudgetMs(tx) <= 0;
  },

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
  },

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
    const commitStatusAllowsTimeout =
      options.allowTimedOutCommitStatuses === true &&
      (tx.status === TRANSACTION_STATUS.PREPARED ||
        tx.status === TRANSACTION_STATUS.COMMITTING);

    if (!commitStatusAllowsTimeout && this.isTransactionBudgetExceeded(tx)) {
      return this.abortTimedOutTransaction(tx, tx.status);
    }

    if (
      tx.status === TRANSACTION_STATUS.ACTIVE ||
      tx.status === TRANSACTION_STATUS.FAILED
    ) {
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
          return this.abortTimedOutTransaction(
            tx,
            TRANSACTION_STATUS.PREPARING,
          );
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
      if (
        !commitStatusAllowsTimeout &&
        this.hasTimeoutFailure(commitFailures)
      ) {
        return this.abortTimedOutTransaction(
          tx,
          TRANSACTION_STATUS.COMMITTING,
        );
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
  },

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
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
    } else {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLED_BACK);
      this.transactionsBySession.delete(tx.sessionId);
    }

    return {
      success: rollbackFailures.length === 0,
      operation: QUERY_OPERATION.ROLLBACK,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: rollbackFailures,
      errorCode:
        rollbackFailures.length > 0 ?
          QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE :
          undefined,
      error:
        rollbackFailures.length > 0 ?
          QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE :
          undefined,
    };
  },

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
  },

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
    const failedParticipants =
      await this.workflowCoordinator.executeParticipantStage(
        tx.workflowId,
        transientStatus,
        successStatus,
        (partitionId) =>
          this.executeParticipantOperationWithRetry(
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
  },

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
      if (
        !skipBudgetEnforcement &&
        stage !== PARTICIPANT_STATUS.ROLLING_BACK &&
        this.isTransactionBudgetExceeded(tx)
      ) {
        throw this.createTransactionTimeoutError();
      }
      try {
        await operation(partitionId);
        return;
      } catch (error) {
        if (this.shouldTreatParticipantCommitMissAsSuccess(stage, error)) {
          return;
        }
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
        if (
          !skipBudgetEnforcement &&
          stage !== PARTICIPANT_STATUS.ROLLING_BACK &&
          this.isTransactionBudgetExceeded(tx)
        ) {
          throw this.createTransactionTimeoutError();
        }
        await this.sleep(retryDelayMs);
      }
    }
  },

  /**
   * Emit one structured participant retry diagnostic.
   * @param {Object} diagnostic - Retry diagnostic payload.
   * @private
   */

  emitParticipantRetryDiagnostic(diagnostic) {
    if (typeof this.onParticipantRetry === LOCAL_STR_FUNCTION) {
      this.onParticipantRetry(diagnostic);
    }
    if (diagnostic?.duringRecovery !== true) {
      return;
    }
    if (typeof this.logger?.warn === LOCAL_STR_FUNCTION) {
      this.logger.warn(PARTICIPANT_RETRY_LOG_MSG, diagnostic);
    }
  },

  /**
   * Compute bounded exponential backoff delay for participant retries.
   * @param {number} attempt - Retry attempt index (1-based).
   * @return {number} Delay in milliseconds.
   * @private
   */

  calculateParticipantRetryDelay(attempt) {
    const exponentialDelay =
      this.participantRetryBaseDelayMs * 2 ** Math.max(attempt - 1, 0);
    return Math.min(this.participantRetryMaxDelayMs, exponentialDelay);
  },
};

const {
  setTransactionStatus,
  getRemainingTransactionBudgetMs,
  isTransactionBudgetExceeded,
  abortTimedOutTransaction,
  runCommitProtocol,
  runRollbackProtocol,
  buildParticipantFailureResult,
  executeParticipantStage,
  executeParticipantOperationWithRetry,
  emitParticipantRetryDiagnostic,
  calculateParticipantRetryDelay,
} = distributedTransactionProtocolMethods;

export {
  setTransactionStatus,
  getRemainingTransactionBudgetMs,
  isTransactionBudgetExceeded,
  hasTimeoutFailure,
  abortTimedOutTransaction,
  runCommitProtocol,
  runRollbackProtocol,
  buildParticipantFailureResult,
  getPrepareParticipantKeys,
  getCommitParticipantKeys,
  getRollbackParticipantKeys,
  executeParticipantStage,
  executeParticipantOperationWithRetry,
  createTransactionTimeoutError,
  shouldTreatParticipantCommitMissAsSuccess,
  emitParticipantRetryDiagnostic,
  calculateParticipantRetryDelay,
};
