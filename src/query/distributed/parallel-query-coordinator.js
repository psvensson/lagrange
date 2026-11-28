/**
 * Parallel Query Coordinator - Executes queries across partitions in parallel.
 * Implements resource limits, timeout mechanisms, straggler detection,
 * speculative execution, and streaming aggregation.
 * Requirements: 26.1, 26.2, 26.3, 26.7, 26.8, 26.9, 26.10, 26.11, 26.12
 */

import {LoggingService} from '../../logging/logging-service.js';
import {ConfigurationManager} from '../../config/configuration-manager.js';
import {METRICS_LOG_TAG} from '../../constants/index.js';
import {TRANSPORT_EVENT} from '../../constants/transport.js';
import {
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
} from '../query-constants.js';
import {
  estimateResultBytes,
  formatQueryExecutionMetrics,
  PartitionQueryMetrics,
  QueryExecutionMetrics,
} from './parallel-query-execution-metrics.js';
import {
  buildPartitionExecutionFailureOutcome,
  buildPartitionExecutionSuccessOutcome,
  getResultRowCount,
  normalizeFailureString,
  normalizePartitionExecutionFailureSnapshot,
} from './parallel-query-partition-outcomes.js';
import {
  installParallelQueryCoordinatorHedgingMethods,
} from './parallel-query-coordinator-hedging-methods.js';
import {settleHedgedPartition} from './parallel-query-hedging.js';
import {reportWaitBoundSpent} from '../../logging/wait-bound-spent.js';

// A caller cutoff closes admission. A submitted participant keeps its reply
// until the chunk's existing outer safety deadline. The delivery owner supplies
// the outcome at that bound, including any unresolved earlier delivery.
function createParallelWriteSettlement(options) {
  const admission = new AbortController();
  const signal = options.signal ?
    globalThis.AbortSignal.any([options.signal, admission.signal]) :
    admission.signal;
  const unsubscribe = options.cancellationToken?.onCancel?.((reason) =>
    admission.abort(new Error(reason)));
  let submitted = false;

  return {
    get submitted() {
      return submitted;
    },
    get cutoff() {
      return signal.reason;
    },
    expire(error) {
      admission.abort(error);
    },
    dispose() {
      unsubscribe?.();
    },
    async execute(run, deadline) {
      let finishSubmitted = null;
      const stopped = Promise.withResolvers();
      const onAbort = () => {
        if (!finishSubmitted) stopped.reject(signal.reason);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener(TRANSPORT_EVENT.ABORT, onAbort, {once: true});
      try {
        const result = signal.aborted ? stopped.promise : run({
          signal,
          onWriteSubmitted(finish) {
            signal.throwIfAborted();
            submitted = true;
            finishSubmitted = finish;
          },
        });
        return await Promise.race([
          result,
          stopped.promise,
          deadline.catch((error) => {
            if (finishSubmitted) return finishSubmitted(error);
            throw error;
          }),
        ]);
      } finally {
        signal.removeEventListener(TRANSPORT_EVENT.ABORT, onAbort);
        finishSubmitted = null;
      }
    },
  };
}

const QUERY_ID_PREFIX = 'q-';
const WRITE_FANOUT_OUTER_SAFETY_MARGIN_MS = 250; // ends-on: n/a clamp
const CHUNK_TIMEOUT_WAIT = Object.freeze({
  wait: 'QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS',
  awaited: 'every partition result of one fan-out chunk',
});
const CHUNK_TIMEOUT_PENDING_SAMPLE = 8;

function resolveChunkExecutionTimeouts(effectiveTimeoutMs, options) {
  const outerTimeoutMs = options?.forRead === true ?
    effectiveTimeoutMs :
    effectiveTimeoutMs + WRITE_FANOUT_OUTER_SAFETY_MARGIN_MS;
  const partitionOptions = options?.timeoutMs !== undefined ?
    options :
    {...options, timeoutMs: effectiveTimeoutMs};
  return {outerTimeoutMs, partitionOptions};
}

/**
 * Report a spent fan-out chunk timeout with the chunk's settle state.
 * @param {Object} coordinator - ParallelQueryCoordinator.
 * @param {Object} spent - {partitionIds, metrics, timeoutMs, startedAtMs}.
 * @private
 */
function reportChunkTimeoutSpent(coordinator, spent) {
  const settledPartitionIds = spent.partitionIds.filter(
    (partitionId) => spent.metrics?.partitionMetrics?.has?.(partitionId),
  );
  reportWaitBoundSpent(coordinator.logger, {
    ...CHUNK_TIMEOUT_WAIT,
    boundMs: spent.timeoutMs,
    elapsedMs: Date.now() - spent.startedAtMs,
    lastObserved: () => ({
      chunkPartitionCount: spent.partitionIds.length,
      settledPartitionCount: settledPartitionIds.length,
      pendingPartitionIds: spent.partitionIds
        .filter((partitionId) => !settledPartitionIds.includes(partitionId))
        .slice(0, CHUNK_TIMEOUT_PENDING_SAMPLE),
      speculativeExecutions: spent.metrics?.speculativeExecutions ?? null,
    }),
    scope: {queryId: spent.metrics?.queryId ?? null},
  });
}
function estimateResultPayloadBytes(result) {
  if (
    Number.isSafeInteger(result?.residentBytes) &&
    result.residentBytes >= 0
  ) {
    return result.residentBytes;
  }
  if (Array.isArray(result?.rawRows)) {
    return estimateResultBytes(result.rawRows);
  }
  return estimateResultBytes(result?.rows);
}

const QUERY_CANCELLED_ERROR = 'Query cancelled';
const PARTITION_QUERY_EXECUTOR_REQUIRED =
  'ParallelQueryCoordinator requires a partitionQueryExecutor';

// The coordinator's one partition routing owner: a function, validated once
// when the coordinator is constructed.
function requirePartitionQueryExecutor(partitionQueryExecutor) {
  if (typeof partitionQueryExecutor !== 'function') {
    throw new TypeError(PARTITION_QUERY_EXECUTOR_REQUIRED);
  }
  return partitionQueryExecutor;
}

/**
 * ParallelQueryCoordinator handles parallel query execution across partitions
 * with resource limits, timeout mechanisms, and straggler detection.
 */
class ParallelQueryCoordinator {
  /**
   * Create a new parallel query coordinator.
   * @param {Object} options - Configuration options.
   * @param {Function} options.partitionQueryExecutor - Partition routing owner.
   */
  constructor(options = {}) {
    this.partitionQueryExecutor = requirePartitionQueryExecutor(options.partitionQueryExecutor);
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.PARALLEL_QUERY_COORDINATOR;
    this.logger = this.initLogger();

    // Load configuration
    const config = ConfigurationManager.getInstance();
    this.maxParallelPartitions = config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_PARALLEL_PARTITIONS) ||
      QUERY_DEFAULTS.COORDINATOR_MAX_PARALLEL_PARTITIONS;
    this.maxConcurrentConnections =
      config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_CONCURRENT_CONNECTIONS) ||
      QUERY_DEFAULTS.COORDINATOR_MAX_CONCURRENT_CONNECTIONS;
    this.maxResultBufferBytes = config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES) ||
      QUERY_DEFAULTS.COORDINATOR_MAX_RESULT_BUFFER_BYTES;
    this.queryTimeoutMs = config.get(QUERY_CONFIG_KEY.COORDINATOR_QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS;
    this.stragglerThresholdMultiplier =
      config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER) ||
      QUERY_DEFAULTS.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER;
    this.speculativeExecutionEnabled = config.get(
      QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_ENABLED,
    ) !== false;
    this.speculativeExecutionDelayMs = config.get(
      QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS,
    ) || QUERY_DEFAULTS.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS;

    // Track active queries for resource management
    this.activeConnections = 0;
    this.queryCounter = 0;
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.PARALLEL_QUERY_COORDINATOR);
      }
    } catch (logErr) {
      console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED,
        logErr.message);
    }
    return console;
  }

  /**
   * Execute a query across multiple partitions in parallel.
   * Implements resource limits, timeout, and straggler detection.
   * Requirements: 26.1, 26.2, 26.3, 26.8, 26.12
   * @param {string} sql - SQL query to execute.
   * @param {Array} partitionIds - Partition IDs to query.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @return {Promise<Object>} Query result with metrics.
   */
  async executeParallel(sql, partitionIds, params = [], options = {}) {
    const queryId =
      `${QUERY_ID_PREFIX}${++this.queryCounter}-${Date.now()}`;
    const metrics = new QueryExecutionMetrics(queryId, partitionIds.length);

    // Validate resource limits
    this.validateResourceLimits(partitionIds.length);

    this.logger.debug(QUERY_LOG_MSG.PARALLEL_QUERY_START, {
      queryId,
      partitionCount: partitionIds.length,
      originalCount: partitionIds.length,
    });

    try {
      // Execute on all partitions with timeout and straggler detection
      const results = await this.executeWithTimeoutAndStragglers(
        sql,
        partitionIds,
        params,
        metrics,
        options,
      );

      // Validate result buffer size
      this.validateResultBufferSize(results, metrics);

      metrics.finalize();
      const formatted = formatQueryExecutionMetrics(metrics);

      try {
        const latencies = formatted.partitionLatencies
          .map((p) => p.latencyMs)
          .filter((l) => l !== null && l !== undefined);
        const maxPartitionLatencyMs = latencies.length > 0 ?
          Math.max(...latencies) :
          0;

        this.logger.info(METRICS_LOG_TAG.FANOUT_COMPLETE, {
          queryId: formatted.queryId,
          partitionCount: formatted.partitionCount,
          totalLatencyMs: formatted.totalLatencyMs,
          medianLatencyMs: formatted.medianLatencyMs,
          maxPartitionLatencyMs,
          totalRows: formatted.totalRows,
          totalBytes: formatted.totalBytes,
          stragglerCount: formatted.stragglers.length,
          speculativeExecutions: formatted.speculativeExecutions,
        });
      } catch (metricsErr) {
        this.logger.warn(QUERY_LOG_MSG.PARALLEL_QUERY_FAILED, {
          queryId,
          error: metricsErr.message,
        });
      }

      return {
        success: true,
        results,
        metrics: formatted,
        partitions: partitionIds,
      };
    } catch (error) {
      metrics.finalize();
      this.logger.error(QUERY_LOG_MSG.PARALLEL_QUERY_FAILED, {
        queryId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate resource limits before query execution.
   * Requirements: 26.2, 26.8
   * @param {number} partitionCount - Number of partitions.
   * @throws {Error} If resource limits would be exceeded.
   * @private
   */
  validateResourceLimits(partitionCount) {
    const peakConnections = Math.min(partitionCount, this.maxParallelPartitions);
    // Check concurrent connections limit
    if (this.activeConnections + peakConnections > this.maxConcurrentConnections) {
      throw new Error(
        `${QUERY_ERROR_MSG.MAX_CONNECTIONS_PREFIX}` +
        `${this.activeConnections + peakConnections} > ${this.maxConcurrentConnections}`,
      );
    }
  }

  /**
   * Build deterministic partition chunks for bounded parallel execution.
   * @param {Array} partitionIds - Ordered partition IDs.
   * @return {Array<Array<string>>} Ordered chunk list.
   * @private
   */
  buildPartitionChunks(partitionIds) {
    const chunkSize = Math.max(this.maxParallelPartitions, 1);
    const chunks = [];
    for (let index = 0; index < partitionIds.length; index += chunkSize) {
      chunks.push(partitionIds.slice(index, index + chunkSize));
    }
    return chunks;
  }

  /**
   * Execute query with timeout and straggler detection.
   * Requirements: 26.1, 26.10, 26.11, 26.12
   * @param {string} sql - SQL query.
   * @param {Array} partitionIds - Partition IDs.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Object} options - Execution options.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeWithTimeoutAndStragglers(
    sql,
    partitionIds,
    params,
    metrics,
    options,
  ) {
    const partitionChunks = this.buildPartitionChunks(partitionIds);
    const allResults = [];
    const writes = options.forRead === true ? null : createParallelWriteSettlement(options);
    try {
      for (const partitionChunk of partitionChunks) {
        const chunkResults = await this.executeChunkWithTimeoutAndStragglers(
          sql, partitionChunk, params, metrics, options, writes,
        );
        if (writes?.cutoff && !writes.submitted) throw writes.cutoff;
        allResults.push(...chunkResults);
      }
      return allResults;
    } finally {
      writes?.dispose();
    }
  }

  // Hedging is read-only and non-transactional, and needs more than one partition.
  isHedgeableReadChunk(options, partitionIds) {
    return this.speculativeExecutionEnabled &&
      options.forRead === true &&
      !options.transactionIdentity &&
      partitionIds.length > 1;
  }

  /**
   * Execute one partition chunk with timeout and straggler detection.
   * @param {string} sql - SQL query.
   * @param {Array<string>} partitionIds - Partition chunk.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Object} options - Execution options.
   * @return {Promise<Array>} Array of partition results for this chunk.
   * @private
   */
  async executeChunkWithTimeoutAndStragglers(
    sql,
    partitionIds,
    params,
    metrics,
    options,
    writes = null,
  ) {
    this.activeConnections += partitionIds.length;
    let timeoutId = null;
    const effectiveTimeoutMs = this.resolveTimeoutMs(options?.timeoutMs);
    const cancellationPromise = writes ? null : this.createCancellationPromise(
      options?.cancellationToken || null,
    );

    try {
      // Create timeout promise with clearable timer. For write fan-out,
      // pass effectiveTimeoutMs to each partition execution so attemptBudget
      // owns unknown-outcome redelivery and returns a typed OUTCOME_UNKNOWN
      // participant failure before the outer safety timer rejects.
      const chunkStartedAtMs = Date.now();
      const {outerTimeoutMs, partitionOptions} =
        resolveChunkExecutionTimeouts(effectiveTimeoutMs, options);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reportChunkTimeoutSpent(this, {
            partitionIds,
            metrics,
            timeoutMs: effectiveTimeoutMs,
            startedAtMs: chunkStartedAtMs,
          });
          const timeoutError = new Error(
            `${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX}` +
            `${effectiveTimeoutMs}${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX}`,
          );
          timeoutError.errorCode = QUERY_ERROR_CODE.TIMEOUT;
          writes?.expire(timeoutError);
          reject(timeoutError);
        }, outerTimeoutMs);
      });

      // Execute with straggler hedging if enabled. Hedging is read-only and
      // non-transactional: a hedged write could be delivered twice, and a
      // hedged transactional read would exclude the leader replica holding the
      // participant session and route to a follower replica.
      if (this.isHedgeableReadChunk(options, partitionIds)) {
        return await this.executeWithSpeculativeExecution(
          sql,
          partitionIds,
          params,
          metrics,
          timeoutPromise,
          cancellationPromise,
          partitionOptions,
        );
      }

      if (writes) {
        const results = await Promise.all(partitionIds.map((partitionId) =>
          this.executeOnPartitionWithMetrics(sql, partitionId, params, metrics,
            partitionOptions, (run) => writes.execute(run, timeoutPromise))));
        this.detectAndLogStragglers(metrics);
        return results;
      }

      // Simple parallel execution with timeout
      const executionPromises = partitionIds.map((partitionId) =>
        this.executeOnPartitionWithMetrics(
          sql, partitionId, params, metrics, partitionOptions,
        ),
      );
      const racePromises = [
        Promise.all(executionPromises),
        timeoutPromise,
      ];
      if (cancellationPromise) {
        racePromises.push(cancellationPromise);
      }
      const results = await Promise.race(racePromises);

      // Detect and log stragglers
      this.detectAndLogStragglers(metrics);

      return results;
    } finally {
      // Clear timeout to prevent keeping process alive
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      this.activeConnections -= partitionIds.length;
    }
  }

  /**
   * Execute query on a single partition with metrics tracking.
   * @param {string} sql - SQL query.
   * @param {string} partitionId - Partition ID.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @return {Promise<Object>} Partition result.
   * @private
   */
  async executeOnPartitionWithMetrics(
    sql,
    partitionId,
    params,
    metrics,
    options = {},
    runWrite = null,
  ) {
    const partitionMetrics = new PartitionQueryMetrics(partitionId);
    partitionMetrics.start();

    try {
      const result = runWrite ? await runWrite(async (scope) =>
        this.partitionQueryExecutor(sql, partitionId, params, {...options, ...scope})) :
        await this.partitionQueryExecutor(sql, partitionId, params, options);
      if (result && result.success === false) {
        partitionMetrics.fail(
          new Error(result.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED),
          result,
        );
        metrics.addPartitionMetrics(partitionMetrics);
        return buildPartitionExecutionFailureOutcome(
          normalizePartitionExecutionFailureSnapshot(
            partitionId,
            partitionMetrics,
            result,
            QUERY_ERROR_MSG.QUERY_ROUTING_FAILED,
          ),
        );
      }
      const rowCount = getResultRowCount(result);
      const bytesRead = estimateResultPayloadBytes(result);
      partitionMetrics.complete(rowCount, bytesRead);
      metrics.addPartitionMetrics(partitionMetrics);

      return buildPartitionExecutionSuccessOutcome(
        partitionId,
        partitionMetrics,
        result,
      );
    } catch (error) {
      partitionMetrics.fail(error, error);
      metrics.addPartitionMetrics(partitionMetrics);

      return buildPartitionExecutionFailureOutcome(
        normalizePartitionExecutionFailureSnapshot(
          partitionId,
          partitionMetrics,
          error,
          error.message,
        ),
      );
    }
  }

  /**
   * Resolve effective timeout from optional override.
   * @param {number|undefined|null} timeoutMs
   * @return {number}
   * @private
   */
  resolveTimeoutMs(timeoutMs) {
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      return Math.floor(timeoutMs);
    }
    return this.queryTimeoutMs;
  }

  /**
   * Build cancellation promise for cooperative aborts.
   * @param {Object|null} cancellationToken
   * @return {Promise<never>|null}
   * @private
   */
  createCancellationPromise(cancellationToken) {
    if (!cancellationToken ||
      typeof cancellationToken.onCancel !== 'function') {
      return null;
    }

    return new Promise((_, reject) => {
      const rejectWithReason = (reason) => {
        reject(new Error(reason || QUERY_CANCELLED_ERROR));
      };
      cancellationToken.onCancel(rejectWithReason);
      if (typeof cancellationToken.isCancelled === 'function' &&
        cancellationToken.isCancelled()) {
        const reason = typeof cancellationToken.getReason === 'function' ?
          cancellationToken.getReason() :
          null;
        rejectWithReason(reason);
      }
    });
  }

  /**
   * Validate result buffer size.
   * Requirements: 26.3
   * @param {Array} results - Query results.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @throws {Error} If result buffer exceeds limit.
   * @private
   */
  validateResultBufferSize(results, metrics) {
    if (metrics.totalBytes > this.maxResultBufferBytes) {
      throw new Error(
        `${QUERY_ERROR_MSG.RESULT_BUFFER_LIMIT_PREFIX}` +
        `${metrics.totalBytes} > ${this.maxResultBufferBytes}`,
      );
    }
  }

  /**
   * Detect and log straggler partitions.
   * Requirements: 26.7, 26.10
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @private
   */
  detectAndLogStragglers(metrics) {
    const medianLatency = metrics.getMedianLatency();
    if (medianLatency === 0) return;

    const stragglerThreshold = medianLatency * this.stragglerThresholdMultiplier;

    for (const [partitionId, partitionMetrics] of metrics.partitionMetrics) {
      if (
        partitionMetrics.latencyMs !== null &&
        partitionMetrics.latencyMs > stragglerThreshold
      ) {
        if (!metrics.stragglers.includes(partitionId)) {
          metrics.stragglers.push(partitionId);
        }

        this.logger.warn(QUERY_LOG_MSG.STRAGGLER_DETECTED, {
          partitionId,
          latencyMs: partitionMetrics.latencyMs,
          medianLatencyMs: medianLatency,
          threshold: stragglerThreshold,
          multiplier: this.stragglerThresholdMultiplier,
        });
      }
    }
  }

  /**
   * Accept a completed speculative attempt. A failed hedge can never win
   * the partition; a successful hedge wins only when the primary has not
   * already settled, in which case its metrics and canonical success
   * outcome are recorded without forcing lazy object-row materialization.
   * @param {Object} input - Speculative completion context.
   * @return {Object} The raw speculative result (for promise chaining).
   * @private
   */
  acceptSpeculativeResult({
    partitionId,
    result,
    speculativeMetrics,
    metrics,
    hedging,
  }) {
    if (result && result.success === false) {
      const errorText = normalizeFailureString(result.error);
      speculativeMetrics.fail(
        new Error(
          errorText === null ? QUERY_ERROR_MSG.QUERY_ROUTING_FAILED : errorText,
        ),
        result,
      );
      return result;
    }
    speculativeMetrics.complete(
      getResultRowCount(result),
      estimateResultPayloadBytes(result),
    );
    if (hedging.results.has(partitionId)) {
      this.logger.debug(QUERY_LOG_MSG.HEDGE_LOSER_RESULT_DISCARDED, {
        partitionId,
      });
      return result;
    }
    metrics.addPartitionMetrics(speculativeMetrics);
    const outcome = buildPartitionExecutionSuccessOutcome(
      partitionId,
      speculativeMetrics,
      result,
    );
    settleHedgedPartition(hedging, partitionId, outcome);
    return result;
  }

  /**
   * Get current resource usage.
   * @return {Object} Resource usage stats.
   */
  getResourceUsage() {
    return {
      activeConnections: this.activeConnections,
      maxConcurrentConnections: this.maxConcurrentConnections,
      maxParallelPartitions: this.maxParallelPartitions,
      maxResultBufferBytes: this.maxResultBufferBytes,
    };
  }
}

installParallelQueryCoordinatorHedgingMethods(ParallelQueryCoordinator);

export {
  ParallelQueryCoordinator,
  PartitionQueryMetrics,
  QueryExecutionMetrics,
};
