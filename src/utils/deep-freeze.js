/**
 * Idempotent deep-freeze for JSON-shaped cache rows.
 *
 * Why (saturation-relief, rolling-restart PASS blocker): the system-table cache
 * deep-CLONES every row on every read for mutation isolation, and the V8
 * profiler pinned that clone (`fastJsonClone`) as the #1 self-time frame on the
 * CPU-pegged slow rejoiner. For read-only hot paths (the priority-recovery
 * snapshot construction) the isolation can instead be provided by freezing the
 * STORED row once and sharing the reference: O(size) once, amortized across all
 * subsequent reads, vs. O(size) per read for the clone.
 *
 * The cache never mutates a stored row in place — every write replaces the row
 * wholesale via `table.set(key, deepClone(...))` — so freezing a stored row is
 * safe for the cache, and any latent consumer that DOES mutate a shared row
 * fails loudly (frozen) rather than silently corrupting cache state.
 *
 * The top-level `Object.isFrozen` short-circuit makes re-freezing a row already
 * deep-frozen O(1): we only ever deep-freeze fully, so a frozen top object
 * implies its descendants are frozen too.
 */

const TYPE_OBJECT = 'object';

/**
 * @param {*} value - JSON-shaped value to freeze in place.
 * @return {*} The same value, deep-frozen.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== TYPE_OBJECT || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

export {deepFreeze};
