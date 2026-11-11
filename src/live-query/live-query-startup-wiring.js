/**
 * Live query startup wiring helpers.
 *
 * Creates one startup-owned live query manager path for both seed and joining
 * nodes, and wires cache CDC notifications into registered live subscriptions.
 */

import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {isTableCdcObligationRecorded} from '../cache/cdc-table-policy.js';
import {LiveQueryManager} from './live-query-manager.js';
import {LIVE_QUERY_SUBSYSTEM} from './live-query-constants.js';

const PARTITION_ID_FIELD = 'partition_id';
const TABLE_NAME_FIELD = 'table_name';
const CHANGE_DATA_FIELD = 'data';
const CHANGE_OPERATION_FIELD = 'operation';
const CHANGE_HLC_FIELD = 'hlc_timestamp';
const PARTITION_PROVIDER_UNAVAILABLE = 'LIVE_QUERY_PARTITION_PROVIDER_UNAVAILABLE';
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

// The one change shape a query group reads, whoever produced it: the
// operation, `data` (the row the change is about: the row an INSERT or
// UPDATE leaves, the row a DELETE removed) and hlc_timestamp. An UPDATE (a
// cache UPSERT is one: it merges into a held row or inserts a missing key)
// names no previous row, because no producer has one: the cache notifies the
// row it holds after the change, a partition's CDC envelope the row written.
// The query group answers "was it in the result, and as which row" from its
// own result set (LiveQueryGroup._evaluateUpdate).
const CHANGE_OPERATION_OF = Object.freeze({
  [CDC_OPERATION.INSERT]: CDC_OPERATION.INSERT,
  [CDC_OPERATION.UPDATE]: CDC_OPERATION.UPDATE,
  [CDC_OPERATION.UPSERT]: CDC_OPERATION.UPDATE,
  [CDC_OPERATION.DELETE]: CDC_OPERATION.DELETE,
});

/**
 * Convert one cache change notification into the live query change shape.
 * @param {string} operation
 * @param {Object|null} record - The row the cache names for the change.
 * @return {Object|null} Null for no row or an operation that is no change.
 */
function buildLiveQueryChange(operation, record) {
  const changeOperation = CHANGE_OPERATION_OF[String(operation || '').toUpperCase()];
  if (!record || changeOperation === undefined) {
    return null;
  }
  return {
    [CHANGE_OPERATION_FIELD]: changeOperation,
    [CHANGE_DATA_FIELD]: record,
    [CHANGE_HLC_FIELD]: record[CHANGE_HLC_FIELD] || null,
  };
}

/**
 * Convert cache partition-row change into topology-change shape. The cache
 * names one partition row per change, whatever the operation; it travels as
 * `data`.
 * @param {string} operation
 * @param {Object|null} record
 * @return {Object|null}
 */
function buildPartitionTopologyChange(operation, record) {
  const normalizedOperation = String(operation || '').toUpperCase();
  if (!record) {
    return null;
  }

  if (normalizedOperation === CDC_OPERATION.DELETE ||
      normalizedOperation === CDC_OPERATION.INSERT ||
      normalizedOperation === CDC_OPERATION.UPDATE ||
      normalizedOperation === CDC_OPERATION.UPSERT) {
    return {
      [CHANGE_OPERATION_FIELD]: normalizedOperation,
      [CHANGE_DATA_FIELD]: record,
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
  // The manager's topology handler is asynchronous and answers a promise
  // (LiveQueryManager.handlePartitionTopologyChange).
  onPartitionTopologyChange(topologyChange).catch((error) => {
    logger.warn(LOG_MSG_PARTITION_HANDLER_FAILED, {
      error: error.message,
    });
  });
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
 * @param {?function(Object): Promise<void>} [options.onPartitionTopologyChange] -
 *   The asynchronous topology handler.
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

/**
 * Normalize one hosted partition's CDC envelope (tableName, operation,
 * timestamp, sourcePartition, data, optional sequenceNumber) into the one
 * change shape a query group reads (its `data` is the change's row). An
 * operation that is no row change keeps its name: it still advances the
 * partition frontier and evaluates to no event.
 * @param {Object} rawEvent
 * @param {string} partitionId - The partition this subscription is on.
 * @return {Object|null}
 */
function normalizePartitionCDCEvent(rawEvent, partitionId) {
  if (!rawEvent) {
    return null;
  }
  const rawOperation = String(rawEvent.operation || '').toUpperCase();
  const operation = CHANGE_OPERATION_OF[rawOperation] ?? rawOperation;
  return {
    ...rawEvent,
    operation,
    partitionId,
    [CHANGE_HLC_FIELD]: rawEvent.timestamp,
    sequenceNumber: rawEvent.sequenceNumber ?? null,
  };
}

function partitionProviderUnavailable(partitionId) {
  const error = new Error(
    `Live query partition provider unavailable for partition ${partitionId}`);
  error.code = PARTITION_PROVIDER_UNAVAILABLE;
  return error;
}

/**
 * The one provider of a partition at startup: the node's hosted partition
 * replicas (keyed by replica id, so matched by partitionId). A provider
 * that answers nothing is a typed refusal, never read as "not hosted here".
 * @param {Function|undefined} provider
 * @param {string} partitionId
 * @return {Object|null} The hosted replica, or null when this node hosts none.
 */
function resolveHostedPartition(provider, partitionId) {
  // An absent provider and one answering no replica map are one outcome.
  const hosted = provider?.();
  if (!(hosted instanceof Map)) {
    throw partitionProviderUnavailable(partitionId);
  }
  for (const service of hosted.values()) {
    if (service.partitionId === partitionId) return service;
  }
  return null;
}

// A partition whose table records CDC obligations delivers durable vectors
// to propagation subscribers only: a subscriber there must answer each vector
// with a committed receipt, and one that cannot holds the partition's whole
// delivery lane. A live query is an observer, so it never registers on such a
// partition; its changes reach it through the system-table cache subscription.
function observesThroughPartition(partition) {
  return partition !== null && !isTableCdcObligationRecorded(partition.tableName);
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

  /** @type {Map<string, {partition: Object, handler: Function}>} */
  const partitionSubscribers = new Map();

  const subscribeToPartition = async (partitionId, queryId, handler, subOptions = {}) => {
    if (typeof options.subscribeToPartition === 'function') {
      return await options.subscribeToPartition(partitionId, queryId, handler, subOptions);
    }
    const partition = resolveHostedPartition(options.partitionServicesProvider, partitionId);
    if (!observesThroughPartition(partition)) {
      return cacheSubscriptionAdapter.subscribeToPartition(partitionId, queryId, handler);
    }
    const wrappedHandler = (rawEvent) =>
      handler(normalizePartitionCDCEvent(rawEvent, partitionId));
    partitionSubscribers.set(`${queryId}:${partitionId}`,
      {partition, handler: wrappedHandler});
    return await partition.subscribeToCDCWithHandshake(wrappedHandler, {
      subscriberId: queryId,
      ...subOptions,
    });
  };

  const unsubscribeFromPartition = async (partitionId, queryId) => {
    if (typeof options.unsubscribeFromPartition === 'function') {
      return await options.unsubscribeFromPartition(partitionId, queryId);
    }
    const subKey = `${queryId}:${partitionId}`;
    const registration = partitionSubscribers.get(subKey);
    partitionSubscribers.delete(subKey);
    // No registration: this subscription observed through the cache.
    if (registration !== undefined) {
      registration.partition.unsubscribeFromCDC(registration.handler);
    }
    return cacheSubscriptionAdapter.unsubscribeFromPartition(partitionId, queryId);
  };

  liveQueryManager.initialize({
    systemCache: options.systemTableCache || null,
    sqlQueryEngine: options.sqlQueryEngine || null,
    subscribeToPartition,
    unsubscribeFromPartition,
  });

  let shutdownCompleted = false;
  const shutdown = () => {
    if (shutdownCompleted) {
      return;
    }
    shutdownCompleted = true;
    partitionSubscribers.clear();
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
