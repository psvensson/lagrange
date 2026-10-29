/**
 * Live query startup wiring helpers.
 *
 * Creates one startup-owned live query manager path for both seed and joining
 * nodes, and wires cache CDC notifications into registered live subscriptions.
 */

import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {LiveQueryManager} from './live-query-manager.js';
import {LIVE_QUERY_SUBSYSTEM} from './live-query-constants.js';

const PARTITION_ID_FIELD = 'partition_id';
const TABLE_NAME_FIELD = 'table_name';
const CHANGE_DATA_FIELD = 'data';
const CHANGE_OLD_DATA_FIELD = 'old_data';
const CHANGE_NEW_FIELD = 'new';
const CHANGE_OLD_FIELD = 'old';
const CHANGE_OPERATION_FIELD = 'operation';
const CHANGE_HLC_FIELD = 'hlc_timestamp';
const LOG_MSG_PARTITION_HANDLER_FAILED =
  'Live query partition topology update failed';
const LOG_MSG_SUBSCRIPTION_HANDLER_FAILED =
  'Live query cache subscription handler failed';

/**
 * Resolve one partition row by partition id.
 * @param {Object|null} systemTableCache
 * @param {string} partitionId
 * @return {Object|null}
 */
function resolvePartitionRow(systemTableCache, partitionId) {
  if (!systemTableCache || !partitionId) {
    return null;
  }

  if (typeof systemTableCache.get === 'function') {
    const direct = systemTableCache.get(TABLES.PARTITIONS, partitionId);
    if (direct) {
      return direct;
    }
  }

  if (typeof systemTableCache.find !== 'function') {
    return null;
  }

  return systemTableCache.find(TABLES.PARTITIONS, (partition) => {
    return partition?.[PARTITION_ID_FIELD] === partitionId;
  }) || null;
}

/**
 * Resolve partition table name from cache.
 * @param {Object|null} systemTableCache
 * @param {string} partitionId
 * @return {string|null}
 */
function resolvePartitionTableName(systemTableCache, partitionId) {
  const partition = resolvePartitionRow(systemTableCache, partitionId);
  if (!partition) {
    return null;
  }
  return partition[TABLE_NAME_FIELD] || null;
}

/**
 * Convert cache change payload into live query change shape.
 * @param {string} operation
 * @param {Object|null} record
 * @return {Object|null}
 */
function buildLiveQueryChange(operation, record) {
  const normalizedOperation = String(operation || '').toUpperCase();
  if (!record) {
    return null;
  }

  if (normalizedOperation === CDC_OPERATION.DELETE) {
    return {
      [CHANGE_OPERATION_FIELD]: normalizedOperation,
      [CHANGE_DATA_FIELD]: null,
      [CHANGE_OLD_DATA_FIELD]: record,
      [CHANGE_HLC_FIELD]: record[CHANGE_HLC_FIELD] || null,
    };
  }

  if (normalizedOperation === CDC_OPERATION.INSERT) {
    return {
      [CHANGE_OPERATION_FIELD]: normalizedOperation,
      [CHANGE_DATA_FIELD]: record,
      [CHANGE_OLD_DATA_FIELD]: null,
      [CHANGE_HLC_FIELD]: record[CHANGE_HLC_FIELD] || null,
    };
  }

  if (normalizedOperation === CDC_OPERATION.UPDATE ||
      normalizedOperation === CDC_OPERATION.UPSERT) {
    return {
      [CHANGE_OPERATION_FIELD]: normalizedOperation,
      [CHANGE_DATA_FIELD]: record,
      [CHANGE_OLD_DATA_FIELD]: record,
      [CHANGE_HLC_FIELD]: record[CHANGE_HLC_FIELD] || null,
    };
  }

  return null;
}

/**
 * Convert cache partition-row change into topology-change shape.
 * @param {string} operation
 * @param {Object|null} record
 * @return {Object|null}
 */
function buildPartitionTopologyChange(operation, record) {
  const normalizedOperation = String(operation || '').toUpperCase();
  if (!record) {
    return null;
  }

  if (normalizedOperation === CDC_OPERATION.DELETE) {
    return {
      [CHANGE_OPERATION_FIELD]: normalizedOperation,
      [CHANGE_OLD_FIELD]: record,
    };
  }

  if (normalizedOperation === CDC_OPERATION.INSERT ||
      normalizedOperation === CDC_OPERATION.UPDATE ||
      normalizedOperation === CDC_OPERATION.UPSERT) {
    return {
      [CHANGE_OPERATION_FIELD]: normalizedOperation,
      [CHANGE_NEW_FIELD]: record,
    };
  }

  return null;
}

/**
 * Initialize logger for startup wiring.
 * @return {Object}
 */
function initLogger() {
  try {
    const loggingService = LoggingService.getInstance();
    if (loggingService.isInitialized()) {
      return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.LIVE_QUERY_MANAGER);
    }
  } catch {
    // Logging not available
  }
  return console;
}

function dispatchTopologyChange(operation, record, onPartitionTopologyChange, logger) {
  const topologyChange = buildPartitionTopologyChange(operation, record);
  if (!topologyChange) {
    return;
  }
  const maybePromise = onPartitionTopologyChange(topologyChange);
  if (maybePromise && typeof maybePromise.catch === 'function') {
    maybePromise.catch((error) => {
      logger.warn(LOG_MSG_PARTITION_HANDLER_FAILED, {
        error: error.message,
      });
    });
  }
}

function findMatchingSubscription(subscriptions, tableName, tableResolver) {
  for (const subscription of subscriptions.values()) {
    const knownTableName = subscription.tableName ||
      tableResolver(subscription.partitionId);

    if (!knownTableName) {
      continue;
    }

    if (!subscription.tableName) {
      subscription.tableName = knownTableName;
    }

    if (knownTableName === tableName) {
      return subscription;
    }
  }
  return null;
}

function dispatchChangeToSubscriptions(
  subscriptions, tableName, change, tableResolver, logger,
) {
  for (const groupSubs of subscriptions.values()) {
    const selected = findMatchingSubscription(
      groupSubs, tableName, tableResolver,
    );
    if (!selected) {
      continue;
    }

    try {
      selected.handler(change);
    } catch (error) {
      logger.warn(LOG_MSG_SUBSCRIPTION_HANDLER_FAILED, {
        queryId: selected.queryId,
        partitionId: selected.partitionId,
        error: error.message,
      });
    }
  }
}

/**
 * Create adapter that bridges cache CDC notifications to live query handlers.
 * @param {Object} [options]
 * @param {Object|null} [options.systemTableCache]
 * @param {Function|null} [options.onPartitionTopologyChange]
 * @return {{
 *   subscribeToPartition: Function,
 *   unsubscribeFromPartition: Function,
 *   shutdown: Function
 * }}
 */
function createLiveQueryCacheSubscriptionAdapter(options = {}) {
  const systemTableCache = options.systemTableCache || null;
  const onPartitionTopologyChange =
    typeof options.onPartitionTopologyChange === 'function' ?
      options.onPartitionTopologyChange :
      null;
  const logger = initLogger();

  /** @type {Map<string, Map<string, Object>>} */
  const subscriptionsByQueryId = new Map();

  const cacheListener = (tableName, operation, record) => {
    if (!tableName) {
      return;
    }

    if (tableName === TABLES.PARTITIONS && onPartitionTopologyChange) {
      dispatchTopologyChange(operation, record, onPartitionTopologyChange, logger);
    }

    const change = buildLiveQueryChange(operation, record);
    if (change) {
      dispatchChangeToSubscriptions(
        subscriptionsByQueryId,
        tableName,
        change,
        (partitionId) => resolvePartitionTableName(systemTableCache, partitionId),
        logger,
      );
    }
  };

  if (systemTableCache &&
      typeof systemTableCache.onCacheChange === 'function') {
    systemTableCache.onCacheChange(cacheListener);
  }

  const subscribeToPartition = async (partitionId, queryId, handler) => {
    if (!queryId || typeof handler !== 'function') {
      return;
    }

    if (!subscriptionsByQueryId.has(queryId)) {
      subscriptionsByQueryId.set(queryId, new Map());
    }

    const querySubscriptions = subscriptionsByQueryId.get(queryId);
    querySubscriptions.set(partitionId, {
      partitionId,
      queryId,
      tableName: resolvePartitionTableName(systemTableCache, partitionId),
      handler,
    });
  };

  const unsubscribeFromPartition = async (partitionId, queryId) => {
    const querySubscriptions = subscriptionsByQueryId.get(queryId);
    if (!querySubscriptions) {
      return;
    }

    querySubscriptions.delete(partitionId);
    if (querySubscriptions.size === 0) {
      subscriptionsByQueryId.delete(queryId);
    }
  };

  const shutdown = () => {
    if (systemTableCache &&
        typeof systemTableCache.offCacheChange === 'function') {
      systemTableCache.offCacheChange(cacheListener);
    }
    subscriptionsByQueryId.clear();
  };

  return {
    subscribeToPartition,
    unsubscribeFromPartition,
    shutdown,
  };
}

function resolvePartition(options, partitionId) {
  return options.partitionService?.getPartition?.(partitionId) ||
    options.partitions?.get?.(partitionId) || null;
}

async function trySubscribeViaPartition(partition, queryId, handler, subOptions) {
  if (!partition) {
    return {handled: false};
  }
  if (typeof partition.subscribeToCDCWithHandshake === 'function') {
    const result = await partition.subscribeToCDCWithHandshake(handler, {
      subscriberId: queryId,
      ...subOptions,
    });
    return {handled: true, result};
  }
  if (typeof partition.subscribeToCDC === 'function') {
    const result = partition.subscribeToCDC(handler);
    return {handled: true, result};
  }
  return {handled: false};
}

/**
 * Create startup-owned live query wiring for one node.
 * @param {Object} [options]
 * @param {string} [options.nodeId]
 * @param {Object|null} [options.systemTableCache]
 * @param {Object|null} [options.sqlQueryEngine]
 * @return {{liveQueryManager: LiveQueryManager, shutdown: Function}}
 */
function createLiveQueryStartupWiring(options = {}) {
  const liveQueryManager = new LiveQueryManager({
    nodeId: options.nodeId,
    systemCache: options.systemTableCache || null,
    sqlQueryEngine: options.sqlQueryEngine || null,
  });

  const cacheSubscriptionAdapter = createLiveQueryCacheSubscriptionAdapter({
    systemTableCache: options.systemTableCache || null,
    onPartitionTopologyChange: (change) => {
      return liveQueryManager.handlePartitionTopologyChange(change);
    },
  });

  const subscribeToPartition = async (partitionId, queryId, handler, subOptions = {}) => {
    if (typeof options.subscribeToPartition === 'function') {
      return await options.subscribeToPartition(partitionId, queryId, handler, subOptions);
    }
    if (typeof options.partitionService?.subscribeToPartition === 'function') {
      return await options.partitionService.subscribeToPartition(
        partitionId, queryId, handler, subOptions,
      );
    }
    const partition = resolvePartition(options, partitionId);
    const subResult = await trySubscribeViaPartition(partition, queryId, handler, subOptions);
    if (subResult.handled) {
      return subResult.result;
    }
    return cacheSubscriptionAdapter.subscribeToPartition(partitionId, queryId, handler);
  };

  const unsubscribeFromPartition = async (partitionId, queryId) => {
    if (typeof options.unsubscribeFromPartition === 'function') {
      return await options.unsubscribeFromPartition(partitionId, queryId);
    }
    if (typeof options.partitionService?.unsubscribeFromPartition === 'function') {
      return await options.partitionService.unsubscribeFromPartition(partitionId, queryId);
    }
    const partition = options.partitionService?.getPartition?.(partitionId) ||
      options.partitions?.get?.(partitionId);
    if (partition && typeof partition.unsubscribeFromCDC === 'function') {
      partition.unsubscribeFromCDC(queryId);
    }
    return cacheSubscriptionAdapter.unsubscribeFromPartition(partitionId, queryId);
  };

  liveQueryManager.initialize({
    systemCache: options.systemTableCache || null,
    sqlQueryEngine: options.sqlQueryEngine || null,
    partitionService: options.partitionService || null,
    subscribeToPartition,
    unsubscribeFromPartition,
  });

  let shutdownCompleted = false;
  const shutdown = () => {
    if (shutdownCompleted) {
      return;
    }
    shutdownCompleted = true;
    cacheSubscriptionAdapter.shutdown();
    liveQueryManager.shutdown();
  };

  return {
    liveQueryManager,
    shutdown,
  };
}

export {
  createLiveQueryStartupWiring,
};
