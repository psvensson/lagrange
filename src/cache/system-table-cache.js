/**
 * System Table Cache - In-memory cache for system tables.
 * Maintains cached copies of system tables (nodes, partitions, tables,
 * services, message_groups, indices) synchronized via CDC events.
 * Requirements: 4.4, 4.5, 4.8
 */

import {LoggingService} from '../logging/logging-service.js';
import {COLUMN, NUM, STATE, TABLES, TYPEOF} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {deepFreeze} from '../utils/deep-freeze.js';
import {
  CACHE_CDC_OPERATIONS,
  CACHE_DEFAULT,
  CACHE_ERROR_MSG,
  CACHE_LOG_MSG,
  CACHE_SUBSYSTEM,
  CACHE_SYSTEM_TABLES,
} from './cache-constants.js';
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

const SHARED_ROW_READ_FLAG = 'LAGRANGE_PR_SNAPSHOT_SHARED_ROW_READ';

let sharedRowReadEngagements = 0;

/**
 * @return {boolean} True when the no-clone shared-row read lever is enabled.
 */
function isSharedRowReadEnabled() {
  return process.env[SHARED_ROW_READ_FLAG] === 'true';
}

/**
 * Engagement counter for the directed micro-repro: proves the no-clone shared
 * read path FIRES (rows returned without a per-read clone) rather than
 * silently delegating to the cloning path.
 * @return {{engagements: number}}
 */
function getSharedRowReadStats() {
  return {engagements: sharedRowReadEngagements};
}

/**
 * Reset the shared-row read engagement counter. Test-only seam.
 */
function resetSharedRowReadStats() {
  sharedRowReadEngagements = 0;
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
  constructor() {
    this.tables = new Map();
    // DELETE tombstones: tableName -> Map(key -> {hlc, updatedAt, deletedAtMs}).
    // A tombstone fences a later-delivered, causally-older write from resurrecting
    // a deleted row (the reorder case), and is GC'd after a durable-aware bound.
    this.tombstones = new Map();
    this.appliedSchemaVersions = new Map();
    this.lastAppliedAtMsByTableName = new Map();
    this.lastAppliedCauseIdByTableName = new Map();
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
    }
  }

  /**
   * Record the latest applied schema version for one system table.
   * Keeps the watermark monotonic when out-of-order CDC events are observed.
   * @param {string} tableName - Name of the system table.
   * @param {string|number} version - Applied schema/version watermark.
   * @return {string|number|null} Current stored watermark for this table.
   */
  recordAppliedSchemaVersion(tableName, version) {
    this.validateTableName(tableName);
    if (version === null || typeof version === TYPEOF.UNDEFINED) {
      return this.getAppliedSchemaVersion(tableName);
    }

    const currentVersion = this.appliedSchemaVersions.get(tableName);
    if (typeof currentVersion === TYPEOF.UNDEFINED ||
        this.compareSchemaVersions(version, currentVersion) >= NUM.ZERO) {
      this.appliedSchemaVersions.set(tableName, version);
      return version;
    }

    return currentVersion;
  }

  /**
   * Get the latest applied schema/version watermark for one table.
   * @param {string} tableName - Name of the system table.
   * @return {string|number|null} Stored watermark, or null if unknown.
   */
  getAppliedSchemaVersion(tableName) {
    this.validateTableName(tableName);
    return this.appliedSchemaVersions.get(tableName) ?? null;
  }

  /**
   * Get a read-only snapshot of applied schema/version watermarks.
   * @return {Object<string, string|number>} Table-to-watermark map.
   */
  getAppliedSchemaVersions() {
    const snapshot = {};
    for (const [tableName, version] of this.appliedSchemaVersions.entries()) {
      snapshot[tableName] = version;
    }
    return snapshot;
  }

  /**
   * Get the last local wall-clock time (ms) we applied a change for a system table.
   * @param {string} tableName - Name of the system table.
   * @return {number|null}
   */
  getLastAppliedAtMs(tableName) {
    this.validateTableName(tableName);
    return this.lastAppliedAtMsByTableName.get(tableName) ?? null;
  }

  /**
   * Get the last applied causal correlation ID for a system table, when available.
   * @param {string} tableName - Name of the system table.
   * @return {string|null}
   */
  getLastAppliedCauseId(tableName) {
    this.validateTableName(tableName);
    return this.lastAppliedCauseIdByTableName.get(tableName) ?? null;
  }

  /**
   * Get the current epoch number.
   * Requirements: 7.1, 7.2
   * @return {number} The current epoch number
   */
  getEpoch() {
    return this.currentEpoch;
  }

  /**
   * Update the cache from an AssignmentEpoch object.
   * Requirements: 7.1, 7.2, 7.5
   * @param {Object} epoch - AssignmentEpoch object with epoch, assignments,
   *                         timestamp, and proposedBy fields
   * @return {boolean} True if the update was applied, false if rejected
   *                   due to stale epoch
   * @throws {Error} If epoch is invalid or missing required fields
   */
  updateFromEpoch(epoch) {
    if (!epoch || typeof epoch !== TYPEOF.OBJECT) {
      throw new Error(CACHE_ERROR_MSG.EPOCH_INVALID_OBJECT);
    }

    if (typeof epoch.epoch !== TYPEOF.NUMBER) {
      throw new Error(CACHE_ERROR_MSG.EPOCH_MISSING_NUMBER);
    }

    if (!epoch.assignments || typeof epoch.assignments !== TYPEOF.OBJECT) {
      throw new Error(CACHE_ERROR_MSG.EPOCH_MISSING_ASSIGNMENTS);
    }

    // Requirement 7.5: Reject updates from older epochs
    if (epoch.epoch <= this.currentEpoch) {
      this.logger.debug(CACHE_LOG_MSG.REJECTED_STALE_EPOCH, {
        incomingEpoch: epoch.epoch,
        currentEpoch: this.currentEpoch,
      });
      return false;
    }

    // Atomic update: update epoch number
    this.currentEpoch = epoch.epoch;
    this.logger.debug(CACHE_LOG_MSG.UPDATED_EPOCH, {epoch: this.currentEpoch});
    return true;
  }

  /**
   * Get all nodes that are in the 'ready' state.
   * Requirements: 5.9 - Cache should filter nodes by state
   * @return {string[]} Array of node IDs that are in ready state
   */
  getReadyNodes() {
    const now = Date.now();
    const allNodes = this.getAll(TABLES.NODES) || [];

    this.logger.debug(CACHE_LOG_MSG.GET_READY_NODES_DEBUG, {
      totalNodes: allNodes.length,
      now,
      nodes: allNodes.map((n) => ({
        nodeId: n?.[COLUMN.NODE_ID],
        wsState: n?.[COLUMN.CONNECTION_STATE],
        leaseExpiry: n?.[COLUMN.READY_LEASE_EXPIRES_AT],
        leaseValid: n?.[COLUMN.READY_LEASE_EXPIRES_AT] > now,
      })),
    });

    const readyNodes = this.filter(TABLES.NODES, (node) => {
      const wsState = node?.[COLUMN.CONNECTION_STATE];
      const leaseExpiry = node?.[COLUMN.READY_LEASE_EXPIRES_AT];
      return wsState === STATE.READY && leaseExpiry && leaseExpiry > now;
    });

    return readyNodes.map((node) => {
      const nodeId = node?.[COLUMN.NODE_ID];
      assertCritical(nodeId, CACHE_ERROR_MSG.NODE_ID_MISSING);
      return nodeId;
    });
  }

  /**
   * Get all endpoints for a specific node from the node_endpoints table.
   * Endpoints are sorted by priority (lower priority value = higher preference).
   * Requirements: 6.6 - System_Cache SHALL provide methods to query endpoints by node_id
   * @param {string} nodeId - The node ID to get endpoints for
   * @return {Array<Object>} Array of endpoint records sorted by priority (ascending)
   */
  getEndpointsForNode(nodeId) {
    const endpoints = this.filter(TABLES.NODE_ENDPOINTS, (endpoint) => {
      return endpoint[COLUMN.NODE_ID] === nodeId;
    });

    // Sort by priority (lower value = higher preference)
    return endpoints.sort((a, b) => {
      const priorityA = a[COLUMN.PRIORITY] ?? NUM.ZERO;
      const priorityB = b[COLUMN.PRIORITY] ?? NUM.ZERO;
      return priorityA - priorityB;
    });
  }

  /**
   * Filter endpoints by status.
   * Requirements: 6.6 - System_Cache SHALL provide methods to query endpoints
   * @param {Array<Object>} endpoints - Array of endpoint records to filter
   * @param {string} status - Status to filter by (e.g., 'active', 'inactive')
   * @return {Array<Object>} Array of endpoints matching the specified status
   */
  filterEndpointsByStatus(endpoints, status) {
    if (!Array.isArray(endpoints)) {
      return [];
    }
    return endpoints.filter((endpoint) => {
      return endpoint[COLUMN.STATUS] === status;
    });
  }

  /**
   * Subscribe to cache change notifications.
   * Listeners receive (tableName, operation, record) on each change.
   * @param {Function} listener - Called with (tableName, operation, record)
   */
  onCacheChange(listener) {
    if (typeof listener !== TYPEOF.FUNCTION) {
      throw new Error(CACHE_ERROR_MSG.LISTENER_REQUIRED);
    }
    this.listeners.add(listener);
  }

  /**
   * Unsubscribe from cache change notifications.
   * @param {Function} listener - The listener to remove
   * @return {boolean} True if the listener was removed
   */
  offCacheChange(listener) {
    return this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of a cache change.
   * Uses setImmediate to make notifications non-blocking.
   * @param {string} tableName - Name of the system table
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE)
   * @param {Object} record - The record data
   * @private
   */
  notifyListeners(tableName, operation, record, metadata) {
    if (this.listeners.size === NUM.ZERO) {
      return;
    }

    const normalizedMetadata = metadata && typeof metadata === TYPEOF.OBJECT ?
      metadata :
      null;

    // Use setImmediate to make notifications non-blocking
    setImmediate(() => {
      for (const listener of this.listeners) {
        try {
          listener(tableName, operation, record, normalizedMetadata);
        } catch (error) {
          // Log but don't re-throw - listener errors should not break other listeners
          this.logger.warn(CACHE_LOG_MSG.CACHE_LISTENER_ERROR, {error: error.message});
        }
      }
    });
  }

  /**
   * Get all data from the cache for a cache dump.
   * @return {Object} All cache data by table name { tableName: [...rows] }
   */
  getAllData() {
    const data = {};
    for (const [tableName, table] of this.tables) {
      data[tableName] = Array.from(table.values()).map((r) => this.deepClone(r));
    }
    return data;
  }

  /**
   * Get a single record by key from a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {Object|undefined} The record or undefined if not found.
   */
  get(tableName, key) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    const record = table.get(key);
    return record ? this.deepClone(record) : undefined;
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Object|undefined} The first matching record or undefined.
   */
  find(tableName, predicate) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);

    for (const record of table.values()) {
      if (predicate(record)) {
        return this.deepClone(record);
      }
    }

    return undefined;
  }

  /**
   * Read-isolation view of a stored row for the scan reads (getAll/filter).
   * Default behavior CLONES (fastJsonClone) so the caller owns a mutable copy.
   * Under the default-off lever LAGRANGE_PR_SNAPSHOT_SHARED_ROW_READ the row is
   * instead deep-FROZEN and shared (isolation by immutability, amortized once per
   * stored row vs. cloned every read) — the V8 profiler's #1 cluster-wide frame.
   * The returned ARRAY (built by the callers below) stays mutable, so
   * rows.sort()/filter()/push() are unaffected; only in-place row-field mutation
   * throws (subagent-audited + full-suite-verified read-only consumers).
   * @param {Object} record - Stored row.
   * @return {Object} Frozen shared row (lever on) or a fresh clone (off).
   * @private
   */
  readView(record) {
    if (!isSharedRowReadEnabled()) {
      return this.deepClone(record);
    }
    sharedRowReadEngagements += 1;
    return deepFreeze(record);
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Array<Object>} Array of matching records.
   */
  filter(tableName, predicate) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    const results = [];

    for (const record of table.values()) {
      if (predicate(record)) {
        results.push(this.readView(record));
      }
    }

    return results;
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - Name of the system table.
   * @return {Array<Object>} Array of all records in the table.
   */
  getAll(tableName) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return Array.from(table.values()).map((record) => this.readView(record));
  }

  /**
   * Read isolation for a hot read-only path WITHOUT the per-read deep clone.
   * Default-off lever LAGRANGE_PR_SNAPSHOT_SHARED_ROW_READ: when on, returns the
   * STORED rows deep-frozen and shared (isolation by immutability, amortized
   * freeze) instead of cloning every row every read; when off, delegates to the
   * cloning getAll so behavior is byte-identical. Safe only for read-only
   * consumers — subagent-audited for the priority-recovery snapshot path.
   * @param {string} tableName - Name of the system table.
   * @return {Array<Object>} Frozen shared rows (lever on) or fresh clones (off).
   */
  getAllShared(tableName) {
    if (!isSharedRowReadEnabled()) {
      return this.getAll(tableName);
    }
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return Array.from(table.values()).map((record) => {
      sharedRowReadEngagements += 1;
      return deepFreeze(record);
    });
  }

  /**
   * Filter records WITHOUT the per-read deep clone, returning frozen shared
   * rows under the same default-off lever as {@link getAllShared}. Off-path is
   * byte-identical to {@link filter}.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Returns true for matching records.
   * @return {Array<Object>} Frozen shared matches (lever on) or clones (off).
   */
  filterShared(tableName, predicate) {
    if (!isSharedRowReadEnabled()) {
      return this.filter(tableName, predicate);
    }
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    const results = [];
    for (const record of table.values()) {
      if (predicate(record)) {
        sharedRowReadEngagements += 1;
        results.push(deepFreeze(record));
      }
    }
    return results;
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {boolean} True if the record exists.
   */
  has(tableName, key) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return table.has(key);
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - Name of the system table.
   * @return {number} Number of records in the table.
   */
  count(tableName) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return table.size;
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
      return incoming.hlc.compare(tombstone.hlc) > NUM.ZERO;
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
          .filter((key) => typeof key !== TYPEOF.UNDEFINED),
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
        removed.push({tableName, key});
        this.logger.debug(CACHE_LOG_MSG.ANTI_ENTROPY_SWEEP_DELETE, {
          tableName,
          key,
        });
        this.lastAppliedAtMsByTableName.set(tableName, Date.now());
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
   * Apply a CDC change to the cache.
   * This method should ONLY be called by CDC event handlers or bootstrap hydration.
   * @param {string} tableName - Name of the system table.
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Record data (must include primary key field).
   * @throws {Error} If operation is invalid or data is missing required fields.
   */
  applySystemTableChange(tableName, operation, data, options = {}) {
    this.validateTableName(tableName);
    this.validateOperation(operation);

    const causeId = normalizeCauseId(options?.causeId);

    // Get the primary key field for this table
    const pkField = getSystemCachePrimaryKeyField(tableName);
    const key = data[pkField] || data[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];

    if (!data || typeof key === TYPEOF.UNDEFINED) {
      throw new Error(CACHE_ERROR_MSG.primaryKeyMissing(pkField));
    }

    const table = this.tables.get(tableName);
    let recordForNotification = null;

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
      break;

    case CDC_OPERATIONS.UPSERT:
      if (!table.has(key)) {
        table.set(key, this.deepClone(data));
      } else {
        const existing = table.get(key);
        if (this.isStaleForExistingRecord(tableName, existing, data)) {
          const staleMergeResult = this.applyStaleRowBackfill(
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
      this.lastAppliedAtMsByTableName.set(tableName, Date.now());
      this.lastAppliedCauseIdByTableName.set(tableName, causeId);
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
  applyStaleRowBackfill(table, key, existing, incoming) {
    return applyStaleRowBackfill(table, key, existing, incoming);
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

export {
  SystemTableCache,
  SYSTEM_TABLES,
  CDC_OPERATIONS,
  PRIMARY_KEY_FIELDS,
  getSharedRowReadStats,
  resetSharedRowReadStats,
};
