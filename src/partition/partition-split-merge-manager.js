/**
 * Partition Split/Merge Manager - Handles partition splitting and merging operations.
 * Implements split at median PRIMARY KEY and merge of adjacent partitions.
 * Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 20.4, 20.8, 20.9, 31.7, 31.8, 31.9,
 *               31.10, 31.12, 31.13, 31.14, 31.15
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  PARTITION_SUBSYSTEM,
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_STATE,
} from './partition-constants.js';
import {
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from '../rebalancer/storage-capacity-constants.js';
import {
  createPartitionSplitMergeManagerCoreMethods,
} from './partition-split-merge-manager-core-methods.js';
import {
  createPartitionSplitMergeManagerTransitionMethods,
} from './partition-split-merge-manager-transition-methods.js';
import {
  createPartitionSplitMergeManagerEvaluationMethods,
} from './partition-split-merge-manager-evaluation-methods.js';

const OperationState = SPLIT_MERGE_STATE;
const DEFAULT_SPLIT_STORAGE_THRESHOLD = SPLIT_MERGE_DEFAULT.SPLIT_STORAGE_THRESHOLD_BYTES;
const DEFAULT_SPLIT_TRAFFIC_THRESHOLD = SPLIT_MERGE_DEFAULT.SPLIT_TRAFFIC_THRESHOLD_QPM;
const DEFAULT_MERGE_STORAGE_THRESHOLD = SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES;
const DEFAULT_MERGE_TRAFFIC_THRESHOLD = SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_THRESHOLD_QPM;
const DEFAULT_EVALUATION_INTERVAL_MS = SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS;
const DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION = 1;
const DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION = 1;
const DEFAULT_REACTIVE_EVALUATION_DEBOUNCE_MS = 1000;
const DEFAULT_EVALUATION_TRIGGER = 'direct_call';
const REACTIVE_EVALUATION_TRIGGER = 'reactive_request';
const PERIODIC_EVALUATION_TRIGGER = 'periodic_timer';
const REACTIVE_PRESSURE_BYPASS_REASON_WRITE_ACTIVITY = 'write_activity';
/**
 * Clone one list of string-like values into a stable diagnostics array.
 * @param {Array<*>} values
 * @return {Array<string>}
 */
function cloneStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const cloned = [];
  for (const value of values) {
    const normalizedValue = String(value || '');
    if (!normalizedValue || cloned.includes(normalizedValue)) {
      continue;
    }
    cloned.push(normalizedValue);
  }
  return cloned;
}

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
    this.maxAutoExecuteSplitsPerEvaluation =
        Number.isInteger(options.maxAutoExecuteSplitsPerEvaluation) &&
        options.maxAutoExecuteSplitsPerEvaluation >= 0 ?
          options.maxAutoExecuteSplitsPerEvaluation :
          DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION;
    this.maxAutoExecuteMergesPerEvaluation =
        Number.isInteger(options.maxAutoExecuteMergesPerEvaluation) &&
        options.maxAutoExecuteMergesPerEvaluation >= 0 ?
          options.maxAutoExecuteMergesPerEvaluation :
          DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION;
    this.storageAdmissionService =
        options.storageAdmissionService || null;
    this.storageAccountingService =
        options.storageAccountingService || null;
    this.nodeId = options.nodeId || null;
    this.messageRouter = options.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;

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
    this.reactiveEvaluationDebounceMs =
        Number.isInteger(options.reactiveEvaluationDebounceMs) &&
        options.reactiveEvaluationDebounceMs >= 0 ?
          options.reactiveEvaluationDebounceMs :
          DEFAULT_REACTIVE_EVALUATION_DEBOUNCE_MS;
    this.requestedEvaluation = null;
    this.requestedEvaluationTimer = null;
    this.requestedEvaluationDueAtMs = null;
    this.deferredRetryEvaluation = null;
    this.deferredRetryEvaluationDueAtMs = null;
    this.deferredRetryEvaluationTimer = null;
    this.isShutdown = false;
    this.lastEvaluationRequestedAtMs = null;
    this.lastEvaluationStartedAtMs = null;
    this.lastEvaluationCompletedAtMs = null;
    this.lastEvaluationDurationMs = null;
    this.lastEvaluationError = null;
    this.lastEvaluationSummary = null;
    this.lastEvaluationTrigger = null;
    this.lastEvaluationReasonCodes = [];
    this.lastEvaluationPartitionIds = [];

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.SPLIT_MERGE) :
      console;
  }
}

Object.assign(
  PartitionSplitMergeManager.prototype,
  createPartitionSplitMergeManagerCoreMethods(),
  createPartitionSplitMergeManagerTransitionMethods(),
  createPartitionSplitMergeManagerEvaluationMethods({
    cloneStringArray,
    operationState: OperationState,
    defaultEvaluationTrigger: DEFAULT_EVALUATION_TRIGGER,
    periodicEvaluationTrigger: PERIODIC_EVALUATION_TRIGGER,
    reactiveEvaluationTrigger: REACTIVE_EVALUATION_TRIGGER,
    reactivePressureBypassReasonWriteActivity:
      REACTIVE_PRESSURE_BYPASS_REASON_WRITE_ACTIVITY,
  }),
);

export {
  PartitionSplitMergeManager,
  OperationState,
  DEFAULT_SPLIT_STORAGE_THRESHOLD,
  DEFAULT_SPLIT_TRAFFIC_THRESHOLD,
  DEFAULT_MERGE_STORAGE_THRESHOLD,
  DEFAULT_MERGE_TRAFFIC_THRESHOLD,
  DEFAULT_EVALUATION_INTERVAL_MS,
  DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION,
  DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION,
};
