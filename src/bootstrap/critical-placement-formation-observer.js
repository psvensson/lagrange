import {SYSTEM_TABLE_NAME} from './system-table-schemas-constants.js';
import {
  resolveCriticalPlacementConvergence,
} from './critical-placement-convergence.js';

const LOCAL_STR_FUNCTION = 'function';
const arrayIsArray = Array.isArray;

// Why an observer rather than a second evaluator: the distinct-voting-node
// invariant already has one owner (critical-placement-convergence.js). What
// formation lacked was a way to ASK it about the live cluster, so this module
// owns exactly one thing — reading the serving rows out of the system-table
// cache — and delegates every judgement.
const CRITICAL_PLACEMENT_OBSERVATION_STATE = Object.freeze({
  CACHE_UNAVAILABLE: 'critical_placement_cache_unavailable',
  CONVERGED: 'critical_placement_converged',
  PENDING: 'critical_placement_pending',
});

/**
 * Read every services row the cache can supply. A cache that cannot answer is
 * a distinct, typed outcome: absent evidence must never read as convergence.
 *
 * @param {Object|null} systemTableCache
 * @return {Object} {readable, rows}
 */
function readServiceRows(systemTableCache) {
  if (!systemTableCache ||
    typeof systemTableCache.filter !== LOCAL_STR_FUNCTION) {
    return {readable: false, rows: []};
  }
  let rows = null;
  try {
    rows = systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, () => true);
  } catch (error) {
    // A cache that throws is unreadable evidence, not an absent cluster. It
    // must not escape and abort the barrier snapshot that merely reports this.
    return {readable: false, rows: [], reason: error?.message || null};
  }
  // A thenable answer means an ASYNC cache (SystemCacheProxy.filter is async):
  // treating it as rows would drop the promise and report a permanent
  // unavailable, so name it rather than silently mis-read it.
  if (rows && typeof rows.then === LOCAL_STR_FUNCTION) {
    return {readable: false, rows: [], asynchronous: true};
  }
  return arrayIsArray(rows) ?
    {readable: true, rows} :
    {readable: false, rows: []};
}

/**
 * Project critical-placement convergence for the live cluster. Projection
 * only: it mints no readiness phase, releases no barrier, and derives nothing
 * from nodes.status, publication counts, or coverage.
 *
 * @param {Object} options
 * @param {Object|null} [options.systemTableCache]
 * @return {Object} frozen observation
 */
function observeCriticalPlacement(options = {}) {
  const {readable, rows} = readServiceRows(options.systemTableCache);
  if (!readable) {
    return Object.freeze({
      state: CRITICAL_PLACEMENT_OBSERVATION_STATE.CACHE_UNAVAILABLE,
      converged: false,
      pendingPartitionIds: Object.freeze([]),
      observedPartitionCount: 0,
    });
  }
  const convergence = resolveCriticalPlacementConvergence({serviceRows: rows});
  return Object.freeze({
    state: convergence.converged ?
      CRITICAL_PLACEMENT_OBSERVATION_STATE.CONVERGED :
      CRITICAL_PLACEMENT_OBSERVATION_STATE.PENDING,
    converged: convergence.converged,
    pendingPartitionIds: convergence.pendingPartitionIds,
    observedPartitionCount: convergence.partitions.length,
  });
}

export {
  CRITICAL_PLACEMENT_OBSERVATION_STATE,
  observeCriticalPlacement,
};
