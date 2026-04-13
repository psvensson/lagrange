/**
 * Read-Only System Table Cache Wrapper.
 * Enforces read-only access to the System Table Cache at runtime.
 * All components except CDC handlers receive this wrapper instead of direct cache access.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { LoggingService } from '../logging/logging-service.js';
import { TYPEOF } from '../constants/index.js';
import { CACHE_ERROR_MSG, CACHE_LOG_MSG, CACHE_READ_ONLY, CACHE_SUBSYSTEM } from './cache-constants.js';

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
    if (stryMutAct_9fa48("34536")) {
      {}
    } else {
      stryCov_9fa48("34536");
      if (stryMutAct_9fa48("34539") ? false : stryMutAct_9fa48("34538") ? true : stryMutAct_9fa48("34537") ? underlyingCache : (stryCov_9fa48("34537", "34538", "34539"), !underlyingCache)) {
        if (stryMutAct_9fa48("34540")) {
          {}
        } else {
          stryCov_9fa48("34540");
          throw new Error(CACHE_ERROR_MSG.READ_ONLY_CACHE_REQUIRED);
        }
      }
      this._cache = underlyingCache;
      this._logger = LoggingService.getInstance().forSubsystem(CACHE_SUBSYSTEM.CACHE);
    }
  }

  /**
   * Get a single record by key from a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {Object|undefined} The record or undefined if not found.
   */
  get(tableName, key) {
    if (stryMutAct_9fa48("34541")) {
      {}
    } else {
      stryCov_9fa48("34541");
      return this._cache.get(tableName, key);
    }
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Object|undefined} The first matching record or undefined.
   */
  find(tableName, predicate) {
    if (stryMutAct_9fa48("34542")) {
      {}
    } else {
      stryCov_9fa48("34542");
      return this._cache.find(tableName, predicate);
    }
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Array<Object>} Array of matching records.
   */
  filter(tableName, predicate) {
    if (stryMutAct_9fa48("34543")) {
      {}
    } else {
      stryCov_9fa48("34543");
      return stryMutAct_9fa48("34544") ? this._cache : (stryCov_9fa48("34544"), this._cache.filter(tableName, predicate));
    }
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - Name of the system table.
   * @return {Array<Object>} Array of all records in the table.
   */
  getAll(tableName) {
    if (stryMutAct_9fa48("34545")) {
      {}
    } else {
      stryCov_9fa48("34545");
      return this._cache.getAll(tableName);
    }
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {boolean} True if the record exists.
   */
  has(tableName, key) {
    if (stryMutAct_9fa48("34546")) {
      {}
    } else {
      stryCov_9fa48("34546");
      return this._cache.has(tableName, key);
    }
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - Name of the system table.
   * @return {number} Number of records in the table.
   */
  count(tableName) {
    if (stryMutAct_9fa48("34547")) {
      {}
    } else {
      stryCov_9fa48("34547");
      return this._cache.count(tableName);
    }
  }

  /**
   * Get the latest applied schema/version watermark for one table.
   * @param {string} tableName - Name of the system table.
   * @return {string|number|null}
   */
  getAppliedSchemaVersion(tableName) {
    if (stryMutAct_9fa48("34548")) {
      {}
    } else {
      stryCov_9fa48("34548");
      return this._cache.getAppliedSchemaVersion(tableName);
    }
  }

  /**
   * Get the last local wall-clock apply time for one table.
   * @param {string} tableName - Name of the system table.
   * @return {number|null}
   */
  getLastAppliedAtMs(tableName) {
    if (stryMutAct_9fa48("34549")) {
      {}
    } else {
      stryCov_9fa48("34549");
      return this._cache.getLastAppliedAtMs(tableName);
    }
  }

  /**
   * Get the last applied cause ID for one table when available.
   * @param {string} tableName - Name of the system table.
   * @return {string|null}
   */
  getLastAppliedCauseId(tableName) {
    if (stryMutAct_9fa48("34550")) {
      {}
    } else {
      stryCov_9fa48("34550");
      return this._cache.getLastAppliedCauseId(tableName);
    }
  }

  /**
   * Get the list of supported system table names.
   * @return {Array<string>} Array of system table names.
   */
  getTableNames() {
    if (stryMutAct_9fa48("34551")) {
      {}
    } else {
      stryCov_9fa48("34551");
      return this._cache.getTableNames();
    }
  }

  /**
   * Subscribe to cache change notifications.
   * Listeners receive (tableName, operation, record) on each change.
   * @param {Function} listener - Called with (tableName, operation, record)
   */
  onCacheChange(listener) {
    if (stryMutAct_9fa48("34552")) {
      {}
    } else {
      stryCov_9fa48("34552");
      return this._cache.onCacheChange(listener);
    }
  }

  /**
   * Unsubscribe from cache change notifications.
   * @param {Function} listener - The listener to remove
   * @return {boolean} True if the listener was removed
   */
  offCacheChange(listener) {
    if (stryMutAct_9fa48("34553")) {
      {}
    } else {
      stryCov_9fa48("34553");
      return this._cache.offCacheChange(listener);
    }
  }

  /**
   * Log a violation when write methods are attempted.
   * This method is called internally when detecting write attempts.
   * @param {string} operation - The attempted operation name.
   * @param {Object} context - Additional context about the violation.
   * @private
   */
  logViolation(operation, context = {}) {
    if (stryMutAct_9fa48("34554")) {
      {}
    } else {
      stryCov_9fa48("34554");
      this._logger.error(CACHE_LOG_MSG.READ_ONLY_WRITE_ATTEMPT, stryMutAct_9fa48("34555") ? {} : (stryCov_9fa48("34555"), {
        operation,
        ...context,
        hint: CACHE_ERROR_MSG.READ_ONLY_HINT
      }));
    }
  }
}

/**
 * Create a proxy that intercepts any attempt to access write methods.
 * This provides additional runtime protection beyond just not exposing methods.
 * @param {SystemTableCache} underlyingCache - The underlying writable cache.
 * @return {ReadOnlySystemTableCache} A proxied read-only cache wrapper.
 */
function createReadOnlyCache(underlyingCache) {
  if (stryMutAct_9fa48("34556")) {
    {}
  } else {
    stryCov_9fa48("34556");
    const wrapper = new ReadOnlySystemTableCache(underlyingCache);

    // List of write methods that should be blocked
    const blockedMethods = CACHE_READ_ONLY.BLOCKED_METHODS;
    return new Proxy(wrapper, stryMutAct_9fa48("34557") ? {} : (stryCov_9fa48("34557"), {
      get(target, prop) {
        if (stryMutAct_9fa48("34558")) {
          {}
        } else {
          stryCov_9fa48("34558");
          // Check if attempting to access a blocked method
          if (stryMutAct_9fa48("34560") ? false : stryMutAct_9fa48("34559") ? true : (stryCov_9fa48("34559", "34560"), blockedMethods.includes(prop))) {
            if (stryMutAct_9fa48("34561")) {
              {}
            } else {
              stryCov_9fa48("34561");
              target.logViolation(prop, stryMutAct_9fa48("34562") ? {} : (stryCov_9fa48("34562"), {
                attemptedMethod: prop
              }));
              throw new Error(CACHE_ERROR_MSG.readOnlyMethodBlocked(prop));
            }
          }

          // Check if attempting to access the underlying cache directly
          if (stryMutAct_9fa48("34564") ? false : stryMutAct_9fa48("34563") ? true : (stryCov_9fa48("34563", "34564"), CACHE_READ_ONLY.BLOCKED_PROPERTIES.includes(prop))) {
            if (stryMutAct_9fa48("34565")) {
              {}
            } else {
              stryCov_9fa48("34565");
              target.logViolation(CACHE_READ_ONLY.DIRECT_ACCESS, stryMutAct_9fa48("34566") ? {} : (stryCov_9fa48("34566"), {
                attemptedProperty: prop
              }));
              throw new Error(CACHE_ERROR_MSG.READ_ONLY_DIRECT_ACCESS);
            }
          }

          // Allow access to allowed methods and standard properties
          const value = target[prop];
          if (stryMutAct_9fa48("34569") ? typeof value !== TYPEOF.FUNCTION : stryMutAct_9fa48("34568") ? false : stryMutAct_9fa48("34567") ? true : (stryCov_9fa48("34567", "34568", "34569"), typeof value === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("34570")) {
              {}
            } else {
              stryCov_9fa48("34570");
              return value.bind(target);
            }
          }
          return value;
        }
      }
    }));
  }
}
export { ReadOnlySystemTableCache, createReadOnlyCache };