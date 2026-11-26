import {ROUTER_MESSAGE_TYPE as FRAME} from '../constants/transport.js';

// Fixed slots per physical WebSocket. Node IDs and connection records can
// survive a handoff; neither identifies the socket that supplied a frame.
const sockets = new WeakMap();
const peerInbound = new WeakMap();
let nextSocketId = 0;
const maxIdLength = 96;

function socketState(ws) {
  let state = sockets.get(ws);
  if (!state) {
    state = {socketId: ++nextSocketId, received: {}, sent: {}, sendReturned: {
      consensus: {frames: 0, bytes: 0},
      cdcGrantService: {frames: 0, bytes: 0},
      otherService: {frames: 0, bytes: 0},
      serviceResponse: {frames: 0, bytes: 0},
      routerControl: {frames: 0, bytes: 0},
    }};
    sockets.set(ws, state);
  }
  return state;
}

const tracked = new Set([FRAME.PING, FRAME.PONG, FRAME.ACK, FRAME.SERVICE_MESSAGE,
  FRAME.SERVICE_RESPONSE]);

function frameFact(router, frame) {
  const id = frame.messageId ?? frame.pingId;
  return {at: router.timeSource.now(),
    id: typeof id === 'string' && id.length <= maxIdLength ? id : null};
}

export function observeParsedFrame(router, peer, ws, frame) {
  try {
    const state = socketState(ws);
    const fact = frameFact(router, frame);
    if (tracked.has(frame.type)) state.received[frame.type] = fact;
    const connection = router.nodeConnections.get(peer);
    if (connection) peerInbound.set(connection, {socketId: state.socketId,
      type: typeof frame.type === 'string' ? frame.type.slice(0, maxIdLength) : null, ...fact});
  } catch {
    // Observation cannot change delivery or recovery.
    return null;
  }
}

// Counts application text-frame bodies after ws.send returns. A later callback
// error, ACK timeout, compression, and TCP retransmission are separate facts.
function countReturned(slot, bytes) {
  slot.frames += 1;
  slot.bytes += bytes;
}

export function observeConsensusSendReturned(ws, batchBytes) {
  try {
    countReturned(socketState(ws).sendReturned.consensus, batchBytes);
  } catch {
    // Diagnostics have no delivery authority.
  }
}

export function observeServiceSendReturned(ws, encoded, hasCdcGrant) {
  try {
    const counts = socketState(ws).sendReturned;
    countReturned(hasCdcGrant ? counts.cdcGrantService : counts.otherService,
      typeof encoded === 'string' ? Buffer.byteLength(encoded) : encoded.byteLength);
  } catch {
    // Preserve write callback and ACK custody.
  }
}

export function observeRawSend(router, ws, frame, encoded) {
  try {
    const state = socketState(ws);
    const counts = state.sendReturned;
    countReturned(frame.type === FRAME.SERVICE_RESPONSE ? counts.serviceResponse : counts.routerControl,
      Buffer.byteLength(encoded));
    if (tracked.has(frame.type)) state.sent[frame.type] = frameFact(router, frame);
  } catch {
    // Observation cannot change delivery or recovery.
    return null;
  }
}

function bufferedBytes(ws) {
  try {
    return ws?.bufferedAmount ?? null;
  } catch {
    return null;
  }
}

export function socketEvidence(router, targetNodeId, connection, attemptedSocket) {
  try {
    const current = router.nodeConnections.get(targetNodeId);
    const ws = attemptedSocket;
    const state = ws && socketState(ws);
    return {
      attemptedSocketId: state?.socketId ?? null,
      currentSocketId: current?.ws ? socketState(current.ws).socketId : null,
      latestPeerInbound: peerInbound.get(current) ?? null,
      received: {...state?.received},
      rawSendReturned: {...state?.sent},
      applicationSendReturned: state ? Object.fromEntries(
        Object.entries(state.sendReturned).map(([name, count]) => [name, {...count}]),
      ) : null,
      bufferedBytes: bufferedBytes(ws),
      lastSocketAckAt: connection?.lastAckAt ?? null,
      keepalivePingId: connection?.keepalivePingId ?? null,
    };
  } catch {
    // Observation cannot change delivery or recovery.
    return null;
  }
}

export function observeWriteBoundary(pending, ws, callback = false) {
  try {
    if (callback) {
      pending.writeCallbackAt = pending.clock.now();
    } else {
      pending.writeEnteredAt = pending.clock.now();
      pending.bufferedBytesAtWrite = bufferedBytes(ws);
    }
  } catch {
    // Partial socket diagnostics must not acquire or release write custody.
  }
}
