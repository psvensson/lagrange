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
import {forwardedDeliveryAnswer} from '../transport/transport-semantic-outcome.js';
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';

const SERVICE_ENTITY_TYPE = 'service';
const PARTITION_ENTITY_TYPE = 'partition';
const LIVE_QUERY_CDC_SERVICE_ID = 'live-query-cdc';
const ACTIVE_SERVICE_STATUS = 'active';
// ends-on: pending remote live-query subscription succeeds or group is removed
const PENDING_SUBSCRIPTION_RETRY_DELAY_MS = 50;
// ends-on: pending remote live-query subscription retry backoff cap is reached
const PENDING_SUBSCRIPTION_MAX_RETRY_DELAY_MS = 500;
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

function isFailedAnswer(answer) {
  return !answer ||
    answer.success === false ||
    answer.acknowledged === false ||
    answer.subscribed === false;
}

function normalizeAnswerFields(answer) {
  if (!answer || answer.success === false || answer.acknowledged === false) {
    return {
      ...(answer || {}),
      acknowledged: false,
      success: false,
      retryable: Boolean(answer?.deferRetry || answer?.retryable),
    };
  }
  return {acknowledged: true, success: true, ...answer};
}

function extractDeliveryAnswer(delivery) {
  if (!delivery) {
    return {acknowledged: false, success: false, retryable: true};
  }
  const raw = delivery.transport ?
    (forwardedDeliveryAnswer(delivery) ?? {acknowledged: true, success: true}) :
    delivery;
  return normalizeAnswerFields(raw);
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

function hasInboundSequenceGap(payload, sub) {
  if (payload.resyncRequired === true) return true;
  if (!Number.isFinite(payload.previousDeliveredSeq)) return false;
  if (!Number.isFinite(sub?.lastReceivedSeq)) return false;
  return payload.previousDeliveredSeq > sub.lastReceivedSeq;
}

function updateLastReceivedSeq(sub, events) {
  if (!sub || events.length === 0) return;
  const lastSeq = events.at(-1)?.sequenceNumber;
  if (Number.isFinite(lastSeq)) {
    sub.lastReceivedSeq = lastSeq;
  }
}

function resolveInboundTarget(payload, remoteSubscribersById, partitionSubscribers) {
  const sub = isNonEmptyString(payload.subscriberId) ?
    remoteSubscribersById.get(payload.subscriberId) :
    null;
  const subKey = `${payload.queryId}:${payload.partitionId}`;
  const wrappedHandler = sub?.wrappedHandler || partitionSubscribers.get(subKey);
  return {sub, wrappedHandler};
}

async function dispatchInboundCdcEvent(
  envelope, remoteSubscribersById, partitionSubscribers, findGroupById,
) {
  const payload = envelope?.payload !== undefined ? envelope.payload : envelope;
  if (payload?.type !== PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_EVENT ||
      !Array.isArray(payload?.events)) {
    return {success: false};
  }
  const {sub, wrappedHandler} = resolveInboundTarget(
    payload, remoteSubscribersById, partitionSubscribers,
  );
  if (!wrappedHandler) {
    return {success: false, noHandler: true};
  }
  if (hasInboundSequenceGap(payload, sub)) {
    updateLastReceivedSeq(sub, payload.events);
    await findGroupById?.(payload.queryId)?.refreshQueryResult?.();
    return {success: true};
  }
  await wrappedHandler(payload.events);
  updateLastReceivedSeq(sub, payload.events);
  return {success: true};
}

function resolveInboundRouter(messageRouter) {
  return messageRouter?.deliver ? messageRouter : null;
}

function markGroupSubscribed(group, partitionId, subAnswer) {
  group.pendingSubscriptions?.delete(partitionId);
  group.subscribedPartitions.add(partitionId);
  updateGroupFrontierAfterRebind(group, partitionId, subAnswer);
}

function markGroupPending(group, partitionId) {
  group.subscribedPartitions.delete(partitionId);
  group.pendingSubscriptions?.add(partitionId);
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
  let continuationTimer = null;
  let continuationDelayMs = PENDING_SUBSCRIPTION_RETRY_DELAY_MS;
  let isShutDown = false;

  const inboundCdcHandler = (envelope) => dispatchInboundCdcEvent(
    envelope, remoteSubscribersById, partitionSubscribers, findGroupById,
  );

  if (activeRouter && liveQueryCdcAddress) {
    activeRouter.register?.(liveQueryCdcAddress, inboundCdcHandler);
  }

  const removeRemoteTracking = (subKey, subscriberId) => {
    remoteSubscriptions.delete(subKey);
    remoteSubscribersById.delete(subscriberId);
  };

  const hasPendingSubscriptions = () => {
    for (const sub of remoteSubscriptions.values()) {
      if (sub.pendingContinuation && !sub.subscribed) return true;
    }
    return false;
  };

  const clearPendingContinuationTimer = () => {
    if (continuationTimer) {
      clearTimeout(continuationTimer);
      continuationTimer = null;
    }
  };

  const continueSinglePending = async (sub) => {
    const group = findGroupById(sub.queryId);
    if (!group) {
      removeRemoteTracking(`${sub.queryId}:${sub.partitionId}`, sub.subscriberId);
      return;
    }
    const subAnswer = await subscribeToPartition(
      sub.partitionId, sub.queryId, sub.handler, sub.subOptions,
    );
    if (!isFailedAnswer(subAnswer)) {
      markGroupSubscribed(group, sub.partitionId, subAnswer);
      await group.refreshQueryResult();
    }
  };

  const flushPendingSubscriptions = async () => {
    if (isShutDown) return;
    const pendingList = Array.from(remoteSubscriptions.values())
      .filter((sub) => sub.pendingContinuation && !sub.subscribed);
    for (const sub of pendingList) {
      if (isShutDown) return;
      try {
        await continueSinglePending(sub);
      } catch (error) {
        logger.debug(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
          partitionId: sub.partitionId,
          queryId: sub.queryId,
          error: error.message,
        });
      }
    }
    if (!isShutDown && hasPendingSubscriptions()) {
      continuationDelayMs = Math.min(
        PENDING_SUBSCRIPTION_MAX_RETRY_DELAY_MS,
        continuationDelayMs * 2,
      );
      schedulePendingContinuation();
    } else {
      continuationDelayMs = PENDING_SUBSCRIPTION_RETRY_DELAY_MS;
    }
  };

  function schedulePendingContinuation() {
    if (isShutDown || continuationTimer || !hasPendingSubscriptions()) return;
    const handle = setTimeout(() => {
      continuationTimer = null;
      flushPendingSubscriptions().catch((error) => {
        logger.debug(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {error: error.message});
      });
    }, continuationDelayMs);
    handle.unref?.();
    continuationTimer = handle;
  }

  const upsertRemoteTracking = (
    partitionId, queryId, handler, wrappedHandler, subOptions, target,
  ) => {
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
      subscribed: false,
      pendingContinuation: false,
      lastError: null,
      lastReceivedSeq: null,
    };
    remoteSubscriptions.set(subKey, remoteSub);
    remoteSubscribersById.set(subscriberId, remoteSub);
    return remoteSub;
  };

  const markRemoteFailedHandled = (remoteSub, errorMessage) => {
    remoteSub.subscribed = false;
    remoteSub.pendingContinuation = true;
    remoteSub.lastError = errorMessage || null;
    continuationDelayMs = PENDING_SUBSCRIPTION_RETRY_DELAY_MS;
    schedulePendingContinuation();
    return {
      handled: true,
      result: {
        acknowledged: false,
        success: false,
        subscribed: false,
        retryable: true,
        error: remoteSub.lastError,
      },
    };
  };

  const subscribeRemote = async (
    partitionId, queryId, handler, wrappedHandler, subOptions, target,
  ) => {
    if (!activeRouter || !liveQueryCdcAddress || !target) {
      return {handled: false};
    }
    const remoteSub = upsertRemoteTracking(
      partitionId, queryId, handler, wrappedHandler, subOptions, target,
    );
    try {
      const delivery = await activeRouter.deliver(target.targetAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_SUBSCRIBE,
        subscriberId: remoteSub.subscriberId,
        subscriberAddress: liveQueryCdcAddress,
        queryId,
        partitionId,
      });
      const answer = extractDeliveryAnswer(delivery);
      if (isFailedAnswer(answer)) {
        logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
          partitionId,
          queryId,
          targetAddress: target.targetAddress,
          error: answer.error || null,
        });
        return markRemoteFailedHandled(remoteSub, answer.error);
      }
      remoteSub.subscribed = true;
      remoteSub.pendingContinuation = false;
      remoteSub.lastError = null;
      return {handled: true, result: {...answer, subscribed: true}};
    } catch (error) {
      logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
        partitionId,
        queryId,
        targetAddress: target.targetAddress,
        error: error.message,
      });
      return markRemoteFailedHandled(remoteSub, error.message);
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
    if (!activeRouter || !remoteSub || !remoteSub.subscribed) return;
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
        (!sub.subscribed ||
         remoteTarget.targetNodeId !== sub.targetNodeId ||
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
      if (isFailedAnswer(subAnswer)) {
        markGroupPending(group, partitionId);
        return;
      }
      markGroupSubscribed(group, partitionId, subAnswer);
      await group.refreshQueryResult();
    } catch (error) {
      markGroupPending(group, partitionId);
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
    isShutDown = true;
    clearPendingContinuationTimer();
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
