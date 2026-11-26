import {ReplicaOperationMessageType} from '../rebalancer/replica-operation-constants.js';
import {MESSAGE_TYPE} from '../constants/messages.js';
import {ROUTER_MESSAGE_TYPE as FRAME} from '../constants/transport.js';

// Fixed slots per physical WebSocket. Node IDs and connection records can
// survive a handoff; neither identifies the socket that supplied a frame.
const sockets = new WeakMap();
const peerInbound = new WeakMap();
let nextSocketId = 0;
const maxIdLength = 96;

const familyNames = Object.freeze(['controlRead', 'controlWrite', 'query', 'cdc',
  'replicaOperation', 'participantRelease', 'membershipProbe', 'other']);

const replicaTypes = new Set([...Object.values(ReplicaOperationMessageType), MESSAGE_TYPE.REPLICA_OPERATION_DISPATCH]);
const replicaSources = new Set([...replicaTypes].map((type) => 'message:' + type.toLowerCase()));
replicaSources.add('replica_operation_dispatch');
replicaSources.add('coordinator_created_remote_handoff');

function familyCounters() {
  return Object.fromEntries(familyNames.map((family) => [family, {frames: 0, bytes: 0}]));
}

function deliveryFamily(source) {
  if (typeof source !== 'string') return 'other';
  if (source.startsWith('control-plane:read:') || source === 'control-plane:read') return 'controlRead';
  if (source.startsWith('control-plane:write:') || source === 'control-plane:write') return 'controlWrite';
  if (source.startsWith('query:')) return 'query';
  if (source.startsWith('cdc:') || source.startsWith('cdc_batch:') || source === 'cdc_batch' ||
      source === 'message:live_query_cdc_event') return 'cdc';
  if (source === 'message:participant_release') return 'participantRelease';
  if (source.startsWith('message:swim_')) return 'membershipProbe';
  if (source.length <= maxIdLength && replicaSources.has(source)) return 'replicaOperation';
  return 'other';
}

// The receiver can only attribute facts carried in its parsed request. Capture
// the scalar before handing the payload to application code.
export function responseRequestFamily(message) {
  const payload = message.payload;
  const type = payload?.type;
  if (typeof type === 'string' && type.length <= maxIdLength && replicaTypes.has(type)) return 'replicaOperation';
  switch (type) {
  case 'PARTICIPANT_RELEASE': return 'participantRelease';
  case 'QUERY': return 'query';
  case 'LIVE_QUERY_CDC_EVENT': return 'cdc';
  default:
    if (typeof payload?.sql === 'string') return 'query';
    if (typeof payload?.operation === 'string' && typeof payload?.tableName === 'string' ||
        Array.isArray(payload?.events)) return 'cdc';
    if (typeof message.targetAddress === 'string' && (message.targetAddress.endsWith('/service/swim-ping') ||
        message.targetAddress.endsWith('/service/swim-relay'))) return 'membershipProbe';
    return 'other';
  }
}

function copyCounts(counts) {
  return Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, {...count}]));
}

function socketState(ws) {
  let state = sockets.get(ws);
  if (!state) {
    state = {socketId: ++nextSocketId, received: {}, sent: {},
      families: {otherService: familyCounters(), serviceResponse: familyCounters()}, sendReturned: {
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

export function observeServiceSendReturned(ws, encoded, hasCdcGrant, deliverySource) {
  try {
    const state = socketState(ws);
    const bytes = typeof encoded === 'string' ? Buffer.byteLength(encoded) : encoded.byteLength;
    countReturned(hasCdcGrant ? state.sendReturned.cdcGrantService : state.sendReturned.otherService, bytes);
    if (!hasCdcGrant) countReturned(state.families.otherService[deliveryFamily(deliverySource)], bytes);
  } catch {
    // Preserve write callback and ACK custody.
  }
}

export function observeRawSend(router, ws, frame, encoded, family = 'other') {
  try {
    const state = socketState(ws);
    const counts = state.sendReturned;
    const bytes = Buffer.byteLength(encoded);
    countReturned(frame.type === FRAME.SERVICE_RESPONSE ? counts.serviceResponse : counts.routerControl,
      bytes);
    if (frame.type === FRAME.SERVICE_RESPONSE) countReturned(state.families.serviceResponse[family], bytes);
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
      applicationSendReturned: state ? copyCounts(state.sendReturned) : null,
      requestFamilySendReturned: state ? {otherService: copyCounts(state.families.otherService),
        serviceResponse: copyCounts(state.families.serviceResponse)} : null,
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
