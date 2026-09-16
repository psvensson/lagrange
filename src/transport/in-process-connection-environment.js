/**
 * The physical environment an in-process MessageRouter connection lives in.
 *
 * In-process transport has always had two physical facts baked into it: a
 * PROCESS-GLOBAL registry of listening routers keyed by port, and a socket
 * pair whose frames cross on a host microtask. Both are physics, not routing
 * policy - which router answers a dial, and how a frame reaches the peer.
 *
 * Neither belongs to the router, and a deterministic simulator needs to own
 * both: its endpoints are scenario-local (two scenarios in one process must
 * not see each other's nodes) and its frames must consume virtual time on a
 * virtual link rather than arrive on whatever microtask the host runs next.
 *
 * This module makes that environment injectable. The default IS today's
 * behavior, byte for byte: the same `INPROC.serversByPort` global and the
 * same `createInProcWebSocketPair()`. Nothing about production changes.
 *
 * The environment owns exactly four things:
 *   - endpoint registration (which router is listening on a port)
 *   - the physical dial (looking an endpoint up)
 *   - frame transport (the socket pair the two ends hold)
 *   - close and error propagation on those sockets
 *
 * It owns nothing above that line: identification, admission, rekeying,
 * reconnect suppression and self-connection all stay with the router.
 *
 * @module transport/in-process-connection-environment
 */

import {
  INPROC,
  createInProcWebSocketPair,
} from './message-router-shared-vocabulary.js';

/**
 * The process-global in-process environment: the historical behavior.
 * @type {Object}
 */
const globalInProcessConnectionEnvironment = Object.freeze({
  hasEndpoint(portKey) {
    return INPROC.serversByPort.has(portKey);
  },
  registerEndpoint(portKey, endpoint) {
    INPROC.serversByPort.set(portKey, endpoint);
  },
  releaseEndpoint(portKey) {
    INPROC.serversByPort.delete(portKey);
  },
  lookupEndpoint(portKey) {
    return INPROC.serversByPort.get(portKey);
  },
  // The dial context (`portKey`, `address`, `localNodeId`, `remoteNodeId`) is
  // physics an environment may use to route a frame; the global one needs
  // none of it, because its peers are joined directly.
  createConnectionPair() {
    const {a, b} = createInProcWebSocketPair();
    return {clientSocket: a, serverSocket: b};
  },
});

/**
 * Resolve the in-process connection environment for a router.
 * @param {Object} [options] - Router options.
 * @return {Object} the injected environment, or the process-global default.
 */
function resolveInProcessConnectionEnvironment(options = {}) {
  const provided = options.inProcessConnectionEnvironment;
  return provided && typeof provided === 'object' ?
    provided :
    globalInProcessConnectionEnvironment;
}

export {resolveInProcessConnectionEnvironment};
