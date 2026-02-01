/**
 * Logs Table Service - Manages writing logs to the logs system table.
 * Handles flushing buffered logs after bootstrap completes.
 * Requirements: 27.1, 27.3, 28.1, 28.2, 28.3, 28.4, 28.5
 */

import {EventEmitter} from 'events';
import {LoggingService} from './logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {
  LOGGING_ERROR_MSG,
  LOGGING_LOG_MSG,
  LOGS_TABLE_DEFAULT,
} from './logging-constants.js';

/**
 * LogsTableService manages writing log entries to the logs system table.
 * It integrates with LoggingService to flush buffered entries after bootstrap.
 */
class LogsTableService extends EventEmitter {
  static instance = null;

  /**
   * Create a new LogsTableService.
   * @param {Object} options - Configuration options.
   * @private
   */
  constructor(options = {}) {
    super();

    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.partitionService = options.partitionService || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.batchSize = options.batchSize ||
      config.get(CONFIG_KEY.LOGGING_BATCH_SIZE) || LOGS_TABLE_DEFAULT.BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ||
      config.get(CONFIG_KEY.LOGGING_FLUSH_INTERVAL_MS) ||
      LOGS_TABLE_DEFAULT.FLUSH_INTERVAL_MS;
    this.maxRetries = options.maxRetries ||
      config.get(CONFIG_KEY.LOGGING_MAX_RETRIES) || LOGS_TABLE_DEFAULT.MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ||
      config.get(CONFIG_KEY.LOGGING_RETRY_DELAY_MS) || LOGS_TABLE_DEFAULT.RETRY_DELAY_MS;

    // State
    this.initialized = false;
    this.pendingWrites = [];
    this.flushTimer = null;
    this.isWriting = false;
    this.writeCount = 0;
    this.errorCount = 0;

    // Logging (use console until we're fully initialized to avoid recursion)
    this.logger = console;
  }

  /**
   * Get the singleton instance.
   * @return {LogsTableService} The logs table service instance.
   */
  static getInstance() {
    if (!LogsTableService.instance) {
      LogsTableService.instance = new LogsTableService();
    }
    return LogsTableService.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (LogsTableService.instance) {
      LogsTableService.instance.shutdown();
    }
    LogsTableService.instance = null;
  }

  /**
   * Initialize the logs table service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.partitionService - Partition service for direct writes.
   */
  initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }

    if (options.partitionService) {
      this.partitionService = options.partitionService;
    }

    // Start periodic flush timer
    this.startFlushTimer();

    this.initialized = true;
    this.logger.log(LOGGING_LOG_MSG.LOGS_TABLE_SERVICE_INITIALIZED);
  }

  /**
   * Connect to the logging service and register as the write callback.
   * This should be called after bootstrap completes and logs table is ready.
   * @return {Promise<number>} Number of buffered entries flushed.
   */
  async connectToLoggingService() {
    const loggingService = LoggingService.getInstance();

    if (!loggingService.isInitialized()) {
      throw new Error(LOGGING_ERROR_MSG.LOGGING_SERVICE_REQUIRED);
    }

    // Register our write callback with the logging service
    const flushedCount = await loggingService.onLogsTableReady(
      (entry) => this.writeLogEntry(entry),
    );

    this.logger.log(LOGGING_LOG_MSG.connectedLoggingService(flushedCount));
    this.emit('connected', {flushedCount});

    return flushedCount;
  }

  /**
   * Write a log entry to the logs system table.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<void>}
   */
  async writeLogEntry(entry) {
    if (!entry) {
      return;
    }

    // Add to pending writes
    this.pendingWrites.push(entry);

    // Flush if batch size reached
    if (this.pendingWrites.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush pending log entries to the logs table.
   * @return {Promise<number>} Number of entries written.
   */
  async flush() {
    if (this.isWriting || this.pendingWrites.length === 0) {
      return 0;
    }

    this.isWriting = true;
    const entriesToWrite = [...this.pendingWrites];
    this.pendingWrites = [];

    let writtenCount = 0;

    try {
      for (const entry of entriesToWrite) {
        const success = await this.writeEntryWithRetry(entry);
        if (success) {
          writtenCount++;
          this.writeCount++;
        } else {
          this.errorCount++;
        }
      }

      if (writtenCount > 0) {
        this.emit('flushed', {count: writtenCount});
      }
    } finally {
      this.isWriting = false;
    }

    return writtenCount;
  }

  /**
   * Write a single entry with retry logic.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<boolean>} True if write succeeded.
   * @private
   */
  async writeEntryWithRetry(entry) {
    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.writeEntryToTable(entry);
        return true;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    const error = lastError || new Error(LOGGING_ERROR_MSG.WRITE_ENTRY_FAILED);
    throw error;
  }

  /**
   * Write a single entry to the logs table.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<void>}
   * @private
   */
  async writeEntryToTable(entry) {
    const row = {
      log_id: entry.logId,
      timestamp: entry.timestamp,
      level: entry.level,
      node_id: entry.nodeId,
      service_id: entry.serviceId || null,
      service_type: entry.serviceType || null,
      message: entry.message,
      trace_id: entry.traceId || null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      created_at: entry.createdAt || Date.now(),
    };

    // Try CDC integration service first (preferred)
    if (this.cdcIntegrationService) {
      await this.cdcIntegrationService.insertSystemTableRow(
        SystemTableName.LOGS,
        row,
      );
      return;
    }

    // Fall back to direct partition write
    if (this.partitionService) {
      await this.partitionService.insertData(SystemTableName.LOGS, row);
      return;
    }

    throw new Error(LOGGING_ERROR_MSG.NO_WRITE_MECHANISM);
  }

  /**
   * Start the periodic flush timer.
   * @private
   */
  startFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
      });
    }, this.flushIntervalMs);

    // Don't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop the periodic flush timer.
   * @private
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    return {
      initialized: this.initialized,
      pendingWrites: this.pendingWrites.length,
      writeCount: this.writeCount,
      errorCount: this.errorCount,
      isWriting: this.isWriting,
    };
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the service.
   * Flushes any pending writes before shutting down.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.stopFlushTimer();

    // Final flush
    if (this.pendingWrites.length > 0) {
      await this.flush();
    }

    this.initialized = false;
    this.removeAllListeners();
    this.logger.log(LOGGING_LOG_MSG.LOGS_TABLE_SERVICE_SHUTDOWN);
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export {LogsTableService, LOGS_TABLE_DEFAULT};
