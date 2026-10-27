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
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {
  CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS,
  CDC_CONFIRMATION_ERROR_TYPE,
} from '../constants/cdc-lifecycle-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';


const TRACKER_SUBSYSTEM = 'cdc-confirmation';
const CONFIRMATION_WAIT = Object.freeze({
  wait: 'CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS',
  awaited: 'CDC event applied to the local SystemTableCache',
});

function resolveRecordOriginHlc(data) {
  const snake = data?.updated_at_hlc;
  if (typeof snake === 'string' && snake.length > 0) return snake;
  const camel = data?.updatedAtHlc;
  return typeof camel === 'string' && camel.length > 0 ? camel : null;
}

function compareHlcStrings(left, right) {
  const leftTs = HLCTimestamp.tryFromString(left);
  const rightTs = HLCTimestamp.tryFromString(right);
  return leftTs && rightTs ?
    leftTs.compare(rightTs) :
    String(left).localeCompare(String(right));
}

function nonEmptyStringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function cloneObjectOrNull(value) {
  return value && typeof value === 'object' ? {...value} : null;
}

function normalizeConfirmationOptions(timeoutOrOptions, defaultTimeoutMs) {
  const isObject = Boolean(timeoutOrOptions) && typeof timeoutOrOptions === 'object';
  const opts = isObject ? timeoutOrOptions : {};
  const rawTimeout = isObject ? opts.timeoutMs : timeoutOrOptions;
  return {
    timeoutMs: rawTimeout || defaultTimeoutMs,
    expectedFields: cloneObjectOrNull(opts.expectedFields),
    originHlc: nonEmptyStringOrNull(opts.originHlc),
    minHlc: nonEmptyStringOrNull(opts.minHlc),
    operation: nonEmptyStringOrNull(opts.operation),
    causeId: nonEmptyStringOrNull(opts.causeId),
    predicate: typeof opts.predicate === 'function' ? opts.predicate : null,
    inferredFromWrite: opts.inferredFromWrite === true,
  };
}

function matchesRequiredHlc(entry, data) {
  const requiredMinHlc = entry.minHlc || entry.originHlc;
  if (!requiredMinHlc) return true;
  const recordHlc = resolveRecordOriginHlc(data);
  if (recordHlc === null) return entry.inferredFromWrite;
  return compareHlcStrings(recordHlc, requiredMinHlc) >= 0;
}

function matchesExpectedFields(entry, pkField, data) {
  if (!entry.expectedFields) return true;
  const shouldCheckFields = !entry.inferredFromWrite ||
    Object.keys(data || {}).some((field) => field !== pkField);
  if (!shouldCheckFields) return true;
  return Object.entries(entry.expectedFields).every(
    ([field, expectedValue]) => data?.[field] === expectedValue,
  );
}

function matchesOperationAndCause(entry, operation, data, metadata) {
  const opMatches = !entry.operation || operation === entry.operation;
  const causeId = metadata?.causeId || data?.causeId;
  const causeMatches = !entry.causeId || causeId === entry.causeId;
  return opMatches && causeMatches;
}

function doesConfirmationEntryMatch(entry, pkField, operation, data, metadata) {
  const basicMatch = matchesOperationAndCause(entry, operation, data, metadata) &&
    matchesRequiredHlc(entry, data) &&
    matchesExpectedFields(entry, pkField, data);
  if (!basicMatch) return false;
  return !entry.predicate || entry.predicate(data, operation, metadata) === true;
}

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
    this._cacheListener = (tableName, operation, record, metadata) => {
      this.onEventApplied(tableName, operation, record, metadata);
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
   * @param {number|Object} [timeoutOrOptions] — timeout in ms or causal match options
   * @return {Promise<void>}
   */
  awaitConfirmation(tableName, primaryKey, timeoutOrOptions) {
    const normalized = normalizeConfirmationOptions(
      timeoutOrOptions,
      this.defaultTimeoutMs,
    );
    const timeout = normalized.timeoutMs;
    const key = `${tableName}:${primaryKey}`;

    if (this.isShutdown) {
      return Promise.reject(this._shutdownError(tableName, primaryKey));
    }

    const startedAtMs = Date.now();
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
        reportWaitBoundSpent(this.logger, {
          ...CONFIRMATION_WAIT,
          boundMs: timeout,
          startedAtMs,
          lastObserved: {
            confirmed: false,
            pendingConfirmations: this.pending.size,
          },
          scope: {tableName, primaryKey},
        });
        reject(error);
      }, timeout);

      this.pending.set(key, {
        resolve,
        reject,
        timer,
        ...normalized,
      });
    });
  }

  /**
   * Called by the cache-change listener when an event is applied.
   * Resolves any pending confirmation promise matching the event.
   *
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} data
   * @param {Object} [metadata]
   */
  onEventApplied(tableName, operation, data, metadata) {
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
    if (!doesConfirmationEntryMatch(entry, pkField, operation, data, metadata)) {
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
