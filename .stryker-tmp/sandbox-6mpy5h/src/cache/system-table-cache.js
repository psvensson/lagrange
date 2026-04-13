/**
 * System Table Cache - In-memory cache for system tables.
 * Maintains cached copies of system tables (nodes, partitions, tables,
 * services, message_groups, indices) synchronized via CDC events.
 * Requirements: 4.4, 4.5, 4.8
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
import { COLUMN, NUM, STATE, TABLES, TYPEOF } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { normalizeCauseId } from '../utils/cause-id.js';
import { isNodeHeartbeatWatermarkRegression } from '../node/node-readiness-policy.js';
import { CACHE_CDC_OPERATIONS, CACHE_DEFAULT, CACHE_ERROR_MSG, CACHE_LOG_MSG, CACHE_SUBSYSTEM, CACHE_SYSTEM_TABLES } from './cache-constants.js';
import { SYSTEM_CACHE_KEY_DESCRIPTOR, getSystemCachePrimaryKeyField } from './system-cache-key-descriptor.js';
import { HLCTimestamp } from '../hlc/hlc-timestamp.js';
import { mergeControlPlanePublicationRows } from '../control-plane/control-plane-publication-merge.js';

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
    if (stryMutAct_9fa48("34851")) {
      {}
    } else {
      stryCov_9fa48("34851");
      this.tables = new Map();
      this.appliedSchemaVersions = new Map();
      this.lastAppliedAtMsByTableName = new Map();
      this.lastAppliedCauseIdByTableName = new Map();
      this.listeners = new Set();
      this.logger = LoggingService.getInstance().forSubsystem(CACHE_SUBSYSTEM.CACHE);
      this.currentEpoch = CACHE_DEFAULT.INITIAL_EPOCH;
      // Unique ID for debugging cache instance issues
      this._cacheId = (stryMutAct_9fa48("34852") ? `` : (stryCov_9fa48("34852"), `${CACHE_DEFAULT.CACHE_ID_PREFIX}${Date.now()}-`)) + (stryMutAct_9fa48("34853") ? `` : (stryCov_9fa48("34853"), `${stryMutAct_9fa48("34854") ? Math.random().toString(CACHE_DEFAULT.CACHE_ID_RADIX) : (stryCov_9fa48("34854"), Math.random().toString(CACHE_DEFAULT.CACHE_ID_RADIX).substr(CACHE_DEFAULT.CACHE_ID_START, CACHE_DEFAULT.CACHE_ID_LENGTH))}`));

      // Initialize empty maps for each system table
      for (const tableName of SYSTEM_TABLES) {
        if (stryMutAct_9fa48("34855")) {
          {}
        } else {
          stryCov_9fa48("34855");
          this.tables.set(tableName, new Map());
        }
      }
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
    if (stryMutAct_9fa48("34856")) {
      {}
    } else {
      stryCov_9fa48("34856");
      this.validateTableName(tableName);
      if (stryMutAct_9fa48("34859") ? version === null && typeof version === TYPEOF.UNDEFINED : stryMutAct_9fa48("34858") ? false : stryMutAct_9fa48("34857") ? true : (stryCov_9fa48("34857", "34858", "34859"), (stryMutAct_9fa48("34861") ? version !== null : stryMutAct_9fa48("34860") ? false : (stryCov_9fa48("34860", "34861"), version === null)) || (stryMutAct_9fa48("34863") ? typeof version !== TYPEOF.UNDEFINED : stryMutAct_9fa48("34862") ? false : (stryCov_9fa48("34862", "34863"), typeof version === TYPEOF.UNDEFINED)))) {
        if (stryMutAct_9fa48("34864")) {
          {}
        } else {
          stryCov_9fa48("34864");
          return this.getAppliedSchemaVersion(tableName);
        }
      }
      const currentVersion = this.appliedSchemaVersions.get(tableName);
      if (stryMutAct_9fa48("34867") ? typeof currentVersion === TYPEOF.UNDEFINED && this.compareSchemaVersions(version, currentVersion) >= NUM.ZERO : stryMutAct_9fa48("34866") ? false : stryMutAct_9fa48("34865") ? true : (stryCov_9fa48("34865", "34866", "34867"), (stryMutAct_9fa48("34869") ? typeof currentVersion !== TYPEOF.UNDEFINED : stryMutAct_9fa48("34868") ? false : (stryCov_9fa48("34868", "34869"), typeof currentVersion === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("34872") ? this.compareSchemaVersions(version, currentVersion) < NUM.ZERO : stryMutAct_9fa48("34871") ? this.compareSchemaVersions(version, currentVersion) > NUM.ZERO : stryMutAct_9fa48("34870") ? false : (stryCov_9fa48("34870", "34871", "34872"), this.compareSchemaVersions(version, currentVersion) >= NUM.ZERO)))) {
        if (stryMutAct_9fa48("34873")) {
          {}
        } else {
          stryCov_9fa48("34873");
          this.appliedSchemaVersions.set(tableName, version);
          return version;
        }
      }
      return currentVersion;
    }
  }

  /**
   * Get the latest applied schema/version watermark for one table.
   * @param {string} tableName - Name of the system table.
   * @return {string|number|null} Stored watermark, or null if unknown.
   */
  getAppliedSchemaVersion(tableName) {
    if (stryMutAct_9fa48("34874")) {
      {}
    } else {
      stryCov_9fa48("34874");
      this.validateTableName(tableName);
      return stryMutAct_9fa48("34875") ? this.appliedSchemaVersions.get(tableName) && null : (stryCov_9fa48("34875"), this.appliedSchemaVersions.get(tableName) ?? null);
    }
  }

  /**
   * Get a read-only snapshot of applied schema/version watermarks.
   * @return {Object<string, string|number>} Table-to-watermark map.
   */
  getAppliedSchemaVersions() {
    if (stryMutAct_9fa48("34876")) {
      {}
    } else {
      stryCov_9fa48("34876");
      const snapshot = {};
      for (const [tableName, version] of this.appliedSchemaVersions.entries()) {
        if (stryMutAct_9fa48("34877")) {
          {}
        } else {
          stryCov_9fa48("34877");
          snapshot[tableName] = version;
        }
      }
      return snapshot;
    }
  }

  /**
   * Get the last local wall-clock time (ms) we applied a change for a system table.
   * @param {string} tableName - Name of the system table.
   * @return {number|null}
   */
  getLastAppliedAtMs(tableName) {
    if (stryMutAct_9fa48("34878")) {
      {}
    } else {
      stryCov_9fa48("34878");
      this.validateTableName(tableName);
      return stryMutAct_9fa48("34879") ? this.lastAppliedAtMsByTableName.get(tableName) && null : (stryCov_9fa48("34879"), this.lastAppliedAtMsByTableName.get(tableName) ?? null);
    }
  }

  /**
   * Get the last applied causal correlation ID for a system table, when available.
   * @param {string} tableName - Name of the system table.
   * @return {string|null}
   */
  getLastAppliedCauseId(tableName) {
    if (stryMutAct_9fa48("34880")) {
      {}
    } else {
      stryCov_9fa48("34880");
      this.validateTableName(tableName);
      return stryMutAct_9fa48("34881") ? this.lastAppliedCauseIdByTableName.get(tableName) && null : (stryCov_9fa48("34881"), this.lastAppliedCauseIdByTableName.get(tableName) ?? null);
    }
  }

  /**
   * Get the current epoch number.
   * Requirements: 7.1, 7.2
   * @return {number} The current epoch number
   */
  getEpoch() {
    if (stryMutAct_9fa48("34882")) {
      {}
    } else {
      stryCov_9fa48("34882");
      return this.currentEpoch;
    }
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
    if (stryMutAct_9fa48("34883")) {
      {}
    } else {
      stryCov_9fa48("34883");
      if (stryMutAct_9fa48("34886") ? !epoch && typeof epoch !== TYPEOF.OBJECT : stryMutAct_9fa48("34885") ? false : stryMutAct_9fa48("34884") ? true : (stryCov_9fa48("34884", "34885", "34886"), (stryMutAct_9fa48("34887") ? epoch : (stryCov_9fa48("34887"), !epoch)) || (stryMutAct_9fa48("34889") ? typeof epoch === TYPEOF.OBJECT : stryMutAct_9fa48("34888") ? false : (stryCov_9fa48("34888", "34889"), typeof epoch !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("34890")) {
          {}
        } else {
          stryCov_9fa48("34890");
          throw new Error(CACHE_ERROR_MSG.EPOCH_INVALID_OBJECT);
        }
      }
      if (stryMutAct_9fa48("34893") ? typeof epoch.epoch === TYPEOF.NUMBER : stryMutAct_9fa48("34892") ? false : stryMutAct_9fa48("34891") ? true : (stryCov_9fa48("34891", "34892", "34893"), typeof epoch.epoch !== TYPEOF.NUMBER)) {
        if (stryMutAct_9fa48("34894")) {
          {}
        } else {
          stryCov_9fa48("34894");
          throw new Error(CACHE_ERROR_MSG.EPOCH_MISSING_NUMBER);
        }
      }
      if (stryMutAct_9fa48("34897") ? !epoch.assignments && typeof epoch.assignments !== TYPEOF.OBJECT : stryMutAct_9fa48("34896") ? false : stryMutAct_9fa48("34895") ? true : (stryCov_9fa48("34895", "34896", "34897"), (stryMutAct_9fa48("34898") ? epoch.assignments : (stryCov_9fa48("34898"), !epoch.assignments)) || (stryMutAct_9fa48("34900") ? typeof epoch.assignments === TYPEOF.OBJECT : stryMutAct_9fa48("34899") ? false : (stryCov_9fa48("34899", "34900"), typeof epoch.assignments !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("34901")) {
          {}
        } else {
          stryCov_9fa48("34901");
          throw new Error(CACHE_ERROR_MSG.EPOCH_MISSING_ASSIGNMENTS);
        }
      }

      // Requirement 7.5: Reject updates from older epochs
      if (stryMutAct_9fa48("34905") ? epoch.epoch > this.currentEpoch : stryMutAct_9fa48("34904") ? epoch.epoch < this.currentEpoch : stryMutAct_9fa48("34903") ? false : stryMutAct_9fa48("34902") ? true : (stryCov_9fa48("34902", "34903", "34904", "34905"), epoch.epoch <= this.currentEpoch)) {
        if (stryMutAct_9fa48("34906")) {
          {}
        } else {
          stryCov_9fa48("34906");
          this.logger.debug(CACHE_LOG_MSG.REJECTED_STALE_EPOCH, stryMutAct_9fa48("34907") ? {} : (stryCov_9fa48("34907"), {
            incomingEpoch: epoch.epoch,
            currentEpoch: this.currentEpoch
          }));
          return stryMutAct_9fa48("34908") ? true : (stryCov_9fa48("34908"), false);
        }
      }

      // Atomic update: update epoch number
      this.currentEpoch = epoch.epoch;
      this.logger.debug(CACHE_LOG_MSG.UPDATED_EPOCH, stryMutAct_9fa48("34909") ? {} : (stryCov_9fa48("34909"), {
        epoch: this.currentEpoch
      }));
      return stryMutAct_9fa48("34910") ? false : (stryCov_9fa48("34910"), true);
    }
  }

  /**
   * Get all nodes that are in the 'ready' state.
   * Requirements: 5.9 - Cache should filter nodes by state
   * @return {string[]} Array of node IDs that are in ready state
   */
  getReadyNodes() {
    if (stryMutAct_9fa48("34911")) {
      {}
    } else {
      stryCov_9fa48("34911");
      const now = Date.now();
      const allNodes = stryMutAct_9fa48("34914") ? this.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("34913") ? false : stryMutAct_9fa48("34912") ? true : (stryCov_9fa48("34912", "34913", "34914"), this.getAll(TABLES.NODES) || (stryMutAct_9fa48("34915") ? ["Stryker was here"] : (stryCov_9fa48("34915"), [])));
      this.logger.debug(CACHE_LOG_MSG.GET_READY_NODES_DEBUG, stryMutAct_9fa48("34916") ? {} : (stryCov_9fa48("34916"), {
        totalNodes: allNodes.length,
        now,
        nodes: allNodes.map(stryMutAct_9fa48("34917") ? () => undefined : (stryCov_9fa48("34917"), n => stryMutAct_9fa48("34918") ? {} : (stryCov_9fa48("34918"), {
          nodeId: stryMutAct_9fa48("34919") ? n[COLUMN.NODE_ID] : (stryCov_9fa48("34919"), n?.[COLUMN.NODE_ID]),
          wsState: stryMutAct_9fa48("34920") ? n[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("34920"), n?.[COLUMN.CONNECTION_STATE]),
          leaseExpiry: stryMutAct_9fa48("34921") ? n[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("34921"), n?.[COLUMN.READY_LEASE_EXPIRES_AT]),
          leaseValid: stryMutAct_9fa48("34925") ? n?.[COLUMN.READY_LEASE_EXPIRES_AT] <= now : stryMutAct_9fa48("34924") ? n?.[COLUMN.READY_LEASE_EXPIRES_AT] >= now : stryMutAct_9fa48("34923") ? false : stryMutAct_9fa48("34922") ? true : (stryCov_9fa48("34922", "34923", "34924", "34925"), (stryMutAct_9fa48("34926") ? n[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("34926"), n?.[COLUMN.READY_LEASE_EXPIRES_AT])) > now)
        })))
      }));
      const readyNodes = stryMutAct_9fa48("34927") ? this : (stryCov_9fa48("34927"), this.filter(TABLES.NODES, node => {
        if (stryMutAct_9fa48("34928")) {
          {}
        } else {
          stryCov_9fa48("34928");
          const wsState = stryMutAct_9fa48("34929") ? node[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("34929"), node?.[COLUMN.CONNECTION_STATE]);
          const leaseExpiry = stryMutAct_9fa48("34930") ? node[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("34930"), node?.[COLUMN.READY_LEASE_EXPIRES_AT]);
          return stryMutAct_9fa48("34933") ? wsState === STATE.READY && leaseExpiry || leaseExpiry > now : stryMutAct_9fa48("34932") ? false : stryMutAct_9fa48("34931") ? true : (stryCov_9fa48("34931", "34932", "34933"), (stryMutAct_9fa48("34935") ? wsState === STATE.READY || leaseExpiry : stryMutAct_9fa48("34934") ? true : (stryCov_9fa48("34934", "34935"), (stryMutAct_9fa48("34937") ? wsState !== STATE.READY : stryMutAct_9fa48("34936") ? true : (stryCov_9fa48("34936", "34937"), wsState === STATE.READY)) && leaseExpiry)) && (stryMutAct_9fa48("34940") ? leaseExpiry <= now : stryMutAct_9fa48("34939") ? leaseExpiry >= now : stryMutAct_9fa48("34938") ? true : (stryCov_9fa48("34938", "34939", "34940"), leaseExpiry > now)));
        }
      }));
      return readyNodes.map(node => {
        if (stryMutAct_9fa48("34941")) {
          {}
        } else {
          stryCov_9fa48("34941");
          const nodeId = stryMutAct_9fa48("34942") ? node[COLUMN.NODE_ID] : (stryCov_9fa48("34942"), node?.[COLUMN.NODE_ID]);
          assertCritical(nodeId, CACHE_ERROR_MSG.NODE_ID_MISSING);
          return nodeId;
        }
      });
    }
  }

  /**
   * Get all endpoints for a specific node from the node_endpoints table.
   * Endpoints are sorted by priority (lower priority value = higher preference).
   * Requirements: 6.6 - System_Cache SHALL provide methods to query endpoints by node_id
   * @param {string} nodeId - The node ID to get endpoints for
   * @return {Array<Object>} Array of endpoint records sorted by priority (ascending)
   */
  getEndpointsForNode(nodeId) {
    if (stryMutAct_9fa48("34943")) {
      {}
    } else {
      stryCov_9fa48("34943");
      const endpoints = stryMutAct_9fa48("34944") ? this : (stryCov_9fa48("34944"), this.filter(TABLES.NODE_ENDPOINTS, endpoint => {
        if (stryMutAct_9fa48("34945")) {
          {}
        } else {
          stryCov_9fa48("34945");
          return stryMutAct_9fa48("34948") ? endpoint[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("34947") ? false : stryMutAct_9fa48("34946") ? true : (stryCov_9fa48("34946", "34947", "34948"), endpoint[COLUMN.NODE_ID] === nodeId);
        }
      }));

      // Sort by priority (lower value = higher preference)
      return stryMutAct_9fa48("34949") ? endpoints : (stryCov_9fa48("34949"), endpoints.sort((a, b) => {
        if (stryMutAct_9fa48("34950")) {
          {}
        } else {
          stryCov_9fa48("34950");
          const priorityA = stryMutAct_9fa48("34951") ? a[COLUMN.PRIORITY] && NUM.ZERO : (stryCov_9fa48("34951"), a[COLUMN.PRIORITY] ?? NUM.ZERO);
          const priorityB = stryMutAct_9fa48("34952") ? b[COLUMN.PRIORITY] && NUM.ZERO : (stryCov_9fa48("34952"), b[COLUMN.PRIORITY] ?? NUM.ZERO);
          return stryMutAct_9fa48("34953") ? priorityA + priorityB : (stryCov_9fa48("34953"), priorityA - priorityB);
        }
      }));
    }
  }

  /**
   * Filter endpoints by status.
   * Requirements: 6.6 - System_Cache SHALL provide methods to query endpoints
   * @param {Array<Object>} endpoints - Array of endpoint records to filter
   * @param {string} status - Status to filter by (e.g., 'active', 'inactive')
   * @return {Array<Object>} Array of endpoints matching the specified status
   */
  filterEndpointsByStatus(endpoints, status) {
    if (stryMutAct_9fa48("34954")) {
      {}
    } else {
      stryCov_9fa48("34954");
      if (stryMutAct_9fa48("34957") ? false : stryMutAct_9fa48("34956") ? true : stryMutAct_9fa48("34955") ? Array.isArray(endpoints) : (stryCov_9fa48("34955", "34956", "34957"), !Array.isArray(endpoints))) {
        if (stryMutAct_9fa48("34958")) {
          {}
        } else {
          stryCov_9fa48("34958");
          return stryMutAct_9fa48("34959") ? ["Stryker was here"] : (stryCov_9fa48("34959"), []);
        }
      }
      return stryMutAct_9fa48("34960") ? endpoints : (stryCov_9fa48("34960"), endpoints.filter(endpoint => {
        if (stryMutAct_9fa48("34961")) {
          {}
        } else {
          stryCov_9fa48("34961");
          return stryMutAct_9fa48("34964") ? endpoint[COLUMN.STATUS] !== status : stryMutAct_9fa48("34963") ? false : stryMutAct_9fa48("34962") ? true : (stryCov_9fa48("34962", "34963", "34964"), endpoint[COLUMN.STATUS] === status);
        }
      }));
    }
  }

  /**
   * Subscribe to cache change notifications.
   * Listeners receive (tableName, operation, record) on each change.
   * @param {Function} listener - Called with (tableName, operation, record)
   */
  onCacheChange(listener) {
    if (stryMutAct_9fa48("34965")) {
      {}
    } else {
      stryCov_9fa48("34965");
      if (stryMutAct_9fa48("34968") ? typeof listener === TYPEOF.FUNCTION : stryMutAct_9fa48("34967") ? false : stryMutAct_9fa48("34966") ? true : (stryCov_9fa48("34966", "34967", "34968"), typeof listener !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("34969")) {
          {}
        } else {
          stryCov_9fa48("34969");
          throw new Error(CACHE_ERROR_MSG.LISTENER_REQUIRED);
        }
      }
      this.listeners.add(listener);
    }
  }

  /**
   * Unsubscribe from cache change notifications.
   * @param {Function} listener - The listener to remove
   * @return {boolean} True if the listener was removed
   */
  offCacheChange(listener) {
    if (stryMutAct_9fa48("34970")) {
      {}
    } else {
      stryCov_9fa48("34970");
      return this.listeners.delete(listener);
    }
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
    if (stryMutAct_9fa48("34971")) {
      {}
    } else {
      stryCov_9fa48("34971");
      if (stryMutAct_9fa48("34974") ? this.listeners.size !== NUM.ZERO : stryMutAct_9fa48("34973") ? false : stryMutAct_9fa48("34972") ? true : (stryCov_9fa48("34972", "34973", "34974"), this.listeners.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("34975")) {
          {}
        } else {
          stryCov_9fa48("34975");
          return;
        }
      }
      const normalizedMetadata = (stryMutAct_9fa48("34978") ? metadata || typeof metadata === TYPEOF.OBJECT : stryMutAct_9fa48("34977") ? false : stryMutAct_9fa48("34976") ? true : (stryCov_9fa48("34976", "34977", "34978"), metadata && (stryMutAct_9fa48("34980") ? typeof metadata !== TYPEOF.OBJECT : stryMutAct_9fa48("34979") ? true : (stryCov_9fa48("34979", "34980"), typeof metadata === TYPEOF.OBJECT)))) ? metadata : null;

      // Use setImmediate to make notifications non-blocking
      setImmediate(() => {
        if (stryMutAct_9fa48("34981")) {
          {}
        } else {
          stryCov_9fa48("34981");
          for (const listener of this.listeners) {
            if (stryMutAct_9fa48("34982")) {
              {}
            } else {
              stryCov_9fa48("34982");
              try {
                if (stryMutAct_9fa48("34983")) {
                  {}
                } else {
                  stryCov_9fa48("34983");
                  listener(tableName, operation, record, normalizedMetadata);
                }
              } catch (error) {
                if (stryMutAct_9fa48("34984")) {
                  {}
                } else {
                  stryCov_9fa48("34984");
                  // Log but don't re-throw - listener errors should not break other listeners
                  this.logger.warn(CACHE_LOG_MSG.CACHE_LISTENER_ERROR, stryMutAct_9fa48("34985") ? {} : (stryCov_9fa48("34985"), {
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      });
    }
  }

  /**
   * Get all data from the cache for a cache dump.
   * @return {Object} All cache data by table name { tableName: [...rows] }
   */
  getAllData() {
    if (stryMutAct_9fa48("34986")) {
      {}
    } else {
      stryCov_9fa48("34986");
      const data = {};
      for (const [tableName, table] of this.tables) {
        if (stryMutAct_9fa48("34987")) {
          {}
        } else {
          stryCov_9fa48("34987");
          data[tableName] = Array.from(table.values()).map(stryMutAct_9fa48("34988") ? () => undefined : (stryCov_9fa48("34988"), r => this.deepClone(r)));
        }
      }
      return data;
    }
  }

  /**
   * Get a single record by key from a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {Object|undefined} The record or undefined if not found.
   */
  get(tableName, key) {
    if (stryMutAct_9fa48("34989")) {
      {}
    } else {
      stryCov_9fa48("34989");
      this.validateTableName(tableName);
      const table = this.tables.get(tableName);
      const record = table.get(key);
      return record ? this.deepClone(record) : undefined;
    }
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Object|undefined} The first matching record or undefined.
   */
  find(tableName, predicate) {
    if (stryMutAct_9fa48("34990")) {
      {}
    } else {
      stryCov_9fa48("34990");
      this.validateTableName(tableName);
      const table = this.tables.get(tableName);
      for (const record of table.values()) {
        if (stryMutAct_9fa48("34991")) {
          {}
        } else {
          stryCov_9fa48("34991");
          if (stryMutAct_9fa48("34993") ? false : stryMutAct_9fa48("34992") ? true : (stryCov_9fa48("34992", "34993"), predicate(record))) {
            if (stryMutAct_9fa48("34994")) {
              {}
            } else {
              stryCov_9fa48("34994");
              return this.deepClone(record);
            }
          }
        }
      }
      return undefined;
    }
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Array<Object>} Array of matching records.
   */
  filter(tableName, predicate) {
    if (stryMutAct_9fa48("34995")) {
      {}
    } else {
      stryCov_9fa48("34995");
      this.validateTableName(tableName);
      const table = this.tables.get(tableName);
      const results = stryMutAct_9fa48("34996") ? ["Stryker was here"] : (stryCov_9fa48("34996"), []);
      for (const record of table.values()) {
        if (stryMutAct_9fa48("34997")) {
          {}
        } else {
          stryCov_9fa48("34997");
          if (stryMutAct_9fa48("34999") ? false : stryMutAct_9fa48("34998") ? true : (stryCov_9fa48("34998", "34999"), predicate(record))) {
            if (stryMutAct_9fa48("35000")) {
              {}
            } else {
              stryCov_9fa48("35000");
              results.push(this.deepClone(record));
            }
          }
        }
      }
      return results;
    }
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - Name of the system table.
   * @return {Array<Object>} Array of all records in the table.
   */
  getAll(tableName) {
    if (stryMutAct_9fa48("35001")) {
      {}
    } else {
      stryCov_9fa48("35001");
      this.validateTableName(tableName);
      const table = this.tables.get(tableName);
      return Array.from(table.values()).map(stryMutAct_9fa48("35002") ? () => undefined : (stryCov_9fa48("35002"), record => this.deepClone(record)));
    }
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {boolean} True if the record exists.
   */
  has(tableName, key) {
    if (stryMutAct_9fa48("35003")) {
      {}
    } else {
      stryCov_9fa48("35003");
      this.validateTableName(tableName);
      const table = this.tables.get(tableName);
      return table.has(key);
    }
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - Name of the system table.
   * @return {number} Number of records in the table.
   */
  count(tableName) {
    if (stryMutAct_9fa48("35004")) {
      {}
    } else {
      stryCov_9fa48("35004");
      this.validateTableName(tableName);
      const table = this.tables.get(tableName);
      return table.size;
    }
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
    if (stryMutAct_9fa48("35005")) {
      {}
    } else {
      stryCov_9fa48("35005");
      this.validateTableName(tableName);
      this.validateOperation(operation);
      const causeId = normalizeCauseId(stryMutAct_9fa48("35006") ? options.causeId : (stryCov_9fa48("35006"), options?.causeId));

      // Get the primary key field for this table
      const pkField = getSystemCachePrimaryKeyField(tableName);
      const key = stryMutAct_9fa48("35009") ? data[pkField] && data[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK] : stryMutAct_9fa48("35008") ? false : stryMutAct_9fa48("35007") ? true : (stryCov_9fa48("35007", "35008", "35009"), data[pkField] || data[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK]);
      if (stryMutAct_9fa48("35012") ? !data && typeof key === TYPEOF.UNDEFINED : stryMutAct_9fa48("35011") ? false : stryMutAct_9fa48("35010") ? true : (stryCov_9fa48("35010", "35011", "35012"), (stryMutAct_9fa48("35013") ? data : (stryCov_9fa48("35013"), !data)) || (stryMutAct_9fa48("35015") ? typeof key !== TYPEOF.UNDEFINED : stryMutAct_9fa48("35014") ? false : (stryCov_9fa48("35014", "35015"), typeof key === TYPEOF.UNDEFINED)))) {
        if (stryMutAct_9fa48("35016")) {
          {}
        } else {
          stryCov_9fa48("35016");
          throw new Error(CACHE_ERROR_MSG.primaryKeyMissing(pkField));
        }
      }
      const table = this.tables.get(tableName);
      let recordForNotification = null;
      switch (operation) {
        case CDC_OPERATIONS.INSERT:
          if (stryMutAct_9fa48("35017")) {} else {
            stryCov_9fa48("35017");
            if (stryMutAct_9fa48("35019") ? false : stryMutAct_9fa48("35018") ? true : (stryCov_9fa48("35018", "35019"), table.has(key))) {
              if (stryMutAct_9fa48("35020")) {
                {}
              } else {
                stryCov_9fa48("35020");
                const existing = table.get(key);
                if (stryMutAct_9fa48("35022") ? false : stryMutAct_9fa48("35021") ? true : (stryCov_9fa48("35021", "35022"), this.isStaleForExistingRecord(tableName, existing, data))) {
                  if (stryMutAct_9fa48("35023")) {
                    {}
                  } else {
                    stryCov_9fa48("35023");
                    const staleMergeResult = this.applyStaleRowBackfill(table, key, existing, data);
                    if (stryMutAct_9fa48("35025") ? false : stryMutAct_9fa48("35024") ? true : (stryCov_9fa48("35024", "35025"), staleMergeResult.applied)) {
                      if (stryMutAct_9fa48("35026")) {
                        {}
                      } else {
                        stryCov_9fa48("35026");
                        recordForNotification = staleMergeResult.record;
                      }
                    }
                    this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, stryMutAct_9fa48("35027") ? {} : (stryCov_9fa48("35027"), {
                      tableName,
                      key,
                      operation,
                      existingUpdatedAt: this.getRecordTimestamp(existing),
                      incomingUpdatedAt: this.getRecordTimestamp(data),
                      backfilledFields: staleMergeResult.backfilledFields
                    }));
                    break;
                  }
                }
                this.logger.debug(CACHE_LOG_MSG.INSERT_ON_EXISTING_KEY_TREAT_UPDATE, stryMutAct_9fa48("35028") ? {} : (stryCov_9fa48("35028"), {
                  tableName,
                  key
                }));
              }
            }
            table.set(key, this.deepClone(data));
            recordForNotification = data;
            break;
          }
        case CDC_OPERATIONS.UPDATE:
          if (stryMutAct_9fa48("35029")) {} else {
            stryCov_9fa48("35029");
            if (stryMutAct_9fa48("35032") ? false : stryMutAct_9fa48("35031") ? true : stryMutAct_9fa48("35030") ? table.has(key) : (stryCov_9fa48("35030", "35031", "35032"), !table.has(key))) {
              if (stryMutAct_9fa48("35033")) {
                {}
              } else {
                stryCov_9fa48("35033");
                this.logger.debug(CACHE_LOG_MSG.UPDATE_ON_MISSING_KEY_TREAT_INSERT, stryMutAct_9fa48("35034") ? {} : (stryCov_9fa48("35034"), {
                  tableName,
                  key
                }));
                table.set(key, this.deepClone(data));
              }
            } else {
              if (stryMutAct_9fa48("35035")) {
                {}
              } else {
                stryCov_9fa48("35035");
                const existing = table.get(key);
                if (stryMutAct_9fa48("35037") ? false : stryMutAct_9fa48("35036") ? true : (stryCov_9fa48("35036", "35037"), this.isStaleForExistingRecord(tableName, existing, data))) {
                  if (stryMutAct_9fa48("35038")) {
                    {}
                  } else {
                    stryCov_9fa48("35038");
                    const staleMergeResult = this.applyStaleRowBackfill(table, key, existing, data);
                    if (stryMutAct_9fa48("35040") ? false : stryMutAct_9fa48("35039") ? true : (stryCov_9fa48("35039", "35040"), staleMergeResult.applied)) {
                      if (stryMutAct_9fa48("35041")) {
                        {}
                      } else {
                        stryCov_9fa48("35041");
                        recordForNotification = staleMergeResult.record;
                      }
                    }
                    this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, stryMutAct_9fa48("35042") ? {} : (stryCov_9fa48("35042"), {
                      tableName,
                      key,
                      operation,
                      existingUpdatedAt: this.getRecordTimestamp(existing),
                      incomingUpdatedAt: this.getRecordTimestamp(data),
                      backfilledFields: staleMergeResult.backfilledFields
                    }));
                    break;
                  }
                }
                table.set(key, this.mergeRecords(tableName, existing, data));
              }
            }
            recordForNotification = table.get(key);
            break;
          }
        case CDC_OPERATIONS.UPSERT:
          if (stryMutAct_9fa48("35043")) {} else {
            stryCov_9fa48("35043");
            if (stryMutAct_9fa48("35046") ? false : stryMutAct_9fa48("35045") ? true : stryMutAct_9fa48("35044") ? table.has(key) : (stryCov_9fa48("35044", "35045", "35046"), !table.has(key))) {
              if (stryMutAct_9fa48("35047")) {
                {}
              } else {
                stryCov_9fa48("35047");
                table.set(key, this.deepClone(data));
              }
            } else {
              if (stryMutAct_9fa48("35048")) {
                {}
              } else {
                stryCov_9fa48("35048");
                const existing = table.get(key);
                if (stryMutAct_9fa48("35050") ? false : stryMutAct_9fa48("35049") ? true : (stryCov_9fa48("35049", "35050"), this.isStaleForExistingRecord(tableName, existing, data))) {
                  if (stryMutAct_9fa48("35051")) {
                    {}
                  } else {
                    stryCov_9fa48("35051");
                    const staleMergeResult = this.applyStaleRowBackfill(table, key, existing, data);
                    if (stryMutAct_9fa48("35053") ? false : stryMutAct_9fa48("35052") ? true : (stryCov_9fa48("35052", "35053"), staleMergeResult.applied)) {
                      if (stryMutAct_9fa48("35054")) {
                        {}
                      } else {
                        stryCov_9fa48("35054");
                        recordForNotification = staleMergeResult.record;
                      }
                    }
                    this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, stryMutAct_9fa48("35055") ? {} : (stryCov_9fa48("35055"), {
                      tableName,
                      key,
                      operation,
                      existingUpdatedAt: this.getRecordTimestamp(existing),
                      incomingUpdatedAt: this.getRecordTimestamp(data),
                      backfilledFields: staleMergeResult.backfilledFields
                    }));
                    break;
                  }
                }
                table.set(key, this.mergeRecords(tableName, existing, data));
              }
            }
            recordForNotification = table.get(key);
            break;
          }
        case CDC_OPERATIONS.DELETE:
          if (stryMutAct_9fa48("35056")) {} else {
            stryCov_9fa48("35056");
            if (stryMutAct_9fa48("35059") ? false : stryMutAct_9fa48("35058") ? true : stryMutAct_9fa48("35057") ? table.has(key) : (stryCov_9fa48("35057", "35058", "35059"), !table.has(key))) {
              if (stryMutAct_9fa48("35060")) {
                {}
              } else {
                stryCov_9fa48("35060");
                this.logger.debug(CACHE_LOG_MSG.DELETE_ON_MISSING_KEY_IGNORED, stryMutAct_9fa48("35061") ? {} : (stryCov_9fa48("35061"), {
                  tableName,
                  key
                }));
              }
            } else {
              if (stryMutAct_9fa48("35062")) {
                {}
              } else {
                stryCov_9fa48("35062");
                const existing = table.get(key);
                if (stryMutAct_9fa48("35064") ? false : stryMutAct_9fa48("35063") ? true : (stryCov_9fa48("35063", "35064"), this.isStaleForExistingRecord(tableName, existing, data))) {
                  if (stryMutAct_9fa48("35065")) {
                    {}
                  } else {
                    stryCov_9fa48("35065");
                    this.logger.debug(CACHE_LOG_MSG.STALE_EVENT_IGNORED, stryMutAct_9fa48("35066") ? {} : (stryCov_9fa48("35066"), {
                      tableName,
                      key,
                      operation,
                      existingUpdatedAt: this.getRecordTimestamp(existing),
                      incomingUpdatedAt: this.getRecordTimestamp(data)
                    }));
                    break;
                  }
                }
                recordForNotification = existing;
                table.delete(key);
              }
            }
            break;
          }
      }
      this.logger.debug(CACHE_LOG_MSG.APPLIED_CDC_EVENT, stryMutAct_9fa48("35067") ? {} : (stryCov_9fa48("35067"), {
        tableName,
        operation,
        key,
        causeId
      }));

      // Notify listeners after applying the change
      if (stryMutAct_9fa48("35069") ? false : stryMutAct_9fa48("35068") ? true : (stryCov_9fa48("35068", "35069"), recordForNotification)) {
        if (stryMutAct_9fa48("35070")) {
          {}
        } else {
          stryCov_9fa48("35070");
          this.lastAppliedAtMsByTableName.set(tableName, Date.now());
          this.lastAppliedCauseIdByTableName.set(tableName, causeId);
          this.notifyListeners(tableName, operation, this.deepClone(recordForNotification), stryMutAct_9fa48("35071") ? {} : (stryCov_9fa48("35071"), {
            causeId
          }));
        }
      }
    }
  }

  /**
   * Clear all data from the cache.
   * Used primarily for testing.
   */
  clear() {
    if (stryMutAct_9fa48("35072")) {
      {}
    } else {
      stryCov_9fa48("35072");
      for (const tableName of SYSTEM_TABLES) {
        if (stryMutAct_9fa48("35073")) {
          {}
        } else {
          stryCov_9fa48("35073");
          this.tables.get(tableName).clear();
        }
      }
      this.appliedSchemaVersions.clear();
      this.lastAppliedAtMsByTableName.clear();
      this.lastAppliedCauseIdByTableName.clear();
      this.logger.debug(CACHE_LOG_MSG.CACHE_CLEARED);
    }
  }

  /**
   * Get the list of supported system table names.
   * @return {Array<string>} Array of system table names.
   */
  getTableNames() {
    if (stryMutAct_9fa48("35074")) {
      {}
    } else {
      stryCov_9fa48("35074");
      return stryMutAct_9fa48("35075") ? [] : (stryCov_9fa48("35075"), [...SYSTEM_TABLES]);
    }
  }

  /**
   * Validate that a table name is a valid system table.
   * @param {string} tableName - Name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (stryMutAct_9fa48("35076")) {
      {}
    } else {
      stryCov_9fa48("35076");
      if (stryMutAct_9fa48("35079") ? false : stryMutAct_9fa48("35078") ? true : stryMutAct_9fa48("35077") ? SYSTEM_TABLES.includes(tableName) : (stryCov_9fa48("35077", "35078", "35079"), !SYSTEM_TABLES.includes(tableName))) {
        if (stryMutAct_9fa48("35080")) {
          {}
        } else {
          stryCov_9fa48("35080");
          throw new Error(CACHE_ERROR_MSG.invalidTableName(tableName, SYSTEM_TABLES));
        }
      }
    }
  }

  /**
   * Validate that an operation is a valid CDC operation.
   * @param {string} operation - Operation to validate.
   * @throws {Error} If operation is invalid.
   * @private
   */
  validateOperation(operation) {
    if (stryMutAct_9fa48("35081")) {
      {}
    } else {
      stryCov_9fa48("35081");
      if (stryMutAct_9fa48("35084") ? false : stryMutAct_9fa48("35083") ? true : stryMutAct_9fa48("35082") ? Object.values(CDC_OPERATIONS).includes(operation) : (stryCov_9fa48("35082", "35083", "35084"), !Object.values(CDC_OPERATIONS).includes(operation))) {
        if (stryMutAct_9fa48("35085")) {
          {}
        } else {
          stryCov_9fa48("35085");
          throw new Error(CACHE_ERROR_MSG.invalidCdcOperation(operation, Object.values(CDC_OPERATIONS)));
        }
      }
    }
  }

  /**
   * Deep clone an object to prevent external mutation.
   * @param {Object} obj - Object to clone.
   * @return {Object} Cloned object.
   * @private
   */
  deepClone(obj) {
    if (stryMutAct_9fa48("35086")) {
      {}
    } else {
      stryCov_9fa48("35086");
      return JSON.parse(JSON.stringify(obj));
    }
  }

  /**
   * Get a comparable timestamp from a row.
   * Prefers updated_at, then created_at.
   * @param {Object} record - Row record.
   * @return {number|null} Comparable timestamp or null.
   * @private
   */
  getRecordTimestamp(record) {
    if (stryMutAct_9fa48("35087")) {
      {}
    } else {
      stryCov_9fa48("35087");
      const updatedAt = Number(stryMutAct_9fa48("35088") ? record[COLUMN.UPDATED_AT] : (stryCov_9fa48("35088"), record?.[COLUMN.UPDATED_AT]));
      if (stryMutAct_9fa48("35091") ? Number.isFinite(updatedAt) || updatedAt > NUM.ZERO : stryMutAct_9fa48("35090") ? false : stryMutAct_9fa48("35089") ? true : (stryCov_9fa48("35089", "35090", "35091"), Number.isFinite(updatedAt) && (stryMutAct_9fa48("35094") ? updatedAt <= NUM.ZERO : stryMutAct_9fa48("35093") ? updatedAt >= NUM.ZERO : stryMutAct_9fa48("35092") ? true : (stryCov_9fa48("35092", "35093", "35094"), updatedAt > NUM.ZERO)))) {
        if (stryMutAct_9fa48("35095")) {
          {}
        } else {
          stryCov_9fa48("35095");
          return updatedAt;
        }
      }
      const createdAt = Number(stryMutAct_9fa48("35096") ? record[COLUMN.CREATED_AT] : (stryCov_9fa48("35096"), record?.[COLUMN.CREATED_AT]));
      if (stryMutAct_9fa48("35099") ? Number.isFinite(createdAt) || createdAt > NUM.ZERO : stryMutAct_9fa48("35098") ? false : stryMutAct_9fa48("35097") ? true : (stryCov_9fa48("35097", "35098", "35099"), Number.isFinite(createdAt) && (stryMutAct_9fa48("35102") ? createdAt <= NUM.ZERO : stryMutAct_9fa48("35101") ? createdAt >= NUM.ZERO : stryMutAct_9fa48("35100") ? true : (stryCov_9fa48("35100", "35101", "35102"), createdAt > NUM.ZERO)))) {
        if (stryMutAct_9fa48("35103")) {
          {}
        } else {
          stryCov_9fa48("35103");
          return createdAt;
        }
      }
      return null;
    }
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
    if (stryMutAct_9fa48("35104")) {
      {}
    } else {
      stryCov_9fa48("35104");
      const existingTimestamp = this.getRecordTimestamp(existing);
      const incomingTimestamp = this.getRecordTimestamp(incoming);
      if (stryMutAct_9fa48("35107") ? !Number.isFinite(existingTimestamp) && !Number.isFinite(incomingTimestamp) : stryMutAct_9fa48("35106") ? false : stryMutAct_9fa48("35105") ? true : (stryCov_9fa48("35105", "35106", "35107"), (stryMutAct_9fa48("35108") ? Number.isFinite(existingTimestamp) : (stryCov_9fa48("35108"), !Number.isFinite(existingTimestamp))) || (stryMutAct_9fa48("35109") ? Number.isFinite(incomingTimestamp) : (stryCov_9fa48("35109"), !Number.isFinite(incomingTimestamp))))) {
        if (stryMutAct_9fa48("35110")) {
          {}
        } else {
          stryCov_9fa48("35110");
          return stryMutAct_9fa48("35113") ? tableName === TABLES.NODES || isNodeHeartbeatWatermarkRegression(existing, incoming) : stryMutAct_9fa48("35112") ? false : stryMutAct_9fa48("35111") ? true : (stryCov_9fa48("35111", "35112", "35113"), (stryMutAct_9fa48("35115") ? tableName !== TABLES.NODES : stryMutAct_9fa48("35114") ? true : (stryCov_9fa48("35114", "35115"), tableName === TABLES.NODES)) && isNodeHeartbeatWatermarkRegression(existing, incoming));
        }
      }
      if (stryMutAct_9fa48("35119") ? incomingTimestamp >= existingTimestamp : stryMutAct_9fa48("35118") ? incomingTimestamp <= existingTimestamp : stryMutAct_9fa48("35117") ? false : stryMutAct_9fa48("35116") ? true : (stryCov_9fa48("35116", "35117", "35118", "35119"), incomingTimestamp < existingTimestamp)) {
        if (stryMutAct_9fa48("35120")) {
          {}
        } else {
          stryCov_9fa48("35120");
          return stryMutAct_9fa48("35121") ? false : (stryCov_9fa48("35121"), true);
        }
      }
      if (stryMutAct_9fa48("35125") ? incomingTimestamp <= existingTimestamp : stryMutAct_9fa48("35124") ? incomingTimestamp >= existingTimestamp : stryMutAct_9fa48("35123") ? false : stryMutAct_9fa48("35122") ? true : (stryCov_9fa48("35122", "35123", "35124", "35125"), incomingTimestamp > existingTimestamp)) {
        if (stryMutAct_9fa48("35126")) {
          {}
        } else {
          stryCov_9fa48("35126");
          return stryMutAct_9fa48("35127") ? true : (stryCov_9fa48("35127"), false);
        }
      }
      return stryMutAct_9fa48("35130") ? tableName === TABLES.NODES || isNodeHeartbeatWatermarkRegression(existing, incoming) : stryMutAct_9fa48("35129") ? false : stryMutAct_9fa48("35128") ? true : (stryCov_9fa48("35128", "35129", "35130"), (stryMutAct_9fa48("35132") ? tableName !== TABLES.NODES : stryMutAct_9fa48("35131") ? true : (stryCov_9fa48("35131", "35132"), tableName === TABLES.NODES)) && isNodeHeartbeatWatermarkRegression(existing, incoming));
    }
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
    if (stryMutAct_9fa48("35133")) {
      {}
    } else {
      stryCov_9fa48("35133");
      if (stryMutAct_9fa48("35135") ? false : stryMutAct_9fa48("35134") ? true : (stryCov_9fa48("35134", "35135"), this.shouldUsePublicationMerge(existing, incoming))) {
        if (stryMutAct_9fa48("35136")) {
          {}
        } else {
          stryCov_9fa48("35136");
          const mergedRecord = mergeControlPlanePublicationRows(existing, incoming);
          if (stryMutAct_9fa48("35139") ? JSON.stringify(mergedRecord) !== JSON.stringify(existing) : stryMutAct_9fa48("35138") ? false : stryMutAct_9fa48("35137") ? true : (stryCov_9fa48("35137", "35138", "35139"), JSON.stringify(mergedRecord) === JSON.stringify(existing))) {
            if (stryMutAct_9fa48("35140")) {
              {}
            } else {
              stryCov_9fa48("35140");
              return stryMutAct_9fa48("35141") ? {} : (stryCov_9fa48("35141"), {
                applied: stryMutAct_9fa48("35142") ? true : (stryCov_9fa48("35142"), false),
                record: existing,
                backfilledFields: stryMutAct_9fa48("35143") ? ["Stryker was here"] : (stryCov_9fa48("35143"), [])
              });
            }
          }
          table.set(key, mergedRecord);
          return stryMutAct_9fa48("35144") ? {} : (stryCov_9fa48("35144"), {
            applied: stryMutAct_9fa48("35145") ? false : (stryCov_9fa48("35145"), true),
            record: mergedRecord,
            backfilledFields: Object.keys(incoming)
          });
        }
      }
      const merged = this.deepClone(existing);
      const backfilledFields = stryMutAct_9fa48("35146") ? ["Stryker was here"] : (stryCov_9fa48("35146"), []);
      for (const [field, incomingValue] of Object.entries(incoming)) {
        if (stryMutAct_9fa48("35147")) {
          {}
        } else {
          stryCov_9fa48("35147");
          if (stryMutAct_9fa48("35149") ? false : stryMutAct_9fa48("35148") ? true : (stryCov_9fa48("35148", "35149"), this.shouldBackfillMissingField(merged[field], incomingValue))) {
            if (stryMutAct_9fa48("35150")) {
              {}
            } else {
              stryCov_9fa48("35150");
              merged[field] = this.cloneFieldValue(incomingValue);
              backfilledFields.push(field);
            }
          }
        }
      }
      if (stryMutAct_9fa48("35153") ? backfilledFields.length !== NUM.ZERO : stryMutAct_9fa48("35152") ? false : stryMutAct_9fa48("35151") ? true : (stryCov_9fa48("35151", "35152", "35153"), backfilledFields.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("35154")) {
          {}
        } else {
          stryCov_9fa48("35154");
          return stryMutAct_9fa48("35155") ? {} : (stryCov_9fa48("35155"), {
            applied: stryMutAct_9fa48("35156") ? true : (stryCov_9fa48("35156"), false),
            record: existing,
            backfilledFields
          });
        }
      }
      table.set(key, merged);
      return stryMutAct_9fa48("35157") ? {} : (stryCov_9fa48("35157"), {
        applied: stryMutAct_9fa48("35158") ? false : (stryCov_9fa48("35158"), true),
        record: merged,
        backfilledFields
      });
    }
  }

  /**
   * Clone one field value while preserving primitives/null.
   * @param {*} value - Field value.
   * @return {*} Cloned value.
   * @private
   */
  cloneFieldValue(value) {
    if (stryMutAct_9fa48("35159")) {
      {}
    } else {
      stryCov_9fa48("35159");
      if (stryMutAct_9fa48("35162") ? value === null && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("35161") ? false : stryMutAct_9fa48("35160") ? true : (stryCov_9fa48("35160", "35161", "35162"), (stryMutAct_9fa48("35164") ? value !== null : stryMutAct_9fa48("35163") ? false : (stryCov_9fa48("35163", "35164"), value === null)) || (stryMutAct_9fa48("35166") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("35165") ? false : (stryCov_9fa48("35165", "35166"), typeof value !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("35167")) {
          {}
        } else {
          stryCov_9fa48("35167");
          return value;
        }
      }
      return this.deepClone(value);
    }
  }

  /**
   * Determine if a stale incoming field may backfill an existing missing field.
   * @param {*} existingValue - Existing field value.
   * @param {*} incomingValue - Incoming stale field value.
   * @return {boolean} True when the field should be backfilled.
   * @private
   */
  shouldBackfillMissingField(existingValue, incomingValue) {
    if (stryMutAct_9fa48("35168")) {
      {}
    } else {
      stryCov_9fa48("35168");
      const existingMissing = stryMutAct_9fa48("35171") ? existingValue === null && typeof existingValue === TYPEOF.UNDEFINED : stryMutAct_9fa48("35170") ? false : stryMutAct_9fa48("35169") ? true : (stryCov_9fa48("35169", "35170", "35171"), (stryMutAct_9fa48("35173") ? existingValue !== null : stryMutAct_9fa48("35172") ? false : (stryCov_9fa48("35172", "35173"), existingValue === null)) || (stryMutAct_9fa48("35175") ? typeof existingValue !== TYPEOF.UNDEFINED : stryMutAct_9fa48("35174") ? false : (stryCov_9fa48("35174", "35175"), typeof existingValue === TYPEOF.UNDEFINED)));
      const incomingPresent = stryMutAct_9fa48("35178") ? incomingValue !== null || typeof incomingValue !== TYPEOF.UNDEFINED : stryMutAct_9fa48("35177") ? false : stryMutAct_9fa48("35176") ? true : (stryCov_9fa48("35176", "35177", "35178"), (stryMutAct_9fa48("35180") ? incomingValue === null : stryMutAct_9fa48("35179") ? true : (stryCov_9fa48("35179", "35180"), incomingValue !== null)) && (stryMutAct_9fa48("35182") ? typeof incomingValue === TYPEOF.UNDEFINED : stryMutAct_9fa48("35181") ? true : (stryCov_9fa48("35181", "35182"), typeof incomingValue !== TYPEOF.UNDEFINED)));
      return stryMutAct_9fa48("35185") ? existingMissing || incomingPresent : stryMutAct_9fa48("35184") ? false : stryMutAct_9fa48("35183") ? true : (stryCov_9fa48("35183", "35184", "35185"), existingMissing && incomingPresent);
    }
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
    if (stryMutAct_9fa48("35186")) {
      {}
    } else {
      stryCov_9fa48("35186");
      if (stryMutAct_9fa48("35189") ? tableName !== TABLES.CONTROL_PLANE_PUBLICATIONS : stryMutAct_9fa48("35188") ? false : stryMutAct_9fa48("35187") ? true : (stryCov_9fa48("35187", "35188", "35189"), tableName === TABLES.CONTROL_PLANE_PUBLICATIONS)) {
        if (stryMutAct_9fa48("35190")) {
          {}
        } else {
          stryCov_9fa48("35190");
          return mergeControlPlanePublicationRows(incoming, existing);
        }
      }
      return stryMutAct_9fa48("35191") ? {} : (stryCov_9fa48("35191"), {
        ...existing,
        ...this.deepClone(incoming)
      });
    }
  }

  /**
   * Determine whether control-plane publication merge semantics apply.
   * @param {Object} existing - Existing cached row.
   * @param {Object} incoming - Incoming CDC row.
   * @return {boolean}
   * @private
   */
  shouldUsePublicationMerge(existing, incoming) {
    if (stryMutAct_9fa48("35192")) {
      {}
    } else {
      stryCov_9fa48("35192");
      return Boolean(stryMutAct_9fa48("35195") ? existing?.publication_id && incoming?.publication_id : stryMutAct_9fa48("35194") ? false : stryMutAct_9fa48("35193") ? true : (stryCov_9fa48("35193", "35194", "35195"), (stryMutAct_9fa48("35196") ? existing.publication_id : (stryCov_9fa48("35196"), existing?.publication_id)) || (stryMutAct_9fa48("35197") ? incoming.publication_id : (stryCov_9fa48("35197"), incoming?.publication_id))));
    }
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
    if (stryMutAct_9fa48("35198")) {
      {}
    } else {
      stryCov_9fa48("35198");
      if (stryMutAct_9fa48("35201") ? incomingVersion !== currentVersion : stryMutAct_9fa48("35200") ? false : stryMutAct_9fa48("35199") ? true : (stryCov_9fa48("35199", "35200", "35201"), incomingVersion === currentVersion)) {
        if (stryMutAct_9fa48("35202")) {
          {}
        } else {
          stryCov_9fa48("35202");
          return NUM.ZERO;
        }
      }
      const incomingHlc = this.tryParseHLCTimestamp(incomingVersion);
      const currentHlc = this.tryParseHLCTimestamp(currentVersion);
      if (stryMutAct_9fa48("35205") ? incomingHlc || currentHlc : stryMutAct_9fa48("35204") ? false : stryMutAct_9fa48("35203") ? true : (stryCov_9fa48("35203", "35204", "35205"), incomingHlc && currentHlc)) {
        if (stryMutAct_9fa48("35206")) {
          {}
        } else {
          stryCov_9fa48("35206");
          return incomingHlc.compare(currentHlc);
        }
      }
      const incomingNumber = Number(incomingVersion);
      const currentNumber = Number(currentVersion);
      if (stryMutAct_9fa48("35209") ? Number.isFinite(incomingNumber) || Number.isFinite(currentNumber) : stryMutAct_9fa48("35208") ? false : stryMutAct_9fa48("35207") ? true : (stryCov_9fa48("35207", "35208", "35209"), Number.isFinite(incomingNumber) && Number.isFinite(currentNumber))) {
        if (stryMutAct_9fa48("35210")) {
          {}
        } else {
          stryCov_9fa48("35210");
          return stryMutAct_9fa48("35211") ? incomingNumber + currentNumber : (stryCov_9fa48("35211"), incomingNumber - currentNumber);
        }
      }
      return String(incomingVersion).localeCompare(String(currentVersion));
    }
  }

  /**
   * Best-effort parse for HLC-formatted version values.
   * @param {string|number} value
   * @return {HLCTimestamp|null}
   * @private
   */
  tryParseHLCTimestamp(value) {
    if (stryMutAct_9fa48("35212")) {
      {}
    } else {
      stryCov_9fa48("35212");
      if (stryMutAct_9fa48("35215") ? typeof value === TYPEOF.UNDEFINED && value === null : stryMutAct_9fa48("35214") ? false : stryMutAct_9fa48("35213") ? true : (stryCov_9fa48("35213", "35214", "35215"), (stryMutAct_9fa48("35217") ? typeof value !== TYPEOF.UNDEFINED : stryMutAct_9fa48("35216") ? false : (stryCov_9fa48("35216", "35217"), typeof value === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("35219") ? value !== null : stryMutAct_9fa48("35218") ? false : (stryCov_9fa48("35218", "35219"), value === null)))) {
        if (stryMutAct_9fa48("35220")) {
          {}
        } else {
          stryCov_9fa48("35220");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("35221")) {
          {}
        } else {
          stryCov_9fa48("35221");
          return HLCTimestamp.fromString(String(value));
        }
      } catch {
        if (stryMutAct_9fa48("35222")) {
          {}
        } else {
          stryCov_9fa48("35222");
          return null;
        }
      }
    }
  }
}
export { SystemTableCache, SYSTEM_TABLES, CDC_OPERATIONS, PRIMARY_KEY_FIELDS };