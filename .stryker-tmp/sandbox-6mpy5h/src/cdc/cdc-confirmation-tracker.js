/**
 * CDC Confirmation Tracker — awaitable CDC delivery confirmation.
 *
 * Lets callers wait for a write to become visible in the
 * SystemTableCache by tracking pending confirmation promises keyed
 * by `${tableName}:${primaryKeyValue}`. Resolves when the matching
 * cache-change listener fires; rejects on timeout or shutdown.
 *
 * Requirements: 1.1, 1.3, 1.4
 *
 * @module cdc/cdc-confirmation-tracker
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
import { CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS, CDC_CONFIRMATION_ERROR_TYPE, CDC_LIFECYCLE_LOG_MSG } from '../constants/cdc-lifecycle-constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
const TRACKER_SUBSYSTEM = stryMutAct_9fa48("35223") ? "" : (stryCov_9fa48("35223"), 'cdc-confirmation');

/**
 * CDCConfirmationTracker provides promise-based confirmation that a
 * CDC event has been applied to the local SystemTableCache.
 */
class CDCConfirmationTracker {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache — SystemTableCache instance
   * @param {number} [options.timeoutMs] — default confirmation timeout
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("35224")) {
      {}
    } else {
      stryCov_9fa48("35224");
      this.systemTableCache = options.systemTableCache;
      this.defaultTimeoutMs = stryMutAct_9fa48("35227") ? options.timeoutMs && CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS : stryMutAct_9fa48("35226") ? false : stryMutAct_9fa48("35225") ? true : (stryCov_9fa48("35225", "35226", "35227"), options.timeoutMs || CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS);
      this.isShutdown = stryMutAct_9fa48("35228") ? true : (stryCov_9fa48("35228"), false);

      /** @type {Map<string, {resolve: Function, reject: Function, timer: *}>} */
      this.pending = new Map();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(TRACKER_SUBSYSTEM) : console;

      // Bind the listener so we can remove it on shutdown.
      this._cacheListener = (tableName, operation, record) => {
        if (stryMutAct_9fa48("35229")) {
          {}
        } else {
          stryCov_9fa48("35229");
          this.onEventApplied(tableName, operation, record);
        }
      };
      if (stryMutAct_9fa48("35231") ? false : stryMutAct_9fa48("35230") ? true : (stryCov_9fa48("35230", "35231"), this.systemTableCache)) {
        if (stryMutAct_9fa48("35232")) {
          {}
        } else {
          stryCov_9fa48("35232");
          this.systemTableCache.onCacheChange(this._cacheListener);
        }
      }
    }
  }

  /**
   * Create a confirmation promise for a specific CDC event.
   * Resolves when the event is applied to SystemTableCache.
   *
   * @param {string} tableName
   * @param {string} primaryKey — the primary key value to watch for
   * @param {number} [timeoutMs] — override default timeout
   * @return {Promise<void>}
   */
  awaitConfirmation(tableName, primaryKey, timeoutMs) {
    if (stryMutAct_9fa48("35233")) {
      {}
    } else {
      stryCov_9fa48("35233");
      const timeout = stryMutAct_9fa48("35236") ? timeoutMs && this.defaultTimeoutMs : stryMutAct_9fa48("35235") ? false : stryMutAct_9fa48("35234") ? true : (stryCov_9fa48("35234", "35235", "35236"), timeoutMs || this.defaultTimeoutMs);
      const key = stryMutAct_9fa48("35237") ? `` : (stryCov_9fa48("35237"), `${tableName}:${primaryKey}`);
      if (stryMutAct_9fa48("35239") ? false : stryMutAct_9fa48("35238") ? true : (stryCov_9fa48("35238", "35239"), this.isShutdown)) {
        if (stryMutAct_9fa48("35240")) {
          {}
        } else {
          stryCov_9fa48("35240");
          return Promise.reject(this._shutdownError(tableName, primaryKey));
        }
      }
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("35241")) {
          {}
        } else {
          stryCov_9fa48("35241");
          const timer = setTimeout(() => {
            if (stryMutAct_9fa48("35242")) {
              {}
            } else {
              stryCov_9fa48("35242");
              this.pending.delete(key);
              const error = new Error((stryMutAct_9fa48("35243") ? `` : (stryCov_9fa48("35243"), `${CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT}: `)) + (stryMutAct_9fa48("35244") ? `` : (stryCov_9fa48("35244"), `table=${tableName} key=${primaryKey} `)) + (stryMutAct_9fa48("35245") ? `` : (stryCov_9fa48("35245"), `timeout=${timeout}ms`)));
              error.name = CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT;
              error.tableName = tableName;
              error.primaryKey = primaryKey;
              error.timeoutMs = timeout;
              this.logger.warn(CDC_LIFECYCLE_LOG_MSG.CONFIRMATION_TIMEOUT, stryMutAct_9fa48("35246") ? {} : (stryCov_9fa48("35246"), {
                tableName,
                primaryKey,
                timeoutMs: timeout
              }));
              reject(error);
            }
          }, timeout);
          this.pending.set(key, stryMutAct_9fa48("35247") ? {} : (stryCov_9fa48("35247"), {
            resolve,
            reject,
            timer
          }));
        }
      });
    }
  }

  /**
   * Called by the cache-change listener when an event is applied.
   * Resolves any pending confirmation promise matching the event.
   *
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} data
   */
  onEventApplied(tableName, operation, data) {
    if (stryMutAct_9fa48("35248")) {
      {}
    } else {
      stryCov_9fa48("35248");
      if (stryMutAct_9fa48("35251") ? this.pending.size !== 0 : stryMutAct_9fa48("35250") ? false : stryMutAct_9fa48("35249") ? true : (stryCov_9fa48("35249", "35250", "35251"), this.pending.size === 0)) {
        if (stryMutAct_9fa48("35252")) {
          {}
        } else {
          stryCov_9fa48("35252");
          return;
        }
      }
      const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
      const pkValue = stryMutAct_9fa48("35255") ? data || data[pkField] : stryMutAct_9fa48("35254") ? false : stryMutAct_9fa48("35253") ? true : (stryCov_9fa48("35253", "35254", "35255"), data && data[pkField]);
      if (stryMutAct_9fa48("35258") ? pkValue === undefined && pkValue === null : stryMutAct_9fa48("35257") ? false : stryMutAct_9fa48("35256") ? true : (stryCov_9fa48("35256", "35257", "35258"), (stryMutAct_9fa48("35260") ? pkValue !== undefined : stryMutAct_9fa48("35259") ? false : (stryCov_9fa48("35259", "35260"), pkValue === undefined)) || (stryMutAct_9fa48("35262") ? pkValue !== null : stryMutAct_9fa48("35261") ? false : (stryCov_9fa48("35261", "35262"), pkValue === null)))) {
        if (stryMutAct_9fa48("35263")) {
          {}
        } else {
          stryCov_9fa48("35263");
          return;
        }
      }
      const key = stryMutAct_9fa48("35264") ? `` : (stryCov_9fa48("35264"), `${tableName}:${pkValue}`);
      const entry = this.pending.get(key);
      if (stryMutAct_9fa48("35267") ? false : stryMutAct_9fa48("35266") ? true : stryMutAct_9fa48("35265") ? entry : (stryCov_9fa48("35265", "35266", "35267"), !entry)) {
        if (stryMutAct_9fa48("35268")) {
          {}
        } else {
          stryCov_9fa48("35268");
          return;
        }
      }
      clearTimeout(entry.timer);
      this.pending.delete(key);
      entry.resolve();
    }
  }

  /**
   * Shut down the tracker: reject all pending confirmations and
   * unregister the cache listener.
   */
  shutdown() {
    if (stryMutAct_9fa48("35269")) {
      {}
    } else {
      stryCov_9fa48("35269");
      this.isShutdown = stryMutAct_9fa48("35270") ? false : (stryCov_9fa48("35270"), true);
      for (const [key, entry] of this.pending) {
        if (stryMutAct_9fa48("35271")) {
          {}
        } else {
          stryCov_9fa48("35271");
          clearTimeout(entry.timer);
          const parts = key.split(stryMutAct_9fa48("35272") ? "" : (stryCov_9fa48("35272"), ':'));
          const tableName = parts[0];
          const primaryKey = stryMutAct_9fa48("35273") ? parts.join(':') : (stryCov_9fa48("35273"), parts.slice(1).join(stryMutAct_9fa48("35274") ? "" : (stryCov_9fa48("35274"), ':')));
          entry.reject(this._shutdownError(tableName, primaryKey));
        }
      }
      this.pending.clear();
      if (stryMutAct_9fa48("35276") ? false : stryMutAct_9fa48("35275") ? true : (stryCov_9fa48("35275", "35276"), this.systemTableCache)) {
        if (stryMutAct_9fa48("35277")) {
          {}
        } else {
          stryCov_9fa48("35277");
          this.systemTableCache.offCacheChange(this._cacheListener);
        }
      }
    }
  }

  /**
   * Build a shutdown rejection error.
   * @param {string} tableName
   * @param {string} primaryKey
   * @return {Error}
   * @private
   */
  _shutdownError(tableName, primaryKey) {
    if (stryMutAct_9fa48("35278")) {
      {}
    } else {
      stryCov_9fa48("35278");
      const error = new Error((stryMutAct_9fa48("35279") ? `` : (stryCov_9fa48("35279"), `${CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN}: `)) + (stryMutAct_9fa48("35280") ? `` : (stryCov_9fa48("35280"), `table=${tableName} key=${primaryKey}`)));
      error.name = CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN;
      error.tableName = tableName;
      error.primaryKey = primaryKey;
      return error;
    }
  }
}
export { CDCConfirmationTracker };