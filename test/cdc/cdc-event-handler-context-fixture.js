/**
 * The one CDCEventHandler event-context fixture. It carries every port the
 * CDC integration service's createEventHandlerContext supplies; the address
 * port is the real resolver (resolveNodeWebSocketAddress) over a real
 * SystemTableCache, exactly as the production context binds it, unless a test
 * substitutes that seam. Collaborators (epoch manager, rebalancer, router)
 * are the test's own.
 */
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {resolveNodeWebSocketAddress} from
  '../../src/transport/node-address-resolution.js';

/**
 * @param {Object} [overrides]
 * @param {Object} [overrides.systemTableCache] - Cache the address port reads.
 * @param {Function} [overrides.resolveNodeWebSocketAddress] - Seam substitute.
 * @return {Object} Event context; `events` records emitted events and
 *   `getNodeStateChanges()` counts node-state changes.
 */
function createCdcEventHandlerContext(overrides = {}) {
  const events = [];
  let nodeStateChanges = 0;
  const systemTableCache = overrides.systemTableCache ?? new SystemTableCache();
  return {
    epochManager: overrides.epochManager ?? null,
    rebalancer: overrides.rebalancer ?? null,
    messageRouter: overrides.messageRouter ?? null,
    events,
    emit(eventName, data) {
      events.push({eventName, data});
    },
    incrementEpochChanges: overrides.incrementEpochChanges ?? (() => {}),
    incrementNodeStateChanges: overrides.incrementNodeStateChanges ??
      (() => nodeStateChanges++),
    getNodeStateChanges: () => nodeStateChanges,
    resolveNodeWebSocketAddress: overrides.resolveNodeWebSocketAddress ??
      ((targetNodeId) =>
        resolveNodeWebSocketAddress({targetNodeId, systemTableCache})),
  };
}

export {createCdcEventHandlerContext};
