import {CDC_MESSAGE_TYPE} from './worker-constants.js';

function ensurePartitionCDCForwarder(service) {
  if (!service.cdcEmitter ||
      !service.messageBridge ||
      service.cdcSubscriberForwarder) {
    return;
  }

  service.cdcSubscriberForwarder = (event) => {
    const subscriberAddresses = Array.from(service.cdcSubscribers);
    for (const subscriberAddress of subscriberAddresses) {
      service.deliverCDCEventToSubscriber(subscriberAddress, event);
    }
  };

  service.cdcEmitter.subscribe(service.cdcSubscriberForwarder);
}

function removePartitionCDCForwarder(service) {
  if (!service.cdcEmitter || !service.cdcSubscriberForwarder) {
    return;
  }
  service.cdcEmitter.unsubscribe(service.cdcSubscriberForwarder);
  service.cdcSubscriberForwarder = null;
}

function deliverPartitionCDCEventToSubscriber(
  service,
  subscriberAddress,
  event,
  deliveryFailedMessage,
) {
  if (!service.messageBridge) {
    return;
  }
  try {
    service.messageBridge.sendFireAndForget(subscriberAddress, {
      type: CDC_MESSAGE_TYPE.CDC_EVENT,
      cdcEvent: event,
    });
  } catch (error) {
    service.logger.error(deliveryFailedMessage, {
      partitionId: service.partitionId,
      subscriberAddress,
      error: error.message,
    });
  }
}

export {
  deliverPartitionCDCEventToSubscriber,
  ensurePartitionCDCForwarder,
  removePartitionCDCForwarder,
};
