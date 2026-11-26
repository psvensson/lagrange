import {LATENCY_TOPOLOGY_MESSAGE_TYPE as TOPOLOGY} from '../topology/latency-topology-constants.js';
import {ReplicaOperationMessageType} from '../rebalancer/replica-operation-constants.js';
import {RAFT_RS_MESSAGE_TYPE as RAFT} from '../raft/raft-rs-ingress-constants.js';
import {MESSAGE_TYPE} from '../constants/messages.js';
import {ROUTER_MESSAGE_TYPE as FRAME} from '../constants/transport.js';

// Fixed slots per physical WebSocket. Node IDs and connection records can
// survive a handoff; neither identifies the socket that supplied a frame.
const pairWindowMs = 12;
const intervalBounds = [1, 3, 6, 12];
const slackBounds = [1, 6, 12, 50, 250];
export function cdcStampObservationTime() {
  try {
    return performance.now();
  } catch {
    return undefined;
  }
}

function histogram(bounds) {
  return Object.fromEntries([...bounds.map(String), 'above'].map(key => [key, 0]));
}
function countBin(bins, bounds, value) {
  bins[bounds.find(bound => value <= bound) ?? 'above']++;
}

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

// Only vote and pre-vote requests/replies are counted as elections.
const raftFamilies = new Map([
  [RAFT.HEARTBEAT, 'heartbeat'], [RAFT.HEARTBEAT_RESPONSE, 'heartbeatResponse'],
  [RAFT.APPEND, 'append'], [RAFT.APPEND_RESPONSE, 'appendResponse'],
  [RAFT.REQUEST_VOTE, 'election'], [RAFT.REQUEST_VOTE_RESPONSE, 'election'],
  [RAFT.REQUEST_PRE_VOTE, 'election'], [RAFT.REQUEST_PRE_VOTE_RESPONSE, 'election'],
]);

export function consensusItemFamily(payload) {
  try {
    // The native producer supplies plain data. Never invoke an accessor a
    // second time just to classify the serialization it already produced.
    const message = Object.getOwnPropertyDescriptor(payload, 'message')?.value;
    const type = message && Object.getOwnPropertyDescriptor(message, 'msgType')?.value;
    return raftFamilies.get(type) ?? 'other';
  } catch {
    return 'other';
  }
}

function consensusBatchCounters() {
  const families = {};
  for (const name of [...raftFamilies.values(), 'other']) families[name] = {items: 0, entryBytes: 0};
  return {singleItemFrames: 0, multiItemFrames: 0, items: 0, families};
}

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
    state = {socketId: ++nextSocketId, received: {}, sent: {}, consensusBatches: consensusBatchCounters(),
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
    if (frame.type === FRAME.ACK || frame.type === FRAME.SERVICE_RESPONSE) state.unmatched = null;
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

export function observeConsensusSendReturned(ws, batchBytes, items) {
  try {
    const state = socketState(ws);
    interruptPair(state, 0, false);
    countReturned(state.sendReturned.consensus, batchBytes);
    const counts = state.consensusBatches;
    if (items.length === 1) counts.singleItemFrames += 1;
    else counts.multiItemFrames += 1;
    counts.items += items.length;
    for (const item of items) {
      const family = counts.families[item.family];
      family.items += 1;
      family.entryBytes += item.entryBytes;
    }
  } catch {
    // Diagnostics have no delivery authority.
  }
}

// Successful write returns only. One unmatched range per socket; every other
// observed outbound frame breaks adjacency. No payload, grant or timer is owned.
function interruptPair(state, at, urgent) {
  if (!state.unmatched) return;
  if (urgent && at - state.unmatched.at <= pairWindowMs) state.pairs.nearbyControl++;
  state.unmatched = null;
}

function observedSourcePartition(payload) {
  const data = (object, key) => Object.getOwnPropertyDescriptor(object, key)?.value;
  const type = data(payload, 'type');
  const events = type === TOPOLOGY.CDC_PROPAGATION_BATCH ? data(payload, 'events') : null;
  if (type !== TOPOLOGY.CDC_PROPAGATION && !Array.isArray(events)) return null;
  // Bound diagnostic work even for an unusually large batch. Mixed ranges
  // cannot establish partition independence from their first member alone.
  if (events && (!events.length || events.length > 16)) return null;
  const first = events ? data(events, '0') : payload;
  const partition = first && data(first, 'sourcePartition');
  if (typeof partition !== 'string' || !partition.length || partition.length > maxIdLength) return null;
  for (let index = 1; events && index < events.length; index++) {
    const event = data(events, index);
    if (!event || data(event, 'sourcePartition') !== partition) return null;
  }
  return partition;
}

function observeRange(state, payload, context, address, start, remaining, signal) {
  const at = performance.now();
  const previous = state.unmatched;
  state.unmatched = null;
  if (!context || !Number.isFinite(start) || !Number.isFinite(remaining) ||
      typeof address !== 'string' || address.length > 256 || !context.signal || !signal) return;
  const partition = observedSourcePartition(payload);
  if (!partition) return;
  const counts = state.pairs ??= {identifiedRanges: 0, disjointPairs: 0, nearbyControl: 0,
    intervalMsLe: histogram(intervalBounds), pairMinSlackMsLe: histogram(slackBounds)};
  counts.identifiedRanges++;
  const deadline = start + remaining;
  if (deadline <= at || context.signal.aborted || signal.aborted) return;
  if (previous && previous.partition !== partition && previous.address === address &&
      previous.signal.deref()?.aborted === false && previous.source.deref()?.aborted === false &&
      previous.source.deref() !== context.signal) {
    const gap = at - previous.at;
    const slack = Math.min(deadline, previous.deadline) - at;
    if (gap <= pairWindowMs && slack > 0) {
      counts.disjointPairs++;
      countBin(counts.intervalMsLe, intervalBounds, gap);
      countBin(counts.pairMinSlackMsLe, slackBounds, slack);
      return;
    }
  }
  state.unmatched = {partition, address, at: start, deadline, signal: new WeakRef(signal), source: new WeakRef(context.signal)};
}

export function observeServiceSendReturned(ws, encoded, hasCdcGrant, deliverySource, payload, context,
  address, stampStart, remaining, signal) {
  try {
    const state = socketState(ws);
    const bytes = typeof encoded === 'string' ? Buffer.byteLength(encoded) : encoded.byteLength;
    countReturned(hasCdcGrant ? state.sendReturned.cdcGrantService : state.sendReturned.otherService, bytes);
    if (hasCdcGrant) observeRange(state, payload, context, address, stampStart, remaining, signal);
    else {
      interruptPair(state, 0, false);
      countReturned(state.families.otherService[deliveryFamily(deliverySource)], bytes);
    }
  } catch {
    // Preserve write callback and ACK custody.
  }
}

export function observeRawSend(router, ws, frame, encoded, family = 'other') {
  try {
    const state = socketState(ws);
    if (state.unmatched) interruptPair(state, performance.now(), frame.type === FRAME.PING || frame.type === FRAME.PONG);
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
      partialCdcRangeSendReturned: state?.pairs ? {...state.pairs,
        intervalMsLe: {...state.pairs.intervalMsLe}, pairMinSlackMsLe: {...state.pairs.pairMinSlackMsLe}} : null,
      consensusBatchSendReturned: state ? {...state.consensusBatches,
        families: copyCounts(state.consensusBatches.families)} : null,
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
