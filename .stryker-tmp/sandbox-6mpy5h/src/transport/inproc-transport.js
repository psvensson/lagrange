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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { TRANSPORT_EVENT } from '../constants/transport.js';

// queueMicrotask is a global in Node.js, but ESLint doesn't know about it
const queueMicrotaskFn = globalThis.queueMicrotask;

/**
 * Global registry for in-process servers.
 * This is only enabled when explicitly requested via options.inProcess
 * to avoid hidden behavior in production.
 * @type {Object}
 */
const INPROC = stryMutAct_9fa48("155190") ? globalThis.__DDB_INPROC_MESSAGE_ROUTER__ &&= {
  serversByPort: new Map() // port -> {router, nodeId}
} : (stryCov_9fa48("155190"), globalThis.__DDB_INPROC_MESSAGE_ROUTER__ ||= stryMutAct_9fa48("155191") ? {} : (stryCov_9fa48("155191"), {
  serversByPort: new Map() // port -> {router, nodeId}
}));

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
    if (stryMutAct_9fa48("155192")) {
      {}
    } else {
      stryCov_9fa48("155192");
      super();
      /** @type {number} WebSocket readyState constant */
      this.readyState = WebSocket.CONNECTING;
      /** @type {InProcWebSocket|null} Peer socket for message delivery */
      this._peer = null;
    }
  }

  /**
   * Set the peer socket for bidirectional communication.
   * @param {InProcWebSocket} peer - The peer socket.
   * @private
   */
  _setPeer(peer) {
    if (stryMutAct_9fa48("155193")) {
      {}
    } else {
      stryCov_9fa48("155193");
      this._peer = peer;
    }
  }

  /**
   * Transition to OPEN state and emit open event.
   * @private
   */
  _open() {
    if (stryMutAct_9fa48("155194")) {
      {}
    } else {
      stryCov_9fa48("155194");
      this.readyState = WebSocket.OPEN;
      queueMicrotaskFn(stryMutAct_9fa48("155195") ? () => undefined : (stryCov_9fa48("155195"), () => this.emit(TRANSPORT_EVENT.OPEN)));
    }
  }

  /**
   * Send data to the peer socket.
   * Messages are delivered asynchronously via microtask to preserve
   * ordering without recursion.
   * @param {string|Buffer} data - Data to send.
   */
  send(data) {
    if (stryMutAct_9fa48("155196")) {
      {}
    } else {
      stryCov_9fa48("155196");
      if (stryMutAct_9fa48("155199") ? this.readyState !== WebSocket.OPEN && !this._peer : stryMutAct_9fa48("155198") ? false : stryMutAct_9fa48("155197") ? true : (stryCov_9fa48("155197", "155198", "155199"), (stryMutAct_9fa48("155201") ? this.readyState === WebSocket.OPEN : stryMutAct_9fa48("155200") ? false : (stryCov_9fa48("155200", "155201"), this.readyState !== WebSocket.OPEN)) || (stryMutAct_9fa48("155202") ? this._peer : (stryCov_9fa48("155202"), !this._peer)))) {
        if (stryMutAct_9fa48("155203")) {
          {}
        } else {
          stryCov_9fa48("155203");
          return;
        }
      }
      // Deliver asynchronously to preserve ordering without recursion.
      queueMicrotaskFn(() => {
        if (stryMutAct_9fa48("155204")) {
          {}
        } else {
          stryCov_9fa48("155204");
          if (stryMutAct_9fa48("155207") ? this._peer.readyState !== WebSocket.OPEN : stryMutAct_9fa48("155206") ? false : stryMutAct_9fa48("155205") ? true : (stryCov_9fa48("155205", "155206", "155207"), this._peer.readyState === WebSocket.OPEN)) {
            if (stryMutAct_9fa48("155208")) {
              {}
            } else {
              stryCov_9fa48("155208");
              this._peer.emit(TRANSPORT_EVENT.MESSAGE, data);
            }
          }
        }
      });
    }
  }

  /**
   * Close the connection gracefully.
   * Alias for terminate().
   */
  close() {
    if (stryMutAct_9fa48("155209")) {
      {}
    } else {
      stryCov_9fa48("155209");
      this.terminate();
    }
  }

  /**
   * Terminate the connection immediately.
   * Also terminates the peer connection if still open.
   */
  terminate() {
    if (stryMutAct_9fa48("155210")) {
      {}
    } else {
      stryCov_9fa48("155210");
      if (stryMutAct_9fa48("155213") ? this.readyState !== WebSocket.CLOSED : stryMutAct_9fa48("155212") ? false : stryMutAct_9fa48("155211") ? true : (stryCov_9fa48("155211", "155212", "155213"), this.readyState === WebSocket.CLOSED)) {
        if (stryMutAct_9fa48("155214")) {
          {}
        } else {
          stryCov_9fa48("155214");
          return;
        }
      }
      this.readyState = WebSocket.CLOSED;
      queueMicrotaskFn(stryMutAct_9fa48("155215") ? () => undefined : (stryCov_9fa48("155215"), () => this.emit(TRANSPORT_EVENT.CLOSE)));
      if (stryMutAct_9fa48("155218") ? this._peer || this._peer.readyState !== WebSocket.CLOSED : stryMutAct_9fa48("155217") ? false : stryMutAct_9fa48("155216") ? true : (stryCov_9fa48("155216", "155217", "155218"), this._peer && (stryMutAct_9fa48("155220") ? this._peer.readyState === WebSocket.CLOSED : stryMutAct_9fa48("155219") ? true : (stryCov_9fa48("155219", "155220"), this._peer.readyState !== WebSocket.CLOSED)))) {
        if (stryMutAct_9fa48("155221")) {
          {}
        } else {
          stryCov_9fa48("155221");
          this._peer.readyState = WebSocket.CLOSED;
          queueMicrotaskFn(stryMutAct_9fa48("155222") ? () => undefined : (stryCov_9fa48("155222"), () => this._peer.emit(TRANSPORT_EVENT.CLOSE)));
        }
      }
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
  if (stryMutAct_9fa48("155223")) {
    {}
  } else {
    stryCov_9fa48("155223");
    const a = new InProcWebSocket();
    const b = new InProcWebSocket();
    a._setPeer(b);
    b._setPeer(a);
    a._open();
    b._open();
    return stryMutAct_9fa48("155224") ? {} : (stryCov_9fa48("155224"), {
      a,
      b
    });
  }
}
export { INPROC, InProcWebSocket, createInProcWebSocketPair };