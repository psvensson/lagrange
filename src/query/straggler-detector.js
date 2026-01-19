/**
 * Straggler Detector - Detects slow partitions and triggers mitigation.
 * Implements straggler detection based on median latency threshold.
 * Requirements: 26.7, 26.10, 26.11
 */

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

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
    this.logger = this.initLogger();

    // Load configuration
    const config = ConfigurationManager.getInstance();
    this.thresholdMultiplier = options.thresholdMultiplier ||
      config.get('queryCoordinator.stragglerThresholdMultiplier') || 2.0;

    this.onStragglerDetected = options.onStragglerDetected || null;

    // Track latencies for median calculation
    this.latencies = new Map(); // partitionId -> latencyMs
    this.completedCount = 0;
    this.detectedStragglers = new Set();
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
        return loggingService.forSubsystem('straggler-detector');
      }
    } catch {
      // Logging not available
    }
    return console;
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
    if (values.length === 0) return 0;

    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0 ?
      (values[mid - 1] + values[mid]) / 2 :
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
    if (this.completedCount < 2) return false;

    const threshold = this.getStragglerThreshold();
    if (threshold === 0) return false;

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
    this.logger.warn('Slow partition detected (straggler)', {
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

    if (threshold === 0) return stragglers;

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
    this.completedCount = 0;
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
    this.logger = this.initLogger();
    this.replicaRegistry = options.replicaRegistry || new Map();

    const config = ConfigurationManager.getInstance();
    this.delayMs = options.delayMs ||
      config.get('queryCoordinator.speculativeExecutionDelayMs') || 100;
    this.enabled = config.get('queryCoordinator.speculativeExecutionEnabled') !== false;

    // Track active speculative executions
    this.activeExecutions = new Map(); // partitionId -> {promise, abortController}
    this.executionCount = 0;
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
        return loggingService.forSubsystem('speculative-executor');
      }
    } catch {
      // Logging not available
    }
    return console;
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
      r.status === 'active' || r.status === undefined,
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
    if (replicas.length === 0) {
      this.logger.debug('No alternative replicas for speculative execution', {
        partitionId,
      });
      return null;
    }

    // Select a replica (prefer one that's not the primary)
    const replica = replicas[0];

    this.logger.debug('Starting speculative execution', {
      partitionId,
      replicaId: replica.replicaId || 'unknown',
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
      this.logger.debug('Speculative execution failed', {
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
    this.executionCount = 0;
  }
}

export {StragglerDetector, SpeculativeExecutor};
