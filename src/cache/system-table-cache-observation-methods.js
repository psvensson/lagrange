import {COLUMN, STATE, TABLES} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {deepFreeze} from '../utils/deep-freeze.js';
import {CACHE_ERROR_MSG, CACHE_LOG_MSG} from './cache-constants.js';
import {previewSystemTableCacheRowAfterEachChange} from
  './system-table-cache-row-preview.js';
import {
  getAllTableRevisionWatermarkSnapshots,
  getTableRevisionWatermarkSnapshot,
  recordAuthoritativeTableObservation,
} from './system-table-cache-cdc-observation.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_EMPTY_ENDPOINTS = Object.freeze([]);
const LOCAL_EMPTY_PARTITION_SERVICES = Object.freeze([]);

let sharedRowReadEngagements = 0;

/**
 * Engagement counter for the directed micro-repro: proves the no-clone shared
 * read path fires rather than silently delegating to the cloning path.
 * @return {{engagements: number}}
 */
function getSharedRowReadStats() {
  return {engagements: sharedRowReadEngagements};
}

/** Reset the shared-row read engagement counter. */
function resetSharedRowReadStats() {
  sharedRowReadEngagements = 0;
}

function resolveCachedRowOriginHlc(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  return typeof row[COLUMN.UPDATED_AT_HLC] === 'string' ?
    row[COLUMN.UPDATED_AT_HLC] :
    row.updatedAtHlc ?? null;
}

function isMatchingCdcObservation(observation, row) {
  if (!observation || !row) {
    return false;
  }
  const rowOriginHlc = resolveCachedRowOriginHlc(row);
  if (
    Number.isFinite(observation.observedAtMs) &&
    typeof rowOriginHlc === 'string' &&
    rowOriginHlc === observation.originHlc
  ) {
    return true;
  }
  return (
    Number.isSafeInteger(observation.sourceLogIndex) &&
    (observation.originHlc === null || rowOriginHlc === observation.originHlc)
  );
}

function formatValidCdcObservation(observation, row) {
  if (!isMatchingCdcObservation(observation, row)) {
    return null;
  }
  return {
    observedAtMs: observation.observedAtMs,
    originHlc: observation.originHlc,
    ...(Number.isSafeInteger(observation.sourceLogIndex) ?
      {sourceLogIndex: observation.sourceLogIndex} :
      {}),
  };
}

class SystemTableCacheObservationMethods {
  /**
     * Record the latest applied schema version for one system table.
     * @param {string} tableName
     * @param {string|number} version
     * @return {string|number|null}
     */
  recordAppliedSchemaVersion(tableName, version) {
    this.validateTableName(tableName);
    if (version === null || typeof version === 'undefined') {
      return this.getAppliedSchemaVersion(tableName);
    }
    const currentVersion = this.appliedSchemaVersions.get(tableName);
    if (typeof currentVersion === 'undefined' ||
          this.compareSchemaVersions(version, currentVersion) >= 0) {
      this.appliedSchemaVersions.set(tableName, version);
      return version;
    }
    return currentVersion;
  }

  /** @return {string|number|null} */
  getAppliedSchemaVersion(tableName) {
    this.validateTableName(tableName);
    return this.appliedSchemaVersions.get(tableName) ?? null;
  }

  /** @return {Object<string, string|number>} */
  getAppliedSchemaVersions() {
    const snapshot = {};
    for (const [tableName, version] of this.appliedSchemaVersions.entries()) {
      snapshot[tableName] = version;
    }
    return snapshot;
  }

  /** @return {number|null} */
  getLastAppliedAtMs(tableName) {
    this.validateTableName(tableName);
    return this.lastAppliedAtMsByTableName.get(tableName) ?? null;
  }

  /** @return {string|null} */
  getLastAppliedCauseId(tableName) {
    this.validateTableName(tableName);
    return this.lastAppliedCauseIdByTableName.get(tableName) ?? null;
  }

  /**
   * Read the accepted CDC receipt bound to one cached row's origin HLC.
   * A row replacement whose origin no longer matches cannot reuse older
   * provenance.
   * @param {string} tableName
   * @param {string} key
   * @return {{observedAtMs: number, originHlc: string}|null}
   */
  getLastCdcObservation(tableName, key) {
    this.validateTableName(tableName);
    const observation =
      this.lastCdcObservationByTableName.get(tableName)?.get(key);
    const row = this.tables.get(tableName)?.get(key);
    return formatValidCdcObservation(observation, row);
  }

  /** @private */
  bumpTableMutationVersion(tableName) {
    const next = (this.mutationVersionByTableName.get(tableName) || 0) + 1;
    this.mutationVersionByTableName.set(
      tableName,
      next,
    );
    this._frozenRowsSnapshotByTable?.delete(tableName);
    return next;
  }

  /**
   * Advance the shared table generation and bind that generation to one key.
   * The key binding survives row deletion, allowing an owner read to distinguish
   * an unchanged row from an equal-value mutation that landed while it awaited
   * authoritative truth.
   * @param {string} tableName
   * @param {string} key
   * @return {number}
   * @private
   */
  recordTableMutation(tableName, key) {
    const tableMutationRevision = this.bumpTableMutationVersion(tableName);
    this.mutationVersionByTableKey.get(tableName).set(
      key,
      tableMutationRevision,
    );
    if (tableName === TABLES.SERVICES) {
      this.syncServicePartitionIndexForKey(key);
    }
    return tableMutationRevision;
  }

  /** @private */
  rebuildPartitionServicesEntry(partitionId) {
    const partitionKeys = this.serviceKeysByPartitionId.get(partitionId);
    if (!partitionKeys || partitionKeys.size === 0) {
      this.serviceKeysByPartitionId.delete(partitionId);
      this.servicesByPartitionId.delete(partitionId);
      return;
    }
    const servicesTable = this.tables.get(TABLES.SERVICES);
    const rows = [];
    for (const serviceKey of partitionKeys) {
      const row = servicesTable.get(serviceKey);
      if (!row) {
        partitionKeys.delete(serviceKey);
        continue;
      }
      rows.push(Object.isFrozen(row) ? row : deepFreeze(row));
    }
    if (rows.length === 0) {
      this.serviceKeysByPartitionId.delete(partitionId);
      this.servicesByPartitionId.delete(partitionId);
      return;
    }
    this.servicesByPartitionId.set(partitionId, Object.freeze(rows));
  }

  /** @private */
  syncServicePartitionIndexForKey(key) {
    const previousPartitionId = this.servicePartitionIdByKey.get(key);
    const currentRow = this.tables.get(TABLES.SERVICES)?.get(key);
    const rawPartitionId = currentRow?.[COLUMN.PARTITION_ID];
    const nextPartitionId =
      typeof rawPartitionId === 'string' && rawPartitionId.length > 0 ?
        rawPartitionId :
        null;
    if (previousPartitionId && previousPartitionId !== nextPartitionId) {
      this.serviceKeysByPartitionId.get(previousPartitionId)?.delete(key);
      this.rebuildPartitionServicesEntry(previousPartitionId);
    }
    if (!nextPartitionId) {
      this.servicePartitionIdByKey.delete(key);
      return;
    }
    this.servicePartitionIdByKey.set(key, nextPartitionId);
    let nextKeys = this.serviceKeysByPartitionId.get(nextPartitionId);
    if (!nextKeys) {
      nextKeys = new Set();
      this.serviceKeysByPartitionId.set(nextPartitionId, nextKeys);
    }
    nextKeys.add(key);
    this.rebuildPartitionServicesEntry(nextPartitionId);
  }

  /**
   * Return the cached service rows for one partition from the partition-keyed
   * index without scanning unrelated services.
   * @param {string} partitionId
   * @return {ReadonlyArray<Object>}
   */
  servicesForPartition(partitionId) {
    if (typeof partitionId !== 'string' || partitionId.length === 0) {
      return LOCAL_EMPTY_PARTITION_SERVICES;
    }
    const rows =
      this.servicesByPartitionId.get(partitionId) ||
      LOCAL_EMPTY_PARTITION_SERVICES;
    sharedRowReadEngagements += rows.length;
    return rows;
  }

  /**
   * Monotonic count of applied changes for one table. Version equality across
   * two reads proves no apply landed between them; wall-clock apply
   * timestamps cannot (same-millisecond applies collide).
   * @return {number}
   */
  getTableMutationVersion(tableName) {
    this.validateTableName(tableName);
    return this.mutationVersionByTableName.get(tableName) || 0;
  }

  /**
   * Atomically capture one cloned cache row and its last accepted mutation
   * generation. JavaScript cannot interleave another apply between these two
   * synchronous reads, so callers may safely compare snapshots across an await.
   * @param {string} tableName
   * @param {string} key
   * @return {{record: Object|undefined, mutationRevision: number}}
   */
  captureRecordMutationSnapshot(tableName, key) {
    this.validateTableName(tableName);
    const record = this.tables.get(tableName).get(key);
    return Object.freeze({
      record: record ? this.deepClone(record) : undefined,
      mutationRevision:
        this.mutationVersionByTableKey.get(tableName).get(key) || 0,
    });
  }

  /**
   * Atomically capture every live row and key-scoped mutation generation for
   * one table. A complete owner read can compare this immutable pre-read view
   * with current cache state without erasing mutations that landed meanwhile.
   * @param {string} tableName
   * @return {{tableName: string, entries: Array<Object>}}
   */
  captureTableMutationSnapshot(tableName) {
    this.validateTableName(tableName);
    const keyRevisions = this.mutationVersionByTableKey.get(tableName);
    const entries = [...this.tables.get(tableName).entries()].map(
      ([key, record]) => Object.freeze({
        key,
        record: deepFreeze(this.deepClone(record)),
        mutationRevision: keyRevisions.get(key) || 0,
      }),
    );
    return Object.freeze({tableName, entries: Object.freeze(entries)});
  }

  /**
     * Record a successful complete authoritative observation without claiming
     * that a row mutation occurred.
     * @param {string} tableName
     * @param {Object} options
     * @return {number|null}
     */
  recordAuthoritativeObservation(tableName, options = {}) {
    this.validateTableName(tableName);
    const observedAtMs = Number(options.observedAtMs);
    if (!Number.isFinite(observedAtMs) || observedAtMs < 0) {
      if (
        Number.isSafeInteger(options?.term) ||
        Number.isSafeInteger(options?.appliedIndex) ||
        Number.isSafeInteger(options?.commitIndex)
      ) {
        recordAuthoritativeTableObservation(this, tableName, null, options);
      }
      return this.getLastAuthoritativeObservedAtMs(tableName);
    }
    const normalizedObservedAtMs = Math.floor(observedAtMs);
    const currentObservedAtMs =
        this.lastAuthoritativeObservedAtMsByTableName.get(tableName);
    if (
      Number.isFinite(currentObservedAtMs) &&
        currentObservedAtMs > normalizedObservedAtMs
    ) {
      return currentObservedAtMs;
    }
    this.lastAuthoritativeObservedAtMsByTableName.set(
      tableName,
      normalizedObservedAtMs,
    );
    this.lastAuthoritativeObservedCauseIdByTableName.set(
      tableName,
      normalizeCauseId(options.causeId),
    );
    recordAuthoritativeTableObservation(
      this,
      tableName,
      normalizedObservedAtMs,
      options,
    );
    return normalizedObservedAtMs;
  }

  /** @return {Object|null} */
  getTableRevisionWatermark(tableName) {
    this.validateTableName(tableName);
    return getTableRevisionWatermarkSnapshot(this, tableName);
  }

  /** @return {Object<string, Object>} */
  getTableRevisionWatermarks() {
    return getAllTableRevisionWatermarkSnapshots(this);
  }

  /** @return {number|null} */
  getLastAuthoritativeObservedAtMs(tableName) {
    this.validateTableName(tableName);
    return this.lastAuthoritativeObservedAtMsByTableName.get(tableName) ??
        null;
  }

  /** @return {string|null} */
  getLastAuthoritativeObservedCauseId(tableName) {
    this.validateTableName(tableName);
    return this.lastAuthoritativeObservedCauseIdByTableName.get(tableName) ??
        null;
  }

  /** @return {number} */
  getEpoch() {
    return this.currentEpoch;
  }

  /**
     * @param {Object} epoch
     * @return {boolean}
     */
  updateFromEpoch(epoch) {
    if (!epoch || typeof epoch !== 'object') {
      throw new Error(CACHE_ERROR_MSG.EPOCH_INVALID_OBJECT);
    }
    if (typeof epoch.epoch !== 'number') {
      throw new Error(CACHE_ERROR_MSG.EPOCH_MISSING_NUMBER);
    }
    if (!epoch.assignments || typeof epoch.assignments !== 'object') {
      throw new Error(CACHE_ERROR_MSG.EPOCH_MISSING_ASSIGNMENTS);
    }
    if (epoch.epoch <= this.currentEpoch) {
      this.logger.debug(CACHE_LOG_MSG.REJECTED_STALE_EPOCH, {
        incomingEpoch: epoch.epoch,
        currentEpoch: this.currentEpoch,
      });
      return false;
    }
    this.currentEpoch = epoch.epoch;
    this.logger.debug(CACHE_LOG_MSG.UPDATED_EPOCH, {epoch: this.currentEpoch});
    return true;
  }

  /** @return {string[]} */
  getReadyNodes() {
    const now = Date.now();
    const allNodes = this.getAll(TABLES.NODES) || [];
    this.logger.debug(CACHE_LOG_MSG.GET_READY_NODES_DEBUG, {
      totalNodes: allNodes.length,
      now,
      nodes: allNodes.map((node) => ({
        nodeId: node?.[COLUMN.NODE_ID],
        wsState: node?.[COLUMN.CONNECTION_STATE],
        leaseExpiry: node?.[COLUMN.READY_LEASE_EXPIRES_AT],
        leaseValid: node?.[COLUMN.READY_LEASE_EXPIRES_AT] > now,
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

  /** @return {Array<Object>} */
  getEndpointsForNode(nodeId) {
    const endpoints = this.filter(TABLES.NODE_ENDPOINTS, (endpoint) =>
      endpoint[COLUMN.NODE_ID] === nodeId,
    );
    return endpoints.sort((left, right) => {
      const leftPriority = left[COLUMN.PRIORITY] ?? 0;
      const rightPriority = right[COLUMN.PRIORITY] ?? 0;
      return leftPriority - rightPriority;
    });
  }

  /** @return {Array<Object>} */
  filterEndpointsByStatus(endpoints, status) {
    if (!Array.isArray(endpoints)) {
      return [...LOCAL_EMPTY_ENDPOINTS];
    }
    return endpoints.filter((endpoint) =>
      endpoint[COLUMN.STATUS] === status,
    );
  }

  onCacheChange(listener) {
    if (typeof listener !== 'function') {
      throw new Error(CACHE_ERROR_MSG.LISTENER_REQUIRED);
    }
    this.listeners.add(listener);
  }

  offCacheChange(listener) {
    return this.listeners.delete(listener);
  }

  /**
   * Register an apply-time (synchronous) change listener: it observes each
   * accepted table mutation inside the turn that applied it, with the
   * identical payload the deferred change notification later carries.
   *
   * Only consumers whose decision depends on never observing an applied
   * revision ahead of its own derived state should use this channel; the
   * deferred `onCacheChange` channel remains the default. A mutation is
   * delivered to both channels (at-least-once), so duplicate-tolerant,
   * revision-keyed handling is a consumer obligation.
   * @param {Function} listener (tableName, operation, record, metadata)
   */
  onCacheApplyChange(listener) {
    if (typeof listener !== 'function') {
      throw new Error(CACHE_ERROR_MSG.LISTENER_REQUIRED);
    }
    this.applyListeners.add(listener);
  }

  offCacheApplyChange(listener) {
    return this.applyListeners.delete(listener);
  }

  notifyApplyListeners(tableName, operation, record, metadata) {
    if (this.applyListeners.size === 0) {
      return;
    }
    const normalizedMetadata =
      metadata && typeof metadata === 'object' ? metadata : null;
    for (const listener of this.applyListeners) {
      try {
        listener(tableName, operation, record, normalizedMetadata);
      } catch (error) {
        this.logger.warn(CACHE_LOG_MSG.CACHE_LISTENER_ERROR, {
          error: error.message,
        });
      }
    }
  }

  notifyListeners(tableName, operation, record, metadata) {
    if (this.listeners.size === 0) {
      return;
    }
    const normalizedMetadata = metadata && typeof metadata === 'object' ?
      metadata :
      null;
    this.scheduleCacheChangeNotification(() => {
      for (const listener of this.listeners) {
        try {
          listener(tableName, operation, record, normalizedMetadata);
        } catch (error) {
          this.logger.warn(CACHE_LOG_MSG.CACHE_LISTENER_ERROR, {
            error: error.message,
          });
        }
      }
    });
  }

  /** @return {Object} */
  getAllData() {
    const data = {};
    for (const [tableName, table] of this.tables) {
      data[tableName] = Array.from(table.values())
        .map((record) => this.deepClone(record));
    }
    return data;
  }

  get(tableName, key) {
    this.validateTableName(tableName);
    const record = this.tables.get(tableName).get(key);
    return record ? this.deepClone(record) : undefined;
  }

  getShared(tableName, key) {
    this.validateTableName(tableName);
    const record = this.tables.get(tableName).get(key);
    return record ? this.readView(record) : undefined;
  }

  find(tableName, predicate) {
    this.validateTableName(tableName);
    for (const record of this.tables.get(tableName).values()) {
      if (predicate(record)) {
        return this.deepClone(record);
      }
    }
    return undefined;
  }

  /** @return {Object} */
  readView(record) {
    sharedRowReadEngagements += 1;
    return Object.isFrozen(record) ? record : deepFreeze(record);
  }

  /** @private */
  readFrozenRows(tableName) {
    const table = this.tables.get(tableName);
    const version = this.mutationVersionByTableName.get(tableName) || 0;
    const cached = this._frozenRowsSnapshotByTable?.get(tableName);
    if (cached !== undefined &&
        cached.version === version &&
        cached.size === table.size) {
      return cached.rows;
    }
    const rows = new Array(table.size);
    let index = 0;
    for (const record of table.values()) {
      rows[index] = Object.isFrozen(record) ? record : deepFreeze(record);
      index += 1;
    }
    if (!this._frozenRowsSnapshotByTable) {
      this._frozenRowsSnapshotByTable = new Map();
    }
    this._frozenRowsSnapshotByTable.set(tableName, {
      version,
      size: table.size,
      rows,
    });
    return rows;
  }

  filter(tableName, predicate) {
    this.validateTableName(tableName);
    const rows = this.readFrozenRows(tableName);
    const results = [];
    for (let index = 0; index < rows.length; index += 1) {
      const record = rows[index];
      if (predicate(record)) {
        sharedRowReadEngagements += 1;
        results.push(record);
      }
    }
    return results;
  }

  getAll(tableName) {
    this.validateTableName(tableName);
    const rows = this.readFrozenRows(tableName);
    sharedRowReadEngagements += rows.length;
    return rows.slice();
  }

  has(tableName, key) {
    this.validateTableName(tableName);
    return this.tables.get(tableName).has(key);
  }

  count(tableName) {
    this.validateTableName(tableName);
    return this.tables.get(tableName).size;
  }

  /**
   * The rows this cache would hold for one key after each of `changes`,
   * applied in order, without applying them: element i is the row after
   * changes 0..i, null when the cache would hold no row. Read-only: the
   * changes run through applySystemTableChange on a private copy of the
   * state that method reads for the key, on this cache's clock.
   * @param {string} tableName
   * @param {string} key
   * @param {Array<{operation: string, data: Object}>} changes
   * @return {Array<Object|null>}
   */
  previewRowAfterEachChange(tableName, key, changes) {
    return previewSystemTableCacheRowAfterEachChange(this, tableName, key, changes);
  }
}

function assignSystemTableCacheObservationMethods(SystemTableCache) {
  for (const methodName of Object.getOwnPropertyNames(
    SystemTableCacheObservationMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      SystemTableCache.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        SystemTableCacheObservationMethods.prototype,
        methodName,
      ),
    );
  }
}

export {
  assignSystemTableCacheObservationMethods,
  getSharedRowReadStats,
  resetSharedRowReadStats,
};
