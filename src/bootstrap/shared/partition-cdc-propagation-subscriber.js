import {CDC_COMPLETION, hasDurableCdcEvents,
  isCommittedCdcOutcome, isProvisionalCdcOutcome} from
  '../../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation} from '../../cdc/cdc-delivery-invocation.js';
const LOCAL_STR_OPERATIONAL_MESSAGE_GROUP_INGRESS_NOT_RE = 'Operational message-group ingress not ready ';

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

// The table guard, for every member of the vector: a vector of this
// subscriber's table is propagated; an ordinary vector of another table is not
// this subscriber's; a durable event of another table, or a vector that mixes
// tables, breaks the one-table contract and is refused.
function acceptsPropagationTable(events, tableName) {
  const foreign = events.filter((cdcEvent) => cdcEvent?.tableName !== tableName).length;
  if (foreign === 0) return true;
  if (foreign !== events.length || hasDurableCdcEvents(events)) {
    throw Object.assign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  return false;
}

function logPropagationEvent(logger, eventLogMessage, cdcEvent, partitionId, replicaId) {
  if (logger && typeof logger.debug === 'function' && eventLogMessage) {
    logger.debug(eventLogMessage, {tableName: cdcEvent.tableName,
      operation: cdcEvent.operation, partitionId, replicaId});
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
  if (!hasDurableCdcEvents(events) ||
      isCommittedCdcOutcome(answer, events, groupId)) return false;
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

  // The one subscriber contract: (events, deliveryContext), events a dense,
  // ordered vector of one table and one partition, propagated as one wave.
  // The hooks take the vector: beforePropagation walks its members, and
  // afterPropagation runs once for the committed vector. Readiness is asked
  // with the first member.
  const subscriber = async (events, deliveryContext = null) => {
    if (deliveryContext !== null) assertCdcDeliveryInvocation(deliveryContext);
    const wait = (operation) => deliveryContext === null ? operation() :
      deliveryContext.run(operation);
    if (!acceptsPropagationTable(events, tableName)) return;
    for (const cdcEvent of events) {
      logPropagationEvent(logger, eventLogMessage, cdcEvent, partitionId, replicaId);
    }

    if (typeof beforePropagation === 'function') {
      await wait(() => beforePropagation(events));
    }

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
    if (propagationIsProvisional(answer, events, propagationMessageGroupService.groupId)) {
      return answer;
    }
    if (typeof afterPropagation === 'function') {
      await wait(() => afterPropagation(events));
    }
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

export {
  buildPartitionCdcPropagationSubscriber,
};
