/**
 * Remote PartitionService CDC subscription and failover helpers for live query
 * startup wiring.
 *
 * Routes live-query partition subscriptions across nodes over MessageRouter
 * using canonical unified addresses (${nodeId}/partition/${partitionId} and
 * ${nodeId}/service/live-query-cdc) without modifying SystemTableCache scope.
 */

import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from '../partition/partition-service-constants.js';
import {
  deliveryAnswerOf,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';

const SERVICE_ENTITY_TYPE = 'service';
const PARTITION_ENTITY_TYPE = 'partition';
const LIVE_QUERY_CDC_SERVICE_ID = 'live-query-cdc';
const ACTIVE_SERVICE_STATUS = 'active';
const LOG_MSG_REMOTE_SUBSCRIBE_FAILED =
  'Live query remote partition CDC subscribe failed';
const LOG_MSG_REMOTE_UNSUBSCRIBE_FAILED =
  'Live query remote partition CDC unsubscribe failed';
const LOG_MSG_REMOTE_REBIND_FAILED =
  'Live query remote partition CDC rebind failed';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function readTableRows(systemTableCache, tableName, predicate) {
  if (!systemTableCache) return [];
  if (systemTableCache.filter) {
    return systemTableCache.filter(tableName, predicate) || [];
  }
  if (systemTableCache.getAll) {
    return (systemTableCache.getAll(tableName) || []).filter(predicate);
  }
  return [];
}

function resolvePartitionRecord(systemTableCache, partitionId, overrideRow = null) {
  if (overrideRow && overrideRow.partition_id === partitionId) {
    return overrideRow;
  }
  if (!systemTableCache || !partitionId) return null;
  if (systemTableCache.get) {
    const direct = systemTableCache.get(TABLES.PARTITIONS, partitionId);
    if (direct) return direct;
  }
  if (systemTableCache.find) {
    return systemTableCache.find(
      TABLES.PARTITIONS,
      (row) => row?.partition_id === partitionId,
    ) || null;
  }
  return readTableRows(
    systemTableCache,
    TABLES.PARTITIONS,
    (row) => row?.partition_id === partitionId,
  )[0] || null;
}

function resolveRemoteNodeId(systemTableCache, partitionId, ownNodeId, overrideRow) {
  const partitionRow = resolvePartitionRecord(
    systemTableCache, partitionId, overrideRow,
  );
  const leaderNodeId = partitionRow?.leader_node_id || null;
  if (isNonEmptyString(leaderNodeId)) {
    return leaderNodeId === ownNodeId ? null : leaderNodeId;
  }
  const replicaRows = readTableRows(
    systemTableCache,
    TABLES.PARTITION_REPLICAS,
    (row) => row?.partition_id === partitionId &&
      isNonEmptyString(row?.node_id) &&
      row.node_id !== ownNodeId,
  );
  return replicaRows[0]?.node_id || null;
}

function isPartitionServiceTypeAndStatusActive(row) {
  const rowType = row?.service_type || null;
  if (rowType && rowType !== PARTITION_ENTITY_TYPE) return false;
  const rowStatus = readStateField(row?.status);
  return rowStatus === STATE_ABSENT || rowStatus === ACTIVE_SERVICE_STATUS;
}

function matchesActivePartitionService(row, partitionId, targetNodeId) {
  return row?.partition_id === partitionId &&
    row?.node_id === targetNodeId &&
    isNonEmptyString(row?.address) &&
    isPartitionServiceTypeAndStatusActive(row);
}

function resolveRemotePartitionAddress(systemTableCache, partitionId, targetNodeId) {
  const matchingServices = readTableRows(
    systemTableCache,
    TABLES.SERVICES,
    (row) => matchesActivePartitionService(row, partitionId, targetNodeId),
  );
  if (matchingServices.length > 0) {
    return matchingServices[0].address;
  }
  return `${targetNodeId}/${PARTITION_ENTITY_TYPE}/${partitionId}`;
}

/**
 * Resolve the remote target node and unified partition address for a partition.
 * @param {Object|null} systemTableCache
 * @param {string} partitionId
 * @param {string|null} ownNodeId
 * @param {Object|null} [overrideRow]
 * @return {{targetNodeId: string, targetAddress: string}|null}
 */
function resolveRemotePartitionTarget(
  systemTableCache, partitionId, ownNodeId, overrideRow = null,
) {
  const targetNodeId = resolveRemoteNodeId(
    systemTableCache, partitionId, ownNodeId, overrideRow,
  );
  if (!targetNodeId) return null;
  const targetAddress = resolveRemotePartitionAddress(
    systemTableCache, partitionId, targetNodeId,
  );
  return {targetNodeId, targetAddress};
}

function buildLiveQueryCdcAddress(nodeId) {
  if (!isNonEmptyString(nodeId)) return null;
  return `${nodeId}/${SERVICE_ENTITY_TYPE}/${LIVE_QUERY_CDC_SERVICE_ID}`;
}

function extractDeliveryAnswer(delivery) {
  if (!delivery) return null;
  if (!delivery.transport) return delivery;
  const transport = deliveryTransportOf(delivery);
  if (!isDeliveredTransportDeliveryOutcome(transport)) {
    return {
      success: false,
      noHandler: transport.noHandler === true,
      error: transport.error || null,
    };
  }
  return deliveryAnswerOf(delivery);
}

function updateGroupFrontierAfterRebind(group, partitionId, subAnswer) {
  if (Number.isFinite(subAnswer?.appliedIndex)) {
    group.partitionFrontiers.set(partitionId, subAnswer.appliedIndex);
    return;
  }
  const streamVersion = subAnswer?.versionContext?.streamVersion;
  if (streamVersion !== undefined && streamVersion !== null) {
    group.partitionFrontiers.set(partitionId, streamVersion);
    return;
  }
  group.partitionFrontiers.delete(partitionId);
}

function dispatchInboundCdcEvent(
  envelope, remoteSubscribersById, partitionSubscribers,
) {
  const payload = envelope?.payload !== undefined ? envelope.payload : envelope;
  if (payload?.type !== PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_EVENT ||
      !Array.isArray(payload?.events)) {
    return Promise.resolve({success: false});
  }
  const sub = isNonEmptyString(payload.subscriberId) ?
    remoteSubscribersById.get(payload.subscriberId) :
    null;
  const subKey = `${payload.queryId}:${payload.partitionId}`;
  const wrappedHandler = sub?.wrappedHandler || partitionSubscribers.get(subKey);
  if (!wrappedHandler) {
    return Promise.resolve({success: false, noHandler: true});
  }
  return Promise.resolve(wrappedHandler(payload.events)).then(() => ({success: true}));
}

function resolveInboundRouter(messageRouter) {
  return messageRouter?.deliver ? messageRouter : null;
}

/**
 * Create a remote CDC coordinator for one node's live query startup wiring.
 * @param {Object} params
 * @return {Object} Remote CDC coordinator API.
 */
function createRemoteLiveQueryCdcCoordinator({
  nodeId,
  metadataStore,
  messageRouter,
  findGroupById,
  partitionSubscribers,
  resolveLocalPartition,
  subscribeToPartition,
  unsubscribeFromPartition,
  logger,
}) {
  const remoteSubscriptions = new Map();
  const remoteSubscribersById = new Map();
  const localSubscriptions = new Map();
  const liveQueryCdcAddress = buildLiveQueryCdcAddress(nodeId);
  const activeRouter = resolveInboundRouter(messageRouter);

  const inboundCdcHandler = (envelope) => dispatchInboundCdcEvent(
    envelope, remoteSubscribersById, partitionSubscribers,
  );

  if (activeRouter && liveQueryCdcAddress) {
    activeRouter.register?.(liveQueryCdcAddress, inboundCdcHandler);
  }

  const removeRemoteTracking = (subKey, subscriberId) => {
    remoteSubscriptions.delete(subKey);
    remoteSubscribersById.delete(subscriberId);
  };

  const subscribeRemote = async (
    partitionId, queryId, handler, wrappedHandler, subOptions, target,
  ) => {
    if (!activeRouter || !liveQueryCdcAddress || !target) {
      return {handled: false};
    }
    const subKey = `${queryId}:${partitionId}`;
    const subscriberId = `${nodeId}:${queryId}:${partitionId}`;
    const remoteSub = {
      partitionId,
      queryId,
      targetNodeId: target.targetNodeId,
      targetAddress: target.targetAddress,
      subscriberId,
      handler,
      wrappedHandler,
      subOptions,
    };
    remoteSubscriptions.set(subKey, remoteSub);
    remoteSubscribersById.set(subscriberId, remoteSub);

    try {
      const delivery = await activeRouter.deliver(target.targetAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_SUBSCRIBE,
        subscriberId,
        subscriberAddress: liveQueryCdcAddress,
        queryId,
        partitionId,
      });
      const answer = extractDeliveryAnswer(delivery);
      if (answer?.success === false) {
        removeRemoteTracking(subKey, subscriberId);
        logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
          partitionId,
          queryId,
          targetAddress: target.targetAddress,
          error: answer.error || null,
        });
      }
      return {handled: true, result: answer};
    } catch (error) {
      removeRemoteTracking(subKey, subscriberId);
      logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
        partitionId,
        queryId,
        targetAddress: target.targetAddress,
        error: error.message,
      });
      throw error;
    }
  };

  const trackLocal = (
    partitionId, queryId, partition, handler, wrappedHandler, subOptions,
  ) => {
    localSubscriptions.set(`${queryId}:${partitionId}`, {
      partitionId,
      queryId,
      partition,
      handler,
      wrappedHandler,
      subOptions,
    });
  };

  const sendRemoteUnsubscribe = (remoteSub) => {
    if (!activeRouter || !remoteSub) return;
    activeRouter.deliver(remoteSub.targetAddress, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_UNSUBSCRIBE,
      subscriberId: remoteSub.subscriberId,
      queryId: remoteSub.queryId,
      partitionId: remoteSub.partitionId,
    }).catch((error) => {
      logger.debug(LOG_MSG_REMOTE_UNSUBSCRIBE_FAILED, {
        partitionId: remoteSub.partitionId,
        queryId: remoteSub.queryId,
        targetAddress: remoteSub.targetAddress,
        error: error.message,
      });
    });
  };

  const unsubscribeTracked = (partitionId, queryId) => {
    const subKey = `${queryId}:${partitionId}`;
    const remoteSub = remoteSubscriptions.get(subKey);
    if (remoteSub) {
      removeRemoteTracking(subKey, remoteSub.subscriberId);
      sendRemoteUnsubscribe(remoteSub);
    }
    const localSub = localSubscriptions.get(subKey);
    if (localSub) {
      localSubscriptions.delete(subKey);
    }
    return {remoteSub, localSub};
  };

  const shouldRebindSubscription = (sub, partitionId, overrideRow) => {
    const localPartition = resolveLocalPartition(partitionId);
    const remoteTarget = activeRouter ?
      resolveRemotePartitionTarget(metadataStore, partitionId, nodeId, overrideRow) :
      null;
    if (remoteSubscriptions.has(`${sub.queryId}:${partitionId}`)) {
      if (localPartition && localPartition.isLeader !== false) {
        return true;
      }
      return Boolean(
        remoteTarget &&
        (remoteTarget.targetNodeId !== sub.targetNodeId ||
         remoteTarget.targetAddress !== sub.targetAddress),
      );
    }
    return Boolean(sub.partition?.isLeader === false && remoteTarget);
  };

  const rebindSubscriptionIfNeeded = async (sub, partitionId, record) => {
    const group = findGroupById(sub.queryId);
    if (!group || !shouldRebindSubscription(sub, partitionId, record)) {
      return;
    }
    try {
      await unsubscribeFromPartition(partitionId, sub.queryId);
      const subAnswer = await subscribeToPartition(
        partitionId, sub.queryId, sub.handler, sub.subOptions,
      );
      updateGroupFrontierAfterRebind(group, partitionId, subAnswer);
      await group.refreshQueryResult();
    } catch (error) {
      logger.warn(LOG_MSG_REMOTE_REBIND_FAILED, {
        partitionId,
        queryId: sub.queryId,
        error: error.message,
      });
    }
  };

  const reconcileSubscriptionsOnTopologyChange = async (change) => {
    const record = change?.new || change?.old || null;
    const partitionId = record?.partition_id || null;
    if (!partitionId || change?.operation === CDC_OPERATION.DELETE) {
      return;
    }
    const candidates = [
      ...Array.from(remoteSubscriptions.values()),
      ...Array.from(localSubscriptions.values()),
    ].filter((sub) => sub.partitionId === partitionId);
    for (const sub of candidates) {
      await rebindSubscriptionIfNeeded(sub, partitionId, record);
    }
  };

  const resolveTargetForPartition = (partitionId) => {
    if (!activeRouter) return null;
    return resolveRemotePartitionTarget(metadataStore, partitionId, nodeId);
  };

  const shutdown = () => {
    for (const remoteSub of remoteSubscriptions.values()) {
      sendRemoteUnsubscribe(remoteSub);
    }
    remoteSubscriptions.clear();
    remoteSubscribersById.clear();
    localSubscriptions.clear();
    if (liveQueryCdcAddress) {
      activeRouter?.unregisterExact?.(liveQueryCdcAddress, inboundCdcHandler);
    }
  };

  return {
    hasRouter: Boolean(activeRouter),
    resolveRemoteTarget: resolveTargetForPartition,
    subscribeRemote,
    trackLocal,
    unsubscribeTracked,
    reconcileSubscriptionsOnTopologyChange,
    shutdown,
  };
}

export {
  createRemoteLiveQueryCdcCoordinator,
  resolveRemotePartitionTarget,
};
