/**
 * Read-Only System Table Cache Wrapper.
 * Enforces read-only access to the System Table Cache at runtime.
 * All components except CDC handlers receive this wrapper instead of direct cache access.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {LoggingService} from '../logging/logging-service.js';
import {TYPEOF} from '../constants/index.js';
import {
  CACHE_ERROR_MSG,
  CACHE_LOG_MSG,
  CACHE_READ_ONLY,
  CACHE_SUBSYSTEM,
} from './cache-constants.js';

/**
 * ReadOnlySystemTableCache provides a read-only view of the SystemTableCache.
 * Write methods are not exposed, enforcing the architectural constraint that
 * only CDC event handlers can modify the cache.
 */
class ReadOnlySystemTableCache {
  /**
   * Create a new ReadOnlySystemTableCache wrapper.
   * @param {SystemTableCache} underlyingCache - The underlying writable cache.
   */
  constructor(underlyingCache) {
    if (!underlyingCache) {
      throw new Error(CACHE_ERROR_MSG.READ_ONLY_CACHE_REQUIRED);
    }
    this._cache = underlyingCache;
    this._logger = LoggingService.getInstance().forSubsystem(CACHE_SUBSYSTEM.CACHE);
  }

  /**
   * Get a single record by key from a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {Object|undefined} The record or undefined if not found.
   */
  get(tableName, key) {
    return this._cache.get(tableName, key);
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Object|undefined} The first matching record or undefined.
   */
  find(tableName, predicate) {
    return this._cache.find(tableName, predicate);
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Array<Object>} Array of matching records.
   */
  filter(tableName, predicate) {
    return this._cache.filter(tableName, predicate);
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - Name of the system table.
   * @return {Array<Object>} Array of all records in the table.
   */
  getAll(tableName) {
    return this._cache.getAll(tableName);
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {boolean} True if the record exists.
   */
  has(tableName, key) {
    return this._cache.has(tableName, key);
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - Name of the system table.
   * @return {number} Number of records in the table.
   */
  count(tableName) {
    return this._cache.count(tableName);
  }

  /**
   * Get the latest applied schema/version watermark for one table.
   * @param {string} tableName - Name of the system table.
   * @return {string|number|null}
   */
  getAppliedSchemaVersion(tableName) {
    return this._cache.getAppliedSchemaVersion(tableName);
  }

  /**
   * Get the last local wall-clock apply time for one table.
   * @param {string} tableName - Name of the system table.
   * @return {number|null}
   */
  getLastAppliedAtMs(tableName) {
    return this._cache.getLastAppliedAtMs(tableName);
  }

  /**
   * Get the last applied cause ID for one table when available.
   * @param {string} tableName - Name of the system table.
   * @return {string|null}
   */
  getLastAppliedCauseId(tableName) {
    return this._cache.getLastAppliedCauseId(tableName);
  }

  /**
   * Get the list of supported system table names.
   * @return {Array<string>} Array of system table names.
   */
  getTableNames() {
    return this._cache.getTableNames();
  }

  /**
   * Subscribe to cache change notifications.
   * Listeners receive (tableName, operation, record) on each change.
   * @param {Function} listener - Called with (tableName, operation, record)
   */
  onCacheChange(listener) {
    return this._cache.onCacheChange(listener);
  }

  /**
   * Unsubscribe from cache change notifications.
   * @param {Function} listener - The listener to remove
   * @return {boolean} True if the listener was removed
   */
  offCacheChange(listener) {
    return this._cache.offCacheChange(listener);
  }

  /**
   * Log a violation when write methods are attempted.
   * This method is called internally when detecting write attempts.
   * @param {string} operation - The attempted operation name.
   * @param {Object} context - Additional context about the violation.
   * @private
   */
  logViolation(operation, context = {}) {
    this._logger.error(CACHE_LOG_MSG.READ_ONLY_WRITE_ATTEMPT, {
      operation,
      ...context,
      hint: CACHE_ERROR_MSG.READ_ONLY_HINT,
    });
  }
}

/**
 * Create a proxy that intercepts any attempt to access write methods.
 * This provides additional runtime protection beyond just not exposing methods.
 * @param {SystemTableCache} underlyingCache - The underlying writable cache.
 * @return {ReadOnlySystemTableCache} A proxied read-only cache wrapper.
 */
function createReadOnlyCache(underlyingCache) {
  const wrapper = new ReadOnlySystemTableCache(underlyingCache);

  // List of write methods that should be blocked
  const blockedMethods = CACHE_READ_ONLY.BLOCKED_METHODS;

  return new Proxy(wrapper, {
    get(target, prop) {
      // Check if attempting to access a blocked method
      if (blockedMethods.includes(prop)) {
        target.logViolation(prop, {attemptedMethod: prop});
        throw new Error(CACHE_ERROR_MSG.readOnlyMethodBlocked(prop));
      }

      // Check if attempting to access the underlying cache directly
      if (CACHE_READ_ONLY.BLOCKED_PROPERTIES.includes(prop)) {
        target.logViolation(CACHE_READ_ONLY.DIRECT_ACCESS, {attemptedProperty: prop});
        throw new Error(CACHE_ERROR_MSG.READ_ONLY_DIRECT_ACCESS);
      }

      // Allow access to allowed methods and standard properties
      const value = target[prop];
      if (typeof value === TYPEOF.FUNCTION) {
        return value.bind(target);
      }
      return value;
    },
  });
}

export {ReadOnlySystemTableCache, createReadOnlyCache};
