import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {assertDeliveryOpen, deliveryAbortReason, withDeliveryLifetime}
  from './message-router-delivery-lifetime.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {encodeDeliveryMessage} from './message-router-delivery-encoding.js';
import {enterSyncSection, exitSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {resolveDeliverySource} from './message-router-outbound-queue-admission.js';
import {FRAME_CLASS, ROUTER_SYNC_SECTION, logRouterDiagnostics}
  from './message-router-peer-traffic-diagnostics.js';
import {TRANSPORT_ACKNOWLEDGEMENT} from './transport-acknowledgement.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from './transport-semantic-outcome.js';

const DELIVERY_SETTLEMENT_REJECTED = 'rejected';

const {ROUTER_ADDRESS, ROUTER_LOG_MSG, RouterMessageType, WebSocket} =
  MESSAGE_ROUTER_SHARED;
// boundMs is the delivery's ACK bound (`ackTimeoutMs`) when the caller set one
// and it is the earlier, else the delivery lifetime's remainder.
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

// What one timed-out delivery looked like: which message, how large, how much
// the socket had buffered when it was handed over and has buffered now, and
// how loaded the peer's outbound queue is.
function observeAckTimeout(router, pending, sent) {
  const queue = router.outboundQueues.get(pending.targetNodeId);
  return {
    deliverySource: resolveDeliverySource(sent.targetAddress, sent.payload, sent.options),
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_TIMEOUT,
    acknowledgement: pending.acknowledgement,
    messageType: sent.payload?.type ?? null,
    payloadBytes: pending.payloadBytes,
    bufferedAmountAtSend: pending.bufferedAmountAtSend,
    bufferedAmountNow: sent.ws.bufferedAmount ?? null,
    queueInFlight: queue ? queue.inFlight : 0,
    queuePending: queue ? queue.pending.length : 0,
  };
}

// Every timeout, console sink only: the folded wait_bound_spent ERROR keeps
// one line per (target, observed state), which hides the per-message sizes
// and socket backlog needed to tell a wedged socket from a slow peer.
function logAckTimeoutDetail(router, pending, connection, sent, timeout) {
  logRouterDiagnostics(ROUTER_LOG_MSG.ACK_TIMEOUT_DETAIL, {
    localNodeId: router.nodeId ?? null,
    targetNodeId: pending.targetNodeId,
    messageId: pending.messageId,
    targetAddress: sent.targetAddress,
    connectionId: connection?.connectionId ?? null,
    boundMs: pending.deliveryTimeoutMs,
    elapsedMs: timeout.elapsedMs,
    ...timeout.observed,
    ackTimeoutStreak: timeout.active?.ackTimeoutStreak ?? null,
    quarantineOwnerChanged: timeout.quarantineOwnerChanged,
  });
}

function reportAckTimeout(router, pending, connection, sent) {
  const {messageId, targetNodeId, clock, sentAt, deliveryTimeoutMs} = pending;
  const observed = observeAckTimeout(router, pending, sent);
  const elapsedMs = clock.now() - sentAt;
  const recoveryOwner = router.quarantineConnectionAfterAckTimeout(
    targetNodeId, connection, messageId, sent.targetAddress,
  );
  const active = router.nodeConnections.get(targetNodeId) || null;
  const quarantineOwnerChanged =
    Boolean(recoveryOwner) && recoveryOwner !== connection;
  logAckTimeoutDetail(router, pending, connection, sent,
    {observed, elapsedMs, active, quarantineOwnerChanged});
  reportWaitBoundSpent(router.logger, {
    ...ACK_WAIT,
    boundMs: deliveryTimeoutMs,
    elapsedMs,
    lastObserved: {
      connectionId: connection?.connectionId ?? null,
      activeConnectionId: active?.connectionId ?? null,
      activeConnectionState: active?.state ?? null,
      sameConnection: active === connection,
      quarantineOwnerChanged,
      deliverySource: observed.deliverySource,
      reasonCode: observed.reasonCode,
      acknowledgement: observed.acknowledgement,
    },
    scope: {nodeId: router.nodeId ?? null, targetNodeId, messageId},
    subject: targetNodeId,
  });
}

function encodeDeliveryFrame(envelope, lifetime) {
  const encodeToken = enterSyncSection(ROUTER_SYNC_SECTION.FRAME_ENCODE);
  try {
    return encodeDeliveryMessage(envelope, lifetime);
  } finally {
    exitSyncSection(ROUTER_SYNC_SECTION.FRAME_ENCODE, encodeToken);
  }
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
    const encoded = encodeDeliveryFrame({
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
      // The bound this ACK wait ends on, not the whole lifetime.
      deliveryTimeoutMs: options.deliveryLifetime.ackWaitBoundMs(),
      timeout: null,
      assertOpen: () => assertDeliveryOpen(options),
      // The named acknowledgement state of this send; the delivery lifetime
      // holds the same fact and stamps its timeout error from it.
      acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT,
      recordAcknowledgement(state) {
        options.deliveryLifetime.recordAcknowledgement(state);
        pending.acknowledgement = options.deliveryLifetime.acknowledgement();
      },
      payloadBytes: null,
      bufferedAmountAtSend: null,
    };
    const sent = {ws, targetAddress, payload, options};
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
      // Preserve ACK-timeout quarantine for this router's own spent grant,
      // and only for a frame this socket took and never acknowledged: a bound
      // spent before the frame left (not_sent) or after the ACK (an answer
      // timeout) says nothing about this socket.
      if (options.deliveryLifetime.ownsTimeout(reason) &&
          pending.acknowledgement === TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED) {
        reportAckTimeout(router, pending, connection, sent);
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
      }, options.deliveryLifetime.ackWaitBoundMs());
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
    pending.payloadBytes = Buffer.byteLength(bytes);
    pending.bufferedAmountAtSend = ws.bufferedAmount ?? null;
    router.peerTrafficDiagnostics.recordSent(
      targetNodeId, pending.payloadBytes, FRAME_CLASS.REQUEST);
    let handedToSocket = false;
    try {
      writeStarted = true;
      ws.send(bytes, {binary: false}, (error) => {
        if (finishWrite(error) && error) pending.reject(error);
      });
      handedToSocket = true;
    } catch (_sendError) {
      // Once ws.send has been entered, a thrown error is not proof that its
      // compression/write child released the encoded copy. The existing close
      // owner may induce the actual callback; until then cleanup stays owed.
      rejectBeforeSend(router, connection, targetNodeId, pending.reject);
    }
    // ws.send returned: the socket took the frame and the target may receive
    // it. A synchronous throw left nothing on the wire, so it stays not_sent.
    if (handedToSocket) {
      pending.recordAcknowledgement(TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED);
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
