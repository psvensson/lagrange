/**
 * System Table Cache - In-memory cache for system tables.
 * Maintains cached copies of system tables (nodes, partitions, tables,
 * services, message_groups, indices) synchronized via CDC events.
 * Requirements: 4.4, 4.5, 4.8
 */

import {TABLES} from '../constants/index.js';
import {resolveTimeSource} from '../time/time-source.js';
import {LoggingService} from '../logging/logging-service.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {
  CACHE_CDC_OPERATIONS,
  CACHE_DEFAULT,
  CACHE_ERROR_MSG,
  CACHE_LOG_MSG,
  CACHE_SUBSYSTEM,
  CACHE_SYSTEM_TABLES,
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
} from './cache-constants.js';
import {
  buildAuthoritativeServiceLifecycleCacheReplacement,
  buildAuthoritativeSystemTableCacheReplacement,
} from './system-table-cache-authoritative-reconciliation.js';
import {reconcileSystemTableCacheAgainstAuthoritativeTruth} from
  './system-table-cache-authoritative-absence-sweep.js';
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
  getSystemCachePrimaryKeyField,
  isUsableSystemCacheKey,
  resolveSystemCacheRowKey,
} from './system-cache-key-descriptor.js';
import {
  applyStaleRowBackfill,
  cloneFieldValue,
  compareSchemaVersions,
  getRecordTimestamp,
  isStaleForExistingRecord,
  mergeRecords,
  shouldBackfillMissingField,
  shouldUsePublicationMerge,
  tryParseHLCTimestamp,
} from './system-table-cache-row-merge.js';
import {SystemTableCacheTombstoneStore} from
  './system-table-cache-tombstone-store.js';
import {
  assignSystemTableCacheObservationMethods,
  getSharedRowReadStats,
  resetSharedRowReadStats,
} from './system-table-cache-observation-methods.js';
import {
  updateSystemTableCacheCdcObservation,
} from './system-table-cache-cdc-observation.js';

/**
 * System table names that are cached.
 */
const SYSTEM_TABLES = CACHE_SYSTEM_TABLES;

/**
 * Primary key field names for each system table.
 */
const PRIMARY_KEY_FIELDS = SYSTEM_CACHE_KEY_DESCRIPTOR;

/**
 * CDC operation types.
 */
const CDC_OPERATIONS = CACHE_CDC_OPERATIONS;

// The production next-turn hop for a cache-change notification. Listeners are
// deliberately NOT called inside the mutating turn, so a listener can never
// observe a half-applied batch or re-enter the cache mid-apply. A
// deterministic host replaces the timer, never the deferral.
function defaultCacheChangeNotificationSchedule(callback) {
  return setImmediate(callback);
}

function isAuthoritativeUpsertMode(mutationMode) {
  return mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION ||
    mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_OBSERVATION_RECONCILIATION ||
    mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION;
}

function mutationOperationCompatible(mutationMode, operation) {
  const absenceMode = mutationMode ===
    SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_ABSENCE_RECONCILIATION;
  return (!isAuthoritativeUpsertMode(mutationMode) ||
      operation === CDC_OPERATIONS.UPSERT) &&
    (!absenceMode || operation === CDC_OPERATIONS.DELETE);
}

function mutationTableCompatible(mutationMode, tableName) {
  return mutationMode !==
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION ||
    tableName === TABLES.SERVICES;
}

function mutationObservationCompatible(
  mutationMode,
  options,
  currentObservedAtMs,
) {
  const completeObservationMode = mutationMode ===
    SYSTEM_TABLE_CACHE_MUTATION_MODE
      .AUTHORITATIVE_OBSERVATION_RECONCILIATION;
  if (!completeObservationMode) {
    return true;
  }
  const observedAtMs = Number(options?.authoritativeObservedAtMs);
  const readStartedAtMs = Number(options?.authoritativeReadStartedAtMs);
  return Number.isFinite(observedAtMs) &&
    observedAtMs >= 0 &&
    Number.isFinite(readStartedAtMs) &&
    readStartedAtMs >= 0 &&
    (
      !Number.isFinite(currentObservedAtMs) ||
      Math.floor(observedAtMs) > currentObservedAtMs
    );
}

function cacheWriteIsFenced(options) {
  if (options.operation === CDC_OPERATIONS.DELETE) {
    return false;
  }
  if (options.completeAuthoritativePresence) {
    return options.cache.tombstoneStore.completeObservationWriteIsFenced(
      options.tableName,
      options.key,
      Math.floor(Number(options.authoritativeObservedAtMs)),
      Math.floor(Number(options.authoritativeReadStartedAtMs)),
    );
  }
  return options.cache.tombstoneStore.writeIsFenced(
    options.tableName,
    options.key,
    options.data,
    {
      keyPresent: options.table.has(options.key),
      authoritativeObservedAtMs:
        options.cache.getLastAuthoritativeObservedAtMs(options.tableName),
    },
  );
}

/**
 * SystemTableCache provides in-memory caching for system tables.
 * Only CDC event handlers should have write access to this cache.
 * Requirements: 7.1, 7.2 - Cache tracks current epoch and provides epoch methods
 */
class SystemTableCache {
  /**
   * Create a new SystemTableCache instance.
   */
  /**
   * @param {Object} [options] - {scheduleCacheChangeNotification}.
   * @param {Function} [options.scheduleCacheChangeNotification] - places a
   *   cache-change notification on the next turn. Production default is
   *   exactly `setImmediate(callback)`; a deterministic host supplies its own
   *   next-turn queue so the hop is an ordinary scheduled event rather than
   *   an escape from virtual time. Scheduling only: what is delivered, to
   *   whom, in what order, and how mutation and invalidation behave are
   *   unchanged.
   */
  constructor(options = {}) {
    this.scheduleCacheChangeNotification =
      typeof options.scheduleCacheChangeNotification === 'function' ?
        options.scheduleCacheChangeNotification :
        defaultCacheChangeNotificationSchedule;
    this.tables = new Map();
    this.appliedSchemaVersions = new Map();
    this.lastAppliedAtMsByTableName = new Map();
    this.lastAppliedCauseIdByTableName = new Map();
    this.lastAuthoritativeObservedAtMsByTableName = new Map();
    this.lastAuthoritativeObservedCauseIdByTableName = new Map();
    this.lastCdcObservationByTableName = new Map();
    // Monotonic per-table apply counter. Unlike lastAppliedAtMs (wall-clock,
    // same-millisecond applies collide) a version can arbitrate "did anything
    // change since capture" exactly, so multi-table snapshot reuse never has
    // to infer table freshness from another table's watermark.
    this.mutationVersionByTableName = new Map();
    // The last shared table generation applied to each key. Entries deliberately
    // survive row deletion so an authoritative read can fence equal-value
    // same-key mutations without being blocked by unrelated table traffic.
    this.mutationVersionByTableKey = new Map();
    this.listeners = new Set();
    this.logger = LoggingService.getInstance().forSubsystem(CACHE_SUBSYSTEM.CACHE);
    this.currentEpoch = CACHE_DEFAULT.INITIAL_EPOCH;
    // The cache's own timestamp authority: the mutation watermark below is
    // read back as evidence of when a table last changed, so it must be the
    // owning node's time rather than the process's. The default is
    // RealTimeSource, so production is byte-identical.
    this.timeSource = resolveTimeSource(options);
    // Unique ID for debugging cache instance issues. DIAGNOSTIC IDENTITY, not
    // a clock consumer: a caller that needs a deterministic instance name
    // supplies one, and the ambient default is untouched for everyone else.
    // Deriving it from node time instead would quietly make a debug string
    // into a semantic timestamp.
    this._cacheId = options.cacheId ||
      `${CACHE_DEFAULT.CACHE_ID_PREFIX}${Date.now()}-` +
      `${Math.random().toString(CACHE_DEFAULT.CACHE_ID_RADIX)
        .substr(CACHE_DEFAULT.CACHE_ID_START, CACHE_DEFAULT.CACHE_ID_LENGTH)}`;

    // Initialize empty maps for each system table
    for (const tableName of SYSTEM_TABLES) {
      this.tables.set(tableName, new Map());
      this.lastCdcObservationByTableName.set(tableName, new Map());
      this.mutationVersionByTableKey.set(tableName, new Map());
    }
    this.tombstoneStore = new SystemTableCacheTombstoneStore(SYSTEM_TABLES, {
      // The child reads the parent's clock: one physical-time domain for
      // every timestamp the authoritative-absence comparison touches.
      timeSource: this.timeSource,
      onEvict: (tableName, key) => {
        if (!this.tables.get(tableName).has(key)) {
          this.mutationVersionByTableKey.get(tableName).delete(key);
        }
      },
    });
  }

  /**
   * Anti-entropy backstop: delete cache-only rows that are absent from
   * authoritative truth. This is the durable healer for a genuinely-lost DELETE
   * (no tombstone could be formed because the DELETE never arrived).
   *
   * SAFETY: the caller MUST pass a COMPLETE authoritative row set for every table
   * it lists — a row absent from `truthSnapshot[tableName]` is treated as deleted
   * and evicted. Omit a table entirely to leave its cache untouched. Passing a
   * partial/stale snapshot will evict live rows.
   *
   * RACE GUARD: when `options.evictOlderThanMs` is given (e.g. the authoritative
   * read's start time), a cache-only row whose `updated_at` is at/after that time
   * is NOT evicted — it may be a write committed after the snapshot was taken and
   * not yet reflected in it. A genuinely-resurrected row (from a lost DELETE) is
   * older than the read and is still swept.
   *
   * @param {Object<string, Array<Object>>} truthSnapshot - tableName -> complete
   *   authoritative rows.
   * @param {Object} [options]
   * @param {number} [options.evictOlderThanMs] - Only evict rows older than this.
   * @return {{removed: Array<{tableName: string, key: string}>}}
   */
  reconcileAgainstAuthoritativeTruth(truthSnapshot = {}, options = {}) {
    return reconcileSystemTableCacheAgainstAuthoritativeTruth(
      this,
      truthSnapshot,
      options,
    );
  }

  /**
   * Apply an owner-sanctioned system-table change to the cache.
   * This method should ONLY be called by CDC event handlers, bootstrap hydration,
   * or the canonical authoritative-reconciliation gateway.
   * @param {string} tableName - Name of the system table.
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Record data (must include primary key field).
   * @param {Object} options - Cause and owner-owned mutation mode.
   * @throws {Error} If operation is invalid or data is missing required fields.
   */
  applySystemTableChange(tableName, operation, data, options = {}) {
    this.validateTableName(tableName);
    this.validateOperation(operation);

    const causeId = normalizeCauseId(options?.causeId);
    const mutationMode = options?.mutationMode ||
      SYSTEM_TABLE_CACHE_MUTATION_MODE.CDC_MERGE;
    this.validateMutationMode(mutationMode, operation, tableName, options);

    // Get the primary key field for this table
    const pkField = getSystemCachePrimaryKeyField(tableName);
    const key = resolveSystemCacheRowKey(tableName, data);

    if (!data || typeof key === 'undefined') {
      throw new Error(CACHE_ERROR_MSG.primaryKeyMissing(pkField));
    }
    this.validateMutationKey(mutationMode, operation, key);

    const table = this.tables.get(tableName);
    const authoritativeAbsence = mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_ABSENCE_RECONCILIATION;
    const completeAuthoritativePresence = mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_OBSERVATION_RECONCILIATION;
    let recordForNotification = null;
    let incomingVersionAccepted = false;

    // A write (INSERT/UPDATE/UPSERT) for a key under an active DELETE tombstone is
    // a reordered, causally-older resurrection — reject it. A causally-newer write
    // clears the tombstone inside the check and proceeds (legitimate re-create).
    if (cacheWriteIsFenced({
      cache: this,
      table,
      tableName,
      operation,
      key,
      data,
      completeAuthoritativePresence,
      authoritativeObservedAtMs: options?.authoritativeObservedAtMs,
      authoritativeReadStartedAtMs:
        options?.authoritativeReadStartedAtMs,
    })) {
      this.logger.debug(CACHE_LOG_MSG.WRITE_FENCED_BY_TOMBSTONE, {
        tableName,
        key,
        operation,
      });
      return;
    }

    switch (operation) {
    case CDC_OPERATIONS.INSERT:
      if (table.has(key)) {
        const existing = table.get(key);
        if (this.isStaleForExistingRecord(tableName, existing, data)) {
          const staleMergeResult = this.applyStaleRowBackfill(
            tableName,
            table,
            key,
            existing,
            data,
          );
          if (staleMergeResult.applied) {
            recordForNotification = staleMergeResult.record;
          }
          this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, {
            tableName,
            key,
            operation,
            existingUpdatedAt: this.getRecordTimestamp(existing),
            incomingUpdatedAt: this.getRecordTimestamp(data),
            backfilledFields: staleMergeResult.backfilledFields,
          });
          break;
        }
        this.logger.debug(CACHE_LOG_MSG.INSERT_ON_EXISTING_KEY_TREAT_UPDATE, {
          tableName,
          key,
        });
      }
      table.set(key, this.deepClone(data));
      recordForNotification = data;
      incomingVersionAccepted = true;
      break;

    case CDC_OPERATIONS.UPDATE:
      if (!table.has(key)) {
        this.logger.debug(CACHE_LOG_MSG.UPDATE_ON_MISSING_KEY_TREAT_INSERT, {
          tableName,
          key,
        });
        table.set(key, this.deepClone(data));
      } else {
        const existing = table.get(key);
        if (this.isStaleForExistingRecord(tableName, existing, data)) {
          const staleMergeResult = this.applyStaleRowBackfill(
            tableName,
            table,
            key,
            existing,
            data,
          );
          if (staleMergeResult.applied) {
            recordForNotification = staleMergeResult.record;
          }
          this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, {
            tableName,
            key,
            operation,
            existingUpdatedAt: this.getRecordTimestamp(existing),
            incomingUpdatedAt: this.getRecordTimestamp(data),
            backfilledFields: staleMergeResult.backfilledFields,
          });
          break;
        }
        table.set(key, this.mergeRecords(tableName, existing, data));
      }
      recordForNotification = table.get(key);
      incomingVersionAccepted = true;
      break;

    case CDC_OPERATIONS.UPSERT:
      if (!table.has(key)) {
        table.set(key, this.deepClone(data));
      } else {
        const existing = table.get(key);
        if (
          mutationMode ===
          SYSTEM_TABLE_CACHE_MUTATION_MODE
            .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION
        ) {
          table.set(
            key,
            buildAuthoritativeServiceLifecycleCacheReplacement(
              existing,
              data,
            ),
          );
        } else if (this.isStaleForExistingRecord(
          tableName,
          existing,
          data,
        )) {
          const staleMergeResult = this.applyStaleRowBackfill(
            tableName,
            table,
            key,
            existing,
            data,
          );
          if (staleMergeResult.applied) {
            recordForNotification = staleMergeResult.record;
          }
          this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, {
            tableName,
            key,
            operation,
            existingUpdatedAt: this.getRecordTimestamp(existing),
            incomingUpdatedAt: this.getRecordTimestamp(data),
            backfilledFields: staleMergeResult.backfilledFields,
          });
          break;
        } else if (
          mutationMode ===
            SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION ||
          mutationMode ===
            SYSTEM_TABLE_CACHE_MUTATION_MODE
              .AUTHORITATIVE_OBSERVATION_RECONCILIATION
        ) {
          table.set(
            key,
            buildAuthoritativeSystemTableCacheReplacement(existing, data),
          );
        } else {
          table.set(key, this.mergeRecords(tableName, existing, data));
        }
      }
      recordForNotification = table.get(key);
      incomingVersionAccepted = true;
      break;

    case CDC_OPERATIONS.DELETE:
      if (!table.has(key)) {
        // Reorder case: the DELETE arrived before its INSERT. Leave a tombstone so
        // the late INSERT cannot resurrect the row.
        this.tombstoneStore.record(
          tableName,
          key,
          data,
          {
            authoritativeAbsence,
            authoritativeObservedAtMs: options?.authoritativeObservedAtMs,
          },
        );
        this.logger.debug(CACHE_LOG_MSG.DELETE_ON_MISSING_KEY_IGNORED, {
          tableName,
          key,
        });
      } else {
        const existing = table.get(key);
        if (this.isStaleForExistingRecord(tableName, existing, data)) {
          // The row is causally newer than this DELETE: the delete is superseded,
          // so it must NOT leave a tombstone that would fence the live row.
          this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, {
            tableName,
            key,
            operation,
            existingUpdatedAt: this.getRecordTimestamp(existing),
            incomingUpdatedAt: this.getRecordTimestamp(data),
          });
          break;
        }
        recordForNotification = existing;
        table.delete(key);
        this.tombstoneStore.record(
          tableName,
          key,
          data,
          {
            authoritativeAbsence,
            authoritativeObservedAtMs: options?.authoritativeObservedAtMs,
          },
        );
        incomingVersionAccepted = true;
      }
      break;
    }

    this.logger.debug(CACHE_LOG_MSG.APPLIED_CDC_EVENT, {
      tableName,
      operation,
      key,
      causeId,
    });

    // Notify listeners after applying the change
    if (recordForNotification) {
      updateSystemTableCacheCdcObservation({
        tableName,
        key,
        operation,
        data,
        options,
        incomingVersionAccepted,
        observationTable:
          this.lastCdcObservationByTableName.get(tableName),
        resultingRow: table.get(key),
      });
      this.lastAppliedAtMsByTableName.set(tableName, this.timeSource.now());
      this.lastAppliedCauseIdByTableName.set(tableName, causeId);
      const tableMutationRevision = this.recordTableMutation(tableName, key);
      this.notifyListeners(
        tableName,
        operation,
        this.deepClone(recordForNotification),
        Object.freeze({causeId, tableMutationRevision}),
      );
    }
  }

  /**
   * Clear all data from the cache.
   * Used primarily for testing.
   */
  clear() {
    for (const tableName of SYSTEM_TABLES) {
      this.tables.get(tableName).clear();
    }
    this.tombstoneStore.clear();
    this.appliedSchemaVersions.clear();
    this.lastAppliedAtMsByTableName.clear();
    this.lastAppliedCauseIdByTableName.clear();
    this.lastAuthoritativeObservedAtMsByTableName.clear();
    this.lastAuthoritativeObservedCauseIdByTableName.clear();
    for (const tableName of SYSTEM_TABLES) {
      this.lastCdcObservationByTableName.get(tableName).clear();
      this.mutationVersionByTableKey.get(tableName).clear();
    }
    this.mutationVersionByTableName.clear();
    this.logger.debug(CACHE_LOG_MSG.CACHE_CLEARED);
  }

  /**
   * Get the list of supported system table names.
   * @return {Array<string>} Array of system table names.
   */
  getTableNames() {
    return [...SYSTEM_TABLES];
  }

  /**
   * Validate that a table name is a valid system table.
   * @param {string} tableName - Name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (!SYSTEM_TABLES.includes(tableName)) {
      throw new Error(
        CACHE_ERROR_MSG.invalidTableName(tableName, SYSTEM_TABLES),
      );
    }
  }

  /**
   * Validate that an operation is a valid CDC operation.
   * @param {string} operation - Operation to validate.
   * @throws {Error} If operation is invalid.
   * @private
   */
  validateOperation(operation) {
    if (!Object.values(CDC_OPERATIONS).includes(operation)) {
      throw new Error(
        CACHE_ERROR_MSG.invalidCdcOperation(
          operation,
          Object.values(CDC_OPERATIONS),
        ),
      );
    }
  }

  /**
   * Restrict exact authoritative replacement to its owner-sanctioned UPSERT.
   * @param {string} mutationMode - Named cache mutation mode.
   * @param {string} operation - CDC operation.
   * @throws {Error} If the mode is unknown or incompatible with the operation.
   * @private
   */
  validateMutationMode(mutationMode, operation, tableName, options = {}) {
    const modeKnown = Object.values(
      SYSTEM_TABLE_CACHE_MUTATION_MODE,
    ).includes(mutationMode);
    if (!modeKnown || !mutationOperationCompatible(mutationMode, operation) ||
        !mutationTableCompatible(mutationMode, tableName) ||
        !mutationObservationCompatible(
          mutationMode,
          options,
          this.getLastAuthoritativeObservedAtMs(tableName),
        )) {
      throw new Error(
        CACHE_ERROR_MSG.invalidMutationMode(mutationMode, operation),
      );
    }
  }

  validateMutationKey(mutationMode, operation, key) {
    const completeObservationMode = mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_OBSERVATION_RECONCILIATION;
    if (completeObservationMode && !isUsableSystemCacheKey(key)) {
      throw new Error(
        CACHE_ERROR_MSG.invalidMutationMode(mutationMode, operation),
      );
    }
  }

  /**
   * Deep clone an object to prevent external mutation. Sits on every cache
   * read (get/find/filter/getAll), which the readiness/recovery projection
   * pipeline drives at table-scan frequency — must never JSON-roundtrip
   * (closure record CL-011: 41% of the stalled seed's gap-window samples).
   * @param {Object} obj - Object to clone.
   * @return {Object} Cloned object.
   * @private
   */
  deepClone(obj) {
    return fastJsonClone(obj);
  }

  /**
   * Get a comparable timestamp from a row.
   * Prefers updated_at, then created_at.
   * @param {Object} record - Row record.
   * @return {number|null} Comparable timestamp or null.
   * @private
   */
  getRecordTimestamp(record) {
    return getRecordTimestamp(record);
  }

  /**
   * Determine whether an incoming CDC row is stale versus existing cache row.
   * @param {string} tableName - Table name.
   * @param {Object} existing - Existing cached row.
   * @param {Object} incoming - Incoming CDC row.
   * @return {boolean} True when incoming row is older.
   * @private
   */
  isStaleForExistingRecord(tableName, existing, incoming) {
    return isStaleForExistingRecord(tableName, existing, incoming);
  }

  /**
   * Backfill missing fields from a stale CDC row without overriding newer data.
   * @param {Map<string, Object>} table - Table storage map.
   * @param {string} key - Primary key value.
   * @param {Object} existing - Existing cached row.
   * @param {Object} incoming - Incoming stale row.
   * @return {{applied: boolean, record: Object, backfilledFields: string[]}}
   * @private
   */
  applyStaleRowBackfill(tableName, table, key, existing, incoming) {
    return applyStaleRowBackfill(
      tableName,
      table,
      key,
      existing,
      incoming,
    );
  }

  /**
   * Clone one field value while preserving primitives/null.
   * @param {*} value - Field value.
   * @return {*} Cloned value.
   * @private
   */
  cloneFieldValue(value) {
    return cloneFieldValue(value);
  }

  /**
   * Determine if a stale incoming field may backfill an existing missing field.
   * @param {*} existingValue - Existing field value.
   * @param {*} incomingValue - Incoming stale field value.
   * @return {boolean} True when the field should be backfilled.
   * @private
   */
  shouldBackfillMissingField(existingValue, incomingValue) {
    return shouldBackfillMissingField(existingValue, incomingValue);
  }

  /**
   * Merge records for tables that require monotonic field semantics.
   * @param {string} tableName - Table name.
   * @param {Object} existing - Existing cached row.
   * @param {Object} incoming - Incoming CDC row.
   * @return {Object}
   * @private
   */
  mergeRecords(tableName, existing, incoming) {
    return mergeRecords(tableName, existing, incoming);
  }

  /**
   * Determine whether control-plane publication merge semantics apply.
   * @param {Object} existing - Existing cached row.
   * @param {Object} incoming - Incoming CDC row.
   * @return {boolean}
   * @private
   */
  shouldUsePublicationMerge(existing, incoming) {
    return shouldUsePublicationMerge(existing, incoming);
  }

  /**
   * Compare schema/version watermarks.
   * Supports HLC strings primarily, with number/string fallback ordering.
   * @param {string|number} incomingVersion
   * @param {string|number} currentVersion
   * @return {number}
   * @private
   */
  compareSchemaVersions(incomingVersion, currentVersion) {
    return compareSchemaVersions(incomingVersion, currentVersion);
  }

  /**
   * Best-effort parse for HLC-formatted version values.
   * @param {string|number} value
   * @return {HLCTimestamp|null}
   * @private
   */
  tryParseHLCTimestamp(value) {
    return tryParseHLCTimestamp(value);
  }
}

assignSystemTableCacheObservationMethods(SystemTableCache);

export {
  SystemTableCache,
  SYSTEM_TABLES,
  CDC_OPERATIONS,
  PRIMARY_KEY_FIELDS,
  getSharedRowReadStats,
  resetSharedRowReadStats,
};
