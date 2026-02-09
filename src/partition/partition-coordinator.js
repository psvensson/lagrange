/**
 * PartitionCoordinator - Orchestrator that wires RaftGroup, SQLiteStore,
 * and CDCEmitter together for partition replicas.
 *
 * Coordinates lifecycle (initialize, shutdown) and query execution,
 * automatically triggering CDC events for write operations.
 *
 * Requirements: 5.6, 5.7, 5.8, 5.9
 *
 * @module partition/partition-coordinator
 */

import {
  COORDINATOR_COMPONENT,
  COORDINATOR_ERROR_MSG,
  COORDINATOR_LOG_MSG,
  COORDINATOR_READ_PATTERN,
  COORDINATOR_STATE,
} from './partition-coordinator-constants.js';

/**
 * Orchestrator that composes RaftGroup, SQLiteStore, and CDCEmitter
 * into a single partition replica lifecycle.
 *
 * @class
 */
class PartitionCoordinator {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.tableId - Table ID.
   * @param {Object} options.raftGroup - RaftGroup instance.
   * @param {Object} options.sqliteStore - SQLiteStore instance.
   * @param {Object} options.cdcEmitter - CDCEmitter instance.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    this.validateOptions(options);

    this.partitionId = options.partitionId;
    this.tableId = options.tableId;
    this.raftGroup = options.raftGroup;
    this.sqliteStore = options.sqliteStore;
    this.cdcEmitter = options.cdcEmitter;
    this.logger = options.logger || console;

    this.state = COORDINATOR_STATE.CREATED;
  }

  /**
   * Validate required constructor options.
   * @param {Object} options - Constructor options.
   * @throws {Error} If required options are missing.
   * @private
   */
  validateOptions(options) {
    if (!options.partitionId) {
      throw new Error(COORDINATOR_ERROR_MSG.MISSING_PARTITION_ID);
    }
    if (!options.tableId) {
      throw new Error(COORDINATOR_ERROR_MSG.MISSING_TABLE_ID);
    }
    if (!options.raftGroup) {
      throw new Error(COORDINATOR_ERROR_MSG.MISSING_RAFT_GROUP);
    }
    if (!options.sqliteStore) {
      throw new Error(COORDINATOR_ERROR_MSG.MISSING_SQLITE_STORE);
    }
    if (!options.cdcEmitter) {
      throw new Error(COORDINATOR_ERROR_MSG.MISSING_CDC_EMITTER);
    }
  }

  /**
   * Initialize components in sequence: SQLiteStore → RaftGroup → CDCEmitter.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.state === COORDINATOR_STATE.INITIALIZED) {
      throw new Error(COORDINATOR_ERROR_MSG.ALREADY_INITIALIZED);
    }
    if (this.state === COORDINATOR_STATE.SHUT_DOWN) {
      throw new Error(COORDINATOR_ERROR_MSG.ALREADY_SHUT_DOWN);
    }

    this.state = COORDINATOR_STATE.INITIALIZING;

    this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING, {
      partitionId: this.partitionId,
      tableId: this.tableId,
    });

    this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING_SQLITE_STORE, {
      partitionId: this.partitionId,
    });
    this.sqliteStore.initialize();

    this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING_RAFT_GROUP, {
      partitionId: this.partitionId,
    });
    this.raftGroup.initialize();

    this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING_CDC_EMITTER, {
      partitionId: this.partitionId,
    });

    this.state = COORDINATOR_STATE.INITIALIZED;

    this.logger.info(COORDINATOR_LOG_MSG.INITIALIZED, {
      partitionId: this.partitionId,
    });
  }

  /**
   * Execute a SQL query, generating CDC events for write operations.
   *
   * @param {string} sql - SQL statement.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Promise<Object>} Query result from SQLiteStore.
   */
  async executeQuery(sql, params = []) {
    if (this.state !== COORDINATOR_STATE.INITIALIZED) {
      throw new Error(COORDINATOR_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(COORDINATOR_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
    });

    const result = this.sqliteStore.executeQuery(sql, params);

    if (!this.isReadQuery(sql)) {
      this.logger.debug(COORDINATOR_LOG_MSG.WRITE_DETECTED, {
        partitionId: this.partitionId,
      });
      await this.cdcEmitter.emitFromSQL(sql, params, result);
    }

    return result;
  }

  /**
   * Shutdown components in reverse order:
   * CDCEmitter → RaftGroup → SQLiteStore.
   * Errors during individual component shutdown are logged
   * but do not prevent cleanup of remaining components.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.state === COORDINATOR_STATE.SHUT_DOWN) {
      return;
    }

    this.state = COORDINATOR_STATE.SHUTTING_DOWN;

    this.logger.info(COORDINATOR_LOG_MSG.SHUTDOWN_START, {
      partitionId: this.partitionId,
    });

    this.logger.info(
      COORDINATOR_LOG_MSG.SHUTTING_DOWN_CDC_EMITTER,
      {partitionId: this.partitionId},
    );
    this.shutdownComponent(
      () => this.cdcEmitter.shutdown(),
      COORDINATOR_COMPONENT.CDC_EMITTER,
    );

    this.logger.info(
      COORDINATOR_LOG_MSG.SHUTTING_DOWN_RAFT_GROUP,
      {partitionId: this.partitionId},
    );
    await this.shutdownComponentAsync(
      () => this.raftGroup.shutdown(),
      COORDINATOR_COMPONENT.RAFT_GROUP,
    );

    this.logger.info(
      COORDINATOR_LOG_MSG.SHUTTING_DOWN_SQLITE_STORE,
      {partitionId: this.partitionId},
    );
    this.shutdownComponent(
      () => this.sqliteStore.close(),
      COORDINATOR_COMPONENT.SQLITE_STORE,
    );

    this.state = COORDINATOR_STATE.SHUT_DOWN;

    this.logger.info(COORDINATOR_LOG_MSG.SHUTDOWN_COMPLETE, {
      partitionId: this.partitionId,
    });
  }

  /**
   * Shut down a synchronous component with error logging.
   * @param {Function} shutdownFn - Shutdown function to call.
   * @param {string} componentName - Component name for logging.
   * @private
   */
  shutdownComponent(shutdownFn, componentName) {
    try {
      shutdownFn();
    } catch (error) {
      this.logger.error(
        COORDINATOR_LOG_MSG.SHUTDOWN_COMPONENT_FAILED,
        {
          component: componentName,
          partitionId: this.partitionId,
          error: error.message,
        },
      );
    }
  }

  /**
   * Shut down an async component with error logging.
   * @param {Function} shutdownFn - Async shutdown function to call.
   * @param {string} componentName - Component name for logging.
   * @return {Promise<void>}
   * @private
   */
  async shutdownComponentAsync(shutdownFn, componentName) {
    try {
      await shutdownFn();
    } catch (error) {
      this.logger.error(
        COORDINATOR_LOG_MSG.SHUTDOWN_COMPONENT_FAILED,
        {
          component: componentName,
          partitionId: this.partitionId,
          error: error.message,
        },
      );
    }
  }

  /**
   * Check if a SQL statement is a read (SELECT) query.
   * @param {string} sql - SQL statement.
   * @return {boolean} True if the query is a SELECT.
   * @private
   */
  isReadQuery(sql) {
    const trimmedUpper = sql.trim().toUpperCase();
    return COORDINATOR_READ_PATTERN.test(trimmedUpper);
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role from RaftGroup.
   */
  getRole() {
    return this.raftGroup.getRole();
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.raftGroup.isLeaderReplica();
  }

  /**
   * Start Raft election.
   * Delegates to RaftGroup.startElection().
   */
  startElection() {
    this.raftGroup.startElection();
  }
}

export {PartitionCoordinator};
