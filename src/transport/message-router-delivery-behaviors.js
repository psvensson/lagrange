import {assertDeliveryOpen, remainingDeliveryMs, withDeliveryLifetime}
  from './message-router-delivery-lifetime.js';
export {sendMessage} from './message-router-ack-delivery.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {
  buildHandlerFailedError,
  buildTransportDeliveryOutcome,
  classifyTransportDeliveryOutcome,
} from './transport-semantic-outcome.js';

const {
  ConnectionState,
  METRICS_LOG_TAG,
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_ADDRESS,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  RouterMessageType,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_NUM,
  WebSocket,
  buildQueueWaitSummary,
  isRaftTransportPayload,
  normalizeDeliveryOutcome,
  resolveDeliverySource,
  resolveOperationIdFromMessage,
  resolveRequestIdFromMessage,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

// The handler answered. The acknowledgement is the router's own fact, written
// after the answer, so an answer's `acknowledged` value cannot turn a delivered
// message into a transport failure (decision D2).
function answeredDelivery(router, messageId, correlationId, answer) {
  return {
    messageId,
    correlationId,
    ...router.normalizeServiceResponseResult(answer),
    acknowledged: true,
  };
}

export async function deliverLocal(
  router,
  targetAddress,
  messageId,
  payload,
  correlationId,
  options = {},
) {
  return withDeliveryLifetime(router, options, async (options) => {
    assertDeliveryOpen(options);
    const handler = router.handlers.get(targetAddress);
    if (!handler) {
      return router.deliverRemote(
        targetAddress,
        messageId,
        payload,
        router.nodeId,
        correlationId,
        options,
      );
    }
    const {context} = options.deliveryLifetime;
    const localDelivery = Object.freeze({
      remainingMs: options.deliveryLifetime.remainingMs,
      assertCurrent: () => assertDeliveryOpen(options),
      ...(context === undefined ? {} : {deliveryContext: context}),
    });
    const envelope = {
      messageId,
      sourceAddress: ROUTER_ADDRESS.buildSourceAddress(router.nodeId),
      sourceNodeId: router.nodeId,
      targetAddress,
      payload: options.deliveryLifetime.prepareMessage(payload),
      timestamp: options.deliveryLifetime.clock.now(),
    };
    const delivery = router.connectionAuthorityOwner?.captureLocalDelivery() ?? null;
    assertDeliveryOpen(options);
    let result;
    try {
      result = await Promise.resolve(handler(envelope, delivery, localDelivery));
    } catch (error) {
      // Only the handler's own throw is a handler failure; the delivery
      // lifetime's refusals stay the router's (decision D1).
      return {
        result: {
          messageId,
          correlationId,
          ...classifyTransportDeliveryOutcome(buildHandlerFailedError(error?.message)),
        },
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    }
    assertDeliveryOpen(options);
    return {
      result: answeredDelivery(router, messageId, correlationId, result),
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  });
}

function recordDeliveryMetric(router, {
  targetNodeId, messageId, correlationId, requestId, operationId, result,
  queueWaitMs, deliverStartMs, clock,
}) {
  try {
    const queue = router.outboundQueues.get(targetNodeId);
    const queueDepth = queue ? queue.pending.length : TRANSPORT_NUM.ZERO;
    const queueWaitSummary = buildQueueWaitSummary(queue);
    const durationMs = clock.now() - deliverStartMs;
    const acknowledged = result?.acknowledged === true;
    const trigger = router.getDeliverMetricTrigger(
      targetNodeId,
      durationMs,
      queueDepth,
      acknowledged,
    );
    if (trigger) {
      router.deliverMetricQueueDepthByTarget.set(targetNodeId, queueDepth);
      if (trigger !== TRANSPORT_METRIC_TRIGGER.SAMPLE) {
        router.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
      }
      router.logger.info(METRICS_LOG_TAG.TRANSPORT_DELIVER, {
        targetNodeId,
        messageId,
        correlationId,
        requestId,
        operationId,
        durationMs,
        messageCount: router.messageCount,
        queueDepth,
        queueWaitMs,
        queueWaitSummary,
        acknowledged,
        trigger,
        error: acknowledged ? null : result?.error || null,
      });
    }
  } catch (_metricsErr) {
    void _metricsErr;
  }
}

export async function deliver(
  router,
  targetAddress,
  message,
  options = {},
) {
  const messageId = message.messageId || uuidv4();
  const correlationId = message.correlationId || messageId;
  let targetNodeId = options.targetNodeId;
  return withDeliveryLifetime(router, options, async (options) => {
    const deliverStartMs = options.deliveryLifetime.clock.now();
    assertDeliveryOpen(options);
    if (!router.initialized) {
      await router.initialize();
    }
    assertDeliveryOpen(options);
    const deliveryTimeoutMs = options.deliveryLifetime.remainingMs();
    const requestId = resolveRequestIdFromMessage(message);
    const operationId = resolveOperationIdFromMessage(message);
    const deliverySource = resolveDeliverySource(
      targetAddress,
      message,
      options,
    );
    router.messageCount += TRANSPORT_NUM.ONE;
    if (!targetNodeId) {
      const parsed = router.parseAddress(targetAddress);
      if (parsed.nodeId) {
        targetNodeId = parsed.nodeId;
      }
    }
    if (!targetNodeId && router.resolveServiceNode) {
      targetNodeId = router.resolveServiceNode(targetAddress);
    }
    if (!targetNodeId) {
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress));
    }
    const deliveryOutcome = await router.resolveDeliveryOutcome(
      targetAddress,
      message,
      messageId,
      targetNodeId,
      correlationId,
      {
        ...options,
        deliverySource,
        timeoutMs: deliveryTimeoutMs,
      },
    );
    assertDeliveryOpen(options);
    const normalizedOutcome = normalizeDeliveryOutcome(deliveryOutcome);
    const result = normalizedOutcome.result;
    const queueWaitMs = normalizedOutcome.queueWaitMs;
    recordDeliveryMetric(router, {
      targetNodeId, messageId, correlationId, requestId, operationId, result,
      queueWaitMs, deliverStartMs, clock: options.deliveryLifetime.clock,
    });
    return result;
  }, (error, lifetime) => {
    if (lifetime.ownsShutdown(error)) {
      return buildTransportDeliveryOutcome({
        messageId, correlationId, acknowledged: false, error: error.message, shutdown: true,
      });
    }
    return buildTransportDeliveryOutcome(router.buildDeferredDeliveryFailure(
      messageId, correlationId, error.message, {
        errorCode: error.code,
        retryAfterMs: router.resolveReconnectRetryAfterMs(
          router.nodeConnections.get(targetNodeId) || null,
        ),
      },
    ));
  });
}

export function tryDeliverRaftDirect(
  router,
  targetAddress,
  messageId,
  payload,
  targetNodeId,
  options = {},
) {
  assertDeliveryOpen(options);
  if (!isRaftTransportPayload(payload)) {
    return null;
  }
  const connection = router.nodeConnections.get(targetNodeId);
  if (
    !connection ||
    connection.state !== ConnectionState.CONNECTED ||
    !connection.ws ||
    connection.ws.readyState !== WebSocket.OPEN
  ) {
    return null;
  }
  const message = {
    type: RouterMessageType.SERVICE_MESSAGE,
    messageId,
    targetAddress,
    sourceAddress: ROUTER_ADDRESS.buildSourceAddress(router.nodeId),
    sourceNodeId: router.nodeId,
    payload,
    timestamp: router.timeSource.now(),
  };
  router.logger.debug(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY, {
    messageId,
    targetAddress,
    targetNodeId,
  });
  try {
    const encoded = JSON.stringify(message);
    assertDeliveryOpen(options);
    connection.ws.send(encoded);
    return {
      messageId,
      acknowledged: true,
      direct: true,
    };
  } catch (_sendError) {
    return null;
  }
}

export async function deliverRemote(
  router,
  targetAddress,
  messageId,
  payload,
  targetNodeId,
  correlationId,
  options = {},
) {
  return withDeliveryLifetime(router, options, async (options) => {
    assertDeliveryOpen(options);
    const directRaftDelivery = router.tryDeliverRaftDirect(
      targetAddress,
      messageId,
      payload,
      targetNodeId,
      options,
    );
    if (directRaftDelivery) {
      return directRaftDelivery;
    }
    const deliveryTimeoutMs = options.deliveryLifetime.remainingMs();
    const reconnectInProgress = router.buildReconnectInProgressFailure(
      targetNodeId,
      messageId,
      correlationId,
    );
    if (reconnectInProgress) {
      return {
        result: reconnectInProgress,
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    }
    const responsePromise = router.registerPendingResponse(messageId, targetNodeId, {
      deliverySource: resolveDeliverySource(targetAddress, payload, options),
      responseContext: options.responseContext,
      signal: options.signal,
      deliveryLifetime: options.deliveryLifetime,
    });
    const pending = router.pendingResponses.get(messageId);
    const cancelResponse = (retiredReason) => router.cancelPendingResponse(messageId, {
      expectedPending: pending,
      ignoreLateResponse: true,
      retiredReason,
    });
    responsePromise.catch(() => {});
    const complete = (ackResult, queueWaitMs) => completeRemoteDelivery(router, {
      ackResult, queueWaitMs, responsePromise, pending, cancelResponse,
      messageId, correlationId, options,
    });
    let ackResult;
    let queueWaitMs = TRANSPORT_NUM.ZERO;
    try {
      const ackOutcome = await router.enqueueOutbound(
        targetNodeId,
        () => {
          assertDeliveryOpen(options);
          const connection = router.nodeConnections.get(targetNodeId);
          const reconnectInProgress = router.buildReconnectInProgressFailure(
            targetNodeId,
            messageId,
            correlationId,
          );
          if (reconnectInProgress) {
            return reconnectInProgress;
          }
          if (
            (!connection || connection.state !== ConnectionState.CONNECTED) &&
            !router.isShuttingDown
          ) {
            const reconnectAddress =
              router.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] ||
              null;
            if (reconnectAddress) {
              return router.tryDeliverAfterReconnect(
                reconnectAddress,
                targetAddress,
                messageId,
                payload,
                targetNodeId,
                correlationId,
                remainingDeliveryMs(options, deliveryTimeoutMs),
                options,
              );
            }
          }
          if (!connection || connection.state !== ConnectionState.CONNECTED) {
            router.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
              messageId,
              targetAddress,
              targetNodeId,
              localNodeId: router.nodeId,
              connectionExists: !!connection,
              connectionState: connection?.state,
              availableConnections: Array.from(router.nodeConnections.keys()),
            });
            return router.buildDeferredDeliveryFailure(
              messageId,
              correlationId,
              ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
              {
                errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
                retryAfterMs: router.reconnectIntervalMs,
              },
            );
          }
          return router.sendMessage(
            connection,
            targetAddress,
            messageId,
            payload,
            targetNodeId,
            correlationId,
            remainingDeliveryMs(options, deliveryTimeoutMs),
            options,
          );
        },
        {
          deliveryPriority: options.deliveryPriority,
          deliverySource: options.deliverySource,
          replacePendingKey: options.replacePendingKey,
          targetAddress,
          message: payload,
          signal: options.signal,
          deliveryLifetime: options.deliveryLifetime,
        },
      );
      assertDeliveryOpen(options);
      const normalizedAckOutcome = normalizeDeliveryOutcome(ackOutcome);
      ackResult = normalizedAckOutcome.result;
      queueWaitMs = normalizedAckOutcome.queueWaitMs;
    } catch (error) {
      let deferredFailure;
      try {
        assertDeliveryOpen(options);
        deferredFailure = await router.resolveRecoverableDeliveryError({
          error, targetNodeId, targetAddress, messageId, payload, correlationId,
          deliveryTimeoutMs, options,
        });
        assertDeliveryOpen(options);
      } catch (recoveryError) {
        cancelResponse(RETIRED_PENDING_RESPONSE_REASON.CANCELLED);
        throw recoveryError;
      }
      if (deferredFailure?.acknowledged === true) {
        // The existing recovery attempt sent the request. Its ACK leaves the
        // original application response waiter and deadline in custody.
        return complete(deferredFailure, TRANSPORT_NUM.ZERO);
      }
      cancelResponse(deferredFailure ? RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY :
        RETIRED_PENDING_RESPONSE_REASON.CANCELLED);
      if (deferredFailure) {
        return {result: deferredFailure, queueWaitMs: TRANSPORT_NUM.ZERO};
      }
      if (error?.code === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE) {
        return {
          result: router.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            error.message,
            {
              errorCode: error.code,
              retryAfterMs: router.reconnectIntervalMs,
            },
          ),
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      }
      throw error;
    }
    return complete(ackResult, queueWaitMs);
  });
}

async function completeRemoteDelivery(router, {
  ackResult, queueWaitMs, responsePromise, pending, cancelResponse,
  messageId, correlationId, options,
}) {
  if (!ackResult?.acknowledged) {
    cancelResponse(RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED);
    return {
      result: ackResult,
      queueWaitMs,
    };
  }
  if (router.hasInlineAckPayload(ackResult)) {
    cancelResponse(RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK);
    return {
      result: ackResult,
      queueWaitMs,
    };
  }
  router.armPendingResponseTimeout(
    messageId, options.deliveryLifetime.remainingMs(), pending,
  );
  try {
    const serviceResult = await responsePromise;
    assertDeliveryOpen(options);
    return {
      result: answeredDelivery(router, messageId, correlationId, serviceResult),
      queueWaitMs,
    };
  } catch (error) {
    // No answer arrived after the ACK: the waiter's failure is the outcome,
    // through the owner's thrown-error conversion so its router code survives
    // (a connection closed after the ACK is the router's deferral, never
    // DELIVERED; a remote handler throw is handler_failed, finding F-A).
    return {
      result: {messageId, correlationId, ...classifyTransportDeliveryOutcome(error)},
      queueWaitMs,
    };
  }
}

export async function resolveRecoverableDeliveryError(
  router,
  {
    error,
    targetNodeId,
    targetAddress,
    messageId,
    payload,
    correlationId,
    deliveryTimeoutMs = null,
    options,
  },
) {
  assertDeliveryOpen(options);
  if (!error || router.isShuttingDown) {
    return null;
  }
  const retryAfterMs = Number.isFinite(error?.retryAfterMs) ?
    Math.max(TRANSPORT_NUM.ZERO, Math.floor(error.retryAfterMs)) :
    router.resolveReconnectRetryAfterMs(
      router.nodeConnections.get(targetNodeId) || null,
    );
  if (
    error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE &&
    error.recoverableBeforeSend === true
  ) {
    const reconnectInProgress = router.buildReconnectInProgressFailure(
      targetNodeId,
      messageId,
      correlationId,
    );
    if (reconnectInProgress) {
      return reconnectInProgress;
    }
    const reconnectAddress =
      router.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] || null;
    if (reconnectAddress) {
      try {
        return await router.tryDeliverAfterReconnect(
          reconnectAddress,
          targetAddress,
          messageId,
          payload,
          targetNodeId,
          correlationId,
          remainingDeliveryMs(options, deliveryTimeoutMs),
          options,
        );
      } catch (reconnectError) {
        return router.buildDeferredDeliveryFailure(
          messageId,
          correlationId,
          reconnectError?.message ||
            ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
          {
            errorCode:
              reconnectError?.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE,
            retryAfterMs: Number.isFinite(reconnectError?.retryAfterMs) ?
              reconnectError.retryAfterMs :
              retryAfterMs,
          },
        );
      }
    }
  }
  if (
    error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    error.message === ROUTER_ERROR_MSG.connectionClosed(targetNodeId)
  ) {
    return router.buildDeferredDeliveryFailure(
      messageId,
      correlationId,
      error.message,
      {
        errorCode: error.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE,
        retryAfterMs,
      },
    );
  }
  return null;
}

export function sendRaw(router, ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function isRegistered(router, address) {
  return router.handlers.has(address);
}

export function getRegisteredAddresses(router) {
  return Array.from(router.handlers.keys());
}

export function getConnectionState(router, nodeId) {
  const connection = router.nodeConnections.get(nodeId);
  return connection ? connection.state : null;
}

/**
 * Snapshot the local router's view of its connection to a peer, for
 * diagnostics on why a coordinator handoff to that peer is not being
 * acknowledged (no connection vs ack-timeout streak / quarantine churn).
 * @param {Object} router - Message router instance.
 * @param {string} nodeId - Peer node id.
 * @return {Object} Flat connection diagnostics snapshot.
 */
export function getConnectionHandoffDiagnostics(router, nodeId) {
  const connection = router.nodeConnections.get(nodeId);
  if (!connection) {
    return {present: false};
  }
  return {
    present: true,
    state: connection.state ?? null,
    isIncoming: connection.isIncoming === true,
    address: connection.address ?? null,
    connectionId: connection.connectionId ?? null,
    hasAddress:
      typeof connection.address === 'string' && connection.address.length > 0,
    hasScheduledReconnect: Boolean(connection.reconnectTimeout),
    reconnectAttempts: connection.reconnectAttempts ?? TRANSPORT_NUM.ZERO,
    ackTimeoutStreak: connection.ackTimeoutStreak ?? TRANSPORT_NUM.ZERO,
    lastAckAt: connection.lastAckAt ?? null,
    lastAckTimeoutAt: connection.lastAckTimeoutAt ?? null,
  };
}

export function getConnectedNodes(router) {
  const connected = [];
  for (const [_nodeId, connection] of router.nodeConnections) {
    if (connection.state === ConnectionState.CONNECTED && connection.nodeId) {
      connected.push(connection.nodeId);
    }
  }
  return connected;
}

export function hasSelfConnection(router) {
  const connection = router.nodeConnections.get(router.nodeId);
  return (
    connection &&
    connection.isSelfConnection &&
    connection.state === ConnectionState.CONNECTED
  );
}
