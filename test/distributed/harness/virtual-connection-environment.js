// A VirtualNetwork-backed physical environment for in-process MessageRouter
// connections.
//
// This is the simulator's half of the `inProcessConnectionEnvironment` seam.
// It replaces two pieces of physics and nothing else:
//
//   - the ENDPOINT REGISTRY. The production default is a process global
//     (`INPROC.serversByPort`), so two scenarios running in one process would
//     dial each other's nodes. Every environment built here owns its own
//     registry, so a scenario's endpoints are visible only inside it.
//
//   - the FRAME TRANSPORT. The production default hands a frame to the peer
//     on a host microtask, which makes delivery order a property of the host
//     event loop. Here every frame - IDENTIFY included - is enqueued on the
//     VirtualNetwork as an ordinary message event and consumes the link's
//     virtual delay. Nothing arrives because the host got there first.
//
// What this deliberately does NOT model: TCP handshake latency, backpressure,
// fragmentation, half-open sockets, or a second copy of the link semantics
// the VirtualNetwork already owns. The PHYSICAL open is immediate - the
// socket pair exists the instant the dial resolves - because the dial is a
// local process operation. Everything logical that follows (IDENTIFY,
// admission, rekeying, service dispatch, ACK) crosses the link.
//
// It also owns nothing above the physical line. Identification, admission,
// reconnect suppression and self-connection handling stay with the router;
// a frame's arrival is the only thing this environment decides.
import {EventEmitter} from 'node:events';

import {TRANSPORT_EVENT} from '../../../src/constants/transport.js';

// The ws readyState contract the router reads, restated rather than imported,
// so the harness never depends on the ws package being loadable.
const SOCKET_STATE = Object.freeze({CONNECTING: 0, OPEN: 1, CLOSED: 3});

// Frame and FIN travel as ordinary VirtualNetwork messages, so a close can
// never overtake a frame that was sent before it.
const VIRTUAL_LINK_FRAME_TYPE = 'transport_frame';
const VIRTUAL_LINK_CLOSE_TYPE = 'transport_close';

const queueMicrotaskFn = globalThis.queueMicrotask;

/**
 * One end of a virtual in-process link.
 *
 * Interface-compatible with the InProcWebSocket the router already accepts:
 * `readyState`, `send`, `close`, `terminate`, and the message/close/error
 * events. The difference is where `send` puts the frame.
 */
class VirtualLinkSocket extends EventEmitter {
  constructor({link, endId}) {
    super();
    this.readyState = SOCKET_STATE.CONNECTING;
    this._link = link;
    this._endId = endId;
  }
  _peer() {
    return this._link.peerOf(this._endId);
  }
  _open() {
    this.readyState = SOCKET_STATE.OPEN;
    queueMicrotaskFn(() => this.emit(TRANSPORT_EVENT.OPEN));
  }
  send(data) {
    if (this.readyState !== SOCKET_STATE.OPEN) return;
    this._link.transmit(this._endId, data);
  }
  close() {
    this.terminate();
  }
  terminate() {
    if (this.readyState === SOCKET_STATE.CLOSED) return;
    this.readyState = SOCKET_STATE.CLOSED;
    queueMicrotaskFn(() => this.emit(TRANSPORT_EVENT.CLOSE));
    // The far end learns over the link, behind anything already in flight.
    this._link.transmitClose(this._endId);
  }
  // Delivery entry point: only the environment's own network handler calls it.
  _deliver(data) {
    if (this.readyState !== SOCKET_STATE.OPEN) return;
    this.emit(TRANSPORT_EVENT.MESSAGE, data);
  }
  _remoteClosed() {
    if (this.readyState === SOCKET_STATE.CLOSED) return;
    this.readyState = SOCKET_STATE.CLOSED;
    this.emit(TRANSPORT_EVENT.CLOSE);
  }
}

/**
 * Create a scenario-local in-process connection environment backed by a
 * VirtualNetwork.
 *
 * @param {Object} options - {network, linkDelayMs}.
 * @return {Object} {environment, handleMessage, endpoints, linkCount, frameCount}.
 */
function createVirtualConnectionEnvironment({
  network, linkDelayMs = 0, observe = null,
} = {}) {
  if (!network) throw new Error('a virtual connection environment needs a network');
  // Capture only, and in LINK vocabulary: an endpoint bound, a socket opened,
  // a frame moved between two nodes. What a frame means is the router's to
  // decide, so nothing here reads a payload. The observer may not schedule,
  // await or advance anything, and the environment does not check whether one
  // is present before doing its work.
  const report = typeof observe === 'function' ? observe : () => undefined;
  const endpoints = new Map();
  const links = new Map();
  const socketsByEndId = new Map();
  let nextLinkId = 0;
  let frameCount = 0;

  function makeLink({clientNodeId, serverNodeId}) {
    const linkId = `link-${++nextLinkId}`;
    const ends = {
      [`${linkId}:client`]: {nodeId: clientNodeId, peer: `${linkId}:server`},
      [`${linkId}:server`]: {nodeId: serverNodeId, peer: `${linkId}:client`},
    };
    const link = {
      linkId,
      peerOf(endId) {
        return socketsByEndId.get(ends[endId].peer) || null;
      },
      transmit(endId, data) {
        const end = ends[endId];
        frameCount += 1;
        report({
          kind: 'frame_enqueued', frameKind: 'data',
          fromNodeId: end.nodeId, toNodeId: ends[end.peer].nodeId,
        });
        network.send({
          from: end.nodeId,
          to: ends[end.peer].nodeId,
          type: VIRTUAL_LINK_FRAME_TYPE,
          delayMs: linkDelayMs,
          payload: {targetEndId: end.peer, data},
        });
      },
      transmitClose(endId) {
        const end = ends[endId];
        report({
          kind: 'frame_enqueued', frameKind: 'close',
          fromNodeId: end.nodeId, toNodeId: ends[end.peer].nodeId,
        });
        network.send({
          from: end.nodeId,
          to: ends[end.peer].nodeId,
          type: VIRTUAL_LINK_CLOSE_TYPE,
          delayMs: linkDelayMs,
          payload: {targetEndId: end.peer},
        });
      },
    };
    links.set(linkId, link);
    const clientSocket = new VirtualLinkSocket({link, endId: `${linkId}:client`});
    const serverSocket = new VirtualLinkSocket({link, endId: `${linkId}:server`});
    socketsByEndId.set(`${linkId}:client`, clientSocket);
    socketsByEndId.set(`${linkId}:server`, serverSocket);
    clientSocket._open();
    serverSocket._open();
    report({
      kind: 'physical_socket_open',
      fromNodeId: clientNodeId, toNodeId: serverNodeId,
    });
    return {clientSocket, serverSocket};
  }

  const environment = {
    hasEndpoint(portKey) {
      return endpoints.has(portKey);
    },
    registerEndpoint(portKey, endpoint) {
      endpoints.set(portKey, endpoint);
      report({kind: 'virtual_endpoint_registered', nodeId: endpoint.nodeId});
    },
    releaseEndpoint(portKey) {
      const endpoint = endpoints.get(portKey);
      endpoints.delete(portKey);
      report({
        kind: 'virtual_endpoint_released', nodeId: endpoint?.nodeId ?? null,
      });
    },
    lookupEndpoint(portKey) {
      return endpoints.get(portKey);
    },
    createConnectionPair({localNodeId, remoteNodeId} = {}) {
      // No same-node shortcut: a link between two runtimes co-hosted on one
      // node is still a link, and its frames still cross the network.
      report({
        kind: 'dial_started', fromNodeId: localNodeId, toNodeId: remoteNodeId,
      });
      return makeLink({clientNodeId: localNodeId, serverNodeId: remoteNodeId});
    },
  };

  // Claim the environment's own frames out of the scenario's node handler
  // chain, exactly as a cohort does.
  function handleMessage(nodeId, message) {
    if (message.type === VIRTUAL_LINK_FRAME_TYPE) {
      report({
        kind: 'frame_delivered', frameKind: 'data',
        fromNodeId: message.from ?? null, toNodeId: nodeId,
      });
      socketsByEndId.get(message.payload.targetEndId)
        ?._deliver(message.payload.data);
      return true;
    }
    if (message.type === VIRTUAL_LINK_CLOSE_TYPE) {
      report({
        kind: 'frame_delivered', frameKind: 'close',
        fromNodeId: message.from ?? null, toNodeId: nodeId,
      });
      socketsByEndId.get(message.payload.targetEndId)?._remoteClosed();
      return true;
    }
    return false;
  }

  return {
    environment,
    handleMessage,
    endpoints,
    linkCount: () => links.size,
    frameCount: () => frameCount,
  };
}

export {
  createVirtualConnectionEnvironment,
  VIRTUAL_LINK_FRAME_TYPE,
};
