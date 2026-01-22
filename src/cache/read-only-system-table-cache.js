/**
 * Read-Only System Table Cache Wrapper.
 * Enforces read-only access to the System Table Cache at runtime.
 * All components except CDC handlers receive this wrapper instead of direct cache access.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {LoggingService} from '../logging/logging-service.js';

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
      throw new Error('ReadOnlySystemTableCache requires an underlying cache');
    }
    this._cache = underlyingCache;
    this._logger = LoggingService.getInstance().forSubsystem('cache');
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
    this._logger.error('Attempted to write to read-only cache', {
      operation,
      ...context,
      hint: 'Use CDCIntegrationService for writes',
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
  const blockedMethods = [
    'applySystemTableChange',
    'clear',
    'insert',
    'update',
    'delete',
  ];

  return new Proxy(wrapper, {
    get(target, prop) {
      // Check if attempting to access a blocked method
      if (blockedMethods.includes(prop)) {
        target.logViolation(prop, {attemptedMethod: prop});
        throw new Error(
          `Cache write violation: "${prop}" is not available on read-only cache. ` +
          'Use CDCIntegrationService for writes.',
        );
      }

      // Check if attempting to access the underlying cache directly
      if (prop === '_cache' || prop === 'tables') {
        target.logViolation('direct_access', {attemptedProperty: prop});
        throw new Error(
          'Cache write violation: Direct cache access is not allowed. ' +
          'Use CDCIntegrationService for writes.',
        );
      }

      // Allow access to allowed methods and standard properties
      const value = target[prop];
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });
}

export {ReadOnlySystemTableCache, createReadOnlyCache};
