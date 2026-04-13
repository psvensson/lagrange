import {NUM, TYPEOF} from '../../constants/index.js';

const MESSAGE_GROUP_SELECTION_REASON = Object.freeze({
  OWNER_NOT_READY: 'operational message-group ingress not ready',
});

const MESSAGE_GROUP_SELECTION_ROUTE = Object.freeze({
  LEADER: 'leader',
  PREFERRED: 'preferred',
  RELAY: 'relay',
});

function normalizeRequiredTables(requiredTables) {
  return [...new Set(
    (Array.isArray(requiredTables) ? requiredTables : [])
      .filter((tableName) =>
        typeof tableName === TYPEOF.STRING &&
        tableName.length > NUM.ZERO,
      ),
  )];
}

function listMessageGroupServices(messageGroupServices) {
  if (messageGroupServices instanceof Map) {
    return [...messageGroupServices.values()];
  }
  if (Array.isArray(messageGroupServices)) {
    return messageGroupServices.filter(Boolean);
  }
  if (messageGroupServices &&
      typeof messageGroupServices[Symbol.iterator] === TYPEOF.FUNCTION) {
    return [...messageGroupServices].filter(Boolean);
  }
  return [];
}

function normalizeSelectionReadiness(readiness, fallbackReason) {
  if (readiness === true) {
    return buildSelectionReadiness(true, NUM.ZERO, null);
  } else if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
    return buildSelectionReadiness(false, NUM.ZERO, fallbackReason);
  }

  return buildSelectionReadiness(
    readiness.ready === true,
    Number.isFinite(readiness.retryAfterMs) &&
      readiness.retryAfterMs > NUM.ZERO ?
      Math.floor(readiness.retryAfterMs) :
      NUM.ZERO,
    typeof readiness.reason === TYPEOF.STRING &&
      readiness.reason.length > NUM.ZERO ?
      readiness.reason :
      fallbackReason,
  );
}

function isMessageGroupInitialized(service) {
  return service?.initialized !== false;
}

function resolveLeaderReadiness(service, requiredTables) {
  if (!service) {
    return buildSelectionReadiness(
      false,
      NUM.ZERO,
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
  }

  if (requiredTables.length > NUM.ZERO &&
      typeof service.getMetadataIngressReadiness === TYPEOF.FUNCTION) {
    return normalizeSelectionReadiness(
      service.getMetadataIngressReadiness({requiredTables}),
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
  }

  return isMessageGroupInitialized(service) ?
    buildSelectionReadiness(true, NUM.ZERO, null) :
    buildSelectionReadiness(
      false,
      NUM.ZERO,
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
}

function resolveRelayReadiness(service, requiredTables) {
  if (!service ||
      requiredTables.length === NUM.ZERO ||
      typeof service.getMetadataIngressReadiness !== TYPEOF.FUNCTION) {
    return buildSelectionReadiness(
      false,
      NUM.ZERO,
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
  }
  return normalizeSelectionReadiness(
    service.getMetadataIngressReadiness({requiredTables}),
    MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
  );
}

function buildSelectionReadiness(ready, retryAfterMs, reason) {
  return {
    ready,
    retryAfterMs,
    reason,
  };
}

function buildOperationalMessageGroupSelection(
  service,
  ready,
  retryAfterMs,
  reason,
  route,
) {
  return {
    service,
    ready,
    retryAfterMs,
    reason,
    route,
  };
}

function resolveQueryTransportMessageGroupSelection(messageGroupServices) {
  const services = listMessageGroupServices(messageGroupServices);

  for (const service of services) {
    if (service?.isLeaderReplica?.() !== true ||
        isMessageGroupInitialized(service) !== true ||
        typeof service?.sendMessage !== TYPEOF.FUNCTION) {
      continue;
    }
    return {
      service,
      ready: true,
      retryAfterMs: NUM.ZERO,
      reason: null,
      route: MESSAGE_GROUP_SELECTION_ROUTE.LEADER,
    };
  }

  for (const service of services) {
    if (isMessageGroupInitialized(service) !== true ||
        typeof service?.sendMessage !== TYPEOF.FUNCTION) {
      continue;
    }
    return {
      service,
      ready: true,
      retryAfterMs: NUM.ZERO,
      reason: null,
      route: service?.isLeaderReplica?.() === true ?
        MESSAGE_GROUP_SELECTION_ROUTE.LEADER :
        MESSAGE_GROUP_SELECTION_ROUTE.RELAY,
    };
  }

  return {
    service: null,
    ready: false,
    retryAfterMs: NUM.ZERO,
    reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    route: null,
  };
}

async function resolveMetadataIngressReadinessAsync(
  service,
  requiredTables,
  fallbackReason,
) {
  const baseReadiness = service?.getMetadataIngressReadiness ?
    normalizeSelectionReadiness(
      service.getMetadataIngressReadiness({requiredTables}),
      fallbackReason,
    ) :
    {
      ready: false,
      retryAfterMs: NUM.ZERO,
      reason: fallbackReason,
    };
  if (baseReadiness.ready === true ||
      requiredTables.length === NUM.ZERO ||
      typeof service?.resolveMetadataIngressForwardSelection !== TYPEOF.FUNCTION) {
    return baseReadiness;
  }

  try {
    const selection =
      await service.resolveMetadataIngressForwardSelection({
        requiredTables,
      });
    if (service?.isCurrentRaftLeader?.() === true ||
        selection?.localIngress === true ||
        (Array.isArray(selection?.targets) &&
          selection.targets.length > NUM.ZERO)) {
      const retryAfterMs = Number.isFinite(
        selection?.strictForwardRetryAfterMs,
      ) ?
        selection.strictForwardRetryAfterMs :
        baseReadiness.retryAfterMs;
      return {
        ready: true,
        retryAfterMs,
        reason: null,
      };
    }
    return {
      ready: false,
      retryAfterMs: Math.max(
        baseReadiness.retryAfterMs,
        Number.isFinite(selection?.strictForwardRetryAfterMs) ?
          selection.strictForwardRetryAfterMs :
          NUM.ZERO,
      ),
      reason: baseReadiness.reason,
    };
  } catch (_error) {
    return baseReadiness;
  }
}

function recordNotReadyCandidate(summary, readiness) {
  if (readiness.ready === true) {
    return summary;
  }
  return {
    reason: readiness.reason || summary.reason,
    retryAfterMs: Math.max(
      summary.retryAfterMs,
      Number.isFinite(readiness.retryAfterMs) ?
        readiness.retryAfterMs :
        NUM.ZERO,
    ),
  };
}

function resolveOperationalMessageGroupSelection(
  messageGroupServices,
  options = {},
) {
  const services = listMessageGroupServices(messageGroupServices);
  const requiredTables = normalizeRequiredTables(options.requiredTables);
  let deferredSummary = {
    reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    retryAfterMs: NUM.ZERO,
  };

  for (const service of services) {
    if (service?.isLeaderReplica?.() !== true) {
      continue;
    }
    const readiness = resolveLeaderReadiness(service, requiredTables);
    if (readiness.ready === true) {
      return buildOperationalMessageGroupSelection(
        service,
        true,
        readiness.retryAfterMs,
        null,
        MESSAGE_GROUP_SELECTION_ROUTE.LEADER,
      );
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  for (const service of services) {
    if (service?.isLeaderReplica?.() === true) {
      continue;
    }
    const readiness = resolveRelayReadiness(service, requiredTables);
    if (readiness.ready === true) {
      return buildOperationalMessageGroupSelection(
        service,
        true,
        readiness.retryAfterMs,
        null,
        MESSAGE_GROUP_SELECTION_ROUTE.RELAY,
      );
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  return buildOperationalMessageGroupSelection(
    null,
    false,
    deferredSummary.retryAfterMs,
    deferredSummary.reason,
    null,
  );
}

async function resolveOperationalMessageGroupSelectionAsync(
  messageGroupServices,
  options = {},
) {
  const services = listMessageGroupServices(messageGroupServices);
  const requiredTables = normalizeRequiredTables(options.requiredTables);
  const preferredService = options.preferredService || null;
  let deferredSummary = {
    reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    retryAfterMs: NUM.ZERO,
  };

  for (const service of services) {
    if (service?.isLeaderReplica?.() !== true) {
      continue;
    }
    const readiness =
      requiredTables.length > NUM.ZERO ?
        await resolveMetadataIngressReadinessAsync(
          service,
          requiredTables,
          MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
        ) :
        resolveLeaderReadiness(service, requiredTables);
    if (readiness.ready === true) {
      return buildOperationalMessageGroupSelection(
        service,
        true,
        readiness.retryAfterMs,
        null,
        MESSAGE_GROUP_SELECTION_ROUTE.LEADER,
      );
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  if (preferredService) {
    const readiness =
      requiredTables.length > NUM.ZERO ?
        await resolveMetadataIngressReadinessAsync(
          preferredService,
          requiredTables,
          MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
        ) :
        (preferredService?.isLeaderReplica?.() === true ?
          resolveLeaderReadiness(preferredService, requiredTables) :
          resolveRelayReadiness(preferredService, requiredTables));
    if (readiness.ready === true) {
      return buildOperationalMessageGroupSelection(
        preferredService,
        true,
        readiness.retryAfterMs,
        null,
        MESSAGE_GROUP_SELECTION_ROUTE.PREFERRED,
      );
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  for (const service of services) {
    if (service?.isLeaderReplica?.() === true) {
      continue;
    }
    if (preferredService && service === preferredService) {
      continue;
    }
    const readiness =
      requiredTables.length > NUM.ZERO ?
        await resolveMetadataIngressReadinessAsync(
          service,
          requiredTables,
          MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
        ) :
        resolveRelayReadiness(service, requiredTables);
    if (readiness.ready === true) {
      return buildOperationalMessageGroupSelection(
        service,
        true,
        readiness.retryAfterMs,
        null,
        MESSAGE_GROUP_SELECTION_ROUTE.RELAY,
      );
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  return buildOperationalMessageGroupSelection(
    null,
    false,
    deferredSummary.retryAfterMs,
    deferredSummary.reason,
    null,
  );
}

function getBootstrapMessageGroupService(messageGroupServices) {
  const services = listMessageGroupServices(messageGroupServices);
  for (const service of services) {
    if (service?.isLeaderReplica?.() === true) {
      return service;
    }
  }
  return services[NUM.ZERO] || null;
}

function buildMessageGroupOwnerNotReadyError(
  selection = {},
  options = {},
) {
  const message =
    typeof options.message === TYPEOF.STRING &&
      options.message.length > NUM.ZERO ?
      options.message :
      selection?.reason ||
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY;
  const error = new Error(message);
  error.ownerNotReady = true;
  error.deferRetry = true;

  const retryAfterMs = Number.isFinite(selection?.retryAfterMs) &&
    selection.retryAfterMs > NUM.ZERO ?
    Math.floor(selection.retryAfterMs) :
    NUM.ZERO;
  if (retryAfterMs > NUM.ZERO) {
    error.retryAfterMs = retryAfterMs;
  }

  return error;
}

export {
  buildMessageGroupOwnerNotReadyError,
  getBootstrapMessageGroupService,
  resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync,
  resolveQueryTransportMessageGroupSelection,
};
