/**
 * Remote live-query CDC subscription handlers for PartitionService.
 *
 * Bridges remote MessageRouter subscribers to the partition's canonical
 * subscribeToCDCWithHandshake / unsubscribeFromCDC path without altering
 * durable CDC obligation ownership.
 */

import {
  deliveryAnswerOf,
  deliveryTransportOf,
  forwardedDeliveryAnswer,
  isDeliveredTransportDeliveryOutcome,
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
  }
}

function isSubscriberActive(service, entry) {
  if (service.isShutdown) return false;
  return !entry.unsubscribed;
}

function retireRemoteSubscriber(service, entry) {
  entry.unsubscribed = true;
  clearEntryFlushTimer(service, entry);
  entry.pendingEvents = [];
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
  return {
    ...raw,
    acknowledged: false,
    success: false,
    retryable: raw?.deferRetry === true || raw?.retryable === true || defaultRetryable,
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
    (forwardedDeliveryAnswer(delivery) ?? {acknowledged: true, success: true}) :
    delivery;
  return buildAcceptedOrRefusedAnswer(service, entry, raw);
}

function handleRemoteDeliveryError(service, entry, error) {
  const isNoHandler = error?.noHandler === true;
  const message = error?.message || String(error);
  if (!isNoHandler && !service.isShutdown) {
    logRemoteDeliveryFailure(service, entry, message);
  }
  return {
    acknowledged: false,
    success: false,
    noHandler: isNoHandler,
    retryable: !isNoHandler && !service.isShutdown,
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

function enqueuePendingEvents(entry, events) {
  const combined = [...entry.pendingEvents, ...events];
  if (combined.length > MAX_PENDING_REMOTE_EVENTS) {
    entry.overflowResyncRequired = true;
    entry.pendingEvents = combined.slice(combined.length - MAX_PENDING_REMOTE_EVENTS);
    return;
  }
  entry.pendingEvents = combined;
}

async function sendBatchToRemote(service, entry, events, resyncRequired) {
  const router = resolvePartitionRouter(service);
  if (!isSubscriberActive(service, entry) || !router) {
    return {acknowledged: false, success: false, retryable: false};
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
  if (entry.flushTimer || !isSubscriberActive(service, entry)) return;
  if (entry.pendingEvents.length === 0) return;
  const handle = service.timeSource.setTimeout(() => {
    entry.flushTimer = null;
    if (!isSubscriberActive(service, entry)) return;
    drainPendingEvents(service, entry).catch((error) => {
      logRemoteDeliveryFailure(service, entry, error?.message || String(error));
    });
  }, REMOTE_CDC_RETRY_DELAY_MS);
  handle?.unref?.();
  entry.flushTimer = handle;
}

function recordDeliveredBatch(service, entry, batch, updateOwnerState) {
  entry.overflowResyncRequired = false;
  const lastSeq = batch.at(-1)?.sequenceNumber;
  if (Number.isFinite(lastSeq)) {
    entry.lastDeliveredSeq = lastSeq;
    if (updateOwnerState) {
      updateSubscriberDeliveredSeq(service, entry, lastSeq);
    }
  }
}

async function runPendingDrainLoop(service, entry) {
  while (entry.pendingEvents.length > 0 && isSubscriberActive(service, entry)) {
    const batch = entry.pendingEvents.slice();
    const answer = await sendBatchToRemote(
      service, entry, batch, entry.overflowResyncRequired,
    );
    if (answer.noHandler === true) {
      retireRemoteSubscriber(service, entry);
      return answer;
    }
    if (answer.success === false || answer.acknowledged === false) {
      schedulePendingFlush(service, entry);
      return answer;
    }
    entry.pendingEvents.splice(0, batch.length);
    recordDeliveredBatch(service, entry, batch, true);
  }
  clearEntryFlushTimer(service, entry);
  return {acknowledged: true, success: true};
}

async function drainPendingEvents(service, entry) {
  if (entry.drainPromise) {
    return entry.drainPromise;
  }
  entry.drainPromise = runPendingDrainLoop(service, entry).finally(() => {
    entry.drainPromise = null;
  });
  return entry.drainPromise;
}

function handleFailedLiveDelivery(service, entry, events, answer) {
  if (answer.noHandler === true) {
    retireRemoteSubscriber(service, entry);
    return answer;
  }
  enqueuePendingEvents(entry, events);
  schedulePendingFlush(service, entry);
  return answer;
}

function buildRemoteCdcForwarder(service, entry) {
  return async (events) => {
    if (!isSubscriberActive(service, entry) || !resolvePartitionRouter(service)) {
      return {acknowledged: false, success: false, retryable: false};
    }
    if (entry.drainPromise || entry.pendingEvents.length > 0) {
      const drainResult = await drainPendingEvents(service, entry);
      if (drainResult.success === false || drainResult.acknowledged === false) {
        return handleFailedLiveDelivery(service, entry, events, drainResult);
      }
    }
    const answer = await sendBatchToRemote(
      service, entry, events, entry.overflowResyncRequired,
    );
    if (answer.success === false || answer.acknowledged === false) {
      return handleFailedLiveDelivery(service, entry, events, answer);
    }
    recordDeliveredBatch(service, entry, events, false);
    return answer;
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
      overflowResyncRequired: false,
      lastDeliveredSeq: null,
      flushTimer: null,
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
  }
  service.remoteLiveQueryCdcSubscribers.clear();
}

export {
  clearRemoteLiveQueryCdcSubscribers,
  handleRemoteLiveQueryCdcSubscribe,
  handleRemoteLiveQueryCdcUnsubscribe,
};
