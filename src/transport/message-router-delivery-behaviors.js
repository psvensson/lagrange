import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  METRICS_LOG_TAG,
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_ADDRESS,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  RouterMessageType,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  WebSocket,
  buildQueueWaitSummary,
  isRaftPacket,
  normalizeDeliveryOutcome,
  resolveDeliverySource,
  resolveOperationIdFromMessage,
  resolveRequestIdFromMessage,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

export async function deliverLocal(
  router,
  targetAddress,
  messageId,
  payload,
  correlationId,
) {
  const handler = router.handlers.get(targetAddress);
  if (!handler) {
    return router.deliverRemote(
      targetAddress,
      messageId,
      payload,
      router.nodeId,
      correlationId,
    );
  }
  const envelope = {
    messageId,
    sourceAddress: ROUTER_ADDRESS.buildSourceAddress(router.nodeId),
    sourceNodeId: router.nodeId,
    targetAddress,
    payload,
    timestamp: Date.now(),
  };
  try {
    const result = await Promise.resolve(handler(envelope));
    return {
      result: {
        messageId,
        correlationId,
        acknowledged: true,
        ...(result && typeof result === TRANSPORT_TYPEOF.OBJECT ?
          (() => {
            const {
              acknowledged: _ack,
              type: handlerType,
              ...rest
            } = result;
            const merged = {
              ...rest,
            };
            if (handlerType) {
              merged.responseType = handlerType;
            }
            return merged;
          })() :
          {}),
      },
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  } catch (error) {
    return {
      result: {
        messageId,
        correlationId,
        acknowledged: false,
        error: error.message,
      },
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  }
}

export async function deliver(
  router,
  targetAddress,
  message,
  options = {},
) {
  const deliverStartMs = Date.now();
  if (!router.initialized) {
    await router.initialize();
  }
  const deliveryTimeoutMs =
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > TRANSPORT_NUM.ZERO ?
      Math.floor(options.timeoutMs) :
      router.messageTimeoutMs;
  const messageId = message.messageId || uuidv4();
  const correlationId = message.correlationId || messageId;
  const requestId = resolveRequestIdFromMessage(message);
  const operationId = resolveOperationIdFromMessage(message);
  const deliverySource = resolveDeliverySource(
    targetAddress,
    message,
    options,
  );
  router.messageCount += TRANSPORT_NUM.ONE;
  let targetNodeId = options.targetNodeId;
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
  const normalizedOutcome = normalizeDeliveryOutcome(deliveryOutcome);
  const result = normalizedOutcome.result;
  const queueWaitMs = normalizedOutcome.queueWaitMs;
  try {
    const queue = router.outboundQueues.get(targetNodeId);
    const queueDepth = queue ? queue.pending.length : TRANSPORT_NUM.ZERO;
    const queueWaitSummary = buildQueueWaitSummary(queue);
    const durationMs = Date.now() - deliverStartMs;
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
  return result;
}

export function tryDeliverRaftDirect(
  router,
  targetAddress,
  messageId,
  payload,
  targetNodeId,
) {
  if (!isRaftPacket(payload)) {
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
    timestamp: Date.now(),
  };
  router.logger.debug(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY, {
    messageId,
    targetAddress,
    targetNodeId,
  });
  try {
    connection.ws.send(JSON.stringify(message));
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
  const directRaftDelivery = router.tryDeliverRaftDirect(
    targetAddress,
    messageId,
    payload,
    targetNodeId,
  );
  if (directRaftDelivery) {
    return directRaftDelivery;
  }
  const deliveryTimeoutMs =
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > TRANSPORT_NUM.ZERO ?
      Math.floor(options.timeoutMs) :
      router.messageTimeoutMs;
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
  });
  let earlyResponseError = null;
  responsePromise.catch((error) => {
    earlyResponseError = error;
  });
  let ackResult;
  let queueWaitMs = TRANSPORT_NUM.ZERO;
  try {
    const ackOutcome = await router.enqueueOutbound(
      targetNodeId,
      () => {
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
              deliveryTimeoutMs,
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
          deliveryTimeoutMs,
        );
      },
      {
        deliveryPriority: options.deliveryPriority,
        deliverySource: options.deliverySource,
        replacePendingKey: options.replacePendingKey,
        targetAddress,
        message: payload,
      },
    );
    const normalizedAckOutcome = normalizeDeliveryOutcome(ackOutcome);
    ackResult = normalizedAckOutcome.result;
    queueWaitMs = normalizedAckOutcome.queueWaitMs;
  } catch (error) {
    const deferredFailure = await router.resolveRecoverableDeliveryError({
      error,
      targetNodeId,
      targetAddress,
      messageId,
      payload,
      correlationId,
      deliveryTimeoutMs,
    });
    if (deferredFailure) {
      router.cancelPendingResponse(messageId, {
        ignoreLateResponse: true,
        retiredReason: RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY,
      });
      return {
        result: deferredFailure,
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    }
    router.cancelPendingResponse(messageId, {
      ignoreLateResponse: true,
      retiredReason: RETIRED_PENDING_RESPONSE_REASON.CANCELLED,
    });
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
  if (!ackResult?.acknowledged) {
    router.cancelPendingResponse(messageId, {
      ignoreLateResponse: true,
      retiredReason: RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED,
    });
    return {
      result: ackResult,
      queueWaitMs,
    };
  }
  if (router.hasInlineAckPayload(ackResult)) {
    router.cancelPendingResponse(messageId, {
      ignoreLateResponse: true,
      retiredReason: RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK,
    });
    return {
      result: ackResult,
      queueWaitMs,
    };
  }
  router.armPendingResponseTimeout(messageId, deliveryTimeoutMs);
  try {
    if (earlyResponseError) {
      throw earlyResponseError;
    }
    const serviceResult = await responsePromise;
    return {
      result: {
        messageId,
        correlationId,
        acknowledged: true,
        ...router.normalizeServiceResponseResult(serviceResult),
      },
      queueWaitMs,
    };
  } catch (error) {
    return {
      result: {
        messageId,
        correlationId,
        acknowledged: true,
        error: error.message,
      },
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
  },
) {
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
          deliveryTimeoutMs,
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

export function sendMessage(
  router,
  connection,
  targetAddress,
  messageId,
  payload,
  targetNodeId,
  correlationId,
  timeoutMs = null,
) {
  return new Promise((resolve, reject) => {
    const message = {
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId,
      targetAddress,
      sourceAddress: ROUTER_ADDRESS.buildSourceAddress(router.nodeId),
      sourceNodeId: router.nodeId,
      payload,
      timestamp: Date.now(),
    };
    const deliveryTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > TRANSPORT_NUM.ZERO ?
        Math.floor(timeoutMs) :
        router.messageTimeoutMs;
    const failBeforeSend = () => {
      const activeConnection = router.nodeConnections.get(targetNodeId) ||
        connection;
      const retryAfterMs =
        router.resolveReconnectRetryAfterMs(activeConnection);
      if (
        activeConnection &&
        activeConnection.isIncoming !== true &&
        activeConnection.isSelfConnection !== true
      ) {
        const staleWs = activeConnection.ws;
        router.handleConnectionClose(targetNodeId, activeConnection.connectionId);
        try {
          if (typeof staleWs?.terminate === TRANSPORT_TYPEOF.FUNCTION) {
            staleWs.terminate();
          } else if (typeof staleWs?.close === TRANSPORT_TYPEOF.FUNCTION) {
            staleWs.close();
          }
        } catch (_closeErr) {
          void _closeErr;
        }
      }
      reject(
        router.buildConnectionClosedError(targetNodeId, {
          beforeSend: true,
          retryAfterMs,
        }),
      );
    };
    if (!connection?.ws || connection.ws.readyState !== WebSocket.OPEN) {
      failBeforeSend();
      return;
    }
    const timeout = setTimeout(() => {
      router.pendingMessages.delete(messageId);
      const recoveryOwner = router.quarantineConnectionAfterAckTimeout(
        targetNodeId,
        connection,
        messageId,
        targetAddress,
      );
      resolve(
        router.buildDeferredDeliveryFailure(
          messageId,
          correlationId,
          TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
          {
            errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
            retryAfterMs: router.resolveReconnectRetryAfterMs(
              recoveryOwner || connection,
            ),
          },
        ),
      );
    }, deliveryTimeoutMs);
    router.pendingMessages.set(messageId, {
      messageId,
      resolve,
      reject,
      timeout,
      sentAt: Date.now(),
      targetNodeId,
    });
    try {
      connection.ws.send(JSON.stringify(message));
    } catch (_sendError) {
      clearTimeout(timeout);
      router.pendingMessages.delete(messageId);
      failBeforeSend();
    }
  });
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

export async function pingNode(router, nodeId, timeoutMs = null) {
  const connection = router.nodeConnections.get(nodeId);
  if (
    !connection ||
    connection.state !== ConnectionState.CONNECTED ||
    !connection.ws
  ) {
    return false;
  }
  const pingId = uuidv4();
  const timeout = timeoutMs ?? router.pingTimeoutMs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      router.pendingPings.delete(pingId);
      resolve(false);
    }, timeout);
    router.pendingPings.set(pingId, {
      resolve,
      timeout: timer,
    });
    router.sendRaw(connection.ws, {
      type: RouterMessageType.PING,
      pingId,
      timestamp: Date.now(),
    });
  });
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
