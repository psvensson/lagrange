/**
 * Straggler Detector - Detects slow partitions and triggers mitigation.
 * Implements straggler detection based on median latency threshold.
 * Requirements: 26.7, 26.10, 26.11
 */

import {LoggingService} from '../../logging/logging-service.js';
import {ConfigurationManager} from '../../config/configuration-manager.js';
import {SERVICE_STATUS, STRING} from '../../constants/index.js';
import {
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
} from '../query-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

const MIN_COMPLETIONS_FOR_MEDIAN = 2;
const MEDIAN_DIVISOR = 2;
const PARITY_MODULUS = 2;
const NO_LATENCY_MS = 0;

/**
 * Shared logger initializer for query subsystems.
 * @param {string} subsystem - Subsystem name for the logger.
 * @return {Object} Logger instance or console fallback.
 */
function initQueryLogger(subsystem) {
  try {
    const loggingService = LoggingService.getInstance();
    if (loggingService.isInitialized()) {
      return loggingService.forSubsystem(subsystem);
    }
  } catch (logErr) {
    console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
  }
  return console;
}

/**
 * StragglerDetector monitors partition query latencies and detects
 * slow partitions that exceed the threshold (> 2× median latency).
 */
class StragglerDetector {
  /**
   * Create a new straggler detector.
   * @param {Object} options - Configuration options.
   * @param {number} options.thresholdMultiplier - Multiplier for median latency threshold.
   * @param {Function} options.onStragglerDetected - Callback when straggler is detected.
   */
  constructor(options = {}) {
    this.logger = initQueryLogger(QUERY_SUBSYSTEM.STRAGGLER_DETECTOR);

    // Load configuration
    const config = ConfigurationManager.getInstance();
    this.thresholdMultiplier = options.thresholdMultiplier ||
      config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER) ||
      QUERY_DEFAULTS.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER;

    this.onStragglerDetected = options.onStragglerDetected || null;

    // Track latencies for median calculation
    this.latencies = new Map(); // partitionId -> latencyMs
    this.completedCount = LOCAL_NUM_ZERO;
    this.detectedStragglers = new Set();
  }

  /**
   * Record a partition query completion.
   * @param {string} partitionId - Partition ID.
   * @param {number} latencyMs - Query latency in milliseconds.
   */
  recordCompletion(partitionId, latencyMs) {
    this.latencies.set(partitionId, latencyMs);
    this.completedCount++;
  }

  /**
   * Calculate the median latency of completed queries.
   * @return {number} Median latency in milliseconds.
   */
  getMedianLatency() {
    const values = Array.from(this.latencies.values()).sort((a, b) => a - b);
    if (values.length === LOCAL_NUM_ZERO) return NO_LATENCY_MS;

    const mid = Math.floor(values.length / MEDIAN_DIVISOR);
    return values.length % PARITY_MODULUS === LOCAL_NUM_ZERO ?
      (values[mid - LOCAL_NUM_ONE] + values[mid]) / MEDIAN_DIVISOR :
      values[mid];
  }

  /**
   * Get the straggler threshold based on current median.
   * @return {number} Threshold latency in milliseconds.
   */
  getStragglerThreshold() {
    return this.getMedianLatency() * this.thresholdMultiplier;
  }

  /**
   * Check if a partition is a straggler based on elapsed time.
   * Requirements: 26.10
   * @param {string} partitionId - Partition ID.
   * @param {number} elapsedMs - Elapsed time since query start.
   * @return {boolean} True if partition is a straggler.
   */
  isStraggler(partitionId, elapsedMs) {
    // Need at least some completed queries to calculate median
    if (this.completedCount < MIN_COMPLETIONS_FOR_MEDIAN) return false;

    const threshold = this.getStragglerThreshold();
    if (threshold === NO_LATENCY_MS) return false;

    const isStraggler = elapsedMs > threshold;

    if (isStraggler && !this.detectedStragglers.has(partitionId)) {
      this.detectedStragglers.add(partitionId);
      this.logStragglerDetected(partitionId, elapsedMs, threshold);

      if (this.onStragglerDetected) {
        this.onStragglerDetected(partitionId, elapsedMs, threshold);
      }
    }

    return isStraggler;
  }

  /**
   * Log straggler detection.
   * Requirements: 26.7
   * @param {string} partitionId - Partition ID.
   * @param {number} elapsedMs - Elapsed time.
   * @param {number} threshold - Threshold that was exceeded.
   * @private
   */
  logStragglerDetected(partitionId, elapsedMs, threshold) {
    this.logger.warn(QUERY_LOG_MSG.STRAGGLER_DETECTED, {
      partitionId,
      elapsedMs,
      medianLatencyMs: this.getMedianLatency(),
      thresholdMs: threshold,
      thresholdMultiplier: this.thresholdMultiplier,
      completedPartitions: this.completedCount,
    });
  }

  /**
   * Analyze final results and identify all stragglers.
   * @param {Map} partitionLatencies - Map of partitionId to latencyMs.
   * @return {Array} Array of straggler partition IDs.
   */
  analyzeResults(partitionLatencies) {
    const stragglers = [];
    const threshold = this.getStragglerThreshold();

    if (threshold === NO_LATENCY_MS) return stragglers;

    for (const [partitionId, latencyMs] of partitionLatencies) {
      if (latencyMs > threshold) {
        stragglers.push({
          partitionId,
          latencyMs,
          medianLatencyMs: this.getMedianLatency(),
          thresholdMs: threshold,
          excessMs: latencyMs - threshold,
        });
      }
    }

    // Sort by excess latency (worst stragglers first)
    stragglers.sort((a, b) => b.excessMs - a.excessMs);

    return stragglers;
  }

  /**
   * Get statistics about detected stragglers.
   * @return {Object} Straggler statistics.
   */
  getStats() {
    return {
      completedCount: this.completedCount,
      medianLatencyMs: this.getMedianLatency(),
      thresholdMs: this.getStragglerThreshold(),
      thresholdMultiplier: this.thresholdMultiplier,
      detectedStragglerCount: this.detectedStragglers.size,
      detectedStragglers: Array.from(this.detectedStragglers),
    };
  }

  /**
   * Reset the detector for a new query.
   */
  reset() {
    this.latencies.clear();
    this.completedCount = LOCAL_NUM_ZERO;
    this.detectedStragglers.clear();
  }
}

/**
 * SpeculativeExecutor handles speculative execution on alternative replicas.
 * When a straggler is detected, it starts a parallel query on a different replica.
 * Requirements: 26.11
 */
class SpeculativeExecutor {
  /**
   * Create a new speculative executor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.replicaRegistry - Registry of replica services.
   * @param {number} options.delayMs - Delay before starting speculative execution.
   */
  constructor(options = {}) {
    this.logger = initQueryLogger(QUERY_SUBSYSTEM.SPECULATIVE_EXECUTOR);
    this.replicaRegistry = options.replicaRegistry || new Map();

    const config = ConfigurationManager.getInstance();
    this.delayMs = options.delayMs ||
      config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS) ||
      QUERY_DEFAULTS.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS;
    this.enabled = config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_ENABLED) !== false;

    // Track active speculative executions
    this.activeExecutions = new Map(); // partitionId -> {promise, abortController}
    this.executionCount = LOCAL_NUM_ZERO;
  }

  /**
   * Set the replica registry.
   * @param {Map|Object} registry - Replica registry.
   */
  setReplicaRegistry(registry) {
    this.replicaRegistry = registry;
  }

  /**
   * Get alternative replicas for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array} Array of replica services.
   * @private
   */
  getAlternativeReplicas(partitionId) {
    let replicas;
    if (this.replicaRegistry instanceof Map) {
      replicas = this.replicaRegistry.get(partitionId);
    } else {
      replicas = this.replicaRegistry[partitionId];
    }
    return (replicas || []).filter((r) =>
      r.status === SERVICE_STATUS.ACTIVE || r.status === undefined,
    );
  }

  /**
   * Start speculative execution for a straggler partition.
   * Requirements: 26.11
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Function} executeQuery - Function to execute query on a service.
   * @return {Promise|null} Speculative execution promise or null if not possible.
   */
  startSpeculativeExecution(partitionId, sql, params, executeQuery) {
    if (!this.enabled) return null;

    // Don't start duplicate speculative executions
    if (this.activeExecutions.has(partitionId)) {
      return this.activeExecutions.get(partitionId).promise;
    }

    const replicas = this.getAlternativeReplicas(partitionId);
    if (replicas.length === LOCAL_NUM_ZERO) {
      this.logger.debug(QUERY_LOG_MSG.NO_ALTERNATIVE_REPLICAS, {
        partitionId,
      });
      return null;
    }

    // Select a replica (prefer one that's not the primary)
    const replica = replicas[0];

    this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_START, {
      partitionId,
      replicaId: replica.replicaId || STRING.UNKNOWN,
    });

    this.executionCount++;

    const abortController = {aborted: false};
    const promise = this.executeSpeculative(
      partitionId,
      replica,
      sql,
      params,
      executeQuery,
      abortController,
    );

    this.activeExecutions.set(partitionId, {promise, abortController});

    return promise;
  }

  /**
   * Execute speculative query.
   * @param {string} partitionId - Partition ID.
   * @param {Object} replica - Replica service.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Function} executeQuery - Function to execute query.
   * @param {Object} abortController - Abort controller.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSpeculative(
    partitionId,
    replica,
    sql,
    params,
    executeQuery,
    abortController,
  ) {
    try {
      // Small delay before starting speculative execution
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));

      if (abortController.aborted) {
        return {partitionId, success: false, aborted: true, rows: []};
      }

      const result = await executeQuery(replica, sql, params);

      return {
        partitionId,
        success: true,
        rows: result.rows || [],
        changes: result.changes,
        speculative: true,
      };
    } catch (error) {
      this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_FAILED, {
        partitionId,
        error: error.message,
      });

      return {
        partitionId,
        success: false,
        error: error.message,
        rows: [],
        speculative: true,
      };
    } finally {
      this.activeExecutions.delete(partitionId);
    }
  }

  /**
   * Cancel speculative execution for a partition.
   * @param {string} partitionId - Partition ID.
   */
  cancelExecution(partitionId) {
    const execution = this.activeExecutions.get(partitionId);
    if (execution) {
      execution.abortController.aborted = true;
      this.activeExecutions.delete(partitionId);
    }
  }

  /**
   * Cancel all active speculative executions.
   */
  cancelAll() {
    for (const [partitionId, execution] of this.activeExecutions) {
      execution.abortController.aborted = true;
      this.activeExecutions.delete(partitionId);
    }
  }

  /**
   * Get statistics about speculative executions.
   * @return {Object} Execution statistics.
   */
  getStats() {
    return {
      enabled: this.enabled,
      delayMs: this.delayMs,
      totalExecutions: this.executionCount,
      activeExecutions: this.activeExecutions.size,
    };
  }

  /**
   * Reset the executor for a new query.
   */
  reset() {
    this.cancelAll();
    this.executionCount = LOCAL_NUM_ZERO;
  }
}

export {StragglerDetector, SpeculativeExecutor};
