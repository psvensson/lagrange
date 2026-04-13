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
import { COORDINATOR_COMPONENT, COORDINATOR_ERROR_MSG, COORDINATOR_LOG_MSG, COORDINATOR_READ_PATTERN, COORDINATOR_STATE } from './partition-coordinator-constants.js';

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
    if (stryMutAct_9fa48("100755")) {
      {}
    } else {
      stryCov_9fa48("100755");
      this.validateOptions(options);
      this.partitionId = options.partitionId;
      this.tableId = options.tableId;
      this.raftGroup = options.raftGroup;
      this.sqliteStore = options.sqliteStore;
      this.cdcEmitter = options.cdcEmitter;
      this.logger = stryMutAct_9fa48("100758") ? options.logger && console : stryMutAct_9fa48("100757") ? false : stryMutAct_9fa48("100756") ? true : (stryCov_9fa48("100756", "100757", "100758"), options.logger || console);
      this.state = COORDINATOR_STATE.CREATED;
    }
  }

  /**
   * Validate required constructor options.
   * @param {Object} options - Constructor options.
   * @throws {Error} If required options are missing.
   * @private
   */
  validateOptions(options) {
    if (stryMutAct_9fa48("100759")) {
      {}
    } else {
      stryCov_9fa48("100759");
      if (stryMutAct_9fa48("100762") ? false : stryMutAct_9fa48("100761") ? true : stryMutAct_9fa48("100760") ? options.partitionId : (stryCov_9fa48("100760", "100761", "100762"), !options.partitionId)) {
        if (stryMutAct_9fa48("100763")) {
          {}
        } else {
          stryCov_9fa48("100763");
          throw new Error(COORDINATOR_ERROR_MSG.MISSING_PARTITION_ID);
        }
      }
      if (stryMutAct_9fa48("100766") ? false : stryMutAct_9fa48("100765") ? true : stryMutAct_9fa48("100764") ? options.tableId : (stryCov_9fa48("100764", "100765", "100766"), !options.tableId)) {
        if (stryMutAct_9fa48("100767")) {
          {}
        } else {
          stryCov_9fa48("100767");
          throw new Error(COORDINATOR_ERROR_MSG.MISSING_TABLE_ID);
        }
      }
      if (stryMutAct_9fa48("100770") ? false : stryMutAct_9fa48("100769") ? true : stryMutAct_9fa48("100768") ? options.raftGroup : (stryCov_9fa48("100768", "100769", "100770"), !options.raftGroup)) {
        if (stryMutAct_9fa48("100771")) {
          {}
        } else {
          stryCov_9fa48("100771");
          throw new Error(COORDINATOR_ERROR_MSG.MISSING_RAFT_GROUP);
        }
      }
      if (stryMutAct_9fa48("100774") ? false : stryMutAct_9fa48("100773") ? true : stryMutAct_9fa48("100772") ? options.sqliteStore : (stryCov_9fa48("100772", "100773", "100774"), !options.sqliteStore)) {
        if (stryMutAct_9fa48("100775")) {
          {}
        } else {
          stryCov_9fa48("100775");
          throw new Error(COORDINATOR_ERROR_MSG.MISSING_SQLITE_STORE);
        }
      }
      if (stryMutAct_9fa48("100778") ? false : stryMutAct_9fa48("100777") ? true : stryMutAct_9fa48("100776") ? options.cdcEmitter : (stryCov_9fa48("100776", "100777", "100778"), !options.cdcEmitter)) {
        if (stryMutAct_9fa48("100779")) {
          {}
        } else {
          stryCov_9fa48("100779");
          throw new Error(COORDINATOR_ERROR_MSG.MISSING_CDC_EMITTER);
        }
      }
    }
  }

  /**
   * Initialize components in sequence: SQLiteStore → RaftGroup → CDCEmitter.
   * @return {Promise<void>}
   */
  async initialize() {
    if (stryMutAct_9fa48("100780")) {
      {}
    } else {
      stryCov_9fa48("100780");
      if (stryMutAct_9fa48("100783") ? this.state !== COORDINATOR_STATE.INITIALIZED : stryMutAct_9fa48("100782") ? false : stryMutAct_9fa48("100781") ? true : (stryCov_9fa48("100781", "100782", "100783"), this.state === COORDINATOR_STATE.INITIALIZED)) {
        if (stryMutAct_9fa48("100784")) {
          {}
        } else {
          stryCov_9fa48("100784");
          throw new Error(COORDINATOR_ERROR_MSG.ALREADY_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("100787") ? this.state !== COORDINATOR_STATE.SHUT_DOWN : stryMutAct_9fa48("100786") ? false : stryMutAct_9fa48("100785") ? true : (stryCov_9fa48("100785", "100786", "100787"), this.state === COORDINATOR_STATE.SHUT_DOWN)) {
        if (stryMutAct_9fa48("100788")) {
          {}
        } else {
          stryCov_9fa48("100788");
          throw new Error(COORDINATOR_ERROR_MSG.ALREADY_SHUT_DOWN);
        }
      }
      this.state = COORDINATOR_STATE.INITIALIZING;
      this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING, stryMutAct_9fa48("100789") ? {} : (stryCov_9fa48("100789"), {
        partitionId: this.partitionId,
        tableId: this.tableId
      }));
      this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING_SQLITE_STORE, stryMutAct_9fa48("100790") ? {} : (stryCov_9fa48("100790"), {
        partitionId: this.partitionId
      }));
      this.sqliteStore.initialize();
      this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING_RAFT_GROUP, stryMutAct_9fa48("100791") ? {} : (stryCov_9fa48("100791"), {
        partitionId: this.partitionId
      }));
      this.raftGroup.initialize();
      this.logger.info(COORDINATOR_LOG_MSG.INITIALIZING_CDC_EMITTER, stryMutAct_9fa48("100792") ? {} : (stryCov_9fa48("100792"), {
        partitionId: this.partitionId
      }));
      this.state = COORDINATOR_STATE.INITIALIZED;
      this.logger.info(COORDINATOR_LOG_MSG.INITIALIZED, stryMutAct_9fa48("100793") ? {} : (stryCov_9fa48("100793"), {
        partitionId: this.partitionId
      }));
    }
  }

  /**
   * Execute a SQL query, generating CDC events for write operations.
   *
   * @param {string} sql - SQL statement.
   * @param {Array} [params=[]] - Query parameters.
   * @return {Promise<Object>} Query result from SQLiteStore.
   */
  async executeQuery(sql, params = stryMutAct_9fa48("100794") ? ["Stryker was here"] : (stryCov_9fa48("100794"), [])) {
    if (stryMutAct_9fa48("100795")) {
      {}
    } else {
      stryCov_9fa48("100795");
      if (stryMutAct_9fa48("100798") ? this.state === COORDINATOR_STATE.INITIALIZED : stryMutAct_9fa48("100797") ? false : stryMutAct_9fa48("100796") ? true : (stryCov_9fa48("100796", "100797", "100798"), this.state !== COORDINATOR_STATE.INITIALIZED)) {
        if (stryMutAct_9fa48("100799")) {
          {}
        } else {
          stryCov_9fa48("100799");
          throw new Error(COORDINATOR_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      this.logger.debug(COORDINATOR_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("100800") ? {} : (stryCov_9fa48("100800"), {
        partitionId: this.partitionId
      }));
      const result = this.sqliteStore.executeQuery(sql, params);
      if (stryMutAct_9fa48("100803") ? false : stryMutAct_9fa48("100802") ? true : stryMutAct_9fa48("100801") ? this.isReadQuery(sql) : (stryCov_9fa48("100801", "100802", "100803"), !this.isReadQuery(sql))) {
        if (stryMutAct_9fa48("100804")) {
          {}
        } else {
          stryCov_9fa48("100804");
          this.logger.debug(COORDINATOR_LOG_MSG.WRITE_DETECTED, stryMutAct_9fa48("100805") ? {} : (stryCov_9fa48("100805"), {
            partitionId: this.partitionId
          }));
          await this.cdcEmitter.emitFromSQL(sql, params, result);
        }
      }
      return result;
    }
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
    if (stryMutAct_9fa48("100806")) {
      {}
    } else {
      stryCov_9fa48("100806");
      if (stryMutAct_9fa48("100809") ? this.state !== COORDINATOR_STATE.SHUT_DOWN : stryMutAct_9fa48("100808") ? false : stryMutAct_9fa48("100807") ? true : (stryCov_9fa48("100807", "100808", "100809"), this.state === COORDINATOR_STATE.SHUT_DOWN)) {
        if (stryMutAct_9fa48("100810")) {
          {}
        } else {
          stryCov_9fa48("100810");
          return;
        }
      }
      this.state = COORDINATOR_STATE.SHUTTING_DOWN;
      this.logger.info(COORDINATOR_LOG_MSG.SHUTDOWN_START, stryMutAct_9fa48("100811") ? {} : (stryCov_9fa48("100811"), {
        partitionId: this.partitionId
      }));
      this.logger.info(COORDINATOR_LOG_MSG.SHUTTING_DOWN_CDC_EMITTER, stryMutAct_9fa48("100812") ? {} : (stryCov_9fa48("100812"), {
        partitionId: this.partitionId
      }));
      this.shutdownComponent(stryMutAct_9fa48("100813") ? () => undefined : (stryCov_9fa48("100813"), () => this.cdcEmitter.shutdown()), COORDINATOR_COMPONENT.CDC_EMITTER);
      this.logger.info(COORDINATOR_LOG_MSG.SHUTTING_DOWN_RAFT_GROUP, stryMutAct_9fa48("100814") ? {} : (stryCov_9fa48("100814"), {
        partitionId: this.partitionId
      }));
      await this.shutdownComponentAsync(stryMutAct_9fa48("100815") ? () => undefined : (stryCov_9fa48("100815"), () => this.raftGroup.shutdown()), COORDINATOR_COMPONENT.RAFT_GROUP);
      this.logger.info(COORDINATOR_LOG_MSG.SHUTTING_DOWN_SQLITE_STORE, stryMutAct_9fa48("100816") ? {} : (stryCov_9fa48("100816"), {
        partitionId: this.partitionId
      }));
      this.shutdownComponent(stryMutAct_9fa48("100817") ? () => undefined : (stryCov_9fa48("100817"), () => this.sqliteStore.close()), COORDINATOR_COMPONENT.SQLITE_STORE);
      this.state = COORDINATOR_STATE.SHUT_DOWN;
      this.logger.info(COORDINATOR_LOG_MSG.SHUTDOWN_COMPLETE, stryMutAct_9fa48("100818") ? {} : (stryCov_9fa48("100818"), {
        partitionId: this.partitionId
      }));
    }
  }

  /**
   * Shut down a synchronous component with error logging.
   * @param {Function} shutdownFn - Shutdown function to call.
   * @param {string} componentName - Component name for logging.
   * @private
   */
  shutdownComponent(shutdownFn, componentName) {
    if (stryMutAct_9fa48("100819")) {
      {}
    } else {
      stryCov_9fa48("100819");
      try {
        if (stryMutAct_9fa48("100820")) {
          {}
        } else {
          stryCov_9fa48("100820");
          shutdownFn();
        }
      } catch (error) {
        if (stryMutAct_9fa48("100821")) {
          {}
        } else {
          stryCov_9fa48("100821");
          this.logger.error(COORDINATOR_LOG_MSG.SHUTDOWN_COMPONENT_FAILED, stryMutAct_9fa48("100822") ? {} : (stryCov_9fa48("100822"), {
            component: componentName,
            partitionId: this.partitionId,
            error: error.message
          }));
        }
      }
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
    if (stryMutAct_9fa48("100823")) {
      {}
    } else {
      stryCov_9fa48("100823");
      try {
        if (stryMutAct_9fa48("100824")) {
          {}
        } else {
          stryCov_9fa48("100824");
          await shutdownFn();
        }
      } catch (error) {
        if (stryMutAct_9fa48("100825")) {
          {}
        } else {
          stryCov_9fa48("100825");
          this.logger.error(COORDINATOR_LOG_MSG.SHUTDOWN_COMPONENT_FAILED, stryMutAct_9fa48("100826") ? {} : (stryCov_9fa48("100826"), {
            component: componentName,
            partitionId: this.partitionId,
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Check if a SQL statement is a read (SELECT) query.
   * @param {string} sql - SQL statement.
   * @return {boolean} True if the query is a SELECT.
   * @private
   */
  isReadQuery(sql) {
    if (stryMutAct_9fa48("100827")) {
      {}
    } else {
      stryCov_9fa48("100827");
      const trimmedUpper = stryMutAct_9fa48("100829") ? sql.toUpperCase() : stryMutAct_9fa48("100828") ? sql.trim().toLowerCase() : (stryCov_9fa48("100828", "100829"), sql.trim().toUpperCase());
      return COORDINATOR_READ_PATTERN.test(trimmedUpper);
    }
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role from RaftGroup.
   */
  getRole() {
    if (stryMutAct_9fa48("100830")) {
      {}
    } else {
      stryCov_9fa48("100830");
      return this.raftGroup.getRole();
    }
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    if (stryMutAct_9fa48("100831")) {
      {}
    } else {
      stryCov_9fa48("100831");
      return this.raftGroup.isLeaderReplica();
    }
  }

  /**
   * Start Raft election.
   * Delegates to RaftGroup.startElection().
   */
  startElection() {
    if (stryMutAct_9fa48("100832")) {
      {}
    } else {
      stryCov_9fa48("100832");
      this.raftGroup.startElection();
    }
  }
}
export { PartitionCoordinator };