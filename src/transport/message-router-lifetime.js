import {ROUTER_ERROR_MSG, TRANSPORT_EVENT} from '../constants/transport.js';

const abortSignalAny = globalThis.AbortSignal.any.bind(globalThis.AbortSignal);

/**
 * MessageRouter's transport lifetime, not a retry or caller-cancellation owner.
 * A captured lifetime never reopens. Explicit router initialization may replace
 * it only after its shutdown has completed. Sockets belong from allocation to
 * close, including connecting and superseded sockets outside the peer map.
 */
class MessageRouterLifetime {
  constructor() {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.sockets = new Set();
    this.shutdownPromise = null;
    this.shutdownComplete = false;
    this.initializationPromise = null;
  }

  assertOpen() {
    this.signal.throwIfAborted();
  }

  ownSocket(ws) {
    this.assertOpen();
    if (this.sockets.has(ws)) return;
    this.sockets.add(ws);
    ws.once(TRANSPORT_EVENT.CLOSE, () => this.sockets.delete(ws));
  }

  retire() {
    this.controller.abort(new Error(ROUTER_ERROR_MSG.SHUTDOWN));
  }

  deliverySignal(callerSignal) {
    this.assertOpen();
    return callerSignal ? abortSignalAny([this.signal, callerSignal]) : this.signal;
  }
}

export {MessageRouterLifetime};
