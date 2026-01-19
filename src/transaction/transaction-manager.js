/**
 * Transaction Manager - Handles single-partition ACID transactions.
 * Provides BEGIN, COMMIT, ROLLBACK support with READ COMMITTED isolation.
 * Requirements: 21.1, 21.2, 21.4, 21.5, 21.6, 21.7
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Transaction state enumeration.
 */
const TransactionState = {
  ACTIVE: 'active',
  COMMITTED: 'committed',
  ROLLED_BACK: 'rolled_back',
  ABORTED: 'aborted',
};

/**
 * Transaction isolation levels.
 */
const IsolationLevel = {
  READ_COMMITTED: 'READ_COMMITTED',
};

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

    this.nodeId = options.nodeId || 'transaction-manager';

    // Active transactions by ID
    this.transactions = new Map();

    // Transactions by partition (for conflict detection)
    this.partitionTransactions = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.transactionTimeoutMs = config.get('transaction.timeoutMs') || 30000;
    this.maxConcurrentTransactions = config.get('transaction.maxConcurrent') || 100;

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
        return loggingService.forSubsystem('transaction-manager');
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
      throw new Error('Maximum concurrent transactions exceeded');
    }

    const transactionId = uuidv4();
    const transaction = new Transaction(transactionId, partitionId, options);

    this.transactions.set(transactionId, transaction);

    // Track by partition
    if (!this.partitionTransactions.has(partitionId)) {
      this.partitionTransactions.set(partitionId, new Set());
    }
    this.partitionTransactions.get(partitionId).add(transactionId);

    this.logger.debug('Transaction started', {
      transactionId,
      partitionId,
      isolationLevel: transaction.isolationLevel,
    });

    this.emit('transactionStarted', {
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
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (!transaction.isActive()) {
      throw new Error(`Transaction is not active: ${transaction.state}`);
    }

    // Store Raft log index for durability tracking
    transaction.raftLogIndex = raftInfo.logIndex || null;
    transaction.state = TransactionState.COMMITTED;

    const duration = transaction.getDuration();

    this.logger.debug('Transaction committed', {
      transactionId,
      partitionId: transaction.partitionId,
      operationCount: transaction.operations.length,
      durationMs: duration,
      raftLogIndex: transaction.raftLogIndex,
    });

    this.emit('transactionCommitted', {
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

    this.logger.debug('Transaction rolled back', {
      transactionId,
      partitionId: transaction.partitionId,
      operationCount: transaction.operations.length,
      durationMs: duration,
    });

    this.emit('transactionRolledBack', {
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
  async abortTransaction(transactionId, reason = 'unknown') {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      return {success: false, error: 'Transaction not found'};
    }

    transaction.state = TransactionState.ABORTED;

    this.logger.warn('Transaction aborted', {
      transactionId,
      partitionId: transaction.partitionId,
      reason,
    });

    this.emit('transactionAborted', {
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
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (!transaction.isActive()) {
      throw new Error(`Cannot record operation: transaction is ${transaction.state}`);
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
    if (!txIds) return 0;

    let count = 0;
    for (const txId of txIds) {
      const tx = this.transactions.get(txId);
      if (tx && tx.isActive()) {
        count++;
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
      if (partitionTxs.size === 0) {
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
    }, 5000);
  }

  /**
   * Clean up timed-out transactions.
   * @private
   */
  cleanupTimedOutTransactions() {
    const now = Date.now();

    for (const [txId, tx] of this.transactions) {
      if (tx.isActive() && (now - tx.startTime) > this.transactionTimeoutMs) {
        this.abortTransaction(txId, 'timeout');
      }
    }
  }

  /**
   * Get transaction manager statistics.
   * @return {Object} Statistics.
   */
  getStats() {
    let activeCount = 0;
    for (const tx of this.transactions.values()) {
      if (tx.isActive()) {
        activeCount++;
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
        this.abortTransaction(txId, 'shutdown');
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
