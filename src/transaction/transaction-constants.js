const TRANSACTION_SUBSYSTEM = 'transaction-manager';

const TRANSACTION_STATE = Object.freeze({
  ACTIVE: 'active',
  COMMITTED: 'committed',
  ROLLED_BACK: 'rolled_back',
  ABORTED: 'aborted',
});

const TRANSACTION_ISOLATION_LEVEL = Object.freeze({
  READ_COMMITTED: 'READ_COMMITTED',
});

const TRANSACTION_EVENT = Object.freeze({
  STARTED: 'transactionStarted',
  COMMITTED: 'transactionCommitted',
  ROLLED_BACK: 'transactionRolledBack',
  ABORTED: 'transactionAborted',
});

const TRANSACTION_CONFIG_KEY = Object.freeze({
  TIMEOUT_MS: 'transaction.timeoutMs',
  MAX_CONCURRENT: 'transaction.maxConcurrent',
});

const TRANSACTION_DEFAULT = Object.freeze({
  TIMEOUT_MS: 30000,
  MAX_CONCURRENT: 100,
  CLEANUP_INTERVAL_MS: 5000,
});

const TRANSACTION_LOG_MSG = Object.freeze({
  STARTED: 'Transaction started',
  COMMITTED: 'Transaction committed',
  ROLLED_BACK: 'Transaction rolled back',
  ABORTED: 'Transaction aborted',
});

const TRANSACTION_ERROR_MSG = Object.freeze({
  MAX_CONCURRENT_EXCEEDED: 'Maximum concurrent transactions exceeded',
  NOT_FOUND: 'Transaction not found',
  NOT_FOUND_WITH_ID: (transactionId) => `Transaction not found: ${transactionId}`,
  NOT_ACTIVE: (state) => `Transaction is not active: ${state}`,
  RECORD_OPERATION_INACTIVE: (state) =>
    `Cannot record operation: transaction is ${state}`,
});

const TRANSACTION_REASON = Object.freeze({
  UNKNOWN: 'unknown',
  TIMEOUT: 'timeout',
  SHUTDOWN: 'shutdown',
});

export {
  TRANSACTION_CONFIG_KEY,
  TRANSACTION_DEFAULT,
  TRANSACTION_ERROR_MSG,
  TRANSACTION_EVENT,
  TRANSACTION_ISOLATION_LEVEL,
  TRANSACTION_LOG_MSG,
  TRANSACTION_REASON,
  TRANSACTION_STATE,
  TRANSACTION_SUBSYSTEM,
};
