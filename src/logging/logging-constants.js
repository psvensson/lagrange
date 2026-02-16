import {NUM} from '../constants/index.js';

const LOG_LEVELS = Object.freeze([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

const LOGGING_DEFAULT = Object.freeze({
  NODE_ID: 'unknown',
  LEVEL: 'info',
  MAX_BUFFER_SIZE: NUM.THOUSAND,
  PRETTY_PRINT: false,
  SHOW_METRICS_IN_CONSOLE: false,
});

const LOGGING_PRETTY = Object.freeze({
  TARGET: 'pino-pretty',
  TRANSLATE_TIME: 'SYS:standard',
  COLORIZE: true,
  SINGLE_LINE: true,
});

const LOGGING_LOG_MSG = Object.freeze({
  LOGS_TABLE_READY: 'Logs table ready, flushing buffer',
  LOGS_TABLE_SERVICE_INITIALIZED: 'LogsTableService initialized',
  LOGS_TABLE_SERVICE_SHUTDOWN: 'LogsTableService shutdown',
  connectedLoggingService: (count) =>
    `Connected to LoggingService, flushed ${count} buffered entries`,
});

const LOGGING_ERROR_MSG = Object.freeze({
  LOGGING_SERVICE_REQUIRED: 'LoggingService must be initialized first',
  WRITE_ENTRY_FAILED: 'Failed to write log entry after retries:',
  PERIODIC_FLUSH_FAILED: 'Periodic flush failed:',
  NO_WRITE_MECHANISM: 'No write mechanism available for logs table',
});

const LOG_QUERY_DEFAULT = Object.freeze({
  DEFAULT_LIMIT: NUM.HUNDRED,
  MAX_LIMIT: NUM.THOUSAND * NUM.TEN,
  DEFAULT_TIME_RANGE_MS: 60 * 60 * NUM.THOUSAND,
});

const LOG_LEVEL_ORDER = Object.freeze({
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5,
});

const LOG_QUERY_LOG_MSG = Object.freeze({
  INITIALIZED: 'LogQueryService initialized',
  SHUTDOWN: 'LogQueryService shutdown',
});

const LOG_QUERY_ERROR_MSG = Object.freeze({
  ENGINE_NOT_AVAILABLE: 'SQL query engine not available',
  invalidOrderBy: (orderBy) => `Invalid orderBy column: ${orderBy}`,
  invalidOrderDir: (orderDir) => `Invalid orderDir value: ${orderDir}`,
});

const LOG_QUERY_ERROR_CODE = Object.freeze({
  ENGINE_NOT_AVAILABLE: 'ENGINE_NOT_AVAILABLE',
  QUERY_FAILED: 'QUERY_FAILED',
});

const LOG_RETENTION_DEFAULT = Object.freeze({
  RETENTION_PERIOD_MS: 7 * 24 * 60 * 60 * NUM.THOUSAND,
  CLEANUP_INTERVAL_MS: 60 * 60 * NUM.THOUSAND,
  BATCH_SIZE: NUM.THOUSAND,
  MAX_DELETES_PER_RUN: NUM.THOUSAND * NUM.TEN,
});

const LOG_RETENTION_LOG_MSG = Object.freeze({
  INITIALIZED: 'LogRetentionService initialized',
  SHUTDOWN: 'LogRetentionService shutdown',
  SCHEDULER_START: (intervalMs) =>
    `Starting log retention scheduler (interval: ${intervalMs}ms)`,
  SCHEDULER_STOPPED: 'Log retention scheduler stopped',
  RUNNING_CLEANUP: (cutoffIso) => `Running log cleanup (cutoff: ${cutoffIso})`,
  CLEANUP_COMPLETED: (deleted, durationMs) =>
    `Log cleanup completed: ${deleted} entries deleted in ${durationMs}ms`,
  RETENTION_SET: (periodMs) => `Retention period set to ${periodMs}ms`,
});

const LOG_RETENTION_ERROR_MSG = Object.freeze({
  INITIAL_CLEANUP_FAILED: 'Initial cleanup failed:',
  SCHEDULED_CLEANUP_FAILED: 'Scheduled cleanup failed:',
  CLEANUP_FAILED: 'Log cleanup failed:',
  CLEANUP_IN_PROGRESS: 'Cleanup already in progress',
  ENGINE_NOT_AVAILABLE: 'SQL query engine not available',
  RETENTION_PERIOD_NEGATIVE: 'Retention period must be non-negative',
});

const LOGS_TABLE_DEFAULT = Object.freeze({
  BATCH_SIZE: NUM.HUNDRED,
  FLUSH_INTERVAL_MS: NUM.FIVE * NUM.THOUSAND,
  MAX_RETRIES: NUM.THREE,
  RETRY_DELAY_MS: NUM.THOUSAND,
});

const LOGGING_SUBSYSTEM = Object.freeze({
  MAIN: 'main',
  CONFIG: 'config',
});

export {
  LOG_LEVELS,
  LOGGING_DEFAULT,
  LOGGING_ERROR_MSG,
  LOGGING_LOG_MSG,
  LOGGING_PRETTY,
  LOGGING_SUBSYSTEM,
  LOG_LEVEL_ORDER,
  LOG_QUERY_DEFAULT,
  LOG_QUERY_ERROR_CODE,
  LOG_QUERY_ERROR_MSG,
  LOG_QUERY_LOG_MSG,
  LOG_RETENTION_DEFAULT,
  LOG_RETENTION_ERROR_MSG,
  LOG_RETENTION_LOG_MSG,
  LOGS_TABLE_DEFAULT,
};
