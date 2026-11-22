/**
 * Remote live-query CDC subscription handlers for PartitionService.
 *
 * Bridges remote MessageRouter subscribers to the partition's canonical
 * subscribeToCDCWithHandshake / unsubscribeFromCDC path through a single
 * per-subscriber ordered delivery lane with exact batch/overflow coverage
 * and transport retry-after not-before enforcement.
 */

import {
  deliveryAnswerOf,
  deliveryTransportOf,
  forwardedDeliveryAnswer,
  isDeliveredTransportDeliveryOutcome,
  normalizePositiveRetryAfterMs,
} from '../transport/transport-semantic-outcome.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from './partition-service-constants.js';

const NO_HANDLER_REASON_CODE = 'no_handler';
const MAX_PENDING_REMOTE_EVENTS = 256;
// ends-on: queued remote live-query CDC events are delivered or subscriber is retired
const REMOTE_CDC_RETRY_DELAY_MS = 50;
const REMOTE_CDC_ERROR = Object.freeze({
  SHUTDOWN: 'Partition service is shut down',
  TRANSPORT_UNAVAILABLE: 'Partition transport unavailable for remote live query CDC',
  INVALID_SUBSCRIBE: 'Invalid remote live query CDC subscribe payload',
  INVALID_UNSUBSCRIBE: 'Invalid remote live query CDC unsubscribe payload',
});
const REMOTE_CDC_DELIVERY_FAILED_LOG =
  'Remote live query CDC event delivery failed';
const INACTIVE_SUBSCRIBER_ANSWER = Object.freeze({
  acknowledged: false,
  success: false,
  retryable: false,
});
const DELIVERED_OK_ANSWER = Object.freeze({
  acknowledged: true,
  success: true,
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function resolvePartitionRouter(service) {
  const router = service.transport;
  return router?.deliver ? router : null;
}

function clearEntryFlushTimer(service, entry) {
  if (entry.flushTimer) {
    service.timeSource.clearTimeout(entry.flushTimer);
    entry.flushTimer = null;
    entry.flushTimerTargetMs = 0;
  }
}

function isSubscriberActive(service, entry) {
  if (service.isShutdown) return false;
  return !entry.unsubscribed;
}

function hasPendingDeliveryWork(entry) {
  return entry.pendingEvents.length > 0 || entry.overflowResyncRequired;
}

function remainingBackoffMs(service, entry) {
  if (entry.retryNotBeforeMs <= 0) return 0;
  return Math.max(0, entry.retryNotBeforeMs - service.timeSource.now());
}

function buildBackoffDeferredAnswer(remainingMs) {
  return {
    acknowledged: false,
    success: false,
    retryable: true,
    deferRetry: true,
    retryAfterMs: remainingMs,
  };
}

function recordRetryBackoff(service, entry, answer) {
  const now = service.timeSource.now();
  const advisedMs = normalizePositiveRetryAfterMs(answer?.retryAfterMs, null);
  const delayMs = advisedMs !== null ? advisedMs : REMOTE_CDC_RETRY_DELAY_MS;
  entry.retryNotBeforeMs = Math.max(entry.retryNotBeforeMs, now + delayMs);
}

function resolveWaitersUpTo(entry, maxToken, answer) {
  if (entry.waiters.length === 0) return;
  const remaining = [];
  for (const waiter of entry.waiters) {
    if (waiter.token <= maxToken) {
      waiter.resolve(answer);
    } else {
      remaining.push(waiter);
    }
  }
  entry.waiters = remaining;
}

function resolveAllWaiters(entry, answer) {
  if (entry.waiters.length === 0) return;
  const waiters = entry.waiters;
  entry.waiters = [];
  for (const waiter of waiters) {
    waiter.resolve(answer);
  }
}

function retireRemoteSubscriber(service, entry, reasonAnswer = INACTIVE_SUBSCRIBER_ANSWER) {
  entry.unsubscribed = true;
  clearEntryFlushTimer(service, entry);
  entry.pendingEvents = [];
  entry.overflowResyncRequired = false;
  entry.retryNotBeforeMs = 0;
  resolveAllWaiters(entry, reasonAnswer);
  service.unsubscribeFromCDC?.(entry.forwarder);
  if (service.remoteLiveQueryCdcSubscribers?.get(entry.subscriberId) === entry) {
    service.remoteLiveQueryCdcSubscribers.delete(entry.subscriberId);
  }
}

function isUnrecoverableHandlerMissingDelivery(delivery) {
  if (!delivery) return false;
  if (delivery.noHandler === true) return true;
  const transport = deliveryTransportOf(delivery);
  if (transport && !isDeliveredTransportDeliveryOutcome(transport)) {
    return transport.noHandler === true ||
      transport.reasonCode === NO_HANDLER_REASON_CODE;
  }
  const answer = deliveryAnswerOf(delivery);
  return Boolean(answer?.success === false && answer?.noHandler === true);
}

function logRemoteDeliveryFailure(service, entry, errorMessage) {
  service.logger?.debug?.(REMOTE_CDC_DELIVERY_FAILED_LOG, {
    partitionId: service.partitionId,
    subscriberId: entry.subscriberId,
    subscriberAddress: entry.subscriberAddress,
    error: errorMessage,
  });
}

function normalizeFailureAnswer(raw, defaultRetryable) {
  const retryAfterMs = normalizePositiveRetryAfterMs(raw?.retryAfterMs, null);
  return {
    ...raw,
    acknowledged: false,
    success: false,
    retryable: raw?.deferRetry === true || raw?.retryable === true || defaultRetryable,
    ...(retryAfterMs !== null ? {retryAfterMs} : {}),
  };
}

function buildAcceptedOrRefusedAnswer(service, entry, raw) {
  if (!raw || raw.success === false || raw.acknowledged === false) {
    logRemoteDeliveryFailure(service, entry, raw?.error || null);
    return normalizeFailureAnswer(raw || {}, true);
  }
  return {acknowledged: true, success: true, ...raw};
}

function normalizeRemoteDeliveryOutcome(service, entry, delivery) {
  if (isUnrecoverableHandlerMissingDelivery(delivery)) {
    return {acknowledged: false, success: false, noHandler: true, retryable: false};
  }
  if (!delivery) {
    return buildAcceptedOrRefusedAnswer(service, entry, null);
  }
  const raw = delivery.transport ?
    (forwardedDeliveryAnswer(delivery) ?? DELIVERED_OK_ANSWER) :
    delivery;
  return buildAcceptedOrRefusedAnswer(service, entry, raw);
}

function handleRemoteDeliveryError(service, entry, error) {
  const isNoHandler = error?.noHandler === true;
  const message = error?.message || String(error);
  const retryAfterMs = normalizePositiveRetryAfterMs(error?.retryAfterMs, null);
  if (!isNoHandler && !service.isShutdown) {
    logRemoteDeliveryFailure(service, entry, message);
  }
  return {
    acknowledged: false,
    success: false,
    noHandler: isNoHandler,
    retryable: !isNoHandler && !service.isShutdown,
    ...(retryAfterMs !== null ? {retryAfterMs} : {}),
    ...(isNoHandler || service.isShutdown ? {} : {error: message}),
  };
}

function updateSubscriberDeliveredSeq(service, entry, lastSeq) {
  const state = service.cdcSubscriberStates?.get(entry.forwarder);
  if (!state) return;
  if (state.lastDeliveredSequenceNumber === null ||
      lastSeq > state.lastDeliveredSequenceNumber) {
    state.lastDeliveredSequenceNumber = lastSeq;
  }
  const now = service.timeSource?.now?.();
  if (now !== undefined) {
    state.lastDeliveredAt = now;
  }
}

function enqueuePendingEvents(entry, events, token) {
  const wrapped = events.map((event) => ({event, token}));
  const combined = [...entry.pendingEvents, ...wrapped];
  if (combined.length > MAX_PENDING_REMOTE_EVENTS) {
    entry.overflowResyncRequired = true;
    entry.overflowEpoch += 1;
    entry.pendingEvents = combined.slice(combined.length - MAX_PENDING_REMOTE_EVENTS);
    return;
  }
  entry.pendingEvents = combined;
}

function retireCoveredBatch(
  service, entry, batchEvents, coveredMaxToken, sentResyncRequired, coveredOverflowEpoch,
) {
  if (coveredMaxToken !== null) {
    const firstUncovered = entry.pendingEvents.findIndex(
      (item) => item.token > coveredMaxToken,
    );
    entry.pendingEvents = firstUncovered === -1 ?
      [] :
      entry.pendingEvents.slice(firstUncovered);
  }
  if (sentResyncRequired && entry.overflowEpoch === coveredOverflowEpoch) {
    entry.overflowResyncRequired = false;
  }
  entry.retryNotBeforeMs = 0;
  const lastSeq = batchEvents.at(-1)?.sequenceNumber;
  if (Number.isFinite(lastSeq)) {
    entry.lastDeliveredSeq = lastSeq;
    updateSubscriberDeliveredSeq(service, entry, lastSeq);
  }
}

async function sendBatchToRemote(service, entry, events, resyncRequired) {
  const router = resolvePartitionRouter(service);
  if (!isSubscriberActive(service, entry) || !router) {
    return INACTIVE_SUBSCRIBER_ANSWER;
  }
  try {
    const delivery = await router.deliver(entry.subscriberAddress, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_EVENT,
      partitionId: service.partitionId,
      queryId: entry.queryId,
      subscriberId: entry.subscriberId,
      previousDeliveredSeq: entry.lastDeliveredSeq,
      resyncRequired,
      events,
    });
    return normalizeRemoteDeliveryOutcome(service, entry, delivery);
  } catch (error) {
    return handleRemoteDeliveryError(service, entry, error);
  }
}

function schedulePendingFlush(service, entry) {
  if (!isSubscriberActive(service, entry) || !hasPendingDeliveryWork(entry)) return;
  const now = service.timeSource.now();
  const targetMs = Math.max(entry.retryNotBeforeMs, now + 1);
  if (entry.flushTimer) {
    if (entry.flushTimerTargetMs === targetMs) return;
    clearEntryFlushTimer(service, entry);
  }
  const delayMs = Math.max(1, targetMs - now);
  entry.flushTimerTargetMs = targetMs;
  const handle = service.timeSource.setTimeout(() => {
    entry.flushTimer = null;
    entry.flushTimerTargetMs = 0;
    if (!isSubscriberActive(service, entry)) return;
    if (remainingBackoffMs(service, entry) > 0) {
      schedulePendingFlush(service, entry);
      return;
    }
    drainPendingEvents(service, entry).catch((error) => {
      logRemoteDeliveryFailure(service, entry, error?.message || String(error));
    });
  }, delayMs);
  handle?.unref?.();
  entry.flushTimer = handle;
}

async function runSingleDrainStep(service, entry) {
  const remainingMs = remainingBackoffMs(service, entry);
  if (remainingMs > 0) {
    const deferred = buildBackoffDeferredAnswer(remainingMs);
    schedulePendingFlush(service, entry);
    resolveAllWaiters(entry, deferred);
    return {done: true, answer: deferred};
  }
  const batchItems = entry.pendingEvents.slice();
  const batchEvents = batchItems.map((item) => item.event);
  const coveredMaxToken = batchItems.length > 0 ? batchItems.at(-1).token : null;
  const sentResyncRequired = entry.overflowResyncRequired;
  const coveredOverflowEpoch = entry.overflowEpoch;
  const answer = await sendBatchToRemote(service, entry, batchEvents, sentResyncRequired);
  if (answer.noHandler === true) {
    retireRemoteSubscriber(service, entry, answer);
    return {done: true, answer};
  }
  if (!isSubscriberActive(service, entry)) {
    resolveAllWaiters(entry, INACTIVE_SUBSCRIBER_ANSWER);
    return {done: true, answer: INACTIVE_SUBSCRIBER_ANSWER};
  }
  if (answer.success === false || answer.acknowledged === false) {
    recordRetryBackoff(service, entry, answer);
    schedulePendingFlush(service, entry);
    resolveAllWaiters(entry, answer);
    return {done: true, answer};
  }
  retireCoveredBatch(
    service, entry, batchEvents, coveredMaxToken, sentResyncRequired, coveredOverflowEpoch,
  );
  if (coveredMaxToken !== null) {
    resolveWaitersUpTo(entry, coveredMaxToken, answer);
  }
  return {done: false, answer};
}

async function runPendingDrainLoop(service, entry) {
  try {
    while (hasPendingDeliveryWork(entry) && isSubscriberActive(service, entry)) {
      const step = await runSingleDrainStep(service, entry);
      if (step.done) return step.answer;
    }
    clearEntryFlushTimer(service, entry);
    resolveAllWaiters(entry, DELIVERED_OK_ANSWER);
    return DELIVERED_OK_ANSWER;
  } finally {
    entry.drainPromise = null;
    if (!isSubscriberActive(service, entry)) {
      resolveAllWaiters(entry, INACTIVE_SUBSCRIBER_ANSWER);
    }
  }
}

async function drainPendingEvents(service, entry) {
  while (entry.drainPromise) {
    await entry.drainPromise;
  }
  if (!isSubscriberActive(service, entry)) {
    resolveAllWaiters(entry, INACTIVE_SUBSCRIBER_ANSWER);
    return INACTIVE_SUBSCRIBER_ANSWER;
  }
  if (!hasPendingDeliveryWork(entry)) {
    resolveAllWaiters(entry, DELIVERED_OK_ANSWER);
    return DELIVERED_OK_ANSWER;
  }
  entry.drainPromise = runPendingDrainLoop(service, entry);
  return entry.drainPromise;
}

function buildRemoteCdcForwarder(service, entry) {
  return async (events) => {
    if (!isSubscriberActive(service, entry) || !resolvePartitionRouter(service)) {
      return INACTIVE_SUBSCRIBER_ANSWER;
    }
    if (!Array.isArray(events) || events.length === 0) {
      return DELIVERED_OK_ANSWER;
    }
    const token = ++entry.nextDeliveryToken;
    enqueuePendingEvents(entry, events, token);
    const remainingMs = remainingBackoffMs(service, entry);
    if (remainingMs > 0) {
      schedulePendingFlush(service, entry);
      return buildBackoffDeferredAnswer(remainingMs);
    }
    const waiterPromise = new Promise((resolve) => {
      entry.waiters.push({token, resolve});
    });
    drainPendingEvents(service, entry).catch((error) => {
      logRemoteDeliveryFailure(service, entry, error?.message || String(error));
    });
    return waiterPromise;
  };
}

function validateSubscribeRequest(service, payload) {
  if (service.isShutdown) {
    return REMOTE_CDC_ERROR.SHUTDOWN;
  }
  if (!resolvePartitionRouter(service)) {
    return REMOTE_CDC_ERROR.TRANSPORT_UNAVAILABLE;
  }
  if (!isNonEmptyString(payload?.subscriberId) ||
      !isNonEmptyString(payload?.subscriberAddress)) {
    return REMOTE_CDC_ERROR.INVALID_SUBSCRIBE;
  }
  return null;
}

function getOrCreateRemoteSubscriberEntry(service, payload) {
  if (!service.remoteLiveQueryCdcSubscribers) {
    service.remoteLiveQueryCdcSubscribers = new Map();
  }
  let entry = service.remoteLiveQueryCdcSubscribers.get(payload.subscriberId);
  if (!entry) {
    entry = {
      subscriberId: payload.subscriberId,
      subscriberAddress: payload.subscriberAddress,
      queryId: payload.queryId || null,
      forwarder: null,
      pendingEvents: [],
      waiters: [],
      nextDeliveryToken: 0,
      overflowResyncRequired: false,
      overflowEpoch: 0,
      lastDeliveredSeq: null,
      retryNotBeforeMs: 0,
      flushTimer: null,
      flushTimerTargetMs: 0,
      drainPromise: null,
      unsubscribed: false,
    };
    entry.forwarder = buildRemoteCdcForwarder(service, entry);
    service.remoteLiveQueryCdcSubscribers.set(payload.subscriberId, entry);
    return entry;
  }
  entry.unsubscribed = false;
  entry.subscriberAddress = payload.subscriberAddress;
  entry.queryId = payload.queryId || null;
  return entry;
}

/**
 * Register or update a remote live-query CDC forwarder on this partition.
 * @param {Object} service - PartitionService instance.
 * @param {Object} payload - Subscribe message payload.
 * @return {Promise<Object>} Subscription handshake outcome.
 */
async function handleRemoteLiveQueryCdcSubscribe(service, payload) {
  const error = validateSubscribeRequest(service, payload);
  if (error) {
    return {success: false, error};
  }
  const entry = getOrCreateRemoteSubscriberEntry(service, payload);
  const handshake = await service.subscribeToCDCWithHandshake(entry.forwarder, {
    subscriberId: payload.subscriberId,
  });
  if (!isSubscriberActive(service, entry)) {
    retireRemoteSubscriber(service, entry);
    return {success: false, error: REMOTE_CDC_ERROR.SHUTDOWN};
  }
  return {
    success: true,
    ...handshake,
    appliedIndex: service.getAppliedIndex?.() ?? null,
  };
}

/**
 * Unregister a remote live-query CDC forwarder from this partition.
 * @param {Object} service - PartitionService instance.
 * @param {Object} payload - Unsubscribe message payload.
 * @return {Object} Unsubscribe acknowledgement.
 */
function handleRemoteLiveQueryCdcUnsubscribe(service, payload) {
  if (!isNonEmptyString(payload?.subscriberId)) {
    return {success: false, error: REMOTE_CDC_ERROR.INVALID_UNSUBSCRIBE};
  }
  const entry = service.remoteLiveQueryCdcSubscribers?.get(payload.subscriberId);
  if (entry) {
    retireRemoteSubscriber(service, entry);
  }
  return {success: true};
}

/**
 * Clear tracked remote live-query CDC subscribers during partition shutdown.
 * @param {Object} service - PartitionService instance.
 */
function clearRemoteLiveQueryCdcSubscribers(service) {
  if (!service.remoteLiveQueryCdcSubscribers) return;
  for (const entry of service.remoteLiveQueryCdcSubscribers.values()) {
    entry.unsubscribed = true;
    clearEntryFlushTimer(service, entry);
    entry.pendingEvents = [];
    entry.overflowResyncRequired = false;
    entry.retryNotBeforeMs = 0;
    resolveAllWaiters(entry, INACTIVE_SUBSCRIBER_ANSWER);
  }
  service.remoteLiveQueryCdcSubscribers.clear();
}

export {
  clearRemoteLiveQueryCdcSubscribers,
  handleRemoteLiveQueryCdcSubscribe,
  handleRemoteLiveQueryCdcUnsubscribe,
};
