import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {getRemainingBudgetMs} from '../../control-plane/timeout-budget.js';
import {
  PARTICIPANT_COMMIT_OUTCOME,
} from '../../constants/index.js';
import {
  IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES,
  PARTICIPANT_ANSWER_DISPOSITION,
  PARTICIPANT_ANSWER_DISPOSITION_FIELD,
  PARTICIPANT_RETRY_LOG_MSG,
  PARTICIPANT_STATUS,
  TIMEOUT_ERROR_MESSAGES,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {PARTICIPANT_TRANSACTION_DECISION} from
  '../../partition/partition-participant-transaction-constants.js';
import {participantIdentityOf} from './distributed-transaction-identity.js';
import {
  readWaitClock,
  reportWaitBoundSpent,
} from '../../logging/wait-bound-spent.js';
import {noteCommitPoint} from './distributed-transaction-commit-point.js';

const LOCAL_STR_FUNCTION = 'function';
const TRANSACTION_BUDGET_WAIT = Object.freeze({
  wait: 'TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS',
  awaited: 'distributed transaction commit protocol completion',
});
const PARTICIPANT_RETRY_WAIT = Object.freeze({
  wait: 'PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES',
  awaited: 'participant stage operation success',
});
const COMMIT_MISS_RESOLUTION = Object.freeze({
  NOT_A_MISS: 'NOT_A_MISS',
  COMMITTED: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
  NOT_COMMITTED: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
  UNKNOWN: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
});
const PARTICIPANT_COMMIT_OUTCOME_FIELD = 'participantCommitOutcome';
const SCHEMA_MIGRATION_CUTOVER_SESSION_PREFIX = 'schema-migration-cutover-';

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
 * Resolve prepare-stage participant keys: every participant whose PREPARE
 * evidence this coordinator has not retained (a PREPARED participant row
 * recovered without its digest is asked again under the same identity; the
 * participant answers a PREPARED row from the row).
 * @param {Object} tx - Transaction state.
 * @return {string[]} Participant keys.
 * @private
 */

function getPrepareParticipantKeys(tx) {
  return Array.from(tx.participants.values())
    .filter(
      (participant) =>
        participant.status !== PARTICIPANT_STATUS.COMMITTED &&
        !(participant.status === PARTICIPANT_STATUS.PREPARED &&
          participant.prepareEvidenceRetained === true),
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
 * Whether a participant COMMIT failed as a commit miss (the participant no
 * longer holds the transaction): its outcome is then read from the
 * participant's durable row, never assumed (seam D, S2).
 * @param {string} stage
 * @param {Error|Object} error
 * @return {boolean}
 * @private
 */

function isParticipantCommitMiss(stage, error) {
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

/**
 * Count participants per status (small last-observed summary).
 * @param {Object} tx - Transaction state.
 * @return {Object} status -> count.
 * @private
 */

function countParticipantStatuses(tx) {
  const counts = {};
  for (const participant of tx.participants?.values?.() || []) {
    counts[participant.status] = (counts[participant.status] || 0) + 1;
  }
  return counts;
}

/**
 * Report a spent transaction budget (or a participant-timeout abort).
 * @param {Object} owner - Coordinator.
 * @param {Object} tx - Transaction state.
 * @param {string} stage - Stage where the abort was decided.
 * @private
 */

function reportTransactionBudgetSpent(owner, tx, stage) {
  const nowMs = owner.now();
  reportWaitBoundSpent(owner.logger, {
    ...TRANSACTION_BUDGET_WAIT,
    boundMs: tx.timeoutBudget?.configuredBudgetMs ??
      owner.transactionBudgetMs,
    elapsedMs: Number.isFinite(tx.createdAt) ? nowMs - tx.createdAt : null,
    lastObserved: () => ({
      stage,
      status: tx.status,
      commitMode: tx.commitMode,
      remainingBudgetMs: owner.getRemainingTransactionBudgetMs(tx),
      participantStatuses: countParticipantStatuses(tx),
    }),
    scope: {transactionId: tx.transactionId, sessionId: tx.sessionId},
  });
}

/**
 * Report exhausted participant-operation retries.
 * @param {Object} owner - Coordinator.
 * @param {Object} spent - {tx, stage, partitionId, attempt, error,
 *   startedAtMs}.
 * @private
 */

function reportParticipantRetriesSpent(owner, spent) {
  reportWaitBoundSpent(owner.logger, {
    ...PARTICIPANT_RETRY_WAIT,
    boundMs: null,
    elapsedMs: owner.now() - spent.startedAtMs,
    lastObserved: () => ({
      stage: spent.stage,
      maxRetries: owner.participantRetryMaxRetries,
      attempts: spent.attempt + 1,
      lastError: spent.error?.message || String(spent.error),
      lastErrorCode: spent.error?.errorCode || spent.error?.code || null,
    }),
    scope: {
      transactionId: spent.tx.transactionId,
      partitionId: spent.partitionId,
    },
  });
}

// The typed fields a participant failure carries onto the coordinator's
// failed-participant entries (the participant wire owner names them).
const PARTICIPANT_FAILURE_FIELDS = Object.freeze([
  'failureCode',
  'refusalCause',
  'outcome',
  'state',
  PARTICIPANT_ANSWER_DISPOSITION_FIELD,
]);

function participantFailureFieldsOf(error) {
  const fields = {};
  for (const field of PARTICIPANT_FAILURE_FIELDS) {
    const value = error?.[field];
    if (typeof value === 'string' && value.length > 0) {
      fields[field] = value;
    }
  }
  return fields;
}

// Whether a failed attempt is retried: a definitive refusal never is; an
// answer to be asked again (DEFER) or one whose outcome is unknown is retried
// within the transaction budget while the stage enforces it; anything else
// within the bounded attempts.
function isRetriedParticipantFailure(owner, error, attempt, budgetBound) {
  const disposition = error?.[PARTICIPANT_ANSWER_DISPOSITION_FIELD];
  if (disposition === PARTICIPANT_ANSWER_DISPOSITION.REFUSED) {
    return false;
  }
  if (budgetBound && (disposition === PARTICIPANT_ANSWER_DISPOSITION.DEFER ||
      disposition === PARTICIPANT_ANSWER_DISPOSITION.UNKNOWN)) {
    return true;
  }
  return attempt < owner.participantRetryMaxRetries;
}

const distributedTransactionProtocolMethods = {
  async setTransactionStatus(tx, status) {
    const previousStatus = tx.status;
    const previousUpdatedAt = tx.updatedAt;
    noteCommitPoint(tx, status);
    tx.status = status;
    tx.updatedAt = this.now();
    try {
      await this.persistTransactionRecord(tx);
    } catch (error) {
      tx.status = previousStatus;
      tx.updatedAt = previousUpdatedAt;
      throw error;
    }
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
   * Abort one undecided transaction whose timeout budget is spent: the
   * rollback protocol records a bound ROLLBACK decision before its fanout
   * whenever a PREPARE may have been sent (seam C). A transaction whose
   * COMMIT is decided is never rolled back: the budget bounds the caller's
   * wait, not the decision, and recovery drives the COMMIT forward.
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Protocol stage where timeout happened.
   * @return {Promise<Object>} Timeout failure payload.
   * @private
   */

  async abortTimedOutTransaction(tx, stage) {
    reportTransactionBudgetSpent(this, tx, stage);
    if (tx.decision?.decision === PARTICIPANT_TRANSACTION_DECISION.COMMIT) {
      return this.driveTransactionDecision(tx, null);
    }
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
   * The operation receives the partition and its participant record; a
   * failed participant's entry carries the typed fields its failure named.
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
    const typedFailures = new Map();
    const runStageForKeys = (keysOption) =>
      this.workflowCoordinator.executeParticipantStage(
        tx.workflowId,
        transientStatus,
        successStatus,
        (partitionId, participant) =>
          this.executeParticipantOperationWithRetry(
            tx,
            transientStatus,
            partitionId,
            (attemptPartitionId) => operation(attemptPartitionId, participant),
            {
              skipBudgetEnforcement: options.skipBudgetEnforcement === true,
            },
          ).catch((error) => {
            typedFailures.set(partitionId, participantFailureFieldsOf(error));
            throw error;
          }),
        keysOption ? {...stageOptions, participantKeys: keysOption} : stageOptions,
      );
    const resolvedKeys = Array.isArray(options.participantKeys) &&
      options.participantKeys.length > 0 ?
      options.participantKeys :
      Array.from(tx.participants?.keys?.() || []);
    const useConcurrentStage = resolvedKeys.length > 1 &&
      !String(tx?.sessionId || '').startsWith(
        SCHEMA_MIGRATION_CUTOVER_SESSION_PREFIX,
      );
    const failedParticipants = useConcurrentStage ?
      (await Promise.all(resolvedKeys.map((key) => runStageForKeys([key])))).flat() :
      await runStageForKeys(null);
    return failedParticipants.map((entry) => ({
      partitionId: entry.participantKey,
      error: entry.error,
      ...(typedFailures.get(entry.participantKey) || {}),
    }));
  },

  /**
   * Execute one participant operation with bounded retry. A definitive
   * participant refusal is never retried; a deferred or unknown answer is
   * asked again under the same identity within the transaction budget while
   * the stage enforces it; any other failure within the bounded attempts.
   *
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Participant stage.
   * @param {string} partitionId - Participant partition ID.
   * @param {Function} operation - Participant callback.
   * @param {Object} [options] - Retry options.
   * @param {boolean} [options.skipBudgetEnforcement] - Skip budget timeout
   *   checks before attempts and retries.
   * @return {Promise<*>} What the participant operation resolved with.
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
    const startedAtMs = readWaitClock(this);
    const skipBudgetEnforcement = options.skipBudgetEnforcement === true;
    const budgetBound = !skipBudgetEnforcement &&
      stage !== PARTICIPANT_STATUS.ROLLING_BACK;
    while (true) {
      if (budgetBound && this.isTransactionBudgetExceeded(tx)) {
        throw this.createTransactionTimeoutError();
      }
      try {
        return await operation(partitionId);
      } catch (error) {
        const commitMissResolution =
          await this.resolveParticipantCommitMiss(
            tx,
            stage,
            partitionId,
            error,
          );
        if (commitMissResolution === COMMIT_MISS_RESOLUTION.COMMITTED) {
          return commitMissResolution;
        }
        if (commitMissResolution === COMMIT_MISS_RESOLUTION.NOT_COMMITTED) {
          error[PARTICIPANT_COMMIT_OUTCOME_FIELD] =
            PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED;
          throw error;
        }
        if (commitMissResolution === COMMIT_MISS_RESOLUTION.UNKNOWN) {
          error[PARTICIPANT_COMMIT_OUTCOME_FIELD] =
            PARTICIPANT_COMMIT_OUTCOME.UNKNOWN;
        }
        if (!isRetriedParticipantFailure(this, error, attempt, budgetBound)) {
          reportParticipantRetriesSpent(this, {
            tx, stage, partitionId, attempt, error, startedAtMs,
          });
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
        if (budgetBound && this.isTransactionBudgetExceeded(tx)) {
          throw this.createTransactionTimeoutError();
        }
        await this.sleep(retryDelayMs);
      }
    }
  },

  /**
   * Resolve a participant COMMIT miss by the participant's durable outcome,
   * in every commit mode (seam D, S2): COMMITTED settles the participant,
   * NOT_COMMITTED is definitive, and UNKNOWN (absence, a PREPARED row, a
   * failed read, no reader) is never taken as COMMITTED.
   * @param {Object} tx - Transaction state.
   * @param {string} stage - Participant stage.
   * @param {string} partitionId - Participant partition ID.
   * @param {Error|Object} error - The failed COMMIT.
   * @return {Promise<string>} A COMMIT_MISS_RESOLUTION.
   * @private
   */
  async resolveParticipantCommitMiss(tx, stage, partitionId, error) {
    if (!isParticipantCommitMiss(stage, error)) {
      return COMMIT_MISS_RESOLUTION.NOT_A_MISS;
    }
    if (typeof this.resolveParticipantCommitOutcome !== LOCAL_STR_FUNCTION) {
      return COMMIT_MISS_RESOLUTION.UNKNOWN;
    }
    const outcome = await this.resolveParticipantCommitOutcome(
      tx.sessionId,
      partitionId,
      participantIdentityOf(tx, partitionId),
    );
    return Object.values(PARTICIPANT_COMMIT_OUTCOME).includes(outcome) ?
      outcome :
      COMMIT_MISS_RESOLUTION.UNKNOWN;
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
  buildParticipantFailureResult,
  executeParticipantStage,
  executeParticipantOperationWithRetry,
  resolveParticipantCommitMiss,
  emitParticipantRetryDiagnostic,
  calculateParticipantRetryDelay,
} = distributedTransactionProtocolMethods;

export {
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
  reportTransactionBudgetSpent,
  resolveParticipantCommitMiss,
  createTransactionTimeoutError,
  emitParticipantRetryDiagnostic,
  calculateParticipantRetryDelay,
};
