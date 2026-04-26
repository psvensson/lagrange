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

import {LoggingService} from '../logging/logging-service.js';
import {
  CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS,
  CDC_CONFIRMATION_ERROR_TYPE,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';

const TRACKER_SUBSYSTEM = 'cdc-confirmation';

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
    this.systemTableCache = options.systemTableCache;
    this.defaultTimeoutMs =
      options.timeoutMs || CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS;
    this.isShutdown = false;

    /** @type {Map<string, {resolve: Function, reject: Function, timer: *}>} */
    this.pending = new Map();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRACKER_SUBSYSTEM) : console;

    // Bind the listener so we can remove it on shutdown.
    this._cacheListener = (tableName, operation, record) => {
      this.onEventApplied(tableName, operation, record);
    };

    if (this.systemTableCache) {
      this.systemTableCache.onCacheChange(this._cacheListener);
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
    const timeout = timeoutMs || this.defaultTimeoutMs;
    const key = `${tableName}:${primaryKey}`;

    if (this.isShutdown) {
      return Promise.reject(this._shutdownError(tableName, primaryKey));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        const error = new Error(
          `${CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT}: ` +
          `table=${tableName} key=${primaryKey} ` +
          `timeout=${timeout}ms`,
        );
        error.name = CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT;
        error.tableName = tableName;
        error.primaryKey = primaryKey;
        error.timeoutMs = timeout;
        this.logger.warn(CDC_LIFECYCLE_LOG_MSG.CONFIRMATION_TIMEOUT, {
          tableName,
          primaryKey,
          timeoutMs: timeout,
        });
        reject(error);
      }, timeout);

      this.pending.set(key, {resolve, reject, timer});
    });
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
    if (this.pending.size === 0) {
      return;
    }

    const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    const pkValue = data && data[pkField];
    if (pkValue === undefined || pkValue === null) {
      return;
    }

    const key = `${tableName}:${pkValue}`;
    const entry = this.pending.get(key);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timer);
    this.pending.delete(key);
    entry.resolve();
  }

  /**
   * Shut down the tracker: reject all pending confirmations and
   * unregister the cache listener.
   */
  shutdown() {
    this.isShutdown = true;

    for (const [key, entry] of this.pending) {
      clearTimeout(entry.timer);
      const parts = key.split(':');
      const tableName = parts[0];
      const primaryKey = parts.slice(1).join(':');
      entry.reject(this._shutdownError(tableName, primaryKey));
    }
    this.pending.clear();

    if (this.systemTableCache) {
      this.systemTableCache.offCacheChange(this._cacheListener);
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
    const error = new Error(
      `${CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN}: ` +
      `table=${tableName} key=${primaryKey}`,
    );
    error.name = CDC_CONFIRMATION_ERROR_TYPE.SHUTDOWN;
    error.tableName = tableName;
    error.primaryKey = primaryKey;
    return error;
  }
}

export {CDCConfirmationTracker};
