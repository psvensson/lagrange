import {v4 as uuidv4} from 'uuid';
import {NUM} from '../constants/index.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {KeyRange} from './key-range-manager.js';
import {
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_ERROR_MSG,
  SPLIT_MERGE_EVENT,
  SPLIT_MERGE_ID,
  SPLIT_MERGE_LOG_MSG,
  SPLIT_MERGE_REASON,
  SPLIT_MERGE_STATE,
  isDeferredPartitionTransitionOutcome,
} from './partition-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_EXECUTED = 'executed';
const LOCAL_STR_DEFERRED = 'deferred';
const LOCAL_STR_ERROR = 'error';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_SPLIT_PLAN = 'split_plan';

const OperationState = SPLIT_MERGE_STATE;
const REACTIVE_WRITE_ACTIVITY_EXECUTION_OPTIONS = Object.freeze({
  allowPressureDefer: false,
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
});

class PartitionSplitMergeManagerTransitionMethods {
  /**
   * Execute one split candidate when a runtime owner is provided.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object|null>} Execution result.
   * @private
   */
  async executeManagedSplitCandidate(partitionId, options = {}) {
    if (!partitionId ||
        !this.autoExecuteCandidates ||
        typeof this.executeSplitCandidate !== LOCAL_STR_FUNCTION) {
      return null;
    }
    const pressureDecision = this.evaluateSplitPressure();
    if (options?.bypassPressure !== true &&
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER) {
      return this.buildPressureDeferredExecution(
        partitionId,
        pressureDecision,
      );
    }
    this.allowManagedSplitDuringEvaluation = true;
    try {
      const executionOptions =
        options?.executionOptions &&
        typeof options.executionOptions === 'object' ?
          {...options.executionOptions} :
          {};
      if (options?.bypassPressure === true) {
        Object.assign(
          executionOptions,
          REACTIVE_WRITE_ACTIVITY_EXECUTION_OPTIONS,
        );
      }
      return await this.executeSplitCandidate(partitionId, executionOptions);
    } finally {
      this.allowManagedSplitDuringEvaluation = false;
    }
  }

  /**
   * Determine how one managed split execution should be classified.
   * @param {Object|null} execution - Managed split execution result.
   * @return {string} Outcome bucket: executed, deferred, or error.
   * @private
   */
  classifyManagedSplitExecution(execution) {
    if (!execution || execution.success === true) {
      return LOCAL_STR_EXECUTED;
    }
    if (isDeferredPartitionTransitionOutcome(execution.state)) {
      return LOCAL_STR_DEFERRED;
    }
    return LOCAL_STR_ERROR;
  }

  /**
   * Resolve a stable error message for a managed split execution.
   * @param {Object} execution - Managed split execution result.
   * @return {string} Error message.
   * @private
   */
  resolveManagedSplitExecutionError(execution) {
    if (typeof execution?.error === LOCAL_STR_STRING && execution.error.length > LOCAL_NUM_ZERO) {
      return execution.error;
    }
    return SPLIT_MERGE_ERROR_MSG.MANAGED_SPLIT_EXECUTION_FAILED;
  }

  /**
   * Resolve one deferred managed-split retry timestamp from execution output.
   * @param {Object} execution - Managed split execution result.
   * @return {number|null} Epoch milliseconds for next retry, or null.
   * @private
   */
  resolveManagedSplitExecutionRetryDueAtMs(execution) {
    const nextAttemptAt = String(
      execution?.retry?.nextAttemptAt ||
      execution?.nextAttemptAt ||
      '',
    );
    if (!nextAttemptAt) {
      return null;
    }
    const retryDueAtMs = Date.parse(nextAttemptAt);
    return Number.isFinite(retryDueAtMs) ? retryDueAtMs : null;
  }

  /**
   * Resolve a stable deferred-reason code for one managed split execution.
   * @param {Object} execution
   * @return {string}
   * @private
   */
  resolveManagedSplitExecutionDeferredReason(execution) {
    if (execution?.error === SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE) {
      return SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE;
    }
    return execution?.state || PARTITION_TRANSITION_STATE.DEFERRED;
  }

  /**
   * Flush deferred managed-split retry scheduling state and trigger
   * one reactive evaluation request.
   * @return {void}
   * @private
   */
  flushDeferredRetryEvaluation() {
    const request = this.deferredRetryEvaluation;
    this.deferredRetryEvaluation = null;
    this.deferredRetryEvaluationDueAtMs = null;
    this.deferredRetryEvaluationTimer = null;
    this.requestEvaluation(request || {
      reasonCode: SPLIT_MERGE_REASON.MANAGED_SPLIT_RETRY_DUE,
    });
  }

  /**
   * Schedule a reactive evaluation when a deferred managed split becomes due.
   * @param {string} partitionId - Candidate partition ID.
   * @param {Object} execution - Managed split execution result.
   * @return {void}
   * @private
   */
  scheduleDeferredManagedSplitRetry(partitionId, execution) {
    if (this.isShutdown) {
      return;
    }

    const retryDueAtMs =
      this.resolveManagedSplitExecutionRetryDueAtMs(execution);
    if (!Number.isFinite(retryDueAtMs)) {
      return;
    }
    const nowMs = Date.now();
    const normalizedDueAtMs = Math.max(nowMs, retryDueAtMs);
    this.deferredRetryEvaluation = this.mergeRequestedEvaluationContext(
      this.deferredRetryEvaluation,
      {
        reasonCode: SPLIT_MERGE_REASON.MANAGED_SPLIT_RETRY_DUE,
        partitionId,
      },
    );
    if (this.deferredRetryEvaluationTimer &&
        Number.isFinite(this.deferredRetryEvaluationDueAtMs) &&
        this.deferredRetryEvaluationDueAtMs <= normalizedDueAtMs) {
      return;
    }
    if (this.deferredRetryEvaluationTimer) {
      clearTimeout(this.deferredRetryEvaluationTimer);
      this.deferredRetryEvaluationTimer = null;
    }

    this.deferredRetryEvaluationDueAtMs = normalizedDueAtMs;
    const retryDelayMs = Math.max(NUM.ZERO, normalizedDueAtMs - nowMs);
    this.deferredRetryEvaluationTimer = setTimeout(() => {
      this.flushDeferredRetryEvaluation();
    }, retryDelayMs);
    this.deferredRetryEvaluationTimer.unref?.();
  }

  /**
   * Record one managed split execution in the canonical outcome bucket.
   * @param {Object} results - Evaluation results accumulator.
   * @param {string} partitionId - Candidate partition ID.
   * @param {Object|null} execution - Managed split execution result.
   * @private
   */
  recordManagedSplitExecutionOutcome(results, partitionId, execution) {
    if (!execution) {
      return;
    }

    const outcome = this.classifyManagedSplitExecution(execution);
    if (outcome === LOCAL_STR_EXECUTED) {
      results.executedSplits.push(execution);
      return;
    }

    if (outcome === LOCAL_STR_DEFERRED) {
      const deferredReason =
        this.resolveManagedSplitExecutionDeferredReason(execution);
      this.logger.warn(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_DEFERRED, {
        partitionId,
        state: execution.state || null,
        workflowId: execution.workflowId || null,
        error: execution.error || null,
        retryScheduled: execution.retryScheduled === true,
        nextAttemptAt:
          execution?.retry?.nextAttemptAt ||
          execution?.nextAttemptAt ||
          null,
        admissionDecisionType: execution?.admission?.decisionType || null,
        admissionBlockingReasons: Array.isArray(
          execution?.admission?.blockingReasons,
        ) ?
          execution.admission.blockingReasons :
          [],
      });
      results.splitDeferred.push({
        partitionId,
        reason: deferredReason,
        execution,
      });
      this.scheduleDeferredManagedSplitRetry(partitionId, execution);
      this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, {
        partitionId,
        reason: deferredReason,
      });
      return;
    }

    const error = this.resolveManagedSplitExecutionError(execution);
    this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_FAILED, {
      partitionId,
      error,
      state: execution.state || null,
      workflowId: execution.workflowId || null,
    });
    results.splitErrors.push({
      partitionId,
      error,
      state: execution.state || null,
      workflowId: execution.workflowId || null,
    });
  }

  /**
   * Split a partition at the median PRIMARY KEY value.
   * Creates two adjacent partitions from one.
   * @param {Object} options - Split options.
   * @param {string} options.partitionId - Partition to split.
   * @param {Object} options.partitionService - PartitionService instance.
   * @param {string} options.tableName - Table name.
   * @param {string} options.tableId - Table ID.
   * @param {string} options.primaryKeyColumn - PRIMARY KEY column name.
   * @return {Promise<Object>} Split result with left and right partition info.
   */
  async splitPartition(options) {
    const {
      partitionId,
      partitionService,
      tableName,
      tableId,
      primaryKeyColumn,
    } = options;

    const allowDuringEvaluation =
      this.state === OperationState.EVALUATING &&
      this.allowManagedSplitDuringEvaluation;
    if (this.state !== OperationState.IDLE && !allowDuringEvaluation) {
      throw new Error(SPLIT_MERGE_ERROR_MSG.managerBusy(this.state));
    }

    const restoreState = allowDuringEvaluation ?
      OperationState.EVALUATING :
      OperationState.IDLE;
    this.state = OperationState.SPLITTING;
    this.emit(SPLIT_MERGE_EVENT.SPLIT_STARTED, {partitionId});

    try {
      this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_SPLIT, {
        partitionId,
        tableName,
        primaryKeyColumn,
      });

      // Calculate median key
      const medianKey = await this.calculateMedianKey(
        partitionId,
        partitionService,
        tableName,
        primaryKeyColumn,
      );

      // Get current key range
      const currentRange = this.normalizeKeyRange(
        this.keyRangeManager ?
          this.keyRangeManager.getRange(partitionId) :
          partitionService.getKeyRange(),
      );

      if (!currentRange) {
        throw new Error(SPLIT_MERGE_ERROR_MSG.partitionRangeMissing(partitionId));
      }

      // Generate new partition IDs
      const leftPartitionId = `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}` +
        `${uuidv4().substring(NUM.ZERO, NUM.EIGHT)}${SPLIT_MERGE_ID.LEFT_SUFFIX}`;
      const rightPartitionId = `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}` +
        `${uuidv4().substring(NUM.ZERO, NUM.EIGHT)}${SPLIT_MERGE_ID.RIGHT_SUFFIX}`;

      // Create new key ranges
      const leftRange = new KeyRange(currentRange.start, medianKey);
      const rightRange = new KeyRange(medianKey, currentRange.end);

      // Validate ranges
      this.validateRangeIntegrity(leftRange, rightRange, currentRange);

      // Update key range manager if available
      if (this.keyRangeManager) {
        this.keyRangeManager.splitPartition(
          partitionId,
          medianKey,
          leftPartitionId,
          rightPartitionId,
        );
      }

      const result = {
        success: true,
        originalPartitionId: partitionId,
        medianKey,
        leftPartition: {
          partitionId: leftPartitionId,
          keyRange: leftRange.toObject(),
        },
        rightPartition: {
          partitionId: rightPartitionId,
          keyRange: rightRange.toObject(),
        },
        timestamp: Date.now(),
      };

      this.logger.info(SPLIT_MERGE_LOG_MSG.SPLIT_PLAN_COMPLETED, {
        partitionId,
        leftPartitionId,
        rightPartitionId,
        medianKey,
        phase: LOCAL_STR_SPLIT_PLAN,
      });

      this.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, result);
      return result;
    } catch (error) {
      this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_PLAN_FAILED, {
        partitionId,
        error: error.message,
        phase: LOCAL_STR_SPLIT_PLAN,
      });

      this.emit(SPLIT_MERGE_EVENT.SPLIT_FAILED, {partitionId, error: error.message});
      throw error;
    } finally {
      this.state = restoreState;
    }
  }


  /**
   * Merge two adjacent partitions into one.
   * Only merges partitions where left.end === right.start.
   * @param {Object} options - Merge options.
   * @param {string} options.leftPartitionId - Left partition ID.
   * @param {string} options.rightPartitionId - Right partition ID.
   * @param {string} options.tableId - Table ID.
   * @return {Promise<Object>} Merge result with merged partition info.
   */
  async mergePartitions(options) {
    const {leftPartitionId, rightPartitionId, tableId} = options;

    if (this.state !== OperationState.IDLE) {
      throw new Error(SPLIT_MERGE_ERROR_MSG.mergeManagerBusy(this.state));
    }

    this.state = OperationState.MERGING;
    this.emit(SPLIT_MERGE_EVENT.MERGE_STARTED, {leftPartitionId, rightPartitionId});

    try {
      this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_MERGE, {
        leftPartitionId,
        rightPartitionId,
      });

      // Get current key ranges
      if (!this.keyRangeManager) {
        throw new Error(SPLIT_MERGE_ERROR_MSG.KEY_RANGE_MANAGER_REQUIRED);
      }

      const leftRange = this.keyRangeManager.getRange(leftPartitionId);
      const rightRange = this.keyRangeManager.getRange(rightPartitionId);

      if (!leftRange) {
        throw new Error(SPLIT_MERGE_ERROR_MSG.leftPartitionMissing(leftPartitionId));
      }
      if (!rightRange) {
        throw new Error(SPLIT_MERGE_ERROR_MSG.rightPartitionMissing(rightPartitionId));
      }

      // Verify adjacency: left.end must equal right.start
      if (!leftRange.isAdjacentTo(rightRange)) {
        throw new Error(
          SPLIT_MERGE_ERROR_MSG.partitionsNotAdjacent(
            leftPartitionId,
            leftRange.end,
            rightPartitionId,
            rightRange.start,
          ),
        );
      }

      // Generate merged partition ID
      const mergedPartitionId = `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}` +
        `${uuidv4().substring(NUM.ZERO, NUM.EIGHT)}${SPLIT_MERGE_ID.MERGED_SUFFIX}`;

      // Create merged key range
      const mergedRange = new KeyRange(leftRange.start, rightRange.end);

      // Validate range integrity
      this.validateMergedRangeIntegrity(leftRange, rightRange, mergedRange);

      // Update key range manager
      this.keyRangeManager.mergePartitions(
        leftPartitionId,
        rightPartitionId,
        mergedPartitionId,
      );

      const result = {
        success: true,
        leftPartitionId,
        rightPartitionId,
        mergedPartition: {
          partitionId: mergedPartitionId,
          keyRange: mergedRange.toObject(),
        },
        timestamp: Date.now(),
      };

      this.logger.info(SPLIT_MERGE_LOG_MSG.MERGE_COMPLETED, {
        leftPartitionId,
        rightPartitionId,
        mergedPartitionId,
      });

      this.emit(SPLIT_MERGE_EVENT.MERGE_COMPLETED, result);
      return result;
    } catch (error) {
      this.logger.error(SPLIT_MERGE_LOG_MSG.MERGE_FAILED, {
        leftPartitionId,
        rightPartitionId,
        error: error.message,
      });

      this.emit(SPLIT_MERGE_EVENT.MERGE_FAILED, {
        leftPartitionId,
        rightPartitionId,
        error: error.message,
      });
      throw error;
    } finally {
      this.state = OperationState.IDLE;
    }
  }

  /**
   * Validate range integrity after split.
   * Ensures left and right ranges are contiguous and cover original range.
   * @param {KeyRange} leftRange - Left partition range.
   * @param {KeyRange} rightRange - Right partition range.
   * @param {KeyRange} originalRange - Original partition range.
   * @throws {Error} If range integrity is violated.
   */
  validateRangeIntegrity(leftRange, rightRange, originalRange) {
    // Left range must start where original started
    if (leftRange.start !== originalRange.start) {
      throw new Error(
        SPLIT_MERGE_ERROR_MSG.rangeIntegrityLeftStart(
          leftRange.start,
          originalRange.start,
        ),
      );
    }

    // Right range must end where original ended
    if (rightRange.end !== originalRange.end) {
      throw new Error(
        SPLIT_MERGE_ERROR_MSG.rangeIntegrityRightEnd(
          rightRange.end,
          originalRange.end,
        ),
      );
    }

    // Left end must equal right start (contiguous)
    if (!leftRange.isAdjacentTo(rightRange)) {
      throw new Error(
        SPLIT_MERGE_ERROR_MSG.rangeIntegrityNotContiguous(
          leftRange.end,
          rightRange.start,
        ),
      );
    }

    // Ranges must not overlap
    if (leftRange.overlaps(rightRange)) {
      throw new Error(SPLIT_MERGE_LOG_MSG.RANGE_INTEGRITY_OVERLAP);
    }

    this.logger.debug(SPLIT_MERGE_LOG_MSG.RANGE_VALID_AFTER_SPLIT, {
      leftStart: leftRange.start,
      leftEnd: leftRange.end,
      rightStart: rightRange.start,
      rightEnd: rightRange.end,
    });
  }

  /**
   * Validate range integrity after merge.
   * Ensures merged range covers both original ranges.
   * @param {KeyRange} leftRange - Left partition range.
   * @param {KeyRange} rightRange - Right partition range.
   * @param {KeyRange} mergedRange - Merged partition range.
   * @throws {Error} If range integrity is violated.
   */
  validateMergedRangeIntegrity(leftRange, rightRange, mergedRange) {
    // Merged range must start where left started
    if (mergedRange.start !== leftRange.start) {
      throw new Error(
        SPLIT_MERGE_ERROR_MSG.rangeIntegrityMergedStart(
          mergedRange.start,
          leftRange.start,
        ),
      );
    }

    // Merged range must end where right ended
    if (mergedRange.end !== rightRange.end) {
      throw new Error(
        SPLIT_MERGE_ERROR_MSG.rangeIntegrityMergedEnd(
          mergedRange.end,
          rightRange.end,
        ),
      );
    }

    this.logger.debug(SPLIT_MERGE_LOG_MSG.RANGE_VALID_AFTER_MERGE, {
      mergedStart: mergedRange.start,
      mergedEnd: mergedRange.end,
    });
  }
}

function createPartitionSplitMergeManagerTransitionMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(PartitionSplitMergeManagerTransitionMethods.prototype)) {
    if (name !== 'constructor') {
      methods[name] = PartitionSplitMergeManagerTransitionMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionSplitMergeManagerTransitionMethods};
