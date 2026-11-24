/**
 * Live query startup wiring helpers.
 *
 * Creates one startup-owned live query manager path for both seed and joining
 * nodes, wires cache partition topology notifications into live query
 * reconciliation, and enforces the acknowledged partition CDC contract.
 */

import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {LiveQueryManager} from './live-query-manager.js';
import {LIVE_QUERY_CURSOR, LIVE_QUERY_SUBSYSTEM} from './live-query-constants.js';
import {createRemoteLiveQueryCdcCoordinator} from './live-query-remote-cdc.js';

const CHANGE_NEW_FIELD = 'new';
const CHANGE_OLD_FIELD = 'old';
const CHANGE_OPERATION_FIELD = 'operation';
const LOG_MSG_PARTITION_HANDLER_FAILED =
  'Live query partition topology update failed';

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
  // The manager's topology handler is asynchronous and answers a promise
  // (LiveQueryManager.handlePartitionTopologyChange).
  onPartitionTopologyChange(topologyChange).catch((error) => {
    logger.warn(LOG_MSG_PARTITION_HANDLER_FAILED, {
      error: error.message,
    });
  });
}

/**
 * Create adapter that forwards cache partition-topology changes to live query
 * reconciliation without delivering user-table data events from cache.
 * @param {Object} [options]
 * @param {Object|null} [options.systemTableCache]
 * @param {?function(Object): Promise<void>} [options.onPartitionTopologyChange] -
 *   The asynchronous topology handler.
 * @return {{shutdown: Function}}
 */
function createLiveQueryCacheTopologyAdapter(options = {}) {
  const systemTableCache = options.systemTableCache || null;
  const onPartitionTopologyChange = options.onPartitionTopologyChange || null;
  const onAvailabilityChange = options.onAvailabilityChange || null;
  const logger = initLogger();

  const cacheListener = (tableName, operation, record) => {
    if (tableName === TABLES.PARTITIONS && onPartitionTopologyChange) {
      dispatchTopologyChange(operation, record, onPartitionTopologyChange, logger);
      return;
    }
    if ((tableName === TABLES.SERVICES || tableName === TABLES.PARTITION_REPLICAS) &&
        onAvailabilityChange) {
      onAvailabilityChange(tableName, operation, record);
    }
  };

  systemTableCache?.onCacheChange?.(cacheListener);

  const shutdown = () => {
    systemTableCache?.offCacheChange?.(cacheListener);
  };

  return {
    shutdown,
  };
}

function resolveEventRowData(rawEvent, isDelete) {
  const oldData = isDelete ? (rawEvent.data ?? null) : (rawEvent.old_data ?? null);
  const data = isDelete ? null : (rawEvent.data ?? null);
  return {data, oldData};
}

/**
 * Normalize a raw partition CDC event into canonical LiveQuery change shape.
 * @param {Object} rawEvent
 * @param {string} partitionId
 * @return {Object|null}
 */
function normalizePartitionCDCEvent(rawEvent, partitionId) {
  if (!rawEvent) {
    return null;
  }
  const operation = String(rawEvent.operation || '').toUpperCase();
  const eventPartitionId = rawEvent.sourcePartition || partitionId;
  const isDelete = operation === CDC_OPERATION.DELETE;
  const {data, oldData} = resolveEventRowData(rawEvent, isDelete);

  return {
    ...rawEvent,
    operation,
    partitionId: eventPartitionId,
    data,
    old_data: oldData,
    hlc_timestamp: rawEvent.timestamp ?? null,
    sequenceNumber: rawEvent.sequenceNumber ?? null,
  };
}

function findPartitionInCollection(container, partitionId) {
  const direct = container?.get?.(partitionId);
  if (direct) return direct;
  if (!container?.values) return null;
  let followerMatch = null;
  for (const service of container.values()) {
    if (service?.partitionId !== partitionId || service.isShutdown) continue;
    if (service.isLeader !== false) return service;
    if (!followerMatch) followerMatch = service;
  }
  return followerMatch;
}

function getFromProvider(provider, partitionId) {
  if (typeof provider !== 'function') return null;
  return findPartitionInCollection(provider(), partitionId);
}

/**
 * Resolve partition from supplied options.
 * @param {Object} options
 * @param {string} partitionId
 * @return {Object|null}
 */
function resolvePartition(options, partitionId) {
  if (!options || !partitionId) return null;
  const service = options.partitionService;
  const direct = service?.getPartition?.(partitionId) || options.partitions?.get?.(partitionId);
  if (direct) return direct;
  return getFromProvider(options.partitionServicesProvider, partitionId) ||
    getFromProvider(options.sqlQueryEngine?.partitionServicesProvider, partitionId) ||
    null;
}

function buildRetryableUnreachableResult() {
  return {
    acknowledged: false,
    success: false,
    subscribed: false,
    retryable: true,
  };
}

function normalizeLocalHandshakeResult(result) {
  if (!result || typeof result !== 'object') {
    return buildRetryableUnreachableResult();
  }
  if (result.success === false ||
      result.acknowledged === false ||
      result.subscribed === false) {
    return {
      ...result,
      acknowledged: false,
      success: false,
      subscribed: false,
      retryable: result.retryable ?? true,
    };
  }
  return {
    ...result,
    acknowledged: true,
    success: true,
    subscribed: true,
  };
}

async function trySubscribeViaPartition(partition, queryId, handler, subOptions) {
  if (!partition || typeof partition.subscribeToCDCWithHandshake !== 'function') {
    return {handled: false};
  }
  const rawResult = await partition.subscribeToCDCWithHandshake(handler, {
    subscriberId: queryId,
    ...subOptions,
  });
  return {handled: true, result: normalizeLocalHandshakeResult(rawResult)};
}

function createWrappedCdcHandler(handler, partitionId) {
  return async (events) => {
    let answer;
    for (const rawEvent of events) {
      answer = await handler(normalizePartitionCDCEvent(rawEvent, partitionId));
    }
    return answer;
  };
}

function subscribePartitionWithOptions(options, {
  partitionSubscribers,
  getRemoteCdc,
}) {
  return async (partitionId, queryId, handler, subOptions = {}) => {
    if (options.subscribeToPartition) {
      return await options.subscribeToPartition(partitionId, queryId, handler, subOptions);
    }
    if (options.partitionService?.subscribeToPartition) {
      return await options.partitionService.subscribeToPartition(
        partitionId, queryId, handler, subOptions,
      );
    }
    const remoteCdc = getRemoteCdc();
    if (remoteCdc.isShuttingDown()) {
      return {
        acknowledged: false,
        success: false,
        subscribed: false,
        cancelled: true,
        retryable: false,
      };
    }
    const subKey = `${queryId}:${partitionId}`;
    // The partition's one subscriber contract hands (events, deliveryContext),
    // events an ordered vector: every member reaches the query's handler in
    // order, and the answer is the handler's for the last member (a vector of
    // one, as the non-durable producer hands it, keeps its answer).
    const wrappedHandler = createWrappedCdcHandler(handler, partitionId);
    partitionSubscribers.set(subKey, wrappedHandler);

    const partition = resolvePartition(options, partitionId);
    const remoteTarget = remoteCdc.resolveRemoteTarget(partitionId);
    if (partition && (partition.isLeader !== false || !remoteTarget)) {
      const subResult = await trySubscribeViaPartition(
        partition, queryId, wrappedHandler, subOptions,
      );
      if (subResult.handled) {
        if (partitionSubscribers.get(subKey) !== wrappedHandler) {
          partition.unsubscribeFromCDC?.(wrappedHandler);
          return {
            acknowledged: false,
            success: false,
            subscribed: false,
            cancelled: true,
            retryable: false,
          };
        }
        if (subResult.result.acknowledged === true && subResult.result.subscribed === true) {
          remoteCdc.trackLocal(
            partitionId, queryId, partition, handler, wrappedHandler, subOptions,
          );
        } else if (subResult.result.cancelled !== true && subResult.result.retryable !== false) {
          remoteCdc.trackPending(
            partitionId, queryId, handler, wrappedHandler, subOptions,
            subResult.result.retryAfterMs ?? null,
          );
        } else {
          partitionSubscribers.delete(subKey);
        }
        return subResult.result;
      }
    }
    const remoteResult = await remoteCdc.subscribeRemote(
      partitionId, queryId, handler, wrappedHandler, subOptions, remoteTarget,
    );
    if (remoteResult.handled) {
      if (remoteResult.result?.cancelled === true &&
          partitionSubscribers.get(subKey) === wrappedHandler) {
        partitionSubscribers.delete(subKey);
      }
      return remoteResult.result;
    }
    if (partitionSubscribers.get(subKey) === wrappedHandler) {
      partitionSubscribers.delete(subKey);
    }
    return buildRetryableUnreachableResult();
  };
}

function unsubscribePartitionWithOptions(options, {
  partitionSubscribers,
  getRemoteCdc,
}) {
  return async (partitionId, queryId) => {
    if (options.unsubscribeFromPartition) {
      return await options.unsubscribeFromPartition(partitionId, queryId);
    }
    if (options.partitionService?.unsubscribeFromPartition) {
      return await options.partitionService.unsubscribeFromPartition(partitionId, queryId);
    }
    const subKey = `${queryId}:${partitionId}`;
    const wrappedHandler = partitionSubscribers.get(subKey);
    partitionSubscribers.delete(subKey);

    const {localSub} = getRemoteCdc().unsubscribeTracked(partitionId, queryId);
    const partition = localSub?.partition || resolvePartition(options, partitionId);
    if (partition?.unsubscribeFromCDC) {
      partition.unsubscribeFromCDC(wrappedHandler || queryId);
    }
  };
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
  const logger = initLogger();
  const liveQueryManager = new LiveQueryManager({
    nodeId: options.nodeId,
    systemCache: options.systemTableCache,
    sqlQueryEngine: options.sqlQueryEngine,
  });

  /** @type {Map<string, Function>} */
  const partitionSubscribers = new Map();
  let remoteCdc = null;

  const cacheTopologyAdapter = createLiveQueryCacheTopologyAdapter({
    systemTableCache: options.systemTableCache,
    onPartitionTopologyChange: async (change) => {
      await liveQueryManager.handlePartitionTopologyChange(change);
      await remoteCdc?.reconcileSubscriptionsOnTopologyChange(change);
    },
    onAvailabilityChange: () => {
      remoteCdc?.flushPendingSubscriptions({immediateUnresolved: true}).catch((error) => {
        logger.debug(LOG_MSG_PARTITION_HANDLER_FAILED, {error: error.message});
      });
    },
  });

  const handlerContext = {
    partitionSubscribers,
    getRemoteCdc: () => remoteCdc,
  };
  const subscribeToPartition = subscribePartitionWithOptions(options, handlerContext);
  const unsubscribeFromPartition = unsubscribePartitionWithOptions(options, handlerContext);

  remoteCdc = createRemoteLiveQueryCdcCoordinator({
    nodeId: options.nodeId,
    metadataStore: options.systemTableCache,
    messageRouter: options.messageRouter,
    messageRouterProvider: options.messageRouterProvider,
    timeSource: options.timeSource,
    shutdownDrainTimeoutMs: options.shutdownDrainTimeoutMs,
    findGroupById: (id) => liveQueryManager.findGroupByQueryId(id),
    partitionSubscribers,
    resolveLocalPartition: (partitionId) => resolvePartition(options, partitionId),
    subscribeToPartition,
    unsubscribeFromPartition,
    logger,
  });

  liveQueryManager.initialize({
    systemCache: options.systemTableCache,
    sqlQueryEngine: options.sqlQueryEngine,
    partitionService: options.partitionService,
    partitionServicesProvider: options.partitionServicesProvider,
    subscribeToPartition,
    unsubscribeFromPartition,
    remoteCdcCoordinator: remoteCdc,
  });

  let shutdownPromise = null;
  const shutdown = (shutdownOptions = {}) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    const drainPromise = liveQueryManager.shutdown(shutdownOptions);
    for (const [subKey, wrappedHandler] of partitionSubscribers.entries()) {
      const separatorIndex = subKey.lastIndexOf(LIVE_QUERY_CURSOR.SEPARATOR);
      const partitionId = separatorIndex >= 0 ? subKey.slice(separatorIndex + 1) : null;
      const partition = partitionId ? resolvePartition(options, partitionId) : null;
      partition?.unsubscribeFromCDC?.(wrappedHandler);
    }
    partitionSubscribers.clear();
    cacheTopologyAdapter.shutdown();
    shutdownPromise = drainPromise;
    return shutdownPromise;
  };

  return {
    liveQueryManager,
    shutdown,
  };
}

export {
  createLiveQueryStartupWiring,
};
