import {SERVICE_TYPE} from '../constants/index.js';
import {readPolicyForPartition} from '../policy/table-policy-resolution.js';
import {ADMISSION_DECISION} from '../rebalancer/storage-capacity-constants.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';
import {
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {KeyRange} from './key-range-manager.js';
import {compareRoutingKeys} from './split-key-comparator.js';
import {
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_ERROR_MSG,
  SPLIT_MERGE_LOG_MSG,
  SPLIT_MERGE_REASON,
  SPLIT_MERGE_SQL,
} from './partition-constants.js';
import {
  hasTrafficSignal,
  resolveEffectiveMergeThresholds,
  resolveMergeDecision,
  resolvePairTrafficSpanMs,
  resolvePartitionCreatedAtMs,
} from './partition-split-merge-policy.js';

const LOCAL_STR_PARTITION_SPLIT_EVALUATION = 'partition:split:evaluation';
const LOCAL_STR_CONTROL_PLANE_WRITE = 'control-plane:write';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const REACTIVE_EVALUATION_TRIGGER = 'reactive_request';
const REACTIVE_PRESSURE_BYPASS_REASON_WRITE_ACTIVITY = 'write_activity';
const EVALUATION_PARTITION_ERROR_MSG = Object.freeze({
  LIST_PARTITIONS_PROVIDER_REQUIRED:
    'PartitionSplitMergeManager requires a canonical listPartitions provider',
  INVALID_EVALUATION_PARTITIONS_LIST:
    'listPartitions must return an array of canonical partition descriptors',
  INVALID_PARTITION_DESCRIPTOR:
    'Partition evaluation requires canonical partition descriptor objects ' +
    'with a non-empty string partition_id',
});

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

class PartitionSplitMergeManagerCoreMethods {
  /**
   * Resolve the shared pressure-governor owner for this node.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure?.({
        messageRouter: this.messageRouter,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    });
    return this.pressureGovernor;
  }

  /**
   * Evaluate seed-local background split work against the canonical governor.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateSplitPressure(options = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: options.workClass || PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        LOCAL_STR_PARTITION_SPLIT_EVALUATION,
        LOCAL_STR_CONTROL_PLANE_WRITE,
      ],
    });
  }

  /**
   * Resolve stable reason codes for one evaluation invocation.
   * @param {Object} [preflightOptions={}]
   * @return {string[]}
   * @private
   */
  resolveEvaluationReasonCodes(preflightOptions = {}) {
    return cloneStringArray(
      Array.isArray(preflightOptions?.reasonCodes) ?
        preflightOptions.reasonCodes :
        [preflightOptions?.reasonCode, preflightOptions?.reason],
    );
  }

  /**
   * Reactive write-activity split evaluation must not self-starve behind the
   * same transport pressure that the write workload is generating. Keep the
   * bypass scoped to reactive write activity; periodic/background evaluation
   * remains deferable.
   *
   * @param {Object} [preflightOptions={}]
   * @return {boolean}
   * @private
   */
  shouldBypassSplitPressure(preflightOptions = {}) {
    if (this.resolveEvaluationTrigger(preflightOptions) !==
        REACTIVE_EVALUATION_TRIGGER) {
      return false;
    }
    return this.resolveEvaluationReasonCodes(preflightOptions)
      .includes(REACTIVE_PRESSURE_BYPASS_REASON_WRITE_ACTIVITY);
  }

  /**
   * Build a typed split execution deferral caused by node-local pressure.
   * @param {string} partitionId
   * @param {Object} decision
   * @return {Object}
   * @private
   */
  buildPressureDeferredExecution(partitionId, decision) {
    const retryAfterMs = Number.isFinite(decision?.retryAfterMs) ?
      decision.retryAfterMs :
      0;
    const nextAttemptAt = retryAfterMs > 0 ?
      new Date(Date.now() + retryAfterMs).toISOString() :
      null;
    return {
      success: false,
      partitionId,
      state: PARTITION_TRANSITION_STATE.DEFERRED,
      error: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
      retryScheduled: nextAttemptAt !== null,
      nextAttemptAt,
      retry: {
        nextAttemptAt,
        backoffMs: retryAfterMs,
        scheduledState: PARTITION_TRANSITION_STATE.DEFERRED,
      },
      pressureAction: decision?.action || null,
      pressureSummary: decision?.summary || null,
    };
  }

  /**
   * Get the table policy for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy(partitionId) {
    return readPolicyForPartition(this.tablePolicyService, partitionId);
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
    if (typeof value === LOCAL_STR_NUMBER && Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }

  /**
   * List canonical partition descriptors eligible for evaluation.
   * Requires the canonical listPartitions provider.
   * @return {Promise<Array<Object>>} Canonical partition descriptors.
   * @private
   */
  async loadEvaluationPartitions() {
    if (typeof this.listPartitions !== LOCAL_STR_FUNCTION) {
      throw new Error(
        EVALUATION_PARTITION_ERROR_MSG.LIST_PARTITIONS_PROVIDER_REQUIRED,
      );
    }
    const partitions = await this.listPartitions();
    if (!Array.isArray(partitions)) {
      throw new Error(
        EVALUATION_PARTITION_ERROR_MSG.INVALID_EVALUATION_PARTITIONS_LIST,
      );
    }
    for (const partition of partitions) {
      if (!this.getPartitionId(partition)) {
        throw new Error(
          EVALUATION_PARTITION_ERROR_MSG.INVALID_PARTITION_DESCRIPTOR,
        );
      }
    }
    return partitions;
  }

  /**
   * Read the canonical partition identifier from a partition descriptor row.
   * @param {Object} partition - Canonical partition descriptor.
   * @return {string|null} Partition ID.
   * @private
   */
  getPartitionId(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT ||
        Array.isArray(partition)) {
      return null;
    }
    return typeof partition.partition_id === LOCAL_STR_STRING &&
      partition.partition_id.length > 0 ?
      partition.partition_id :
      null;
  }

  /**
   * Read the canonical table ID for grouping partition rows.
   * @param {Object} partition - Canonical partition descriptor.
   * @return {string|null} Table ID.
   * @private
   */
  getPartitionTableId(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT ||
        Array.isArray(partition)) {
      return null;
    }
    return typeof partition.table_id === LOCAL_STR_STRING &&
      partition.table_id.length > 0 ?
      partition.table_id :
      null;
  }

  /**
   * Read the canonical partition sort start key for adjacency ordering.
   * @param {Object} partition - Canonical partition descriptor.
   * @return {*} Start key.
   * @private
   */
  getPartitionStartKey(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT ||
        Array.isArray(partition)) {
      return null;
    }
    return partition.partition_key_start ?? null;
  }

  /**
   * Read the canonical partition sort end key for adjacency ordering.
   * @param {Object} partition - Canonical partition descriptor.
   * @return {*} End key.
   * @private
   */
  getPartitionEndKey(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT ||
        Array.isArray(partition)) {
      return null;
    }
    return partition.partition_key_end ?? null;
  }

  /**
   * Compare partition key values with NULL representing unbounded edges.
   * @param {*} left - Left key.
   * @param {*} right - Right key.
   * @return {number} Sort order.
   * @private
   */
  comparePartitionKeys(left, right) {
    return compareRoutingKeys(left, right);
  }

  /**
   * Normalize a key range from either a KeyRange or a plain object.
   * Treat omitted bounds as unbounded edges.
   * @param {KeyRange|Object|null} range - Range descriptor.
   * @return {KeyRange|null} Normalized range.
   * @private
   */
  normalizeKeyRange(range) {
    if (!range || typeof range !== LOCAL_STR_OBJECT) {
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
      .filter((partition) => partition && typeof partition === LOCAL_STR_OBJECT)
      .sort((left, right) => {
        const tableOrder = this.comparePartitionKeys(
          this.getPartitionTableId(left),
          this.getPartitionTableId(right),
        );
        if (tableOrder !== 0) {
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
        typeof partition === LOCAL_STR_OBJECT) {
      const sizeBytes = Number(
        partition.size_bytes ?? 0,
      );
      metrics.sizeBytes = Number.isFinite(sizeBytes) ? sizeBytes : 0;
    }

    // No traffic signal stays null: a missing measurement is never read as
    // low load (the merge gate refuses it; the split gate ignores it).
    if (!hasTrafficSignal(metrics)) {
      metrics.queriesPerMinute = null;
    }
    // The durable age fact rides with the metrics: partitions.created_at.
    metrics.createdAtMs = resolvePartitionCreatedAtMs(partition);

    return metrics;
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

    const sizeBytes = metrics.sizeBytes || 0;
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

    const totalRows = countResult.rows[0]?.total || 0;
    if (totalRows < 2) {
      throw new Error(SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT);
    }

    const medianOffset = Math.floor(totalRows / 2);

    // Get median value using OFFSET
    const medianResult = await partitionService.executeQuery(
      SPLIT_MERGE_SQL.selectMedian(primaryKeyColumn, tableName),
      [medianOffset],
      {safeIntegers: true},
    );

    if (!medianResult.rows || medianResult.rows.length === 0) {
      throw new Error(SPLIT_MERGE_LOG_MSG.FAILED_MEDIAN_CALC);
    }

    const medianKey = medianResult.rows[0][primaryKeyColumn];

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
    // B1 (scale-safety): system-table partitions (INITIAL_PARTITION_IDS /
    // CRITICAL_SYSTEM_PARTITION_IDS, including priority control-plane and
    // logs-p1) must remain single canonical -p1 partitions on automatic
    // evaluation so single-partition local authoritative observation and
    // unrouted local system-table leader writes preserve their single-partition
    // invariant.
    if (classifySystemPartition({partitionId}).systemTable) {
      return false;
    }
    const storageThreshold =
      policy.splitStorageThreshold ?? this.splitStorageThreshold;
    const trafficThreshold =
      policy.splitTrafficThreshold ?? this.splitTrafficThreshold;

    const sizeBytes = metrics.sizeBytes || 0;
    // Traffic splits only on a full-window signal; no signal never splits.
    const queriesPerMinute = hasTrafficSignal(metrics) ?
      metrics.queriesPerMinute :
      null;

    // Split if EITHER threshold is exceeded
    const shouldSplit = sizeBytes >= storageThreshold ||
                        (queriesPerMinute !== null &&
                          queriesPerMinute >= trafficThreshold);

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
   * Decide one adjacent pair: the minimum-age gate on the durable
   * partitions.created_at of BOTH partitions, then a full-window traffic
   * signal on both read over a span within the merge span limit, then the
   * hysteresis thresholds.
   * @param {Object} input - {leftId, rightId, leftMetrics, rightMetrics,
   *   policy}.
   * @return {string} A SPLIT_MERGE_MERGE_DECISION value.
   */
  evaluateMergeEligibility(input) {
    const decision = resolveMergeDecision({
      nowMs: this.now(),
      minimumAgeMs: this.mergeMinimumAgeMs,
      leftCreatedAtMs: input.leftMetrics.createdAtMs,
      rightCreatedAtMs: input.rightMetrics.createdAtMs,
      trafficKnown: hasTrafficSignal(input.leftMetrics) &&
        hasTrafficSignal(input.rightMetrics),
      trafficSpanMs: resolvePairTrafficSpanMs(
        input.leftMetrics, input.rightMetrics),
      trafficSpanLimitMs: this.mergeTrafficSpanLimitMs,
      withinThresholds: () => this.evaluateMergeCriteria(
        input.leftId,
        input.rightId,
        input.leftMetrics,
        input.rightMetrics,
        input.policy,
      ),
    });
    this.logger.debug(SPLIT_MERGE_LOG_MSG.MERGE_ELIGIBILITY_DECIDED, {
      leftPartitionId: input.leftId,
      rightPartitionId: input.rightId,
      decision,
      minimumAgeMs: this.mergeMinimumAgeMs,
    });
    return decision;
  }

  /**
   * Evaluate if two adjacent partitions should be merged.
   * Merge criteria: combined storage <= threshold AND combined traffic <=
   * threshold, each threshold clamped under the hysteresis bound of its
   * split threshold; a pair without a traffic signal is never within it.
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {Object} leftMetrics - Left partition metrics.
   * @param {Object} rightMetrics - Right partition metrics.
   * @param {Object} policy - Table policy with optional custom thresholds.
   * @return {boolean} True if partitions should be merged.
   */
  evaluateMergeCriteria(leftPartitionId, rightPartitionId, leftMetrics, rightMetrics,
    policy = {}) {
    if (
      classifySystemPartition({partitionId: leftPartitionId}).systemTable ||
      classifySystemPartition({partitionId: rightPartitionId}).systemTable
    ) {
      return false;
    }
    const {storageThreshold, trafficThreshold} =
      resolveEffectiveMergeThresholds(policy, this);

    const combinedStorage = (leftMetrics.sizeBytes || 0) +
      (rightMetrics.sizeBytes || 0);
    const trafficKnown = hasTrafficSignal(leftMetrics) &&
      hasTrafficSignal(rightMetrics);
    const combinedTraffic = trafficKnown ?
      leftMetrics.queriesPerMinute + rightMetrics.queriesPerMinute :
      null;

    // Merge if BOTH thresholds are satisfied on a known signal
    const shouldMerge = combinedStorage <= storageThreshold &&
                        trafficKnown &&
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
}

function createPartitionSplitMergeManagerCoreMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(PartitionSplitMergeManagerCoreMethods.prototype)) {
    if (name !== 'constructor') {
      methods[name] = PartitionSplitMergeManagerCoreMethods.prototype[name];
    }
  }
  return methods;
}

export {
  PartitionSplitMergeManagerCoreMethods,
  createPartitionSplitMergeManagerCoreMethods,
};
