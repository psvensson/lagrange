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

import {EventEmitter} from 'events';
import {
  CACHE_MESSAGE_TYPE,
  WORKER_ENTITY_TYPE,
  WORKER_EVENT,
  WORKER_HEALTH_STATUS,
} from '../worker/worker-constants.js';

/**
 * Error messages for SystemCacheProxy.
 * @type {Readonly<Object>}
 */
const PROXY_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'SystemCacheProxy not initialized',
  NO_LOCAL_REPLICA: 'No local message group replica available',
  MISSING_WORKER_MANAGER: 'workerManager is required',
  QUERY_FAILED: 'Cache query failed',
  INVALID_TABLE_NAME: 'tableName is required',
  INVALID_KEY: 'key is required',
  INVALID_SQL: 'sql is required',
  INVALID_PREDICATE: 'predicate must be a function',
});

/**
 * Log messages for SystemCacheProxy.
 * @type {Readonly<Object>}
 */
const PROXY_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing SystemCacheProxy',
  INITIALIZED: 'SystemCacheProxy initialized',
  SELECTING_REPLICA: 'Selecting local message group replica',
  REPLICA_SELECTED: 'Selected local message group replica',
  NO_REPLICA_AVAILABLE: 'No local message group replica available',
  FORWARDING_QUERY: 'Forwarding cache query to worker',
  QUERY_COMPLETED: 'Cache query completed',
  QUERY_FAILED: 'Cache query failed',
});

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
    super();

    if (!options.workerManager) {
      throw new Error(PROXY_ERROR_MSG.MISSING_WORKER_MANAGER);
    }

    /** @type {Object} ReplicaWorkerManager instance */
    this.workerManager = options.workerManager;

    /** @type {Object} Logger instance */
    this.logger = options.logger || console;

    /** @type {string|null} Currently selected replica ID */
    this.selectedReplicaId = null;

    /** @type {Set<string>} Current set of local message group replica IDs */
    this.localReplicaIds = new Set();

    /** @type {boolean} Whether the proxy is initialized */
    this.initialized = false;

    /** @type {Function|null} Bound listener for REPLICA_CREATED events */
    this._onReplicaCreated = null;

    /** @type {Function|null} Bound listener for REPLICA_STOPPED events */
    this._onReplicaStopped = null;

    /** @type {Function|null} Bound listener for REPLICA_FAILED events */
    this._onReplicaFailed = null;
  }

  /**
   * Initialize the proxy.
   * Selects an initial local message group replica.
   * @return {Promise<void>}
   */
  async initialize() {
    this.logger.info(PROXY_LOG_MSG.INITIALIZING);

    this.registerEventListeners();
    this.loadInitialReplicaSet();
    this.selectLocalReplica();

    this.initialized = true;

    this.logger.info(PROXY_LOG_MSG.INITIALIZED, {
      selectedReplicaId: this.selectedReplicaId,
    });
  }

  /**
   * Register event listeners on workerManager for replica lifecycle events.
   * Binds handler methods and stores references for clean removal.
   */
  registerEventListeners() {
    this._onReplicaCreated = this.handleReplicaCreated.bind(this);
    this._onReplicaStopped = this.handleReplicaStopped.bind(this);
    this._onReplicaFailed = this.handleReplicaFailed.bind(this);

    this.workerManager.on(
      WORKER_EVENT.REPLICA_CREATED, this._onReplicaCreated,
    );
    this.workerManager.on(
      WORKER_EVENT.REPLICA_STOPPED, this._onReplicaStopped,
    );
    this.workerManager.on(
      WORKER_EVENT.REPLICA_FAILED, this._onReplicaFailed,
    );
  }

  /**
   * Remove all registered event listeners from workerManager.
   * Safely checks for null before removing each listener.
   */
  removeEventListeners() {
    if (this._onReplicaCreated) {
      this.workerManager.removeListener(
        WORKER_EVENT.REPLICA_CREATED, this._onReplicaCreated,
      );
    }
    if (this._onReplicaStopped) {
      this.workerManager.removeListener(
        WORKER_EVENT.REPLICA_STOPPED, this._onReplicaStopped,
      );
    }
    if (this._onReplicaFailed) {
      this.workerManager.removeListener(
        WORKER_EVENT.REPLICA_FAILED, this._onReplicaFailed,
      );
    }
    this._onReplicaCreated = null;
    this._onReplicaStopped = null;
    this._onReplicaFailed = null;
  }

  /**
   * Shut down the proxy.
   * Removes all event listeners, clears replica state, and marks
   * the proxy as uninitialized.
   */
  shutdown() {
    this.removeEventListeners();
    this.selectedReplicaId = null;
    this.localReplicaIds.clear();
    this.initialized = false;
  }

  /**
   * Handle REPLICA_CREATED event from workerManager.
   * Filters by MESSAGE_GROUP entityType, adds to local set,
   * and selects if no replica is currently selected.
   * @param {Object} event - Replica created event payload.
   */
  handleReplicaCreated(event) {
    if (event.entityType !== WORKER_ENTITY_TYPE.MESSAGE_GROUP) return;
    this.localReplicaIds.add(event.replicaId);
    if (!this.selectedReplicaId) {
      this.selectLocalReplica();
    }
  }

  /**
   * Handle REPLICA_STOPPED event from workerManager.
   * Filters by MESSAGE_GROUP entityType, removes from local set,
   * and re-selects if the stopped replica was the selected one.
   * @param {Object} event - Replica stopped event payload.
   */
  handleReplicaStopped(event) {
    if (event.entityType !== WORKER_ENTITY_TYPE.MESSAGE_GROUP) return;
    this.localReplicaIds.delete(event.replicaId);
    if (this.selectedReplicaId === event.replicaId) {
      this.selectedReplicaId = null;
      this.selectLocalReplica();
    }
  }

  /**
   * Handle REPLICA_FAILED event from workerManager.
   * Filters by MESSAGE_GROUP entityType, removes from local set,
   * and re-selects if the failed replica was the selected one.
   * @param {Object} event - Replica failed event payload.
   */
  handleReplicaFailed(event) {
    if (event.entityType !== WORKER_ENTITY_TYPE.MESSAGE_GROUP) return;
    this.localReplicaIds.delete(event.replicaId);
    if (this.selectedReplicaId === event.replicaId) {
      this.selectedReplicaId = null;
      this.selectLocalReplica();
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
    if (!tableName) {
      throw new Error(PROXY_ERROR_MSG.INVALID_TABLE_NAME);
    }
    if (key === undefined || key === null) {
      throw new Error(PROXY_ERROR_MSG.INVALID_KEY);
    }

    const response = await this.sendCacheQuery({
      type: CACHE_MESSAGE_TYPE.CACHE_GET,
      tableName,
      key,
    });

    return response?.data;
  }

  /**
   * Query system table with SQL.
   * Forwards query to local message group replica.
   * @param {string} sql - SQL query.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Promise<Array<Object>>} Query results.
   */
  async query(sql, params = []) {
    if (!sql) {
      throw new Error(PROXY_ERROR_MSG.INVALID_SQL);
    }

    const response = await this.sendCacheQuery({
      type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
      sql,
      params,
    });

    return response?.rows || [];
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
    if (!tableName) {
      throw new Error(PROXY_ERROR_MSG.INVALID_TABLE_NAME);
    }
    if (typeof predicate !== 'function') {
      throw new Error(PROXY_ERROR_MSG.INVALID_PREDICATE);
    }

    // Serialize predicate to string for IPC transmission
    const predicateString = predicate.toString();

    const response = await this.sendCacheQuery({
      type: CACHE_MESSAGE_TYPE.CACHE_FILTER,
      tableName,
      predicateString,
    });

    return response?.records || [];
  }

  /**
   * Get all records from a system table.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name.
   * @return {Promise<Array<Object>>} All records.
   */
  async getAll(tableName) {
    if (!tableName) {
      throw new Error(PROXY_ERROR_MSG.INVALID_TABLE_NAME);
    }

    const response = await this.sendCacheQuery({
      type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL,
      tableName,
    });

    return response?.records || [];
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Filter function.
   * @return {Promise<Object|undefined>} First matching record or undefined.
   */
  async find(tableName, predicate) {
    const results = await this.filter(tableName, predicate);
    return results.length > 0 ? results[0] : undefined;
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @return {Promise<boolean>} True if record exists.
   */
  async has(tableName, key) {
    const record = await this.get(tableName, key);
    return record !== undefined;
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
    this.ensureReplicaSelected();

    const response = await this.workerManager.deliverMessage(
      this.selectedReplicaId,
      message,
    );

    return response;
  }

  /**
   * Ensure a replica is selected, throwing if none available.
   * With event-driven wiring, if no replica is selected, none exist.
   * @private
   */
  ensureReplicaSelected() {
    if (!this.selectedReplicaId) {
      throw new Error(PROXY_ERROR_MSG.NO_LOCAL_REPLICA);
    }
  }

  /**
   * Load the initial set of local message group replica IDs.
   * Called once during initialize() for the initial snapshot.
   * After initialization, events maintain the set incrementally.
   * @private
   */
  loadInitialReplicaSet() {
    const messageGroupWorkers = this.workerManager.getWorkersByType(
      WORKER_ENTITY_TYPE.MESSAGE_GROUP,
    );
    this.localReplicaIds = new Set(
      messageGroupWorkers.map((handle) => handle.replicaId),
    );
  }

  /**
   * Select a local message group replica for queries.
   * Prefers healthy replicas but falls back to any available
   * if all are unhealthy.
   * @private
   */
  selectLocalReplica() {
    this.logger.debug(PROXY_LOG_MSG.SELECTING_REPLICA, {
      availableCount: this.localReplicaIds.size,
    });

    // If current selection is still valid and healthy, keep it
    if (this.selectedReplicaId &&
        this.localReplicaIds.has(this.selectedReplicaId)) {
      const handle = this.workerManager.getWorker(this.selectedReplicaId);
      if (handle &&
          handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY) {
        return;
      }
    }

    const replicaIds = Array.from(this.localReplicaIds);
    if (replicaIds.length === 0) {
      this.selectedReplicaId = null;
      this.logger.warn(PROXY_LOG_MSG.NO_REPLICA_AVAILABLE);
      return;
    }

    // Prefer healthy replicas
    const healthyId = replicaIds.find((id) => {
      const handle = this.workerManager.getWorker(id);
      return handle &&
          handle.healthStatus !== WORKER_HEALTH_STATUS.UNHEALTHY;
    });

    // Fall back to any available if all unhealthy
    this.selectedReplicaId = healthyId || replicaIds[0];
    this.logger.info(PROXY_LOG_MSG.REPLICA_SELECTED, {
      replicaId: this.selectedReplicaId,
    });
  }

  /**
   * Get the currently selected replica ID.
   * @return {string|null} Selected replica ID or null.
   */
  getSelectedReplicaId() {
    return this.selectedReplicaId;
  }

  /**
   * Get the count of local message group replicas.
   * @return {number} Number of local replicas.
   */
  getLocalReplicaCount() {
    return this.localReplicaIds.size;
  }

  /**
   * Check if the proxy is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get proxy statistics.
   * @return {Object} Proxy statistics.
   */
  getStats() {
    return {
      initialized: this.initialized,
      selectedReplicaId: this.selectedReplicaId,
      localReplicaCount: this.localReplicaIds.size,
    };
  }
}

export {
  SystemCacheProxy,
  PROXY_ERROR_MSG,
  PROXY_LOG_MSG,
};
