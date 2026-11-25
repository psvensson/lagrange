/**
 * Table Creation Service - Split/merge coordination.
 * Owns system-cache attachment and collaborator validation, table-policy and
 * partition-size cache seeding, change-driven split/merge evaluation triggers,
 * and periodic evaluation lifecycle on the partition split/merge manager.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {TABLES} from '../constants/index.js';
import {QUERY_LOG_MSG} from './query-constants.js';
import {TABLE_CREATION_SERVICE_LITERAL} from './table-creation-service-completion.js';
import {SPLIT_MERGE_REASON} from '../partition/partition-constants.js';
import {
  describeOutstandingSplitProposal,
} from '../partition/partition-split-merge-manager-proposal-methods.js';
import {
  parseTablePartitionTransition,
} from '../partition/partition-transition-row.js';

const SYSTEM_CACHE_COLLABORATOR_LABEL = 'TableCreationService systemCache';
const FIND_METHOD_NAME = 'find';

function assertCallableCollaboratorMethod(collaborator, methodName, label) {
  const candidate = collaborator?.[methodName];
  if (typeof candidate !== 'function') {
    throw new TypeError(`${label} must implement ${methodName}()`);
  }
}

function validateSystemCacheCollaborator(cache) {
  if (cache === null || cache === undefined) {
    return null;
  }
  assertCallableCollaboratorMethod(
    cache,
    FIND_METHOD_NAME,
    SYSTEM_CACHE_COLLABORATOR_LABEL,
  );
  return cache;
}

/**
 * Resolve canonical table ID from a row.
 * @param {Object} row
 * @return {string|null}
 */
function resolveTableId(row) {
  const tableId = row?.table_id ?? null;
  return typeof tableId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
    tableId.length > 0 ?
    tableId :
    null;
}

/**
 * Resolve normalized table policy value from a row.
 * @param {Object} row
 * @return {string|null}
 */
function resolveTablePolicyValue(row) {
  const value = row?.table_policies ?? null;
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
 */
function resolvePartitionId(row) {
  const partitionId = row?.partition_id ?? null;
  return typeof partitionId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
    partitionId.length > 0 ?
    partitionId :
    null;
}

/**
 * Resolve normalized partition size from a row.
 * @param {Object} row
 * @return {number|null}
 */
function resolvePartitionSizeValue(row) {
  const sizeBytes = Number(row?.size_bytes);
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 ?
    sizeBytes :
    null;
}

function seedTablePolicyCache(service, cache) {
  service.tablePolicyByTableId.clear();
  const tableRows = cache.getAll(TABLES.TABLES);
  if (!Array.isArray(tableRows)) {
    return;
  }
  for (const row of tableRows) {
    const tableId = resolveTableId(row);
    const policyValue = resolveTablePolicyValue(row);
    if (!tableId || policyValue === null) {
      continue;
    }
    service.tablePolicyByTableId.set(tableId, policyValue);
  }
}

function seedPartitionMetricsCache(service, cache) {
  service.partitionSizeByPartitionId.clear();
  const partitionRows = cache.getAll(TABLES.PARTITIONS);
  if (!Array.isArray(partitionRows)) {
    return;
  }
  for (const row of partitionRows) {
    const partitionId = resolvePartitionId(row);
    const partitionSize = resolvePartitionSizeValue(row);
    if (!partitionId || partitionSize === null) {
      continue;
    }
    service.partitionSizeByPartitionId.set(partitionId, partitionSize);
  }
}

function attachCachePolicyListener(service) {
  const cache = service.systemCache;
  const manager = service.partitionSplitMergeManager;
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
    service.tablePolicyByTableId.clear();
    service.partitionSizeByPartitionId.clear();
    return;
  }
  seedTablePolicyCache(service, cache);
  seedPartitionMetricsCache(service, cache);
  service.cachePolicyChangeListener = (tableName, operation, record) => {
    service.onSystemTableCacheChange(tableName, operation, record);
  };
  cache.onCacheChange(service.cachePolicyChangeListener);
}

function requestSplitMergeEvaluation(service, context = {}) {
  const manager = service.partitionSplitMergeManager;
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
  void service.evaluateSplitMergeLifecycle();
}

function requestOutstandingSplitProposalEvaluation(
  service,
  tableRow,
  sourcePartitionId,
) {
  const proposal = describeOutstandingSplitProposal(
    parseTablePartitionTransition(tableRow),
    {tableId: resolveTableId(tableRow), nowMs: Date.now()},
  );
  if (
    !proposal ||
    (sourcePartitionId !== null && proposal.partitionId !== sourcePartitionId)
  ) {
    return;
  }
  requestSplitMergeEvaluation(service, {
    reasonCode: SPLIT_MERGE_REASON.OUTSTANDING_SPLIT_PROPOSAL,
    partitionId: proposal.partitionId,
  });
}

function handleTablePolicyCacheChange(service, operation, record) {
  const tableId = resolveTableId(record);
  const policyValue = resolveTablePolicyValue(record);
  if (!tableId || policyValue === null) {
    return;
  }
  const previousPolicyValue = service.tablePolicyByTableId.get(tableId);
  service.tablePolicyByTableId.set(tableId, policyValue);
  if (previousPolicyValue === policyValue) {
    return;
  }
  service.logger.debug(QUERY_LOG_MSG.TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL, {
    tableId,
    operation,
  });
  requestSplitMergeEvaluation(service, {
    reasonCode: TABLE_CREATION_SERVICE_LITERAL.TABLE_POLICY_CHANGED,
  });
}

function handlePartitionMetricsCacheChange(service, operation, record) {
  const partitionId = resolvePartitionId(record);
  const partitionSize = resolvePartitionSizeValue(record);
  if (!partitionId || partitionSize === null) {
    return;
  }
  const previousPartitionSize =
    service.partitionSizeByPartitionId.get(partitionId);
  service.partitionSizeByPartitionId.set(partitionId, partitionSize);
  if (previousPartitionSize === partitionSize) {
    return;
  }
  service.logger.debug(
    QUERY_LOG_MSG.TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL,
    {
      partitionId,
      operation,
      previousPartitionSize,
      partitionSize,
    },
  );
  requestSplitMergeEvaluation(service, {
    reasonCode: TABLE_CREATION_SERVICE_LITERAL.PARTITION_SIZE_CHANGED,
    partitionId,
  });
}

function startPeriodicSplitMergeEvaluation(service) {
  const manager = service.partitionSplitMergeManager;
  if (
    !manager ||
    typeof manager.startPeriodicEvaluation !==
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
  ) {
    return;
  }
  manager.startPeriodicEvaluation();
}

const SPLIT_MERGE_COORDINATION_METHODS = Object.freeze({
  /**
   * Set and validate the system cache collaborator.
   * @param {Object|null} cache - System table cache.
   */
  setSystemCache(cache) {
    const validatedCache = validateSystemCacheCollaborator(cache);
    if (this.systemCache === validatedCache) {
      return;
    }
    this.detachCachePolicyListener();
    this.systemCache = validatedCache;
    this.schemaProvisioningJobRepository?.setSystemCache(this.systemCache);
    attachCachePolicyListener(this);
  },

  /**
   * Set partition split/merge manager integration hook.
   * @param {Object|null} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    if (this.partitionSplitMergeManager === manager) {
      return;
    }
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
    this.partitionSplitMergeManager = manager || null;
    startPeriodicSplitMergeEvaluation(this);
    attachCachePolicyListener(this);
  },

  /**
   * Detach previously registered cache policy listener.
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
   * Handle system cache change notifications.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   */
  onSystemTableCacheChange(tableName, operation, record) {
    if (
      operation !== TABLE_CREATION_SERVICE_LITERAL.UPDATE &&
      operation !== TABLE_CREATION_SERVICE_LITERAL.INSERT
    ) {
      return;
    }
    if (tableName === TABLES.TABLES) {
      handleTablePolicyCacheChange(this, operation, record);
      requestOutstandingSplitProposalEvaluation(this, record, null);
      return;
    }
    if (tableName === TABLES.PARTITIONS) {
      handlePartitionMetricsCacheChange(this, operation, record);
      requestOutstandingSplitProposalEvaluation(
        this,
        this.systemCache?.get?.(TABLES.TABLES, resolveTableId(record)),
        resolvePartitionId(record),
      );
    }
  },

  /**
   * Trigger policy-driven split/merge evaluation after table lifecycle
   * changes.
   * @return {Promise<void>}
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
   * Stop periodic split/merge evaluation when supported by the manager.
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

export {
  assertCallableCollaboratorMethod,
  defineTableCreationSplitMergeCoordination,
};
