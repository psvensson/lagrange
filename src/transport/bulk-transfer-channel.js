// Dedicated per-peer bulk transfer channel (quest raft-snapshot-bulk-transfer,
// S3): a SECOND WebSocket connection per peer under the same identity/
// admission regime (IDENTIFY with `channel: bulk`), owning byte-denominated
// controls — single in-flight chunk per peer, sender-side token-bucket
// byte-rate pacing, bounded pending sends, AbortSignal cancellation, and an
// explicit per-socket maxPayload on dial. Critical frames never share the
// bulk write buffer; the primary router's queue-class/reserve machinery is
// never touched, and bulk traffic deliberately does NOT stamp
// nodeInboundActivityAt (lane isolation, not an oversight). The registry
// feeds {pendingRequests, retainedSendBytes, inFlightBytes, tokenDepth} into
// MessageRouter.getStats() as the additive `bulkChannel` section the pressure
// governor's BULK partition reads (sensor advisory; the sender bucket is the
// enforcement point).

import WebSocket from 'ws';

import {
  BULK_TRANSFER_CHANNEL_DEFAULT,
  ROUTER_IDENTIFY_CHANNEL,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_EVENT,
} from '../constants/transport.js';
import {requireIssuedBootIncarnation} from
  '../bootstrap/boot-incarnation-contract.js';

const MS_PER_SECOND = 1000;
const MIN_DRAIN_WAIT_MS = 1;
const SIGNAL_ABORT_EVENT = 'abort';
const BULK_IDENTIFY_SUBJECT = 'Bulk channel IDENTIFY';
const BULK_CHANNEL_TYPEOF = Object.freeze({
  FUNCTION: 'function',
});

// Typed outcomes of a bulk chunk-frame send.
const BULK_CHANNEL_SEND_OUTCOME = Object.freeze({
  SENT: 'sent',
  PENDING_LIMIT: 'pending_limit',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
});

const NO_OP_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function frozenSendResult(outcome) {
  return Object.freeze({outcome});
}

const SEND_RESULT = Object.freeze({
  [BULK_CHANNEL_SEND_OUTCOME.SENT]:
    frozenSendResult(BULK_CHANNEL_SEND_OUTCOME.SENT),
  [BULK_CHANNEL_SEND_OUTCOME.PENDING_LIMIT]:
    frozenSendResult(BULK_CHANNEL_SEND_OUTCOME.PENDING_LIMIT),
  [BULK_CHANNEL_SEND_OUTCOME.CANCELLED]:
    frozenSendResult(BULK_CHANNEL_SEND_OUTCOME.CANCELLED),
  [BULK_CHANNEL_SEND_OUTCOME.CLOSED]:
    frozenSendResult(BULK_CHANNEL_SEND_OUTCOME.CLOSED),
});

function sendWebSocketFrame(ws, frame, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let observedError = null;
    const signal = options.signal;
    const observeError = (error) => {
      observedError ||= error;
    };
    const abortSend = () => {
      try {
        ws.terminate();
      } catch (error) {
        observedError ||= error;
      }
    };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      ws.removeListener(TRANSPORT_EVENT.ERROR, observeError);
      signal?.removeEventListener(SIGNAL_ABORT_EVENT, abortSend);
      resolve(error || observedError);
    };
    ws.on(TRANSPORT_EVENT.ERROR, observeError);
    signal?.addEventListener(SIGNAL_ABORT_EVENT, abortSend, {once: true});
    if (signal?.aborted) {
      abortSend();
      settle(new Error(BULK_CHANNEL_SEND_OUTCOME.CANCELLED));
      return;
    }
    try {
      ws.send(frame, settle);
    } catch (error) {
      settle(error);
    }
  });
}

/**
 * Sender-side byte-rate token bucket (the enforcement point: the serving node
 * is the protected resource). The clock is injectable for deterministic
 * tests; a non-positive bytesPerSecond never drains, so waiters stay parked
 * (the saturation shape the lane-isolation guard exercises).
 * @param {Object} [options] {bytesPerSecond, capacityBytes, now}
 * @return {Object} {acquire, depthBytes, pendingCount, dispose}
 */
function createByteRateTokenBucket(options = {}) {
  const bytesPerSecond = Number.isFinite(options.bytesPerSecond) ?
    options.bytesPerSecond :
    BULK_TRANSFER_CHANNEL_DEFAULT.TOKEN_BUCKET_BYTES_PER_SECOND;
  const capacityBytes = Number.isFinite(options.capacityBytes) &&
      options.capacityBytes > 0 ?
    options.capacityBytes :
    BULK_TRANSFER_CHANNEL_DEFAULT.TOKEN_BUCKET_CAPACITY_BYTES;
  const now = typeof options.now === BULK_CHANNEL_TYPEOF.FUNCTION ?
    options.now :
    () => Date.now();
  let availableBytes = capacityBytes;
  let lastRefillAtMs = now();
  let drainTimer = null;
  const waiters = [];

  const refill = () => {
    const nowMs = now();
    const elapsedMs = Math.max(0, nowMs - lastRefillAtMs);
    lastRefillAtMs = nowMs;
    if (bytesPerSecond > 0) {
      availableBytes = Math.min(
        capacityBytes,
        availableBytes + (elapsedMs * bytesPerSecond) / MS_PER_SECOND);
    }
  };

  const scheduleDrain = () => {
    if (drainTimer || waiters.length === 0 || bytesPerSecond <= 0) {
      return;
    }
    const deficitBytes = Math.max(0, waiters[0].bytes - availableBytes);
    const waitMs = Math.max(
      MIN_DRAIN_WAIT_MS,
      Math.ceil((deficitBytes * MS_PER_SECOND) / bytesPerSecond));
    drainTimer = setTimeout(() => {
      drainTimer = null;
      drainWaiters();
    }, waitMs);
    drainTimer.unref?.();
  };

  function drainWaiters() {
    refill();
    while (waiters.length > 0 && waiters[0].bytes <= availableBytes) {
      const waiter = waiters.shift();
      availableBytes -= waiter.bytes;
      waiter.signal?.removeEventListener(
        SIGNAL_ABORT_EVENT, waiter.abortListener);
      waiter.resolve(Object.freeze({acquired: true}));
    }
    if (waiters.length === 0 && drainTimer) {
      clearTimeout(drainTimer);
      drainTimer = null;
    }
    scheduleDrain();
  }

  return Object.freeze({
    acquire(bytes, acquireOptions = {}) {
      const signal = acquireOptions.signal;
      refill();
      // A frame larger than the whole bucket would never drain; it costs the
      // full capacity instead (paced at the bucket's slowest grant).
      const want = Math.min(bytes, capacityBytes);
      if (signal?.aborted) {
        return Promise.resolve(Object.freeze({acquired: false}));
      }
      if (waiters.length === 0 && want <= availableBytes) {
        availableBytes -= want;
        return Promise.resolve(Object.freeze({acquired: true}));
      }
      return new Promise((resolve) => {
        const waiter = {bytes: want, resolve, signal, abortListener: null};
        waiters.push(waiter);
        if (signal) {
          waiter.abortListener = () => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) {
              waiters.splice(index, 1);
              resolve(Object.freeze({acquired: false}));
              drainWaiters();
            }
          };
          signal.addEventListener(
            SIGNAL_ABORT_EVENT, waiter.abortListener, {once: true});
        }
        scheduleDrain();
      });
    },
    depthBytes() {
      refill();
      return Math.floor(availableBytes);
    },
    pendingCount() {
      return waiters.length;
    },
    dispose() {
      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter.signal?.removeEventListener(
          SIGNAL_ABORT_EVENT, waiter.abortListener);
        waiter.resolve(Object.freeze({acquired: false}));
      }
    },
  });
}

// One adopted or dialed bulk socket toward one peer. Enforces single
// in-flight chunk (sends serialize through a chain), bounded pending sends,
// token-bucket pacing, and AbortSignal cancellation.
function createBulkTransferConnection(context) {
  const {
    nodeId,
    ws,
    tokenBucket,
    maxPendingSends,
    logger,
    onSocketClosed,
    onRetired,
  } = context;
  const state = {
    open: true,
    pendingSends: 0,
    retainedSendBytes: 0,
    inFlightBytes: 0,
  };
  const messageListeners = [];
  // Consumer-facing close hook (S6 verifier MUST-CHANGE): transfer drivers
  // have no timeouts, so a silently-consumed ws close would hang both ends
  // forever. Listeners fire exactly once, after the registry eviction.
  const closeListeners = [];
  let closeNotified = false;
  let closeObserved = false;
  let sendChain = Promise.resolve();
  const connectionAbortController = new AbortController();
  // Self-reference handed to onClosed so the registry can guard against a
  // STALE socket's async close event evicting a live replacement connection
  // for the same peer (verifier MF-1).
  let connectionSelf = null;

  const notifyClosed = () => {
    if (closeNotified) {
      return;
    }
    closeNotified = true;
    for (const listener of [...closeListeners]) {
      listener();
    }
  };

  const retireIfDrained = () => {
    if (closeObserved && state.pendingSends === 0) {
      onRetired(nodeId, connectionSelf);
    }
  };

  ws.on(TRANSPORT_EVENT.MESSAGE, (data, isBinary) => {
    for (const listener of [...messageListeners]) {
      listener(data, isBinary);
    }
  });
  ws.on(TRANSPORT_EVENT.CLOSE, () => {
    state.open = false;
    closeObserved = true;
    connectionAbortController.abort();
    onSocketClosed(nodeId, connectionSelf);
    notifyClosed();
    retireIfDrained();
  });
  ws.on(TRANSPORT_EVENT.ERROR, (error) => {
    logger.warn(TRANSPORT_EVENT.ERROR, {
      nodeId,
      error: error?.message,
    });
  });

  const closeAfterSendFailure = (error) => {
    logger.warn(TRANSPORT_EVENT.ERROR, {nodeId, error: error?.message});
    state.open = false;
    connectionAbortController.abort();
    try {
      ws.close();
    } catch (closeError) {
      logger.warn(TRANSPORT_EVENT.CLOSE, {
        nodeId,
        error: closeError?.message,
      });
    }
  };

  const writeRetainedFrame = (frame, frameBytes, writeOptions = {}) => {
    const run = sendChain.then(async () => {
      if (writeOptions.signal?.aborted) {
        return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CANCELLED];
      }
      if (!state.open) {
        return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
      }
      state.inFlightBytes = frameBytes;
      try {
        const error = await sendWebSocketFrame(ws, frame);
        if (error) {
          closeAfterSendFailure(error);
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
        }
        return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.SENT];
      } finally {
        state.inFlightBytes = 0;
      }
    });
    sendChain = run.then(() => {}, () => {});
    return run;
  };

  const retainSend = (frameBytes) => {
    if (!state.open) return BULK_CHANNEL_SEND_OUTCOME.CLOSED;
    if (state.pendingSends >= maxPendingSends) {
      return BULK_CHANNEL_SEND_OUTCOME.PENDING_LIMIT;
    }
    state.pendingSends += 1;
    state.retainedSendBytes += frameBytes;
    return null;
  };

  const releaseSend = (frameBytes) => {
    state.retainedSendBytes -= frameBytes;
    state.pendingSends -= 1;
    retireIfDrained();
  };

  const connectionApi = Object.freeze({
    nodeId,
    ws,
    isOpen: () => state.open,
    onMessage(listener) {
      messageListeners.push(listener);
    },
    // offMessage keeps long-lived connections bounded: a completed
    // transfer's (or the offer router's handed-off) inbox listener must not
    // accumulate and buffer frames forever (S6 verifier MUST-CHANGE).
    offMessage(listener) {
      const index = messageListeners.indexOf(listener);
      if (index >= 0) {
        messageListeners.splice(index, 1);
      }
    },
    onClose(listener) {
      if (closeNotified || !state.open) {
        listener();
        return;
      }
      closeListeners.push(listener);
    },
    async sendControl(message) {
      const refusal = retainSend(0);
      if (refusal) return SEND_RESULT[refusal];
      let frameBytes = 0;
      try {
        const frame = JSON.stringify(message);
        frameBytes = Buffer.byteLength(frame);
        state.retainedSendBytes += frameBytes;
        return await writeRetainedFrame(frame, frameBytes);
      } finally {
        releaseSend(frameBytes);
      }
    },
    async sendChunkFrame(frame, sendOptions = {}) {
      const signal = sendOptions.signal;
      const frameBytes = frame.length;
      const refusal = retainSend(frameBytes);
      if (refusal) return SEND_RESULT[refusal];
      try {
        if (signal?.aborted) {
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CANCELLED];
        }
        const acquireSignal = signal ?
          globalThis.AbortSignal.any(
            [signal, connectionAbortController.signal]) :
          connectionAbortController.signal;
        const grant = await tokenBucket.acquire(frameBytes, {
          signal: acquireSignal,
        });
        if (!state.open || connectionAbortController.signal.aborted) {
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
        }
        if (!grant.acquired || signal?.aborted) {
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CANCELLED];
        }
        return await writeRetainedFrame(frame, frameBytes, {signal});
      } finally {
        releaseSend(frameBytes);
      }
    },
    close() {
      state.open = false;
      connectionAbortController.abort();
      try {
        ws.close();
      } catch (error) {
        logger.warn(TRANSPORT_EVENT.CLOSE, {nodeId, error: error?.message});
      }
    },
    getStats() {
      return Object.freeze({
        nodeId,
        open: state.open,
        pendingSends: state.pendingSends,
        retainedSendBytes: state.retainedSendBytes,
        inFlightBytes: state.inFlightBytes,
        maxPendingSends,
      });
    },
  });
  connectionSelf = connectionApi;
  return connectionApi;
}

/**
 * Create the per-node bulk transfer channel registry: adopts identified
 * inbound bulk sockets (handed over by the router IDENTIFY fork), dials
 * outbound bulk sockets with an explicit per-socket maxPayload, keys at most
 * one channel per peer nodeId, and aggregates the byte-denominated stats the
 * router stats bridge exposes to the pressure governor.
 * @param {Object} [options] {nodeId, logger, tokenBucket, maxPendingSends,
 *   now, createWebSocket}
 * @return {Object} the registry
 */
function createBulkTransferChannelRegistry(options = {}) {
  const logger = options.logger || NO_OP_LOGGER;
  // The registry belongs to one node's router, so it reads that router's
  // clock. Unsupplied, it is the host clock, exactly as before.
  const now = typeof options.now === BULK_CHANNEL_TYPEOF.FUNCTION ?
    options.now :
    () => Date.now();
  const maxPendingSends = Number.isFinite(options.maxPendingSends) &&
      options.maxPendingSends > 0 ?
    Math.floor(options.maxPendingSends) :
    BULK_TRANSFER_CHANNEL_DEFAULT.MAX_PENDING_SENDS;
  const tokenBucket = options.tokenBucket ||
    createByteRateTokenBucket({now: options.now});
  // Dial construction seam (guard-only injection): production always dials
  // the real ws client; the S4 recorded-gap guard injects a capturing
  // constructor to pin the per-socket maxPayload on the dial options.
  const createWebSocket =
    typeof options.createWebSocket === BULK_CHANNEL_TYPEOF.FUNCTION ?
      options.createWebSocket :
      (address, wsOptions) => new WebSocket(address, wsOptions);
  const connections = new Map();
  const retiredConnections = new Set();
  // Adoption listeners (S6): the follower-side snapshot offer router arms
  // its first-frame peek here — INBOUND adopted sockets only, never dials
  // (the dialing side is the transfer initiator, not an offer target).
  const adoptListeners = [];

  const retireConnection = (nodeId, closedConnection) => {
    // A STALE socket's async close event must not evict a live replacement
    // connection adopted for the same peer (verifier MF-1): delete only when
    // the mapped connection IS the one that closed.
    if (connections.get(nodeId) === closedConnection) {
      connections.delete(nodeId);
    }
    retiredConnections.add(closedConnection);
  };

  const dropRetiredConnection = (nodeId, retiredConnection) => {
    retiredConnections.delete(retiredConnection);
  };

  const attach = (nodeId, ws) => {
    const existing = connections.get(nodeId);
    if (existing) {
      connections.delete(nodeId);
      retiredConnections.add(existing);
      existing.close();
    }
    const connection = createBulkTransferConnection({
      nodeId,
      ws,
      tokenBucket,
      maxPendingSends,
      logger,
      onSocketClosed: retireConnection,
      onRetired: dropRetiredConnection,
    });
    connections.set(nodeId, connection);
    return connection;
  };

  return Object.freeze({
    tokenBucket,
    adoptIncomingSocket({nodeId, ws}) {
      const connection = attach(nodeId, ws);
      for (const listener of [...adoptListeners]) {
        listener(connection);
      }
      return connection;
    },
    onAdopt(listener) {
      adoptListeners.push(listener);
    },
    async dial(dialOptions) {
      const {nodeId, address, identify, signal} = dialOptions;
      // The snapshot channel identifies the exact generation that dialled it,
      // like every other IDENTIFY frame (D5): a bulk socket is never adopted
      // under an unstamped identity, and the value is the dialler's issued
      // incarnation — never defaulted, never 0.
      const bootIncarnation = requireIssuedBootIncarnation(
        identify?.bootIncarnation, BULK_IDENTIFY_SUBJECT);
      const maxPayload = Number.isFinite(dialOptions.maxPayload) &&
          dialOptions.maxPayload > 0 ?
        dialOptions.maxPayload :
        BULK_TRANSFER_CHANNEL_DEFAULT.MAX_PAYLOAD_BYTES;
      const ws = createWebSocket(address, {maxPayload});
      await new Promise((resolve, reject) => {
        const handlers = {};
        const cleanup = () => {
          ws.removeListener(TRANSPORT_EVENT.OPEN, handlers.open);
          ws.removeListener(TRANSPORT_EVENT.ERROR, handlers.fail);
          signal?.removeEventListener(SIGNAL_ABORT_EVENT, handlers.abort);
        };
        handlers.open = () => {
          cleanup();
          resolve();
        };
        handlers.fail = (error) => {
          cleanup();
          reject(error);
        };
        handlers.abort = () => {
          cleanup();
          ws.terminate();
          reject(new Error(BULK_CHANNEL_SEND_OUTCOME.CANCELLED));
        };
        ws.once(TRANSPORT_EVENT.OPEN, handlers.open);
        ws.once(TRANSPORT_EVENT.ERROR, handlers.fail);
        signal?.addEventListener(
          SIGNAL_ABORT_EVENT, handlers.abort, {once: true});
        if (signal?.aborted) handlers.abort();
      });
      // Pre-claim frame discipline (load-bearing): the IDENTIFY frame with
      // the bulk channel marker is the FIRST and ONLY frame on this socket
      // until the receiver's claim completes.
      const identifyError = await sendWebSocketFrame(ws, JSON.stringify({
        type: ROUTER_MESSAGE_TYPE.IDENTIFY,
        nodeId: identify.nodeId,
        nodeAddress: identify.nodeAddress,
        address: identify.nodeAddress,
        bootIncarnation,
        channel: ROUTER_IDENTIFY_CHANNEL.BULK,
        timestamp: now(),
      }), {signal});
      if (identifyError || signal?.aborted) {
        ws.terminate();
        throw identifyError ||
          new Error(BULK_CHANNEL_SEND_OUTCOME.CANCELLED);
      }
      return attach(nodeId, ws);
    },
    hasConnection(nodeId) {
      return connections.has(nodeId);
    },
    getConnection(nodeId) {
      return connections.get(nodeId) || null;
    },
    getStats() {
      let pendingRequests = 0;
      let retainedSendBytes = 0;
      let inFlightBytes = 0;
      let saturatedPeerCount = 0;
      const ownedConnections = new Set([
        ...connections.values(),
        ...retiredConnections,
      ]);
      for (const connection of ownedConnections) {
        const stats = connection.getStats();
        pendingRequests += stats.pendingSends;
        retainedSendBytes += stats.retainedSendBytes;
        inFlightBytes += stats.inFlightBytes;
        if (stats.pendingSends >= stats.maxPendingSends) {
          saturatedPeerCount += 1;
        }
      }
      return Object.freeze({
        pendingRequests,
        retainedSendBytes,
        inFlightBytes,
        tokenDepth: tokenBucket.depthBytes(),
        maxPendingRequests:
          maxPendingSends * Math.max(1, ownedConnections.size),
        saturatedPeerCount,
      });
    },
    closeAll() {
      for (const connection of [...connections.values()]) {
        retiredConnections.add(connection);
        connection.close();
      }
      connections.clear();
      tokenBucket.dispose();
    },
  });
}

export {
  BULK_CHANNEL_SEND_OUTCOME,
  createBulkTransferChannelRegistry,
  createByteRateTokenBucket,
};
