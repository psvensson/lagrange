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
const MAX_RECENT_EVENTS_PER_KEY = 8;
const OPERATION_UPSERT = 'UPSERT';
const OPERATION_INSERT = 'INSERT';
const OPERATION_UPDATE = 'UPDATE';
const CONFIRMATION_WAIT = Object.freeze({
  wait: 'CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS',
  awaited: 'CDC event applied to the local SystemTableCache',
});

function nonEmptyStringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveRecordOriginHlc(data, metadata) {
  const snake = nonEmptyStringOrNull(data?.updated_at_hlc);
  if (snake) return snake;
  return nonEmptyStringOrNull(data?.updatedAtHlc) ||
    nonEmptyStringOrNull(metadata?.originHlc);
}

function compareHlcStrings(left, right) {
  const leftTs = HLCTimestamp.tryFromString(left);
  const rightTs = HLCTimestamp.tryFromString(right);
  return leftTs && rightTs ?
    leftTs.compare(rightTs) :
    String(left).localeCompare(String(right));
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
  };
}

function matchesRequiredHlc(entry, data, metadata) {
  const requiredMinHlc = entry.minHlc || entry.originHlc;
  if (!requiredMinHlc) return true;
  const recordHlc = resolveRecordOriginHlc(data, metadata);
  return recordHlc !== null && compareHlcStrings(recordHlc, requiredMinHlc) >= 0;
}

function matchesExpectedFields(entry, data) {
  if (!entry.expectedFields) return true;
  return Object.entries(entry.expectedFields).every(
    ([field, expectedValue]) => data?.[field] === expectedValue,
  );
}

function doesOperationMatch(expectedOperation, actualOperation) {
  if (!expectedOperation || actualOperation === expectedOperation) return true;
  return expectedOperation === OPERATION_UPSERT &&
    (actualOperation === OPERATION_INSERT || actualOperation === OPERATION_UPDATE);
}

function matchesOperationAndCause(entry, operation, data, metadata) {
  const opMatches = doesOperationMatch(entry.operation, operation);
  const causeId = metadata?.causeId || data?.causeId;
  const causeMatches = !entry.causeId || causeId === entry.causeId;
  return opMatches && causeMatches;
}

function doesConfirmationEntryMatch(entry, pkField, operation, data, metadata) {
  void pkField;
  const basicMatch = matchesOperationAndCause(entry, operation, data, metadata) &&
    matchesRequiredHlc(entry, data, metadata) &&
    matchesExpectedFields(entry, data);
  if (!basicMatch) return false;
  return !entry.predicate || entry.predicate(data, operation, metadata) === true;
}

function addPendingEntry(pending, key, entry) {
  let entries = pending.get(key);
  if (!entries) {
    entries = new Set();
    pending.set(key, entries);
  }
  entries.add(entry);
}

function removePendingEntry(pending, key, entry) {
  const entries = pending.get(key);
  if (!entries) return;
  entries.delete(entry);
  if (entries.size === 0) {
    pending.delete(key);
  }
}

function countPendingConfirmations(pending) {
  let count = 0;
  for (const entries of pending.values()) {
    count += entries.size;
  }
  return count;
}

function recordRecentEvent(recentEvents, key, pkField, operation, data, metadata) {
  let history = recentEvents.get(key);
  if (!history) {
    history = [];
    recentEvents.set(key, history);
  }
  history.push({
    pkField,
    operation,
    data: cloneObjectOrNull(data),
    metadata: cloneObjectOrNull(metadata),
  });
  if (history.length > MAX_RECENT_EVENTS_PER_KEY) {
    history.shift();
  }
}

function hasMatchingRecentEvent(recentEvents, key, entry, pkField) {
  if (!entry.originHlc && !entry.minHlc && !entry.causeId) return false;
  const history = recentEvents.get(key);
  if (!history) return false;
  return history.some((event) =>
    doesConfirmationEntryMatch(entry, pkField, event.operation, event.data, event.metadata),
  );
}

function buildConfirmationTimeoutError(tableName, primaryKey, timeout) {
  const error = new Error(
    `${CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT}: ` +
    `table=${tableName} key=${primaryKey} ` +
    `timeout=${timeout}ms`,
  );
  error.name = CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT;
  error.tableName = tableName;
  error.primaryKey = primaryKey;
  error.timeoutMs = timeout;
  return error;
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

    /** @type {Map<string, Set<{resolve: Function, reject: Function, timer: *}>>} */
    this.pending = new Map();
    /** @type {Map<string, Array<Object>>} */
    this.recentEvents = new Map();

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

    const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    if (hasMatchingRecentEvent(this.recentEvents, key, normalized, pkField)) {
      return Promise.resolve();
    }

    const startedAtMs = Date.now();
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: null,
        ...normalized,
      };
      entry.timer = setTimeout(() => {
        removePendingEntry(this.pending, key, entry);
        const error = buildConfirmationTimeoutError(tableName, primaryKey, timeout);
        reportWaitBoundSpent(this.logger, {
          ...CONFIRMATION_WAIT,
          boundMs: timeout,
          startedAtMs,
          lastObserved: {
            confirmed: false,
            pendingConfirmations: countPendingConfirmations(this.pending),
          },
          scope: {tableName, primaryKey},
        });
        reject(error);
      }, timeout);

      addPendingEntry(this.pending, key, entry);
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
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    const pkValue = data && data[pkField];
    if (pkValue === undefined || pkValue === null) {
      return;
    }

    const key = `${tableName}:${pkValue}`;
    recordRecentEvent(this.recentEvents, key, pkField, operation, data, metadata);

    const entries = this.pending.get(key);
    if (!entries || entries.size === 0) {
      return;
    }

    for (const entry of [...entries]) {
      if (doesConfirmationEntryMatch(entry, pkField, operation, data, metadata)) {
        clearTimeout(entry.timer);
        removePendingEntry(this.pending, key, entry);
        entry.resolve();
      }
    }
  }

  /**
   * Shut down the tracker: reject all pending confirmations and
   * unregister the cache listener.
   */
  shutdown() {
    this.isShutdown = true;

    for (const [key, entries] of this.pending) {
      const parts = key.split(':');
      const tableName = parts[0];
      const primaryKey = parts.slice(1).join(':');
      for (const entry of entries) {
        clearTimeout(entry.timer);
        entry.reject(this._shutdownError(tableName, primaryKey));
      }
    }
    this.pending.clear();
    this.recentEvents.clear();

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
