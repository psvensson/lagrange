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
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
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

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_PRESSUREGOVERNOR = 'pressureGovernor';
const LOCAL_STR_LSYAT = 'pendingWriteGrowthCount';
const LOCAL_STR_BACKGROUND = 'background';
const LOCAL_STR_LOGSOWNER = 'logsOwner';
const LOCAL_STR_LOGS = 'logs';
const LOCAL_STR_WRITE = 'write';
const LOCAL_STR_12XVB = 'CONTROL_PLANE_PRESSURE_DEGRADED';
const LOCAL_STR_OV8OK = 'Distributed operation failed due to participant failures';
const LOCAL_STR_CONNECTION_TO_NODE = 'Connection to node';
const LOCAL_STR_CLOSED = 'closed';
const LOCAL_STR_10U11 = 'No connection to node';
const LOCAL_STR_MESSAGE_TIMEOUT = 'Message timeout';
const LOCAL_STR_1Y4H5 = 'Query routing failed';
const LOCAL_STR_10811 = 'Failed to forward write to leader';
const LOCAL_STR_10NUJ = 'control-plane:write';
const LOCAL_STR_1KX9P = 'control-plane:read';
const LOCAL_STR_121M5 = 'control-plane:table:logs';
const LOCAL_STR_1SYL3 = 'transport:logs-writer';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_INFO = 'INFO';
const LOCAL_STR_PIPE = '|';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_1M0NB = 'retainedBacklogGrowthCount';

const LOGGING_METRIC_PREFIX = 'metrics.logging.';
const LOGS_TABLE_METRIC_PREFIX = 'metrics.logs_table.';
const LOG_RETENTION_METRIC_PREFIX = 'metrics.log_retention.';
const LOG_QUERY_METRIC_PREFIX = 'metrics.log_query.';
const LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS = Object.freeze([
  LOCAL_STR_1SYL3,
]);
const LOGS_TABLE_CONTROL_PLANE_WRITE_PRESSURE_RESOURCE_KEYS = Object.freeze([
  LOCAL_STR_10NUJ,
  LOCAL_STR_121M5,
]);
const LOGS_TABLE_CONTROL_PLANE_QUERY_PRESSURE_RESOURCE_KEYS = Object.freeze([
  LOCAL_STR_1KX9P,
  LOCAL_STR_121M5,
]);
const LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS = Object.freeze([
  ...LOGS_TABLE_CONTROL_PLANE_WRITE_PRESSURE_RESOURCE_KEYS,
  ...LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS,
]);

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
const LOG_PRESSURE_FAMILY = Object.freeze({
  CONNECTION_CLOSED: 'connection_closed',
  NO_CONNECTION: 'no_connection',
  MESSAGE_TIMEOUT: 'message_timeout',
  QUERY_ROUTING_FAILED: 'query_routing_failed',
  PARTICIPANT_FAILURE: 'participant_failure',
  FORWARD_WRITE_FAILED: 'forward_write_failed',
});
const LOG_PRESSURE_MESSAGE_FRAGMENT = Object.freeze({
  CONNECTION_CLOSED: 'Connection to node',
  NO_CONNECTION: 'No connection to node',
  MESSAGE_TIMEOUT: 'Message timeout',
  QUERY_ROUTING_FAILED: 'Query routing failed',
  PARALLEL_QUERY_EXECUTION_FAILED: 'Parallel query execution failed',
  QUERY_EXECUTION_FAILED: 'Query execution failed',
  PARTITION_ROUTING_CANDIDATES_FILTERED_BY_READINESS:
    'Partition routing candidates filtered by readiness',
  PARTICIPANT_FAILURE:
    'Distributed operation failed due to participant failures',
  TRANSIENT_CDC_SQL_ERROR: 'Transient CDC SQL error',
  TRANSIENT_CDC_SQL_EXCEPTION: 'Transient CDC SQL exception',
  FAILED_TO_UPDATE_SYSTEM_TABLE_ROW: 'Failed to update system table row',
  FAILED_TO_QUERY_OPERATIONS_FROM_SYSTEM_TABLE:
    'Failed to query operations from system table',
  DEFERRED_RETRYABLE_REPLICA_OPERATION_TRANSITION_FAILURE:
    'Deferred retryable replica operation transition failure',
  FAILED_TO_RECONNECT_TARGET_NODE_BEFORE_DELIVERY:
    'Failed to reconnect target node before delivery',
  RECONNECTION_FAILED: 'Reconnection failed',
  WEBSOCKET_ERROR: 'WebSocket error',
  FORWARD_WRITE_FAILED: 'Failed to forward write to leader',
});

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

    for (let attempt = LOCAL_NUM_ZERO; attempt < this.maxRetries; attempt++) {
      try {
        await this.writeEntryToTable(entry);
        return true;
      } catch (error) {
        lastError = error;
        if (this.shouldDeferWriteError(error)) {
          throw error;
        }
        if (attempt < this.maxRetries - LOCAL_NUM_ONE) {
          await this.sleep(this.retryDelayMs * (attempt + LOCAL_NUM_ONE));
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
   * Check whether logs-table writes are currently in a defer window.
   * @return {boolean}
   * @private
   */
  isWriteDeferred() {
    if (!Number.isFinite(this.writeDeferredUntilMs) ||
        this.writeDeferredUntilMs <= LOCAL_NUM_ZERO) {
      return false;
    }
    if (this.now() >= this.writeDeferredUntilMs) {
      this.writeDeferredUntilMs = LOCAL_NUM_ZERO;
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
      return LOCAL_NUM_ZERO;
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
        error?.code === LOCAL_STR_12XVB) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > LOCAL_NUM_ZERO) {
      return true;
    }
    const message = error?.message || String(error);
    return message.includes(LOCAL_STR_OV8OK) ||
      message.includes(LOCAL_STR_CONNECTION_TO_NODE) &&
      message.includes(LOCAL_STR_CLOSED) ||
      message.includes(LOCAL_STR_10U11) ||
      message.includes(LOCAL_STR_MESSAGE_TIMEOUT) ||
      message.includes(LOCAL_STR_1Y4H5) ||
      message.includes(LOCAL_STR_10811);
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
    const requeuedEntries = Array.isArray(entries) ? entries.length : 0;
    if (Array.isArray(entries) && entries.length > LOCAL_NUM_ZERO) {
      this.pendingWrites = entries.concat(this.pendingWrites);
    }
    this.consecutiveDeferredWriteFailures += LOCAL_NUM_ONE;
    const droppedEntries = this.trimPendingWritesUnderPressure();
    const retryAfterMs = this.resolveWriteDeferMs(error);
    const desiredUntilMs = this.now() + retryAfterMs;
    this.writeDeferredUntilMs = Math.max(
      this.writeDeferredUntilMs || LOCAL_NUM_ZERO,
      desiredUntilMs,
    );
    this.scheduleContinuationFlush(retryAfterMs);
    console.warn(
      LOGGING_LOG_MSG.logsWriteDeferred(
        retryAfterMs,
        this.pendingWrites.length,
      ),
      {
        error: error?.message || String(error),
        retryAfterMs,
        pendingWrites: this.pendingWrites.length,
        retainedPressureBacklogCap: this.getRetainedPressureBacklogCap(),
        maxPendingWrites: this.maxPendingWrites,
        isWriting: false,
        requeuedEntries,
        droppedEntries,
      },
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
   * Return the shared pressure governor for background log persistence.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure?.({
        messageRouter: this.messageRouter || null,
        logger: this.logger,
      });
      return this.pressureGovernor;
    }

    const config = ConfigurationManager.getInstance();
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      messageRouter: this.messageRouter || null,
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  /**
   * Evaluate the shared pressure policy for one background log write and arm a
   * bounded defer window when transport is already hot.
   * @private
   */
  applySharedPressureDeferWindow() {
    const decision = this.getPressureGovernor().evaluate({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        'control-plane:write',
        'control-plane:table:logs',
        'transport:logs-writer',
      ],
      allowDegrade: true,
      allowDefer: true,
      retryAfterMs: this.retryDelayMs,
    });
    if (decision?.action !== PRESSURE_GOVERNOR_ACTION.DEFER &&
        decision?.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE) {
      return;
    }
    const retryAfterMs = Number.isFinite(decision?.retryAfterMs) &&
      decision.retryAfterMs > 0 ?
      Math.floor(decision.retryAfterMs) :
      Math.max(MIN_SLEEP_MS, this.retryDelayMs);
    this.writeDeferredUntilMs = Math.max(
      this.writeDeferredUntilMs || LOCAL_NUM_ZERO,
      this.now() + retryAfterMs,
    );
    this.trimPendingWritesUnderPressure();
    this.scheduleContinuationFlush(retryAfterMs);
  }

  /**
   * Whether the shared pressure policy currently sees transport backpressure.
   * @return {boolean}
   * @private
   */
  isSharedPressureBackpressured(resourceKeys = null) {
    const pressureResourceKeys =
      Array.isArray(resourceKeys) && resourceKeys.length > LOCAL_NUM_ZERO ?
        resourceKeys :
        LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS;
    return this.getPressureGovernor().isBackpressured({
      resourceKeys: pressureResourceKeys,
    });
  }

  /**
   * Check whether an entry is metrics namespace log.
   * @param {Object} entry - Log entry.
   * @return {boolean}
   * @private
   */
  isMetricsLogEntry(entry) {
    return typeof entry?.message === LOCAL_STR_STRING &&
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
    const metadata = entry?.metadata &&
      typeof entry.metadata === 'object' ?
      entry.metadata :
      {};
    const subsystem = typeof metadata.subsystem === 'string' ?
      metadata.subsystem :
      '';
    const partitionId = typeof metadata.partitionId === 'string' ?
      metadata.partitionId :
      '';
    const tableName = typeof metadata.tableName === 'string' ?
      metadata.tableName :
      '';
    const transientFamily = this.resolveTransientPressureFamily(
      message,
      partitionId || tableName || '',
    );
    const fingerprintNodeId = transientFamily ? '' : (entry?.nodeId || '');
    return [
      String(entry?.level || LOCAL_STR_INFO).toUpperCase(),
      fingerprintNodeId,
      subsystem,
      transientFamily || message,
    ].join(LOCAL_STR_PIPE);
  }

  /**
   * Collapse repeated transport/control-plane outage noise to a stable family
   * so pressure mode keeps one exemplar per affected subsystem/resource.
   * @param {string} message
   * @param {string} resourceId
   * @return {string|null}
   * @private
   */
  resolveTransientPressureFamily(message, resourceId = LOCAL_STR_EMPTY) {
    if (typeof message !== LOCAL_STR_STRING || message.length === LOCAL_NUM_ZERO) {
      return null;
    }
    const normalizedResourceId = typeof resourceId === 'string' ?
      resourceId.trim() :
      '';
    const suffix = normalizedResourceId || 'shared';
    if (
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.PARTICIPANT_FAILURE) ||
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.TRANSIENT_CDC_SQL_ERROR) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT.TRANSIENT_CDC_SQL_EXCEPTION,
      ) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT.FAILED_TO_UPDATE_SYSTEM_TABLE_ROW,
      ) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT
          .DEFERRED_RETRYABLE_REPLICA_OPERATION_TRANSITION_FAILURE,
      )
    ) {
      return `${LOG_PRESSURE_FAMILY.PARTICIPANT_FAILURE}:${suffix}`;
    }
    if (
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.CONNECTION_CLOSED) &&
      message.includes(LOCAL_STR_CLOSED)
    ) {
      return `${LOG_PRESSURE_FAMILY.CONNECTION_CLOSED}:${suffix}`;
    }
    if (
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.NO_CONNECTION) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT
          .FAILED_TO_RECONNECT_TARGET_NODE_BEFORE_DELIVERY,
      ) ||
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.RECONNECTION_FAILED) ||
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.WEBSOCKET_ERROR)
    ) {
      return `${LOG_PRESSURE_FAMILY.NO_CONNECTION}:${suffix}`;
    }
    if (message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.MESSAGE_TIMEOUT)) {
      return `${LOG_PRESSURE_FAMILY.MESSAGE_TIMEOUT}:${suffix}`;
    }
    if (
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.QUERY_ROUTING_FAILED) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT.PARALLEL_QUERY_EXECUTION_FAILED,
      ) ||
      message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.QUERY_EXECUTION_FAILED) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT
          .PARTITION_ROUTING_CANDIDATES_FILTERED_BY_READINESS,
      ) ||
      message.includes(
        LOG_PRESSURE_MESSAGE_FRAGMENT
          .FAILED_TO_QUERY_OPERATIONS_FROM_SYSTEM_TABLE,
      )
    ) {
      return `${LOG_PRESSURE_FAMILY.QUERY_ROUTING_FAILED}:${suffix}`;
    }
    if (message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.FORWARD_WRITE_FAILED)) {
      return `${LOG_PRESSURE_FAMILY.FORWARD_WRITE_FAILED}:${suffix}`;
    }
    return null;
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
    for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index++) {
      const entry = this.pendingWrites[index];
      if (!this.isMetricsLogEntry(entry)) {
        continue;
      }
      this.pendingWrites.splice(index, LOCAL_NUM_ONE);
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
    for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index++) {
      const pendingEntry = this.pendingWrites[index];
      if (this.getLogPriority(pendingEntry) >= incomingPriority) {
        continue;
      }
      this.pendingWrites.splice(index, LOCAL_NUM_ONE);
      this.recordDroppedWrite();
      return true;
    }

    const incomingFingerprint = this.buildPressureFingerprint(incomingEntry);
    if (!incomingFingerprint) {
      return false;
    }
    for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index++) {
      const pendingEntry = this.pendingWrites[index];
      if (this.buildPressureFingerprint(pendingEntry) !== incomingFingerprint) {
        continue;
      }
      this.pendingWrites.splice(index, LOCAL_NUM_ONE);
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
    let droppedCount = LOCAL_NUM_ZERO;
    while (this.pendingWrites.length > retainedCap) {
      const dropIndex = this.findPendingTrimDropIndex();
      if (dropIndex < LOCAL_NUM_ZERO) {
        break;
      }
      this.pendingWrites.splice(dropIndex, LOCAL_NUM_ONE);
      this.recordDroppedWrite();
      droppedCount += LOCAL_NUM_ONE;
    }
    if (droppedCount > LOCAL_NUM_ZERO) {
      this.incrementBoundedCounter(
        LOCAL_STR_1M0NB,
        droppedCount,
      );
    }
    return droppedCount;
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
    let lowestPriorityIndex = -LOCAL_NUM_ONE;
    let lowestPriority = Number.POSITIVE_INFINITY;

    for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index += LOCAL_NUM_ONE) {
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
    this.droppedWrites += LOCAL_NUM_ONE;
    if (this.droppedWrites === LOCAL_NUM_ONE ||
      this.droppedWrites % LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL === LOCAL_NUM_ZERO) {
      this.logger.warn(
        LOGGING_LOG_MSG.logsDroppedByBackpressure(
          this.droppedWrites,
          this.maxPendingWrites,
        ),
      );
    }
  }

  /**
   * Increment a bounded diagnostic counter.
   * @param {string} fieldName
   * @param {number} [delta=1]
   * @private
   */
  incrementBoundedCounter(fieldName, delta = LOCAL_NUM_ONE) {
    if (typeof fieldName !== LOCAL_STR_STRING || fieldName.length === LOCAL_NUM_ZERO) {
      return;
    }
    if (!Number.isFinite(delta) || delta <= LOCAL_NUM_ZERO) {
      return;
    }
    const currentValue = Number.isFinite(this[fieldName]) ?
      this[fieldName] :
      0;
    this[fieldName] = Math.min(
      Number.MAX_SAFE_INTEGER,
      currentValue + Math.max(MIN_CHUNK_SIZE, Math.floor(delta)),
    );
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
