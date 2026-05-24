async function handleLatencyCdcPropagationMessage(
  service,
  runtimeDeps,
  messageId,
  payload,
) {
  const {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    NUM,
    buildLatencyCdcPropagationResult,
    normalizeCauseId,
  } = runtimeDeps;
  const tableName = payload.tableName;
  const operation = payload.operation;
  const data = payload.data;
  const eventTimestamp =
    typeof payload.timestamp === 'string' &&
    payload.timestamp.length > NUM.ZERO ?
      payload.timestamp :
      null;
  const causeId = normalizeCauseId(payload.causeId);
  const replayOnly = payload?.replayOnly === true;
  const relayDepth =
    Number.isInteger(payload.relayDepth) && payload.relayDepth >= NUM.ZERO ?
      payload.relayDepth :
      NUM.ZERO;
  if (!tableName || !operation || !data) {
    throw new Error(
      MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_PAYLOAD,
    );
  }
  // Followers relay toward the current leader without applying locally.
  // Allow one additional bounded hop so stale first-hop routing can
  // converge during elections without creating open-ended loops.
  if (!service.isCurrentRaftLeader()) {
    if (
      service.shouldUseStrictCDCForwarding({
        tableName,
        operation,
      })
    ) {
      const ingressDecision = service.resolveCdcIngressDecision({
        tableName,
        operation,
        relayDepth,
      });
      if (
        ingressDecision.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER
      ) {
        return buildLatencyCdcPropagationResult({
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
          acknowledged: true,
          success: false,
          error:
            ingressDecision.reason ||
            MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
          deferRetry: true,
          retryAfterMs: Number.isFinite(
            ingressDecision.strictForwardRetryAfterMs,
          ) ?
            ingressDecision.strictForwardRetryAfterMs :
            service.resolveStrictCdcForwardRetryAfterMs(),
          tableName,
          operation,
        });
      }
      if (
        ingressDecision.action ===
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL
      ) {
        const applyOptions = {
          skipSubscriptionCheck: true,
          relayDepth,
        };
        if (eventTimestamp) {
          applyOptions.timestamp = eventTimestamp;
        }
        if (causeId) {
          applyOptions.causeId = causeId;
        }
        if (replayOnly) {
          applyOptions.replayOnly = true;
        }
        await service.applyCDCEvent(tableName, operation, data, applyOptions);
        return buildLatencyCdcPropagationResult({
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
          acknowledged: true,
          tableName,
          operation,
        });
      }
    }
    if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
      throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
    }
    await service.forwardCDCEventToLeader(tableName, operation, data, {
      timestamp: eventTimestamp || undefined,
      relayDepth: relayDepth + NUM.ONE,
      causeId,
      replayOnly,
    });
    return buildLatencyCdcPropagationResult({
      messageId,
      status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
      acknowledged: true,
      tableName,
      operation,
    });
  }
  const applyOptions = {skipSubscriptionCheck: true};
  if (eventTimestamp) {
    applyOptions.timestamp = eventTimestamp;
  }
  if (causeId) {
    applyOptions.causeId = causeId;
  }
  await service.applyCDCEvent(tableName, operation, data, applyOptions);
  return buildLatencyCdcPropagationResult({
    messageId,
    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
    acknowledged: true,
    tableName,
    operation,
  });
}

async function handleLatencyCdcPropagationBatchMessage(
  service,
  runtimeDeps,
  messageId,
  payload,
) {
  const {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    NUM,
    buildLatencyCdcPropagationResult,
  } = runtimeDeps;
  const events = Array.isArray(payload.events) ? payload.events : [];
  const replayOnly = payload?.replayOnly === true;
  const relayDepth =
    Number.isInteger(payload.relayDepth) && payload.relayDepth >= NUM.ZERO ?
      payload.relayDepth :
      NUM.ZERO;
  if (
    events.length === NUM.ZERO ||
    events.some(
      (event) => !event?.tableName || !event?.operation || !event?.data,
    )
  ) {
    throw new Error(
      MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_BATCH_PAYLOAD,
    );
  }
  if (!service.isCurrentRaftLeader()) {
    const strictEvent = events.find((event) => {
      return service.shouldUseStrictCDCForwarding({
        tableName: event?.tableName || null,
        operation: event?.operation || null,
      });
    });
    if (strictEvent) {
      const ingressDecision = service.resolveCdcIngressDecision({
        tableName: strictEvent.tableName,
        operation: strictEvent.operation,
        relayDepth,
      });
      if (
        ingressDecision.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER
      ) {
        return buildLatencyCdcPropagationResult({
          messageId,
          status:
            MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
          acknowledged: true,
          success: false,
          error:
            ingressDecision.reason ||
            MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
          deferRetry: true,
          retryAfterMs: Number.isFinite(
            ingressDecision.strictForwardRetryAfterMs,
          ) ?
            ingressDecision.strictForwardRetryAfterMs :
            service.resolveStrictCdcForwardRetryAfterMs(),
          eventCount: events.length,
        });
      }
      if (
        ingressDecision.action ===
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL
      ) {
        await service.applyCDCBatch(events, {
          skipSubscriptionCheck: true,
          replayOnly,
          relayDepth,
        });
        return buildLatencyCdcPropagationResult({
          messageId,
          status:
            MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
          acknowledged: true,
          eventCount: events.length,
        });
      }
    }
    if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
      throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
    }
    await service.forwardCDCBatchToLeader(events, {
      relayDepth: relayDepth + NUM.ONE,
      replayOnly,
    });
    return buildLatencyCdcPropagationResult({
      messageId,
      status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
      acknowledged: true,
      eventCount: events.length,
    });
  }
  await service.applyCDCBatch(events, {skipSubscriptionCheck: true});
  return {
    messageId,
    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
    acknowledged: true,
    eventCount: events.length,
  };
}

async function applyCDCEvent(service, tableName, operation, data, options = {}) {
  return service.applyCDCBatch(
    [
      {
        tableName,
        operation,
        data,
        ...options,
      },
    ],
    options,
  );
}

function normalizeCDCBatchEvents(service, runtimeDeps, events, options = {}) {
  const {NUM, normalizeCauseId} = runtimeDeps;
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.tableName && event?.operation && event?.data)
    .map((event) => {
      const timestamp =
        typeof event.timestamp === 'string' &&
        event.timestamp.length > NUM.ZERO ?
          event.timestamp :
          typeof options.timestamp === 'string' &&
              options.timestamp.length > NUM.ZERO ?
            options.timestamp :
            service.hlcClock.now().toString();
      const causeId = normalizeCauseId(event.causeId ?? options.causeId);
      return {
        tableName: event.tableName,
        operation: event.operation,
        data: event.data,
        timestamp,
        causeId,
        replayOnly:
          event.replayOnly === true || options.replayOnly === true,
      };
    });
}

function emitCDCAppliedEvents(service, runtimeDeps, events, logIndex = null) {
  const {MESSAGE_GROUP_SERVICE_LITERAL, normalizeCauseId} = runtimeDeps;
  for (const event of events) {
    service.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, {
      tableName: event.tableName,
      operation: event.operation,
      data: event.data,
      logIndex,
      causeId: normalizeCauseId(event.causeId),
    });
  }
}

export {
  applyCDCEvent,
  emitCDCAppliedEvents,
  handleLatencyCdcPropagationBatchMessage,
  handleLatencyCdcPropagationMessage,
  normalizeCDCBatchEvents,
};
