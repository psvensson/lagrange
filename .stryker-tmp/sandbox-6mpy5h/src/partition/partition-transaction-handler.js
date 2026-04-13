/**
 * Partition Transaction Handler - Manages transaction lifecycle for partitions.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.3, 6.4, 6.6
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
import { NUM } from '../constants/numbers.js';
import { TRANSACTION_STATE, TRANSACTION_ISOLATION_LEVEL } from '../transaction/transaction-constants.js';
import { PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_OPERATION, PARTITION_SERVICE_SQL } from './partition-service-constants.js';

/**
 * Manages transaction lifecycle for partitions.
 * Handles transaction begin, commit, rollback, and state tracking.
 * Uses SQLite's transaction support for READ COMMITTED isolation.
 *
 * Responsibilities:
 * - Transaction begin/commit/rollback operations
 * - Transaction state tracking
 * - Transaction operation recording
 * - Transaction isolation level management
 *
 * @class
 */
class PartitionTransactionHandler {
  /**
   * Create a new transaction handler instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {Database} options.db - SQLite database instance.
   * @param {Object} options.logger - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("107388")) {
      {}
    } else {
      stryCov_9fa48("107388");
      this.partitionId = options.partitionId;
      this.db = options.db;
      this.logger = stryMutAct_9fa48("107391") ? options.logger && console : stryMutAct_9fa48("107390") ? false : stryMutAct_9fa48("107389") ? true : (stryCov_9fa48("107389", "107390", "107391"), options.logger || console);

      // Transaction state
      this.activeTransaction = null;
      this.transactionOperations = stryMutAct_9fa48("107392") ? ["Stryker was here"] : (stryCov_9fa48("107392"), []);

      // Default isolation level
      this.isolationLevel = TRANSACTION_ISOLATION_LEVEL.READ_COMMITTED;
    }
  }

  /**
   * Set the database instance.
   * Used when the database is initialized after handler creation.
   * @param {Database} db - SQLite database instance.
   */
  setDatabase(db) {
    if (stryMutAct_9fa48("107393")) {
      {}
    } else {
      stryCov_9fa48("107393");
      this.db = db;
    }
  }

  /**
   * Begin a transaction on this partition.
   * Uses SQLite's transaction support for READ COMMITTED isolation.
   * @return {Object} Transaction result.
   * @throws {Error} If partition not initialized or transaction already active.
   */
  begin() {
    if (stryMutAct_9fa48("107394")) {
      {}
    } else {
      stryCov_9fa48("107394");
      if (stryMutAct_9fa48("107397") ? false : stryMutAct_9fa48("107396") ? true : stryMutAct_9fa48("107395") ? this.db : (stryCov_9fa48("107395", "107396", "107397"), !this.db)) {
        if (stryMutAct_9fa48("107398")) {
          {}
        } else {
          stryCov_9fa48("107398");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("107400") ? false : stryMutAct_9fa48("107399") ? true : (stryCov_9fa48("107399", "107400"), this.activeTransaction)) {
        if (stryMutAct_9fa48("107401")) {
          {}
        } else {
          stryCov_9fa48("107401");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.BEGINNING_TRANSACTION, stryMutAct_9fa48("107402") ? {} : (stryCov_9fa48("107402"), {
        partitionId: this.partitionId
      }));

      // Use SQLite's BEGIN IMMEDIATE for transaction support
      this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE);
      this.activeTransaction = stryMutAct_9fa48("107403") ? {} : (stryCov_9fa48("107403"), {
        state: TRANSACTION_STATE.ACTIVE,
        startTime: Date.now(),
        operations: stryMutAct_9fa48("107404") ? ["Stryker was here"] : (stryCov_9fa48("107404"), [])
      });
      this.transactionOperations = stryMutAct_9fa48("107405") ? ["Stryker was here"] : (stryCov_9fa48("107405"), []);
      return stryMutAct_9fa48("107406") ? {} : (stryCov_9fa48("107406"), {
        success: stryMutAct_9fa48("107407") ? false : (stryCov_9fa48("107407"), true),
        operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        partitionId: this.partitionId,
        inTransaction: stryMutAct_9fa48("107408") ? false : (stryCov_9fa48("107408"), true)
      });
    }
  }

  /**
   * Commit the active transaction.
   * @return {Object} Commit result with duration and operation count.
   * @throws {Error} If partition not initialized or no active transaction.
   */
  commit() {
    if (stryMutAct_9fa48("107409")) {
      {}
    } else {
      stryCov_9fa48("107409");
      if (stryMutAct_9fa48("107412") ? false : stryMutAct_9fa48("107411") ? true : stryMutAct_9fa48("107410") ? this.db : (stryCov_9fa48("107410", "107411", "107412"), !this.db)) {
        if (stryMutAct_9fa48("107413")) {
          {}
        } else {
          stryCov_9fa48("107413");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("107416") ? false : stryMutAct_9fa48("107415") ? true : stryMutAct_9fa48("107414") ? this.activeTransaction : (stryCov_9fa48("107414", "107415", "107416"), !this.activeTransaction)) {
        if (stryMutAct_9fa48("107417")) {
          {}
        } else {
          stryCov_9fa48("107417");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.COMMITTING_TRANSACTION, stryMutAct_9fa48("107418") ? {} : (stryCov_9fa48("107418"), {
        partitionId: this.partitionId,
        operationCount: this.transactionOperations.length
      }));

      // Commit in SQLite
      this.db.exec(PARTITION_SERVICE_SQL.COMMIT);
      const duration = stryMutAct_9fa48("107419") ? Date.now() + this.activeTransaction.startTime : (stryCov_9fa48("107419"), Date.now() - this.activeTransaction.startTime);
      const operationCount = this.transactionOperations.length;
      const operations = stryMutAct_9fa48("107420") ? [] : (stryCov_9fa48("107420"), [...this.transactionOperations]);

      // Update transaction state before clearing
      this.activeTransaction.state = TRANSACTION_STATE.COMMITTED;

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = stryMutAct_9fa48("107421") ? ["Stryker was here"] : (stryCov_9fa48("107421"), []);
      return stryMutAct_9fa48("107422") ? {} : (stryCov_9fa48("107422"), {
        success: stryMutAct_9fa48("107423") ? false : (stryCov_9fa48("107423"), true),
        operation: PARTITION_SERVICE_OPERATION.COMMIT,
        partitionId: this.partitionId,
        committed: stryMutAct_9fa48("107424") ? false : (stryCov_9fa48("107424"), true),
        durationMs: duration,
        operationCount,
        operations
      });
    }
  }

  /**
   * Rollback the active transaction.
   * @return {Object} Rollback result with duration and operation count.
   * @throws {Error} If partition not initialized or no active transaction.
   */
  rollback() {
    if (stryMutAct_9fa48("107425")) {
      {}
    } else {
      stryCov_9fa48("107425");
      if (stryMutAct_9fa48("107428") ? false : stryMutAct_9fa48("107427") ? true : stryMutAct_9fa48("107426") ? this.db : (stryCov_9fa48("107426", "107427", "107428"), !this.db)) {
        if (stryMutAct_9fa48("107429")) {
          {}
        } else {
          stryCov_9fa48("107429");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("107432") ? false : stryMutAct_9fa48("107431") ? true : stryMutAct_9fa48("107430") ? this.activeTransaction : (stryCov_9fa48("107430", "107431", "107432"), !this.activeTransaction)) {
        if (stryMutAct_9fa48("107433")) {
          {}
        } else {
          stryCov_9fa48("107433");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_ROLLBACK);
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.ROLLING_BACK_TRANSACTION, stryMutAct_9fa48("107434") ? {} : (stryCov_9fa48("107434"), {
        partitionId: this.partitionId,
        operationCount: this.transactionOperations.length
      }));

      // Rollback in SQLite - this reverts all changes
      this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
      const duration = stryMutAct_9fa48("107435") ? Date.now() + this.activeTransaction.startTime : (stryCov_9fa48("107435"), Date.now() - this.activeTransaction.startTime);
      const operationCount = this.transactionOperations.length;

      // Update transaction state before clearing
      this.activeTransaction.state = TRANSACTION_STATE.ROLLED_BACK;

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = stryMutAct_9fa48("107436") ? ["Stryker was here"] : (stryCov_9fa48("107436"), []);
      return stryMutAct_9fa48("107437") ? {} : (stryCov_9fa48("107437"), {
        success: stryMutAct_9fa48("107438") ? false : (stryCov_9fa48("107438"), true),
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: stryMutAct_9fa48("107439") ? false : (stryCov_9fa48("107439"), true),
        durationMs: duration,
        operationCount
      });
    }
  }

  /**
   * Force rollback without throwing on missing transaction.
   * Used for cleanup during error handling.
   * @return {boolean} True if rollback was performed, false if no transaction.
   */
  forceRollback() {
    if (stryMutAct_9fa48("107440")) {
      {}
    } else {
      stryCov_9fa48("107440");
      if (stryMutAct_9fa48("107443") ? !this.db && !this.activeTransaction : stryMutAct_9fa48("107442") ? false : stryMutAct_9fa48("107441") ? true : (stryCov_9fa48("107441", "107442", "107443"), (stryMutAct_9fa48("107444") ? this.db : (stryCov_9fa48("107444"), !this.db)) || (stryMutAct_9fa48("107445") ? this.activeTransaction : (stryCov_9fa48("107445"), !this.activeTransaction)))) {
        if (stryMutAct_9fa48("107446")) {
          {}
        } else {
          stryCov_9fa48("107446");
          return stryMutAct_9fa48("107447") ? true : (stryCov_9fa48("107447"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("107448")) {
          {}
        } else {
          stryCov_9fa48("107448");
          this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
        }
      } catch {
        // Ignore rollback errors during force cleanup
      }
      this.activeTransaction = null;
      this.transactionOperations = stryMutAct_9fa48("107449") ? ["Stryker was here"] : (stryCov_9fa48("107449"), []);
      return stryMutAct_9fa48("107450") ? false : (stryCov_9fa48("107450"), true);
    }
  }

  /**
   * Check if a transaction is active.
   * @return {boolean} True if transaction is active.
   */
  isActive() {
    if (stryMutAct_9fa48("107451")) {
      {}
    } else {
      stryCov_9fa48("107451");
      return stryMutAct_9fa48("107454") ? this.activeTransaction === null : stryMutAct_9fa48("107453") ? false : stryMutAct_9fa48("107452") ? true : (stryCov_9fa48("107452", "107453", "107454"), this.activeTransaction !== null);
    }
  }

  /**
   * Get the current transaction state.
   * @return {string|null} Transaction state or null if no transaction.
   */
  getState() {
    if (stryMutAct_9fa48("107455")) {
      {}
    } else {
      stryCov_9fa48("107455");
      return this.activeTransaction ? this.activeTransaction.state : null;
    }
  }

  /**
   * Get the transaction start time.
   * @return {number|null} Start time in milliseconds or null if no transaction.
   */
  getStartTime() {
    if (stryMutAct_9fa48("107456")) {
      {}
    } else {
      stryCov_9fa48("107456");
      return this.activeTransaction ? this.activeTransaction.startTime : null;
    }
  }

  /**
   * Get the number of operations in the current transaction.
   * @return {number} Operation count.
   */
  getOperationCount() {
    if (stryMutAct_9fa48("107457")) {
      {}
    } else {
      stryCov_9fa48("107457");
      return this.transactionOperations.length;
    }
  }

  /**
   * Get the operations in the current transaction.
   * @return {Array} Copy of transaction operations.
   */
  getOperations() {
    if (stryMutAct_9fa48("107458")) {
      {}
    } else {
      stryCov_9fa48("107458");
      return stryMutAct_9fa48("107459") ? [] : (stryCov_9fa48("107459"), [...this.transactionOperations]);
    }
  }

  /**
   * Record an operation in the current transaction.
   * @param {Object} operation - Operation to record.
   * @throws {Error} If no active transaction.
   */
  recordOperation(operation) {
    if (stryMutAct_9fa48("107460")) {
      {}
    } else {
      stryCov_9fa48("107460");
      if (stryMutAct_9fa48("107463") ? false : stryMutAct_9fa48("107462") ? true : stryMutAct_9fa48("107461") ? this.activeTransaction : (stryCov_9fa48("107461", "107462", "107463"), !this.activeTransaction)) {
        if (stryMutAct_9fa48("107464")) {
          {}
        } else {
          stryCov_9fa48("107464");
          throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION);
        }
      }
      this.transactionOperations.push(operation);
      this.activeTransaction.operations.push(operation);
    }
  }

  /**
   * Get the current isolation level.
   * @return {string} Isolation level.
   */
  getIsolationLevel() {
    if (stryMutAct_9fa48("107465")) {
      {}
    } else {
      stryCov_9fa48("107465");
      return this.isolationLevel;
    }
  }

  /**
   * Get transaction duration in milliseconds.
   * @return {number} Duration or 0 if no active transaction.
   */
  getDuration() {
    if (stryMutAct_9fa48("107466")) {
      {}
    } else {
      stryCov_9fa48("107466");
      if (stryMutAct_9fa48("107469") ? false : stryMutAct_9fa48("107468") ? true : stryMutAct_9fa48("107467") ? this.activeTransaction : (stryCov_9fa48("107467", "107468", "107469"), !this.activeTransaction)) {
        if (stryMutAct_9fa48("107470")) {
          {}
        } else {
          stryCov_9fa48("107470");
          return NUM.ZERO;
        }
      }
      return stryMutAct_9fa48("107471") ? Date.now() + this.activeTransaction.startTime : (stryCov_9fa48("107471"), Date.now() - this.activeTransaction.startTime);
    }
  }
}
export { PartitionTransactionHandler };