import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {assertDeliveryOpen, deliveryAbortReason, remainingDeliveryMs, withDeliveryLifetime}
  from './message-router-delivery-lifetime.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {encodeDeliveryMessage} from './message-router-delivery-encoding.js';

const DELIVERY_SETTLEMENT_REJECTED = 'rejected';

const {ROUTER_ADDRESS, ROUTER_LOG_MSG, RouterMessageType, WebSocket} =
  MESSAGE_ROUTER_SHARED;
const ACK_WAIT = Object.freeze({
  wait: 'MESSAGE_TIMEOUT_MS (delivery ACK)',
  awaited: 'ACK from the target node for a sent SERVICE_MESSAGE',
});
const DUPLICATE_PENDING_ACK = 'router_duplicate_pending_ack';

function rejectBeforeSend(router, connection, targetNodeId, reject) {
  const active = router.nodeConnections.get(targetNodeId) || connection;
  const retryAfterMs = router.resolveReconnectRetryAfterMs(active);
  if (active && active.isIncoming !== true && active.isSelfConnection !== true) {
    const staleWs = active.ws;
    router.handleConnectionClose(targetNodeId, active.connectionId);
    try {
      if (typeof staleWs?.terminate === 'function') staleWs.terminate();
      else if (typeof staleWs?.close === 'function') staleWs.close();
    } catch (error) {
      router.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
        nodeId: targetNodeId, connectionId: active.connectionId,
        error: error?.message ?? String(error),
      });
    }
  }
  reject(router.buildConnectionClosedError(targetNodeId, {beforeSend: true, retryAfterMs}));
}

function reportAckTimeout(router, pending, connection, targetAddress) {
  const {messageId, targetNodeId, clock, sentAt, deliveryTimeoutMs} = pending;
  const recoveryOwner = router.quarantineConnectionAfterAckTimeout(
    targetNodeId, connection, messageId, targetAddress,
  );
  const active = router.nodeConnections.get(targetNodeId) || null;
  reportWaitBoundSpent(router.logger, {
    ...ACK_WAIT,
    boundMs: deliveryTimeoutMs,
    elapsedMs: clock.now() - sentAt,
    lastObserved: {
      connectionId: connection?.connectionId ?? null,
      activeConnectionId: active?.connectionId ?? null,
      activeConnectionState: active?.state ?? null,
      sameConnection: active === connection,
      quarantineOwnerChanged: Boolean(recoveryOwner) && recoveryOwner !== connection,
    },
    scope: {nodeId: router.nodeId ?? null, targetNodeId, messageId},
    subject: targetNodeId,
  });
}

function sendWithAck(router, connection, targetAddress, messageId, payload, targetNodeId, options) {
  const write = Promise.withResolvers();
  write.promise.catch(() => {});
  let writeStarted = false;
  let writeClosed = false;
  const finishWrite = (error) => {
    if (writeClosed) return false;
    writeClosed = true;
    if (error) write.reject(error);
    else write.resolve();
    return true;
  };
  const acknowledged = new Promise((resolve, reject) => {
    assertDeliveryOpen(options);
    if (router.pendingMessages.has(messageId)) {
      throw Object.assign(new Error(DUPLICATE_PENDING_ACK), {code: DUPLICATE_PENDING_ACK});
    }
    const ws = connection?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      rejectBeforeSend(router, connection, targetNodeId, reject);
      return;
    }
    const {clock} = options.deliveryLifetime;
    const encoded = encodeDeliveryMessage({
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId,
      targetAddress,
      sourceAddress: ROUTER_ADDRESS.buildSourceAddress(router.nodeId),
      sourceNodeId: router.nodeId,
      payload,
      timestamp: clock.now(),
    }, options.deliveryLifetime);
    // Encoding can run user code or consume the whole grant. No timer callback
    // is required to reject an expired dispatch.
    assertDeliveryOpen(options);
    const pending = {
      messageId, targetNodeId, clock,
      sentAt: clock.now(),
      deliveryTimeoutMs: remainingDeliveryMs(options),
      timeout: null,
      assertOpen: () => assertDeliveryOpen(options),
    };
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      if (pending.timeout !== null) clock.clearTimeout(pending.timeout);
      options.signal.removeEventListener('abort', onAbort);
      if (router.pendingMessages.get(messageId) === pending) {
        router.pendingMessages.delete(messageId);
      }
      settle(value);
    };
    function onAbort() {
      if (settled) return;
      const reason = deliveryAbortReason(options.signal);
      // Cancellation of an upstream grant is not evidence of a bad socket.
      // Preserve ACK-timeout quarantine for this router's own spent grant.
      if (options.deliveryLifetime.ownsTimeout(reason)) {
        reportAckTimeout(router, pending, connection, targetAddress);
      }
      finish(reject, reason);
    }
    pending.resolve = (value) => {
      try {
        pending.assertOpen();
        finish(resolve, value);
      } catch (error) {
        finish(reject, error);
      }
    };
    pending.reject = (error) => finish(reject, error);
    const arm = () => {
      pending.timeout = clock.setTimeout(() => {
        if (router.pendingMessages.get(messageId) !== pending) return;
        try {
          pending.assertOpen();
          arm();
        } catch (error) {
          finish(reject, error);
        }
      }, remainingDeliveryMs(options));
      pending.timeout?.unref?.();
    };
    router.pendingMessages.set(messageId, pending);
    options.signal.addEventListener('abort', onAbort, {once: true});
    let bytes;
    try {
      arm();
      bytes = encoded.stamp();
      assertDeliveryOpen(options);
    } catch (error) {
      finish(reject, error);
      return;
    }
    try {
      writeStarted = true;
      ws.send(bytes, {binary: false}, (error) => {
        if (finishWrite(error) && error) pending.reject(error);
      });
    } catch (_sendError) {
      // Once ws.send has been entered, a thrown error is not proof that its
      // compression/write child released the encoded copy. The existing close
      // owner may induce the actual callback; until then cleanup stays owed.
      rejectBeforeSend(router, connection, targetNodeId, pending.reject);
    }
  });
  if (!writeStarted) finishWrite();
  // ACK timeout/abort settles public delivery through its lifetime. The raw
  // operation and outbound slot retain this exact encoded copy until ws's
  // write callback (including compression/queued-write failure) has closed it.
  // A socket CLOSE notification alone is not that cleanup authority.
  return Promise.allSettled([acknowledged, write.promise]).then(([ack, written]) => {
    if (ack.status === DELIVERY_SETTLEMENT_REJECTED) throw ack.reason;
    if (written.status === DELIVERY_SETTLEMENT_REJECTED) throw written.reason;
    return ack.value;
  });
}

function sendMessage(router, connection, targetAddress, messageId, payload, targetNodeId,
  _correlationId, timeoutMs = null, options = {}) {
  return withDeliveryLifetime(router, {
    ...options, timeoutMs: timeoutMs ?? options.timeoutMs,
  }, (owned) =>
    sendWithAck(router, connection, targetAddress, messageId, payload, targetNodeId, owned));
}

export {sendMessage};
