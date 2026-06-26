/**
 * Call-site helpers that route an audited read-only hot path through the
 * cache's no-clone shared-row read (`getAllShared`/`filterShared`) when
 * available, and fall back to `getAll`/`filter` otherwise.
 *
 * Why a helper rather than calling `getAllShared`/`filterShared` directly:
 * several consumers are constructed with mock caches that only implement
 * `getAll`/`filter`. The fallback keeps those paths working. The real cache's
 * scan reads return frozen-shared rows unconditionally (the per-read deep clone
 * was eliminated), so callers must treat returned rows as read-only.
 */

const TYPE_FUNCTION = 'function';

/**
 * @param {Object} cache - System table cache (or mock).
 * @param {string} tableName - System table name.
 * @return {Array<Object>} Rows (frozen+shared under the lever, else clones).
 */
function readAllSharedRows(cache, tableName) {
  if (cache && typeof cache.getAllShared === TYPE_FUNCTION) {
    return cache.getAllShared(tableName) || [];
  }
  if (cache && typeof cache.getAll === TYPE_FUNCTION) {
    return cache.getAll(tableName) || [];
  }
  return [];
}

/**
 * @param {Object} cache - System table cache (or mock).
 * @param {string} tableName - System table name.
 * @param {Function} predicate - Returns true for matching rows.
 * @return {Array<Object>} Matching rows (frozen+shared under the lever, else
 *   clones).
 */
function filterSharedRows(cache, tableName, predicate) {
  if (cache && typeof cache.filterShared === TYPE_FUNCTION) {
    return cache.filterShared(tableName, predicate) || [];
  }
  if (cache && typeof cache.filter === TYPE_FUNCTION) {
    return cache.filter(tableName, predicate) || [];
  }
  return [];
}

export {filterSharedRows, readAllSharedRows};
