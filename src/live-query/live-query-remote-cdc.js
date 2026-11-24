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

import {CDC_OPERATION} from '../constants/index.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from '../partition/partition-service-constants.js';
import {resolveTimeSource} from '../time/time-source.js';
import {normalizePositiveRetryAfterMs} from '../transport/transport-semantic-outcome.js';
import {LIVE_QUERY_GROUP_STATE} from './live-query-constants.js';
import {isRefreshOutcomeSettled} from './live-query-refresh-outcome.js';
import {
  DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS,
  REMOTE_CDC_COORDINATOR_STATE,
  REMOTE_CDC_EFFECT,
  REMOTE_CDC_EVENT,
  REMOTE_CDC_PHASE,
  REMOTE_CDC_TRANSPORT_KIND,
  advanceGroupFrontierFromEvents,
  buildCancelledSubscribeResult,
  buildDeferredSubscribeResult,
  buildResyncFailureAnswer,
  classifyUnsubscribeDeliveryError,
  classifyUnsubscribeDeliveryOutcome,
  collectDueRemoteCdcSubscriptions,
  collectDueRetiringRemoteCdcSubscriptions,
  computeEarliestRemoteCdcDeadline,
  countRemainingRetiringSubscriptions,
  createRemoteCdcSubscriptionState,
  extractRemoteDeliveryAnswer,
  hasInboundSequenceGap,
  isFailedSubscribeAnswer,
  isGroupClosed,
  isRemoteCdcBindingReceivable,
  isUncertainSubscribeDelivery,
  isUncertainSubscribeError,
  markGroupPending,
  markGroupSubscribed,
  normalizeShutdownDrainTimeoutMs,
  transitionRemoteCdcSubscription,
  updateLastReceivedSeq,
} from './live-query-remote-cdc-lifecycle.js';
import {
  buildLiveQueryCdcAddress,
  isNonEmptyString,
  resolveRemotePartitionTarget,
} from './live-query-remote-target-resolver.js';

const RESYNC_REFRESH_FAILED_ERROR = 'Live query overflow resync refresh failed';
const RESYNC_REFRESH_IN_PROGRESS_ERROR = 'Live query resync refresh already in progress';
const LOG_MSG_REMOTE_SUBSCRIBE_FAILED = 'Live query remote partition CDC subscribe failed';
const LOG_MSG_REMOTE_UNSUBSCRIBE_FAILED = 'Live query remote partition CDC unsubscribe failed';
const LOG_MSG_REMOTE_REBIND_FAILED = 'Live query remote partition CDC rebind failed';

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
  messageRouterProvider,
  timeSource,
  findGroupById,
  resolveLocalPartition,
  subscribeToPartition,
  unsubscribeFromPartition,
  shutdownDrainTimeoutMs = DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS,
  logger,
}) {
  const activeSubscriptions = new Map();
  const remoteSubscribersById = new Map();
  const retiringSubscriptions = new Set();
  const latestRebindTokenByKey = new Map();
  const clock = resolveTimeSource({timeSource});
  const liveQueryCdcAddress = buildLiveQueryCdcAddress(nodeId);
  const defaultShutdownDrainTimeoutMs = normalizeShutdownDrainTimeoutMs(
    shutdownDrainTimeoutMs, DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS,
  );
  let registeredRouter = null;
  let nextBindingGeneration = 0;
  let nextRebindToken = 0;
  let continuationTimer = null;
  let continuationTimerTargetMs = 0;
  let shutdownDeadlineTimer = null;
  let shutdownPromise = null;
  let resolveShutdownDrain = null;
  let flushInFlight = false;
  let pendingImmediateFlush = false;
  let coordinatorState = REMOTE_CDC_COORDINATOR_STATE.ACTIVE;

  const isCoordinatorActive = () =>
    coordinatorState === REMOTE_CDC_COORDINATOR_STATE.ACTIVE;
  const isCoordinatorShutDown = () =>
    coordinatorState === REMOTE_CDC_COORDINATOR_STATE.SHUT_DOWN;

  const clearPendingContinuationTimer = () => {
    if (!continuationTimer) return;
    clock.clearTimeout(continuationTimer);
    continuationTimer = null;
    continuationTimerTargetMs = 0;
  };

  const clearShutdownDeadlineTimer = () => {
    if (!shutdownDeadlineTimer) return;
    clock.clearTimeout(shutdownDeadlineTimer);
    shutdownDeadlineTimer = null;
  };

  const removeActiveTracking = (sub) => {
    if (activeSubscriptions.get(sub.subKey) === sub) activeSubscriptions.delete(sub.subKey);
    if (sub.subscriberId && remoteSubscribersById.get(sub.subscriberId) === sub) {
      remoteSubscribersById.delete(sub.subscriberId);
    }
  };

  const computeEarliestContinuationDeadline = () =>
    computeEarliestRemoteCdcDeadline(activeSubscriptions, retiringSubscriptions);

  const settleRemoteCleanup = (sub, binding, outcome) => {
    if (!sub || isCoordinatorShutDown()) return;
    const done = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.CLEANUP_SETTLED,
      binding,
      bindingGeneration: binding?.bindingGeneration,
      success: outcome.confirmed,
      retryAfterMs: outcome.retryAfterMs,
      error: outcome.error,
      nowMs: clock.now(),
    });
    executeEffects(sub, done.effects);
    if (done.settled && computeEarliestContinuationDeadline() === null) {
      clearPendingContinuationTimer();
    }
    notifyShutdownDrainProgress();
  };

  const dispatchRemoteUnsubscribe = async (sub, binding) => {
    const activeRouter = resolveActiveRouter();
    if (!activeRouter || !binding?.targetAddress || !binding?.subscriberId) {
      settleRemoteCleanup(sub, binding, {confirmed: true});
      return;
    }
    let outcome;
    try {
      const delivery = await activeRouter.deliver(binding.targetAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_UNSUBSCRIBE,
        subscriberId: binding.subscriberId,
        queryId: binding.queryId,
        partitionId: binding.partitionId,
      });
      outcome = classifyUnsubscribeDeliveryOutcome(delivery);
    } catch (error) {
      outcome = classifyUnsubscribeDeliveryError(error);
    }
    if (!outcome.confirmed) {
      logger.debug(LOG_MSG_REMOTE_UNSUBSCRIBE_FAILED, {
        partitionId: binding.partitionId, queryId: binding.queryId,
        targetAddress: binding.targetAddress, error: outcome.error,
      });
    }
    settleRemoteCleanup(sub, binding, outcome);
  };

  function executeEffects(sub, effects) {
    const cleanupPromises = [];
    for (const effect of effects) {
      if (effect.type === REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE) {
        cleanupPromises.push(dispatchRemoteUnsubscribe(sub, effect.binding));
      } else if (effect.type === REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION) {
        if (sub.phase === REMOTE_CDC_PHASE.RETIRING) {
          retiringSubscriptions.add(sub);
        }
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
    if (sub.phase === REMOTE_CDC_PHASE.CLOSED) {
      retiringSubscriptions.delete(sub);
      return [];
    }
    retiringSubscriptions.add(sub);
    const {effects} = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.CANCEL});
    const cleanups = executeEffects(sub, effects);
    if (computeEarliestContinuationDeadline() === null) clearPendingContinuationTimer();
    notifyShutdownDrainProgress();
    return cleanups;
  };

  const executeTrackedRefresh = async (group, sub, scheduleOnIncomplete) => {
    const {attempt} = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.START_REFRESH,
    });
    if (!attempt) return {started: false, settled: false};
    const outcome = await group.refreshQueryResultWithOutcome();
    const settledResult = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
      attempt,
      authoritative: isRefreshOutcomeSettled(group, outcome),
      supersededByCdc: Boolean(outcome.supersededByCdc),
      retryAfterMs: outcome.retryAfterMs,
      error: outcome.error,
      nowMs: clock.now(),
      scheduleOnIncomplete,
    });
    executeEffects(sub, settledResult.effects);
    return {started: true, settled: settledResult.settled, outcome};
  };

  const runCatchupRefresh = async (group, sub) => {
    if (!isCoordinatorActive() || isGroupClosed(group) ||
        activeSubscriptions.get(sub.subKey) !== sub || sub.inFlightRefresh !== null) {
      return {settled: false};
    }
    const {started, settled, outcome} = await executeTrackedRefresh(group, sub, true);
    if (!started) return {settled: false};
    if (settled && computeEarliestContinuationDeadline() === null) {
      clearPendingContinuationTimer();
    }
    return {settled, outcome};
  };

  const handleInboundSequenceGap = async (payload, sub) => {
    const group = findGroupById?.(payload.queryId);
    if (isGroupClosed(group)) return {success: false, noHandler: true};
    const debt = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT, scheduleContinuation: false,
    });
    executeEffects(sub, debt.effects);
    if (sub.inFlightRefresh !== null) {
      return buildResyncFailureAnswer(RESYNC_REFRESH_IN_PROGRESS_ERROR);
    }
    const {started, settled, outcome} = await executeTrackedRefresh(group, sub, false);
    if (!started || !isRemoteCdcBindingReceivable(sub)) {
      return {success: false, noHandler: true};
    }
    if (!settled) {
      return buildResyncFailureAnswer(
        outcome.error || RESYNC_REFRESH_FAILED_ERROR, outcome.retryAfterMs,
      );
    }
    updateLastReceivedSeq(sub, payload.events);
    advanceGroupFrontierFromEvents(group, payload.partitionId, payload.events);
    return {acknowledged: true, success: true};
  };

  const dispatchInboundCdcEvent = async (envelope) => {
    if (!isCoordinatorActive()) return {success: false, noHandler: true};
    const payload = envelope?.payload !== undefined ? envelope.payload : envelope;
    if (payload?.type !== PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_EVENT ||
        !Array.isArray(payload?.events)) {
      return {success: false};
    }
    const sub = isNonEmptyString(payload.subscriberId) ?
      remoteSubscribersById.get(payload.subscriberId) : null;
    if (!isRemoteCdcBindingReceivable(sub)) return {success: false, noHandler: true};
    if (hasInboundSequenceGap(payload, sub)) return handleInboundSequenceGap(payload, sub);
    if (payload.events.length > 0) {
      transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.ORDINARY_CDC_DELIVERED});
    }
    await sub.wrappedHandler(payload.events);
    updateLastReceivedSeq(sub, payload.events);
    return {acknowledged: true, success: true};
  };

  function resolveActiveRouter() {
    const candidate = messageRouterProvider ? messageRouterProvider() : messageRouter;
    const router = resolveInboundRouter(candidate);
    if (router && liveQueryCdcAddress && registeredRouter !== router && isCoordinatorActive()) {
      registeredRouter?.unregisterExact?.(liveQueryCdcAddress, dispatchInboundCdcEvent);
      router.register?.(liveQueryCdcAddress, dispatchInboundCdcEvent);
      registeredRouter = router;
    }
    return router;
  }

  resolveActiveRouter();

  const continueSinglePending = async (sub) => {
    if (!isCoordinatorActive()) return;
    const group = findGroupById(sub.queryId);
    if (isGroupClosed(group)) {
      cancelSubscriptionRecord(sub);
      return;
    }
    if (sub.phase === REMOTE_CDC_PHASE.CONNECTING) {
      if (sub.inFlightSubscribe !== null || sub.retryNotBeforeMs > clock.now()) return;
      const subAnswer = await subscribeToPartition(
        sub.partitionId, sub.queryId, sub.handler, {...sub.subOptions, requiresCatchup: true},
      );
      const currentSub = activeSubscriptions.get(sub.subKey);
      if (isFailedSubscribeAnswer(subAnswer) || subAnswer?.cancelled === true || !currentSub ||
          (subAnswer?.bindingGeneration !== undefined &&
            currentSub.bindingGeneration !== subAnswer.bindingGeneration) ||
          isGroupClosed(findGroupById(sub.queryId))) return;
      markGroupSubscribed(group, sub.partitionId, subAnswer);
      if (currentSub.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
        await runCatchupRefresh(group, currentSub);
      }
      return;
    }
    if (sub.phase === REMOTE_CDC_PHASE.CATCHING_UP &&
        sub.inFlightRefresh === null && sub.retryNotBeforeMs <= clock.now()) {
      await runCatchupRefresh(group, sub);
    }
  };

  const dispatchDueRetiringCleanups = () => {
    if (isCoordinatorShutDown()) return;
    const dueRetiring = collectDueRetiringRemoteCdcSubscriptions(
      retiringSubscriptions, clock.now(),
    );
    for (const sub of dueRetiring) {
      if (isCoordinatorShutDown()) return;
      const started = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.START_CLEANUP});
      executeEffects(sub, started.effects);
    }
  };

  const flushPendingSubscriptions = async (flushOptions = {}) => {
    const immediateUnresolved = flushOptions?.immediateUnresolved === true;
    dispatchDueRetiringCleanups();
    if (!isCoordinatorActive()) return;
    if (flushInFlight) {
      if (immediateUnresolved) pendingImmediateFlush = true;
      return;
    }
    flushInFlight = true;
    try {
      if (immediateUnresolved) {
        for (const sub of activeSubscriptions.values()) {
          if (sub.phase === REMOTE_CDC_PHASE.CONNECTING &&
              sub.inFlightSubscribe === null && sub.targetAddress === null) {
            sub.retryNotBeforeMs = 0;
          }
        }
      }
      const {dueActive} = collectDueRemoteCdcSubscriptions(
        activeSubscriptions, retiringSubscriptions, clock.now(),
      );
      for (const sub of dueActive) {
        if (!isCoordinatorActive()) return;
        try {
          await continueSinglePending(sub);
        } catch (error) {
          logger.debug(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
            partitionId: sub.partitionId, queryId: sub.queryId, error: error.message,
          });
        }
      }
      dispatchDueRetiringCleanups();
    } finally {
      flushInFlight = false;
      if (pendingImmediateFlush && isCoordinatorActive()) {
        pendingImmediateFlush = false;
        flushPendingSubscriptions({immediateUnresolved: true}).catch((error) => {
          logger.debug(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {error: error.message});
        });
      } else if (!isCoordinatorShutDown()) {
        schedulePendingContinuation();
      }
    }
  };

  function schedulePendingContinuation() {
    if (isCoordinatorShutDown()) return;
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
    continuationTimerTargetMs = targetMs;
    const handle = clock.setTimeout(() => {
      continuationTimer = null;
      continuationTimerTargetMs = 0;
      if (isCoordinatorShutDown()) return;
      const nextDue = computeEarliestContinuationDeadline();
      if (nextDue !== null && nextDue > clock.now()) {
        schedulePendingContinuation();
        return;
      }
      if (isCoordinatorActive()) {
        flushPendingSubscriptions().catch((error) => {
          logger.debug(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {error: error.message});
        });
      } else {
        dispatchDueRetiringCleanups();
        schedulePendingContinuation();
      }
    }, Math.max(1, targetMs - now));
    if (isCoordinatorActive()) handle?.unref?.();
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
      if (subOptions?.requiresCatchup) existing.needsCatchupOnSubscribe = true;
      return {remoteSub: existing, reused: true};
    }
    const inheritedCatchup = Boolean(existing?.needsCatchupOnSubscribe);
    if (existing) cancelSubscriptionRecord(existing);
    const bindingGeneration = ++nextBindingGeneration;
    const subscriberId = `${nodeId}:${queryId}:${partitionId}:${bindingGeneration}`;
    const remoteSub = createRemoteCdcSubscriptionState({
      subKey, partitionId, queryId, subscriberId, bindingGeneration,
      transportKind: REMOTE_CDC_TRANSPORT_KIND.REMOTE,
      targetNodeId: target.targetNodeId, targetAddress: target.targetAddress,
      handler, wrappedHandler, subOptions,
      needsCatchupOnSubscribe: Boolean(subOptions?.requiresCatchup || inheritedCatchup),
    });
    activeSubscriptions.set(subKey, remoteSub);
    remoteSubscribersById.set(subscriberId, remoteSub);
    return {remoteSub, reused: false};
  };

  const trackPending = (
    partitionId, queryId, handler, wrappedHandler, subOptions, retryAfterMs = null,
  ) => {
    if (!isCoordinatorActive()) {
      return {handled: true, result: buildCancelledSubscribeResult()};
    }
    const subKey = `${queryId}:${partitionId}`;
    let pendingSub = activeSubscriptions.get(subKey);
    if (pendingSub && pendingSub.phase === REMOTE_CDC_PHASE.CONNECTING &&
        pendingSub.targetAddress === null) {
      pendingSub.handler = handler;
      pendingSub.wrappedHandler = wrappedHandler;
      pendingSub.subOptions = subOptions;
      pendingSub.needsCatchupOnSubscribe = true;
      const remainingMs = Math.max(0, pendingSub.retryNotBeforeMs - clock.now());
      if (remainingMs > 0) {
        schedulePendingContinuation();
        return {handled: true, result: buildDeferredSubscribeResult(pendingSub, remainingMs)};
      }
    } else {
      if (pendingSub) cancelSubscriptionRecord(pendingSub);
      pendingSub = createRemoteCdcSubscriptionState({
        subKey, partitionId, queryId, subscriberId: null,
        bindingGeneration: ++nextBindingGeneration,
        transportKind: REMOTE_CDC_TRANSPORT_KIND.REMOTE,
        handler, wrappedHandler, subOptions, needsCatchupOnSubscribe: true,
      });
      activeSubscriptions.set(subKey, pendingSub);
    }
    const {binding} = transitionRemoteCdcSubscription(pendingSub, {
      type: REMOTE_CDC_EVENT.START_SUBSCRIBE,
    });
    const settled = transitionRemoteCdcSubscription(pendingSub, {
      type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
      attemptId: binding.attemptId, binding, accepted: false,
      uncertainRemoteRegistration: false, retryAfterMs, error: null, nowMs: clock.now(),
    });
    executeEffects(pendingSub, settled.effects);
    const remainingMs = Math.max(0, pendingSub.retryNotBeforeMs - clock.now());
    return {handled: true, result: buildDeferredSubscribeResult(pendingSub, remainingMs)};
  };

  const settleSubscribeOutcome = async (remoteSub, binding, subOptions, settled) => {
    if (isCoordinatorShutDown()) return {handled: true, result: buildCancelledSubscribeResult()};
    const group = findGroupById?.(remoteSub.queryId);
    const shouldRetire = !isCoordinatorActive() ||
      (group && group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED);
    if (shouldRetire && remoteSub.phase !== REMOTE_CDC_PHASE.RETIRING &&
        remoteSub.phase !== REMOTE_CDC_PHASE.CLOSED) {
      cancelSubscriptionRecord(remoteSub);
    }
    const result = transitionRemoteCdcSubscription(remoteSub, {
      type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
      attemptId: binding.attemptId, binding, accepted: settled.accepted,
      uncertainRemoteRegistration: settled.uncertainRemoteRegistration,
      requiresCatchup: Boolean(subOptions?.requiresCatchup),
      retryAfterMs: settled.retryAfterMs, error: settled.error, nowMs: clock.now(),
    });
    const cleanups = executeEffects(remoteSub, result.effects);
    notifyShutdownDrainProgress();
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
        ...settled.answer, subscribed: true,
        bindingGeneration: remoteSub.bindingGeneration,
        catchingUp: remoteSub.phase === REMOTE_CDC_PHASE.CATCHING_UP,
      },
    };
  };

  const subscribeRemote = async (
    partitionId, queryId, handler, wrappedHandler, subOptions, target,
  ) => {
    if (!isCoordinatorActive()) {
      return {handled: true, result: buildCancelledSubscribeResult()};
    }
    const activeRouter = resolveActiveRouter();
    if (!activeRouter || !liveQueryCdcAddress || !target) {
      return trackPending(partitionId, queryId, handler, wrappedHandler, subOptions);
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
    if (!binding) return {handled: true, result: buildCancelledSubscribeResult()};
    try {
      const delivery = await activeRouter.deliver(binding.targetAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_SUBSCRIBE,
        subscriberId: binding.subscriberId,
        subscriberAddress: liveQueryCdcAddress,
        queryId, partitionId,
      });
      const answer = extractRemoteDeliveryAnswer(delivery);
      const accepted = !isFailedSubscribeAnswer(answer);
      if (!accepted) {
        logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
          partitionId, queryId, targetAddress: binding.targetAddress, error: answer.error || null,
        });
      }
      return await settleSubscribeOutcome(remoteSub, binding, subOptions, {
        accepted,
        uncertainRemoteRegistration: !accepted && isUncertainSubscribeDelivery(delivery),
        answer, retryAfterMs: answer.retryAfterMs ?? null, error: answer.error || null,
      });
    } catch (error) {
      logger.warn(LOG_MSG_REMOTE_SUBSCRIBE_FAILED, {
        partitionId, queryId, targetAddress: binding.targetAddress, error: error.message,
      });
      return await settleSubscribeOutcome(remoteSub, binding, subOptions, {
        accepted: false, uncertainRemoteRegistration: isUncertainSubscribeError(error),
        answer: null, retryAfterMs: normalizePositiveRetryAfterMs(error?.retryAfterMs, null),
        error: error.message,
      });
    }
  };

  const trackLocal = (
    partitionId, queryId, partition, handler, wrappedHandler, subOptions,
  ) => {
    const subKey = `${queryId}:${partitionId}`;
    const existing = activeSubscriptions.get(subKey);
    const inheritedCatchup = Boolean(existing?.needsCatchupOnSubscribe);
    if (existing) cancelSubscriptionRecord(existing);
    if (!isCoordinatorActive()) return null;
    const localSub = createRemoteCdcSubscriptionState({
      subKey, partitionId, queryId, subscriberId: null,
      bindingGeneration: ++nextBindingGeneration,
      transportKind: REMOTE_CDC_TRANSPORT_KIND.LOCAL,
      localPartition: partition, handler, wrappedHandler, subOptions,
    });
    if (subOptions?.requiresCatchup || inheritedCatchup) {
      const debt = transitionRemoteCdcSubscription(localSub, {
        type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT, scheduleContinuation: true,
      });
      executeEffects(localSub, debt.effects);
    }
    activeSubscriptions.set(subKey, localSub);
    return localSub;
  };

  const unsubscribeTracked = (partitionId, queryId) => {
    const subKey = `${queryId}:${partitionId}`;
    const existing = activeSubscriptions.get(subKey);
    if (!existing) return {remoteSub: null, localSub: null};
    cancelSubscriptionRecord(existing);
    return existing.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE ?
      {remoteSub: existing, localSub: null} :
      {remoteSub: null, localSub: {partition: existing.localPartition, ...existing}};
  };

  const shouldRebindSubscription = (sub, partitionId, overrideRow) => {
    const localPartition = resolveLocalPartition(partitionId);
    const activeRouter = resolveActiveRouter();
    const remoteTarget = activeRouter ?
      resolveRemotePartitionTarget(metadataStore, partitionId, nodeId, overrideRow) : null;
    if (sub.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE) {
      if (localPartition &&
          (localPartition.isLeader !== false ||
            (sub.targetAddress === null && Boolean(localPartition.subscribeToCDCWithHandshake)))) {
        return true;
      }
      if (!remoteTarget) return false;
      if (remoteTarget.targetNodeId !== sub.targetNodeId ||
          remoteTarget.targetAddress !== sub.targetAddress) {
        return true;
      }
      if (sub.phase === REMOTE_CDC_PHASE.CONNECTING) {
        return sub.inFlightSubscribe === null && sub.retryNotBeforeMs <= clock.now();
      }
      return false;
    }
    return Boolean(sub.localPartition?.isLeader === false && remoteTarget);
  };

  const isRebindSuperseded = (subKey, rebindToken) =>
    latestRebindTokenByKey.get(subKey) !== rebindToken ||
    Boolean(activeSubscriptions.get(subKey)?.subscribed);

  const rebindSubscriptionIfNeeded = async (sub, partitionId, record) => {
    if (!isCoordinatorActive()) return;
    const group = findGroupById(sub.queryId);
    if (isGroupClosed(group) || activeSubscriptions.get(sub.subKey) !== sub ||
        !shouldRebindSubscription(sub, partitionId, record)) {
      return;
    }
    const rebindToken = ++nextRebindToken;
    latestRebindTokenByKey.set(sub.subKey, rebindToken);
    try {
      await unsubscribeFromPartition(partitionId, sub.queryId);
      if (isGroupClosed(findGroupById(sub.queryId)) ||
          latestRebindTokenByKey.get(sub.subKey) !== rebindToken) return;
      const subAnswer = await subscribeToPartition(
        partitionId, sub.queryId, sub.handler, {...sub.subOptions, requiresCatchup: true},
      );
      if (isGroupClosed(findGroupById(sub.queryId)) || subAnswer?.cancelled === true ||
          latestRebindTokenByKey.get(sub.subKey) !== rebindToken) return;
      const currentSub = activeSubscriptions.get(sub.subKey);
      if (isFailedSubscribeAnswer(subAnswer)) {
        if (!currentSub?.subscribed) markGroupPending(group, partitionId);
        return;
      }
      if (!currentSub || (subAnswer?.bindingGeneration !== undefined &&
          currentSub.bindingGeneration !== subAnswer.bindingGeneration)) return;
      markGroupSubscribed(group, partitionId, subAnswer);
      if (currentSub.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
        await runCatchupRefresh(group, currentSub);
      }
    } catch (error) {
      if (!isGroupClosed(findGroupById(sub.queryId)) &&
          !isRebindSuperseded(sub.subKey, rebindToken)) {
        markGroupPending(group, partitionId);
      }
      logger.warn(LOG_MSG_REMOTE_REBIND_FAILED, {
        partitionId, queryId: sub.queryId, error: error.message,
      });
    } finally {
      if (latestRebindTokenByKey.get(sub.subKey) === rebindToken) {
        latestRebindTokenByKey.delete(sub.subKey);
      }
    }
  };

  const reconcileSubscriptionsOnTopologyChange = async (change) => {
    if (!isCoordinatorActive()) return;
    const record = change?.new || change?.old || null;
    const partitionId = record?.partition_id || null;
    if (!partitionId || change?.operation === CDC_OPERATION.DELETE) return;
    const candidates = Array.from(activeSubscriptions.values())
      .filter((sub) => sub.partitionId === partitionId);
    for (const sub of candidates) {
      await rebindSubscriptionIfNeeded(sub, partitionId, record);
    }
  };

  const resolveTargetForPartition = (partitionId) => {
    const activeRouter = resolveActiveRouter();
    return activeRouter ? resolveRemotePartitionTarget(metadataStore, partitionId, nodeId) : null;
  };

  const unregisterRouter = () => {
    if (!liveQueryCdcAddress) return;
    registeredRouter?.unregisterExact?.(liveQueryCdcAddress, dispatchInboundCdcEvent);
    registeredRouter = null;
  };

  function finalizeShutdown() {
    const remainingRetiringCount = countRemainingRetiringSubscriptions(retiringSubscriptions);
    coordinatorState = REMOTE_CDC_COORDINATOR_STATE.SHUT_DOWN;
    clearPendingContinuationTimer();
    clearShutdownDeadlineTimer();
    activeSubscriptions.clear();
    remoteSubscribersById.clear();
    retiringSubscriptions.clear();
    latestRebindTokenByKey.clear();
    unregisterRouter();
    return {settled: remainingRetiringCount === 0, remainingRetiringCount};
  }

  function notifyShutdownDrainProgress() {
    if (coordinatorState !== REMOTE_CDC_COORDINATOR_STATE.DRAINING_SHUTDOWN ||
        !resolveShutdownDrain || countRemainingRetiringSubscriptions(retiringSubscriptions) > 0) {
      return;
    }
    const resolve = resolveShutdownDrain;
    resolveShutdownDrain = null;
    resolve(finalizeShutdown());
  }

  function cancelActiveSubscriptionsForShutdown() {
    latestRebindTokenByKey.clear();
    unregisterRouter();
    for (const sub of Array.from(activeSubscriptions.values())) {
      if (sub.transportKind === REMOTE_CDC_TRANSPORT_KIND.LOCAL) {
        sub.localPartition?.unsubscribeFromCDC?.(sub.wrappedHandler);
      }
      cancelSubscriptionRecord(sub);
    }
    activeSubscriptions.clear();
    remoteSubscribersById.clear();
    dispatchDueRetiringCleanups();
  }

  const shutdown = (shutdownOptions = {}) => {
    if (shutdownPromise) return shutdownPromise;
    const drainTimeoutMs = normalizeShutdownDrainTimeoutMs(
      shutdownOptions?.timeoutMs, defaultShutdownDrainTimeoutMs,
    );
    coordinatorState = REMOTE_CDC_COORDINATOR_STATE.DRAINING_SHUTDOWN;
    cancelActiveSubscriptionsForShutdown();
    if (countRemainingRetiringSubscriptions(retiringSubscriptions) === 0 || drainTimeoutMs === 0) {
      shutdownPromise = Promise.resolve(finalizeShutdown());
      return shutdownPromise;
    }
    clearPendingContinuationTimer();
    schedulePendingContinuation();
    shutdownPromise = new Promise((resolve) => {
      resolveShutdownDrain = resolve;
      shutdownDeadlineTimer = clock.setTimeout(() => {
        shutdownDeadlineTimer = null;
        if (!resolveShutdownDrain) return;
        const finish = resolveShutdownDrain;
        resolveShutdownDrain = null;
        finish(finalizeShutdown());
      }, drainTimeoutMs);
    });
    return shutdownPromise;
  };

  return {
    get hasRouter() {
      return Boolean(resolveActiveRouter());
    },
    isShuttingDown: () => !isCoordinatorActive(),
    resolveRemoteTarget: resolveTargetForPartition,
    subscribeRemote, trackLocal, trackPending, unsubscribeTracked,
    flushPendingSubscriptions, reconcileSubscriptionsOnTopologyChange, shutdown,
  };
}

export {createRemoteLiveQueryCdcCoordinator};
