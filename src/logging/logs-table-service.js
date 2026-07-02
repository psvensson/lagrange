/**
 * Logs Table Service - Manages writing logs to the logs system table.
 * Handles flushing buffered logs after bootstrap completes.
 * Requirements: 27.1, 27.3, 28.1, 28.2, 28.3, 28.4, 28.5
 */

import {EventEmitter} from 'events';
import {LoggingService} from './logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
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
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  createSystemMetadataOwnerRequiredError,
} from '../control-plane/system-metadata-access-error.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
import {
  LOCAL_NUM_ZERO,
  LOCAL_NUM_ONE,
  LOCAL_STR_FUNCTION,
  LOCAL_STR_MESSAGEROUTER,
  LOCAL_STR_PRESSUREGOVERNOR,
  LOCAL_STR_LSYAT,
  LOCAL_STR_BACKGROUND,
  LOCAL_STR_LOGSOWNER,
  LOCAL_STR_LOGS,
  LOCAL_STR_WRITE,
  LOGS_TABLE_CONTROL_PLANE_QUERY_PRESSURE_RESOURCE_KEYS,
  LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS,
  LOGS_TABLE_EVENT,
  LOGS_TABLE_FLUSH_MODE,
  LOGS_TABLE_CONNECT_METRIC,
  LOGS_TABLE_OWNER,
  MIN_CHUNK_SIZE,
  MIN_YIELD_MS,
  MIN_SLEEP_MS,
} from './logs-table-service-constants.js';
import {
  scheduleContinuationFlush,
  writeEntryWithRetry,
  isWriteDeferred,
  getRemainingWriteDeferMs,
  shouldDeferWriteError,
  resolveWriteDeferMs,
  deferPendingWrites,
  startFlushTimer,
  stopFlushTimer,
  sleep,
} from './logs-table-service-flush-helpers.js';
import {
  getPressureGovernor,
  applySharedPressureDeferWindow,
  isSharedPressureBackpressured,
  isMetricsLogEntry,
  getLogPriority,
  isPressureModeActive,
  getRetainedPressureBacklogCap,
  shouldApplyRetainedBacklogCap,
  buildPressureFingerprint,
  resolveTransientPressureFamily,
  hasPendingPressureEquivalentEntry,
  shouldDropEntryUnderPressure,
  isLoggingPipelineMetricsEntry,
  dropPendingMetricsLogEntry,
  dropPendingQueuedEntryForAdmission,
  trimPendingWritesUnderPressure,
  findPendingTrimDropIndex,
  recordDroppedWrite,
  incrementBoundedCounter,
} from './logs-table-service-pressure-helpers.js';

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
    this.messageRouter = options.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;

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
      options.flushChunkSize > LOCAL_NUM_ZERO ?
      Math.floor(options.flushChunkSize) :
      LOGS_TABLE_DEFAULT.FLUSH_CHUNK_SIZE;
    this.flushYieldMs = Number.isFinite(options.flushYieldMs) &&
      options.flushYieldMs >= LOCAL_NUM_ZERO ?
      Math.floor(options.flushYieldMs) :
      LOGS_TABLE_DEFAULT.FLUSH_YIELD_MS;
    this.maxPendingWrites = Number.isFinite(options.maxPendingWrites) &&
      options.maxPendingWrites > LOCAL_NUM_ZERO ?
      Math.floor(options.maxPendingWrites) :
      LOGS_TABLE_DEFAULT.MAX_PENDING_WRITES;
    this.pressureHighWatermark =
      Number.isFinite(options.pressureHighWatermark) &&
      options.pressureHighWatermark > LOCAL_NUM_ZERO ?
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
      options.pressureRetainedPendingWrites > LOCAL_NUM_ZERO ?
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
      options.pressureDeferBackoffMultiplier >= LOCAL_NUM_ONE ?
        options.pressureDeferBackoffMultiplier :
        LOGS_TABLE_DEFAULT.PRESSURE_DEFER_BACKOFF_MULTIPLIER;
    this.pressureMaxRetryDelayMs =
      Number.isFinite(options.pressureMaxRetryDelayMs) &&
      options.pressureMaxRetryDelayMs > LOCAL_NUM_ZERO ?
        Math.floor(options.pressureMaxRetryDelayMs) :
        LOGS_TABLE_DEFAULT.PRESSURE_MAX_RETRY_DELAY_MS;
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler();
    this.now = typeof options.now === LOCAL_STR_FUNCTION ?
      options.now :
      () => Date.now();
    this.setTimeoutFn = typeof options.setTimeoutFn === LOCAL_STR_FUNCTION ?
      options.setTimeoutFn :
      setTimeout;
    this.clearTimeoutFn = typeof options.clearTimeoutFn === LOCAL_STR_FUNCTION ?
      options.clearTimeoutFn :
      clearTimeout;
    this.setIntervalFn = typeof options.setIntervalFn === LOCAL_STR_FUNCTION ?
      options.setIntervalFn :
      setInterval;
    this.clearIntervalFn = typeof options.clearIntervalFn === LOCAL_STR_FUNCTION ?
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
    this.writeDeferredUntilMs = LOCAL_NUM_ZERO;
    this.writeCount = LOCAL_NUM_ZERO;
    this.errorCount = LOCAL_NUM_ZERO;
    this.droppedWrites = LOCAL_NUM_ZERO;
    this.selfLoopPreventedWrites = LOCAL_NUM_ZERO;
    this.consecutiveDeferredWriteFailures = LOCAL_NUM_ZERO;
    this.pendingWriteGrowthCount = LOCAL_NUM_ZERO;
    this.retainedBacklogGrowthCount = LOCAL_NUM_ZERO;

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
    instance.writeDeferredUntilMs = LOCAL_NUM_ZERO;
    instance.initialized = false;
    instance.isShuttingDown = false;
    instance.consecutiveDeferredWriteFailures = LOCAL_NUM_ZERO;
    instance.pendingWriteGrowthCount = LOCAL_NUM_ZERO;
    instance.retainedBacklogGrowthCount = LOCAL_NUM_ZERO;
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
    if (Object.prototype.hasOwnProperty.call(options, LOCAL_STR_MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.prototype.hasOwnProperty.call(options, LOCAL_STR_PRESSUREGOVERNOR)) {
      this.pressureGovernor = options.pressureGovernor || null;
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
      this.selfLoopPreventedWrites += LOCAL_NUM_ONE;
      return;
    }

    this.applySharedPressureDeferWindow();

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
    this.incrementBoundedCounter(LOCAL_STR_LSYAT);

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
      return LOCAL_NUM_ZERO;
    }

    const scheduleThroughWorkClass = options.scheduleThroughWorkClass !== false;
    if (scheduleThroughWorkClass &&
      this.workClassScheduler &&
      !this.isShuttingDown) {
      if (this.flushWorkScheduled) {
        return LOCAL_NUM_ZERO;
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
          return LOCAL_NUM_ZERO;
        }
        throw error;
      } finally {
        this.flushWorkScheduled = false;
      }
    }

    if (this.isWriting || this.pendingWrites.length === LOCAL_NUM_ZERO) {
      return LOCAL_NUM_ZERO;
    }

    const maxEntries = Number.isFinite(options.maxEntries) &&
      options.maxEntries > 0 ?
      Math.floor(options.maxEntries) :
      this.pendingWrites.length;
    const yieldPending = options.yieldPending === true;

    this.isWriting = true;
    const entriesToWrite = this.pendingWrites.splice(0, maxEntries);

    let writtenCount = LOCAL_NUM_ZERO;

    try {
      for (let index = LOCAL_NUM_ZERO; index < entriesToWrite.length; index += LOCAL_NUM_ONE) {
        const entry = entriesToWrite[index];
        try {
          const success = await this.writeEntryWithRetry(entry);
          if (success) {
            this.consecutiveDeferredWriteFailures = LOCAL_NUM_ZERO;
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

      if (writtenCount > LOCAL_NUM_ZERO) {
        this.emit(LOGS_TABLE_EVENT.FLUSHED, {count: writtenCount});
      }
    } finally {
      this.isWriting = false;
      if (yieldPending &&
          this.pendingWrites.length > LOCAL_NUM_ZERO &&
          !this.isWriteDeferred()) {
        this.scheduleContinuationFlush();
      }
    }

    return writtenCount;
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
        workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.LOGS_TABLE_BACKGROUND_WRITE,
        deliveryPriority: LOCAL_STR_BACKGROUND,
        allowPressureDefer: true,
        pressureRetryAfterMs: this.retryDelayMs,
      });
      return;
    }

    throw createSystemMetadataOwnerRequiredError({
      serviceName: LOGS_TABLE_OWNER,
      ownerName: LOCAL_STR_LOGSOWNER,
      tableName: LOCAL_STR_LOGS,
      operation: LOCAL_STR_WRITE,
      message: LOGGING_ERROR_MSG.OWNER_REQUIRED,
    });
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
      retainedPressureBacklogCap: this.getRetainedPressureBacklogCap(),
      pressureHighWatermark: this.pressureHighWatermark,
      pressureRetainedPendingWrites: this.pressureRetainedPendingWrites,
      droppedWrites: this.droppedWrites,
      selfLoopPreventedWrites: this.selfLoopPreventedWrites,
      flushWorkScheduled: this.flushWorkScheduled,
      workClassSchedulerEnabled: Boolean(this.workClassScheduler),
      consecutiveDeferredWriteFailures: this.consecutiveDeferredWriteFailures,
      pendingWriteGrowthCount: this.pendingWriteGrowthCount,
      retainedBacklogGrowthCount: this.retainedBacklogGrowthCount,
      sharedPressureBackpressured: this.isSharedPressureBackpressured(),
      transportPressureBackpressured: this.isSharedPressureBackpressured(
        LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS,
      ),
      queryPressureBackpressured: this.isSharedPressureBackpressured(
        LOGS_TABLE_CONTROL_PLANE_QUERY_PRESSURE_RESOURCE_KEYS,
      ),
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
    this.isShuttingDown = true;
    this.stopFlushTimer();

    // Final drain. Avoid busy-spinning while an in-flight write is active.
    // Use direct flush mode so shutdown does not depend on class-C scheduling.
    while (this.pendingWrites.length > LOCAL_NUM_ZERO || this.isWriting) {
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
}

for (const [methodName, method] of Object.entries({
  scheduleContinuationFlush,
  writeEntryWithRetry,
  isWriteDeferred,
  getRemainingWriteDeferMs,
  shouldDeferWriteError,
  resolveWriteDeferMs,
  deferPendingWrites,
  startFlushTimer,
  stopFlushTimer,
  getPressureGovernor,
  applySharedPressureDeferWindow,
  isSharedPressureBackpressured,
  isMetricsLogEntry,
  getLogPriority,
  isPressureModeActive,
  getRetainedPressureBacklogCap,
  shouldApplyRetainedBacklogCap,
  buildPressureFingerprint,
  resolveTransientPressureFamily,
  hasPendingPressureEquivalentEntry,
  shouldDropEntryUnderPressure,
  isLoggingPipelineMetricsEntry,
  dropPendingMetricsLogEntry,
  dropPendingQueuedEntryForAdmission,
  trimPendingWritesUnderPressure,
  findPendingTrimDropIndex,
  recordDroppedWrite,
  incrementBoundedCounter,
  sleep,
})) {
  Object.defineProperty(LogsTableService.prototype, methodName, {
    value: method,
    writable: true,
    configurable: true,
  });
}

export {LogsTableService, LOGS_TABLE_DEFAULT};
