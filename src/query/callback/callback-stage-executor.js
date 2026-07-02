/**
 * CallbackStageExecutor — runs callbacks in batch/stage mode.
 *
 * Instead of invoking the callback per-row (RPC mode), this
 * executor groups rows by partition and invokes the callback
 * once per partition batch. Each invocation receives:
 *   - context: DistributedContext with local SQL + movement
 *   - partitionBatch: {partitionId, rows, rowCount}
 *   - options: optional execution options
 *
 * This prevents N+1 cross-partition chatter and enables the
 * engine to apply batching, backpressure, and budget controls.
 *
 * On retry, the executor consults a DedupeRegistry keyed by
 * lineage ID + stage ID to skip already-committed batches
 * and return cached results instead.
 *
 * Requirements: 4.1, 5.1, 9.3
 */

import {
  STAGE_STATE,
  STAGE_RESULT_FIELD as SF,
  STAGE_ARTIFACT_TYPE,
  STAGE_BATCH_ARTIFACT_TYPE,
  PARTITION_BATCH_FIELD as PBF,
  STAGE_ERROR_MSG,
} from './callback-stage-constants.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from '../guardrail-constants.js';

const LOG_EXECUTE_BATCH_FAILED = '_executeBatch failed';

/**
 * Group flat rows into partition batches.
 *
 * @param {Array<Object>} rows - Rows with partitionId field.
 * @param {string} partitionKey - Field name for partition ID.
 * @return {Array<Object>} Array of partition batch objects.
 */
function groupRowsByPartition(rows, partitionKey) {
  const map = new Map();
  for (const row of rows) {
    const pid = row[partitionKey];
    if (!map.has(pid)) {
      map.set(pid, []);
    }
    map.get(pid).push(row);
  }

  const batches = [];
  for (const [partitionId, partitionRows] of map) {
    batches.push({
      [PBF.PARTITION_ID]: partitionId,
      [PBF.ROWS]: partitionRows,
      [PBF.ROW_COUNT]: partitionRows.length,
    });
  }
  return batches;
}

/**
 * Validate that partition batches have the required shape.
 *
 * @param {Array<Object>} batches - Partition batch objects.
 * @return {{valid: boolean, errors: string[]}} Validation
 *   result.
 */
function validateBatches(batches) {
  const errors = [];

  if (!batches) {
    errors.push(STAGE_ERROR_MSG.BATCHES_REQUIRED);
    return {valid: false, errors};
  }
  if (!Array.isArray(batches)) {
    errors.push(STAGE_ERROR_MSG.BATCHES_MUST_BE_ARRAY);
    return {valid: false, errors};
  }

  for (const batch of batches) {
    if (!batch[PBF.PARTITION_ID]) {
      errors.push(STAGE_ERROR_MSG.BATCH_MISSING_PARTITION_ID);
    }
    if (!Array.isArray(batch[PBF.ROWS])) {
      errors.push(STAGE_ERROR_MSG.BATCH_MISSING_ROWS);
    }
  }

  return {valid: errors.length === 0, errors};
}

const nowMs = () => Date.now();

/**
 * CallbackStageExecutor runs a validated async callback once
 * per partition batch, collecting results per partition.
 *
 * When a dedupeRegistry is provided, the executor checks
 * each batch's lineage ID + stage ID before execution. If
 * the composite key was already committed, the cached result
 * is returned and the callback is not re-invoked.
 */
class CallbackStageExecutor {
  /**
   * @param {Object} options - Executor options.
   * @param {Function} options.callback - Validated async
   *   callback.
   * @param {Object} [options.contextFactory] - Factory that
   *   creates a DistributedContext per partition. Must have a
   *   createContext(partitionId) method.
   * @param {Object} [options.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs to stage artifacts.
   * @param {number} [options.stageIndex] - Stage index within
   *   the query for lineage ID generation.
   * @param {Object} [options.dedupeRegistry] - DedupeRegistry
   *   instance for retry deduplication by lineage + stage.
   * @param {Object} [options.cancellationToken] - Token for
   *   cooperative cancellation and timeout propagation.
   */
  constructor(options = {}) {
    if (!options.callback ||
        typeof options.callback !== 'function') {
      throw new Error(STAGE_ERROR_MSG.CALLBACK_REQUIRED);
    }
    this.callback = options.callback;
    this.contextFactory = options.contextFactory || null;
    this.lineageTracker = options.lineageTracker || null;
    this.stageIndex = options.stageIndex ?? 0;
    this.dedupeRegistry = options.dedupeRegistry || null;
    this.cancellationToken = options.cancellationToken || null;
    this.state = STAGE_STATE.PENDING;
  }

  /**
   * Execute the callback on each partition batch
   * sequentially.
   *
   * Requirement 4.1: DB.call runs fn on all partitions
   * selected by select — one invocation per partition batch.
   * Requirement 5.1: Cross-partition movement only through
   * explicit primitives on the context object.
   * Requirement 9.3: Deduplicate by lineage ID + stage ID
   * on retry to avoid duplicate side effects.
   * Requirement 9.5: Check cancellation token before each
   * batch and propagate cancellation across active stages.
   *
   * @param {Array<Object>} batches - Partition batch objects,
   *   each with {partitionId, rows, rowCount}.
   * @param {Object} [options] - Options forwarded to
   *   callback.
   * @return {Promise<Object>} Stage result with per-partition
   *   results array and aggregate state.
   */
  async execute(batches, options) {
    if (this.state === STAGE_STATE.RUNNING) {
      throw new Error(STAGE_ERROR_MSG.STAGE_ALREADY_RUNNING);
    }

    const batchValidation = validateBatches(batches);
    if (!batchValidation.valid) {
      throw new Error(batchValidation.errors[0]);
    }

    if (this.cancellationToken &&
        this.cancellationToken.isCancelled()) {
      this.state = STAGE_STATE.CANCELLED;
      return this._buildCancelledResult(batches);
    }

    this.state = STAGE_STATE.RUNNING;
    const partitionResults = [];
    let hasFailure = false;
    let wasCancelled = false;

    for (let i = 0; i < batches.length; i++) {
      if (this.cancellationToken &&
          this.cancellationToken.isCancelled()) {
        wasCancelled = true;
        break;
      }

      const partitionResult = await this._executeBatch(
        batches[i], options, i,
      );

      if (partitionResult[SF.STATE] ===
          STAGE_STATE.CANCELLED) {
        wasCancelled = true;
        partitionResults.push(partitionResult);
        break;
      }

      partitionResults.push(partitionResult);
      if (partitionResult[SF.STATE] === STAGE_STATE.FAILED) {
        hasFailure = true;
      }
    }

    if (wasCancelled) {
      this.state = STAGE_STATE.CANCELLED;
    } else {
      this.state = hasFailure ?
        STAGE_STATE.FAILED :
        STAGE_STATE.COMPLETED;
    }

    const stageResult = {
      partitionResults,
      [SF.STATE]: this.state,
      totalPartitions: batches.length,
      failedPartitions: partitionResults.filter(
        (r) => r[SF.STATE] === STAGE_STATE.FAILED,
      ).length,
    };

    if (this.lineageTracker) {
      this.lineageTracker.attachLineage(
        stageResult, this.stageIndex, STAGE_ARTIFACT_TYPE, 0,
      );
    }

    return stageResult;
  }

  /**
   * Execute the callback on a single partition batch.
   * If a dedupeRegistry is present and the lineage + stage
   * composite key was already committed, returns the cached
   * result without re-invoking the callback.
   * If the cancellation token fires during execution, the
   * batch result is marked CANCELLED.
   *
   * @param {Object} batch - Partition batch object.
   * @param {Object} [options] - Options forwarded to
   *   callback.
   * @param {number} batchIndex - Index of this batch.
   * @return {Promise<Object>} Per-partition result.
   * @private
   */
  async _executeBatch(batch, options, batchIndex) {
    const lineageId = this._batchLineageId(batchIndex);

    if (lineageId && this.dedupeRegistry) {
      const stageId = String(this.stageIndex);
      if (this.dedupeRegistry.isDuplicate(
        lineageId, stageId,
      )) {
        return this.dedupeRegistry.getResult(
          lineageId, stageId,
        );
      }
    }

    const startTime = nowMs();
    const partitionId = batch[PBF.PARTITION_ID];

    const context = this.contextFactory ?
      this.contextFactory.createContext(partitionId) :
      createDefaultContext(partitionId);

    try {
      const rows = await this.callback(
        context, batch, options,
      );

      if (this.cancellationToken &&
          this.cancellationToken.isCancelled()) {
        const duration = nowMs() - startTime;
        return this._cancelledBatchResult(
          partitionId, duration,
        );
      }

      const duration = nowMs() - startTime;

      const result = {
        [SF.PARTITION_ID]: partitionId,
        [SF.ROWS]: Array.isArray(rows) ? rows : [],
        [SF.ROW_COUNT]: Array.isArray(rows) ?
          rows.length : 0,
        [SF.STATE]: STAGE_STATE.COMPLETED,
        [SF.ERROR]: null,
        [SF.DURATION_MS]: duration,
      };

      if (this.lineageTracker) {
        this.lineageTracker.attachLineage(
          result, this.stageIndex, STAGE_BATCH_ARTIFACT_TYPE,
          batchIndex,
        );
      }

      this._registerDedupe(result, batchIndex);

      return result;
    } catch (err) {
      console.warn(LOG_EXECUTE_BATCH_FAILED, err.message);
      const duration = nowMs() - startTime;

      if (this.cancellationToken &&
          this.cancellationToken.isCancelled()) {
        return this._cancelledBatchResult(
          partitionId, duration,
        );
      }

      const result = {
        [SF.PARTITION_ID]: partitionId,
        [SF.ROWS]: [],
        [SF.ROW_COUNT]: 0,
        [SF.STATE]: STAGE_STATE.FAILED,
        [SF.ERROR]: err.message,
        [SF.DURATION_MS]: duration,
      };

      if (this.lineageTracker) {
        this.lineageTracker.attachLineage(
          result, this.stageIndex, STAGE_BATCH_ARTIFACT_TYPE,
          batchIndex,
        );
      }

      return result;
    }
  }

  /**
   * Build a cancelled stage result when the token is already
   * cancelled before execution begins.
   *
   * @param {Array<Object>} batches - Original batch list.
   * @return {Object} Stage result with CANCELLED state.
   * @private
   */
  _buildCancelledResult(batches) {
    const reason = this.cancellationToken ?
      this.cancellationToken.getReason() :
      ERR.CANCELLED;
    return {
      partitionResults: [],
      [SF.STATE]: STAGE_STATE.CANCELLED,
      totalPartitions: batches.length,
      failedPartitions: 0,
      cancelReason: reason,
    };
  }

  /**
   * Build a cancelled batch result for a single partition.
   *
   * @param {string} partitionId - Partition identifier.
   * @param {number} duration - Elapsed time in ms.
   * @return {Object} Per-partition result with CANCELLED state.
   * @private
   */
  _cancelledBatchResult(partitionId, duration) {
    const reason = this.cancellationToken ?
      this.cancellationToken.getReason() :
      ERR.CANCELLED;
    return {
      [SF.PARTITION_ID]: partitionId,
      [SF.ROWS]: [],
      [SF.ROW_COUNT]: 0,
      [SF.STATE]: STAGE_STATE.CANCELLED,
      [SF.ERROR]: reason,
      [SF.DURATION_MS]: duration,
    };
  }

  /**
   * Compute the lineage ID for a batch at the given index.
   *
   * @param {number} batchIndex - Batch index.
   * @return {string|null} Lineage ID or null if no tracker.
   * @private
   */
  _batchLineageId(batchIndex) {
    if (!this.lineageTracker) {
      return null;
    }
    return this.lineageTracker.generateLineageId(
      this.stageIndex, STAGE_BATCH_ARTIFACT_TYPE, batchIndex,
    );
  }

  /**
   * Register a successful batch result in the dedupe
   * registry keyed by lineage ID + stage ID.
   *
   * @param {Object} result - Completed batch result.
   * @param {number} batchIndex - Batch index.
   * @private
   */
  _registerDedupe(result, batchIndex) {
    if (!this.dedupeRegistry || !this.lineageTracker) {
      return;
    }
    const lineageId = this._batchLineageId(batchIndex);
    const stageId = String(this.stageIndex);
    this.dedupeRegistry.register(lineageId, stageId, result);
  }
}

/**
 * Create a minimal default context when no factory is
 * provided. Provides stub distributed movement primitives.
 *
 * @param {string} partitionId - Partition identifier.
 * @return {Object} Default DistributedContext stub.
 */
function createDefaultContext(partitionId) {
  return Object.freeze({
    partitionId,
    async emit(_key, _value) {},
    async lookup(_table, _keys) {
      return {rows: []};
    },
    async broadcast(_ref, _dataset) {},
    async useBroadcast(_ref) {
      return {rows: []};
    },
  });
}

export {
  CallbackStageExecutor,
  groupRowsByPartition,
  validateBatches,
  createDefaultContext,
};
