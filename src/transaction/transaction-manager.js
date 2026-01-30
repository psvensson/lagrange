/**
 * Transaction Manager - Handles single-partition ACID transactions.
 * Provides BEGIN, COMMIT, ROLLBACK support with READ COMMITTED isolation.
 * Requirements: 21.1, 21.2, 21.4, 21.5, 21.6, 21.7
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {NUM} from '../constants/index.js';
import {
  TRANSACTION_CONFIG_KEY,
  TRANSACTION_DEFAULT,
  TRANSACTION_ERROR_MSG,
  TRANSACTION_EVENT,
  TRANSACTION_ISOLATION_LEVEL,
  TRANSACTION_LOG_MSG,
  TRANSACTION_REASON,
  TRANSACTION_STATE,
  TRANSACTION_SUBSYSTEM,
} from './transaction-constants.js';

/**
 * Transaction state enumeration.
 */
const TransactionState = TRANSACTION_STATE;

/**
 * Transaction isolation levels.
 */
const IsolationLevel = TRANSACTION_ISOLATION_LEVEL;

/**
 * Represents a single transaction.
 */
class Transaction {
  /**
   * Create a new transaction.
   * @param {string} transactionId - Unique transaction ID.
   * @param {string} partitionId - Partition this transaction operates on.
   * @param {Object} options - Transaction options.
   */
  constructor(transactionId, partitionId, options = {}) {
    this.transactionId = transactionId;
    this.partitionId = partitionId;
    this.state = TransactionState.ACTIVE;
    this.isolationLevel = options.isolationLevel || IsolationLevel.READ_COMMITTED;
    this.startTime = Date.now();
    this.operations = [];
    this.affectedTables = new Set();
    this.raftLogIndex = null;
  }

  /**
   * Check if transaction is active.
   * @return {boolean} True if active.
   */
  isActive() {
    return this.state === TransactionState.ACTIVE;
  }

  /**
   * Add an operation to the transaction.
   * @param {Object} operation - Operation details.
   */
  addOperation(operation) {
    this.operations.push({
      ...operation,
      timestamp: Date.now(),
    });
    if (operation.tableName) {
      this.affectedTables.add(operation.tableName);
    }
  }

  /**
   * Get transaction duration in milliseconds.
   * @return {number} Duration in ms.
   */
  getDuration() {
    return Date.now() - this.startTime;
  }
}

/**
 * TransactionManager handles single-partition ACID transactions.
 * Uses SQLite's transaction support for isolation and durability.
 */
class TransactionManager extends EventEmitter {
  /**
   * Create a new TransactionManager.
   * @param {Object} options - Configuration options.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || TRANSACTION_SUBSYSTEM;

    // Active transactions by ID
    this.transactions = new Map();

    // Transactions by partition (for conflict detection)
    this.partitionTransactions = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.transactionTimeoutMs = config.get(TRANSACTION_CONFIG_KEY.TIMEOUT_MS) ||
      TRANSACTION_DEFAULT.TIMEOUT_MS;
    this.maxConcurrentTransactions = config.get(TRANSACTION_CONFIG_KEY.MAX_CONCURRENT) ||
      TRANSACTION_DEFAULT.MAX_CONCURRENT;

    // Logging
    this.logger = this.initLogger();

    // Cleanup interval
    this.cleanupInterval = null;
    this.startCleanupInterval();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(TRANSACTION_SUBSYSTEM);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Begin a new transaction on a partition.
   * @param {string} partitionId - Target partition ID.
   * @param {Object} options - Transaction options.
   * @return {Transaction} New transaction.
   */
  beginTransaction(partitionId, options = {}) {
    if (this.transactions.size >= this.maxConcurrentTransactions) {
      throw new Error(TRANSACTION_ERROR_MSG.MAX_CONCURRENT_EXCEEDED);
    }

    const transactionId = uuidv4();
    const transaction = new Transaction(transactionId, partitionId, options);

    this.transactions.set(transactionId, transaction);

    // Track by partition
    if (!this.partitionTransactions.has(partitionId)) {
      this.partitionTransactions.set(partitionId, new Set());
    }
    this.partitionTransactions.get(partitionId).add(transactionId);

    this.logger.debug(TRANSACTION_LOG_MSG.STARTED, {
      transactionId,
      partitionId,
      isolationLevel: transaction.isolationLevel,
    });

    this.emit(TRANSACTION_EVENT.STARTED, {
      transactionId,
      partitionId,
    });

    return transaction;
  }

  /**
   * Get a transaction by ID.
   * @param {string} transactionId - Transaction ID.
   * @return {Transaction|null} Transaction or null.
   */
  getTransaction(transactionId) {
    return this.transactions.get(transactionId) || null;
  }

  /**
   * Commit a transaction.
   * @param {string} transactionId - Transaction ID.
   * @param {Object} raftInfo - Raft replication info for durability.
   * @return {Object} Commit result.
   */
  async commitTransaction(transactionId, raftInfo = {}) {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      throw new Error(TRANSACTION_ERROR_MSG.NOT_FOUND_WITH_ID(transactionId));
    }

    if (!transaction.isActive()) {
      throw new Error(TRANSACTION_ERROR_MSG.NOT_ACTIVE(transaction.state));
    }

    // Store Raft log index for durability tracking
    transaction.raftLogIndex = raftInfo.logIndex || null;
    transaction.state = TransactionState.COMMITTED;

    const duration = transaction.getDuration();

    this.logger.debug(TRANSACTION_LOG_MSG.COMMITTED, {
      transactionId,
      partitionId: transaction.partitionId,
      operationCount: transaction.operations.length,
      durationMs: duration,
      raftLogIndex: transaction.raftLogIndex,
    });

    this.emit(TRANSACTION_EVENT.COMMITTED, {
      transactionId,
      partitionId: transaction.partitionId,
      raftLogIndex: transaction.raftLogIndex,
    });

    // Clean up
    this.cleanupTransaction(transactionId);

    return {
      success: true,
      transactionId,
      committed: true,
      durationMs: duration,
      raftLogIndex: transaction.raftLogIndex,
    };
  }

  /**
   * Rollback a transaction.
   * @param {string} transactionId - Transaction ID.
   * @return {Object} Rollback result.
   */
  async rollbackTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (!transaction.isActive()) {
      throw new Error(`Transaction is not active: ${transaction.state}`);
    }

    transaction.state = TransactionState.ROLLED_BACK;

    const duration = transaction.getDuration();

    this.logger.debug(TRANSACTION_LOG_MSG.ROLLED_BACK, {
      transactionId,
      partitionId: transaction.partitionId,
      operationCount: transaction.operations.length,
      durationMs: duration,
    });

    this.emit(TRANSACTION_EVENT.ROLLED_BACK, {
      transactionId,
      partitionId: transaction.partitionId,
    });

    // Clean up
    this.cleanupTransaction(transactionId);

    return {
      success: true,
      transactionId,
      rolledBack: true,
      durationMs: duration,
    };
  }

  /**
   * Abort a transaction (due to error or timeout).
   * @param {string} transactionId - Transaction ID.
   * @param {string} reason - Abort reason.
   * @return {Object} Abort result.
   */
  async abortTransaction(transactionId, reason = TRANSACTION_REASON.UNKNOWN) {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      return {success: false, error: TRANSACTION_ERROR_MSG.NOT_FOUND};
    }

    transaction.state = TransactionState.ABORTED;

    this.logger.warn(TRANSACTION_LOG_MSG.ABORTED, {
      transactionId,
      partitionId: transaction.partitionId,
      reason,
    });

    this.emit(TRANSACTION_EVENT.ABORTED, {
      transactionId,
      partitionId: transaction.partitionId,
      reason,
    });

    // Clean up
    this.cleanupTransaction(transactionId);

    return {
      success: true,
      transactionId,
      aborted: true,
      reason,
    };
  }

  /**
   * Record an operation within a transaction.
   * @param {string} transactionId - Transaction ID.
   * @param {Object} operation - Operation details.
   */
  recordOperation(transactionId, operation) {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      throw new Error(TRANSACTION_ERROR_MSG.NOT_FOUND_WITH_ID(transactionId));
    }

    if (!transaction.isActive()) {
      throw new Error(TRANSACTION_ERROR_MSG.RECORD_OPERATION_INACTIVE(transaction.state));
    }

    transaction.addOperation(operation);
  }

  /**
   * Check if a partition has active transactions.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True if has active transactions.
   */
  hasActiveTransactions(partitionId) {
    const txIds = this.partitionTransactions.get(partitionId);
    if (!txIds) return false;

    for (const txId of txIds) {
      const tx = this.transactions.get(txId);
      if (tx && tx.isActive()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get active transaction count for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {number} Active transaction count.
   */
  getActiveTransactionCount(partitionId) {
    const txIds = this.partitionTransactions.get(partitionId);
    if (!txIds) return NUM.ZERO;

    let count = NUM.ZERO;
    for (const txId of txIds) {
      const tx = this.transactions.get(txId);
      if (tx && tx.isActive()) {
        count += NUM.ONE;
      }
    }
    return count;
  }

  /**
   * Clean up a transaction.
   * @param {string} transactionId - Transaction ID.
   * @private
   */
  cleanupTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return;

    // Remove from partition tracking
    const partitionTxs = this.partitionTransactions.get(transaction.partitionId);
    if (partitionTxs) {
      partitionTxs.delete(transactionId);
      if (partitionTxs.size === NUM.ZERO) {
        this.partitionTransactions.delete(transaction.partitionId);
      }
    }

    // Remove from main map
    this.transactions.delete(transactionId);
  }

  /**
   * Start cleanup interval for timed-out transactions.
   * @private
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupTimedOutTransactions();
    }, TRANSACTION_DEFAULT.CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up timed-out transactions.
   * @private
   */
  cleanupTimedOutTransactions() {
    const now = Date.now();

    for (const [txId, tx] of this.transactions) {
      if (tx.isActive() && (now - tx.startTime) > this.transactionTimeoutMs) {
        this.abortTransaction(txId, TRANSACTION_REASON.TIMEOUT);
      }
    }
  }

  /**
   * Get transaction manager statistics.
   * @return {Object} Statistics.
   */
  getStats() {
    let activeCount = NUM.ZERO;
    for (const tx of this.transactions.values()) {
      if (tx.isActive()) {
        activeCount += NUM.ONE;
      }
    }

    return {
      totalTransactions: this.transactions.size,
      activeTransactions: activeCount,
      partitionsWithTransactions: this.partitionTransactions.size,
    };
  }

  /**
   * Shutdown the transaction manager.
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Abort all active transactions
    for (const [txId, tx] of this.transactions) {
      if (tx.isActive()) {
        this.abortTransaction(txId, TRANSACTION_REASON.SHUTDOWN);
      }
    }

    this.transactions.clear();
    this.partitionTransactions.clear();
  }
}

export {
  TransactionManager,
  Transaction,
  TransactionState,
  IsolationLevel,
};
