import {CDC_COMPLETION, hasDurableCdcEvents,
  isCommittedCdcOutcome, isProvisionalCdcOutcome} from
  '../../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation} from '../../cdc/cdc-delivery-invocation.js';
import {PARTITION_SERVICE_CDC} from '../../partition/partition-service-constants.js';
const LOCAL_STR_OPERATIONAL_MESSAGE_GROUP_INGRESS_NOT_RE = 'Operational message-group ingress not ready ';
const PARTITION_CDC_PROPAGATION_HELD_MSG =
  'Partition already holds a different CDC propagation subscriber';

const CDC_PROPAGATION_SUBSCRIBER_REASON = Object.freeze({
  OWNER_NOT_READY: 'operational message-group ingress not ready',
});

const CDC_PROPAGATION_SUBSCRIBER_MESSAGE = Object.freeze({
  PROPAGATION: 'CDC propagation',
});

const CDC_PROPAGATION_SUBSCRIBER_READINESS = Object.freeze({
  READY: true,
  RETRY_AFTER_MS: 0,
  REASON: null,
});

const CDC_PROPAGATION_SUBSCRIBER_SELECTION = Object.freeze({
  REUSE_CAPTURED_INGRESS: true,
});

function buildPropagationSubscriberReadiness(
  ready,
  retryAfterMs = 0,
  reason = null,
) {
  return {
    ready,
    retryAfterMs,
    reason,
  };
}

function normalizePropagationSubscriberReadiness(
  readiness,
  fallbackReason = CDC_PROPAGATION_SUBSCRIBER_REASON.OWNER_NOT_READY,
) {
  if (readiness === true) {
    return buildPropagationSubscriberReadiness(
      CDC_PROPAGATION_SUBSCRIBER_READINESS.READY,
      CDC_PROPAGATION_SUBSCRIBER_READINESS.RETRY_AFTER_MS,
      CDC_PROPAGATION_SUBSCRIBER_READINESS.REASON,
    );
  }
  if (readiness === false || !readiness || typeof readiness !== 'object') {
    return buildPropagationSubscriberReadiness(
      false,
      0,
      fallbackReason,
    );
  }

  const ready = readiness.ready === true;
  return buildPropagationSubscriberReadiness(
    ready,
    Number.isFinite(readiness.retryAfterMs) && readiness.retryAfterMs > 0 ?
      Math.floor(readiness.retryAfterMs) :
      0,
    ready ?
      null :
      (typeof readiness.reason === 'string' &&
      readiness.reason.length > 0 ?
        readiness.reason :
        fallbackReason),
  );
}

function mergeDeferredReadinessSummary(summary, readiness) {
  if (!readiness || readiness.ready === true) {
    return summary;
  }
  return buildPropagationSubscriberReadiness(
    false,
    Math.max(
      summary.retryAfterMs,
      Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : 0,
    ),
    readiness.reason || summary.reason,
  );
}

function resolvePropagationServiceReadiness(
  service,
  cdcEvent,
  requiredTables,
) {
  if (!service) {
    return buildPropagationSubscriberReadiness(
      false,
      0,
      CDC_PROPAGATION_SUBSCRIBER_REASON.OWNER_NOT_READY,
    );
  }

  if (typeof service.canAcceptCDCEvent === 'function') {
    return normalizePropagationSubscriberReadiness(
      service.canAcceptCDCEvent(cdcEvent),
    );
  }

  if (typeof service.getMetadataIngressReadiness === 'function') {
    return normalizePropagationSubscriberReadiness(
      service.getMetadataIngressReadiness({requiredTables}),
    );
  }

  if (typeof service.isMetadataIngressReady === 'function') {
    return normalizePropagationSubscriberReadiness(
      service.isMetadataIngressReady({requiredTables}),
    );
  }

  return buildPropagationSubscriberReadiness(
    service.initialized !== false,
    0,
    service.initialized !== false ?
      null :
      CDC_PROPAGATION_SUBSCRIBER_REASON.OWNER_NOT_READY,
  );
}

function resolveSelectionBackedServiceReadiness(
  service,
  selection,
  cdcEvent,
  requiredTables,
) {
  if (service && typeof service.canAcceptCDCEvent === 'function') {
    return resolvePropagationServiceReadiness(service, cdcEvent, requiredTables);
  }

  if (selection?.ready === true) {
    return normalizePropagationSubscriberReadiness(selection);
  }

  return resolvePropagationServiceReadiness(service, cdcEvent, requiredTables);
}

function buildPropagationSelectionOptions(
  requiredTables,
  preferredService = null,
) {
  return {
    requiredTables,
    preferredService,
    reuseCapturedIngress:
      CDC_PROPAGATION_SUBSCRIBER_SELECTION.REUSE_CAPTURED_INGRESS,
  };
}

function buildPropagationOwnerNotReadyMessage(tableName) {
  return LOCAL_STR_OPERATIONAL_MESSAGE_GROUP_INGRESS_NOT_RE +
    `for ${tableName} ${CDC_PROPAGATION_SUBSCRIBER_MESSAGE.PROPAGATION}`;
}

// The durable subscriber contract: one vector of durable events, every
// member of this subscriber's table. Anything else is invalid, never ignored.
function assertPropagationVector(events, tableName) {
  if (!hasDurableCdcEvents(events) ||
      events.some((cdcEvent) => cdcEvent?.tableName !== tableName)) {
    throw Object.assign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
}

function logPropagationVector(logger, eventLogMessage, events, partitionId, replicaId) {
  if (logger !== null && eventLogMessage !== null) {
    logger.debug(eventLogMessage, {tableName: events[0].tableName,
      operation: events[0].operation, eventCount: events.length, partitionId, replicaId});
  }
}

function requirePropagationService(selection, cdcEvent, requiredTables, deferredError) {
  const service = selection?.service || null;
  if (!service) throw deferredError(selection);
  const readiness = resolveSelectionBackedServiceReadiness(
    service, selection, cdcEvent, requiredTables);
  if (readiness.ready !== true) throw deferredError(readiness);
  return service;
}

function resolveUnknownAnswerDeferredFields(answer) {
  const retryAfterMs = Number.isFinite(answer?.retryAfterMs) && answer.retryAfterMs > 0 ?
    Math.floor(answer.retryAfterMs) : undefined;
  const reason = answer?.reason ?
    answer.reason :
    (answer?.error === CDC_COMPLETION.BACKPRESSURE ?
      CDC_COMPLETION.BACKPRESSURE : undefined);
  return {
    ...(retryAfterMs !== undefined ? {retryAfterMs} : {}),
    ...(reason !== undefined ? {reason} : {}),
  };
}

function propagationIsProvisional(answer, events, groupId) {
  if (isCommittedCdcOutcome(answer, events, groupId)) return false;
  if (isProvisionalCdcOutcome(answer, events, groupId)) return true;
  throw Object.assign(new Error(CDC_COMPLETION.UNKNOWN), {
    code: CDC_COMPLETION.UNKNOWN, cause: answer, deferRetry: true,
    ...resolveUnknownAnswerDeferredFields(answer),
  });
}

function buildPartitionCdcPropagationSubscriber(options = {}) {
  const tableName = options.tableName || null;
  const partitionId = options.partitionId || null;
  const replicaId = options.replicaId || null;
  const logger = options.logger || null;
  const eventLogMessage = options.eventLogMessage || null;
  const preferredService = options.preferredService || null;
  const propagatePartitionCDCEvent = options.propagatePartitionCDCEvent;
  const resolveOperationalMessageGroupSelection =
    options.resolveOperationalMessageGroupSelection;
  const resolveOperationalMessageGroupSelectionAsync =
    options.resolveOperationalMessageGroupSelectionAsync;
  const buildMessageGroupOwnerNotReadyError =
    options.buildMessageGroupOwnerNotReadyError;
  const beforePropagation = options.beforePropagation || null;
  const afterPropagation = options.afterPropagation || null;
  const requiredTables = tableName ? [tableName] : [];

  const resolveDeferredSelectionError = (selection = {}) => {
    return buildMessageGroupOwnerNotReadyError(selection, {
      message: buildPropagationOwnerNotReadyMessage(tableName),
    });
  };

  const resolveSelectedServiceReadiness = (service, cdcEvent) => {
    return resolvePropagationServiceReadiness(service, cdcEvent, requiredTables);
  };

  // A hook receives what the subscriber receives: the vector, in log order,
  // once before it propagates and once after it committed. A hook that
  // decides per event walks the vector itself (it alone knows what an event's
  // predecessor is). The hooks belong to the propagation's source group: a
  // delivery addressed to a target group runs neither.
  const runPropagationHook = async (hook, events, wait) => {
    if (typeof hook === 'function') await wait(() => hook(events));
  };

  // The durable subscriber contract (partition-cdc-delivery.js): one vector
  // of this table's durable events and its delivery invocation, answered
  // with the outcome of the one recipient group the invocation addresses
  // (the propagation's source group, or one target group) over that exact
  // vector.
  const subscriber = async (events, deliveryContext) => {
    assertCdcDeliveryInvocation(deliveryContext);
    const wait = (operation) => deliveryContext.run(operation);
    assertPropagationVector(events, tableName);
    const addressesSource = deliveryContext.recipientGroupId === null;
    logPropagationVector(logger, eventLogMessage, events, partitionId, replicaId);
    if (addressesSource) await runPropagationHook(beforePropagation, events, wait);

    const selection = await wait(() => resolveOperationalMessageGroupSelectionAsync(
      buildPropagationSelectionOptions(requiredTables, preferredService)));
    const propagationMessageGroupService = requirePropagationService(
      selection, events[0], requiredTables, resolveDeferredSelectionError);

    const answer = await wait(() => propagatePartitionCDCEvent(
      propagationMessageGroupService,
      events,
      deliveryContext,
    ));

    // The source delivery owner consumes this exact answer. In particular,
    // provisional ingress cannot run completion hooks or become an ACK merely
    // because this callback returned without throwing.
    if (propagationIsProvisional(answer, events, deliveryContext.recipientGroupId === null ?
      propagationMessageGroupService.groupId : deliveryContext.recipientGroupId)) {
      return answer;
    }
    if (addressesSource) await runPropagationHook(afterPropagation, events, wait);
    return answer;
  };

  if (typeof resolveOperationalMessageGroupSelection === 'function') {
    // The source continuation consumes this selector's current object binding;
    // equal group text never makes a replacement service the old owner.
    subscriber.getCDCPropagationService = () => resolveOperationalMessageGroupSelection(
      buildPropagationSelectionOptions(requiredTables, preferredService))?.service ?? null;
  }

  subscriber.canAcceptCDCEvent = (cdcEvent = {}) => {
    if (cdcEvent?.tableName !== tableName) {
      return buildPropagationSubscriberReadiness(
        CDC_PROPAGATION_SUBSCRIBER_READINESS.READY,
        CDC_PROPAGATION_SUBSCRIBER_READINESS.RETRY_AFTER_MS,
        CDC_PROPAGATION_SUBSCRIBER_READINESS.REASON,
      );
    }

    let deferredSummary = buildPropagationSubscriberReadiness(
      false,
      0,
      CDC_PROPAGATION_SUBSCRIBER_REASON.OWNER_NOT_READY,
    );

    if (preferredService) {
      const preferredReadiness = resolveSelectedServiceReadiness(
        preferredService,
        cdcEvent,
      );
      if (preferredReadiness.ready === true) {
        return preferredReadiness;
      }
      deferredSummary = mergeDeferredReadinessSummary(
        deferredSummary,
        preferredReadiness,
      );
    }

    if (typeof resolveOperationalMessageGroupSelection !== 'function') {
      return deferredSummary;
    }

    const selection = resolveOperationalMessageGroupSelection({
      requiredTables,
    });
    const selectedService = selection?.service || null;
    if (selectedService) {
      const selectedReadiness = resolveSelectionBackedServiceReadiness(
        selectedService,
        selection,
        cdcEvent,
        requiredTables,
      );
      if (selectedReadiness.ready === true) {
        return selectedReadiness;
      }
      deferredSummary = mergeDeferredReadinessSummary(
        deferredSummary,
        selectedReadiness,
      );
    }

    return mergeDeferredReadinessSummary(deferredSummary, selection);
  };

  return subscriber;
}

/**
 * Register a partition replica's one CDC propagation subscriber. Every
 * bootstrap path (seed hydration, a dynamically created replica, a joiner's
 * replica) registers through here: one subscriber per partition replica,
 * named by the hosting path, node, table and replica, never by a message
 * group (the subscriber selects its message group per delivery). The
 * partition refuses a second, different propagation subscriber; that refusal
 * is a broken registration and throws.
 * @param {Object} partition - The partition replica's service.
 * @param {Object} options - {role, nodeId} and the subscriber's options
 *   (buildPartitionCdcPropagationSubscriber).
 * @return {Promise<Object>} The partition's handshake.
 */
async function registerPartitionCdcPropagation(partition, {role, nodeId, ...subscriberOptions}) {
  const subscriberId = [role, nodeId, subscriberOptions.tableName,
    subscriberOptions.replicaId].join(':');
  const handshake = await partition.subscribeToCDCWithHandshake(
    buildPartitionCdcPropagationSubscriber(subscriberOptions),
    {subscriberId, role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION});
  if (handshake.status === PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_PROPAGATION_HELD) {
    throw Object.assign(new Error(PARTITION_CDC_PROPAGATION_HELD_MSG), {
      code: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_PROPAGATION_HELD,
      subscriberId, holderSubscriberId: handshake.holderSubscriberId});
  }
  return handshake;
}

export {
  buildPartitionCdcPropagationSubscriber,
  registerPartitionCdcPropagation,
};
