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
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from './partition-service-constants.js';

const NO_HANDLER_REASON_CODE = 'no_handler';
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

function retireRemoteSubscriber(service, entry) {
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

function handleRemoteDeliveryOutcome(service, entry, delivery) {
  if (isUnrecoverableHandlerMissingDelivery(delivery)) {
    retireRemoteSubscriber(service, entry);
    return {success: false, noHandler: true};
  }
  if (delivery?.success === false) {
    logRemoteDeliveryFailure(service, entry, delivery.error || null);
    return {success: false, error: delivery.error || null};
  }
  return deliveryAnswerOf(delivery) ?? delivery ?? {success: true};
}

function handleRemoteDeliveryError(service, entry, error) {
  if (error?.noHandler === true) {
    retireRemoteSubscriber(service, entry);
    return {success: false, noHandler: true};
  }
  if (service.isShutdown) {
    return {success: false};
  }
  const message = error?.message || String(error);
  logRemoteDeliveryFailure(service, entry, message);
  return {success: false, error: message};
}

function buildRemoteCdcForwarder(service, entry) {
  return async (events) => {
    const router = resolvePartitionRouter(service);
    if (service.isShutdown || !router) {
      return {success: false};
    }
    try {
      const delivery = await router.deliver(entry.subscriberAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LIVE_QUERY_CDC_EVENT,
        partitionId: service.partitionId,
        queryId: entry.queryId,
        subscriberId: entry.subscriberId,
        events,
      });
      return handleRemoteDeliveryOutcome(service, entry, delivery);
    } catch (error) {
      return handleRemoteDeliveryError(service, entry, error);
    }
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
    };
    entry.forwarder = buildRemoteCdcForwarder(service, entry);
    service.remoteLiveQueryCdcSubscribers.set(payload.subscriberId, entry);
    return entry;
  }
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
  service.remoteLiveQueryCdcSubscribers?.clear();
}

export {
  clearRemoteLiveQueryCdcSubscribers,
  handleRemoteLiveQueryCdcSubscribe,
  handleRemoteLiveQueryCdcUnsubscribe,
};
