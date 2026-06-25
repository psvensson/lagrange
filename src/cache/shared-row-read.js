/**
 * Call-site helpers that route an audited read-only hot path through the
 * cache's no-clone shared-row read (default-off lever
 * LAGRANGE_PR_SNAPSHOT_SHARED_ROW_READ) when available, and fall back to the
 * cloning read otherwise.
 *
 * Why a helper rather than calling `getAllShared`/`filterShared` directly:
 * several consumers are constructed with mock caches that only implement
 * `getAll`/`filter`. The fallback keeps those paths working and makes the
 * lever-off behavior byte-identical to the historical cloning read.
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
