/**
 * Callback_Execution_Host — single invocation surface for
 * partition callback execution.
 *
 * This is the ONLY callback invocation path. No parallel
 * callback executor is allowed outside this host.
 *
 * Contract:
 * 1. Validate callback descriptor and runtime selection
 * 2. Invoke callback for each partition batch using the
 *    selected runtime driver
 * 3. Apply budget/cancellation checks before and after
 *    each batch invocation
 * 4. Attach lineage IDs and consult dedupe registry on
 *    retries
 * 5. Return structured per-partition batch results
 *
 * Requirements: 1.3, 14.2, 14.3
 */

import {NUM, TYPEOF, METRICS_LOG_TAG} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  CALLBACK_RUNTIME_KIND,
} from './sql-adapter-constants.js';
import {
  STAGE_STATE,
  STAGE_RESULT_FIELD as SF,
  CALLBACK_TELEMETRY_EVENT as CTE,
  CALLBACK_TELEMETRY_FIELD as CTF,
  BYTE_ESTIMATE_MULTIPLIER,
} from './callback-stage-constants.js';
import {buildCallbackContext} from './callback-context.js';
import {DebugEmitter} from '../debug/debug-emitter.js';
import {DEBUG_TRACE_SOURCE} from '../debug/debug-constants.js';

const SUBSYSTEM = 'callback-execution-host';

/**
 * Set of runtime kinds supported for callback execution.
 * oci_container is feature-gated and rejected by default.
 * @type {Set<string>}
 */
const SUPPORTED_RUNTIME_KINDS = new Set([
  CALLBACK_RUNTIME_KIND.NATIVE_JS,
  CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
  CALLBACK_RUNTIME_KIND.OCI_CONTAINER,
]);

/**
 * Validate a callback descriptor has required fields.
 *
 * @param {object} descriptor - Callback descriptor.
 * @throws {Error} If descriptor is invalid.
 */
function validateDescriptor(descriptor) {
  if (!descriptor) {
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_DESCRIPTOR_REQUIRED,
    );
  }
  if (!descriptor.callbackModuleRef) {
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_MODULE_REF_REQUIRED,
    );
  }
  if (!descriptor.callbackExport) {
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_EXPORT_REQUIRED,
    );
  }
  if (!descriptor.runtimeKind) {
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_RUNTIME_KIND_REQUIRED,
    );
  }
  if (!SUPPORTED_RUNTIME_KINDS.has(descriptor.runtimeKind)) {
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME +
      descriptor.runtimeKind,
    );
  }
}

/**
 * Callback_Execution_Host — the single callback invocation
 * surface for partition_callback execution mode.
 *
 * Reuses runtime-driver ownership for callback invocation
 * instead of creating a parallel callback engine.
 */
class CallbackExecutionHost {
  /**
   * @param {object} deps
   * @param {object} [deps.budgetEnforcer] - BudgetEnforcer
   *   instance for pre/post invocation budget checks.
   * @param {object} [deps.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs.
   * @param {object} [deps.dedupeRegistry] - DedupeRegistry
   *   instance for retry deduplication.
   * @param {object} [deps.cancellationToken] - Token for
   *   cooperative cancellation and timeout propagation.
   * @param {number} [deps.stageIndex=0] - Stage index for
   *   lineage ID generation.
   * @param {object} [deps.runtimeDriverRegistry] - Registry
   *   mapping runtime kinds to driver instances.
   * @param {import('./execution-context.js').ExecutionContext}
   *   [deps.executionContext] - Parent execution context for
   *   building bounded callback contexts with primitives and
   *   nested-call guardrails (Requirement 14.4).
   * @param {import('./plan-diagnostics.js').PlanDiagnostics}
   *   [deps.planDiagnostics] - Optional diagnostics collector
   *   for nested call classification decisions.
   * @param {Function} [deps.onTelemetry] - Telemetry callback
   *   invoked with per-batch and aggregate telemetry events.
   *   Follows the same onTelemetry pattern used by lookup,
   *   emit, and broadcast primitives.
   */
  constructor(deps = {}) {
    this.budgetEnforcer = deps.budgetEnforcer || null;
    this.lineageTracker = deps.lineageTracker || null;
    this.dedupeRegistry = deps.dedupeRegistry || null;
    this.cancellationToken = deps.cancellationToken || null;
    this.stageIndex = deps.stageIndex ?? NUM.ZERO;
    this.runtimeDriverRegistry =
      deps.runtimeDriverRegistry || null;
    this.executionContext = deps.executionContext || null;
    this.planDiagnostics = deps.planDiagnostics || null;
    this.onTelemetry = deps.onTelemetry || null;
    this.debugSessionResolver = deps.debugSessionResolver || null;
    this.traceCollector = deps.traceCollector || null;
    this.nodeId = deps.nodeId || null;
    this.serviceDefinitionId = deps.serviceDefinitionId || null;
    this.replicaId = deps.replicaId || null;
    this.logger = this._initLogger();
  }

  /**
   * Initialize logger with fallback to console.
   * @return {object} Logger instance.
   * @private
   */
  _initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(SUBSYSTEM);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Execute callback on each partition batch through the
   * single invocation contract.
   *
   * @param {Array<object>} batches - Per-partition batches,
   *   each with {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor:
   *   {callbackModuleRef, callbackExport, runtimeKind}.
   * @param {object} [options] - Execution options forwarded
   *   to the runtime driver.
   * @return {Promise<object>} Aggregated result with
   *   per-partition results, state, and counts.
   */
  async execute(batches, descriptor, options = {}) {
    // 1. Validate inputs
    if (!batches || !Array.isArray(batches)) {
      throw new Error(
        ADAPTER_ERROR_MSG.CALLBACK_HOST_BATCHES_REQUIRED,
      );
    }
    validateDescriptor(descriptor);

    // 2. Check cancellation before starting
    if (this._isCancelled()) {
      const cancelResult = this._buildCancelledResult(batches);
      this._emitTelemetry({
        [CTF.EVENT_TYPE]: CTE.CANCELLED,
        [CTF.TOTAL_BATCHES]: NUM.ZERO,
        [CTF.TOTAL_ROWS]: NUM.ZERO,
        [CTF.TOTAL_BYTES]: NUM.ZERO,
        [CTF.TOTAL_DURATION_MS]: NUM.ZERO,
        [CTF.STATE]: STAGE_STATE.CANCELLED,
      });
      return cancelResult;
    }

    // 3. Check budget before starting
    this._checkBudget();

    this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_EXECUTING, {
      batchCount: batches.length,
      callbackModuleRef: descriptor.callbackModuleRef,
      callbackExport: descriptor.callbackExport,
      runtimeKind: descriptor.runtimeKind,
    });

    // 4. Process each batch sequentially
    const partitionResults = [];
    let hasFailure = false;
    let wasCancelled = false;
    let totalRows = NUM.ZERO;
    let totalBytes = NUM.ZERO;
    let totalDurationMs = NUM.ZERO;

    for (let i = NUM.ZERO; i < batches.length; i++) {
      if (this._isCancelled()) {
        wasCancelled = true;
        break;
      }

      const result = await this._executeBatch(
        batches[i], descriptor, options, i,
      );

      if (result[SF.STATE] === STAGE_STATE.CANCELLED) {
        wasCancelled = true;
        partitionResults.push(result);
        break;
      }

      totalRows += result[SF.ROW_COUNT] || NUM.ZERO;
      totalBytes += result.byteEstimate || NUM.ZERO;
      totalDurationMs += result[SF.DURATION_MS] || NUM.ZERO;

      partitionResults.push(result);
      if (result[SF.STATE] === STAGE_STATE.FAILED) {
        hasFailure = true;
      }
    }

    // 5. Determine aggregate state
    let state;
    if (wasCancelled) {
      state = STAGE_STATE.CANCELLED;
    } else if (hasFailure) {
      state = STAGE_STATE.FAILED;
    } else {
      state = STAGE_STATE.COMPLETED;
    }

    const stageResult = {
      partitionResults,
      [SF.STATE]: state,
      totalPartitions: batches.length,
      processedPartitions: partitionResults.length,
      failedPartitions: partitionResults.filter(
        (r) => r[SF.STATE] === STAGE_STATE.FAILED,
      ).length,
      totalRows,
      totalBytes,
      totalDurationMs,
    };

    // Emit aggregate throughput metrics
    try {
      this.logger.info(METRICS_LOG_TAG.CALLBACK_THROUGHPUT, {
        batchCount: batches.length,
        totalRows,
        totalBytes,
        totalDurationMs,
        rowsPerSecond: totalDurationMs > 0 ?
          Math.round(totalRows / (totalDurationMs / 1000)) : 0,
        avgBatchDurationMs: batches.length > 0 ?
          Math.round(totalDurationMs / batches.length) : 0,
        failedPartitions: stageResult.failedPartitions,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }

    // Attach lineage to aggregate result
    if (this.lineageTracker) {
      this.lineageTracker.attachLineage(
        stageResult, this.stageIndex,
        'callback_host', NUM.ZERO,
      );
    }

    // Emit aggregate telemetry
    this._emitTelemetry({
      [CTF.EVENT_TYPE]: wasCancelled ?
        CTE.CANCELLED : CTE.EXECUTION_COMPLETE,
      [CTF.TOTAL_BATCHES]: partitionResults.length,
      [CTF.TOTAL_ROWS]: totalRows,
      [CTF.TOTAL_BYTES]: totalBytes,
      [CTF.TOTAL_DURATION_MS]: totalDurationMs,
      [CTF.STATE]: state,
    });

    this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_COMPLETE, {
      state,
      totalPartitions: batches.length,
      processedPartitions: partitionResults.length,
    });

    return stageResult;
  }

  /**
   * Execute callback on a single partition batch.
   *
   * Checks dedupe registry before invocation. Attaches
   * lineage IDs and registers results for retry safety.
   *
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor.
   * @param {object} options - Execution options.
   * @param {number} batchIndex - Index of this batch.
   * @return {Promise<object>} Per-partition result.
   * @private
   */
  async _executeBatch(batch, descriptor, options, batchIndex) {
    const lineageId = this._batchLineageId(batchIndex);
    const partitionId = batch.partitionId;

    // Dedupe check: skip if already processed on retry
    if (lineageId && this.dedupeRegistry) {
      const stageId = String(this.stageIndex);
      if (this.dedupeRegistry.isDuplicate(
        lineageId, stageId,
      )) {
        this._emitTelemetry({
          [CTF.EVENT_TYPE]: CTE.DEDUPE_SKIP,
          [CTF.PARTITION_ID]: partitionId,
          [CTF.BATCH_INDEX]: batchIndex,
        });
        return this.dedupeRegistry.getResult(
          lineageId, stageId,
        );
      }
    }

    // Pre-invocation budget check
    this._checkBudget();

    const startTime = Date.now();

    try {
      // Invoke callback through runtime driver interface.
      const rows = await this._invokeCallback(
        batch, descriptor, options, batchIndex,
      );

      // Post-invocation cancellation check
      if (this._isCancelled()) {
        const duration = Date.now() - startTime;
        return this._cancelledBatchResult(
          partitionId, duration,
        );
      }

      // Post-invocation budget check
      this._checkBudget();

      const duration = Date.now() - startTime;
      const rowArr = Array.isArray(rows) ? rows : [];
      const byteEstimate = this._estimateBytes(rowArr);

      // Record output bytes in budget enforcer
      if (this.budgetEnforcer && byteEstimate > NUM.ZERO) {
        this.budgetEnforcer.recordOutBytes(byteEstimate);
      }

      const result = {
        [SF.PARTITION_ID]: partitionId,
        [SF.ROWS]: rowArr,
        [SF.ROW_COUNT]: rowArr.length,
        [SF.STATE]: STAGE_STATE.COMPLETED,
        [SF.ERROR]: null,
        [SF.DURATION_MS]: duration,
        byteEstimate,
      };

      // Attach lineage to batch result
      if (this.lineageTracker) {
        this.lineageTracker.attachLineage(
          result, this.stageIndex,
          'callback_batch', batchIndex,
        );
      }

      // Register in dedupe registry for retry safety
      this._registerDedupe(result, batchIndex);

      // Emit per-batch telemetry
      this._emitTelemetry({
        [CTF.EVENT_TYPE]: CTE.BATCH_COMPLETE,
        [CTF.PARTITION_ID]: partitionId,
        [CTF.BATCH_INDEX]: batchIndex,
        [CTF.ROW_COUNT]: rowArr.length,
        [CTF.BYTE_ESTIMATE]: byteEstimate,
        [CTF.DURATION_MS]: duration,
      });

      this.logger.debug(
        ADAPTER_LOG_MSG.CALLBACK_HOST_BATCH_COMPLETE, {
          partitionId,
          rowCount: result[SF.ROW_COUNT],
          durationMs: duration,
        },
      );

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;

      if (this._isCancelled()) {
        return this._cancelledBatchResult(
          partitionId, duration,
        );
      }

      // Emit failure telemetry
      this._emitTelemetry({
        [CTF.EVENT_TYPE]: CTE.BATCH_FAILED,
        [CTF.PARTITION_ID]: partitionId,
        [CTF.BATCH_INDEX]: batchIndex,
        [CTF.DURATION_MS]: duration,
        [CTF.ERROR]: err.message,
      });

      this.logger.debug(
        ADAPTER_LOG_MSG.CALLBACK_HOST_BATCH_FAILED, {
          partitionId,
          error: err.message,
          durationMs: duration,
        },
      );

      return {
        [SF.PARTITION_ID]: partitionId,
        [SF.ROWS]: [],
        [SF.ROW_COUNT]: NUM.ZERO,
        [SF.STATE]: STAGE_STATE.FAILED,
        [SF.ERROR]: err.message,
        [SF.DURATION_MS]: duration,
        byteEstimate: NUM.ZERO,
      };
    }
  }

  /**
   * Invoke the callback through the runtime driver interface.
   *
   * Uses the runtime driver registry as the single
   * invocation path. No fallback handler path is allowed.
   *
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor.
   * @param {object} options - Execution options.
   * @param {number} batchIndex - Batch index.
   * @return {Promise<Array>} Result rows from callback.
   * @private
   */
  async _invokeCallback(batch, descriptor, options, batchIndex) {
    if (this.runtimeDriverRegistry) {
      const driver = this.runtimeDriverRegistry.getDriver(
        descriptor.runtimeKind,
      );

      // Build bounded callback context when an execution
      // context is available. This ensures callback handlers
      // receive the same primitive surface (lookup, emit,
      // broadcast, out) and nested-call guardrails as stage
      // runtime handlers (Requirement 14.4).
      let callbackCtx = null;
      const debugScope = {
        lineageId: this._batchLineageId(batchIndex),
        stageId: this.stageIndex,
        partitionId: batch.partitionId,
        callbackExport: descriptor.callbackExport,
        serviceDefinitionId:
          options?.serviceDefinitionId || this.serviceDefinitionId || null,
        nodeId: options?.nodeId || this.nodeId || null,
        replicaId: options?.replicaId || this.replicaId || null,
        runtimeKind: descriptor.runtimeKind,
        source: DEBUG_TRACE_SOURCE.PARTITION_CALLBACK,
      };
      const traceApi = this._buildTraceApi(debugScope, descriptor);
      if (this.executionContext) {
        callbackCtx = buildCallbackContext(
          this.executionContext,
          this.planDiagnostics,
          traceApi,
        );
      }
      const debugApi = traceApi ? {
        trace: traceApi.trace,
      } : null;

      return driver.invokeCallback(
        batch, descriptor,
        {...options, callbackContext: callbackCtx, debugScope, debug: debugApi},
      );
    }

    // No runtime driver registry — cannot invoke.
    // The registry is the single owner for runtime-kind
    // selection; no fallback handler path exists.
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME +
      descriptor.runtimeKind,
    );
  }

  /**
   * Build callback trace API when tracing is active.
   * @param {Object} debugScope
   * @param {Object} descriptor
   * @return {Object|null}
   * @private
   */
  _buildTraceApi(debugScope, descriptor) {
    if (!this.debugSessionResolver || !this.traceCollector) {
      return null;
    }
    const emitter = new DebugEmitter({
      sessionResolver: this.debugSessionResolver,
      traceCollector: this.traceCollector,
      nodeId: debugScope.nodeId || null,
      serviceDefinitionId: debugScope.serviceDefinitionId || null,
      replicaId: debugScope.replicaId || null,
      runtimeKind: descriptor.runtimeKind,
      source: DEBUG_TRACE_SOURCE.PARTITION_CALLBACK,
    });
    if (!emitter.isTraceActive(debugScope)) {
      return null;
    }
    return emitter.createTraceApi(debugScope, {
      runtimeKind: descriptor.runtimeKind,
      source: DEBUG_TRACE_SOURCE.PARTITION_CALLBACK,
    });
  }

  /**
   * Check if the cancellation token has been triggered.
   *
   * @return {boolean} True if cancelled.
   * @private
   */
  _isCancelled() {
    return this.cancellationToken &&
      this.cancellationToken.isCancelled();
  }

  /**
   * Run budget enforcement check. Throws BudgetLimitError
   * if any budget is exceeded.
   *
   * @private
   */
  _checkBudget() {
    if (this.budgetEnforcer) {
      if (this.budgetEnforcer.isTerminated()) {
        throw new Error(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_BUDGET_TERMINATED,
        );
      }
      this.budgetEnforcer.checkWallTime();
    }
  }

  /**
   * Compute lineage ID for a batch at the given index.
   *
   * @param {number} batchIndex - Batch index.
   * @return {string|null} Lineage ID or null.
   * @private
   */
  _batchLineageId(batchIndex) {
    if (!this.lineageTracker) {
      return null;
    }
    return this.lineageTracker.generateLineageId(
      this.stageIndex, 'callback_batch', batchIndex,
    );
  }

  /**
   * Register a completed batch result in the dedupe
   * registry for retry safety.
   *
   * @param {object} result - Completed batch result.
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

  /**
   * Emit a telemetry event through the onTelemetry callback.
   * Follows the same pattern used by lookup, emit, and
   * broadcast primitives.
   *
   * @param {object} data - Telemetry event data.
   * @private
   */
  _emitTelemetry(data) {
    if (typeof this.onTelemetry === TYPEOF.FUNCTION) {
      this.onTelemetry(data);
    }
  }

  /**
   * Estimate byte size of a rows array using JSON
   * serialization length with a UTF-16 multiplier.
   *
   * Follows the same estimation pattern used by
   * streaming-aggregator.
   *
   * @param {Array} rows - Result rows.
   * @return {number} Estimated byte count.
   * @private
   */
  _estimateBytes(rows) {
    if (!rows || rows.length === NUM.ZERO) {
      return NUM.ZERO;
    }
    try {
      return JSON.stringify(rows).length *
        BYTE_ESTIMATE_MULTIPLIER;
    } catch {
      return NUM.ZERO;
    }
  }

  /**
   * Build a cancelled result when cancellation is detected
   * before execution begins.
   *
   * @param {Array<object>} batches - Original batch list.
   * @return {object} Cancelled stage result.
   * @private
   */
  _buildCancelledResult(batches) {
    const reason = this.cancellationToken ?
      this.cancellationToken.getReason() :
      STAGE_STATE.CANCELLED;

    this.logger.debug(
      ADAPTER_LOG_MSG.CALLBACK_HOST_CANCELLED, {
        batchCount: batches.length,
        reason,
      },
    );

    return {
      partitionResults: [],
      [SF.STATE]: STAGE_STATE.CANCELLED,
      totalPartitions: batches.length,
      processedPartitions: NUM.ZERO,
      failedPartitions: NUM.ZERO,
      cancelReason: reason,
    };
  }

  /**
   * Build a cancelled result for a single partition batch.
   *
   * @param {string} partitionId - Partition identifier.
   * @param {number} duration - Elapsed time in ms.
   * @return {object} Cancelled batch result.
   * @private
   */
  _cancelledBatchResult(partitionId, duration) {
    const reason = this.cancellationToken ?
      this.cancellationToken.getReason() :
      STAGE_STATE.CANCELLED;
    return {
      [SF.PARTITION_ID]: partitionId,
      [SF.ROWS]: [],
      [SF.ROW_COUNT]: NUM.ZERO,
      [SF.STATE]: STAGE_STATE.CANCELLED,
      [SF.ERROR]: reason,
      [SF.DURATION_MS]: duration,
    };
  }
}

export {CallbackExecutionHost, validateDescriptor};
