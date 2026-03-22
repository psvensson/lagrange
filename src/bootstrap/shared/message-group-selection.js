import {NUM, TYPEOF} from '../../constants/index.js';

const MESSAGE_GROUP_SELECTION_REASON = Object.freeze({
  OWNER_NOT_READY: 'operational message-group ingress not ready',
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
    return {
      ready: true,
      retryAfterMs: NUM.ZERO,
      reason: null,
    };
  }
  if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
    return {
      ready: false,
      retryAfterMs: NUM.ZERO,
      reason: fallbackReason,
    };
  }

  return {
    ready: readiness.ready === true,
    retryAfterMs:
      Number.isFinite(readiness.retryAfterMs) && readiness.retryAfterMs > NUM.ZERO ?
        Math.floor(readiness.retryAfterMs) :
        NUM.ZERO,
    reason:
      typeof readiness.reason === TYPEOF.STRING &&
      readiness.reason.length > NUM.ZERO ?
        readiness.reason :
        fallbackReason,
  };
}

function isMessageGroupInitialized(service) {
  return service?.initialized !== false;
}

function resolveLeaderReadiness(service, requiredTables) {
  if (!service) {
    return {
      ready: false,
      retryAfterMs: NUM.ZERO,
      reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    };
  }

  if (requiredTables.length > NUM.ZERO &&
      typeof service.getMetadataIngressReadiness === TYPEOF.FUNCTION) {
    return normalizeSelectionReadiness(
      service.getMetadataIngressReadiness({requiredTables}),
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
  }

  return isMessageGroupInitialized(service) ? {
    ready: true,
    retryAfterMs: NUM.ZERO,
    reason: null,
  } : {
    ready: false,
    retryAfterMs: NUM.ZERO,
    reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
  };
}

function resolveRelayReadiness(service, requiredTables) {
  if (!service || requiredTables.length === NUM.ZERO) {
    return {
      ready: false,
      retryAfterMs: NUM.ZERO,
      reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    };
  }
  if (typeof service.getMetadataIngressReadiness !== TYPEOF.FUNCTION) {
    return {
      ready: false,
      retryAfterMs: NUM.ZERO,
      reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    };
  }
  return normalizeSelectionReadiness(
    service.getMetadataIngressReadiness({requiredTables}),
    MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
  );
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
      return {
        service,
        ready: true,
        retryAfterMs: readiness.retryAfterMs,
        reason: null,
        route: 'leader',
      };
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
      return {
        service,
        ready: true,
        retryAfterMs: readiness.retryAfterMs,
        reason: null,
        route: 'relay',
      };
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  return {
    service: null,
    ready: false,
    retryAfterMs: deferredSummary.retryAfterMs,
    reason: deferredSummary.reason,
    route: null,
  };
}

async function resolveOperationalMessageGroupSelectionAsync(
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
    const readiness =
      requiredTables.length > NUM.ZERO ?
        await resolveMetadataIngressReadinessAsync(
          service,
          requiredTables,
          MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
        ) :
        resolveLeaderReadiness(service, requiredTables);
    if (readiness.ready === true) {
      return {
        service,
        ready: true,
        retryAfterMs: readiness.retryAfterMs,
        reason: null,
        route: 'leader',
      };
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
    const readiness =
      requiredTables.length > NUM.ZERO ?
        await resolveMetadataIngressReadinessAsync(
          service,
          requiredTables,
          MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
        ) :
        resolveRelayReadiness(service, requiredTables);
    if (readiness.ready === true) {
      return {
        service,
        ready: true,
        retryAfterMs: readiness.retryAfterMs,
        reason: null,
        route: 'relay',
      };
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  return {
    service: null,
    ready: false,
    retryAfterMs: deferredSummary.retryAfterMs,
    reason: deferredSummary.reason,
    route: null,
  };
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
};
