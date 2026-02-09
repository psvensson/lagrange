/**
 * Partition Transaction Handler - Manages transaction lifecycle for partitions.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.3, 6.4, 6.6
 */

import {NUM} from '../constants/numbers.js';
import {
  TRANSACTION_STATE,
  TRANSACTION_ISOLATION_LEVEL,
} from '../transaction/transaction-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL,
} from './partition-service-constants.js';

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
    this.partitionId = options.partitionId;
    this.db = options.db;
    this.logger = options.logger || console;

    // Transaction state
    this.activeTransaction = null;
    this.transactionOperations = [];

    // Default isolation level
    this.isolationLevel = TRANSACTION_ISOLATION_LEVEL.READ_COMMITTED;
  }

  /**
   * Set the database instance.
   * Used when the database is initialized after handler creation.
   * @param {Database} db - SQLite database instance.
   */
  setDatabase(db) {
    this.db = db;
  }

  /**
   * Begin a transaction on this partition.
   * Uses SQLite's transaction support for READ COMMITTED isolation.
   * @return {Object} Transaction result.
   * @throws {Error} If partition not initialized or transaction already active.
   */
  begin() {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.BEGINNING_TRANSACTION, {
      partitionId: this.partitionId,
    });

    // Use SQLite's BEGIN IMMEDIATE for transaction support
    this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE);
    this.activeTransaction = {
      state: TRANSACTION_STATE.ACTIVE,
      startTime: Date.now(),
      operations: [],
    };
    this.transactionOperations = [];

    return {
      success: true,
      operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
      partitionId: this.partitionId,
      inTransaction: true,
    };
  }

  /**
   * Commit the active transaction.
   * @return {Object} Commit result with duration and operation count.
   * @throws {Error} If partition not initialized or no active transaction.
   */
  commit() {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.COMMITTING_TRANSACTION, {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    // Commit in SQLite
    this.db.exec(PARTITION_SERVICE_SQL.COMMIT);

    const duration = Date.now() - this.activeTransaction.startTime;
    const operationCount = this.transactionOperations.length;
    const operations = [...this.transactionOperations];

    // Update transaction state before clearing
    this.activeTransaction.state = TRANSACTION_STATE.COMMITTED;

    // Clear transaction state
    this.activeTransaction = null;
    this.transactionOperations = [];

    return {
      success: true,
      operation: PARTITION_SERVICE_OPERATION.COMMIT,
      partitionId: this.partitionId,
      committed: true,
      durationMs: duration,
      operationCount,
      operations,
    };
  }

  /**
   * Rollback the active transaction.
   * @return {Object} Rollback result with duration and operation count.
   * @throws {Error} If partition not initialized or no active transaction.
   */
  rollback() {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    if (!this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_ROLLBACK);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.ROLLING_BACK_TRANSACTION, {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    // Rollback in SQLite - this reverts all changes
    this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);

    const duration = Date.now() - this.activeTransaction.startTime;
    const operationCount = this.transactionOperations.length;

    // Update transaction state before clearing
    this.activeTransaction.state = TRANSACTION_STATE.ROLLED_BACK;

    // Clear transaction state
    this.activeTransaction = null;
    this.transactionOperations = [];

    return {
      success: true,
      operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
      partitionId: this.partitionId,
      rolledBack: true,
      durationMs: duration,
      operationCount,
    };
  }

  /**
   * Force rollback without throwing on missing transaction.
   * Used for cleanup during error handling.
   * @return {boolean} True if rollback was performed, false if no transaction.
   */
  forceRollback() {
    if (!this.db || !this.activeTransaction) {
      return false;
    }

    try {
      this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
    } catch {
      // Ignore rollback errors during force cleanup
    }

    this.activeTransaction = null;
    this.transactionOperations = [];
    return true;
  }

  /**
   * Check if a transaction is active.
   * @return {boolean} True if transaction is active.
   */
  isActive() {
    return this.activeTransaction !== null;
  }

  /**
   * Get the current transaction state.
   * @return {string|null} Transaction state or null if no transaction.
   */
  getState() {
    return this.activeTransaction ? this.activeTransaction.state : null;
  }

  /**
   * Get the transaction start time.
   * @return {number|null} Start time in milliseconds or null if no transaction.
   */
  getStartTime() {
    return this.activeTransaction ? this.activeTransaction.startTime : null;
  }

  /**
   * Get the number of operations in the current transaction.
   * @return {number} Operation count.
   */
  getOperationCount() {
    return this.transactionOperations.length;
  }

  /**
   * Get the operations in the current transaction.
   * @return {Array} Copy of transaction operations.
   */
  getOperations() {
    return [...this.transactionOperations];
  }

  /**
   * Record an operation in the current transaction.
   * @param {Object} operation - Operation to record.
   * @throws {Error} If no active transaction.
   */
  recordOperation(operation) {
    if (!this.activeTransaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION);
    }

    this.transactionOperations.push(operation);
    this.activeTransaction.operations.push(operation);
  }

  /**
   * Get the current isolation level.
   * @return {string} Isolation level.
   */
  getIsolationLevel() {
    return this.isolationLevel;
  }

  /**
   * Get transaction duration in milliseconds.
   * @return {number} Duration or 0 if no active transaction.
   */
  getDuration() {
    if (!this.activeTransaction) {
      return NUM.ZERO;
    }
    return Date.now() - this.activeTransaction.startTime;
  }
}

export {
  PartitionTransactionHandler,
};
