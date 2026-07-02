
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

  const subscriber = async (cdcEvent = {}) => {
    if (cdcEvent?.tableName !== tableName) {
      return;
    }

    if (logger && typeof logger.debug === 'function' && eventLogMessage) {
      logger.debug(eventLogMessage, {
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        partitionId,
        replicaId,
      });
    }

    if (typeof beforePropagation === 'function') {
      await beforePropagation(cdcEvent);
    }

    const selection = await resolveOperationalMessageGroupSelectionAsync(
      buildPropagationSelectionOptions(requiredTables, preferredService),
    );
    const propagationMessageGroupService = selection?.service || null;
    if (!propagationMessageGroupService) {
      throw resolveDeferredSelectionError(selection);
    }

    const readiness = resolveSelectionBackedServiceReadiness(
      propagationMessageGroupService,
      selection,
      cdcEvent,
      requiredTables,
    );
    if (readiness.ready !== true) {
      throw resolveDeferredSelectionError(readiness);
    }

    await propagatePartitionCDCEvent(
      propagationMessageGroupService,
      cdcEvent,
    );

    if (typeof afterPropagation === 'function') {
      await afterPropagation(cdcEvent);
    }
  };

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
