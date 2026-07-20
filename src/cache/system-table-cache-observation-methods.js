import {COLUMN, STATE, TABLES} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {deepFreeze} from '../utils/deep-freeze.js';
import {CACHE_ERROR_MSG, CACHE_LOG_MSG} from './cache-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_EMPTY_ENDPOINTS = Object.freeze([]);

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
    const rowOriginHlc =
      typeof row?.[COLUMN.UPDATED_AT_HLC] === 'string' ?
        row[COLUMN.UPDATED_AT_HLC] :
        row?.updatedAtHlc;
    if (
      !observation ||
      typeof rowOriginHlc !== 'string' ||
      rowOriginHlc !== observation.originHlc
    ) {
      return null;
    }
    return {
      observedAtMs: observation.observedAtMs,
      originHlc: observation.originHlc,
    };
  }

  /** @private */
  bumpTableMutationVersion(tableName) {
    this.mutationVersionByTableName.set(
      tableName,
      (this.mutationVersionByTableName.get(tableName) || 0) + 1,
    );
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
    return normalizedObservedAtMs;
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

  notifyListeners(tableName, operation, record, metadata) {
    if (this.listeners.size === 0) {
      return;
    }
    const normalizedMetadata = metadata && typeof metadata === 'object' ?
      metadata :
      null;
    setImmediate(() => {
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
    return deepFreeze(record);
  }

  filter(tableName, predicate) {
    this.validateTableName(tableName);
    const results = [];
    for (const record of this.tables.get(tableName).values()) {
      if (predicate(record)) {
        results.push(this.readView(record));
      }
    }
    return results;
  }

  getAll(tableName) {
    this.validateTableName(tableName);
    return Array.from(this.tables.get(tableName).values())
      .map((record) => this.readView(record));
  }

  getAllShared(tableName) {
    return this.getAll(tableName);
  }

  filterShared(tableName, predicate) {
    return this.filter(tableName, predicate);
  }

  has(tableName, key) {
    this.validateTableName(tableName);
    return this.tables.get(tableName).has(key);
  }

  count(tableName) {
    this.validateTableName(tableName);
    return this.tables.get(tableName).size;
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
