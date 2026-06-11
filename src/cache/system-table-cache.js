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
        results.push(this.deepClone(record));
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
    return Array.from(table.values()).map((record) => this.deepClone(record));
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
        this.logger.debug(CACHE_LOG_MSG.DELETE_ON_MISSING_KEY_IGNORED, {
          tableName,
          key,
        });
      } else {
        const existing = table.get(key);
        if (this.isStaleForExistingRecord(tableName, existing, data)) {
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

export {SystemTableCache, SYSTEM_TABLES, CDC_OPERATIONS, PRIMARY_KEY_FIELDS};
