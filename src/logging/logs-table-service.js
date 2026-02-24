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
import {METRICS_LOG_PREFIX} from '../constants/metrics-constants.js';
import {
  LOGGING_ERROR_MSG,
  LOGGING_LOG_MSG,
  LOGS_TABLE_DEFAULT,
} from './logging-constants.js';
import {
  WORK_CLASS,
  WORK_CLASS_SCHEDULER_ERROR,
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';

const LOGGING_PIPELINE_METRIC_PREFIX = Object.freeze({
  LOGGING: 'metrics.logging.',
  LOGS_TABLE: 'metrics.logs_table.',
  LOG_RETENTION: 'metrics.log_retention.',
  LOG_QUERY: 'metrics.log_query.',
});
const LOGGING_PIPELINE_METRIC_PREFIXES = Object.freeze(
  Object.values(LOGGING_PIPELINE_METRIC_PREFIX),
);

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

    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: 'LogsTableService',
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.LOGS_TABLE_SERVICE,
    });
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
    this.flushChunkSize = Number.isFinite(options.flushChunkSize) &&
      options.flushChunkSize > 0 ?
      Math.floor(options.flushChunkSize) :
      LOGS_TABLE_DEFAULT.FLUSH_CHUNK_SIZE;
    this.flushYieldMs = Number.isFinite(options.flushYieldMs) &&
      options.flushYieldMs >= 0 ?
      Math.floor(options.flushYieldMs) :
      LOGS_TABLE_DEFAULT.FLUSH_YIELD_MS;
    this.maxPendingWrites = Number.isFinite(options.maxPendingWrites) &&
      options.maxPendingWrites > 0 ?
      Math.floor(options.maxPendingWrites) :
      LOGS_TABLE_DEFAULT.MAX_PENDING_WRITES;
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler();

    // State
    this.initialized = false;
    this.pendingWrites = [];
    this.flushTimer = null;
    this.flushContinuationTimer = null;
    this.flushWorkScheduled = false;
    this.isWriting = false;
    this.writeCount = 0;
    this.errorCount = 0;
    this.droppedWrites = 0;
    this.selfLoopPreventedWrites = 0;

    // Logging (use console until we're fully initialized to avoid recursion)
    this.logger = console;
  }

  /**
   * Get the singleton instance.
   * @return {LogsTableService} The logs table service instance.
   */
  static getInstance(options = {}) {
    if (!LogsTableService.instance) {
      LogsTableService.instance = new LogsTableService(options);
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

    const backgroundChunkSize = Math.max(
      1,
      Math.min(
        this.batchSize,
        LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_CHUNK_SIZE,
      ),
    );
    const backgroundYieldMs = Math.max(
      0,
      LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_YIELD_MS,
    );
    this.logger.log('metrics.logging.logs_table_connect.start', {
      bufferedEntries: loggingService.getBufferSize(),
      flushMode: 'background',
      chunkSize: backgroundChunkSize,
      yieldMs: backgroundYieldMs,
    });

    // Register our write callback with the logging service
    const flushedCount = await loggingService.onLogsTableReady(
      (entry) => this.writeLogEntry(entry),
      {
        flushMode: 'background',
        chunkSize: backgroundChunkSize,
        yieldMs: backgroundYieldMs,
      },
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

    if (this.isLoggingPipelineMetricsEntry(entry)) {
      this.selfLoopPreventedWrites += 1;
      return;
    }

    if (this.pendingWrites.length >= this.maxPendingWrites) {
      if (this.isMetricsLogEntry(entry)) {
        this.recordDroppedWrite();
        return;
      }

      const droppedMetrics = this.dropPendingMetricsLogEntry();
      if (!droppedMetrics) {
        this.recordDroppedWrite();
        return;
      }
    }

    // Add to pending writes
    this.pendingWrites.push(entry);

    // Flush if batch size reached
    if (this.pendingWrites.length >= this.batchSize) {
      await this.flush({
        maxEntries: this.flushChunkSize,
        yieldPending: true,
      });
    }
  }

  /**
   * Flush pending log entries to the logs table.
   * @param {Object} [options] - Flush behavior options.
   * @param {number} [options.maxEntries] - Max entries to process in this pass.
   * @param {boolean} [options.yieldPending] - Schedule continuation when pending entries remain.
   * @return {Promise<number>} Number of entries written.
   */
  async flush(options = {}) {
    const scheduleThroughWorkClass = options.scheduleThroughWorkClass !== false;
    if (scheduleThroughWorkClass && this.workClassScheduler) {
      if (this.flushWorkScheduled) {
        return 0;
      }
      this.flushWorkScheduled = true;
      try {
        return await this.workClassScheduler.enqueue(WORK_CLASS.C, async () => {
          return this.flush({
            ...options,
            scheduleThroughWorkClass: false,
          });
        });
      } catch (error) {
        if (error?.code === WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED) {
          this.recordDroppedWrite();
          return 0;
        }
        throw error;
      } finally {
        this.flushWorkScheduled = false;
      }
    }

    if (this.isWriting || this.pendingWrites.length === 0) {
      return 0;
    }

    const maxEntries = Number.isFinite(options.maxEntries) &&
      options.maxEntries > 0 ?
      Math.floor(options.maxEntries) :
      this.pendingWrites.length;
    const yieldPending = options.yieldPending === true;

    this.isWriting = true;
    const entriesToWrite = this.pendingWrites.splice(0, maxEntries);

    let writtenCount = 0;

    try {
      for (const entry of entriesToWrite) {
        try {
          const success = await this.writeEntryWithRetry(entry);
          if (success) {
            writtenCount++;
            this.writeCount++;
          } else {
            this.errorCount++;
          }
        } catch (_writeError) {
          this.errorCount++;
        }
      }

      if (writtenCount > 0) {
        this.emit('flushed', {count: writtenCount});
      }
    } finally {
      this.isWriting = false;
      if (yieldPending && this.pendingWrites.length > 0) {
        this.scheduleContinuationFlush();
      }
    }

    return writtenCount;
  }

  /**
   * Schedule a continuation flush for pending queued entries.
   * @private
   */
  scheduleContinuationFlush() {
    if (this.flushContinuationTimer) {
      return;
    }

    this.flushContinuationTimer = setTimeout(() => {
      this.flushContinuationTimer = null;
      this.flush({
        maxEntries: this.flushChunkSize,
        yieldPending: true,
      }).catch((error) => {
        console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
      });
    }, this.flushYieldMs);

    if (this.flushContinuationTimer.unref) {
      this.flushContinuationTimer.unref();
    }
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

    // Use UPSERT so duplicate log_id replays remain idempotent.
    if (this.cdcIntegrationService) {
      await this.cdcIntegrationService.upsertSystemTableRow(
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
    if (this.flushContinuationTimer) {
      clearTimeout(this.flushContinuationTimer);
      this.flushContinuationTimer = null;
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
      flushChunkSize: this.flushChunkSize,
      flushYieldMs: this.flushYieldMs,
      maxPendingWrites: this.maxPendingWrites,
      droppedWrites: this.droppedWrites,
      selfLoopPreventedWrites: this.selfLoopPreventedWrites,
      flushWorkScheduled: this.flushWorkScheduled,
      workClassSchedulerEnabled: Boolean(this.workClassScheduler),
    };
  }

  /**
   * Check whether an entry is metrics namespace log.
   * @param {Object} entry - Log entry.
   * @return {boolean}
   * @private
   */
  isMetricsLogEntry(entry) {
    return typeof entry?.message === 'string' &&
      entry.message.startsWith(METRICS_LOG_PREFIX);
  }

  /**
   * Check whether an entry is a logging-pipeline metrics event.
   * These entries are dropped to prevent metrics->logging recursion.
   * @param {Object} entry - Log entry.
   * @return {boolean}
   * @private
   */
  isLoggingPipelineMetricsEntry(entry) {
    const message = typeof entry?.message === 'string' ?
      entry.message :
      '';
    if (!message) {
      return false;
    }
    for (const prefix of LOGGING_PIPELINE_METRIC_PREFIXES) {
      if (message.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Drop one queued metrics log entry to make room for non-metrics logs.
   * @return {boolean} True when a metrics entry was dropped.
   * @private
   */
  dropPendingMetricsLogEntry() {
    for (let index = 0; index < this.pendingWrites.length; index++) {
      const entry = this.pendingWrites[index];
      if (!this.isMetricsLogEntry(entry)) {
        continue;
      }
      this.pendingWrites.splice(index, 1);
      this.recordDroppedWrite();
      return true;
    }
    return false;
  }

  /**
   * Update drop counters and emit throttled warning log.
   * @private
   */
  recordDroppedWrite() {
    this.droppedWrites += 1;
    if (this.droppedWrites === 1 ||
      this.droppedWrites % LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL === 0) {
      this.logger.warn(
        LOGGING_LOG_MSG.logsDroppedByBackpressure(
          this.droppedWrites,
          this.maxPendingWrites,
        ),
      );
    }
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
    while (this.pendingWrites.length > 0) {
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
