/**
 * The authorities a node runtime owns rather than shares: its thread manager,
 * its clock, and its node-local system-table cache.
 *
 * Each of these used to be resolved from a process singleton or read straight
 * off the host, which is correct while one process hosts one node and wrong
 * the moment it hosts several - the runtimes then report each other's thread
 * pool, each other's time, and each other's cached rows as their own
 * node-local evidence. They are gathered here so the answer to "whose is
 * this?" has one place to live.
 *
 * Every default is what it always was, so single-node deployment is
 * unchanged.
 *
 * @module node/node-runtime-local-authorities
 */

import {createReadOnlyCache} from '../cache/read-only-system-table-cache.js';
import {SystemTableCache} from '../cache/system-table-cache.js';
import {ServiceThreadManager} from '../threading/service-thread-manager.js';
import {resolveTimeSource} from '../time/time-source.js';

const LOCAL_STR_FUNCTION = 'function';
const CACHE_ID_PREFIX = 'node-';
const CACHE_ID_SUFFIX = '-system-table-cache';

/**
 * A node runtime's clock, in the order of who owns the answer: an explicit
 * initialize option first (the long-standing seam), then the clock the runtime
 * was constructed with, then the host.
 * @param {Object} options - initialize() options.
 * @param {Function|null} runtimeNow - the clock the runtime holds, if any.
 * @return {Function} the clock this runtime reads.
 */
function resolveNodeServiceClock(options, runtimeNow) {
  if (typeof options.now === LOCAL_STR_FUNCTION) {
    return options.now;
  }
  return typeof runtimeNow === LOCAL_STR_FUNCTION ? runtimeNow : Date.now;
}

/**
 * Resolved at initialize time, not construction: the process singleton is
 * created on demand, and constructing a NodeService must not bring one into
 * existence for a runtime that was handed its own.
 * @param {Object|null} providedThreadManager - the runtime's own manager.
 * @return {Object} the thread manager this runtime uses.
 */
function resolveNodeServiceThreadManager(providedThreadManager) {
  return providedThreadManager || ServiceThreadManager.getInstance();
}

/**
 * The runtime's TimeSource. Node-local collaborators that stamp or schedule
 * on this node's behalf read it, so one runtime's evidence is never another
 * runtime's - or the host's - time.
 * @param {Object|null} providedTimeSource - the runtime's own source.
 * @return {Object} a TimeSource; a real one unless supplied.
 */
function resolveNodeRuntimeTimeSource(providedTimeSource) {
  return resolveTimeSource({timeSource: providedTimeSource || undefined});
}

/**
 * Whether this runtime was SUPPLIED a clock, answered as that clock or null.
 *
 * Resolving a real clock is not the same as being given one. A runtime that
 * resolved its own may stamp on it, because a real source answers exactly as
 * the host clock did. But only a clock that was actually GIVEN may be handed
 * to a collaborator that would otherwise schedule for itself - a replica's
 * consensus timers, a coalescing hop, a reconciler's per-action turn -
 * because substituting a real TimeSource there changes which mechanism
 * schedules, not just which clock it reads. This is the one place that
 * question is answered; no consumer infers it from a TimeSource's type or
 * identity.
 * @param {Object} runtime - the NodeService.
 * @return {Object|null} the supplied clock, or null.
 */
function readNodeRuntimeSuppliedTimeSource(runtime) {
  return runtime?.providedTimeSource || null;
}

/**
 * This node's own system-table cache. It reads this node's clock, and its
 * diagnostic identity names the node rather than the instant it happened to
 * be constructed at - one cache per node, so the name is unique wherever the
 * old timestamp was.
 * @param {Object} runtime - {nodeId, timeSource}.
 * @return {SystemTableCache} the node-local cache.
 */
function createNodeLocalSystemTableCache({nodeId, timeSource, ownsClock}) {
  return new SystemTableCache({
    timeSource,
    cacheId: `${CACHE_ID_PREFIX}${nodeId}${CACHE_ID_SUFFIX}`,
    // The cache-change hop is a next turn on THIS node. A node that owns a
    // clock takes it there; one that does not keeps setImmediate, because a
    // zero-delay timer is a different event-loop phase and swapping one for
    // the other would change production's ordering.
    ...(ownsClock ?
      {
        scheduleCacheChangeNotification: (callback) =>
          timeSource.setTimeout(callback, 0),
      } :
      {}),
  });
}

/**
 * Create this node's cache on first access and bind its read-only view. The
 * cache is a singleton per node: only the first call constructs.
 * @param {Object} runtime - the NodeService.
 * @return {SystemTableCache} the node-local cache.
 */
function ensureNodeLocalSystemTableCache(runtime) {
  if (runtime._systemTableCache) {
    return runtime._systemTableCache;
  }
  const cache = createNodeLocalSystemTableCache({
    nodeId: runtime.nodeId,
    timeSource: runtime.getTimeSource(),
    ownsClock: Boolean(readNodeRuntimeSuppliedTimeSource(runtime)),
  });
  runtime._systemTableCache = cache;
  runtime._readOnlyCache = createReadOnlyCache(cache);
  return cache;
}

export {
  ensureNodeLocalSystemTableCache,
  readNodeRuntimeSuppliedTimeSource,
  resolveNodeRuntimeTimeSource,
  resolveNodeServiceClock,
  resolveNodeServiceThreadManager,
};
