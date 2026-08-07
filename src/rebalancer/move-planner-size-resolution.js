/**
 * MovePlanner entity-size plumbing.
 *
 * The planner sizes capacity filtering on the entity's REAL size_bytes
 * when the owning rebalancer wired a sizeBytesResolver (partitions: the
 * leader-maintained size_bytes row); otherwise the estimate falls back
 * to the minimum-replica floor (0). Extracted from move-planner.js to
 * keep the planner under the source file-size threshold.
 *
 * @module rebalancer/move-planner-size-resolution
 */

/**
 * Resolve the real size_bytes for one entity via the injected resolver;
 * 0 when no resolver is wired or the resolved value is not a positive
 * finite number.
 * @param {Function|null} sizeBytesResolver
 * @param {string} entityType
 * @param {string} entityId
 * @return {number}
 */
function resolvePlannerSizeBytes(sizeBytesResolver, entityType, entityId) {
  if (typeof sizeBytesResolver !== 'function') {
    return 0;
  }
  const resolved = Number(sizeBytesResolver({entityType, entityId}));
  return Number.isFinite(resolved) && resolved > 0 ? resolved : 0;
}

export {resolvePlannerSizeBytes};
