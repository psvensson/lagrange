
const MESSAGE_GROUP_SELECTION_REASON = Object.freeze({
  OWNER_NOT_READY: 'operational message-group ingress not ready',
});

const MESSAGE_GROUP_SELECTION_ROUTE = Object.freeze({
  LEADER: 'leader',
  PREFERRED: 'preferred',
  RELAY: 'relay',
});

const MESSAGE_GROUP_SELECTION_STATE = Object.freeze({
  DEFER_OWNER_NOT_READY: 'defer_owner_not_ready',
  LEADER_READY: 'leader_ready',
  PREFERRED_CAPTURED: 'preferred_captured',
  PREFERRED_READY: 'preferred_ready',
  RELAY_READY: 'relay_ready',
});

function normalizeRequiredTables(requiredTables) {
  return [...new Set(
    (Array.isArray(requiredTables) ? requiredTables : [])
      .filter((tableName) =>
        typeof tableName === 'string' &&
        tableName.length > 0,
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
      typeof messageGroupServices[Symbol.iterator] === 'function') {
    return [...messageGroupServices].filter(Boolean);
  }
  return [];
}

function normalizeSelectionReadiness(readiness, fallbackReason) {
  if (readiness === true) {
    return buildSelectionReadiness(true, 0, null);
  } else if (!readiness || typeof readiness !== 'object') {
    return buildSelectionReadiness(false, 0, fallbackReason);
  }

  return buildSelectionReadiness(
    readiness.ready === true,
    Number.isFinite(readiness.retryAfterMs) &&
      readiness.retryAfterMs > 0 ?
      Math.floor(readiness.retryAfterMs) :
      0,
    typeof readiness.reason === 'string' &&
      readiness.reason.length > 0 ?
      readiness.reason :
      fallbackReason,
  );
}

function isMessageGroupInitialized(service) {
  return service?.initialized !== false;
}

function canReuseCapturedIngressOwner(service) {
  return isMessageGroupInitialized(service) === true &&
    (
      typeof service?.subscribeToCDC === 'function' ||
      typeof service?.sendMessage === 'function'
    );
}

function resolveLeaderReadiness(service, requiredTables) {
  if (!service) {
    return buildSelectionReadiness(
      false,
      0,
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
  }

  if (requiredTables.length > 0 &&
      typeof service.getMetadataIngressReadiness === 'function') {
    return normalizeSelectionReadiness(
      service.getMetadataIngressReadiness({requiredTables}),
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
  }

  return isMessageGroupInitialized(service) ?
    buildSelectionReadiness(true, 0, null) :
    buildSelectionReadiness(
      false,
      0,
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    );
}

function resolveRelayReadiness(service, requiredTables) {
  if (!service ||
      requiredTables.length === 0 ||
      typeof service.getMetadataIngressReadiness !== 'function') {
    return buildSelectionReadiness(
      false,
      0,
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
  state,
) {
  const selection = {
    service,
    ready,
    retryAfterMs,
    reason,
    route,
  };
  if (typeof state === 'string' && state.length > 0) {
    selection.state = state;
  }
  return selection;
}

function resolveQueryTransportMessageGroupSelection(messageGroupServices) {
  const services = listMessageGroupServices(messageGroupServices);

  for (const service of services) {
    if (service?.isLeaderReplica?.() !== true ||
        isMessageGroupInitialized(service) !== true ||
        typeof service?.sendMessage !== 'function') {
      continue;
    }
    return {
      service,
      ready: true,
      retryAfterMs: 0,
      reason: null,
      route: MESSAGE_GROUP_SELECTION_ROUTE.LEADER,
      state: MESSAGE_GROUP_SELECTION_STATE.LEADER_READY,
    };
  }

  for (const service of services) {
    if (isMessageGroupInitialized(service) !== true ||
        typeof service?.sendMessage !== 'function') {
      continue;
    }
    return {
      service,
      ready: true,
      retryAfterMs: 0,
      reason: null,
      route: service?.isLeaderReplica?.() === true ?
        MESSAGE_GROUP_SELECTION_ROUTE.LEADER :
        MESSAGE_GROUP_SELECTION_ROUTE.RELAY,
      state: service?.isLeaderReplica?.() === true ?
        MESSAGE_GROUP_SELECTION_STATE.LEADER_READY :
        MESSAGE_GROUP_SELECTION_STATE.RELAY_READY,
    };
  }

  return {
    service: null,
    ready: false,
    retryAfterMs: 0,
    reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    route: null,
    state: MESSAGE_GROUP_SELECTION_STATE.DEFER_OWNER_NOT_READY,
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
      retryAfterMs: 0,
      reason: fallbackReason,
    };
  if (baseReadiness.ready === true ||
      requiredTables.length === 0 ||
      typeof service?.resolveMetadataIngressForwardSelection !== 'function') {
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
          selection.targets.length > 0)) {
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
          0,
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
        0,
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
    retryAfterMs: 0,
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
        MESSAGE_GROUP_SELECTION_STATE.LEADER_READY,
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
        MESSAGE_GROUP_SELECTION_STATE.RELAY_READY,
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
    MESSAGE_GROUP_SELECTION_STATE.DEFER_OWNER_NOT_READY,
  );
}

async function resolveOperationalMessageGroupSelectionAsync(
  messageGroupServices,
  options = {},
) {
  const services = listMessageGroupServices(messageGroupServices);
  const requiredTables = normalizeRequiredTables(options.requiredTables);
  const preferredService = options.preferredService || null;
  const reuseCapturedIngress = options.reuseCapturedIngress === true;
  let deferredSummary = {
    reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
    retryAfterMs: 0,
  };

  for (const service of services) {
    if (service?.isLeaderReplica?.() !== true) {
      continue;
    }
    const readiness =
      requiredTables.length > 0 ?
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
        MESSAGE_GROUP_SELECTION_STATE.LEADER_READY,
      );
    }
    deferredSummary = recordNotReadyCandidate(
      deferredSummary,
      readiness,
    );
  }

  if (preferredService) {
    if (reuseCapturedIngress === true &&
        canReuseCapturedIngressOwner(preferredService) === true) {
      return buildOperationalMessageGroupSelection(
        preferredService,
        true,
        0,
        null,
        MESSAGE_GROUP_SELECTION_ROUTE.PREFERRED,
        MESSAGE_GROUP_SELECTION_STATE.PREFERRED_CAPTURED,
      );
    }
    const readiness =
      requiredTables.length > 0 ?
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
        MESSAGE_GROUP_SELECTION_STATE.PREFERRED_READY,
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
      requiredTables.length > 0 ?
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
        MESSAGE_GROUP_SELECTION_STATE.RELAY_READY,
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
    MESSAGE_GROUP_SELECTION_STATE.DEFER_OWNER_NOT_READY,
  );
}

function getBootstrapMessageGroupService(messageGroupServices) {
  const services = listMessageGroupServices(messageGroupServices);
  for (const service of services) {
    if (service?.isLeaderReplica?.() === true) {
      return service;
    }
  }
  return services[0] || null;
}

function buildMessageGroupOwnerNotReadyError(
  selection = {},
  options = {},
) {
  const message =
    typeof options.message === 'string' &&
      options.message.length > 0 ?
      options.message :
      selection?.reason ||
      MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY;
  const error = new Error(message);
  error.ownerNotReady = true;
  error.deferRetry = true;

  const retryAfterMs = Number.isFinite(selection?.retryAfterMs) &&
    selection.retryAfterMs > 0 ?
    Math.floor(selection.retryAfterMs) :
    0;
  if (retryAfterMs > 0) {
    error.retryAfterMs = retryAfterMs;
  }

  return error;
}

export {
  buildMessageGroupOwnerNotReadyError,
  getBootstrapMessageGroupService,
  MESSAGE_GROUP_SELECTION_STATE,
  resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync,
  resolveQueryTransportMessageGroupSelection,
};
