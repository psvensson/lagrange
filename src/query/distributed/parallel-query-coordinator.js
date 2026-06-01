/**
 * Parallel Query Coordinator - Executes queries across partitions in parallel.
 * Implements resource limits, timeout mechanisms, straggler detection,
 * speculative execution, and streaming aggregation.
 * Requirements: 26.1, 26.2, 26.3, 26.7, 26.8, 26.9, 26.10, 26.11, 26.12
 */

import {LoggingService} from '../../logging/logging-service.js';
import {ConfigurationManager} from '../../config/configuration-manager.js';
import {METRICS_LOG_TAG, NUM, TABLES, TYPEOF} from '../../constants/index.js';
import {
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
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
  normalizePartitionExecutionFailureSnapshot,
} from './parallel-query-partition-outcomes.js';

const LOCAL_NUM_ZERO = 0;

const QUERY_ID_PREFIX = 'q-';
const QUERY_CANCELLED_ERROR = 'Query cancelled';

const REPLICA_STATUS = Object.freeze({
  ACTIVE: 'active',
});

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
    this.partitionQueryExecutor = options.partitionQueryExecutor || null;
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
    if (this.partitionQueryExecutor) {
      this.speculativeExecutionEnabled = false;
    }

    // Track active queries for resource management
    this.activeConnections = NUM.ZERO;
    this.queryCounter = NUM.ZERO;
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
    if (typeof this.systemCache.get === TYPEOF.FUNCTION) {
      return this.systemCache.get(TABLES.PARTITIONS, partitionId);
    }
    if (typeof this.systemCache.filter === TYPEOF.FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.PARTITIONS,
        (partition) =>
          partition.partition_id === partitionId,
      );
      return matches[NUM.ZERO] || null;
    }
    if (typeof this.systemCache.getAll === TYPEOF.FUNCTION) {
      const partitions =
        this.systemCache.getAll(TABLES.PARTITIONS) || [];
      return partitions.find((partition) =>
        partition.partition_id === partitionId,
      ) || null;
    }
    return null;
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
        const maxPartitionLatencyMs = latencies.length > NUM.ZERO ?
          Math.max(...latencies) :
          NUM.ZERO;

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
    const chunkSize = Math.max(this.maxParallelPartitions, NUM.ONE);
    const chunks = [];
    for (let index = LOCAL_NUM_ZERO; index < partitionIds.length; index += chunkSize) {
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
    for (const partitionChunk of partitionChunks) {
      const chunkResults = await this.executeChunkWithTimeoutAndStragglers(
        sql,
        partitionChunk,
        params,
        metrics,
        options,
      );
      allResults.push(...chunkResults);
    }
    return allResults;
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
  ) {
    this.activeConnections += partitionIds.length;
    let timeoutId = null;
    const effectiveTimeoutMs = this.resolveTimeoutMs(options?.timeoutMs);
    const cancellationPromise = this.createCancellationPromise(
      options?.cancellationToken || null,
    );

    try {
      // Create execution promises for each partition
      const executionPromises = partitionIds.map((partitionId) =>
        this.executeOnPartitionWithMetrics(sql, partitionId, params, metrics, options),
      );

      // Create timeout promise with clearable timer
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(
            `${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX}` +
            `${effectiveTimeoutMs}${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX}`,
          ));
        }, effectiveTimeoutMs);
      });

      // Execute with straggler detection if enabled
      if (this.speculativeExecutionEnabled &&
        partitionIds.length > NUM.ONE) {
        const result = await this.executeWithSpeculativeExecution(
          executionPromises,
          partitionIds,
          sql,
          params,
          metrics,
          timeoutPromise,
          cancellationPromise,
        );
        // Clear timeout after speculative execution completes
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        return result;
      }

      // Simple parallel execution with timeout
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
   * Execute with speculative execution for stragglers.
   * Requirements: 26.10, 26.11
   * @param {Array} executionPromises - Original execution promises.
   * @param {Array} partitionIds - Partition IDs.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Promise} timeoutPromise - Timeout promise.
   * @param {Promise|null} cancellationPromise - Cancellation promise.
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
    cancellationPromise,
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
      if (medianLatency > NUM.ZERO &&
        pendingPartitions.size > NUM.ZERO) {
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
      const racePromises = [
        Promise.all(wrappedPromises),
        timeoutPromise,
      ];
      if (cancellationPromise) {
        racePromises.push(cancellationPromise);
      }
      await Promise.race(racePromises);

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
    if (replicas.length === NUM.ZERO) return;

    // Select a different replica
    const alternativeReplica = replicas.find((r) =>
      r.status === REPLICA_STATUS.ACTIVE || r.status === undefined,
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
      if (result && result.success === false) {
        speculativeMetrics.fail(
          new Error(result.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED),
          result,
        );
        return result;
      }
      speculativeMetrics.complete(result.rows?.length || NUM.ZERO);
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
  async executeOnPartitionWithMetrics(
    sql,
    partitionId,
    params,
    metrics,
    options = {},
  ) {
    const partitionMetrics = new PartitionQueryMetrics(partitionId);
    partitionMetrics.start();

    const partition = this.partitionQueryExecutor ?
      null :
      this.getPartition(partitionId);
    if (!this.partitionQueryExecutor && !partition) {
      partitionMetrics.fail(new Error(QUERY_ERROR_MSG.PARTITION_NOT_FOUND));
      metrics.addPartitionMetrics(partitionMetrics);
      return buildPartitionExecutionFailureOutcome(
        normalizePartitionExecutionFailureSnapshot(
          partitionId,
          partitionMetrics,
          {error: QUERY_ERROR_MSG.PARTITION_NOT_FOUND},
          QUERY_ERROR_MSG.PARTITION_NOT_FOUND,
        ),
      );
    }

    try {
      const result = await this.executeQueryOnService(
        partition,
        sql,
        params,
        partitionId,
        options,
      );
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
      const rowCount = result.rows?.length || NUM.ZERO;
      const bytesRead = estimateResultBytes(result.rows);
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
   * Execute query on a service.
   * @param {Object} service - Partition or replica service.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryOnService(service, sql, params, partitionId, options = {}) {
    if (this.partitionQueryExecutor) {
      return this.partitionQueryExecutor(sql, partitionId, params, options);
    }
    if (!service) {
      throw new Error(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND);
    }
    if (typeof service.executeQuery === TYPEOF.FUNCTION) {
      return service.executeQuery(sql, params);
    }
    throw new Error(QUERY_ERROR_MSG.SERVICE_EXECUTE_UNSUPPORTED);
  }

  /**
   * Resolve effective timeout from optional override.
   * @param {number|undefined|null} timeoutMs
   * @return {number}
   * @private
   */
  resolveTimeoutMs(timeoutMs) {
    if (Number.isFinite(timeoutMs) && timeoutMs > NUM.ZERO) {
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
      typeof cancellationToken.onCancel !== TYPEOF.FUNCTION) {
      return null;
    }

    return new Promise((_, reject) => {
      const rejectWithReason = (reason) => {
        reject(new Error(reason || QUERY_CANCELLED_ERROR));
      };
      cancellationToken.onCancel(rejectWithReason);
      if (typeof cancellationToken.isCancelled === TYPEOF.FUNCTION &&
        cancellationToken.isCancelled()) {
        const reason = typeof cancellationToken.getReason === TYPEOF.FUNCTION ?
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
    if (medianLatency === NUM.ZERO) return;

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
