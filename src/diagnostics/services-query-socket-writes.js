// Bounded census of primary router WebSocket submissions. Counters describe
// encoded application bytes handed to ws before the cut, independently of
// buffering, compression, the write callback, and TCP acknowledgements.
import {Buffer} from 'node:buffer';
import {ADDRESS, ENTITY_TYPE} from '../constants/addresses.js';
import {ROUTER_MESSAGE_TYPE} from '../constants/transport.js';
import {isRaftTransportPayload} from '../raft/raft-packet-utils.js';
import {LATENCY_TOPOLOGY_MESSAGE_TYPE} from '../topology/latency-topology-constants.js';

const MAX_SOCKETS = 32;
const MAX_FRAMES_PER_SOCKET = 200_000;
const MAX_BYTES_PER_SOCKET = 64 * 1024 ** 3;
const PARTITION_ADDRESS_SEGMENT = ADDRESS.SEPARATOR + ENTITY_TYPE.PARTITION +
  ADDRESS.SEPARATOR;
const SERVICES_REPLICA_ADDRESS = /\/partition\/services-p1-r[0-9]+$/;
const SHARED_SERVICES_SNAPSHOT_SQL = 'SELECT * FROM services WHERE service_type = \'partition\'';

const FAMILY = Object.freeze({
  SERVICES_SHARED_SHAPE: 'sharedServicesSnapshot',
  SERVICES_OTHER: 'otherServicesQuery',
  PARTITION_QUERY: 'otherPartitionQuery',
  RAFT: 'raft',
  CDC: 'cdc',
  ROUTER_CONTROL: 'routerControl',
  OTHER: 'other',
});
const FAMILIES = Object.values(FAMILY);
const CENSUS = Object.freeze({
  EMPTY: 'empty',
  COLLECTING: 'collecting',
  SOCKET_LIMIT: 'socket_limit',
  SUBMISSION_LIMIT: 'submission_limit',
});
const FRAMES_SUFFIX = 'Frames';
const ENCODED_BYTES_SUFFIX = 'EncodedBytes';

function queryRequest(payload, messageId) {
  return payload?.messageId === messageId ? payload.payload : payload;
}

function servicesQueryShape(request) {
  // Exact producer shape only. The recorder and runtime refresh share it.
  return request.sql === SHARED_SERVICES_SNAPSHOT_SQL &&
    Array.isArray(request.params) && request.params.length === 0 ?
    FAMILY.SERVICES_SHARED_SHAPE : FAMILY.SERVICES_OTHER;
}

function serviceWriteFamily(router, address, payload, messageId) {
  const request = queryRequest(payload, messageId);
  if (typeof address === 'string' && address.includes(PARTITION_ADDRESS_SEGMENT) &&
      router.isQueryDataPlaneMessage(request)) {
    return SERVICES_REPLICA_ADDRESS.test(address) ?
      servicesQueryShape(request) : FAMILY.PARTITION_QUERY;
  }
  if (isRaftTransportPayload(request)) return FAMILY.RAFT;
  if (request?.type === LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION ||
      request?.type === LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH) return FAMILY.CDC;
  return FAMILY.OTHER;
}

function writeFamily(router, message, replyFamily) {
  if (message.type === ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE) {
    return serviceWriteFamily(router, message.targetAddress, message.payload, message.messageId);
  }
  if (message.type === ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE) return replyFamily ?? FAMILY.OTHER;
  return FAMILY.ROUTER_CONTROL;
}

function socketFields(ws) {
  // ws exposes bufferedAmount publicly. Its underlying net.Socket supplies
  // the endpoints and stream counters; absence (e.g. in-process) stays null.
  const socket = ws?._socket;
  if (!socket) return {tcpSocketObserved: false};
  return {
    tcpSocketObserved: true,
    tcpLocalAddress: socket.localAddress,
    tcpLocalPort: socket.localPort,
    tcpRemoteAddress: socket.remoteAddress,
    tcpRemotePort: socket.remotePort,
    wsBufferedAmount: ws.bufferedAmount,
    socketWritableLength: socket.writableLength,
    socketBytesWritten: socket.bytesWritten,
    socketBytesRead: socket.bytesRead,
  };
}

class ServicesQuerySocketWrites {
  sockets = new WeakMap();
  socketCount = 0;

  snapshot(ws) {
    const state = this.sockets.get(ws);
    return {
      ...socketFields(ws),
      submissionCensus: state?.census ??
        (this.socketCount >= MAX_SOCKETS ? CENSUS.SOCKET_LIMIT : CENSUS.EMPTY),
      censusStartedAtMs: state?.startedAtMs,
      submittedFrames: state?.frames ?? 0,
      submittedEncodedBytes: state?.bytes ?? 0,
      ...state?.families,
    };
  }

  record(router, ws, bytes, message, replyFamily, capture) {
    const state = this.getOrRegister(ws);
    const encodedBytes = Buffer.isBuffer(bytes) ? bytes.byteLength : Buffer.byteLength(bytes);
    const before = capture ? this.snapshot(ws) : null;
    if (state?.census === CENSUS.COLLECTING) {
      this.advance(state, encodedBytes, writeFamily(router, message, replyFamily));
    }
    return before && {encodedBytes, ...before};
  }

  getOrRegister(ws) {
    const state = this.sockets.get(ws);
    if (state || this.socketCount >= MAX_SOCKETS) return state;
    const families = Object.fromEntries(FAMILIES.flatMap((family) =>
      [[family + FRAMES_SUFFIX, 0], [family + ENCODED_BYTES_SUFFIX, 0]]));
    const newState = {
      startedAtMs: Date.now(), frames: 0, bytes: 0, families, census: CENSUS.COLLECTING,
    };
    this.socketCount += 1;
    this.sockets.set(ws, newState);
    return newState;
  }

  advance(state, bytes, family) {
    if (state.frames === MAX_FRAMES_PER_SOCKET || state.bytes + bytes > MAX_BYTES_PER_SOCKET) {
      state.census = CENSUS.SUBMISSION_LIMIT;
      return;
    }
    state.frames += 1;
    state.bytes += bytes;
    state.families[family + FRAMES_SUFFIX] += 1;
    state.families[family + ENCODED_BYTES_SUFFIX] += bytes;
  }
}

export {ServicesQuerySocketWrites, serviceWriteFamily, queryRequest, SERVICES_REPLICA_ADDRESS,
  socketFields};
