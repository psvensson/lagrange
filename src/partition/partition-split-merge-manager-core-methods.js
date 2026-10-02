import {SERVICE_TYPE} from '../constants/index.js';
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

const LOCAL_STR_PARTITION_SPLIT_EVALUATION = 'partition:split:evaluation';
const LOCAL_STR_CONTROL_PLANE_WRITE = 'control-plane:write';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const REACTIVE_EVALUATION_TRIGGER = 'reactive_request';
const REACTIVE_PRESSURE_BYPASS_REASON_WRITE_ACTIVITY = 'write_activity';
const INVALID_EVALUATION_TABLE_ID =
  'Partition evaluation table IDs must be primitive strings';
const LOCAL_STR_DESCRIPTOR_VALUE = 'value';
const LOCAL_STR_TABLE_ID_SNAKE = 'table_id';
const LOCAL_STR_TABLE_ID_CAMEL = 'tableId';
const LOCAL_STR_PARTITION_ID_SNAKE = 'partition_id';
const LOCAL_STR_PARTITION_ID_CAMEL = 'partitionId';
const arrayIsArray = Array.isArray;
const arraySort = Array.prototype.sort;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const reflectDefineProperty = Reflect.defineProperty;
const TypeErrorCtor = TypeError;

function cloneStringArray(values) {
  if (!arrayIsArray(values)) {
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

function readOwnDataValue(record, key) {
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_DESCRIPTOR_VALUE)) {
    return undefined;
  }
  return descriptor.value;
}

function compareAbsentEvaluationTableIds(left, right) {
  const leftAbsent = left === null || left === undefined;
  const rightAbsent = right === null || right === undefined;
  if (leftAbsent && rightAbsent) return 0;
  if (leftAbsent) return -1;
  if (rightAbsent) return 1;
  return null;
}

function assertEvaluationTableId(value) {
  if (value !== null &&
      value !== undefined &&
      typeof value !== LOCAL_STR_STRING) {
    throw new TypeErrorCtor(INVALID_EVALUATION_TABLE_ID);
  }
}

function compareEvaluationTableIds(left, right) {
  assertEvaluationTableId(left);
  assertEvaluationTableId(right);
  const absentOrder = compareAbsentEvaluationTableIds(left, right);
  if (absentOrder !== null) return absentOrder;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function cloneEvaluationPartitionRows(partitions) {
  if (!arrayIsArray(partitions)) {
    return [];
  }
  const rows = [];
  const length = readOwnDataValue(partitions, 'length');
  for (let index = 0; index < length; index += 1) {
    const partition = readOwnDataValue(partitions, index);
    if (partition && typeof partition === LOCAL_STR_OBJECT) {
      reflectDefineProperty(rows, rows.length, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: partition,
      });
    }
  }
  return rows;
}

function sortArrayWithCapturedIntrinsic(values, compareFn) {
  return reflectApply(arraySort, values, [compareFn]);
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
    if (typeof value === LOCAL_STR_NUMBER && Number.isFinite(value)) {
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
    if (typeof this.listPartitions === LOCAL_STR_FUNCTION) {
      const partitions = await this.listPartitions();
      return arrayIsArray(partitions) ? partitions : [];
    }
    if (!this.keyRangeManager) {
      return [];
    }
    return this.keyRangeManager.getAllPartitions();
  }

  /**
   * Copy an evaluation partition list through own array data properties only.
   * This is the boundary between an externally supplied list and the
   * split/merge owner: iterators, inherited numeric slots and accessors are not
   * evaluation authority.
   * @param {*} partitions
   * @return {Array<Object>}
   * @private
   */
  normalizeEvaluationPartitions(partitions) {
    return cloneEvaluationPartitionRows(partitions);
  }

  /**
   * Normalize a partition identifier from either a string or row object.
   * @param {string|Object} partition - Partition descriptor.
   * @return {string|null} Partition ID.
   * @private
   */
  getPartitionId(partition) {
    if (typeof partition === LOCAL_STR_STRING) {
      return partition;
    }
    if (!partition || typeof partition !== LOCAL_STR_OBJECT) {
      return null;
    }
    const snakeCaseId = readOwnDataValue(
      partition,
      LOCAL_STR_PARTITION_ID_SNAKE,
    );
    if (snakeCaseId !== undefined && snakeCaseId !== null) {
      return snakeCaseId;
    }
    return readOwnDataValue(
      partition,
      LOCAL_STR_PARTITION_ID_CAMEL,
    ) ?? null;
  }

  /**
   * Resolve table ID for grouping partition rows.
   * @param {Object} partition - Partition descriptor.
   * @return {string|null} Table ID.
   * @private
   */
  getPartitionTableId(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT) {
      return null;
    }
    const snakeCaseId = readOwnDataValue(
      partition,
      LOCAL_STR_TABLE_ID_SNAKE,
    );
    if (snakeCaseId !== undefined && snakeCaseId !== null) {
      return snakeCaseId;
    }
    const camelCaseId = readOwnDataValue(
      partition,
      LOCAL_STR_TABLE_ID_CAMEL,
    );
    return camelCaseId ?? null;
  }

  /**
   * Resolve partition sort start key for adjacency ordering.
   * @param {Object} partition - Partition descriptor.
   * @return {*} Start key.
   * @private
   */
  getPartitionStartKey(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT) {
      return null;
    }
    const snakeCaseKey = readOwnDataValue(partition, 'partition_key_start');
    if (snakeCaseKey !== undefined && snakeCaseKey !== null) {
      return snakeCaseKey;
    }
    return readOwnDataValue(partition, 'partitionKeyStart') ?? null;
  }

  /**
   * Resolve partition sort end key for adjacency ordering.
   * @param {Object} partition - Partition descriptor.
   * @return {*} End key.
   * @private
   */
  getPartitionEndKey(partition) {
    if (!partition || typeof partition !== LOCAL_STR_OBJECT) {
      return null;
    }
    const snakeCaseKey = readOwnDataValue(partition, 'partition_key_end');
    if (snakeCaseKey !== undefined && snakeCaseKey !== null) {
      return snakeCaseKey;
    }
    return readOwnDataValue(partition, 'partitionKeyEnd') ?? null;
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
    const rows = cloneEvaluationPartitionRows(partitions);
    return sortArrayWithCapturedIntrinsic(rows, (left, right) => {
      const tableOrder = compareEvaluationTableIds(
        this.getPartitionTableId(left),
        this.getPartitionTableId(right),
      );
      if (tableOrder !== 0) {
        return tableOrder;
      }
      return compareRoutingKeys(
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
        partition.size_bytes ?? partition.sizeBytes ?? 0,
      );
      metrics.sizeBytes = Number.isFinite(sizeBytes) ? sizeBytes : 0;
    }

    if (metrics.queriesPerMinute === undefined ||
        metrics.queriesPerMinute === null) {
      metrics.queriesPerMinute = 0;
    }

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
    // B1 (scale-safety): priority control-plane partitions (e.g.
    // control_plane_publications, which holds the cluster_membership row) must
    // never split — their single-owner / single-Raft-leader semantics are the
    // basis for owner-driven membership being a single source of truth. A split
    // would create a second "owner" for a fragment and break that invariant.
    if (classifySystemPartition({partitionId}).priorityControlPlane) {
      return false;
    }
    const storageThreshold =
      policy.splitStorageThreshold ?? this.splitStorageThreshold;
    const trafficThreshold =
      policy.splitTrafficThreshold ?? this.splitTrafficThreshold;

    const sizeBytes = metrics.sizeBytes || 0;
    const queriesPerMinute = metrics.queriesPerMinute || 0;

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
    const storageThreshold =
      policy.mergeStorageThreshold ?? this.mergeStorageThreshold;
    const trafficThreshold =
      policy.mergeTrafficThreshold ?? this.mergeTrafficThreshold;

    const combinedStorage = (leftMetrics.sizeBytes || 0) +
      (rightMetrics.sizeBytes || 0);
    const combinedTraffic = (leftMetrics.queriesPerMinute || 0) +
      (rightMetrics.queriesPerMinute || 0);

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

export {createPartitionSplitMergeManagerCoreMethods};
