// Dedicated per-peer bulk transfer channel (quest raft-snapshot-bulk-transfer,
// S3): a SECOND WebSocket connection per peer under the same identity/
// admission regime (IDENTIFY with `channel: bulk`), owning byte-denominated
// controls — single in-flight chunk per peer, sender-side token-bucket
// byte-rate pacing, bounded pending sends, AbortSignal cancellation, and an
// explicit per-socket maxPayload on dial. Critical frames never share the
// bulk write buffer; the primary router's queue-class/reserve machinery is
// never touched, and bulk traffic deliberately does NOT stamp
// nodeInboundActivityAt (lane isolation, not an oversight). The registry
// feeds {pendingRequests, inFlightBytes, tokenDepth} into
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

const MS_PER_SECOND = 1000;
const MIN_DRAIN_WAIT_MS = 1;
const SIGNAL_ABORT_EVENT = 'abort';
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

  const drainWaiters = () => {
    refill();
    while (waiters.length > 0 && waiters[0].bytes <= availableBytes) {
      const waiter = waiters.shift();
      availableBytes -= waiter.bytes;
      waiter.resolve(Object.freeze({acquired: true}));
    }
    scheduleDrain();
  };

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
        const waiter = {bytes: want, resolve};
        waiters.push(waiter);
        if (signal) {
          signal.addEventListener(SIGNAL_ABORT_EVENT, () => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) {
              waiters.splice(index, 1);
              resolve(Object.freeze({acquired: false}));
            }
          }, {once: true});
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
        waiters.shift().resolve(Object.freeze({acquired: false}));
      }
    },
  });
}

// One adopted or dialed bulk socket toward one peer. Enforces single
// in-flight chunk (sends serialize through a chain), bounded pending sends,
// token-bucket pacing, and AbortSignal cancellation.
function createBulkTransferConnection(context) {
  const {nodeId, ws, tokenBucket, maxPendingSends, logger, onClosed} = context;
  const state = {
    open: true,
    pendingSends: 0,
    inFlightBytes: 0,
  };
  const messageListeners = [];
  let sendChain = Promise.resolve();
  // Self-reference handed to onClosed so the registry can guard against a
  // STALE socket's async close event evicting a live replacement connection
  // for the same peer (verifier MF-1).
  let connectionSelf = null;

  ws.on(TRANSPORT_EVENT.MESSAGE, (data, isBinary) => {
    for (const listener of messageListeners) {
      listener(data, isBinary);
    }
  });
  ws.on(TRANSPORT_EVENT.CLOSE, () => {
    state.open = false;
    onClosed(nodeId, connectionSelf);
  });
  ws.on(TRANSPORT_EVENT.ERROR, (error) => {
    logger.warn(TRANSPORT_EVENT.ERROR, {
      nodeId,
      error: error?.message,
    });
  });

  const connectionApi = Object.freeze({
    nodeId,
    ws,
    isOpen: () => state.open,
    onMessage(listener) {
      messageListeners.push(listener);
    },
    sendControl(message) {
      if (!state.open) {
        return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
      }
      ws.send(JSON.stringify(message));
      return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.SENT];
    },
    async sendChunkFrame(frame, sendOptions = {}) {
      const signal = sendOptions.signal;
      if (!state.open) {
        return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
      }
      if (state.pendingSends >= maxPendingSends) {
        return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.PENDING_LIMIT];
      }
      state.pendingSends += 1;
      const run = sendChain.then(async () => {
        if (signal?.aborted) {
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CANCELLED];
        }
        if (!state.open) {
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
        }
        state.inFlightBytes = frame.length;
        try {
          const grant = await tokenBucket.acquire(frame.length, {signal});
          if (!grant.acquired || signal?.aborted) {
            return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CANCELLED];
          }
          if (!state.open) {
            return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.CLOSED];
          }
          ws.send(frame);
          return SEND_RESULT[BULK_CHANNEL_SEND_OUTCOME.SENT];
        } finally {
          state.inFlightBytes = 0;
        }
      });
      sendChain = run.then(() => {}, () => {});
      try {
        return await run;
      } finally {
        state.pendingSends -= 1;
      }
    },
    close() {
      state.open = false;
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
 *   now}
 * @return {Object} the registry
 */
function createBulkTransferChannelRegistry(options = {}) {
  const logger = options.logger || NO_OP_LOGGER;
  const maxPendingSends = Number.isFinite(options.maxPendingSends) &&
      options.maxPendingSends > 0 ?
    Math.floor(options.maxPendingSends) :
    BULK_TRANSFER_CHANNEL_DEFAULT.MAX_PENDING_SENDS;
  const tokenBucket = options.tokenBucket ||
    createByteRateTokenBucket({now: options.now});
  const connections = new Map();

  const dropConnection = (nodeId, closedConnection) => {
    // A STALE socket's async close event must not evict a live replacement
    // connection adopted for the same peer (verifier MF-1): delete only when
    // the mapped connection IS the one that closed.
    if (connections.get(nodeId) === closedConnection) {
      connections.delete(nodeId);
    }
  };

  const attach = (nodeId, ws) => {
    const existing = connections.get(nodeId);
    if (existing) {
      existing.close();
      connections.delete(nodeId);
    }
    const connection = createBulkTransferConnection({
      nodeId,
      ws,
      tokenBucket,
      maxPendingSends,
      logger,
      onClosed: dropConnection,
    });
    connections.set(nodeId, connection);
    return connection;
  };

  return Object.freeze({
    tokenBucket,
    adoptIncomingSocket({nodeId, ws}) {
      return attach(nodeId, ws);
    },
    async dial(dialOptions) {
      const {nodeId, address, identify, signal} = dialOptions;
      const maxPayload = Number.isFinite(dialOptions.maxPayload) &&
          dialOptions.maxPayload > 0 ?
        dialOptions.maxPayload :
        BULK_TRANSFER_CHANNEL_DEFAULT.MAX_PAYLOAD_BYTES;
      const ws = new WebSocket(address, {maxPayload});
      await new Promise((resolve, reject) => {
        const failDial = (error) => reject(error);
        ws.once(TRANSPORT_EVENT.OPEN, () => {
          ws.removeListener(TRANSPORT_EVENT.ERROR, failDial);
          resolve();
        });
        ws.once(TRANSPORT_EVENT.ERROR, failDial);
        signal?.addEventListener(SIGNAL_ABORT_EVENT, () => {
          ws.terminate();
          reject(new Error(BULK_CHANNEL_SEND_OUTCOME.CANCELLED));
        }, {once: true});
      });
      // Pre-claim frame discipline (load-bearing): the IDENTIFY frame with
      // the bulk channel marker is the FIRST and ONLY frame on this socket
      // until the receiver's claim completes.
      ws.send(JSON.stringify({
        type: ROUTER_MESSAGE_TYPE.IDENTIFY,
        nodeId: identify.nodeId,
        nodeAddress: identify.nodeAddress,
        address: identify.nodeAddress,
        channel: ROUTER_IDENTIFY_CHANNEL.BULK,
        timestamp: Date.now(),
      }));
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
      let inFlightBytes = 0;
      let saturatedPeerCount = 0;
      for (const connection of connections.values()) {
        const stats = connection.getStats();
        pendingRequests += stats.pendingSends;
        inFlightBytes += stats.inFlightBytes;
        if (stats.pendingSends >= stats.maxPendingSends) {
          saturatedPeerCount += 1;
        }
      }
      return Object.freeze({
        pendingRequests,
        inFlightBytes,
        tokenDepth: tokenBucket.depthBytes(),
        maxPendingRequests: maxPendingSends * Math.max(1, connections.size),
        saturatedPeerCount,
      });
    },
    closeAll() {
      for (const connection of [...connections.values()]) {
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
