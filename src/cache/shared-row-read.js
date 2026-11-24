/**
 * Call-site helpers for audited read-only system-table scans.
 *
 * The canonical SystemTableCache `getAll`/`filter` methods return frozen,
 * shared rows unconditionally (no per-read deep clone), so callers must treat
 * returned rows as read-only. Missing or non-conforming caches fail closed
 * with a TypeError rather than silently returning an empty list.
 */

const TYPE_FUNCTION = 'function';
const MISSING_CACHE_GET_ALL_ERROR =
  'readAllSharedRows requires a system table cache with getAll(tableName)';
const MISSING_CACHE_FILTER_ERROR =
  'filterSharedRows requires a system table cache with filter(tableName, predicate)';

/**
 * @param {Object} cache - System table cache with `getAll(tableName)`.
 * @param {string} tableName - System table name.
 * @return {Array<Object>} Rows (frozen+shared on SystemTableCache).
 */
function readAllSharedRows(cache, tableName) {
  if (!cache || typeof cache.getAll !== TYPE_FUNCTION) {
    throw new TypeError(MISSING_CACHE_GET_ALL_ERROR);
  }
  return cache.getAll(tableName) || [];
}

/**
 * @param {Object} cache - System table cache with `filter(tableName, predicate)`.
 * @param {string} tableName - System table name.
 * @param {Function} predicate - Returns true for matching rows.
 * @return {Array<Object>} Matching rows (frozen+shared on SystemTableCache).
 */
function filterSharedRows(cache, tableName, predicate) {
  if (!cache || typeof cache.filter !== TYPE_FUNCTION) {
    throw new TypeError(MISSING_CACHE_FILTER_ERROR);
  }
  return cache.filter(tableName, predicate) || [];
}

export {filterSharedRows, readAllSharedRows};
