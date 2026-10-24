import {copyCdcEventMetadata} from '../cdc/cdc-event-envelope.js';
import {CDC_DELIVERY_REMAINING_MS, createCdcDeliveryBudget} from '../cdc/cdc-delivery-budget.js';
import {captureCdcForwardOptions, captureCdcForwardRequest} from
  './message-group-forwarding-owner-native-delivery-methods.js';
import {appendOwnArrayValue, copyArrayByIndex} from '../utils/canonical-json-data.js';

const arrayIsArray = Array.isArray;

async function handleDurableLatencyCdcMessage(service, runtimeDeps, messageId, request,
  batch, localDelivery, startedAtMs) {
  // This receiver owns a distinct clock domain. Capture the wire duration at
  // handler entry, before any application await. Only the shallow wrapper
  // copy, its durable classification and forward context precede the owner's
  // queue reservation; capture, ingress decision and delivery are all its own.
  const {payload, incoming, context} = request;
  const budget = createCdcDeliveryBudget(service,
    {...localDelivery, receivedRemainingMs: payload[CDC_DELIVERY_REMAINING_MS]}, startedAtMs);
  const answer = await service.applyCDCBatch(incoming, {...context, ...budget,
    skipSubscriptionCheck: true, replayOnly: payload.replayOnly === true});
  budget.assertCurrent();
  // Optional wrapper metadata comes from the shallow wrapper copy and its
  // dense, already classified member count; it never overrides the answer.
  return runtimeDeps.buildLatencyCdcPropagationResult({messageId, acknowledged: true,
    status: batch ? runtimeDeps.MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED :
      runtimeDeps.MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
    ...(batch ? {eventCount: incoming.length} :
      {tableName: payload.tableName, operation: payload.operation}),
    ...answer,
  });
}

async function handleLatencyCdcPropagationMessage(
  service,
  runtimeDeps,
  messageId,
  payload,
  localDelivery,
) {
  const startedAtMs = service.timeSource.now();
  const request = captureCdcForwardRequest(service, payload, false);
  payload = request.payload;
  if (request.durable) {
    return handleDurableLatencyCdcMessage(
      service, runtimeDeps, messageId, request, false, localDelivery, startedAtMs);
  }
  const {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    buildLatencyCdcPropagationResult,
    normalizeCauseId,
  } = runtimeDeps;
  const tableName = payload.tableName;
  const operation = payload.operation;
  const data = payload.data;
  const eventTimestamp =
    typeof payload.timestamp === 'string' &&
    payload.timestamp.length > 0 ?
      payload.timestamp :
      null;
  const causeId = normalizeCauseId(payload.causeId);
  const replayOnly = payload?.replayOnly === true;
  const relayDepth =
    Number.isInteger(payload.relayDepth) && payload.relayDepth >= 0 ?
      payload.relayDepth :
      0;
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
          ...copyCdcEventMetadata(payload),
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
        const answer = await service.applyCDCEvent(tableName, operation, data, applyOptions);
        return buildLatencyCdcPropagationResult({
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
          acknowledged: true,
          tableName,
          operation,
          ...answer,
        });
      }
    }
    if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
      throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
    }
    const answer = await service.forwardCDCEventToLeader(tableName, operation, data, {
      ...copyCdcEventMetadata(payload),
      timestamp: eventTimestamp || undefined,
      relayDepth,
      causeId,
      replayOnly,
    });
    return buildLatencyCdcPropagationResult({
      messageId,
      status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
      acknowledged: true,
      tableName,
      operation,
      ...answer,
    });
  }
  const applyOptions = {...copyCdcEventMetadata(payload), skipSubscriptionCheck: true};
  if (eventTimestamp) {
    applyOptions.timestamp = eventTimestamp;
  }
  if (causeId) {
    applyOptions.causeId = causeId;
  }
  const answer = await service.applyCDCEvent(tableName, operation, data, applyOptions);
  return buildLatencyCdcPropagationResult({
    messageId,
    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
    acknowledged: true,
    tableName,
    operation,
    ...answer,
  });
}

async function handleLatencyCdcPropagationBatchMessage(
  service,
  runtimeDeps,
  messageId,
  payload,
  localDelivery,
) {
  const startedAtMs = service.timeSource.now();
  const request = captureCdcForwardRequest(service, payload, true);
  payload = request.payload;
  if (request.durable) {
    return handleDurableLatencyCdcMessage(service, runtimeDeps, messageId, request,
      true, localDelivery, startedAtMs);
  }
  const {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    buildLatencyCdcPropagationResult,
  } = runtimeDeps;
  const events = Array.isArray(payload.events) ? payload.events : [];
  const replayOnly = payload?.replayOnly === true;
  const relayDepth =
    Number.isInteger(payload.relayDepth) && payload.relayDepth >= 0 ?
      payload.relayDepth :
      0;
  if (
    events.length === 0 ||
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
        const answer = await service.applyCDCBatch(events, {
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
          ...answer,
        });
      }
    }
    if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
      throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
    }
    const answer = await service.forwardCDCBatchToLeader(events, {
      relayDepth,
      replayOnly,
    });
    return buildLatencyCdcPropagationResult({
      messageId,
      status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
      acknowledged: true,
      eventCount: events.length,
      ...answer,
    });
  }
  const answer = await service.applyCDCBatch(events, {skipSubscriptionCheck: true});
  return buildLatencyCdcPropagationResult({
    messageId,
    status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
    acknowledged: true,
    eventCount: events.length,
    ...answer,
  });
}

async function applyCDCEvent(service, tableName, operation, data, options = {}) {
  options = captureCdcForwardOptions(service, options);
  return service.applyCDCBatch(
    [
      {
        tableName,
        operation,
        data,
        ...copyCdcEventMetadata(options),
      },
    ],
    options,
  );
}

function normalizeCDCBatchEvents(service, runtimeDeps, events, options = {}) {
  const {normalizeCauseId} = runtimeDeps;
  const source = arrayIsArray(events) ? events : [];
  const length = source.length;
  const filteredEvents = [];
  // Preserve the owner's filter-then-map order without invoking caller array
  // methods, an iterator or a replaced constructor/species hook.
  for (let index = 0; index < length; index += 1) {
    if (!(index in source)) continue;
    const event = source[index];
    if (event?.tableName && event?.operation && event?.data) {
      appendOwnArrayValue(filteredEvents, event);
    }
  }
  return copyArrayByIndex(filteredEvents, (event) => {
    const timestamp =
      typeof event.timestamp === 'string' &&
      event.timestamp.length > 0 ?
        event.timestamp :
        typeof options.timestamp === 'string' &&
            options.timestamp.length > 0 ?
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
