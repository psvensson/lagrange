/**
 * System Table Cache - In-memory cache for system tables.
 * Maintains cached copies of system tables (nodes, partitions, tables,
 * services, message_groups, indices) synchronized via CDC events.
 * Requirements: 4.4, 4.5, 4.8
 */

import {TABLES} from '../constants/index.js';
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
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
  getSystemCachePrimaryKeyField,
} from './system-cache-key-descriptor.js';
import {
  applyStaleRowBackfill,
  getRecordHlc,
  cloneFieldValue,
  compareSchemaVersions,
  getRecordTimestamp,
  isStaleForExistingRecord,
  mergeRecords,
  shouldBackfillMissingField,
  shouldUsePublicationMerge,
  tryParseHLCTimestamp,
} from './system-table-cache-row-merge.js';
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
 * How long a DELETE tombstone is retained before it is GC'd. The bound must
 * outlast any in-flight reorder/catch-up window so a late causally-older write is
 * still fenced, while keeping tombstone memory bounded. The anti-entropy sweep is
 * the durable backstop once a tombstone expires.
 */
const TOMBSTONE_TTL_MS = 30000;

/**
 * Hard cap on retained tombstones per table. Bounds memory for tables whose keys
 * are deleted and never re-written (so the TTL, which is only enforced on access,
 * cannot leak unboundedly): when exceeded, the oldest tombstones are evicted.
 */
const TOMBSTONE_MAX_PER_TABLE = 1024;

/**
 * Primary key field names for each system table.
 */
const PRIMARY_KEY_FIELDS = SYSTEM_CACHE_KEY_DESCRIPTOR;

/**
 * CDC operation types.
 */
const CDC_OPERATIONS = CACHE_CDC_OPERATIONS;

/**
 * SystemTableCache provides in-memory caching for system tables.
 * Only CDC event handlers should have write access to this cache.
 * Requirements: 7.1, 7.2 - Cache tracks current epoch and provides epoch methods
 */
class SystemTableCache {
  /**
   * Create a new SystemTableCache instance.
   */
  constructor() {
    this.tables = new Map();
    // DELETE tombstones: tableName -> Map(key -> {hlc, updatedAt, deletedAtMs}).
    // A tombstone fences a later-delivered, causally-older write from resurrecting
    // a deleted row (the reorder case), and is GC'd after a durable-aware bound.
    this.tombstones = new Map();
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
    this.listeners = new Set();
    this.logger = LoggingService.getInstance().forSubsystem(CACHE_SUBSYSTEM.CACHE);
    this.currentEpoch = CACHE_DEFAULT.INITIAL_EPOCH;
    // Unique ID for debugging cache instance issues
    this._cacheId = `${CACHE_DEFAULT.CACHE_ID_PREFIX}${Date.now()}-` +
      `${Math.random().toString(CACHE_DEFAULT.CACHE_ID_RADIX)
        .substr(CACHE_DEFAULT.CACHE_ID_START, CACHE_DEFAULT.CACHE_ID_LENGTH)}`;

    // Initialize empty maps for each system table
    for (const tableName of SYSTEM_TABLES) {
      this.tables.set(tableName, new Map());
      this.tombstones.set(tableName, new Map());
      this.lastCdcObservationByTableName.set(tableName, new Map());
    }
  }

  /**
   * Read the version stamps used for tombstone fencing from a record/tombstone.
   * @param {Object} source - Record or tombstone carrying version stamps.
   * @return {{hlc: Object|null, updatedAt: number}}
   */
  versionStampsOf(source) {
    return {
      hlc: getRecordHlc(source),
      updatedAt: getRecordTimestamp(source),
    };
  }

  /**
   * Whether an incoming write is causally NEWER than a tombstone (a genuine
   * re-create after delete) rather than a late, causally-older resurrecting write.
   * Prefers the origin HLC; falls back to wall-clock `updated_at`; when neither is
   * comparable it does NOT fence (avoids blocking writes that carry no version).
   * @param {Object} data - Incoming write record.
   * @param {Object} tombstone - Stored tombstone.
   * @return {boolean} True when the write supersedes the tombstone.
   */
  writeSupersedesTombstone(data, tombstone) {
    const incoming = this.versionStampsOf(data);
    if (incoming.hlc && tombstone.hlc) {
      return incoming.hlc.compare(tombstone.hlc) > 0;
    }
    if (Number.isFinite(incoming.updatedAt) &&
        Number.isFinite(tombstone.updatedAt)) {
      // Without an HLC, wall-clock cannot distinguish an equal-millisecond
      // re-create from the deleted state, so fence ONLY a strictly-older write.
      // Equal-or-newer supersedes — avoids wrongly fencing a legitimate recreate.
      return incoming.updatedAt >= tombstone.updatedAt;
    }
    return true;
  }

  /**
   * Drop a tombstone once it has outlived the retention bound.
   * @param {Map} tombstoneTable - Per-table tombstone map.
   * @param {string} key - Row key.
   * @param {Object} tombstone - Stored tombstone.
   * @param {number} nowMs - Current epoch ms.
   * @return {boolean} True when the tombstone was expired and removed.
   */
  evictExpiredTombstone(tombstoneTable, key, tombstone, nowMs) {
    if (nowMs - tombstone.deletedAtMs > TOMBSTONE_TTL_MS) {
      tombstoneTable.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Record a DELETE tombstone for a key, keeping the causally-latest delete.
   * @param {string} tableName - System table name.
   * @param {string} key - Row key.
   * @param {Object} data - DELETE record carrying the delete's version stamps.
   */
  recordTombstone(tableName, key, data) {
    const tombstoneTable = this.tombstones.get(tableName);
    if (!tombstoneTable) {
      return;
    }
    const incoming = this.versionStampsOf(data);
    const existing = tombstoneTable.get(key);
    if (existing && !this.writeSupersedesTombstone(data, existing)) {
      return;
    }
    tombstoneTable.set(key, {
      hlc: incoming.hlc,
      updatedAt: incoming.updatedAt,
      deletedAtMs: Date.now(),
    });
    this.pruneTombstones(tombstoneTable);
  }

  /**
   * Bound a per-table tombstone map: drop expired entries, then evict the oldest
   * (by delete time) until the map is within the hard cap. Insertion order in a
   * Map is chronological, so the first keys are the oldest.
   * @param {Map} tombstoneTable - Per-table tombstone map.
   */
  pruneTombstones(tombstoneTable) {
    const nowMs = Date.now();
    for (const [key, tombstone] of tombstoneTable) {
      this.evictExpiredTombstone(tombstoneTable, key, tombstone, nowMs);
    }
    while (tombstoneTable.size > TOMBSTONE_MAX_PER_TABLE) {
      const oldestKey = tombstoneTable.keys().next().value;
      tombstoneTable.delete(oldestKey);
    }
  }

  /**
   * Decide whether a write to `key` is fenced by an active DELETE tombstone. A
   * superseding (causally-newer) write clears the tombstone and proceeds; an
   * older/concurrent write is rejected so a reordered DELETE cannot be undone.
   * @param {string} tableName - System table name.
   * @param {string} key - Row key.
   * @param {Object} data - Incoming write record.
   * @return {boolean} True when the write must be rejected.
   */
  writeIsFencedByTombstone(tableName, key, data) {
    const tombstoneTable = this.tombstones.get(tableName);
    const tombstone = tombstoneTable?.get(key);
    if (!tombstone) {
      return false;
    }
    if (this.evictExpiredTombstone(tombstoneTable, key, tombstone, Date.now())) {
      return false;
    }
    if (this.writeSupersedesTombstone(data, tombstone)) {
      tombstoneTable.delete(key);
      return false;
    }
    return true;
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
    const evictOlderThanMs = Number.isFinite(options.evictOlderThanMs) ?
      options.evictOlderThanMs : null;
    const removed = [];
    for (const [tableName, authoritativeRows] of Object.entries(truthSnapshot)) {
      if (!this.tables.has(tableName)) {
        continue;
      }
      // A non-array value is NOT a valid "complete authoritative set" — treating it
      // as empty would wipe the whole table. Skip it (leave the cache untouched).
      if (!Array.isArray(authoritativeRows)) {
        continue;
      }
      const table = this.tables.get(tableName);
      const pkField = getSystemCachePrimaryKeyField(tableName);
      const authoritativeKeys = new Set(
        authoritativeRows
          // Derive keys exactly as applySystemTableChange does (`||` fallback) so
          // they align with how rows are stored; a mismatch would evict live rows.
          .map((row) => row?.[pkField] || row?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK])
          .filter((key) => typeof key !== 'undefined'),
      );
      for (const key of [...table.keys()]) {
        if (authoritativeKeys.has(key)) {
          continue;
        }
        const evicted = table.get(key);
        if (evictOlderThanMs !== null) {
          const rowTimestamp = getRecordTimestamp(evicted);
          if (Number.isFinite(rowTimestamp) && rowTimestamp >= evictOlderThanMs) {
            continue;
          }
        }
        table.delete(key);
        this.lastCdcObservationByTableName.get(tableName).delete(key);
        removed.push({tableName, key});
        this.logger.debug(CACHE_LOG_MSG.ANTI_ENTROPY_SWEEP_DELETE, {
          tableName,
          key,
        });
        this.lastAppliedAtMsByTableName.set(tableName, Date.now());
        this.bumpTableMutationVersion(tableName);
        this.notifyListeners(
          tableName,
          CDC_OPERATIONS.DELETE,
          this.deepClone(evicted),
          {causeId: normalizeCauseId(null)},
        );
      }
    }
    return {removed};
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
    this.validateMutationMode(mutationMode, operation, tableName);

    // Get the primary key field for this table
    const pkField = getSystemCachePrimaryKeyField(tableName);
    const key = data[pkField] || data[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];

    if (!data || typeof key === 'undefined') {
      throw new Error(CACHE_ERROR_MSG.primaryKeyMissing(pkField));
    }

    const table = this.tables.get(tableName);
    let recordForNotification = null;
    let incomingVersionAccepted = false;

    // A write (INSERT/UPDATE/UPSERT) for a key under an active DELETE tombstone is
    // a reordered, causally-older resurrection — reject it. A causally-newer write
    // clears the tombstone inside the check and proceeds (legitimate re-create).
    if (operation !== CDC_OPERATIONS.DELETE &&
        this.writeIsFencedByTombstone(tableName, key, data)) {
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
          SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION
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
        this.recordTombstone(tableName, key, data);
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
        this.recordTombstone(tableName, key, data);
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
      this.lastAppliedAtMsByTableName.set(tableName, Date.now());
      this.lastAppliedCauseIdByTableName.set(tableName, causeId);
      this.bumpTableMutationVersion(tableName);
      this.notifyListeners(
        tableName,
        operation,
        this.deepClone(recordForNotification),
        {causeId},
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
      this.tombstones.get(tableName).clear();
    }
    this.appliedSchemaVersions.clear();
    this.lastAppliedAtMsByTableName.clear();
    this.lastAppliedCauseIdByTableName.clear();
    this.lastAuthoritativeObservedAtMsByTableName.clear();
    this.lastAuthoritativeObservedCauseIdByTableName.clear();
    for (const tableName of SYSTEM_TABLES) {
      this.lastCdcObservationByTableName.get(tableName).clear();
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
  validateMutationMode(mutationMode, operation, tableName) {
    const modeKnown = Object.values(
      SYSTEM_TABLE_CACHE_MUTATION_MODE,
    ).includes(mutationMode);
    const authoritativeMode =
      mutationMode ===
        SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION ||
      mutationMode ===
        SYSTEM_TABLE_CACHE_MUTATION_MODE
          .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION;
    const operationCompatible =
      !authoritativeMode ||
      operation === CDC_OPERATIONS.UPSERT;
    const tableCompatible =
      mutationMode !==
        SYSTEM_TABLE_CACHE_MUTATION_MODE
          .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION ||
      tableName === TABLES.SERVICES;
    if (!modeKnown || !operationCompatible || !tableCompatible) {
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
