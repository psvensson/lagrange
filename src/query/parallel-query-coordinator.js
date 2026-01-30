/**
 * Parallel Query Coordinator - Executes queries across partitions in parallel.
 * Implements resource limits, timeout mechanisms, straggler detection,
 * speculative execution, and streaming aggregation.
 * Requirements: 26.1, 26.2, 26.3, 26.7, 26.8, 26.9, 26.10, 26.11, 26.12
 */

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_STATUS,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

/**
 * Tracks execution metrics for a single partition query.
 */
class PartitionQueryMetrics {
  /**
   * Create partition query metrics.
   * @param {string} partitionId - Partition ID.
   */
  constructor(partitionId) {
    this.partitionId = partitionId;
    this.startTime = null;
    this.endTime = null;
    this.latencyMs = null;
    this.rowCount = 0;
    this.bytesRead = 0;
    this.status = QUERY_STATUS.PENDING; // pending, running, completed, failed, timeout
    this.error = null;
    this.isSpeculative = false;
  }

  /**
   * Mark query as started.
   */
  start() {
    this.startTime = Date.now();
    this.status = QUERY_STATUS.RUNNING;
  }

  /**
   * Mark query as completed.
   * @param {number} rowCount - Number of rows returned.
   * @param {number} bytesRead - Estimated bytes read.
   */
  complete(rowCount, bytesRead = 0) {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    this.rowCount = rowCount;
    this.bytesRead = bytesRead;
    this.status = QUERY_STATUS.COMPLETED;
  }

  /**
   * Mark query as failed.
   * @param {Error} error - Error that occurred.
   */
  fail(error) {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    this.status = QUERY_STATUS.FAILED;
    this.error = error.message;
  }

  /**
   * Mark query as timed out.
   */
  timeout() {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    this.status = QUERY_STATUS.TIMEOUT;
  }
}

/**
 * Tracks overall query execution metrics.
 */
class QueryExecutionMetrics {
  /**
   * Create query execution metrics.
   * @param {string} queryId - Query ID.
   * @param {number} partitionCount - Number of partitions.
   */
  constructor(queryId, partitionCount) {
    this.queryId = queryId;
    this.partitionCount = partitionCount;
    this.startTime = Date.now();
    this.endTime = null;
    this.totalLatencyMs = null;
    this.partitionMetrics = new Map();
    this.totalRows = 0;
    this.totalBytes = 0;
    this.stragglers = [];
    this.speculativeExecutions = 0;
  }

  /**
   * Add partition metrics.
   * @param {PartitionQueryMetrics} metrics - Partition metrics.
   */
  addPartitionMetrics(metrics) {
    this.partitionMetrics.set(metrics.partitionId, metrics);
    if (metrics.status === 'completed') {
      this.totalRows += metrics.rowCount;
      this.totalBytes += metrics.bytesRead;
    }
  }

  /**
   * Calculate median latency of completed partitions.
   * @return {number} Median latency in ms.
   */
  getMedianLatency() {
    const latencies = Array.from(this.partitionMetrics.values())
      .filter((m) => m.status === 'completed' && m.latencyMs !== null)
      .map((m) => m.latencyMs)
      .sort((a, b) => a - b);

    if (latencies.length === 0) return 0;

    const mid = Math.floor(latencies.length / 2);
    return latencies.length % 2 === 0 ?
      (latencies[mid - 1] + latencies[mid]) / 2 :
      latencies[mid];
  }

  /**
   * Finalize metrics.
   */
  finalize() {
    this.endTime = Date.now();
    this.totalLatencyMs = this.endTime - this.startTime;
  }
}

/**
 * ParallelQueryCoordinator handles parallel query execution across partitions
 * with resource limits, timeout mechanisms, and straggler detection.
 */
class ParallelQueryCoordinator {
  /**
   * Create a new parallel query coordinator.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for partition lookups.
   * @param {Object} options.replicaRegistry - Registry of replica services.
   * @param {string} options.nodeId - Node ID for logging.
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.replicaRegistry = options.replicaRegistry || new Map();
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
    this.streamingEnabled = config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_ENABLED) !== false;
    this.streamingChunkSize = config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE) ||
      QUERY_DEFAULTS.COORDINATOR_STREAMING_CHUNK_SIZE;

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
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    this.systemCache = cache;
  }

  /**
   * Set the replica registry.
   * @param {Map|Object} registry - Replica registry.
   */
  setReplicaRegistry(registry) {
    this.replicaRegistry = registry;
  }

  /**
   * Get a partition by ID from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition info or null.
   * @private
   */
  getPartition(partitionId) {
    if (!this.systemCache) {
      return null;
    }
    return this.systemCache.get(TABLES.PARTITIONS, partitionId);
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
    return replicas || [];
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
    const queryId = `q-${++this.queryCounter}-${Date.now()}`;
    const metrics = new QueryExecutionMetrics(queryId, partitionIds.length);

    // Validate resource limits
    this.validateResourceLimits(partitionIds.length);

    // Limit partitions if exceeding max
    const limitedPartitionIds = this.enforcePartitionLimit(partitionIds);

    this.logger.debug(QUERY_LOG_MSG.PARALLEL_QUERY_START, {
      queryId,
      partitionCount: limitedPartitionIds.length,
      originalCount: partitionIds.length,
    });

    try {
      // Execute on all partitions with timeout and straggler detection
      const results = await this.executeWithTimeoutAndStragglers(
        sql,
        limitedPartitionIds,
        params,
        metrics,
        options,
      );

      // Validate result buffer size
      this.validateResultBufferSize(results, metrics);

      metrics.finalize();

      return {
        success: true,
        results,
        metrics: this.formatMetrics(metrics),
        partitions: limitedPartitionIds,
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
    // Check concurrent connections limit
    if (this.activeConnections + partitionCount > this.maxConcurrentConnections) {
      throw new Error(
        `${QUERY_ERROR_MSG.MAX_CONNECTIONS_PREFIX}` +
        `${this.activeConnections + partitionCount} > ${this.maxConcurrentConnections}`,
      );
    }
  }

  /**
   * Enforce partition limit on query.
   * Requirements: 26.2
   * @param {Array} partitionIds - Original partition IDs.
   * @return {Array} Limited partition IDs.
   * @private
   */
  enforcePartitionLimit(partitionIds) {
    if (partitionIds.length <= this.maxParallelPartitions) {
      return partitionIds;
    }

    this.logger.warn(QUERY_LOG_MSG.PARTITION_LIMIT_TRUNCATE, {
      requested: partitionIds.length,
      limit: this.maxParallelPartitions,
    });

    return partitionIds.slice(0, this.maxParallelPartitions);
  }

  /**
   * Execute query with timeout and straggler detection.
   * Requirements: 26.1, 26.10, 26.11, 26.12
   * @param {string} sql - SQL query.
   * @param {Array} partitionIds - Partition IDs.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Object} _options - Execution options.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeWithTimeoutAndStragglers(sql, partitionIds, params, metrics, _options) {
    this.activeConnections += partitionIds.length;
    let timeoutId = null;

    try {
      // Create execution promises for each partition
      const executionPromises = partitionIds.map((partitionId) =>
        this.executeOnPartitionWithMetrics(sql, partitionId, params, metrics),
      );

      // Create timeout promise with clearable timer
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(
            `${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX}` +
            `${this.queryTimeoutMs}${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX}`,
          ));
        }, this.queryTimeoutMs);
      });

      // Execute with straggler detection if enabled
      if (this.speculativeExecutionEnabled && partitionIds.length > 1) {
        const result = await this.executeWithSpeculativeExecution(
          executionPromises,
          partitionIds,
          sql,
          params,
          metrics,
          timeoutPromise,
        );
        // Clear timeout after speculative execution completes
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        return result;
      }

      // Simple parallel execution with timeout
      const results = await Promise.race([
        Promise.all(executionPromises),
        timeoutPromise,
      ]);

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
   * Execute with speculative execution for stragglers.
   * Requirements: 26.10, 26.11
   * @param {Array} executionPromises - Original execution promises.
   * @param {Array} partitionIds - Partition IDs.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Promise} timeoutPromise - Timeout promise.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeWithSpeculativeExecution(
    executionPromises,
    partitionIds,
    sql,
    params,
    metrics,
    timeoutPromise,
  ) {
    const results = new Map();
    const pendingPartitions = new Set(partitionIds);
    const speculativePromises = new Map();

    // Wrap each promise to track completion
    const wrappedPromises = executionPromises.map((promise, index) => {
      const partitionId = partitionIds[index];
      return promise.then((result) => {
        results.set(partitionId, result);
        pendingPartitions.delete(partitionId);
        return {partitionId, result};
      });
    });

    // Start a timer to check for stragglers
    const stragglerCheckInterval = setInterval(() => {
      const medianLatency = metrics.getMedianLatency();
      if (medianLatency > 0 && pendingPartitions.size > 0) {
        const stragglerThreshold = medianLatency * this.stragglerThresholdMultiplier;

        for (const partitionId of pendingPartitions) {
          const partitionMetrics = metrics.partitionMetrics.get(partitionId);
          if (partitionMetrics && partitionMetrics.startTime) {
            const elapsed = Date.now() - partitionMetrics.startTime;
            if (elapsed > stragglerThreshold && !speculativePromises.has(partitionId)) {
              // Start speculative execution on alternative replica
              this.startSpeculativeExecution(
                partitionId,
                sql,
                params,
                metrics,
                speculativePromises,
                results,
                pendingPartitions,
              );
            }
          }
        }
      }
    }, this.speculativeExecutionDelayMs);

    try {
      // Wait for all original promises or timeout
      await Promise.race([
        Promise.all(wrappedPromises),
        timeoutPromise,
      ]);

      // Detect and log stragglers
      this.detectAndLogStragglers(metrics);

      return partitionIds.map((id) => results.get(id));
    } finally {
      clearInterval(stragglerCheckInterval);
      // Cancel any pending speculative executions
      for (const [, controller] of speculativePromises) {
        if (controller && controller.abort) {
          controller.abort();
        }
      }
    }
  }

  /**
   * Start speculative execution on an alternative replica.
   * Requirements: 26.11
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Map} speculativePromises - Map of speculative promises.
   * @param {Map} results - Results map.
   * @param {Set} pendingPartitions - Set of pending partitions.
   * @private
   */
  startSpeculativeExecution(
    partitionId,
    sql,
    params,
    metrics,
    speculativePromises,
    results,
    pendingPartitions,
  ) {
    const replicas = this.getAlternativeReplicas(partitionId);
    if (replicas.length === 0) return;

    // Select a different replica
    const alternativeReplica = replicas.find((r) =>
      r.status === 'active' || r.status === undefined,
    );

    if (!alternativeReplica) return;

    this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_START, {
      partitionId,
      replicaId: alternativeReplica.replicaId,
    });

    metrics.speculativeExecutions++;
    metrics.stragglers.push(partitionId);

    const speculativeMetrics = new PartitionQueryMetrics(partitionId);
    speculativeMetrics.isSpeculative = true;
    speculativeMetrics.start();

    const speculativePromise = this.executeQueryOnService(
      alternativeReplica,
      sql,
      params,
    ).then((result) => {
      speculativeMetrics.complete(result.rows?.length || 0);
      if (!results.has(partitionId)) {
        results.set(partitionId, result);
        pendingPartitions.delete(partitionId);
      }
      return result;
    }).catch((error) => {
      speculativeMetrics.fail(error);
      return {success: false, error: error.message, rows: []};
    });

    speculativePromises.set(partitionId, {promise: speculativePromise});
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
  async executeOnPartitionWithMetrics(sql, partitionId, params, metrics) {
    const partitionMetrics = new PartitionQueryMetrics(partitionId);
    partitionMetrics.start();

    const partition = this.getPartition(partitionId);
    if (!partition) {
      partitionMetrics.fail(new Error(QUERY_ERROR_MSG.PARTITION_NOT_FOUND));
      metrics.addPartitionMetrics(partitionMetrics);
      return {
        partitionId,
        success: false,
        error: QUERY_ERROR_MSG.PARTITION_NOT_FOUND,
        rows: [],
      };
    }

    try {
      const result = await this.executeQueryOnService(partition, sql, params);
      const rowCount = result.rows?.length || 0;
      const bytesRead = this.estimateResultBytes(result.rows);
      partitionMetrics.complete(rowCount, bytesRead);
      metrics.addPartitionMetrics(partitionMetrics);

      return {
        partitionId,
        success: true,
        rows: result.rows || [],
        changes: result.changes,
      };
    } catch (error) {
      partitionMetrics.fail(error);
      metrics.addPartitionMetrics(partitionMetrics);

      return {
        partitionId,
        success: false,
        error: error.message,
        rows: [],
      };
    }
  }

  /**
   * Execute query on a service.
   * @param {Object} service - Partition or replica service.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryOnService(service, sql, params) {
    if (typeof service.executeQuery === 'function') {
      return service.executeQuery(sql, params);
    }
    throw new Error(QUERY_ERROR_MSG.SERVICE_EXECUTE_UNSUPPORTED);
  }

  /**
   * Estimate bytes in result rows.
   * @param {Array} rows - Result rows.
   * @return {number} Estimated bytes.
   * @private
   */
  estimateResultBytes(rows) {
    if (!rows || rows.length === 0) return 0;
    // Rough estimate: JSON stringify length * 2 for UTF-16
    try {
      return JSON.stringify(rows).length * 2;
    } catch {
      return rows.length * 100; // Fallback estimate
    }
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
   * Format metrics for response.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @return {Object} Formatted metrics.
   * @private
   */
  formatMetrics(metrics) {
    return {
      queryId: metrics.queryId,
      partitionCount: metrics.partitionCount,
      totalLatencyMs: metrics.totalLatencyMs,
      medianLatencyMs: metrics.getMedianLatency(),
      totalRows: metrics.totalRows,
      totalBytes: metrics.totalBytes,
      stragglers: metrics.stragglers,
      speculativeExecutions: metrics.speculativeExecutions,
      partitionLatencies: Array.from(metrics.partitionMetrics.values()).map((m) => ({
        partitionId: m.partitionId,
        latencyMs: m.latencyMs,
        status: m.status,
        rowCount: m.rowCount,
      })),
    };
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

export {
  ParallelQueryCoordinator,
  PartitionQueryMetrics,
  QueryExecutionMetrics,
};
