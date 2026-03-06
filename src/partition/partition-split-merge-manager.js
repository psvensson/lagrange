/**
 * Partition Split/Merge Manager - Handles partition splitting and merging operations.
 * Implements split at median PRIMARY KEY and merge of adjacent partitions.
 * Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 20.4, 20.8, 20.9, 31.7, 31.8, 31.9,
 *               31.10, 31.12, 31.13, 31.14, 31.15
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {NUM, SERVICE_TYPE} from '../constants/index.js';
import {
  PARTITION_TRANSITION_STATE,
  PARTITION_SUBSYSTEM,
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_ERROR_MSG,
  SPLIT_MERGE_EVENT,
  SPLIT_MERGE_ID,
  SPLIT_MERGE_LOG_MSG,
  SPLIT_MERGE_REASON,
  SPLIT_MERGE_SQL,
  SPLIT_MERGE_STATE,
} from './partition-constants.js';
import {
  ADMISSION_DECISION,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from '../rebalancer/storage-capacity-constants.js';
import {KeyRange} from './key-range-manager.js';

const OperationState = SPLIT_MERGE_STATE;
const DEFAULT_SPLIT_STORAGE_THRESHOLD = SPLIT_MERGE_DEFAULT.SPLIT_STORAGE_THRESHOLD_BYTES;
const DEFAULT_SPLIT_TRAFFIC_THRESHOLD = SPLIT_MERGE_DEFAULT.SPLIT_TRAFFIC_THRESHOLD_QPM;
const DEFAULT_MERGE_STORAGE_THRESHOLD = SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES;
const DEFAULT_MERGE_TRAFFIC_THRESHOLD = SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_THRESHOLD_QPM;
const DEFAULT_EVALUATION_INTERVAL_MS = SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS;

/**
 * PartitionSplitMergeManager handles automatic partition splitting and merging
 * based on storage and traffic thresholds.
 */
class PartitionSplitMergeManager extends EventEmitter {
  /**
   * Create a new PartitionSplitMergeManager.
   * @param {Object} options - Configuration options.
   * @param {Object} options.keyRangeManager - KeyRangeManager instance.
   * @param {Function} options.getPartitionMetrics - Function to get partition metrics.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {Function} options.createPartition - Function to create a new partition.
   * @param {Function} options.deletePartition - Function to delete a partition.
   */
  /**
     * Create a new PartitionSplitMergeManager.
     * @param {Object} options - Configuration options.
     * @param {Object} options.keyRangeManager - KeyRangeManager instance.
     * @param {Function} options.getPartitionMetrics - Function to get metrics.
     * @param {Object} options.tablePolicyService - TablePolicyService instance.
     * @param {Function} options.createPartition - Create a new partition.
     * @param {Function} options.deletePartition - Delete a partition.
     * @param {Object} [options.storageAdmissionService] - Admission gate.
     * @param {Object} [options.storageAccountingService] - Accounting owner.
     */
    constructor(options = {}) {
      super();

      this.keyRangeManager = options.keyRangeManager || null;
      this.getPartitionMetrics = options.getPartitionMetrics || (() => ({}));
      this.listPartitions = options.listPartitions || null;
      this.tablePolicyService = options.tablePolicyService || null;
      this.createPartition = options.createPartition || (() => {});
      this.deletePartition = options.deletePartition || (() => {});
      this.executeSplitCandidate = options.executeSplitCandidate || null;
      this.executeMergeCandidate = options.executeMergeCandidate || null;
      this.autoExecuteCandidates = options.autoExecuteCandidates !== false;
      this.storageAdmissionService =
        options.storageAdmissionService || null;
      this.storageAccountingService =
        options.storageAccountingService || null;

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.splitStorageThreshold =
        config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES) ||
        SPLIT_MERGE_DEFAULT.SPLIT_STORAGE_THRESHOLD_BYTES;
      this.splitTrafficThreshold =
        config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM) ||
        SPLIT_MERGE_DEFAULT.SPLIT_TRAFFIC_THRESHOLD_QPM;
      this.mergeStorageThreshold =
        config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES) ||
        SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES;
      this.mergeTrafficThreshold =
        config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM) ||
        SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_THRESHOLD_QPM;
      this.evaluationIntervalMs =
        config.get(CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS) ||
        SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS;
      this.splitAmplificationFactor = this.getNumericConfig(
        config,
        STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR,
        STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR,
      );

      // State
      this.state = OperationState.IDLE;
      this.evaluationTimer = null;
      this.allowManagedSplitDuringEvaluation = false;

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ?
        loggingService.forSubsystem(PARTITION_SUBSYSTEM.SPLIT_MERGE) :
        console;
    }

  /**
   * Get the table policy for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy(partitionId) {
    if (this.tablePolicyService) {
      return this.tablePolicyService.getPolicyForPartition(partitionId);
    }
    return {};
  }

  /**
   * Resolve a numeric config value with fallback.
   * @param {Object} config - ConfigurationManager instance.
   * @param {string} key - Config key.
   * @param {number} fallback - Default value.
   * @return {number}
   * @private
   */
  getNumericConfig(config, key, fallback) {
    const value = config.get(key);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }

  /**
   * List partitions eligible for evaluation.
   * Falls back to KeyRangeManager partition IDs for legacy/unit-test paths.
   * @return {Promise<Array>} Partition descriptors or partition IDs.
   * @private
   */
  async loadEvaluationPartitions() {
    if (typeof this.listPartitions === 'function') {
      const partitions = await this.listPartitions();
      return Array.isArray(partitions) ? partitions : [];
    }
    if (!this.keyRangeManager) {
      return [];
    }
    return this.keyRangeManager.getAllPartitions();
  }

  /**
   * Normalize a partition identifier from either a string or row object.
   * @param {string|Object} partition - Partition descriptor.
   * @return {string|null} Partition ID.
   * @private
   */
  getPartitionId(partition) {
    if (typeof partition === 'string') {
      return partition;
    }
    if (!partition || typeof partition !== 'object') {
      return null;
    }
    return partition.partition_id || partition.partitionId || null;
  }

  /**
   * Resolve table ID for grouping partition rows.
   * @param {Object} partition - Partition descriptor.
   * @return {string|null} Table ID.
   * @private
   */
  getPartitionTableId(partition) {
    if (!partition || typeof partition !== 'object') {
      return null;
    }
    return partition.table_id || partition.tableId || null;
  }

  /**
   * Resolve partition sort start key for adjacency ordering.
   * @param {Object} partition - Partition descriptor.
   * @return {*} Start key.
   * @private
   */
  getPartitionStartKey(partition) {
    if (!partition || typeof partition !== 'object') {
      return null;
    }
    return partition.partition_key_start ?? partition.partitionKeyStart ?? null;
  }

  /**
   * Resolve partition sort end key for adjacency ordering.
   * @param {Object} partition - Partition descriptor.
   * @return {*} End key.
   * @private
   */
  getPartitionEndKey(partition) {
    if (!partition || typeof partition !== 'object') {
      return null;
    }
    return partition.partition_key_end ?? partition.partitionKeyEnd ?? null;
  }

  /**
   * Compare partition key values with NULL representing unbounded edges.
   * @param {*} left - Left key.
   * @param {*} right - Right key.
   * @return {number} Sort order.
   * @private
   */
  comparePartitionKeys(left, right) {
    if (left === right) {
      return NUM.ZERO;
    }
    if (left === null || left === undefined) {
      return NUM.NEGATIVE_ONE;
    }
    if (right === null || right === undefined) {
      return NUM.ONE;
    }
    if (left < right) {
      return NUM.NEGATIVE_ONE;
    }
    if (left > right) {
      return NUM.ONE;
    }
    return NUM.ZERO;
  }

  /**
   * Normalize a key range from either a KeyRange or a plain object.
   * Treat omitted bounds as unbounded edges.
   * @param {KeyRange|Object|null} range - Range descriptor.
   * @return {KeyRange|null} Normalized range.
   * @private
   */
  normalizeKeyRange(range) {
    if (!range || typeof range !== 'object') {
      return null;
    }
    if (range instanceof KeyRange) {
      return range.clone();
    }
    return new KeyRange(range.start ?? null, range.end ?? null);
  }

  /**
   * Sort partition rows for merge adjacency checks.
   * @param {Array} partitions - Partition descriptors.
   * @return {Array<Object>} Sorted partition rows.
   * @private
   */
  sortEvaluationPartitions(partitions) {
    return [...partitions]
      .filter((partition) => partition && typeof partition === 'object')
      .sort((left, right) => {
        const tableOrder = this.comparePartitionKeys(
          this.getPartitionTableId(left),
          this.getPartitionTableId(right),
        );
        if (tableOrder !== NUM.ZERO) {
          return tableOrder;
        }
        return this.comparePartitionKeys(
          this.getPartitionStartKey(left),
          this.getPartitionStartKey(right),
        );
      });
  }

  /**
   * Load metrics for a partition ID or row object.
   * @param {string|Object} partition - Partition descriptor.
   * @return {Promise<Object>} Metrics payload.
   * @private
   */
  async resolvePartitionMetrics(partition) {
    const partitionId = this.getPartitionId(partition);
    const rawMetrics = partitionId ?
      await this.getPartitionMetrics(partitionId, partition) :
      {};
    const metrics = rawMetrics && typeof rawMetrics === 'object' ?
      {...rawMetrics} :
      {};

    if ((metrics.sizeBytes === undefined || metrics.sizeBytes === null) &&
        partition &&
        typeof partition === 'object') {
      const sizeBytes = Number(
        partition.size_bytes ?? partition.sizeBytes ?? NUM.ZERO,
      );
      metrics.sizeBytes = Number.isFinite(sizeBytes) ? sizeBytes : NUM.ZERO;
    }

    if (metrics.queriesPerMinute === undefined ||
        metrics.queriesPerMinute === null) {
      metrics.queriesPerMinute = NUM.ZERO;
    }

    return metrics;
  }

  /**
   * Execute one split candidate when a runtime owner is provided.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object|null>} Execution result.
   * @private
   */
  async executeManagedSplitCandidate(partitionId) {
    if (!partitionId ||
        !this.autoExecuteCandidates ||
        typeof this.executeSplitCandidate !== 'function') {
      return null;
    }
    this.allowManagedSplitDuringEvaluation = true;
    try {
      return await this.executeSplitCandidate(partitionId);
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
      return 'executed';
    }
    const state = String(execution.state || '').toLowerCase();
    if (state === PARTITION_TRANSITION_STATE.BLOCKED ||
        state === PARTITION_TRANSITION_STATE.DEFERRED) {
      return 'deferred';
    }
    return 'error';
  }

  /**
   * Resolve a stable error message for a managed split execution.
   * @param {Object} execution - Managed split execution result.
   * @return {string} Error message.
   * @private
   */
  resolveManagedSplitExecutionError(execution) {
    if (typeof execution?.error === 'string' && execution.error.length > 0) {
      return execution.error;
    }
    return SPLIT_MERGE_ERROR_MSG.MANAGED_SPLIT_EXECUTION_FAILED;
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
    if (outcome === 'executed') {
      results.executedSplits.push(execution);
      return;
    }

    if (outcome === 'deferred') {
      this.logger.warn(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_DEFERRED, {
        partitionId,
        state: execution.state || null,
        workflowId: execution.workflowId || null,
      });
      results.splitDeferred.push({
        partitionId,
        reason: execution.state || PARTITION_TRANSITION_STATE.DEFERRED,
        execution,
      });
      this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, {
        partitionId,
        reason: execution.state || PARTITION_TRANSITION_STATE.DEFERRED,
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
   * Run capacity preflight for a split-derived replica creation.
   *
   * Estimates the bytes needed for the split (including write-
   * amplification reservation) and delegates to the admission
   * service. Returns a structured result with decision, reason,
   * and projected utilization.
   *
   * Requirements: 7.1, 7.2, 7.4, 7.5
   *
   * @param {string} partitionId - Partition being split.
   * @param {Object} metrics - Partition metrics with sizeBytes.
   * @param {string} targetNodeId - Node that would host the
   *   split-derived replica.
   * @return {Promise<Object>} Preflight result with
   *   {feasible, reason, admissionResult}.
   */
  async checkSplitCapacityPreflight(
    partitionId, metrics, targetNodeId,
  ) {
    if (!this.storageAdmissionService ||
        !this.storageAccountingService) {
      throw new Error(
        SPLIT_MERGE_ERROR_MSG.SPLIT_PREFLIGHT_OWNER_REQUIRED,
      );
    }

    const sizeBytes = metrics.sizeBytes || NUM.ZERO;
    const estimatedBytes =
      this.storageAccountingService.estimateReplicaBytes({
        entityType: SERVICE_TYPE.PARTITION,
        sizeBytes,
        amplificationFactor: this.splitAmplificationFactor,
      });

    const admissionResult =
      await this.storageAdmissionService.checkSplit({
        targetNodeId,
        estimatedBytes,
      });

    const feasible =
      admissionResult.decision === ADMISSION_DECISION.ALLOW;

    this.logger.info(SPLIT_MERGE_LOG_MSG.SPLIT_CAPACITY_PREFLIGHT, {
      partitionId,
      targetNodeId,
      sizeBytes,
      estimatedBytes,
      amplificationFactor: this.splitAmplificationFactor,
      decision: admissionResult.decision,
      reason: admissionResult.reason,
    });

    return {
      feasible,
      reason: feasible ?
        SPLIT_MERGE_REASON.CAPACITY_AVAILABLE :
        SPLIT_MERGE_REASON.INSUFFICIENT_CAPACITY,
      admissionResult,
    };
  }

  /**
   * Calculate the median PRIMARY KEY value for a partition.
   * @param {string} partitionId - Partition ID.
   * @param {Object} partitionService - PartitionService instance.
   * @param {string} tableName - Table name.
   * @param {string} primaryKeyColumn - PRIMARY KEY column name.
   * @return {Promise<*>} Median key value.
   */
  async calculateMedianKey(partitionId, partitionService, tableName, primaryKeyColumn) {
    if (!partitionService || !tableName || !primaryKeyColumn) {
      throw new Error(SPLIT_MERGE_LOG_MSG.MISSING_MEDIAN_PARAMS);
    }

    this.logger.debug(SPLIT_MERGE_LOG_MSG.CALCULATING_MEDIAN_KEY, {
      partitionId,
      tableName,
      primaryKeyColumn,
    });

    // Get total count
    const countResult = await partitionService.executeQuery(
      SPLIT_MERGE_SQL.countRows(tableName),
    );

    const totalRows = countResult.rows[NUM.ZERO]?.total || NUM.ZERO;
    if (totalRows < NUM.TWO) {
      throw new Error(SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT);
    }

    const medianOffset = Math.floor(totalRows / NUM.TWO);

    // Get median value using OFFSET
    const medianResult = await partitionService.executeQuery(
      SPLIT_MERGE_SQL.selectMedian(primaryKeyColumn, tableName),
      [medianOffset],
    );

    if (!medianResult.rows || medianResult.rows.length === NUM.ZERO) {
      throw new Error(SPLIT_MERGE_LOG_MSG.FAILED_MEDIAN_CALC);
    }

    const medianKey = medianResult.rows[NUM.ZERO][primaryKeyColumn];

    this.logger.debug(SPLIT_MERGE_LOG_MSG.CALCULATED_MEDIAN_KEY, {
      partitionId,
      medianKey,
      totalRows,
      medianOffset,
    });

    return medianKey;
  }


  /**
   * Evaluate if a partition should be split.
   * Split criteria: storage >= threshold OR traffic >= threshold
   * @param {string} partitionId - Partition ID.
   * @param {Object} metrics - Partition metrics {sizeBytes, queriesPerMinute}.
   * @param {Object} policy - Table policy with optional custom thresholds.
   * @return {boolean} True if partition should be split.
   */
  evaluateSplitCriteria(partitionId, metrics, policy = {}) {
    const storageThreshold = policy.splitStorageThreshold || this.splitStorageThreshold;
    const trafficThreshold = policy.splitTrafficThreshold || this.splitTrafficThreshold;

    const sizeBytes = metrics.sizeBytes || NUM.ZERO;
    const queriesPerMinute = metrics.queriesPerMinute || NUM.ZERO;

    // Split if EITHER threshold is exceeded
    const shouldSplit = sizeBytes >= storageThreshold ||
                        queriesPerMinute >= trafficThreshold;

    this.logger.debug(SPLIT_MERGE_LOG_MSG.EVALUATED_SPLIT_CRITERIA, {
      partitionId,
      sizeBytes,
      queriesPerMinute,
      storageThreshold,
      trafficThreshold,
      shouldSplit,
    });

    return shouldSplit;
  }

  /**
   * Evaluate if two adjacent partitions should be merged.
   * Merge criteria: combined storage <= threshold AND combined traffic <= threshold
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {Object} leftMetrics - Left partition metrics.
   * @param {Object} rightMetrics - Right partition metrics.
   * @param {Object} policy - Table policy with optional custom thresholds.
   * @return {boolean} True if partitions should be merged.
   */
  evaluateMergeCriteria(leftPartitionId, rightPartitionId, leftMetrics, rightMetrics,
    policy = {}) {
    const storageThreshold = policy.mergeStorageThreshold || this.mergeStorageThreshold;
    const trafficThreshold = policy.mergeTrafficThreshold || this.mergeTrafficThreshold;

    const combinedStorage = (leftMetrics.sizeBytes || NUM.ZERO) +
      (rightMetrics.sizeBytes || NUM.ZERO);
    const combinedTraffic = (leftMetrics.queriesPerMinute || NUM.ZERO) +
      (rightMetrics.queriesPerMinute || NUM.ZERO);

    // Merge if BOTH thresholds are satisfied
    const shouldMerge = combinedStorage <= storageThreshold &&
                        combinedTraffic <= trafficThreshold;

    this.logger.debug(SPLIT_MERGE_LOG_MSG.EVALUATED_MERGE_CRITERIA, {
      leftPartitionId,
      rightPartitionId,
      combinedStorage,
      combinedTraffic,
      storageThreshold,
      trafficThreshold,
      shouldMerge,
    });

    return shouldMerge;
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
        phase: 'split_plan',
      });

      this.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, result);
      return result;
    } catch (error) {
      this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_PLAN_FAILED, {
        partitionId,
        error: error.message,
        phase: 'split_plan',
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


  /**
   * Start periodic evaluation of split/merge criteria.
   * Evaluates every 5 minutes by default.
   */
  startPeriodicEvaluation() {
    if (this.evaluationTimer) {
      return;
    }

    this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_PERIODIC_EVAL, {
      intervalMs: this.evaluationIntervalMs,
    });

    this.evaluationTimer = setInterval(() => {
      this.evaluateAllPartitions().catch((error) => {
        this.logger.error(SPLIT_MERGE_LOG_MSG.PERIODIC_EVAL_FAILED, {
          error: error.message,
        });
      });
    }, this.evaluationIntervalMs);
    this.evaluationTimer.unref();
  }

  /**
   * Stop periodic evaluation.
   */
  stopPeriodicEvaluation() {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
      this.logger.info(SPLIT_MERGE_LOG_MSG.STOPPED_PERIODIC_EVAL);
    }
  }

  /**
   * Evaluate all partitions for split/merge operations.
   * @return {Promise<Object>} Evaluation results.
   */
  /**
     * Evaluate all partitions for split/merge operations.
     *
     * Split candidates that fail capacity preflight are moved to
     * splitDeferred with reason codes (Req 7.2, 7.4). Merge
     * candidates are never blocked by capacity pressure (Req 7.3).
     *
     * @param {Object} [preflightOptions] - Optional preflight config.
     * @param {string} [preflightOptions.targetNodeId] - Node to check
     *   capacity against for split preflight.
     * @return {Promise<Object>} Evaluation results.
     */
    async evaluateAllPartitions(preflightOptions = {}) {
      if (this.state !== OperationState.IDLE) {
        this.logger.debug(SPLIT_MERGE_LOG_MSG.SKIPPING_EVAL_BUSY, {
          state: this.state,
        });
        return {evaluated: false, reason: SPLIT_MERGE_REASON.BUSY};
      }

      this.state = OperationState.EVALUATING;

      try {
        const results = {
          evaluated: true,
          partitionsEvaluated: NUM.ZERO,
          splitCandidates: [],
          executedSplits: [],
          splitErrors: [],
          splitDeferred: [],
          mergeCandidates: [],
        };

        const partitions = await this.loadEvaluationPartitions();
        if (partitions.length === NUM.ZERO) {
          return results;
        }
        results.partitionsEvaluated = partitions.length;
        const targetNodeId = preflightOptions.targetNodeId || null;

        for (const partition of partitions) {
          const partitionId = this.getPartitionId(partition);
          if (!partitionId) {
            continue;
          }
          const metrics = await this.resolvePartitionMetrics(partition);
          const policy = await this.getTablePolicy(partitionId);

          if (!this.evaluateSplitCriteria(
            partitionId, metrics, policy)) {
            continue;
          }

          // Capacity preflight for split candidates
          if (targetNodeId) {
            const preflight =
              await this.checkSplitCapacityPreflight(
                partitionId, metrics, targetNodeId,
              );
            if (preflight.feasible) {
              this.logger.debug(
                SPLIT_MERGE_LOG_MSG.SPLIT_CAPACITY_ALLOWED, {
                  partitionId,
                  targetNodeId,
                });
              results.splitCandidates.push(partitionId);
            } else {
              this.logger.warn(
                SPLIT_MERGE_LOG_MSG.SPLIT_DEFERRED_CAPACITY, {
                  partitionId,
                  targetNodeId,
                  reason: preflight.reason,
                });
              results.splitDeferred.push({
                partitionId,
                reason: preflight.reason,
                admissionResult: preflight.admissionResult,
              });
              this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, {
                partitionId,
                reason: preflight.reason,
              });
            }
          } else {
            results.splitCandidates.push(partitionId);
          }
        }

        for (const partitionId of results.splitCandidates) {
          try {
            const execution = await this.executeManagedSplitCandidate(partitionId);
            this.recordManagedSplitExecutionOutcome(
              results,
              partitionId,
              execution,
            );
          } catch (error) {
            this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_FAILED, {
              partitionId,
              error: error.message,
              phase: 'workflow_execution',
            });
            results.splitErrors.push({
              partitionId,
              error: error.message,
            });
          }
        }

        // Merge eligibility is never blocked by capacity pressure
        // (Req 7.3). Merges reduce storage usage and remain
        // eligible even under hard/exhausted pressure.
        const sortedPartitions = this.keyRangeManager ?
          this.keyRangeManager.getSortedPartitions() :
          this.sortEvaluationPartitions(partitions);
        for (
          let i = NUM.ZERO;
          i < sortedPartitions.length - NUM.ONE;
          i++
        ) {
          const leftPartition = sortedPartitions[i];
          const rightPartition = sortedPartitions[i + NUM.ONE];
          const leftId = this.keyRangeManager ?
            leftPartition.partitionId :
            this.getPartitionId(leftPartition);
          const rightId = this.keyRangeManager ?
            rightPartition.partitionId :
            this.getPartitionId(rightPartition);
          if (!leftId || !rightId) {
            continue;
          }
          if (!this.keyRangeManager &&
              this.getPartitionTableId(leftPartition) !==
                this.getPartitionTableId(rightPartition)) {
            continue;
          }
          if (!this.keyRangeManager &&
              this.comparePartitionKeys(
                this.getPartitionEndKey(leftPartition),
                this.getPartitionStartKey(rightPartition),
              ) !== NUM.ZERO) {
            continue;
          }

          const leftMetrics = await this.resolvePartitionMetrics(leftPartition);
          const rightMetrics = await this.resolvePartitionMetrics(rightPartition);
          const policy = await this.getTablePolicy(leftId);

          if (this.evaluateMergeCriteria(
            leftId, rightId, leftMetrics, rightMetrics, policy,
          )) {
            results.mergeCandidates.push({leftId, rightId});
            this.logger.debug(
              SPLIT_MERGE_LOG_MSG.MERGE_ELIGIBLE_UNDER_PRESSURE, {
                leftId,
                rightId,
              });
          }
        }

        this.logger.debug(SPLIT_MERGE_LOG_MSG.PARTITION_EVAL_COMPLETED,
          {
            partitionsEvaluated: results.partitionsEvaluated,
            splitCandidates: results.splitCandidates.length,
            splitDeferred: results.splitDeferred.length,
            mergeCandidates: results.mergeCandidates.length,
          });

        this.emit(
          SPLIT_MERGE_EVENT.EVALUATION_COMPLETED, results);
        return results;
      } finally {
        this.state = OperationState.IDLE;
      }
    }

  /**
   * Get the current operation state.
   * @return {string} Current state.
   */
  getState() {
    return this.state;
  }

  /**
   * Get the configured thresholds.
   * @return {Object} Threshold configuration.
   */
  getThresholds() {
    return {
      splitStorageThreshold: this.splitStorageThreshold,
      splitTrafficThreshold: this.splitTrafficThreshold,
      mergeStorageThreshold: this.mergeStorageThreshold,
      mergeTrafficThreshold: this.mergeTrafficThreshold,
      evaluationIntervalMs: this.evaluationIntervalMs,
    };
  }

  /**
   * Update thresholds dynamically.
   * @param {Object} thresholds - New threshold values.
   */
  setThresholds(thresholds) {
    if (thresholds.splitStorageThreshold !== undefined) {
      this.splitStorageThreshold = thresholds.splitStorageThreshold;
    }
    if (thresholds.splitTrafficThreshold !== undefined) {
      this.splitTrafficThreshold = thresholds.splitTrafficThreshold;
    }
    if (thresholds.mergeStorageThreshold !== undefined) {
      this.mergeStorageThreshold = thresholds.mergeStorageThreshold;
    }
    if (thresholds.mergeTrafficThreshold !== undefined) {
      this.mergeTrafficThreshold = thresholds.mergeTrafficThreshold;
    }
    if (thresholds.evaluationIntervalMs !== undefined) {
      this.evaluationIntervalMs = thresholds.evaluationIntervalMs;
    }

    this.logger.info(SPLIT_MERGE_LOG_MSG.THRESHOLDS_UPDATED, this.getThresholds());
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    this.stopPeriodicEvaluation();
    this.removeAllListeners();
    this.logger.info(SPLIT_MERGE_LOG_MSG.MANAGER_SHUTDOWN);
  }
}

export {
  PartitionSplitMergeManager,
  OperationState,
  DEFAULT_SPLIT_STORAGE_THRESHOLD,
  DEFAULT_SPLIT_TRAFFIC_THRESHOLD,
  DEFAULT_MERGE_STORAGE_THRESHOLD,
  DEFAULT_MERGE_TRAFFIC_THRESHOLD,
  DEFAULT_EVALUATION_INTERVAL_MS,
};
