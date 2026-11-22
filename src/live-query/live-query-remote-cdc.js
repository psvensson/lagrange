/**
 * Remote PartitionService CDC subscription and failover coordinator for live
 * query startup wiring.
 *
 * Routes live-query partition subscriptions across nodes over MessageRouter
 * using canonical unified addresses (${nodeId}/partition/${partitionId} and
 * ${nodeId}/service/live-query-cdc), governed by the synchronous subscription
 * lifecycle owner (`live-query-remote-cdc-lifecycle.js`) and explicit refresh
 * outcome owner (`live-query-refresh-outcome.js`).
 */

import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from '../partition/partition-service-constants.js';
import {resolveTimeSource} from '../time/time-source.js';
import {normalizePositiveRetryAfterMs} from '../transport/transport-semantic-outcome.js';
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';
import {LIVE_QUERY_GROUP_STATE} from './live-query-constants.js';
import {isRefreshOutcomeSettled} from './live-query-refresh-outcome.js';
import {
  REMOTE_CDC_EFFECT,
  REMOTE_CDC_EVENT,
  REMOTE_CDC_PHASE,
  REMOTE_CDC_TRANSPORT_KIND,
  advanceGroupFrontierFromEvents,
  buildCancelledSubscribeResult,
  buildDeferredSubscribeResult,
  buildResyncFailureAnswer,
  createRemoteCdcSubscriptionState,
  extractRemoteDeliveryAnswer,
  hasInboundSequenceGap,
  hasOutstandingRemoteCdcObligation,
  isFailedSubscribeAnswer,
  isGroupClosed,
  isRemoteCdcBindingReceivable,
  markGroupPending,
  markGroupSubscribed,
  transitionRemoteCdcSubscription,
  updateLastReceivedSeq,
} from './live-query-remote-cdc-lifecycle.js';

const SERVICE_ENTITY_TYPE = 'service';
const PARTITION_ENTITY_TYPE = 'partition';
const LIVE_QUERY_CDC_SERVICE_ID = 'live-query-cdc';
const ACTIVE_SERVICE_STATUS = 'active';
const RESYNC_REFRESH_FAILED_ERROR = 'Live query overflow resync refresh failed';
const RESYNC_REFRESH_IN_PROGRESS_ERROR = 'Live query resync refresh already in progress';
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
  timeSource,
  findGroupById,
  resolveLocalPartition,
  subscribeToPartition,
  unsubscribeFromPartition,
  logger,
}) {
  const activeSubscriptions = new Map();
  const remoteSubscribersById = new Map();
  const retiringSubscriptions = new Set();
  const clock = resolveTimeSource({timeSource});
  const liveQueryCdcAddress = buildLiveQueryCdcAddress(nodeId);
  const activeRouter = resolveInboundRouter(messageRouter);
  let nextBindingGeneration = 0;
  let continuationTimer = null;
  let continuationTimerTargetMs = 0;
  let flushInFlight = false;
  let isShutDown = false;

  const clearPendingContinuationTimer = () => {
    if (continuationTimer) {
      clock.clearTimeout(continuationTimer);
      continuationTimer = null;
      continuationTimerTargetMs = 0;
    }
  };

  const removeActiveTracking = (sub) => {
    if (activeSubscriptions.get(sub.subKey) === sub) {
      activeSubscriptions.delete(sub.subKey);
    }
    if (sub.subscriberId && remoteSubscribersById.get(sub.subscriberId) === sub) {
      remoteSubscribersById.delete(sub.subscriberId);
    }
  };

  const computeEarliestContinuationDeadline = () => {
    let earliest = null;
    for (const sub of activeSubscriptions.values()) {
      if (!hasOutstandingRemoteCdcObligation(sub)) continue;
      if (sub.inFlightSubscribe !== null || sub.inFlightRefresh !== null) continue;
      const dueAt = sub.retryNotBeforeMs;
      if (earliest === null || dueAt < earliest) {
        earliest = dueAt;
      }
    }
    return earliest;
  };

  const dispatchRemoteUnsubscribe = (sub, binding) => {
    if (!activeRouter || !binding?.targetAddress || !binding?.subscriberId) {
      const done = transitionRemoteCdcSubscription(sub, {
        type: REMOTE_CDC_EVENT.CLEANUP_SETTLED,
      });
      executeEffects(sub, done.effects);
      return Promise.resolve();
    }
    return activeRouter.deliver(binding.targetAddress, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_UNSUBSCRIBE,
      subscriberId: binding.subscriberId,
      queryId: binding.queryId,
      partitionId: binding.partitionId,
    }).catch((error) => {
      logger.debug(LOG_MSG_REMOTE_UNSUBSCRIBE_FAILED, {
        partitionId: binding.partitionId,
        queryId: binding.queryId,
        targetAddress: binding.targetAddress,
        error: error.message,
      });
    }).finally(() => {
      const done = transitionRemoteCdcSubscription(sub, {
        type: REMOTE_CDC_EVENT.CLEANUP_SETTLED,
      });
      executeEffects(sub, done.effects);
    });
  };

  function executeEffects(sub, effects) {
    const cleanupPromises = [];
    for (const effect of effects) {
      if (effect.type === REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE) {
        cleanupPromises.push(dispatchRemoteUnsubscribe(sub, effect.binding));
      } else if (effect.type === REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION) {
        schedulePendingContinuation();
      } else if (effect.type === REMOTE_CDC_EFFECT.RETIRE_RECORD) {
        retiringSubscriptions.delete(sub);
        removeActiveTracking(sub);
      }
    }
    return cleanupPromises;
  }

  const cancelSubscriptionRecord = (sub) => {
    if (!sub) return [];
    removeActiveTracking(sub);
    retiringSubscriptions.add(sub);
    const {effects} = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.CANCEL,
    });
    const cleanups = executeEffects(sub, effects);
    if (computeEarliestContinuationDeadline() === null) {
      clearPendingContinuationTimer();
    }
    return cleanups;
  };

  const runCatchupRefresh = async (group, sub) => {
    if (isShutDown || isGroupClosed(group) || activeSubscriptions.get(sub.subKey) !== sub) {
      return {settled: false};
    }
    if (sub.inFlightRefresh !== null) {
      return {settled: false};
    }
    const {attempt} = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.START_REFRESH,
    });
    if (!attempt) return {settled: false};
    const outcome = await group.refreshQueryResultWithOutcome();
    const authoritative = isRefreshOutcomeSettled(group, outcome);
    const settledResult = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
      attempt,
      authoritative,
      retryAfterMs: outcome.retryAfterMs,
      error: outcome.error,
      nowMs: clock.now(),
      scheduleOnIncomplete: true,
    });
    executeEffects(sub, settledResult.effects);
    if (settledResult.settled && computeEarliestContinuationDeadline() === null) {
      clearPendingContinuationTimer();
    }
    return {settled: settledResult.settled, outcome};
  };

  const handleInboundSequenceGap = async (payload, sub) => {
    const group = findGroupById?.(payload.queryId);
    if (isGroupClosed(group)) {
      return {success: false, noHandler: true};
    }
    const debt = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT,
      scheduleContinuation: false,
    });
    executeEffects(sub, debt.effects);
    if (sub.inFlightRefresh !== null) {
      return buildResyncFailureAnswer(RESYNC_REFRESH_IN_PROGRESS_ERROR);
    }
    const {attempt} = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.START_REFRESH,
    });
    if (!attempt) {
      return {success: false, noHandler: true};
    }
    const outcome = await group.refreshQueryResultWithOutcome();
    const authoritative = isRefreshOutcomeSettled(group, outcome);
    const settledResult = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
      attempt,
      authoritative,
      retryAfterMs: outcome.retryAfterMs,
      error: outcome.error,
      nowMs: clock.now(),
      scheduleOnIncomplete: false,
    });
    executeEffects(sub, settledResult.effects);
    if (!isRemoteCdcBindingReceivable(sub)) {
      return {success: false, noHandler: true};
    }
    if (!settledResult.settled) {
      return buildResyncFailureAnswer(
        outcome.error || RESYNC_REFRESH_FAILED_ERROR,
        outcome.retryAfterMs,
      );
    }
    updateLastReceivedSeq(sub, payload.events);
    advanceGroupFrontierFromEvents(group, payload.partitionId, payload.events);
    return {acknowledged: true, success: true};
  };

  const dispatchInboundCdcEvent = async (envelope) => {
    const payload = envelope?.payload !== undefined ? envelope.payload : envelope;
    if (payload?.type !== PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_EVENT ||
        !Array.isArray(payload?.events)) {
      return {success: false};
    }
    const sub = isNonEmptyString(payload.subscriberId) ?
      remoteSubscribersById.get(payload.subscriberId) :
      null;
    if (!isRemoteCdcBindingReceivable(sub)) {
      return {success: false, noHandler: true};
    }
    if (hasInboundSequenceGap(payload, sub)) {
      return handleInboundSequenceGap(payload, sub);
    }
    await sub.wrappedHandler(payload.events);
    updateLastReceivedSeq(sub, payload.events);
    return {acknowledged: true, success: true};
  };

  if (activeRouter && liveQueryCdcAddress) {
    activeRouter.register?.(liveQueryCdcAddress, dispatchInboundCdcEvent);
  }

  const continueSinglePending = async (sub) => {
    const group = findGroupById(sub.queryId);
    if (isGroupClosed(group)) {
      cancelSubscriptionRecord(sub);
      return;
    }
    if (sub.phase === REMOTE_CDC_PHASE.CONNECTING) {
      if (sub.inFlightSubscribe !== null || sub.retryNotBeforeMs > clock.now()) {
        return;
      }
      const subAnswer = await subscribeToPartition(
        sub.partitionId,
        sub.queryId,
        sub.handler,
        {...sub.subOptions, requiresCatchup: true},
      );
      const currentSub = activeSubscriptions.get(sub.subKey);
      if (isFailedSubscribeAnswer(subAnswer) ||
          !currentSub ||
          isGroupClosed(findGroupById(sub.queryId))) {
        return;
      }
      markGroupSubscribed(group, sub.partitionId, subAnswer);
      if (currentSub.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
        await runCatchupRefresh(group, currentSub);
      }
      return;
    }
    if (sub.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
      if (sub.inFlightRefresh !== null || sub.retryNotBeforeMs > clock.now()) {
        return;
      }
      await runCatchupRefresh(group, sub);
    }
  };

  const flushPendingSubscriptions = async () => {
    if (isShutDown || flushInFlight) return;
    flushInFlight = true;
    try {
      const now = clock.now();
      const dueList = Array.from(activeSubscriptions.values()).filter((sub) =>
        hasOutstandingRemoteCdcObligation(sub) &&
        sub.inFlightSubscribe === null &&
        sub.inFlightRefresh === null &&
        sub.retryNotBeforeMs <= now,
      );
      for (const sub of dueList) {
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
    } finally {
      flushInFlight = false;
      if (!isShutDown) {
        schedulePendingContinuation();
      }
    }
  };

  function schedulePendingContinuation() {
    if (isShutDown) return;
    const earliestDeadline = computeEarliestContinuationDeadline();
    if (earliestDeadline === null) {
      clearPendingContinuationTimer();
      return;
    }
    const now = clock.now();
    const targetMs = Math.max(earliestDeadline, now + 1);
    if (continuationTimer) {
      if (continuationTimerTargetMs === targetMs) return;
      clearPendingContinuationTimer();
    }
    const delayMs = Math.max(1, targetMs - now);
    continuationTimerTargetMs = targetMs;
    const handle = clock.setTimeout(() => {
      continuationTimer = null;
      continuationTimerTargetMs = 0;
      if (isShutDown) return;
      const nextDue = computeEarliestContinuationDeadline();
      if (nextDue !== null && nextDue > clock.now()) {
        schedulePendingContinuation();
        return;
      }
      flushPendingSubscriptions().catch((error) => {
        logger.debug(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {error: error.message});
      });
    }, delayMs);
    handle?.unref?.();
    continuationTimer = handle;
  }

  const acquireOrCreateRemoteSub = (
    partitionId, queryId, handler, wrappedHandler, subOptions, target,
  ) => {
    const subKey = `${queryId}:${partitionId}`;
    const existing = activeSubscriptions.get(subKey);
    if (existing &&
        existing.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE &&
        existing.targetAddress === target.targetAddress &&
        existing.phase === REMOTE_CDC_PHASE.CONNECTING) {
      existing.handler = handler;
      existing.wrappedHandler = wrappedHandler;
      existing.subOptions = subOptions;
      if (subOptions?.requiresCatchup) {
        existing.needsCatchupOnSubscribe = true;
      }
      return {remoteSub: existing, reused: true};
    }
    if (existing) {
      cancelSubscriptionRecord(existing);
    }
    const bindingGeneration = ++nextBindingGeneration;
    const subscriberId = `${nodeId}:${queryId}:${partitionId}:${bindingGeneration}`;
    const remoteSub = createRemoteCdcSubscriptionState({
      subKey,
      partitionId,
      queryId,
      subscriberId,
      bindingGeneration,
      transportKind: REMOTE_CDC_TRANSPORT_KIND.REMOTE,
      targetNodeId: target.targetNodeId,
      targetAddress: target.targetAddress,
      handler,
      wrappedHandler,
      subOptions,
      needsCatchupOnSubscribe: Boolean(subOptions?.requiresCatchup),
    });
    activeSubscriptions.set(subKey, remoteSub);
    remoteSubscribersById.set(subscriberId, remoteSub);
    return {remoteSub, reused: false};
  };

  const settleSubscribeOutcome = async (remoteSub, binding, subOptions, settled) => {
    const group = findGroupById?.(remoteSub.queryId);
    if (group && group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED &&
        remoteSub.phase !== REMOTE_CDC_PHASE.RETIRING &&
        remoteSub.phase !== REMOTE_CDC_PHASE.CLOSED) {
      cancelSubscriptionRecord(remoteSub);
    }
    const result = transitionRemoteCdcSubscription(remoteSub, {
      type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
      attemptId: binding.attemptId,
      binding,
      accepted: settled.accepted,
      uncertainRemoteRegistration: settled.uncertainRemoteRegistration,
      requiresCatchup: Boolean(subOptions?.requiresCatchup),
      retryAfterMs: settled.retryAfterMs,
      error: settled.error,
      nowMs: clock.now(),
    });
    const cleanups = executeEffects(remoteSub, result.effects);
    if (result.stale) {
      if (cleanups.length > 0) await Promise.all(cleanups);
      return {handled: true, result: buildCancelledSubscribeResult()};
    }
    if (!result.accepted) {
      const remainingMs = Math.max(0, remoteSub.retryNotBeforeMs - clock.now());
      return {handled: true, result: buildDeferredSubscribeResult(remoteSub, remainingMs)};
    }
    return {
      handled: true,
      result: {
        ...settled.answer,
        subscribed: true,
        catchingUp: remoteSub.phase === REMOTE_CDC_PHASE.CATCHING_UP,
      },
    };
  };

  const subscribeRemote = async (
    partitionId, queryId, handler, wrappedHandler, subOptions, target,
  ) => {
    if (isShutDown || !activeRouter || !liveQueryCdcAddress || !target) {
      return {handled: false};
    }
    const {remoteSub} = acquireOrCreateRemoteSub(
      partitionId, queryId, handler, wrappedHandler, subOptions, target,
    );
    if (remoteSub.inFlightSubscribe !== null) {
      const remainingMs = Math.max(0, remoteSub.retryNotBeforeMs - clock.now());
      return {handled: true, result: buildDeferredSubscribeResult(remoteSub, remainingMs)};
    }
    const remainingMs = Math.max(0, remoteSub.retryNotBeforeMs - clock.now());
    if (remainingMs > 0) {
      schedulePendingContinuation();
      return {handled: true, result: buildDeferredSubscribeResult(remoteSub, remainingMs)};
    }

    const {binding} = transitionRemoteCdcSubscription(remoteSub, {
      type: REMOTE_CDC_EVENT.START_SUBSCRIBE,
    });
    if (!binding) {
      return {handled: true, result: buildCancelledSubscribeResult()};
    }

    try {
      const delivery = await activeRouter.deliver(binding.targetAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_SUBSCRIBE,
        subscriberId: binding.subscriberId,
        subscriberAddress: liveQueryCdcAddress,
        queryId,
        partitionId,
      });
      const answer = extractRemoteDeliveryAnswer(delivery);
      const accepted = !isFailedSubscribeAnswer(answer);
      if (!accepted) {
        logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
          partitionId,
          queryId,
          targetAddress: binding.targetAddress,
          error: answer.error || null,
        });
      }
      return await settleSubscribeOutcome(remoteSub, binding, subOptions, {
        accepted,
        uncertainRemoteRegistration: false,
        answer,
        retryAfterMs: answer.retryAfterMs ?? null,
        error: answer.error || null,
      });
    } catch (error) {
      logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
        partitionId,
        queryId,
        targetAddress: binding.targetAddress,
        error: error.message,
      });
      return await settleSubscribeOutcome(remoteSub, binding, subOptions, {
        accepted: false,
        uncertainRemoteRegistration: true,
        answer: null,
        retryAfterMs: normalizePositiveRetryAfterMs(error?.retryAfterMs, null),
        error: error.message,
      });
    }
  };

  const trackLocal = (
    partitionId, queryId, partition, handler, wrappedHandler, subOptions,
  ) => {
    const subKey = `${queryId}:${partitionId}`;
    const existing = activeSubscriptions.get(subKey);
    if (existing) {
      cancelSubscriptionRecord(existing);
    }
    const localSub = createRemoteCdcSubscriptionState({
      subKey,
      partitionId,
      queryId,
      subscriberId: null,
      bindingGeneration: ++nextBindingGeneration,
      transportKind: REMOTE_CDC_TRANSPORT_KIND.LOCAL,
      localPartition: partition,
      handler,
      wrappedHandler,
      subOptions,
    });
    if (subOptions?.requiresCatchup) {
      const debt = transitionRemoteCdcSubscription(localSub, {
        type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT,
        scheduleContinuation: true,
      });
      executeEffects(localSub, debt.effects);
    }
    activeSubscriptions.set(subKey, localSub);
    return localSub;
  };

  const unsubscribeTracked = (partitionId, queryId) => {
    const subKey = `${queryId}:${partitionId}`;
    const existing = activeSubscriptions.get(subKey);
    if (!existing) {
      return {remoteSub: null, localSub: null};
    }
    cancelSubscriptionRecord(existing);
    return existing.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE ?
      {remoteSub: existing, localSub: null} :
      {remoteSub: null, localSub: {partition: existing.localPartition, ...existing}};
  };

  const shouldRebindSubscription = (sub, partitionId, overrideRow) => {
    const localPartition = resolveLocalPartition(partitionId);
    const remoteTarget = activeRouter ?
      resolveRemotePartitionTarget(metadataStore, partitionId, nodeId, overrideRow) :
      null;
    if (sub.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE) {
      if (localPartition && localPartition.isLeader !== false) {
        return true;
      }
      if (!remoteTarget) return false;
      const targetChanged =
        remoteTarget.targetNodeId !== sub.targetNodeId ||
        remoteTarget.targetAddress !== sub.targetAddress;
      if (targetChanged) return true;
      if (sub.phase === REMOTE_CDC_PHASE.CONNECTING) {
        return sub.inFlightSubscribe === null && sub.retryNotBeforeMs <= clock.now();
      }
      return false;
    }
    return Boolean(sub.localPartition?.isLeader === false && remoteTarget);
  };

  const rebindSubscriptionIfNeeded = async (sub, partitionId, record) => {
    const group = findGroupById(sub.queryId);
    if (isGroupClosed(group) ||
        activeSubscriptions.get(sub.subKey) !== sub ||
        !shouldRebindSubscription(sub, partitionId, record)) {
      return;
    }
    try {
      await unsubscribeFromPartition(partitionId, sub.queryId);
      if (isGroupClosed(findGroupById(sub.queryId))) return;
      const subAnswer = await subscribeToPartition(
        partitionId,
        sub.queryId,
        sub.handler,
        {...sub.subOptions, requiresCatchup: true},
      );
      if (isGroupClosed(findGroupById(sub.queryId))) return;
      if (isFailedSubscribeAnswer(subAnswer)) {
        markGroupPending(group, partitionId);
        return;
      }
      markGroupSubscribed(group, partitionId, subAnswer);
      const currentSub = activeSubscriptions.get(sub.subKey);
      if (currentSub && currentSub.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
        await runCatchupRefresh(group, currentSub);
      }
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
    const candidates = Array.from(activeSubscriptions.values())
      .filter((sub) => sub.partitionId === partitionId);
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
    const activeSnapshot = Array.from(activeSubscriptions.values());
    for (const sub of activeSnapshot) {
      cancelSubscriptionRecord(sub);
    }
    activeSubscriptions.clear();
    remoteSubscribersById.clear();
    if (liveQueryCdcAddress) {
      activeRouter?.unregisterExact?.(liveQueryCdcAddress, dispatchInboundCdcEvent);
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
