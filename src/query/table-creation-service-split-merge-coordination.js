/**
 * Table Creation Service - Split/merge coordination.
 * Owns system-cache attachment, table-policy and partition-size cache seeding,
 * change-driven split/merge evaluation triggers, and periodic evaluation
 * lifecycle on the partition split/merge manager.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {NUM, TABLES} from '../constants/index.js';
import {QUERY_LOG_MSG} from './query-constants.js';
import {TABLE_CREATION_SERVICE_LITERAL} from './table-creation-service-completion.js';


/**
 * Resolve canonical table ID from a row.
 * @param {Object} row
 * @return {string|null}
 * @private
 */
function resolveTableId(row) {
  const tableId = row?.table_id ?? row?.tableId ?? null;
  return typeof tableId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
    tableId.length > NUM.ZERO ?
    tableId :
    null;
}

/**
 * Resolve normalized table policy value from a row.
 * @param {Object} row
 * @return {string|null}
 * @private
 */
function resolveTablePolicyValue(row) {
  const value = row?.table_policies ?? row?.tablePolicies ?? null;
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === TABLE_CREATION_SERVICE_LITERAL.STRING) {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

/**
 * Resolve canonical partition ID from a row.
 * @param {Object} row
 * @return {string|null}
 * @private
 */
function resolvePartitionId(row) {
  const partitionId = row?.partition_id ?? row?.partitionId ?? null;
  return typeof partitionId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
    partitionId.length > NUM.ZERO ?
    partitionId :
    null;
}

/**
 * Resolve normalized partition size from a row.
 * @param {Object} row
 * @return {number|null}
 * @private
 */
function resolvePartitionSizeValue(row) {
  const sizeBytes = Number(row?.size_bytes ?? row?.sizeBytes);
  return Number.isFinite(sizeBytes) && sizeBytes >= NUM.ZERO ?
    sizeBytes :
    null;
}

const SPLIT_MERGE_COORDINATION_METHODS = Object.freeze({
  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (this.systemCache === cache) {
      return;
    }
    this.detachCachePolicyListener();
    this.systemCache = cache || null;
    this.attachCachePolicyListener();
  },

  /**
   * Set partition split/merge manager integration hook.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    if (this.partitionSplitMergeManager === manager) {
      return;
    }
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
    this.partitionSplitMergeManager = manager || null;
    this.startPeriodicSplitMergeEvaluation();
    this.attachCachePolicyListener();
  },

  /**
   * Attach cache listener that triggers split/merge evaluation when table
   * policy values change.
   * @private
   */
  attachCachePolicyListener() {
    const cache = this.systemCache;
    const manager = this.partitionSplitMergeManager;
    if (
      !cache ||
      typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION ||
      typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION ||
      !manager ||
      (typeof manager.evaluateAllPartitions !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION &&
        typeof manager.requestEvaluation !==
          TABLE_CREATION_SERVICE_LITERAL.FUNCTION)
    ) {
      this.tablePolicyByTableId.clear();
      this.partitionSizeByPartitionId.clear();
      return;
    }
    this.seedTablePolicyCache(cache);
    this.seedPartitionMetricsCache(cache);
    this.cachePolicyChangeListener = (tableName, operation, record) => {
      this.onSystemTableCacheChange(tableName, operation, record);
    };
    cache.onCacheChange(this.cachePolicyChangeListener);
  },

  /**
   * Detach previously registered cache policy listener.
   * @private
   */
  detachCachePolicyListener() {
    const cache = this.systemCache;
    if (
      cache &&
      typeof cache.offCacheChange ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION &&
      this.cachePolicyChangeListener
    ) {
      cache.offCacheChange(this.cachePolicyChangeListener);
    }
    this.cachePolicyChangeListener = null;
    this.tablePolicyByTableId.clear();
    this.partitionSizeByPartitionId.clear();
  },

  /**
   * Seed known table policy values from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedTablePolicyCache(cache) {
    this.tablePolicyByTableId.clear();
    const tableRows = cache.getAll(TABLES.TABLES);
    if (!Array.isArray(tableRows)) {
      return;
    }
    for (const row of tableRows) {
      const tableId = this.resolveTableId(row);
      const policyValue = this.resolveTablePolicyValue(row);
      if (!tableId || policyValue === null) {
        continue;
      }
      this.tablePolicyByTableId.set(tableId, policyValue);
    }
  },

  /**
   * Seed known partition sizes from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedPartitionMetricsCache(cache) {
    this.partitionSizeByPartitionId.clear();
    const partitionRows = cache.getAll(TABLES.PARTITIONS);
    if (!Array.isArray(partitionRows)) {
      return;
    }
    for (const row of partitionRows) {
      const partitionId = this.resolvePartitionId(row);
      const partitionSize = this.resolvePartitionSizeValue(row);
      if (!partitionId || partitionSize === null) {
        continue;
      }
      this.partitionSizeByPartitionId.set(partitionId, partitionSize);
    }
  },

  resolveTableId,
  resolveTablePolicyValue,
  resolvePartitionId,
  resolvePartitionSizeValue,

  /**
   * Handle system cache change notifications.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  onSystemTableCacheChange(tableName, operation, record) {
    if (
      operation !== TABLE_CREATION_SERVICE_LITERAL.UPDATE &&
      operation !== TABLE_CREATION_SERVICE_LITERAL.INSERT
    ) {
      return;
    }
    if (tableName === TABLES.TABLES) {
      this.handleTablePolicyCacheChange(operation, record);
      return;
    }
    if (tableName === TABLES.PARTITIONS) {
      this.handlePartitionMetricsCacheChange(operation, record);
    }
  },

  /**
   * Handle split/merge trigger decisions for table policy cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handleTablePolicyCacheChange(operation, record) {
    const tableId = this.resolveTableId(record);
    const policyValue = this.resolveTablePolicyValue(record);
    if (!tableId || policyValue === null) {
      return;
    }
    const previousPolicyValue = this.tablePolicyByTableId.get(tableId);
    this.tablePolicyByTableId.set(tableId, policyValue);
    if (previousPolicyValue === policyValue) {
      return;
    }
    this.logger.debug(QUERY_LOG_MSG.TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL, {
      tableId,
      operation,
    });
    this.requestSplitMergeEvaluation({
      reasonCode: TABLE_CREATION_SERVICE_LITERAL.TABLE_POLICY_CHANGED,
    });
  },

  /**
   * Handle split/merge trigger decisions for partition size cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handlePartitionMetricsCacheChange(operation, record) {
    const partitionId = this.resolvePartitionId(record);
    const partitionSize = this.resolvePartitionSizeValue(record);
    if (!partitionId || partitionSize === null) {
      return;
    }
    const previousPartitionSize =
      this.partitionSizeByPartitionId.get(partitionId);
    this.partitionSizeByPartitionId.set(partitionId, partitionSize);
    if (previousPartitionSize === partitionSize) {
      return;
    }
    this.logger.debug(
      QUERY_LOG_MSG.TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL,
      {
        partitionId,
        operation,
        previousPartitionSize,
        partitionSize,
      },
    );
    this.requestSplitMergeEvaluation({
      reasonCode: TABLE_CREATION_SERVICE_LITERAL.PARTITION_SIZE_CHANGED,
      partitionId,
    });
  },

  /**
   * Request split/merge evaluation through the manager's canonical trigger
   * path. Falls back to direct evaluation when the manager does not expose
   * the coalesced request API yet.
   * @param {Object} [context]
   * @private
   */
  requestSplitMergeEvaluation(context = {}) {
    const manager = this.partitionSplitMergeManager;
    if (!manager) {
      return;
    }
    if (
      typeof manager.requestEvaluation ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      manager.requestEvaluation(context);
      return;
    }
    void this.evaluateSplitMergeLifecycle();
  },

  /**
   * Trigger policy-driven split/merge evaluation after table lifecycle
   * changes.
   * @return {Promise<void>}
   * @private
   */
  async evaluateSplitMergeLifecycle() {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.evaluateAllPartitions !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return;
    }
    try {
      await manager.evaluateAllPartitions();
    } catch (error) {
      this.logger.warn(QUERY_LOG_MSG.TABLE_SPLIT_MERGE_EVAL_FAILED, {
        splitMergeEvaluationError: error.message,
      });
    }
  },

  /**
   * Start periodic split/merge evaluation when supported by the manager.
   * @private
   */
  startPeriodicSplitMergeEvaluation() {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.startPeriodicEvaluation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return;
    }
    manager.startPeriodicEvaluation();
  },

  /**
   * Stop periodic split/merge evaluation when supported by the manager.
   * @private
   */
  stopPeriodicSplitMergeEvaluation() {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.stopPeriodicEvaluation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return;
    }
    manager.stopPeriodicEvaluation();
  },
});

function defineTableCreationSplitMergeCoordination(serviceClass) {
  for (const [methodName, methodImpl] of Object.entries(
    SPLIT_MERGE_COORDINATION_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: methodImpl,
      writable: true,
    });
  }
}

export {defineTableCreationSplitMergeCoordination};
