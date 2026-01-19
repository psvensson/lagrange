/**
 * Partition Split/Merge Manager - Handles partition splitting and merging operations.
 * Implements split at median PRIMARY KEY and merge of adjacent partitions.
 * Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 20.4, 20.8, 20.9, 31.7, 31.8, 31.9,
 *               31.10, 31.12, 31.13, 31.14, 31.15
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {KeyRange} from './key-range-manager.js';

/**
 * Default thresholds for split/merge operations.
 */
const DEFAULT_SPLIT_STORAGE_THRESHOLD = 10 * 1024 * 1024 * 1024; // 10GB
const DEFAULT_SPLIT_TRAFFIC_THRESHOLD = 1000; // queries per minute
const DEFAULT_MERGE_STORAGE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2GB (20% of split)
const DEFAULT_MERGE_TRAFFIC_THRESHOLD = 200; // queries per minute (20% of split)
const DEFAULT_EVALUATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Partition split/merge operation states.
 */
const OperationState = {
  IDLE: 'IDLE',
  EVALUATING: 'EVALUATING',
  SPLITTING: 'SPLITTING',
  MERGING: 'MERGING',
};

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
   * @param {Function} options.getTablePolicy - Function to get table policy (deprecated).
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {Function} options.createPartition - Function to create a new partition.
   * @param {Function} options.deletePartition - Function to delete a partition.
   */
  constructor(options = {}) {
    super();

    this.keyRangeManager = options.keyRangeManager || null;
    this.getPartitionMetrics = options.getPartitionMetrics || (() => ({}));
    this.tablePolicyService = options.tablePolicyService || null;
    // Keep getTablePolicy for backward compatibility
    this._getTablePolicyFn = options.getTablePolicy || (() => ({}));
    this.createPartition = options.createPartition || (() => {});
    this.deletePartition = options.deletePartition || (() => {});

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.splitStorageThreshold = config.get('partition.splitStorageThreshold') ||
      DEFAULT_SPLIT_STORAGE_THRESHOLD;
    this.splitTrafficThreshold = config.get('partition.splitTrafficThreshold') ||
      DEFAULT_SPLIT_TRAFFIC_THRESHOLD;
    this.mergeStorageThreshold = config.get('partition.mergeStorageThreshold') ||
      DEFAULT_MERGE_STORAGE_THRESHOLD;
    this.mergeTrafficThreshold = config.get('partition.mergeTrafficThreshold') ||
      DEFAULT_MERGE_TRAFFIC_THRESHOLD;
    this.evaluationIntervalMs = config.get('partition.evaluationIntervalMs') ||
      DEFAULT_EVALUATION_INTERVAL_MS;

    // State
    this.state = OperationState.IDLE;
    this.evaluationTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('partition-split-merge') : console;
  }

  /**
   * Get the table policy for a partition.
   * Uses TablePolicyService if available, otherwise falls back to provided function.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy(partitionId) {
    // Use TablePolicyService if available (preferred)
    if (this.tablePolicyService) {
      return this.tablePolicyService.getPolicyForPartition(partitionId);
    }

    // Fallback to provided function
    return this._getTablePolicyFn(partitionId);
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
      throw new Error('Missing required parameters for median calculation');
    }

    this.logger.debug('Calculating median key', {
      partitionId,
      tableName,
      primaryKeyColumn,
    });

    // Get total count
    const countResult = await partitionService.executeQuery(
      `SELECT COUNT(*) as total FROM ${tableName}`,
    );

    const totalRows = countResult.rows[0]?.total || 0;
    if (totalRows < 2) {
      throw new Error('Partition has insufficient rows for split');
    }

    const medianOffset = Math.floor(totalRows / 2);

    // Get median value using OFFSET
    const medianResult = await partitionService.executeQuery(
      `SELECT ${primaryKeyColumn} FROM ${tableName} ` +
      `ORDER BY ${primaryKeyColumn} LIMIT 1 OFFSET ?`,
      [medianOffset],
    );

    if (!medianResult.rows || medianResult.rows.length === 0) {
      throw new Error('Failed to calculate median key');
    }

    const medianKey = medianResult.rows[0][primaryKeyColumn];

    this.logger.debug('Calculated median key', {
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

    const sizeBytes = metrics.sizeBytes || 0;
    const queriesPerMinute = metrics.queriesPerMinute || 0;

    // Split if EITHER threshold is exceeded
    const shouldSplit = sizeBytes >= storageThreshold ||
                        queriesPerMinute >= trafficThreshold;

    this.logger.debug('Evaluated split criteria', {
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

    const combinedStorage = (leftMetrics.sizeBytes || 0) + (rightMetrics.sizeBytes || 0);
    const combinedTraffic = (leftMetrics.queriesPerMinute || 0) +
                            (rightMetrics.queriesPerMinute || 0);

    // Merge if BOTH thresholds are satisfied
    const shouldMerge = combinedStorage <= storageThreshold &&
                        combinedTraffic <= trafficThreshold;

    this.logger.debug('Evaluated merge criteria', {
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

    if (this.state !== OperationState.IDLE) {
      throw new Error(`Cannot split: manager is in ${this.state} state`);
    }

    this.state = OperationState.SPLITTING;
    this.emit('splitStarted', {partitionId});

    try {
      this.logger.info('Starting partition split', {
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
      const currentRange = this.keyRangeManager ?
        this.keyRangeManager.getRange(partitionId) :
        partitionService.getKeyRange();

      if (!currentRange) {
        throw new Error(`Partition ${partitionId} not found in key range manager`);
      }

      // Generate new partition IDs
      const leftPartitionId = `${tableId}_p_${uuidv4().substring(0, 8)}_left`;
      const rightPartitionId = `${tableId}_p_${uuidv4().substring(0, 8)}_right`;

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

      this.logger.info('Partition split completed', {
        partitionId,
        leftPartitionId,
        rightPartitionId,
        medianKey,
      });

      this.emit('splitCompleted', result);
      return result;
    } catch (error) {
      this.logger.error('Partition split failed', {
        partitionId,
        error: error.message,
      });

      this.emit('splitFailed', {partitionId, error: error.message});
      throw error;
    } finally {
      this.state = OperationState.IDLE;
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
      throw new Error(`Cannot merge: manager is in ${this.state} state`);
    }

    this.state = OperationState.MERGING;
    this.emit('mergeStarted', {leftPartitionId, rightPartitionId});

    try {
      this.logger.info('Starting partition merge', {
        leftPartitionId,
        rightPartitionId,
      });

      // Get current key ranges
      if (!this.keyRangeManager) {
        throw new Error('KeyRangeManager is required for merge operations');
      }

      const leftRange = this.keyRangeManager.getRange(leftPartitionId);
      const rightRange = this.keyRangeManager.getRange(rightPartitionId);

      if (!leftRange) {
        throw new Error(`Left partition ${leftPartitionId} not found`);
      }
      if (!rightRange) {
        throw new Error(`Right partition ${rightPartitionId} not found`);
      }

      // Verify adjacency: left.end must equal right.start
      if (!leftRange.isAdjacentTo(rightRange)) {
        throw new Error(
          `Partitions are not adjacent: ${leftPartitionId} end (${leftRange.end}) ` +
          `!= ${rightPartitionId} start (${rightRange.start})`,
        );
      }

      // Generate merged partition ID
      const mergedPartitionId = `${tableId}_p_${uuidv4().substring(0, 8)}_merged`;

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

      this.logger.info('Partition merge completed', {
        leftPartitionId,
        rightPartitionId,
        mergedPartitionId,
      });

      this.emit('mergeCompleted', result);
      return result;
    } catch (error) {
      this.logger.error('Partition merge failed', {
        leftPartitionId,
        rightPartitionId,
        error: error.message,
      });

      this.emit('mergeFailed', {leftPartitionId, rightPartitionId, error: error.message});
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
        `Range integrity violation: left start (${leftRange.start}) ` +
        `!= original start (${originalRange.start})`,
      );
    }

    // Right range must end where original ended
    if (rightRange.end !== originalRange.end) {
      throw new Error(
        `Range integrity violation: right end (${rightRange.end}) ` +
        `!= original end (${originalRange.end})`,
      );
    }

    // Left end must equal right start (contiguous)
    if (!leftRange.isAdjacentTo(rightRange)) {
      throw new Error(
        'Range integrity violation: ranges not contiguous - ' +
        'left end (' + leftRange.end + ') != right start (' + rightRange.start + ')',
      );
    }

    // Ranges must not overlap
    if (leftRange.overlaps(rightRange)) {
      throw new Error('Range integrity violation: left and right ranges overlap');
    }

    this.logger.debug('Range integrity validated after split', {
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
        `Range integrity violation: merged start (${mergedRange.start}) ` +
        `!= left start (${leftRange.start})`,
      );
    }

    // Merged range must end where right ended
    if (mergedRange.end !== rightRange.end) {
      throw new Error(
        `Range integrity violation: merged end (${mergedRange.end}) ` +
        `!= right end (${rightRange.end})`,
      );
    }

    this.logger.debug('Range integrity validated after merge', {
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

    this.logger.info('Starting periodic split/merge evaluation', {
      intervalMs: this.evaluationIntervalMs,
    });

    this.evaluationTimer = setInterval(() => {
      this.evaluateAllPartitions().catch((error) => {
        this.logger.error('Periodic evaluation failed', {
          error: error.message,
        });
      });
    }, this.evaluationIntervalMs);
  }

  /**
   * Stop periodic evaluation.
   */
  stopPeriodicEvaluation() {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
      this.logger.info('Stopped periodic split/merge evaluation');
    }
  }

  /**
   * Evaluate all partitions for split/merge operations.
   * @return {Promise<Object>} Evaluation results.
   */
  async evaluateAllPartitions() {
    if (this.state !== OperationState.IDLE) {
      this.logger.debug('Skipping evaluation: manager is busy', {
        state: this.state,
      });
      return {evaluated: false, reason: 'busy'};
    }

    this.state = OperationState.EVALUATING;

    try {
      const results = {
        evaluated: true,
        partitionsEvaluated: 0,
        splitCandidates: [],
        mergeCandidates: [],
      };

      if (!this.keyRangeManager) {
        return results;
      }

      const partitions = this.keyRangeManager.getAllPartitions();
      results.partitionsEvaluated = partitions.length;

      for (const partitionId of partitions) {
        const metrics = await this.getPartitionMetrics(partitionId);
        const policy = await this.getTablePolicy(partitionId);

        // Check split criteria
        if (this.evaluateSplitCriteria(partitionId, metrics, policy)) {
          results.splitCandidates.push(partitionId);
        }
      }

      // Check merge criteria for adjacent pairs
      const sortedPartitions = this.keyRangeManager.getSortedPartitions();
      for (let i = 0; i < sortedPartitions.length - 1; i++) {
        const leftId = sortedPartitions[i].partitionId;
        const rightId = sortedPartitions[i + 1].partitionId;

        const leftMetrics = await this.getPartitionMetrics(leftId);
        const rightMetrics = await this.getPartitionMetrics(rightId);
        const policy = await this.getTablePolicy(leftId);

        if (this.evaluateMergeCriteria(leftId, rightId, leftMetrics, rightMetrics, policy)) {
          results.mergeCandidates.push({leftId, rightId});
        }
      }

      this.logger.debug('Partition evaluation completed', {
        partitionsEvaluated: results.partitionsEvaluated,
        splitCandidates: results.splitCandidates.length,
        mergeCandidates: results.mergeCandidates.length,
      });

      this.emit('evaluationCompleted', results);
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

    this.logger.info('Thresholds updated', this.getThresholds());
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    this.stopPeriodicEvaluation();
    this.removeAllListeners();
    this.logger.info('PartitionSplitMergeManager shutdown');
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
