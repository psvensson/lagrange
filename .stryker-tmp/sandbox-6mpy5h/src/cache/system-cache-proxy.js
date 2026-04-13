/**
 * SystemCacheProxy - Stateless proxy for system cache access.
 *
 * This proxy forwards all cache queries to a local message group replica.
 * It does NOT cache any data locally - all queries are forwarded to the
 * worker process that holds the actual SQLite-based system cache.
 *
 * The proxy selects one local message group replica and reuses it until
 * the set of local replicas changes.
 *
 * @module cache/system-cache-proxy
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5
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
import { EventEmitter } from 'events';
import { CACHE_MESSAGE_TYPE, WORKER_ENTITY_TYPE, WORKER_EVENT, WORKER_HEALTH_STATUS } from '../worker/worker-constants.js';
import { NUM, TYPEOF } from '../constants/index.js';

/**
 * Error messages for SystemCacheProxy.
 * @type {Readonly<Object>}
 */
const PROXY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("34682") ? {} : (stryCov_9fa48("34682"), {
  NOT_INITIALIZED: stryMutAct_9fa48("34683") ? "" : (stryCov_9fa48("34683"), 'SystemCacheProxy not initialized'),
  NO_LOCAL_REPLICA: stryMutAct_9fa48("34684") ? "" : (stryCov_9fa48("34684"), 'No local message group replica available'),
  MISSING_WORKER_MANAGER: stryMutAct_9fa48("34685") ? "" : (stryCov_9fa48("34685"), 'workerManager is required'),
  QUERY_FAILED: stryMutAct_9fa48("34686") ? "" : (stryCov_9fa48("34686"), 'Cache query failed'),
  INVALID_TABLE_NAME: stryMutAct_9fa48("34687") ? "" : (stryCov_9fa48("34687"), 'tableName is required'),
  INVALID_KEY: stryMutAct_9fa48("34688") ? "" : (stryCov_9fa48("34688"), 'key is required'),
  INVALID_SQL: stryMutAct_9fa48("34689") ? "" : (stryCov_9fa48("34689"), 'sql is required'),
  INVALID_PREDICATE: stryMutAct_9fa48("34690") ? "" : (stryCov_9fa48("34690"), 'predicate must be a function')
}));

/**
 * Log messages for SystemCacheProxy.
 * @type {Readonly<Object>}
 */
const PROXY_LOG_MSG = Object.freeze(stryMutAct_9fa48("34691") ? {} : (stryCov_9fa48("34691"), {
  INITIALIZING: stryMutAct_9fa48("34692") ? "" : (stryCov_9fa48("34692"), 'Initializing SystemCacheProxy'),
  INITIALIZED: stryMutAct_9fa48("34693") ? "" : (stryCov_9fa48("34693"), 'SystemCacheProxy initialized'),
  SELECTING_REPLICA: stryMutAct_9fa48("34694") ? "" : (stryCov_9fa48("34694"), 'Selecting local message group replica'),
  REPLICA_SELECTED: stryMutAct_9fa48("34695") ? "" : (stryCov_9fa48("34695"), 'Selected local message group replica'),
  NO_REPLICA_AVAILABLE: stryMutAct_9fa48("34696") ? "" : (stryCov_9fa48("34696"), 'No local message group replica available'),
  FORWARDING_QUERY: stryMutAct_9fa48("34697") ? "" : (stryCov_9fa48("34697"), 'Forwarding cache query to worker'),
  QUERY_COMPLETED: stryMutAct_9fa48("34698") ? "" : (stryCov_9fa48("34698"), 'Cache query completed'),
  QUERY_FAILED: stryMutAct_9fa48("34699") ? "" : (stryCov_9fa48("34699"), 'Cache query failed')
}));

/**
 * SystemCacheProxy - Stateless proxy for system cache access.
 * Forwards all queries to a local message group replica.
 * Does NOT cache any data locally.
 *
 * @extends EventEmitter
 */
class SystemCacheProxy extends EventEmitter {
  /**
   * Create a new SystemCacheProxy.
   * @param {Object} options - Configuration options.
   * @param {Object} options.workerManager - ReplicaWorkerManager instance.
   * @param {Object} [options.logger=console] - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("34700")) {
      {}
    } else {
      stryCov_9fa48("34700");
      super();
      if (stryMutAct_9fa48("34703") ? false : stryMutAct_9fa48("34702") ? true : stryMutAct_9fa48("34701") ? options.workerManager : (stryCov_9fa48("34701", "34702", "34703"), !options.workerManager)) {
        if (stryMutAct_9fa48("34704")) {
          {}
        } else {
          stryCov_9fa48("34704");
          throw new Error(PROXY_ERROR_MSG.MISSING_WORKER_MANAGER);
        }
      }

      /** @type {Object} ReplicaWorkerManager instance */
      this.workerManager = options.workerManager;

      /** @type {Object} Logger instance */
      this.logger = stryMutAct_9fa48("34707") ? options.logger && console : stryMutAct_9fa48("34706") ? false : stryMutAct_9fa48("34705") ? true : (stryCov_9fa48("34705", "34706", "34707"), options.logger || console);

      /** @type {string|null} Currently selected replica ID */
      this.selectedReplicaId = null;

      /** @type {Set<string>} Current set of local message group replica IDs */
      this.localReplicaIds = new Set();

      /** @type {boolean} Whether the proxy is initialized */
      this.initialized = stryMutAct_9fa48("34708") ? true : (stryCov_9fa48("34708"), false);

      /** @type {Function|null} Bound listener for REPLICA_CREATED events */
      this._onReplicaCreated = null;

      /** @type {Function|null} Bound listener for REPLICA_STOPPED events */
      this._onReplicaStopped = null;

      /** @type {Function|null} Bound listener for REPLICA_FAILED events */
      this._onReplicaFailed = null;
    }
  }

  /**
   * Initialize the proxy.
   * Selects an initial local message group replica.
   * @return {Promise<void>}
   */
  async initialize() {
    if (stryMutAct_9fa48("34709")) {
      {}
    } else {
      stryCov_9fa48("34709");
      this.logger.info(PROXY_LOG_MSG.INITIALIZING);
      this.registerEventListeners();
      this.loadInitialReplicaSet();
      this.selectLocalReplica();
      this.initialized = stryMutAct_9fa48("34710") ? false : (stryCov_9fa48("34710"), true);
      this.logger.info(PROXY_LOG_MSG.INITIALIZED, stryMutAct_9fa48("34711") ? {} : (stryCov_9fa48("34711"), {
        selectedReplicaId: this.selectedReplicaId
      }));
    }
  }

  /**
   * Register event listeners on workerManager for replica lifecycle events.
   * Binds handler methods and stores references for clean removal.
   */
  registerEventListeners() {
    if (stryMutAct_9fa48("34712")) {
      {}
    } else {
      stryCov_9fa48("34712");
      this._onReplicaCreated = this.handleReplicaCreated.bind(this);
      this._onReplicaStopped = this.handleReplicaStopped.bind(this);
      this._onReplicaFailed = this.handleReplicaFailed.bind(this);
      this.workerManager.on(WORKER_EVENT.REPLICA_CREATED, this._onReplicaCreated);
      this.workerManager.on(WORKER_EVENT.REPLICA_STOPPED, this._onReplicaStopped);
      this.workerManager.on(WORKER_EVENT.REPLICA_FAILED, this._onReplicaFailed);
    }
  }

  /**
   * Remove all registered event listeners from workerManager.
   * Safely checks for null before removing each listener.
   */
  removeEventListeners() {
    if (stryMutAct_9fa48("34713")) {
      {}
    } else {
      stryCov_9fa48("34713");
      if (stryMutAct_9fa48("34715") ? false : stryMutAct_9fa48("34714") ? true : (stryCov_9fa48("34714", "34715"), this._onReplicaCreated)) {
        if (stryMutAct_9fa48("34716")) {
          {}
        } else {
          stryCov_9fa48("34716");
          this.workerManager.removeListener(WORKER_EVENT.REPLICA_CREATED, this._onReplicaCreated);
        }
      }
      if (stryMutAct_9fa48("34718") ? false : stryMutAct_9fa48("34717") ? true : (stryCov_9fa48("34717", "34718"), this._onReplicaStopped)) {
        if (stryMutAct_9fa48("34719")) {
          {}
        } else {
          stryCov_9fa48("34719");
          this.workerManager.removeListener(WORKER_EVENT.REPLICA_STOPPED, this._onReplicaStopped);
        }
      }
      if (stryMutAct_9fa48("34721") ? false : stryMutAct_9fa48("34720") ? true : (stryCov_9fa48("34720", "34721"), this._onReplicaFailed)) {
        if (stryMutAct_9fa48("34722")) {
          {}
        } else {
          stryCov_9fa48("34722");
          this.workerManager.removeListener(WORKER_EVENT.REPLICA_FAILED, this._onReplicaFailed);
        }
      }
      this._onReplicaCreated = null;
      this._onReplicaStopped = null;
      this._onReplicaFailed = null;
    }
  }

  /**
   * Shut down the proxy.
   * Removes all event listeners, clears replica state, and marks
   * the proxy as uninitialized.
   */
  shutdown() {
    if (stryMutAct_9fa48("34723")) {
      {}
    } else {
      stryCov_9fa48("34723");
      this.removeEventListeners();
      this.selectedReplicaId = null;
      this.localReplicaIds.clear();
      this.initialized = stryMutAct_9fa48("34724") ? true : (stryCov_9fa48("34724"), false);
    }
  }

  /**
   * Handle REPLICA_CREATED event from workerManager.
   * Filters by MESSAGE_GROUP entityType, adds to local set,
   * and selects if no replica is currently selected.
   * @param {Object} event - Replica created event payload.
   */
  handleReplicaCreated(event) {
    if (stryMutAct_9fa48("34725")) {
      {}
    } else {
      stryCov_9fa48("34725");
      if (stryMutAct_9fa48("34728") ? event.entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("34727") ? false : stryMutAct_9fa48("34726") ? true : (stryCov_9fa48("34726", "34727", "34728"), event.entityType !== WORKER_ENTITY_TYPE.MESSAGE_GROUP)) return;
      this.localReplicaIds.add(event.replicaId);
      if (stryMutAct_9fa48("34731") ? false : stryMutAct_9fa48("34730") ? true : stryMutAct_9fa48("34729") ? this.selectedReplicaId : (stryCov_9fa48("34729", "34730", "34731"), !this.selectedReplicaId)) {
        if (stryMutAct_9fa48("34732")) {
          {}
        } else {
          stryCov_9fa48("34732");
          this.selectLocalReplica();
        }
      }
    }
  }

  /**
   * Handle REPLICA_STOPPED event from workerManager.
   * Filters by MESSAGE_GROUP entityType, removes from local set,
   * and re-selects if the stopped replica was the selected one.
   * @param {Object} event - Replica stopped event payload.
   */
  handleReplicaStopped(event) {
    if (stryMutAct_9fa48("34733")) {
      {}
    } else {
      stryCov_9fa48("34733");
      if (stryMutAct_9fa48("34736") ? event.entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("34735") ? false : stryMutAct_9fa48("34734") ? true : (stryCov_9fa48("34734", "34735", "34736"), event.entityType !== WORKER_ENTITY_TYPE.MESSAGE_GROUP)) return;
      this.localReplicaIds.delete(event.replicaId);
      if (stryMutAct_9fa48("34739") ? this.selectedReplicaId !== event.replicaId : stryMutAct_9fa48("34738") ? false : stryMutAct_9fa48("34737") ? true : (stryCov_9fa48("34737", "34738", "34739"), this.selectedReplicaId === event.replicaId)) {
        if (stryMutAct_9fa48("34740")) {
          {}
        } else {
          stryCov_9fa48("34740");
          this.selectedReplicaId = null;
          this.selectLocalReplica();
        }
      }
    }
  }

  /**
   * Handle REPLICA_FAILED event from workerManager.
   * Filters by MESSAGE_GROUP entityType, removes from local set,
   * and re-selects if the failed replica was the selected one.
   * @param {Object} event - Replica failed event payload.
   */
  handleReplicaFailed(event) {
    if (stryMutAct_9fa48("34741")) {
      {}
    } else {
      stryCov_9fa48("34741");
      if (stryMutAct_9fa48("34744") ? event.entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("34743") ? false : stryMutAct_9fa48("34742") ? true : (stryCov_9fa48("34742", "34743", "34744"), event.entityType !== WORKER_ENTITY_TYPE.MESSAGE_GROUP)) return;
      this.localReplicaIds.delete(event.replicaId);
      if (stryMutAct_9fa48("34747") ? this.selectedReplicaId !== event.replicaId : stryMutAct_9fa48("34746") ? false : stryMutAct_9fa48("34745") ? true : (stryCov_9fa48("34745", "34746", "34747"), this.selectedReplicaId === event.replicaId)) {
        if (stryMutAct_9fa48("34748")) {
          {}
        } else {
          stryCov_9fa48("34748");
          this.selectedReplicaId = null;
          this.selectLocalReplica();
        }
      }
    }
  }

  /**
   * Get a record from a system table.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @return {Promise<Object|undefined>} Record or undefined.
   */
  async get(tableName, key) {
    if (stryMutAct_9fa48("34749")) {
      {}
    } else {
      stryCov_9fa48("34749");
      if (stryMutAct_9fa48("34752") ? false : stryMutAct_9fa48("34751") ? true : stryMutAct_9fa48("34750") ? tableName : (stryCov_9fa48("34750", "34751", "34752"), !tableName)) {
        if (stryMutAct_9fa48("34753")) {
          {}
        } else {
          stryCov_9fa48("34753");
          throw new Error(PROXY_ERROR_MSG.INVALID_TABLE_NAME);
        }
      }
      if (stryMutAct_9fa48("34756") ? key === undefined && key === null : stryMutAct_9fa48("34755") ? false : stryMutAct_9fa48("34754") ? true : (stryCov_9fa48("34754", "34755", "34756"), (stryMutAct_9fa48("34758") ? key !== undefined : stryMutAct_9fa48("34757") ? false : (stryCov_9fa48("34757", "34758"), key === undefined)) || (stryMutAct_9fa48("34760") ? key !== null : stryMutAct_9fa48("34759") ? false : (stryCov_9fa48("34759", "34760"), key === null)))) {
        if (stryMutAct_9fa48("34761")) {
          {}
        } else {
          stryCov_9fa48("34761");
          throw new Error(PROXY_ERROR_MSG.INVALID_KEY);
        }
      }
      const response = await this.sendCacheQuery(stryMutAct_9fa48("34762") ? {} : (stryCov_9fa48("34762"), {
        type: CACHE_MESSAGE_TYPE.CACHE_GET,
        tableName,
        key
      }));
      return stryMutAct_9fa48("34763") ? response.data : (stryCov_9fa48("34763"), response?.data);
    }
  }

  /**
   * Query system table with SQL.
   * Forwards query to local message group replica.
   * @param {string} sql - SQL query.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Promise<Array<Object>>} Query results.
   */
  async query(sql, params = stryMutAct_9fa48("34764") ? ["Stryker was here"] : (stryCov_9fa48("34764"), [])) {
    if (stryMutAct_9fa48("34765")) {
      {}
    } else {
      stryCov_9fa48("34765");
      if (stryMutAct_9fa48("34768") ? false : stryMutAct_9fa48("34767") ? true : stryMutAct_9fa48("34766") ? sql : (stryCov_9fa48("34766", "34767", "34768"), !sql)) {
        if (stryMutAct_9fa48("34769")) {
          {}
        } else {
          stryCov_9fa48("34769");
          throw new Error(PROXY_ERROR_MSG.INVALID_SQL);
        }
      }
      const response = await this.sendCacheQuery(stryMutAct_9fa48("34770") ? {} : (stryCov_9fa48("34770"), {
        type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
        sql,
        params
      }));
      return stryMutAct_9fa48("34773") ? response?.rows && [] : stryMutAct_9fa48("34772") ? false : stryMutAct_9fa48("34771") ? true : (stryCov_9fa48("34771", "34772", "34773"), (stryMutAct_9fa48("34774") ? response.rows : (stryCov_9fa48("34774"), response?.rows)) || (stryMutAct_9fa48("34775") ? ["Stryker was here"] : (stryCov_9fa48("34775"), [])));
    }
  }

  /**
   * Filter records from a system table.
   * Note: The predicate is serialized as a string for IPC transmission.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Filter function.
   * @return {Promise<Array<Object>>} Matching records.
   */
  async filter(tableName, predicate) {
    if (stryMutAct_9fa48("34776")) {
      {}
    } else {
      stryCov_9fa48("34776");
      if (stryMutAct_9fa48("34779") ? false : stryMutAct_9fa48("34778") ? true : stryMutAct_9fa48("34777") ? tableName : (stryCov_9fa48("34777", "34778", "34779"), !tableName)) {
        if (stryMutAct_9fa48("34780")) {
          {}
        } else {
          stryCov_9fa48("34780");
          throw new Error(PROXY_ERROR_MSG.INVALID_TABLE_NAME);
        }
      }
      if (stryMutAct_9fa48("34783") ? typeof predicate === TYPEOF.FUNCTION : stryMutAct_9fa48("34782") ? false : stryMutAct_9fa48("34781") ? true : (stryCov_9fa48("34781", "34782", "34783"), typeof predicate !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("34784")) {
          {}
        } else {
          stryCov_9fa48("34784");
          throw new Error(PROXY_ERROR_MSG.INVALID_PREDICATE);
        }
      }

      // Serialize predicate to string for IPC transmission
      const predicateString = predicate.toString();
      const response = await this.sendCacheQuery(stryMutAct_9fa48("34785") ? {} : (stryCov_9fa48("34785"), {
        type: CACHE_MESSAGE_TYPE.CACHE_FILTER,
        tableName,
        predicateString
      }));
      return stryMutAct_9fa48("34788") ? response?.records && [] : stryMutAct_9fa48("34787") ? false : stryMutAct_9fa48("34786") ? true : (stryCov_9fa48("34786", "34787", "34788"), (stryMutAct_9fa48("34789") ? response.records : (stryCov_9fa48("34789"), response?.records)) || (stryMutAct_9fa48("34790") ? ["Stryker was here"] : (stryCov_9fa48("34790"), [])));
    }
  }

  /**
   * Get all records from a system table.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name.
   * @return {Promise<Array<Object>>} All records.
   */
  async getAll(tableName) {
    if (stryMutAct_9fa48("34791")) {
      {}
    } else {
      stryCov_9fa48("34791");
      if (stryMutAct_9fa48("34794") ? false : stryMutAct_9fa48("34793") ? true : stryMutAct_9fa48("34792") ? tableName : (stryCov_9fa48("34792", "34793", "34794"), !tableName)) {
        if (stryMutAct_9fa48("34795")) {
          {}
        } else {
          stryCov_9fa48("34795");
          throw new Error(PROXY_ERROR_MSG.INVALID_TABLE_NAME);
        }
      }
      const response = await this.sendCacheQuery(stryMutAct_9fa48("34796") ? {} : (stryCov_9fa48("34796"), {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL,
        tableName
      }));
      return stryMutAct_9fa48("34799") ? response?.records && [] : stryMutAct_9fa48("34798") ? false : stryMutAct_9fa48("34797") ? true : (stryCov_9fa48("34797", "34798", "34799"), (stryMutAct_9fa48("34800") ? response.records : (stryCov_9fa48("34800"), response?.records)) || (stryMutAct_9fa48("34801") ? ["Stryker was here"] : (stryCov_9fa48("34801"), [])));
    }
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Filter function.
   * @return {Promise<Object|undefined>} First matching record or undefined.
   */
  async find(tableName, predicate) {
    if (stryMutAct_9fa48("34802")) {
      {}
    } else {
      stryCov_9fa48("34802");
      const results = await (stryMutAct_9fa48("34803") ? this : (stryCov_9fa48("34803"), this.filter(tableName, predicate)));
      return (stryMutAct_9fa48("34807") ? results.length <= NUM.ZERO : stryMutAct_9fa48("34806") ? results.length >= NUM.ZERO : stryMutAct_9fa48("34805") ? false : stryMutAct_9fa48("34804") ? true : (stryCov_9fa48("34804", "34805", "34806", "34807"), results.length > NUM.ZERO)) ? results[NUM.ZERO] : undefined;
    }
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @return {Promise<boolean>} True if record exists.
   */
  async has(tableName, key) {
    if (stryMutAct_9fa48("34808")) {
      {}
    } else {
      stryCov_9fa48("34808");
      const record = await this.get(tableName, key);
      return stryMutAct_9fa48("34811") ? record === undefined : stryMutAct_9fa48("34810") ? false : stryMutAct_9fa48("34809") ? true : (stryCov_9fa48("34809", "34810", "34811"), record !== undefined);
    }
  }

  /**
   * Send a cache query to the selected local message group replica.
   * Errors propagate directly to the caller — proactive event-driven
   * re-selection is the single mechanism for switching replicas.
   * @param {Object} message - Query message.
   * @return {Promise<Object>} Response from worker.
   * @private
   */
  async sendCacheQuery(message) {
    if (stryMutAct_9fa48("34812")) {
      {}
    } else {
      stryCov_9fa48("34812");
      this.ensureReplicaSelected();
      const response = await this.workerManager.deliverMessage(this.selectedReplicaId, message);
      return response;
    }
  }

  /**
   * Ensure a replica is selected, throwing if none available.
   * With event-driven wiring, if no replica is selected, none exist.
   * @private
   */
  ensureReplicaSelected() {
    if (stryMutAct_9fa48("34813")) {
      {}
    } else {
      stryCov_9fa48("34813");
      if (stryMutAct_9fa48("34816") ? false : stryMutAct_9fa48("34815") ? true : stryMutAct_9fa48("34814") ? this.selectedReplicaId : (stryCov_9fa48("34814", "34815", "34816"), !this.selectedReplicaId)) {
        if (stryMutAct_9fa48("34817")) {
          {}
        } else {
          stryCov_9fa48("34817");
          throw new Error(PROXY_ERROR_MSG.NO_LOCAL_REPLICA);
        }
      }
    }
  }

  /**
   * Load the initial set of local message group replica IDs.
   * Called once during initialize() for the initial snapshot.
   * After initialization, events maintain the set incrementally.
   * @private
   */
  loadInitialReplicaSet() {
    if (stryMutAct_9fa48("34818")) {
      {}
    } else {
      stryCov_9fa48("34818");
      const messageGroupWorkers = this.workerManager.getWorkersByType(WORKER_ENTITY_TYPE.MESSAGE_GROUP);
      this.localReplicaIds = new Set(messageGroupWorkers.map(stryMutAct_9fa48("34819") ? () => undefined : (stryCov_9fa48("34819"), handle => handle.replicaId)));
    }
  }

  /**
   * Select a local message group replica for queries.
   * Prefers healthy replicas but falls back to any available
   * if all are unhealthy.
   * @private
   */
  selectLocalReplica() {
    if (stryMutAct_9fa48("34820")) {
      {}
    } else {
      stryCov_9fa48("34820");
      this.logger.debug(PROXY_LOG_MSG.SELECTING_REPLICA, stryMutAct_9fa48("34821") ? {} : (stryCov_9fa48("34821"), {
        availableCount: this.localReplicaIds.size
      }));

      // If current selection is still valid and healthy, keep it
      if (stryMutAct_9fa48("34824") ? this.selectedReplicaId || this.localReplicaIds.has(this.selectedReplicaId) : stryMutAct_9fa48("34823") ? false : stryMutAct_9fa48("34822") ? true : (stryCov_9fa48("34822", "34823", "34824"), this.selectedReplicaId && this.localReplicaIds.has(this.selectedReplicaId))) {
        if (stryMutAct_9fa48("34825")) {
          {}
        } else {
          stryCov_9fa48("34825");
          const handle = this.workerManager.getWorker(this.selectedReplicaId);
          if (stryMutAct_9fa48("34828") ? handle || handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY : stryMutAct_9fa48("34827") ? false : stryMutAct_9fa48("34826") ? true : (stryCov_9fa48("34826", "34827", "34828"), handle && (stryMutAct_9fa48("34830") ? handle.healthStatus === WORKER_HEALTH_STATUS.UNHEALTHY : stryMutAct_9fa48("34829") ? true : (stryCov_9fa48("34829", "34830"), handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY)))) {
            if (stryMutAct_9fa48("34831")) {
              {}
            } else {
              stryCov_9fa48("34831");
              return;
            }
          }
        }
      }
      const replicaIds = Array.from(this.localReplicaIds);
      if (stryMutAct_9fa48("34834") ? replicaIds.length !== NUM.ZERO : stryMutAct_9fa48("34833") ? false : stryMutAct_9fa48("34832") ? true : (stryCov_9fa48("34832", "34833", "34834"), replicaIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("34835")) {
          {}
        } else {
          stryCov_9fa48("34835");
          this.selectedReplicaId = null;
          this.logger.warn(PROXY_LOG_MSG.NO_REPLICA_AVAILABLE);
          return;
        }
      }

      // Prefer healthy replicas
      const healthyId = replicaIds.find(id => {
        if (stryMutAct_9fa48("34836")) {
          {}
        } else {
          stryCov_9fa48("34836");
          const handle = this.workerManager.getWorker(id);
          return stryMutAct_9fa48("34839") ? handle || handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY : stryMutAct_9fa48("34838") ? false : stryMutAct_9fa48("34837") ? true : (stryCov_9fa48("34837", "34838", "34839"), handle && (stryMutAct_9fa48("34841") ? handle.healthStatus === WORKER_HEALTH_STATUS.UNHEALTHY : stryMutAct_9fa48("34840") ? true : (stryCov_9fa48("34840", "34841"), handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY)));
        }
      });

      // Fall back to any available if all unhealthy
      this.selectedReplicaId = stryMutAct_9fa48("34844") ? healthyId && replicaIds[NUM.ZERO] : stryMutAct_9fa48("34843") ? false : stryMutAct_9fa48("34842") ? true : (stryCov_9fa48("34842", "34843", "34844"), healthyId || replicaIds[NUM.ZERO]);
      this.logger.info(PROXY_LOG_MSG.REPLICA_SELECTED, stryMutAct_9fa48("34845") ? {} : (stryCov_9fa48("34845"), {
        replicaId: this.selectedReplicaId
      }));
    }
  }

  /**
   * Get the currently selected replica ID.
   * @return {string|null} Selected replica ID or null.
   */
  getSelectedReplicaId() {
    if (stryMutAct_9fa48("34846")) {
      {}
    } else {
      stryCov_9fa48("34846");
      return this.selectedReplicaId;
    }
  }

  /**
   * Get the count of local message group replicas.
   * @return {number} Number of local replicas.
   */
  getLocalReplicaCount() {
    if (stryMutAct_9fa48("34847")) {
      {}
    } else {
      stryCov_9fa48("34847");
      return this.localReplicaIds.size;
    }
  }

  /**
   * Check if the proxy is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("34848")) {
      {}
    } else {
      stryCov_9fa48("34848");
      return this.initialized;
    }
  }

  /**
   * Get proxy statistics.
   * @return {Object} Proxy statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("34849")) {
      {}
    } else {
      stryCov_9fa48("34849");
      return stryMutAct_9fa48("34850") ? {} : (stryCov_9fa48("34850"), {
        initialized: this.initialized,
        selectedReplicaId: this.selectedReplicaId,
        localReplicaCount: this.localReplicaIds.size
      });
    }
  }
}
export { SystemCacheProxy, PROXY_ERROR_MSG, PROXY_LOG_MSG };