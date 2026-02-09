/**
 * In-process transport for test environments.
 *
 * Provides WebSocket-like communication between MessageRouter instances
 * within the same process, enabling fast and deterministic testing without
 * actual network I/O.
 *
 * Requirements: 1.2, 1.8
 *
 * @module transport/inproc-transport
 */

import {EventEmitter} from 'events';
import WebSocket from 'ws';
import {TRANSPORT_EVENT} from '../constants/transport.js';

// queueMicrotask is a global in Node.js, but ESLint doesn't know about it
const queueMicrotaskFn = globalThis.queueMicrotask;

/**
 * Global registry for in-process servers.
 * This is only enabled when explicitly requested via options.inProcess
 * to avoid hidden behavior in production.
 * @type {Object}
 */
const INPROC = globalThis.__DDB_INPROC_MESSAGE_ROUTER__ ||= {
  serversByPort: new Map(), // port -> {router, nodeId}
};

/**
 * In-process WebSocket implementation for testing.
 *
 * Provides a WebSocket-compatible interface that delivers messages
 * synchronously within the same process. Used by MessageRouter when
 * inProcess mode is enabled.
 *
 * @interface
 * @extends EventEmitter
 *
 * @description
 * InProcWebSocket mimics the WebSocket API but delivers messages via
 * microtasks instead of network I/O. This enables deterministic testing
 * and faster test execution.
 *
 * Key features:
 * - WebSocket-compatible readyState property
 * - Peer-to-peer message delivery via microtasks
 * - Automatic close propagation to peer
 *
 * @example
 * const {a, b} = createInProcWebSocketPair();
 * a.on('message', (data) => console.log('A received:', data));
 * b.send('Hello from B');
 */
class InProcWebSocket extends EventEmitter {
  /**
   * Create a new InProcWebSocket instance.
   */
  constructor() {
    super();
    /** @type {number} WebSocket readyState constant */
    this.readyState = WebSocket.CONNECTING;
    /** @type {InProcWebSocket|null} Peer socket for message delivery */
    this._peer = null;
  }

  /**
   * Set the peer socket for bidirectional communication.
   * @param {InProcWebSocket} peer - The peer socket.
   * @private
   */
  _setPeer(peer) {
    this._peer = peer;
  }

  /**
   * Transition to OPEN state and emit open event.
   * @private
   */
  _open() {
    this.readyState = WebSocket.OPEN;
    queueMicrotaskFn(() => this.emit(TRANSPORT_EVENT.OPEN));
  }

  /**
   * Send data to the peer socket.
   * Messages are delivered asynchronously via microtask to preserve
   * ordering without recursion.
   * @param {string|Buffer} data - Data to send.
   */
  send(data) {
    if (this.readyState !== WebSocket.OPEN || !this._peer) {
      return;
    }
    // Deliver asynchronously to preserve ordering without recursion.
    queueMicrotaskFn(() => {
      if (this._peer.readyState === WebSocket.OPEN) {
        this._peer.emit(TRANSPORT_EVENT.MESSAGE, data);
      }
    });
  }

  /**
   * Close the connection gracefully.
   * Alias for terminate().
   */
  close() {
    this.terminate();
  }

  /**
   * Terminate the connection immediately.
   * Also terminates the peer connection if still open.
   */
  terminate() {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }
    this.readyState = WebSocket.CLOSED;
    queueMicrotaskFn(() => this.emit(TRANSPORT_EVENT.CLOSE));
    if (this._peer && this._peer.readyState !== WebSocket.CLOSED) {
      this._peer.readyState = WebSocket.CLOSED;
      queueMicrotaskFn(() => this._peer.emit(TRANSPORT_EVENT.CLOSE));
    }
  }
}

/**
 * Create a pair of connected in-process WebSockets.
 *
 * Returns two InProcWebSocket instances that are connected to each other.
 * Messages sent on one socket are delivered to the other.
 *
 * @return {{a: InProcWebSocket, b: InProcWebSocket}} Connected socket pair.
 *
 * @example
 * const {a, b} = createInProcWebSocketPair();
 * a.on('message', (data) => console.log('A received:', data));
 * b.on('message', (data) => console.log('B received:', data));
 * a.send('Hello from A'); // B receives this
 * b.send('Hello from B'); // A receives this
 */
function createInProcWebSocketPair() {
  const a = new InProcWebSocket();
  const b = new InProcWebSocket();
  a._setPeer(b);
  b._setPeer(a);
  a._open();
  b._open();
  return {a, b};
}

export {
  INPROC,
  InProcWebSocket,
  createInProcWebSocketPair,
};
