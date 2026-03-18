/**
 * Logs Table Service - Manages writing logs to the logs system table.
 * Handles flushing buffered logs after bootstrap completes.
 * Requirements: 27.1, 27.3, 28.1, 28.2, 28.3, 28.4, 28.5
 */

import {EventEmitter} from 'events';
import {LoggingService} from './logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {METRICS_LOG_PREFIX} from '../constants/metrics-constants.js';
import {
  LOGGING_ERROR_MSG,
  LOGGING_LOG_MSG,
  LOG_LEVEL_ORDER,
  LOGS_TABLE_DEFAULT,
} from './logging-constants.js';
import {
  WORK_CLASS,
  WORK_CLASS_SCHEDULER_ERROR,
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {
  createSystemMetadataOwnerRequiredError,
} from '../control-plane/system-metadata-access-error.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';

const LOGGING_METRIC_PREFIX = 'metrics.logging.';
const LOGS_TABLE_METRIC_PREFIX = 'metrics.logs_table.';
const LOG_RETENTION_METRIC_PREFIX = 'metrics.log_retention.';
const LOG_QUERY_METRIC_PREFIX = 'metrics.log_query.';

const LOGGING_PIPELINE_METRIC_PREFIX = Object.freeze({
  LOGGING: LOGGING_METRIC_PREFIX,
  LOGS_TABLE: LOGS_TABLE_METRIC_PREFIX,
  LOG_RETENTION: LOG_RETENTION_METRIC_PREFIX,
  LOG_QUERY: LOG_QUERY_METRIC_PREFIX,
});
const LOGGING_PIPELINE_METRIC_PREFIXES = Object.freeze(
  Object.values(LOGGING_PIPELINE_METRIC_PREFIX),
);

const LOGS_TABLE_CONNECTED_EVENT = 'connected';
const LOGS_TABLE_FLUSHED_EVENT = 'flushed';
const LOGS_TABLE_EVENT = Object.freeze({
  CONNECTED: LOGS_TABLE_CONNECTED_EVENT,
  FLUSHED: LOGS_TABLE_FLUSHED_EVENT,
});
const LOGS_TABLE_FLUSH_MODE = 'background';
const LOGS_TABLE_CONNECT_METRIC =
  'metrics.logging.logs_table_connect.start';
const LOGS_TABLE_OWNER = 'LogsTableService';
const MIN_CHUNK_SIZE = 1;
const MIN_YIELD_MS = 0;
const MIN_SLEEP_MS = 1;

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
      owner: LOGS_TABLE_OWNER,
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.LOGS_TABLE_SERVICE,
    });
    this.logsOwner = options.logsOwner || null;

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
    this.pressureHighWatermark =
      Number.isFinite(options.pressureHighWatermark) &&
      options.pressureHighWatermark > 0 ?
        Math.min(
          this.maxPendingWrites,
          Math.floor(options.pressureHighWatermark),
        ) :
        Math.min(
          this.maxPendingWrites,
          LOGS_TABLE_DEFAULT.PRESSURE_HIGH_WATERMARK,
        );
    this.pressureRetainedPendingWrites =
      Number.isFinite(options.pressureRetainedPendingWrites) &&
      options.pressureRetainedPendingWrites > 0 ?
        Math.min(
          this.maxPendingWrites,
          Math.floor(options.pressureRetainedPendingWrites),
        ) :
        Math.min(
          this.maxPendingWrites,
          LOGS_TABLE_DEFAULT.PRESSURE_RETAINED_PENDING_WRITES,
        );
    this.pressureDeferBackoffMultiplier =
      Number.isFinite(options.pressureDeferBackoffMultiplier) &&
      options.pressureDeferBackoffMultiplier >= 1 ?
        options.pressureDeferBackoffMultiplier :
        LOGS_TABLE_DEFAULT.PRESSURE_DEFER_BACKOFF_MULTIPLIER;
    this.pressureMaxRetryDelayMs =
      Number.isFinite(options.pressureMaxRetryDelayMs) &&
      options.pressureMaxRetryDelayMs > 0 ?
        Math.floor(options.pressureMaxRetryDelayMs) :
        LOGS_TABLE_DEFAULT.PRESSURE_MAX_RETRY_DELAY_MS;
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler();
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.setTimeoutFn = typeof options.setTimeoutFn === 'function' ?
      options.setTimeoutFn :
      setTimeout;
    this.clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ?
      options.clearTimeoutFn :
      clearTimeout;
    this.setIntervalFn = typeof options.setIntervalFn === 'function' ?
      options.setIntervalFn :
      setInterval;
    this.clearIntervalFn = typeof options.clearIntervalFn === 'function' ?
      options.clearIntervalFn :
      clearInterval;

    // State
    this.initialized = false;
    this.pendingWrites = [];
    this.flushTimer = null;
    this.flushContinuationTimer = null;
    this.flushContinuationDueAtMs = null;
    this.flushWorkScheduled = false;
    this.isWriting = false;
    this.isShuttingDown = false;
    this.writeDeferredUntilMs = 0;
    this.writeCount = 0;
    this.errorCount = 0;
    this.droppedWrites = 0;
    this.selfLoopPreventedWrites = 0;
    this.consecutiveDeferredWriteFailures = 0;

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
    const instance = LogsTableService.instance;
    if (!instance) {
      return;
    }

    // Reset must be synchronous for test teardown reliability.
    // Avoid launching async shutdown work that can outlive the test process.
    instance.isShuttingDown = true;
    instance.stopFlushTimer();
    instance.pendingWrites = [];
    instance.flushWorkScheduled = false;
    instance.isWriting = false;
    instance.flushContinuationDueAtMs = null;
    instance.writeDeferredUntilMs = 0;
    instance.initialized = false;
    instance.isShuttingDown = false;
    instance.consecutiveDeferredWriteFailures = 0;
    instance.removeAllListeners();
    LogsTableService.instance = null;
  }

  /**
   * Initialize the logs table service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.logsOwner - Semantic owner for logs-table writes.
   */
  initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    if (options.logsOwner) {
      this.logsOwner = options.logsOwner;
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

    const bufferedEntries = loggingService.getBufferSize();
    const useThrottledStartupDrain =
      bufferedEntries >=
      LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD;
    const backgroundChunkSize = Math.max(
      MIN_CHUNK_SIZE,
      useThrottledStartupDrain ?
        LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_CHUNK_SIZE :
        Math.min(
          this.batchSize,
          LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_CHUNK_SIZE,
        ),
    );
    const backgroundYieldMs = Math.max(
      MIN_YIELD_MS,
      useThrottledStartupDrain ?
        LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_YIELD_MS :
        LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_YIELD_MS,
    );
    this.logger.log(LOGS_TABLE_CONNECT_METRIC, {
      bufferedEntries,
      flushMode: LOGS_TABLE_FLUSH_MODE,
      chunkSize: backgroundChunkSize,
      yieldMs: backgroundYieldMs,
    });

    // Register our write callback with the logging service
    const flushedCount = await loggingService.onLogsTableReady(
      (entry) => this.writeLogEntry(entry),
      {
        flushMode: LOGS_TABLE_FLUSH_MODE,
        chunkSize: backgroundChunkSize,
        yieldMs: backgroundYieldMs,
      },
    );

    this.logger.log(LOGGING_LOG_MSG.connectedLoggingService(flushedCount));
    this.emit(LOGS_TABLE_EVENT.CONNECTED, {flushedCount});

    return flushedCount;
  }

  /**
   * Write a log entry to the logs system table.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<void>}
   */
  async writeLogEntry(entry) {
    if (!entry || !this.initialized || this.isShuttingDown) {
      return;
    }

    if (this.isLoggingPipelineMetricsEntry(entry)) {
      this.selfLoopPreventedWrites += 1;
      return;
    }

    if (this.isPressureModeActive()) {
      if (this.shouldApplyRetainedBacklogCap() &&
          this.pendingWrites.length >= this.getRetainedPressureBacklogCap()) {
        const droppedPendingEntry = this.dropPendingQueuedEntryForAdmission(entry);
        if (!droppedPendingEntry || this.shouldDropEntryUnderPressure(entry)) {
          this.recordDroppedWrite();
          return;
        }
      }
      if (this.shouldDropEntryUnderPressure(entry)) {
        this.recordDroppedWrite();
        return;
      }
    }

    if (this.pendingWrites.length >= this.maxPendingWrites) {
      if (this.isMetricsLogEntry(entry)) {
        this.recordDroppedWrite();
        return;
      }

      const droppedPendingEntry = this.dropPendingQueuedEntryForAdmission(entry);
      if (!droppedPendingEntry) {
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
    if (this.isWriteDeferred()) {
      this.scheduleContinuationFlush(this.getRemainingWriteDeferMs());
      return 0;
    }

    const scheduleThroughWorkClass = options.scheduleThroughWorkClass !== false;
    if (scheduleThroughWorkClass &&
      this.workClassScheduler &&
      !this.isShuttingDown) {
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
      for (let index = 0; index < entriesToWrite.length; index += 1) {
        const entry = entriesToWrite[index];
        try {
          const success = await this.writeEntryWithRetry(entry);
          if (success) {
            this.consecutiveDeferredWriteFailures = 0;
            writtenCount++;
            this.writeCount++;
          } else {
            this.errorCount++;
          }
        } catch (writeError) {
          if (this.shouldDeferWriteError(writeError)) {
            this.errorCount++;
            this.deferPendingWrites(
              entriesToWrite.slice(index),
              writeError,
            );
            break;
          }
          this.errorCount++;
          console.warn(LOGGING_ERROR_MSG.WRITE_ENTRY_FAILED, writeError);
        }
      }

      if (writtenCount > 0) {
        this.emit(LOGS_TABLE_EVENT.FLUSHED, {count: writtenCount});
      }
    } finally {
      this.isWriting = false;
      if (yieldPending &&
          this.pendingWrites.length > 0 &&
          !this.isWriteDeferred()) {
        this.scheduleContinuationFlush();
      }
    }

    return writtenCount;
  }

  /**
   * Schedule a continuation flush for pending queued entries.
   * @private
   */
  scheduleContinuationFlush(delayOverrideMs = this.flushYieldMs) {
    const delayMs = Number.isFinite(delayOverrideMs) &&
      delayOverrideMs >= MIN_YIELD_MS ?
      Math.floor(delayOverrideMs) :
      this.flushYieldMs;
    const dueAtMs = this.now() + delayMs;
    if (this.flushContinuationTimer &&
        Number.isFinite(this.flushContinuationDueAtMs) &&
        this.flushContinuationDueAtMs <= dueAtMs) {
      return;
    }

    if (this.flushContinuationTimer) {
      this.clearTimeoutFn(this.flushContinuationTimer);
    }

    this.flushContinuationDueAtMs = dueAtMs;
    this.flushContinuationTimer = this.setTimeoutFn(() => {
      this.flushContinuationTimer = null;
      this.flushContinuationDueAtMs = null;
      this.flush({
        maxEntries: this.flushChunkSize,
        yieldPending: true,
      }).catch((error) => {
        console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
      });
    }, delayMs);

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
        if (this.shouldDeferWriteError(error)) {
          throw error;
        }
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

    // Log rows are append-only (write-once, never updated). UPSERT is used
    // solely for idempotent replay of duplicate log_id values; it effectively
    // acts as INSERT since no fields are ever mutated after creation.
    if (this.logsOwner) {
      await this.logsOwner.upsertLog(row, {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        deliveryPriority: 'background',
        allowPressureDefer: true,
        pressureRetryAfterMs: this.retryDelayMs,
      });
      return;
    }

    throw createSystemMetadataOwnerRequiredError({
      serviceName: LOGS_TABLE_OWNER,
      ownerName: 'logsOwner',
      tableName: 'logs',
      operation: 'write',
      message: LOGGING_ERROR_MSG.OWNER_REQUIRED,
    });
  }

  /**
   * Check whether logs-table writes are currently in a defer window.
   * @return {boolean}
   * @private
   */
  isWriteDeferred() {
    if (!Number.isFinite(this.writeDeferredUntilMs) ||
        this.writeDeferredUntilMs <= 0) {
      return false;
    }
    if (this.now() >= this.writeDeferredUntilMs) {
      this.writeDeferredUntilMs = 0;
      return false;
    }
    return true;
  }

  /**
   * Return remaining defer time for the logs-table writer.
   * @return {number}
   * @private
   */
  getRemainingWriteDeferMs() {
    if (!this.isWriteDeferred()) {
      return 0;
    }
    return Math.max(MIN_SLEEP_MS, this.writeDeferredUntilMs - this.now());
  }

  /**
   * Determine whether one logs-table write failure should defer the owner
   * instead of retrying every buffered entry inline.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  shouldDeferWriteError(error) {
    if (!error) {
      return false;
    }
    if (error?.deferRetry === true ||
        error?.code === 'CONTROL_PLANE_PRESSURE_DEGRADED') {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > 0) {
      return true;
    }
    const message = error?.message || String(error);
    return message.includes('Distributed operation failed due to participant failures') ||
      message.includes('Connection to node') &&
      message.includes('closed') ||
      message.includes('No connection to node') ||
      message.includes('Message timeout') ||
      message.includes('Query routing failed') ||
      message.includes('Failed to forward write to leader');
  }

  /**
   * Resolve one defer delay after a transient logs-table write failure.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveWriteDeferMs(error) {
    const baseRetryAfterMs = Number.isFinite(error?.retryAfterMs) &&
      error.retryAfterMs > 0 ?
      Math.max(MIN_SLEEP_MS, Math.floor(error.retryAfterMs)) :
      Math.max(MIN_SLEEP_MS, this.retryDelayMs);
    const exponent = Math.max(0, this.consecutiveDeferredWriteFailures - 1);
    const scaledRetryAfterMs =
      baseRetryAfterMs * (this.pressureDeferBackoffMultiplier ** exponent);
    return Math.min(
      this.pressureMaxRetryDelayMs,
      Math.max(MIN_SLEEP_MS, Math.floor(scaledRetryAfterMs)),
    );
  }

  /**
   * Requeue the remaining batch and pause the logs-table writer briefly after
   * one transient control-plane failure.
   * @param {Array<Object>} entries
   * @param {Error} error
   * @private
   */
  deferPendingWrites(entries, error) {
    if (Array.isArray(entries) && entries.length > 0) {
      this.pendingWrites = entries.concat(this.pendingWrites);
    }
    this.consecutiveDeferredWriteFailures += 1;
    this.trimPendingWritesUnderPressure();
    const retryAfterMs = this.resolveWriteDeferMs(error);
    const desiredUntilMs = this.now() + retryAfterMs;
    this.writeDeferredUntilMs = Math.max(
      this.writeDeferredUntilMs || 0,
      desiredUntilMs,
    );
    this.scheduleContinuationFlush(retryAfterMs);
    console.warn(
      LOGGING_LOG_MSG.logsWriteDeferred(
        retryAfterMs,
        this.pendingWrites.length,
      ),
      error?.message || String(error),
    );
  }

  /**
   * Start the periodic flush timer.
   * @private
   */
  startFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = this.setIntervalFn(() => {
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
      this.clearIntervalFn(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.flushContinuationTimer) {
      this.clearTimeoutFn(this.flushContinuationTimer);
      this.flushContinuationTimer = null;
    }
    this.flushContinuationDueAtMs = null;
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
      writeDeferredUntilMs: this.writeDeferredUntilMs,
      flushChunkSize: this.flushChunkSize,
      flushYieldMs: this.flushYieldMs,
      maxPendingWrites: this.maxPendingWrites,
      pressureHighWatermark: this.pressureHighWatermark,
      pressureRetainedPendingWrites: this.pressureRetainedPendingWrites,
      droppedWrites: this.droppedWrites,
      selfLoopPreventedWrites: this.selfLoopPreventedWrites,
      flushWorkScheduled: this.flushWorkScheduled,
      workClassSchedulerEnabled: Boolean(this.workClassScheduler),
      consecutiveDeferredWriteFailures: this.consecutiveDeferredWriteFailures,
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
   * Return normalized priority for one log entry.
   * Higher values are more important.
   * @param {Object} entry
   * @return {number}
   * @private
   */
  getLogPriority(entry) {
    const normalizedLevel = String(entry?.level || 'INFO').toUpperCase();
    return Number.isInteger(LOG_LEVEL_ORDER[normalizedLevel]) ?
      LOG_LEVEL_ORDER[normalizedLevel] :
      LOG_LEVEL_ORDER.INFO;
  }

  /**
   * Determine whether the logs-table writer is in sustained pressure mode.
   * @return {boolean}
   * @private
   */
  isPressureModeActive() {
    return this.isWriteDeferred() ||
      this.pendingWrites.length >= this.pressureHighWatermark;
  }

  /**
   * Return the retained backlog cap applied while the writer is deferred.
   * @return {number}
   * @private
   */
  getRetainedPressureBacklogCap() {
    return Math.max(
      MIN_CHUNK_SIZE,
      Math.min(
        this.maxPendingWrites,
        this.pressureHighWatermark,
        this.pressureRetainedPendingWrites,
      ),
    );
  }

  /**
   * Determine whether the deferred-pressure backlog cap should be applied.
   * @return {boolean}
   * @private
   */
  shouldApplyRetainedBacklogCap() {
    return this.isWriteDeferred();
  }

  /**
   * Build a stable fingerprint used to collapse repeated pressure logs.
   * @param {Object} entry
   * @return {string|null}
   * @private
   */
  buildPressureFingerprint(entry) {
    const message = typeof entry?.message === 'string' ?
      entry.message.trim() :
      '';
    if (!message) {
      return null;
    }
    return [
      String(entry?.level || 'INFO').toUpperCase(),
      entry?.nodeId || '',
      entry?.serviceId || '',
      message,
    ].join('|');
  }

  /**
   * Check whether a pressure-equivalent entry is already queued.
   * @param {Object} entry
   * @return {boolean}
   * @private
   */
  hasPendingPressureEquivalentEntry(entry) {
    const fingerprint = this.buildPressureFingerprint(entry);
    if (!fingerprint) {
      return false;
    }
    for (const pendingEntry of this.pendingWrites) {
      if (this.buildPressureFingerprint(pendingEntry) === fingerprint) {
        return true;
      }
    }
    return false;
  }

  /**
   * Determine whether an incoming entry should be dropped while the owner is
   * pressure-deferred or the queue is already hot.
   * @param {Object} entry
   * @return {boolean}
   * @private
   */
  shouldDropEntryUnderPressure(entry) {
    if (this.shouldApplyRetainedBacklogCap() &&
        this.pendingWrites.length >= this.getRetainedPressureBacklogCap() &&
        this.getLogPriority(entry) < LOG_LEVEL_ORDER.ERROR) {
      return true;
    }
    if (this.isMetricsLogEntry(entry)) {
      return true;
    }
    if (this.getLogPriority(entry) <= LOG_LEVEL_ORDER.INFO) {
      return true;
    }
    return this.hasPendingPressureEquivalentEntry(entry);
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
   * Drop one queued entry so a more important incoming entry can be admitted.
   * Prefer dropping metrics, then lower-priority entries, then duplicates.
   * @param {Object} incomingEntry
   * @return {boolean}
   * @private
   */
  dropPendingQueuedEntryForAdmission(incomingEntry) {
    if (this.dropPendingMetricsLogEntry()) {
      return true;
    }

    const incomingPriority = this.getLogPriority(incomingEntry);
    for (let index = 0; index < this.pendingWrites.length; index++) {
      const pendingEntry = this.pendingWrites[index];
      if (this.getLogPriority(pendingEntry) >= incomingPriority) {
        continue;
      }
      this.pendingWrites.splice(index, 1);
      this.recordDroppedWrite();
      return true;
    }

    const incomingFingerprint = this.buildPressureFingerprint(incomingEntry);
    if (!incomingFingerprint) {
      return false;
    }
    for (let index = 0; index < this.pendingWrites.length; index++) {
      const pendingEntry = this.pendingWrites[index];
      if (this.buildPressureFingerprint(pendingEntry) !== incomingFingerprint) {
        continue;
      }
      this.pendingWrites.splice(index, 1);
      this.recordDroppedWrite();
      return true;
    }

    return false;
  }

  /**
   * Trim retained backlog aggressively during defer windows so the writer does
   * not keep retaining outage noise while the control plane is unavailable.
   * @private
   */
  trimPendingWritesUnderPressure() {
    const retainedCap = this.getRetainedPressureBacklogCap();
    while (this.pendingWrites.length > retainedCap) {
      const dropIndex = this.findPendingTrimDropIndex();
      if (dropIndex < 0) {
        break;
      }
      this.pendingWrites.splice(dropIndex, 1);
      this.recordDroppedWrite();
    }
  }

  /**
   * Select one queued entry to evict while trimming deferred-pressure backlog.
   * Prefer metrics, then duplicate fingerprints, then the oldest lowest-
   * priority entry.
   * @return {number}
   * @private
   */
  findPendingTrimDropIndex() {
    const seenFingerprints = new Set();
    let lowestPriorityIndex = -1;
    let lowestPriority = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.pendingWrites.length; index += 1) {
      const entry = this.pendingWrites[index];
      if (this.isMetricsLogEntry(entry)) {
        return index;
      }

      const fingerprint = this.buildPressureFingerprint(entry);
      if (fingerprint) {
        if (seenFingerprints.has(fingerprint)) {
          return index;
        }
        seenFingerprints.add(fingerprint);
      }

      const priority = this.getLogPriority(entry);
      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestPriorityIndex = index;
      }
    }

    return lowestPriorityIndex;
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
    this.isShuttingDown = true;
    this.stopFlushTimer();

    // Final drain. Avoid busy-spinning while an in-flight write is active.
    // Use direct flush mode so shutdown does not depend on class-C scheduling.
    while (this.pendingWrites.length > 0 || this.isWriting) {
      if (this.isWriting) {
        await this.sleep(Math.max(MIN_SLEEP_MS, this.flushYieldMs));
        continue;
      }
      if (this.isWriteDeferred()) {
        await this.sleep(this.getRemainingWriteDeferMs());
        continue;
      }
      await this.flush({
        scheduleThroughWorkClass: false,
        maxEntries: this.flushChunkSize,
        yieldPending: false,
      });
    }

    this.initialized = false;
    this.isShuttingDown = false;
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
    return new Promise((resolve) => this.setTimeoutFn(resolve, ms));
  }
}

export {LogsTableService, LOGS_TABLE_DEFAULT};
