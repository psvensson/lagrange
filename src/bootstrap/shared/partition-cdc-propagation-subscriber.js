import {CDC_COMPLETION, hasDurableCdcEvents, isAlreadyAppliedCdcOutcome,
  isCommittedCdcOutcome, isProvisionalCdcOutcome} from
  '../../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation} from '../../cdc/cdc-delivery-invocation.js';
import {copyCdcEvent} from '../../cdc/cdc-event-envelope.js';
import {PARTITION_SERVICE_CDC, PARTITION_SERVICE_EVENT} from
  '../../partition/partition-service-constants.js';
import {MESSAGE_GROUP_SERVICE_LITERAL} from
  '../../message-group/message-group-service-runtime-support.js';
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
  // The recipient's typed reasons survive this hop: its backpressure, and
  // its position gap (CDC Stage 3: it re-lists; the lane retries on the hint).
  const reason = answer?.reason ?
    answer.reason :
    (answer?.error === CDC_COMPLETION.BACKPRESSURE ||
      answer?.error === CDC_COMPLETION.POSITION_GAP ? answer.error : undefined);
  return {
    ...(retryAfterMs !== undefined ? {retryAfterMs} : {}),
    ...(reason !== undefined ? {reason} : {}),
  };
}

function propagationIsProvisional(answer, events, groupId) {
  if (isCommittedCdcOutcome(answer, events, groupId) ||
      isAlreadyAppliedCdcOutcome(answer, events, groupId)) return false;
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

/**
 * The one propagation call of every hosting path (seed, dynamic replica,
 * joiner): one vector to the latency topology's CDC group propagation owner,
 * from the selected source message group, under the delivery invocation.
 * @param {Object|null} latencyTopology - The node's topology owners.
 * @param {string} missingMessage - The hosting path's missing-topology error.
 * @param {Object} messageGroupService - The selected source message group.
 * @param {Array<Object>} events - The durable vector.
 * @param {Object} deliveryContext - The delivery invocation.
 * @return {Promise<Object>} The propagation outcome.
 */
async function propagatePartitionCdcVector(latencyTopology, missingMessage, messageGroupService,
  events, deliveryContext) {
  if (!latencyTopology) throw new Error(missingMessage);
  return latencyTopology.cdcGroupPropagationService.propagateCDCEvent({
    events: events.map(copyCdcEvent), sourceMessageGroupService: messageGroupService,
    deliveryContext});
}

// What a deferred attachment awaits: the node's operational message group.
// Any of its message-group services initializing or electing a leader is the
// event that can clear it.
const OPERATIONAL_MESSAGE_GROUP_READY_EVENTS = Object.freeze([
  MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZED, MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED]);
const CDC_PROPAGATION_ATTACHMENT_LOG_MSG = Object.freeze({
  AWAITING: 'CDC propagation attachment awaits the operational message group',
  ATTACHED: 'CDC propagation attachment registered after awaiting',
});

function messageGroupServicesOf(provider) {
  const services = typeof provider === 'function' ? provider() : null;
  return services instanceof Map ? [...services.values()] : [...(services ?? [])];
}

/**
 * Attach a partition replica's propagation subscriber: select the node's
 * operational message group (the replica's own preferred), subscribe it to
 * the table, and register the one subscriber (registerPartitionCdcPropagation).
 * With `defer`, a failed attempt is the named state AWAITING the operational
 * message group, held on the partition (cdcDelivery.awaitPropagationAttachment)
 * and attempted again on the events that can clear it: one of the node's
 * message-group services initializing or electing a leader, and the
 * partition's lane finding owed rows with no subscriber. Without `defer`, the
 * failure is the caller's.
 * @param {Object} partition - The partition replica's service.
 * @param {Object} options - {tableName, preferredService, defer,
 *   messageGroupServices (provider), logger, logContext,
 *   resolveOperationalMessageGroupSelectionAsync, buildMessageGroupOwnerNotReadyError,
 *   notReadyMessage, registration (registerPartitionCdcPropagation's options
 *   without preferredService), onRegistered(handshake)}.
 * @return {Promise<Object|null>} The handshake; null when deferred.
 */
async function attachPartitionCdcPropagation(partition, options) {
  const {tableName, registration} = options;
  const attempt = async () => {
    const selection = await options.resolveOperationalMessageGroupSelectionAsync({
      requiredTables: [tableName], preferredService: options.preferredService,
      reuseCapturedIngress: true});
    const service = selection.service;
    if (!service) {
      throw options.buildMessageGroupOwnerNotReadyError(selection,
        {message: options.notReadyMessage});
    }
    await service.subscribeToCDC(tableName);
    const handshake = await registerPartitionCdcPropagation(partition,
      {...registration, tableName, preferredService: service});
    options.onRegistered?.(handshake);
    return handshake;
  };
  if (options.defer !== true) return attempt();
  // Deferred: the caller does not wait for it (it never rejects).
  deferredPropagationAttachment(partition, attempt, options)();
  return null;
}

function deferredPropagationAttachment(partition, attempt, options) {
  const listeners = [];
  let inFlight = null;
  const disarm = () => {
    for (const [service, event, listener] of listeners.splice(0)) {
      service.removeListener?.(event, listener);
    }
  };
  const retry = () => {
    if (inFlight !== null) return inFlight;
    inFlight = attempt().then((handshake) => {
      disarm();
      partition.cdcDelivery?.awaitPropagationAttachment(null);
      options.logger?.info?.(CDC_PROPAGATION_ATTACHMENT_LOG_MSG.ATTACHED, options.logContext);
      return handshake;
    }, (error) => {
      options.logger?.warn?.(CDC_PROPAGATION_ATTACHMENT_LOG_MSG.AWAITING,
        {...options.logContext, error: error?.message || String(error)});
      arm();
      return null;
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  // One listener per service and event, until the attachment registers.
  function arm() {
    for (const service of messageGroupServicesOf(options.messageGroupServices)) {
      if (typeof service?.once !== 'function') continue;
      for (const event of OPERATIONAL_MESSAGE_GROUP_READY_EVENTS) {
        if (listeners.some(([armed, armedEvent]) => armed === service && armedEvent === event)) {
          continue;
        }
        const listener = () => {
          const index = listeners.findIndex((entry) => entry[2] === listener);
          if (index >= 0) listeners.splice(index, 1);
          retry();
        };
        service.once(event, listener);
        listeners.push([service, event, listener]);
      }
    }
  }
  partition.cdcDelivery?.awaitPropagationAttachment(retry);
  // The awaited attachment belongs to this replica's lifetime: its shutdown
  // retires it (no listener outlives the replica).
  partition.once?.(PARTITION_SERVICE_EVENT.SHUTDOWN, () => {
    disarm();
    partition.cdcDelivery?.awaitPropagationAttachment(null);
  });
  return retry;
}

export {
  attachPartitionCdcPropagation,
  propagatePartitionCdcVector,
  buildPartitionCdcPropagationSubscriber,
  registerPartitionCdcPropagation,
};
