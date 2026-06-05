/**
 * ExecutorOutcomeEmitter — shared mechanism for executor-side components
 * to report typed outcomes to the workflow owner (RebalanceCoordinator).
 *
 * This replaces the triplicated updateOperationStep logic that previously
 * existed in ReplicaHandler, MessageGroupServiceHandler, and
 * RuntimeServiceHandler. Those handlers no longer write to
 * replica_operations directly; instead they emit typed outcome records
 * through this emitter.
 *
 * The coordinator consumes these outcomes through the owner-key reconcile
 * queue (wired in Task 3.2) and decides whether to transition the
 * workflow.
 *
 * Design reference: §2 — replica_operations single-writer cutover.
 */

import {EventEmitter} from 'events';
import {NUM} from '../constants/index.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_LOG_MSG,
} from './executor-outcome-constants.js';

const OUTCOME_EVENT_NAME = 'executorOutcome';

/**
 * Builds a typed executor outcome payload.
 *
 * @param {string} outcomeType - One of EXECUTOR_OUTCOME_TYPE values.
 * @param {string} operationId - The replica operation ID.
 * @param {string} workflowStep - The WORKFLOW_STEP the executor reached.
 * @param {Object} [options] - Optional fields.
 * @param {string} [options.replicaId] - Replica ID if applicable.
 * @param {string} [options.partitionId] - Partition ID if applicable.
 * @param {string} [options.errorMessage] - Error message if failed.
 * @param {string} [options.errorCode] - Canonical retry/failure code.
 * @param {number} [options.retryAfterMs] - Retry hint for retryable failures.
 * @param {boolean} [options.deferRetry] - Whether the failure is retryable.
 * @return {Object} Frozen outcome payload.
 */
function buildExecutorOutcome(
  outcomeType,
  operationId,
  workflowStep,
  options = {},
) {
  const outcome = {
    [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]: outcomeType,
    [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: operationId,
    [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: workflowStep,
    [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: Date.now(),
  };
  if (options.replicaId) {
    outcome[EXECUTOR_OUTCOME_FIELD.REPLICA_ID] = options.replicaId;
  }
  if (options.partitionId) {
    outcome[EXECUTOR_OUTCOME_FIELD.PARTITION_ID] = options.partitionId;
  }
  if (options.errorMessage) {
    outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE] =
      options.errorMessage;
  }
  if (options.errorCode) {
    outcome[EXECUTOR_OUTCOME_FIELD.ERROR_CODE] =
      options.errorCode;
  }
  if (
    Number.isFinite(options.retryAfterMs) &&
    options.retryAfterMs > NUM.ZERO
  ) {
    outcome[EXECUTOR_OUTCOME_FIELD.RETRY_AFTER_MS] =
      Math.floor(options.retryAfterMs);
  }
  if (options.deferRetry === true) {
    outcome[EXECUTOR_OUTCOME_FIELD.DEFER_RETRY] = true;
  }
  return Object.freeze(outcome);
}

/**
 * Shared executor outcome emitter.
 *
 * Executor handlers hold a reference to a single shared instance and
 * call {@link ExecutorOutcomeEmitter#emitOutcome} instead of writing
 * to replica_operations. The coordinator subscribes to the
 * `executorOutcome` event.
 */
class ExecutorOutcomeEmitter extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
  }

  /**
   * Emit a typed executor outcome.
   *
   * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
   * @param {string} operationId - Replica operation ID.
   * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
   * @param {Object} [options] - Optional replicaId and retry metadata.
   */
  emitOutcome(outcomeType, operationId, workflowStep, options = {}) {
    if (!operationId) {
      this.logger.debug(
        EXECUTOR_OUTCOME_LOG_MSG.OUTCOME_EMIT_SKIPPED,
        {outcomeType, workflowStep},
      );
      return;
    }

    const outcome = buildExecutorOutcome(
      outcomeType,
      operationId,
      workflowStep,
      options,
    );

    this.logger.debug(EXECUTOR_OUTCOME_LOG_MSG.OUTCOME_EMITTED, {
      outcomeType: outcome.outcomeType,
      operationId: outcome.operationId,
      workflowStep: outcome.workflowStep,
      replicaId: outcome.replicaId,
    });

    this.emit(OUTCOME_EVENT_NAME, outcome);
  }
}

export {
  ExecutorOutcomeEmitter,
  buildExecutorOutcome,
  OUTCOME_EVENT_NAME,
};
